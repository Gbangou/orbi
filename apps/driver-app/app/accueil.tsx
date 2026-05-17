import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  driverOffers,
  fetchDriverEarnings,
  fetchDriverOffers,
  fetchDriverProfile,
  fetchMyTrips,
  type DriverFatigueStatus,
  type DriverEarningsResponse,
  type DriverOffer,
  type MyTripsResponse,
  updateDriverAvailabilityWithApi,
} from '@orbi/api';
import {
  describeRealtimeEvent,
  describeRealtimeConnection,
  formatRealtimeBadgeLabel,
  formatOperationalStatus,
  orbiCopy,
  orbiTheme,
} from '@orbi/ui';
import {
  DashboardMetricCard,
  LiveHeroCard,
  MetricTile,
  QuickActionCard,
  RouteSignalCard,
} from '../lib/realtime-widgets';
import { DriverJourneySection } from '../lib/driver-journey';
import { restoreDriverSession } from '../lib/auth';
import { formatDriverEarningsAmount } from '../lib/driver-earnings-signal';
import { resolveDriverAppError } from '../lib/session-feedback';
import {
  formatReservationCountdown,
  useReservationExpiryRefresh,
  useReservationClock,
} from '../lib/offer-reservation';
import {
  buildDriverFlowTransitionLabel,
  buildDriverHomeStatusLabel,
  resolveDriverActiveFlow,
  resolveDriverReservationChangeSet,
} from '../lib/driver-active-flow';
import {
  buildDriverOfferDetailLines,
  formatDriverOfferFare,
  buildDriverOfferInsights,
  buildDriverOfferNote,
} from '../lib/offer-signal';
import { useDriverPresence } from '../lib/use-driver-presence';
import { useDriverRealtimeStream } from '../lib/use-driver-realtime-stream';
import { useLiveRefresh } from '../lib/use-live-refresh';
import { buildDriverShiftReadiness } from '../lib/driver-shift-readiness';

const fallbackFatigue: DriverFatigueStatus = {
  state: 'clear',
  completedTrips: 0,
  drivingMinutes: 0,
  windowHours: 8,
  maxCompletedTrips: 8,
  maxDrivingMinutes: 300,
  restMinutes: 30,
  restUntil: null,
  reason: 'Aucun signal fatigue bloquant sur la fenetre recente.',
};

function buildInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('') || 'OR';
}

function OfferMissionPreview({ offer }: { offer: DriverOffer }) {
  const isMoto = offer.category === 'motorcycle';
  const accent = isMoto ? orbiTheme.colors.teal : orbiTheme.colors.amber;

  return (
    <View style={styles.offerMission}>
      <View style={styles.offerMissionTop}>
        <View style={[styles.offerAvatar, { borderColor: accent }]}>
          <Text style={[styles.offerAvatarText, { color: accent }]}>
            {buildInitials(offer.riderName)}
          </Text>
        </View>
        <View style={styles.offerRoutePreview}>
          <View style={[styles.offerRouteDot, { backgroundColor: orbiTheme.colors.sky }]} />
          <View style={styles.offerRouteLine} />
          <View style={[styles.offerRouteDot, { backgroundColor: orbiTheme.colors.amber }]} />
        </View>
        <View style={styles.offerVehicleBadge}>
          <View
            style={[
              styles.offerVehicleBody,
              isMoto ? styles.offerMotoBody : styles.offerCarBody,
              { backgroundColor: accent },
            ]}
          />
          <View style={styles.offerVehicleWheelRow}>
            <View style={[styles.offerVehicleWheel, { borderColor: accent }]} />
            <View style={[styles.offerVehicleWheel, { borderColor: accent }]} />
          </View>
        </View>
      </View>
      <View style={styles.offerMissionMetrics}>
        <MetricTile
          label="Approche"
          value={
            typeof offer.pickupDistanceKm === 'number'
              ? `${offer.pickupDistanceKm.toFixed(1)} km`
              : `${offer.etaToPickupMinutes} min`
          }
          helper="Vers pickup"
        />
        <MetricTile
          label="Trajet"
          value={`${offer.distanceKm.toFixed(1)} km`}
          helper={isMoto ? 'Mission moto' : 'Mission voiture'}
        />
        <MetricTile
          label="Net"
          value={formatDriverEarningsAmount(offer.driverPayout ?? offer.fare)}
          helper="Gain chauffeur"
        />
      </View>
    </View>
  );
}

export default function DriverHomeScreen() {
  const router = useRouter();
  const [offers, setOffers] = useState<DriverOffer[]>(driverOffers);
  const [history, setHistory] = useState<MyTripsResponse | null>(null);
  const [earnings, setEarnings] = useState<DriverEarningsResponse | null>(null);
  const [statusNote, setStatusNote] = useState('Connexion du compte chauffeur de demonstration...');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isRealtimeSyncing, setIsRealtimeSyncing] = useState(false);
  const [freshOfferIds, setFreshOfferIds] = useState<string[]>([]);
  const [recentlyExpiredCount, setRecentlyExpiredCount] = useState(0);
  const [activeTripTransitionLabel, setActiveTripTransitionLabel] = useState<string | null>(null);
  const [driverProfileStatus, setDriverProfileStatus] = useState<string>('OFFLINE');
  const [driverFatigue, setDriverFatigue] = useState<DriverFatigueStatus>(fallbackFatigue);
  const [isTogglingAvailability, setIsTogglingAvailability] = useState(false);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const previousVisibleOfferIdsRef = useRef<string[] | null>(null);
  const previousFlowStateRef = useRef<string | null>(null);

  const loadDriverHome = useCallback(async (silent = false) => {
    if (!silent) {
      setIsRefreshing(true);
    }

    try {
      const { authClient, me, session } = await restoreDriverSession();
      setSessionToken(session.sessionToken);
      const [offersResponse, historyResponse, earningsResponse, profileResponse] = await Promise.all([
        fetchDriverOffers(authClient),
        fetchMyTrips(authClient),
        fetchDriverEarnings(authClient),
        fetchDriverProfile(authClient),
      ]);
      setOffers(offersResponse);
      setHistory(historyResponse);
      setEarnings(earningsResponse);
      setDriverProfileStatus(profileResponse.profile.status);
      setDriverFatigue(profileResponse.profile.fatigue);
      const flow = resolveDriverActiveFlow({
        history: historyResponse,
        offers: offersResponse,
        reservationNow: Date.now(),
        driverProfileStatus: profileResponse.profile.status,
      });
      if (!silent) {
        setStatusNote(buildDriverHomeStatusLabel({ flow, fullName: me.user.fullName }));
      }
    } catch (error) {
      const feedback = await resolveDriverAppError(error, {
        surface: 'profile',
        network: 'Preview locale active en attendant la connexion API.',
      });

      if (feedback.shouldClearSessionToken) {
        setSessionToken(null);
      }

      if (!silent) {
        setStatusNote(feedback.message);
      }
    } finally {
      if (silent) {
        setIsRealtimeSyncing(false);
      }
      if (!silent) {
        setIsRefreshing(false);
      }
    }
  }, []);

  useLiveRefresh(() => loadDriverHome(true), 25000);
  useDriverRealtimeStream(
    sessionToken,
    (eventType) => {
      setIsRealtimeSyncing(true);
      setStatusNote(describeRealtimeEvent('driver', eventType));
      void loadDriverHome(true);
    },
    {
      onHeartbeat: () => {
        setStatusNote(describeRealtimeConnection('driver', 'active'));
      },
      onOpen: () => {
        setIsRealtimeSyncing(false);
        setStatusNote(describeRealtimeConnection('driver', 'connected'));
      },
      onError: () => {
        setIsRealtimeSyncing(false);
        setStatusNote(describeRealtimeConnection('driver', 'reconnecting'));
      },
    },
  );

  const reservationNow = useReservationClock();
  const flow = resolveDriverActiveFlow({
    history,
    offers,
    reservationNow,
    driverProfileStatus,
  });
  const { activeTrip, activeFlowState, visibleOffers } = flow;
  const shiftReadiness = buildDriverShiftReadiness({
    flow,
    fatigue: driverFatigue,
    earningsToday: earnings?.summary.today,
  });
  const { presenceNote } = useDriverPresence(
    flow.availabilityStatus === 'ONLINE' || Boolean(activeTrip),
  );
  useReservationExpiryRefresh(
    visibleOffers,
    () => loadDriverHome(true),
    flow.canReceiveOffers,
  );

  useEffect(() => {
    const previousVisibleOfferIds = previousVisibleOfferIdsRef.current;
    const nextVisibleOfferIds = visibleOffers.map((offer) => offer.id);

    if (previousVisibleOfferIds && flow.canReceiveOffers) {
      const { freshOfferIds: nextFreshOfferIds, expiredOfferIds } =
        resolveDriverReservationChangeSet(previousVisibleOfferIds, nextVisibleOfferIds);

      if (nextFreshOfferIds.length > 0) {
        setFreshOfferIds(nextFreshOfferIds);
      }

      if (expiredOfferIds.length > 0) {
        setRecentlyExpiredCount(expiredOfferIds.length);
      }
    }

    previousVisibleOfferIdsRef.current = nextVisibleOfferIds;
  }, [flow.canReceiveOffers, visibleOffers]);

  useEffect(() => {
    if (!freshOfferIds.length) {
      return;
    }

    const timeout = setTimeout(() => {
      setFreshOfferIds([]);
    }, 5000);

    return () => clearTimeout(timeout);
  }, [freshOfferIds]);

  useEffect(() => {
    if (!recentlyExpiredCount) {
      return;
    }

    const timeout = setTimeout(() => {
      setRecentlyExpiredCount(0);
    }, 5000);

    return () => clearTimeout(timeout);
  }, [recentlyExpiredCount]);

  useEffect(() => {
    const previousFlowState = previousFlowStateRef.current;
    setActiveTripTransitionLabel(
      buildDriverFlowTransitionLabel(previousFlowState, activeFlowState, 'home'),
    );

    previousFlowStateRef.current = activeFlowState;
  }, [activeFlowState]);

  useEffect(() => {
    if (!activeTripTransitionLabel) {
      return;
    }

    const timeout = setTimeout(() => {
      setActiveTripTransitionLabel(null);
    }, 5000);

    return () => clearTimeout(timeout);
  }, [activeTripTransitionLabel]);

  async function handleToggleAvailability() {
    setIsTogglingAvailability(true);
    const nextStatus = flow.availabilityStatus === 'ONLINE' ? 'OFFLINE' : 'ONLINE';
    setStatusNote(
      nextStatus === 'ONLINE'
        ? 'Passage en ligne du compte chauffeur...'
        : 'Passage hors ligne du compte chauffeur...',
    );

    try {
      const { authClient } = await restoreDriverSession();
      const response = await updateDriverAvailabilityWithApi(
        authClient,
        nextStatus,
      );
      setDriverProfileStatus(response.availability.status);
      setStatusNote(
        response.availability.status === 'ONLINE'
          ? 'Vous etes maintenant visible pour les nouvelles demandes.'
          : 'Vous etes hors ligne et ne recevrez plus de nouvelles offres.',
      );
      await loadDriverHome(true);
    } catch (error) {
      const feedback = await resolveDriverAppError(error, {
        surface: 'driver-availability',
        fallback: "Le changement de disponibilite n'a pas pu etre applique.",
      });

      if (feedback.shouldClearSessionToken) {
        setSessionToken(null);
      }

      setStatusNote(feedback.message);
    } finally {
      setIsTogglingAvailability(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <Text style={styles.eyebrow}>Orbi Chauffeur</Text>
      <Text style={styles.title}>{orbiCopy.driverHeadline}</Text>
      <Text style={styles.body}>
        Une application pensee pour les conducteurs au Burkina Faso, sur Android, iPhone et web.
      </Text>

      <LiveHeroCard
        eyebrow="Statut"
        isHighlighted={Boolean(freshOfferIds.length || activeTripTransitionLabel)}
        liveLabel={formatRealtimeBadgeLabel('Temps reel', isRealtimeSyncing)}
        liveTone={isRealtimeSyncing ? 'sky' : 'teal'}
        message={statusNote}
        syncMessage={
          isRealtimeSyncing
            ? 'Synchronisation silencieuse en cours apres evenement live.'
            : null
        }
        title={flow.heroTitle}
        transitionMessage={
          freshOfferIds.length
            ? freshOfferIds.length > 1
              ? `${freshOfferIds.length} offres fraiches viennent d etre resynchronisees.`
              : 'Une nouvelle offre vient d etre resynchronisee.'
            : activeTripTransitionLabel
        }
      >
        {recentlyExpiredCount ? (
          <Text style={styles.transitionMetaMuted}>
            {recentlyExpiredCount > 1
              ? `${recentlyExpiredCount} reservations ont disparu apres expiration.`
              : 'Une reservation a disparu apres expiration.'
            }
          </Text>
        ) : null}
        <Text style={styles.meta}>{presenceNote}</Text>
        <View style={styles.signalGrid}>
          <MetricTile
            label="Mission"
            value={flow.primaryStatusLabel}
          />
          <MetricTile
            label="Reservations"
            value={String(flow.visibleOfferCount)}
          />
          <MetricTile
            label="Profil"
            value={formatOperationalStatus(driverProfileStatus)}
          />
          <MetricTile
            label="Cap aujourd hui"
            value={formatDriverEarningsAmount(earnings?.summary.today ?? 0)}
          />
        </View>
        {flow.operationalStatus === 'SUSPENDED' ? (
          <Text style={styles.meta}>
            Le profil est suspendu. Le support operations doit reautoriser le compte avant toute reprise.
          </Text>
        ) : driverProfileStatus === 'BUSY' ? (
          <Text style={styles.meta}>Le backend vous maintient occupe pendant la course en cours.</Text>
        ) : null}
        <Pressable
          onPress={() => void handleToggleAvailability()}
          disabled={isRefreshing || isTogglingAvailability || flow.availabilityLocked}
          style={[
            styles.availabilityButton,
            flow.availabilityStatus === 'ONLINE'
              ? styles.availabilityButtonOffline
              : styles.availabilityButtonOnline,
            isRefreshing || isTogglingAvailability || flow.availabilityLocked
              ? styles.inlineButtonDisabled
              : null,
          ]}
        >
          <Text
            style={[
              styles.availabilityButtonLabel,
              flow.availabilityStatus === 'ONLINE'
                ? styles.availabilityButtonLabelOffline
                : styles.availabilityButtonLabelOnline,
            ]}
          >
            {isTogglingAvailability
              ? 'Mise a jour...'
              : activeTrip
                ? 'Statut verrouille pendant la course'
                : flow.operationalStatus === 'SUSPENDED'
                  ? 'Suspension geree par les operations'
                  : flow.availabilityStatus === 'ONLINE'
                  ? 'Passer hors ligne'
                  : 'Passer en ligne'}
          </Text>
        </Pressable>
        <Pressable
          onPress={() => void loadDriverHome()}
          disabled={isRefreshing || isTogglingAvailability}
          style={[styles.inlineButton, isRefreshing ? styles.inlineButtonDisabled : null]}
        >
          <Text style={styles.inlineButtonLabel}>
            {isRefreshing ? 'Actualisation...' : 'Actualiser le direct'}
          </Text>
        </Pressable>
      </LiveHeroCard>

      <RouteSignalCard
        eyebrow={shiftReadiness.eyebrow}
        badgeLabel={shiftReadiness.scoreLabel}
        badgeTone={shiftReadiness.tone}
        title={shiftReadiness.title}
        description={shiftReadiness.description}
        insights={shiftReadiness.insights}
        note={shiftReadiness.note}
        noteTone={shiftReadiness.noteTone}
      />

      <View style={styles.metricsGrid}>
        <DashboardMetricCard
          label="Aujourd hui"
          value={formatDriverEarningsAmount(earnings?.summary.today ?? 0)}
          helper="Revenus du jour"
          tone="amber"
        />
        <DashboardMetricCard
          label="Semaine"
          value={formatDriverEarningsAmount(earnings?.summary.week ?? 0)}
          helper={`${earnings?.summary.completedTrips ?? 0} courses completees`}
          tone="sky"
        />
      </View>

      <DriverJourneySection
        currentStep="accueil"
        description="Depuis le cockpit chauffeur, vous pouvez enchainer dispatch, revenus et dossier ops avec les memes reperes produit."
      />

      {activeTrip ? (
        <View
          style={[
            styles.activeTripCard,
            activeTripTransitionLabel ? styles.activeTripCardHighlight : null,
          ]}
        >
          <Text style={styles.activeTripEyebrow}>Course active</Text>
          <Text style={styles.activeTripTitle}>{flow.primaryRouteLabel}</Text>
          <Text style={styles.meta}>Client: {activeTrip.counterpartyName ?? 'Affecte automatiquement'}</Text>
          <Text style={styles.meta}>Vehicule: {activeTrip.vehicleLabel ?? 'Vehicule actif'}</Text>
          <Text style={styles.activeTripStatus}>Statut {flow.primaryStatusLabel}</Text>
          {activeTripTransitionLabel ? (
            <Text style={styles.transitionMeta}>{activeTripTransitionLabel}</Text>
          ) : null}
          <QuickActionCard
            eyebrow="Direct"
            title="Ouvrir la course en direct"
            description="Retrouver la navigation, le client et le suivi d execution."
            tone="amber"
            emphasis="primary"
            onPress={() => router.push('/offres')}
          />
        </View>
      ) : null}

      <Text style={styles.section}>Offres en attente</Text>
      {flow.operationalStatus === 'SUSPENDED' ? (
        <RouteSignalCard
          eyebrow="Dispatch"
          title="Compte suspendu"
          description="Les reservations sont masquees tant que les operations n ont pas reactive le profil chauffeur."
          insights={[
            { label: 'Profil', value: 'Suspendu', tone: 'rose' },
            { label: 'Flux', value: 'Bloque', tone: 'amber' },
          ]}
          note="Le cockpit reviendra automatiquement au dispatch des que la suspension sera levee."
          noteTone="rose"
        />
      ) : flow.availabilityStatus !== 'ONLINE' ? (
        <RouteSignalCard
          eyebrow="Dispatch"
          title="Aucune offre pendant le mode hors ligne"
          description="Passez en ligne pour recevoir des demandes compatibles avec votre vehicule."
          insights={[
            { label: 'Statut', value: 'Hors ligne', tone: 'amber' },
            { label: 'Flux', value: 'Suspendu', tone: 'rose' },
          ]}
          note="Le cockpit relancera les reservations des que votre disponibilite sera reactivee."
          noteTone="amber"
        />
      ) : null}
      {visibleOffers.map((offer) => {
        const offerNote = buildDriverOfferNote(offer);

        return (
          <RouteSignalCard
            key={offer.id}
            eyebrow={freshOfferIds.includes(offer.id) ? 'Nouvelle offre live' : 'Offre reservee'}
            badgeLabel={
              offer.reservationExpiresAt
                ? `Reservation ${formatReservationCountdown(offer.reservationExpiresAt, reservationNow)}`
                : null
            }
            badgeTone={freshOfferIds.includes(offer.id) ? 'sky' : 'amber'}
            title={offer.riderName}
            titleAside={formatDriverOfferFare(offer)}
            titleAsideColor={orbiTheme.colors.amber}
            description={`${offer.pickup} vers ${offer.destination}`}
            insights={buildDriverOfferInsights(offer)}
            detailLines={buildDriverOfferDetailLines(offer)}
            note={offerNote?.text}
            noteTone={offerNote?.tone ?? 'sky'}
            isHighlighted={freshOfferIds.includes(offer.id)}
          >
            <OfferMissionPreview offer={offer} />
          </RouteSignalCard>
        );
      })}
      {flow.canReceiveOffers && visibleOffers.length === 0 ? (
        <RouteSignalCard
          eyebrow="Dispatch"
          title="Aucune reservation active"
          description="Le dispatch n a pas encore bloque d offre pour vous ou la fenetre d acceptation est terminee."
          insights={[
            { label: 'Statut', value: 'En ligne', tone: 'teal' },
            { label: 'Attente', value: 'Aucune offre', tone: 'sky' },
          ]}
          note="Le flux live reste branche et mettra en avant la prochaine reservation compatible."
          noteTone="sky"
        />
      ) : null}

      <View style={styles.actions}>
        <QuickActionCard
          eyebrow="Finance"
          title="Consulter les revenus"
          description="Suivre les gains du jour, de la semaine et les tendances."
          tone="sky"
          onPress={() => router.push('/revenus')}
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    paddingTop: 88,
    paddingHorizontal: 24,
    paddingBottom: 40,
    backgroundColor: orbiTheme.colors.background,
    gap: 16,
  },
  eyebrow: {
    color: orbiTheme.colors.amber,
    textTransform: 'uppercase',
    letterSpacing: 2,
  },
  title: {
    color: orbiTheme.colors.text,
    fontSize: 38,
    lineHeight: 40,
    fontWeight: '800',
  },
  body: {
    color: orbiTheme.colors.muted,
    lineHeight: 22,
  },
  inlineButton: {
    marginTop: 10,
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: orbiTheme.colors.backgroundAlt,
    borderWidth: 1,
    borderColor: orbiTheme.colors.border,
  },
  signalGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 6,
  },
  inlineButtonDisabled: {
    opacity: 0.65,
  },
  inlineButtonLabel: {
    color: orbiTheme.colors.text,
    fontWeight: '700',
    fontSize: 13,
  },
  metricsGrid: {
    flexDirection: 'row',
    gap: 12,
    flexWrap: 'wrap',
  },
  activeTripCard: {
    backgroundColor: orbiTheme.colors.backgroundAlt,
    borderWidth: 1,
    borderColor: orbiTheme.colors.border,
    borderRadius: 24,
    padding: 20,
    gap: 8,
  },
  activeTripCardHighlight: {
    borderColor: 'rgba(56, 189, 248, 0.42)',
    backgroundColor: 'rgba(56, 189, 248, 0.08)',
  },
  activeTripEyebrow: {
    color: orbiTheme.colors.teal,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    fontSize: 12,
  },
  activeTripTitle: {
    color: orbiTheme.colors.text,
    fontSize: 22,
    fontWeight: '800',
  },
  activeTripStatus: {
    color: orbiTheme.colors.amber,
    fontWeight: '800',
  },
  availabilityButton: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
  },
  availabilityButtonOnline: {
    backgroundColor: 'rgba(45, 212, 191, 0.16)',
    borderColor: orbiTheme.colors.teal,
  },
  availabilityButtonOffline: {
    backgroundColor: 'rgba(245, 158, 11, 0.16)',
    borderColor: orbiTheme.colors.amber,
  },
  availabilityButtonLabel: {
    fontWeight: '700',
    fontSize: 13,
  },
  availabilityButtonLabelOnline: {
    color: orbiTheme.colors.teal,
  },
  availabilityButtonLabelOffline: {
    color: orbiTheme.colors.amber,
  },
  meta: {
    color: orbiTheme.colors.muted,
  },
  syncMeta: {
    color: orbiTheme.colors.sky,
    fontWeight: '700',
  },
  transitionMeta: {
    color: orbiTheme.colors.sky,
    fontWeight: '700',
    lineHeight: 19,
  },
  transitionMetaMuted: {
    color: orbiTheme.colors.rose,
    lineHeight: 19,
  },
  safety: {
    color: orbiTheme.colors.amber,
  },
  section: {
    color: orbiTheme.colors.text,
    fontSize: 20,
    fontWeight: '700',
  },
  offerMission: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: orbiTheme.colors.border,
    backgroundColor: orbiTheme.colors.backgroundAlt,
    padding: 14,
    gap: 12,
  },
  offerMissionTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  offerAvatar: {
    width: 54,
    height: 54,
    borderRadius: 27,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: orbiTheme.colors.panel,
  },
  offerAvatarText: {
    fontSize: 17,
    fontWeight: '900',
  },
  offerRoutePreview: {
    flex: 1,
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  offerRouteDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  offerRouteLine: {
    flex: 1,
    height: 3,
    borderRadius: 999,
    backgroundColor: 'rgba(148, 163, 184, 0.28)',
  },
  offerVehicleBadge: {
    width: 58,
    height: 44,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  offerVehicleBody: {
    borderRadius: 8,
  },
  offerMotoBody: {
    width: 34,
    height: 9,
    transform: [{ rotate: '-8deg' }],
  },
  offerCarBody: {
    width: 44,
    height: 18,
  },
  offerVehicleWheelRow: {
    width: 46,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: -4,
  },
  offerVehicleWheel: {
    width: 13,
    height: 13,
    borderRadius: 7,
    borderWidth: 3,
    backgroundColor: orbiTheme.colors.background,
  },
  offerMissionMetrics: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  actions: {
    gap: 12,
  },
});
