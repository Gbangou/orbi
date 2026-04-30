import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import {
  acceptRideRequestWithApi,
  declineDriverOfferWithApi,
  driverOffers,
  fetchDriverOffers,
  fetchDriverProfile,
  fetchMyTrips,
  fetchTripDetail,
  reportTripIncidentWithApi,
  type DriverOffer,
  type MyTripsResponse,
  type TripDetailResponse,
  updateTripStatusWithApi,
  updateDriverAvailabilityWithApi,
  verifyPickupCodeWithApi,
} from '@mobilis/api';
import {
  describeRealtimeEvent,
  describeRealtimeConnection,
  formatRealtimeBadgeLabel,
  formatOperationalStatus,
  formatXof,
  mobilisTheme,
} from '@mobilis/ui';
import {
  FlowActionButton,
  LiveStatusBanner,
  LiveTimeline,
  MetricTile,
  RouteSignalCard,
  TransitionNoticeCard,
} from '../lib/realtime-widgets';
import { restoreDriverSession } from '../lib/auth';
import { resolveDriverAppError } from '../lib/session-feedback';
import {
  formatReservationCountdown,
  useReservationExpiryRefresh,
  useReservationClock,
} from '../lib/offer-reservation';
import {
  buildDriverDispatchStatusLabel,
  buildDriverFlowTransitionLabel,
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
import { DriverJourneySection } from '../lib/driver-journey';

const fallbackHistory: MyTripsResponse = {
  role: 'DRIVER',
  stats: {
    activeTrips: 0,
    completedTrips: 0,
    cancelledTrips: 0,
    totalAmount: 0,
    currency: 'XOF',
  },
  pendingRequests: [],
  recentTrips: [],
};

export default function OffersScreen() {
  const [offers, setOffers] = useState<DriverOffer[]>(driverOffers);
  const [history, setHistory] = useState<MyTripsResponse>(fallbackHistory);
  const [activeTripDetail, setActiveTripDetail] = useState<TripDetailResponse | null>(null);
  const [status, setStatus] = useState('Connexion au compte chauffeur...');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isRealtimeSyncing, setIsRealtimeSyncing] = useState(false);
  const [freshOfferIds, setFreshOfferIds] = useState<string[]>([]);
  const [recentlyExpiredCount, setRecentlyExpiredCount] = useState(0);
  const [activeTripTransitionLabel, setActiveTripTransitionLabel] = useState<string | null>(null);
  const [freshTimelineEventIds, setFreshTimelineEventIds] = useState<string[]>([]);
  const [driverProfileStatus, setDriverProfileStatus] = useState<string>('OFFLINE');
  const [pickupCodeInput, setPickupCodeInput] = useState('');
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const previousVisibleOfferIdsRef = useRef<string[] | null>(null);
  const previousFlowStateRef = useRef<string | null>(null);
  const previousTimelineEventIdsRef = useRef<string[] | null>(null);

  const loadDriverData = useCallback(async (silent = false) => {
    if (!silent) {
      setIsRefreshing(true);
    }

    try {
      const { authClient, session } = await restoreDriverSession();
      setSessionToken(session.sessionToken);
      const [offersResponse, historyResponse, profileResponse] = await Promise.all([
        fetchDriverOffers(authClient),
        fetchMyTrips(authClient),
        fetchDriverProfile(authClient),
      ]);
      setOffers(offersResponse);
      setHistory(historyResponse);
      setDriverProfileStatus(profileResponse.profile.status);
      const flow = resolveDriverActiveFlow({
        history: historyResponse,
        offers: offersResponse,
        reservationNow: Date.now(),
        driverProfileStatus: profileResponse.profile.status,
      });
      const activeTrip = flow.activeTrip;

      if (activeTrip) {
        const detail = await fetchTripDetail(authClient, activeTrip.id);
        setActiveTripDetail(detail);
      } else {
        setActiveTripDetail(null);
      }

      if (!silent) {
        setStatus(buildDriverDispatchStatusLabel({ flow }));
      }
    } catch (error) {
      const feedback = await resolveDriverAppError(error, {
        network: 'Preview locale active en attendant la connexion API.',
        fallback: 'Preview locale active en attendant la connexion API.',
      });

      if (feedback.shouldClearSessionToken) {
        setSessionToken(null);
      }

      if (!silent) {
        setStatus(feedback.message);
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

  useLiveRefresh(() => loadDriverData(true), 20000);
  useDriverRealtimeStream(
    sessionToken,
    (eventType) => {
      setIsRealtimeSyncing(true);
      setStatus(describeRealtimeEvent('driver', eventType));
      void loadDriverData(true);
    },
    {
      onHeartbeat: () => {
        setStatus(describeRealtimeConnection('driver', 'active'));
      },
      onOpen: () => {
        setIsRealtimeSyncing(false);
        setStatus(describeRealtimeConnection('driver', 'connected'));
      },
      onError: () => {
        setIsRealtimeSyncing(false);
        setStatus(describeRealtimeConnection('driver', 'reconnecting'));
      },
    },
  );

  const reservationNow = useReservationClock();
  const flow = useMemo(
    () =>
      resolveDriverActiveFlow({
        history,
        offers,
        reservationNow,
        driverProfileStatus,
      }),
    [driverProfileStatus, history, offers, reservationNow],
  );
  const { activeTrip, activeFlowState, visibleOffers } = flow;
  const { presenceNote } = useDriverPresence(
    flow.availabilityStatus === 'ONLINE' || Boolean(activeTrip),
  );
  useReservationExpiryRefresh(
    visibleOffers,
    () => loadDriverData(true),
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
      buildDriverFlowTransitionLabel(previousFlowState, activeFlowState, 'offers'),
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

  useEffect(() => {
    const timelineEventIds = activeTripDetail?.trip.timeline.map((event) => event.id) ?? [];
    const previousTimelineEventIds = previousTimelineEventIdsRef.current;

    if (previousTimelineEventIds) {
      const nextFreshTimelineEventIds = timelineEventIds.filter(
        (eventId) => !previousTimelineEventIds.includes(eventId),
      );

      if (nextFreshTimelineEventIds.length > 0) {
        setFreshTimelineEventIds(nextFreshTimelineEventIds);
      }
    }

    previousTimelineEventIdsRef.current = timelineEventIds;
  }, [activeTripDetail]);

  useEffect(() => {
    if (!freshTimelineEventIds.length) {
      return;
    }

    const timeout = setTimeout(() => {
      setFreshTimelineEventIds([]);
      setActiveTripTransitionLabel(null);
    }, 5000);

    return () => clearTimeout(timeout);
  }, [freshTimelineEventIds]);

  async function handleToggleAvailability() {
    setIsSubmitting(true);
    const nextStatus = flow.availabilityStatus === 'ONLINE' ? 'OFFLINE' : 'ONLINE';
    setStatus(
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
      await loadDriverData();
    } catch (error) {
      const feedback = await resolveDriverAppError(error, {
        fallback: "Le changement de disponibilite a echoue.",
      });

      if (feedback.shouldClearSessionToken) {
        setSessionToken(null);
      }

      setStatus(feedback.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleAcceptOffer(rideRequestId: string) {
    setIsSubmitting(true);
    setStatus('Acceptation de l offre et creation du trajet...');

    try {
      const { authClient } = await restoreDriverSession();
      const response = await acceptRideRequestWithApi(authClient, rideRequestId);
      setStatus(`Trajet ${response.trip.id.slice(0, 8)} cree avec statut ${response.trip.status}.`);
      await loadDriverData();
    } catch (error) {
      const feedback = await resolveDriverAppError(error, {
        fallback: "L'acceptation de l'offre a echoue.",
      });

      if (feedback.shouldClearSessionToken) {
        setSessionToken(null);
      }

      setStatus(feedback.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDeclineOffer(rideRequestId: string) {
    setIsSubmitting(true);
    setStatus('Refus explicite de l offre et liberation de la reservation...');

    try {
      const { authClient } = await restoreDriverSession();
      const response = await declineDriverOfferWithApi(authClient, rideRequestId);
      setStatus(
        `Offre ${response.offer.rideRequestId.slice(0, 8)} refusee. Le dispatch memorise ce signal.`,
      );
      await loadDriverData();
    } catch (error) {
      const feedback = await resolveDriverAppError(error, {
        fallback: "Le refus explicite de l'offre a echoue.",
      });

      if (feedback.shouldClearSessionToken) {
        setSessionToken(null);
      }

      setStatus(feedback.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleAdvanceTrip(
    tripId: string,
    nextStatus: 'DRIVER_ARRIVING' | 'IN_PROGRESS' | 'COMPLETED',
  ) {
    setIsSubmitting(true);
    setStatus(`Mise a jour du trajet vers ${nextStatus}...`);

    try {
      const { authClient } = await restoreDriverSession();
      const response = await updateTripStatusWithApi(authClient, tripId, nextStatus);
      setStatus(`Trajet ${response.trip.id.slice(0, 8)} mis a jour: ${response.trip.status}.`);
      await loadDriverData();
    } catch (error) {
      const feedback = await resolveDriverAppError(error, {
        fallback: 'La mise a jour du trajet a echoue.',
      });

      if (feedback.shouldClearSessionToken) {
        setSessionToken(null);
      }

      setStatus(feedback.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleVerifyPickupCode(tripId: string, pickupCode: string) {
    setIsSubmitting(true);
    setStatus('Verification du code de prise en charge...');

    try {
      const { authClient } = await restoreDriverSession();
      const response = await verifyPickupCodeWithApi(authClient, tripId, pickupCode);
      setPickupCodeInput('');
      setStatus(`Code valide. Trajet ${response.trip.id.slice(0, 8)} demarre.`);
      await loadDriverData();
    } catch (error) {
      const feedback = await resolveDriverAppError(error, {
        fallback: 'Code incorrect ou verification impossible.',
      });

      if (feedback.shouldClearSessionToken) {
        setSessionToken(null);
      }

      setStatus(feedback.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleReportIncident(tripId: string) {
    setIsSubmitting(true);
    setStatus('Signalement de l incident a l equipe operations...');

    try {
      const { authClient } = await restoreDriverSession();
      await reportTripIncidentWithApi(authClient, tripId, {
        incidentType: 'DRIVER_ALERT',
        details: 'Signalement rapide envoye depuis l ecran chauffeur.',
        priority: 3,
      });
      setStatus('Incident signale. Le support live a ete notifie.');
      await loadDriverData();
    } catch (error) {
      const feedback = await resolveDriverAppError(error, {
        fallback: "Le signalement de l'incident a echoue.",
      });

      if (feedback.shouldClearSessionToken) {
        setSessionToken(null);
      }

      setStatus(feedback.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  function renderActiveTripAction() {
    if (!activeTrip) {
      return null;
    }

    if (activeTrip.status === 'MATCHED') {
      return (
        <FlowActionButton
          disabled={isSubmitting}
          label="Signaler l arrivee"
          onPress={() => handleAdvanceTrip(activeTrip.id, 'DRIVER_ARRIVING')}
          tone="amber"
          emphasis="primary"
          style={isSubmitting ? styles.disabled : null}
        />
      );
    }

    if (activeTrip.status === 'DRIVER_ARRIVING') {
      return (
        <View style={styles.codeBlock}>
          <Text style={styles.meta}>Saisir le code donne par le passager avant de demarrer.</Text>
          <TextInput
            value={pickupCodeInput}
            onChangeText={setPickupCodeInput}
            placeholder="Code a 4 chiffres"
            placeholderTextColor={mobilisTheme.colors.muted}
            keyboardType="number-pad"
            maxLength={4}
            style={styles.codeInput}
          />
          <FlowActionButton
            disabled={isSubmitting || pickupCodeInput.length !== 4}
            label="Verifier le code et demarrer"
            onPress={() => handleVerifyPickupCode(activeTrip.id, pickupCodeInput)}
            tone="amber"
            emphasis="primary"
            style={isSubmitting || pickupCodeInput.length !== 4 ? styles.disabled : null}
          />
        </View>
      );
    }

    if (activeTrip.status === 'IN_PROGRESS') {
      return (
        <FlowActionButton
          disabled={isSubmitting}
          label="Terminer la course"
          onPress={() => handleAdvanceTrip(activeTrip.id, 'COMPLETED')}
          tone="amber"
          emphasis="primary"
          style={isSubmitting ? styles.disabled : null}
        />
      );
    }

    return null;
  }

  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <Text style={styles.title}>Offres de course</Text>
      <LiveStatusBanner
        label={formatRealtimeBadgeLabel('Direct', isRealtimeSyncing)}
        message={status}
        secondaryMessage={
          isRealtimeSyncing
            ? 'Mise a jour silencieuse en cours pour absorber les derniers evenements.'
            : presenceNote
        }
        tone={isRealtimeSyncing ? 'sky' : 'teal'}
      />
      <View style={styles.snapshotRow}>
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
      </View>
      {freshOfferIds.length ? (
        <TransitionNoticeCard
          label={
            freshOfferIds.length > 1
              ? `${freshOfferIds.length} nouvelles offres live`
              : 'Nouvelle offre live'
          }
          message="Les cartes fraichement resynchronisees restent surlignees quelques secondes."
          tone="sky"
        />
      ) : null}
      {recentlyExpiredCount ? (
        <TransitionNoticeCard
          label={
            recentlyExpiredCount > 1
              ? `${recentlyExpiredCount} reservations ont expire`
              : 'Une reservation a expire'
          }
          message="Les elements sortis du flux live ont ete retires pour garder la liste fiable."
          tone="rose"
        />
      ) : null}
      {activeTripTransitionLabel && !activeTrip ? (
        <TransitionNoticeCard
          label="Mission live"
          message={activeTripTransitionLabel}
          tone="sky"
        />
      ) : null}
      {flow.operationalStatus === 'SUSPENDED' ? (
        <Text style={styles.subtitle}>
          Le compte est suspendu. Les actions dispatch sont verrouillees jusqu a reactivation operations.
        </Text>
      ) : driverProfileStatus === 'BUSY' ? (
        <Text style={styles.subtitle}>Le chauffeur reste visible pour le suivi course avec un statut occupe.</Text>
      ) : null}
      <Pressable
        onPress={() => void loadDriverData()}
        disabled={isRefreshing || isSubmitting}
        style={[styles.refreshButton, isRefreshing || isSubmitting ? styles.disabled : null]}
      >
        <Text style={styles.refreshButtonLabel}>
          {isRefreshing ? 'Actualisation...' : 'Actualiser le direct'}
        </Text>
      </Pressable>
      <Pressable
        onPress={() => void handleToggleAvailability()}
        disabled={isSubmitting || flow.availabilityLocked}
        style={[
          styles.toggleButton,
          flow.availabilityStatus === 'ONLINE'
            ? styles.toggleButtonOffline
            : styles.toggleButtonOnline,
          isSubmitting || flow.availabilityLocked ? styles.disabled : null,
        ]}
      >
        <Text
          style={[
            styles.toggleButtonLabel,
            flow.availabilityStatus === 'ONLINE'
              ? styles.toggleButtonLabelOffline
              : styles.toggleButtonLabelOnline,
          ]}
        >
          {activeTrip
            ? 'Disponibilite verrouillee pendant la course'
            : flow.operationalStatus === 'SUSPENDED'
              ? 'Suspension geree par les operations'
              : flow.availabilityStatus === 'ONLINE'
              ? 'Passer hors ligne'
              : 'Passer en ligne'}
        </Text>
      </Pressable>

      <DriverJourneySection
        currentStep="offres"
        description="Le dispatch reste aligne avec l acces, le cockpit, les revenus et le dossier chauffeur pour garder les memes reperes live."
      />

      {activeTrip ? (
        <RouteSignalCard
          eyebrow="Course active"
          badgeLabel={
            freshTimelineEventIds.length
              ? freshTimelineEventIds.length > 1
                ? `${freshTimelineEventIds.length} evenements live`
                : 'Evenement live'
              : activeTripTransitionLabel
                ? 'Transition live'
                : null
          }
          badgeTone="sky"
          title={flow.primaryRouteLabel ?? `${activeTrip.pickupAddress} vers ${activeTrip.destinationAddress}`}
          description={`Client: ${activeTrip.counterpartyName ?? 'Affecte'}${activeTrip.vehicleLabel ? ` - Vehicule: ${activeTrip.vehicleLabel}` : ''}`}
          insights={[
            {
              label: 'Statut',
              value: flow.primaryStatusLabel,
              tone: 'amber',
            },
            {
              label: 'Profil',
              value: formatOperationalStatus(driverProfileStatus),
              tone: 'teal',
            },
          ]}
          detailLines={[`Statut: ${activeTrip.status}`]}
          note={
            activeTrip.pickupCode
              ? 'Le passager doit vous communiquer un code a 4 chiffres.'
              : null
          }
          noteTone="amber"
          isHighlighted={Boolean(activeTripTransitionLabel || freshTimelineEventIds.length)}
        >
          {activeTripTransitionLabel ? (
            <Text style={styles.transitionInlineLabel}>{activeTripTransitionLabel}</Text>
          ) : null}
          {activeTripDetail ? (
            <LiveTimeline
              events={activeTripDetail.trip.timeline}
              freshEventIds={freshTimelineEventIds}
            />
          ) : null}
          {renderActiveTripAction()}
          <FlowActionButton
            disabled={isSubmitting}
            label="Signaler un incident"
            onPress={() => handleReportIncident(activeTrip.id)}
            emphasis="secondary"
            style={isSubmitting ? styles.disabled : null}
          />
        </RouteSignalCard>
      ) : null}
      {flow.operationalStatus === 'SUSPENDED' && !activeTrip ? (
        <RouteSignalCard
          eyebrow="Dispatch"
          title="Compte suspendu"
          description="Le dispatch reste coupe pendant que les operations traitent la suspension du compte."
          insights={[
            { label: 'Profil', value: 'Suspendu', tone: 'rose' },
            { label: 'Flux', value: 'Bloque', tone: 'amber' },
          ]}
          note="Les reservations reapparaitront automatiquement apres reactivation."
          noteTone="rose"
        />
      ) : flow.availabilityStatus !== 'ONLINE' && !activeTrip ? (
        <RouteSignalCard
          eyebrow="Dispatch"
          title="Mode hors ligne"
          description="Activez votre disponibilite pour voir et accepter les demandes."
          insights={[
            { label: 'Statut', value: 'Hors ligne', tone: 'amber' },
            { label: 'Flux', value: 'Suspendu', tone: 'rose' },
          ]}
          note="Les reservations reviendront automatiquement dans cette liste apres reactivation."
          noteTone="amber"
        />
      ) : null}
      {visibleOffers.map((offer) => {
        const offerNote = buildDriverOfferNote(offer);

        return (
          <RouteSignalCard
            key={offer.id}
            eyebrow={freshOfferIds.includes(offer.id) ? 'Nouvelle reservation live' : 'Offre reservee'}
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
          >
            <View style={styles.offerActionRow}>
              <FlowActionButton
                disabled={isSubmitting || Boolean(activeTrip)}
                label={
                  activeTrip
                    ? 'Une course est deja en cours'
                    : 'Accepter cette offre'
                }
                onPress={() => handleAcceptOffer(offer.id)}
                style={[
                  styles.offerAction,
                  isSubmitting || activeTrip ? styles.disabled : null,
                ]}
                emphasis="secondary"
              />
              <FlowActionButton
                disabled={isSubmitting || Boolean(activeTrip)}
                label="Refuser cette offre"
                onPress={() => handleDeclineOffer(offer.id)}
                style={[
                  styles.offerAction,
                  isSubmitting || activeTrip ? styles.disabled : null,
                ]}
                tone="rose"
                emphasis="ghost"
              />
            </View>
          </RouteSignalCard>
        );
      })}
      {flow.canReceiveOffers && visibleOffers.length === 0 ? (
        <RouteSignalCard
          eyebrow="Dispatch"
          title="Aucune reservation active"
          description="Le dispatch n a pas encore verrouille de demande pour vous ou la fenetre vient d expirer."
          insights={[
            { label: 'Statut', value: 'En ligne', tone: 'teal' },
            { label: 'Attente', value: 'Aucune offre', tone: 'sky' },
          ]}
          note="Le flux live reste branche et mettra en avant la prochaine reservation compatible."
          noteTone="sky"
        />
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    paddingTop: 88,
    paddingHorizontal: 24,
    paddingBottom: 40,
    backgroundColor: mobilisTheme.colors.background,
    gap: 14,
  },
  title: {
    color: mobilisTheme.colors.text,
    fontSize: 32,
    fontWeight: '800',
  },
  subtitle: {
    color: mobilisTheme.colors.muted,
  },
  snapshotRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  refreshButton: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: mobilisTheme.colors.backgroundAlt,
    borderWidth: 1,
    borderColor: mobilisTheme.colors.border,
  },
  refreshButtonLabel: {
    color: mobilisTheme.colors.text,
    fontWeight: '700',
    fontSize: 13,
  },
  toggleButton: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
  },
  toggleButtonOnline: {
    backgroundColor: 'rgba(45, 212, 191, 0.16)',
    borderColor: mobilisTheme.colors.teal,
  },
  toggleButtonOffline: {
    backgroundColor: 'rgba(245, 158, 11, 0.16)',
    borderColor: mobilisTheme.colors.amber,
  },
  toggleButtonLabel: {
    fontWeight: '700',
    fontSize: 13,
  },
  toggleButtonLabelOnline: {
    color: mobilisTheme.colors.teal,
  },
  toggleButtonLabelOffline: {
    color: mobilisTheme.colors.amber,
  },
  transitionInlineLabel: {
    color: mobilisTheme.colors.sky,
    fontWeight: '700',
  },
  codeBlock: {
    gap: 10,
  },
  codeInput: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: mobilisTheme.colors.border,
    backgroundColor: mobilisTheme.colors.panel,
    color: mobilisTheme.colors.text,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 4,
  },
  meta: {
    color: mobilisTheme.colors.muted,
  },
  offerActionRow: {
    flexDirection: 'row',
    gap: 10,
  },
  offerAction: {
    flex: 1,
  },
  disabled: {
    opacity: 0.6,
  },
});
