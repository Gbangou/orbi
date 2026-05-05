import { Link } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  driverOffers,
  fetchDriverEarnings,
  fetchDriverOffers,
  fetchDriverProfile,
  fetchMyTrips,
  type DriverEarningsResponse,
  type DriverOffer,
  type MyTripsResponse,
  updateDriverAvailabilityWithApi,
} from '@mobilis/api';
import {
  describeRealtimeEvent,
  describeRealtimeConnection,
  formatRealtimeBadgeLabel,
  formatOperationalStatus,
  formatXof,
  mobilisCopy,
  mobilisTheme,
} from '@mobilis/ui';
import {
  DashboardMetricCard,
  LiveHeroCard,
  MetricTile,
  QuickActionCard,
  RouteSignalCard,
} from '../lib/realtime-widgets';
import { DriverJourneySection } from '../lib/driver-journey';
import { restoreDriverSession } from '../lib/auth';
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
  buildDriverOfferInsights,
  buildDriverOfferNote,
} from '../lib/offer-signal';
import { useDriverPresence } from '../lib/use-driver-presence';
import { useDriverRealtimeStream } from '../lib/use-driver-realtime-stream';
import { useLiveRefresh } from '../lib/use-live-refresh';

export default function DriverHomeScreen() {
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
      <Text style={styles.eyebrow}>Mobilis Chauffeur</Text>
      <Text style={styles.title}>{mobilisCopy.driverHeadline}</Text>
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
            value={formatXof(earnings?.summary.today ?? 0)}
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

      <View style={styles.metricsGrid}>
        <DashboardMetricCard
          label="Aujourd hui"
          value={formatXof(earnings?.summary.today ?? 0)}
          helper="Revenus du jour"
          tone="amber"
        />
        <DashboardMetricCard
          label="Semaine"
          value={formatXof(earnings?.summary.week ?? 0)}
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
          <Link href="/offres" asChild>
            <QuickActionCard
              eyebrow="Direct"
              title="Ouvrir la course en direct"
              description="Retrouver la navigation, le client et le suivi d execution."
              tone="amber"
              emphasis="primary"
            />
          </Link>
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
            titleAside={formatXof(offer.fare)}
            titleAsideColor={mobilisTheme.colors.amber}
            description={`${offer.pickup} vers ${offer.destination}`}
            insights={buildDriverOfferInsights(offer)}
            detailLines={buildDriverOfferDetailLines(offer)}
            note={offerNote?.text}
            noteTone={offerNote?.tone ?? 'sky'}
            isHighlighted={freshOfferIds.includes(offer.id)}
          />
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
        <Link href="/revenus" asChild>
          <QuickActionCard
            eyebrow="Finance"
            title="Consulter les revenus"
            description="Suivre les gains du jour, de la semaine et les tendances."
            tone="sky"
          />
        </Link>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    paddingTop: 88,
    paddingHorizontal: 24,
    paddingBottom: 40,
    backgroundColor: mobilisTheme.colors.background,
    gap: 16,
  },
  eyebrow: {
    color: mobilisTheme.colors.amber,
    textTransform: 'uppercase',
    letterSpacing: 2,
  },
  title: {
    color: mobilisTheme.colors.text,
    fontSize: 38,
    lineHeight: 40,
    fontWeight: '800',
  },
  body: {
    color: mobilisTheme.colors.muted,
    lineHeight: 22,
  },
  inlineButton: {
    marginTop: 10,
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: mobilisTheme.colors.backgroundAlt,
    borderWidth: 1,
    borderColor: mobilisTheme.colors.border,
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
    color: mobilisTheme.colors.text,
    fontWeight: '700',
    fontSize: 13,
  },
  metricsGrid: {
    flexDirection: 'row',
    gap: 12,
    flexWrap: 'wrap',
  },
  activeTripCard: {
    backgroundColor: mobilisTheme.colors.backgroundAlt,
    borderWidth: 1,
    borderColor: mobilisTheme.colors.border,
    borderRadius: 24,
    padding: 20,
    gap: 8,
  },
  activeTripCardHighlight: {
    borderColor: 'rgba(56, 189, 248, 0.42)',
    backgroundColor: 'rgba(56, 189, 248, 0.08)',
  },
  activeTripEyebrow: {
    color: mobilisTheme.colors.teal,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    fontSize: 12,
  },
  activeTripTitle: {
    color: mobilisTheme.colors.text,
    fontSize: 22,
    fontWeight: '800',
  },
  activeTripStatus: {
    color: mobilisTheme.colors.amber,
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
    borderColor: mobilisTheme.colors.teal,
  },
  availabilityButtonOffline: {
    backgroundColor: 'rgba(245, 158, 11, 0.16)',
    borderColor: mobilisTheme.colors.amber,
  },
  availabilityButtonLabel: {
    fontWeight: '700',
    fontSize: 13,
  },
  availabilityButtonLabelOnline: {
    color: mobilisTheme.colors.teal,
  },
  availabilityButtonLabelOffline: {
    color: mobilisTheme.colors.amber,
  },
  meta: {
    color: mobilisTheme.colors.muted,
  },
  syncMeta: {
    color: mobilisTheme.colors.sky,
    fontWeight: '700',
  },
  transitionMeta: {
    color: mobilisTheme.colors.sky,
    fontWeight: '700',
    lineHeight: 19,
  },
  transitionMetaMuted: {
    color: mobilisTheme.colors.rose,
    lineHeight: 19,
  },
  safety: {
    color: mobilisTheme.colors.amber,
  },
  section: {
    color: mobilisTheme.colors.text,
    fontSize: 20,
    fontWeight: '700',
  },
  actions: {
    gap: 12,
  },
});
