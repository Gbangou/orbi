import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, StyleSheet } from 'react-native';
import {
  cancelRideRequestWithApi,
  fetchMyTrips,
  fetchTripDetail,
  isActiveTripLifecycleStatus,
  reportTripIncidentWithApi,
  type MyTripsResponse,
  type TripDetailResponse,
  updateTripStatusWithApi,
} from '@mobilis/api';
import {
  describeRealtimeEvent,
  describeRealtimeConnection,
  formatOperationalStatus,
  formatXof,
  mobilisTheme,
} from '@mobilis/ui';
import {
  FlowActionButton,
  LiveStatusBanner,
  LiveTimeline,
  RouteSignalCard,
  TransitionNoticeCard,
} from '../lib/realtime-widgets';
import { restoreRiderSession } from '../lib/auth';
import { RiderJourneySection } from '../lib/rider-journey';
import {
  buildRiderFlowTransitionLabel,
  resolveRiderActiveFlow,
} from '../lib/rider-active-flow';
import { useLiveRefresh } from '../lib/use-live-refresh';
import { useRiderRealtimeStream } from '../lib/use-rider-realtime-stream';
import { resolveRiderAppError } from '../lib/session-feedback';

const fallbackHistory: MyTripsResponse = {
  role: 'RIDER',
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

export default function ActivityScreen() {
  const [history, setHistory] = useState<MyTripsResponse>(fallbackHistory);
  const [activeTripDetail, setActiveTripDetail] = useState<TripDetailResponse | null>(null);
  const [status, setStatus] = useState('Chargement de l historique...');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isRealtimeSyncing, setIsRealtimeSyncing] = useState(false);
  const [activityTransitionLabel, setActivityTransitionLabel] = useState<string | null>(null);
  const [freshTimelineEventIds, setFreshTimelineEventIds] = useState<string[]>([]);
  const [recentlyClearedRequestCount, setRecentlyClearedRequestCount] = useState(0);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const previousActiveTripStatusRef = useRef<string | null>(null);
  const previousTimelineEventIdsRef = useRef<string[] | null>(null);
  const previousPendingRequestIdsRef = useRef<string[] | null>(null);

  const loadHistory = useCallback(async (silent = false) => {
    if (!silent) {
      setIsRefreshing(true);
    }

    try {
      const { authClient, session } = await restoreRiderSession();
      setSessionToken(session.sessionToken);
      const response = await fetchMyTrips(authClient);
      setHistory(response);

      const activeTrip = response.recentTrips.find((trip) =>
        isActiveTripLifecycleStatus(trip.status),
      );

      if (activeTrip) {
        const detail = await fetchTripDetail(authClient, activeTrip.id);
        setActiveTripDetail(detail);
      } else {
        setActiveTripDetail(null);
      }

      if (!silent) {
        setStatus('Historique charge depuis le flux protege.');
      }
    } catch (error) {
      const feedback = await resolveRiderAppError(error, {
        network: 'Historique vide de secours en attendant la connexion API.',
        fallback: 'Historique vide de secours en attendant la connexion API.',
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

  useLiveRefresh(() => loadHistory(true), 25000);
  useRiderRealtimeStream(
    sessionToken,
    (eventType) => {
      setIsRealtimeSyncing(true);
      setStatus(describeRealtimeEvent('rider', eventType));
      void loadHistory(true);
    },
    {
      onHeartbeat: () => {
        setStatus(describeRealtimeConnection('rider', 'active'));
      },
      onOpen: () => {
        setIsRealtimeSyncing(false);
        setStatus(describeRealtimeConnection('rider', 'connected'));
      },
      onError: () => {
        setIsRealtimeSyncing(false);
        setStatus(describeRealtimeConnection('rider', 'reconnecting'));
      },
    },
  );

  const flow = resolveRiderActiveFlow(history);
  const { activeTrip, primaryStatusLabel } = flow;

  useEffect(() => {
    const previousPendingRequestIds = previousPendingRequestIdsRef.current;
    const nextPendingRequestIds = history.pendingRequests.map((request) => request.id);

    if (previousPendingRequestIds) {
      const clearedRequestIds = previousPendingRequestIds.filter(
        (requestId) => !nextPendingRequestIds.includes(requestId),
      );

      if (clearedRequestIds.length > 0) {
        setRecentlyClearedRequestCount(clearedRequestIds.length);
      }
    }

    previousPendingRequestIdsRef.current = nextPendingRequestIds;
  }, [history.pendingRequests]);

  useEffect(() => {
    if (!activeTrip) {
      previousActiveTripStatusRef.current = null;
      setActivityTransitionLabel(null);
      return;
    }

    const previousStatus = previousActiveTripStatusRef.current;

    setActivityTransitionLabel(
      buildRiderFlowTransitionLabel(
        previousStatus ? `TRIP:${previousStatus}` : null,
        `TRIP:${activeTrip.status}`,
        'activity',
      ),
    );

    previousActiveTripStatusRef.current = activeTrip.status;
  }, [activeTrip]);

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
      setActivityTransitionLabel(null);
    }, 5000);

    return () => clearTimeout(timeout);
  }, [freshTimelineEventIds]);

  useEffect(() => {
    if (!recentlyClearedRequestCount) {
      return;
    }

    const timeout = setTimeout(() => {
      setRecentlyClearedRequestCount(0);
    }, 5000);

    return () => clearTimeout(timeout);
  }, [recentlyClearedRequestCount]);

  async function handleCancelPendingRequest(rideRequestId: string) {
    setIsSubmitting(true);
    setStatus('Annulation de la demande en cours...');

    try {
      const { authClient } = await restoreRiderSession();
      await cancelRideRequestWithApi(authClient, rideRequestId);
      setStatus('Demande annulee avec succes.');
      await loadHistory();
    } catch (error) {
      const feedback = await resolveRiderAppError(error, {
        fallback: "L'annulation de la demande a echoue.",
      });

      if (feedback.shouldClearSessionToken) {
        setSessionToken(null);
      }

      setStatus(feedback.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleCancelActiveTrip(tripId: string) {
    setIsSubmitting(true);
    setStatus('Annulation de la course avant depart...');

    try {
      const { authClient } = await restoreRiderSession();
      await updateTripStatusWithApi(authClient, tripId, 'CANCELLED');
      setStatus('Course annulee. Vous pouvez reserver a nouveau.');
      await loadHistory();
    } catch (error) {
      const feedback = await resolveRiderAppError(error, {
        fallback: "L'annulation de la course a echoue.",
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
    setStatus('Signalement de l incident a l equipe support...');

    try {
      const { authClient } = await restoreRiderSession();
      await reportTripIncidentWithApi(authClient, tripId, {
        incidentType: 'SAFETY_ALERT',
        details: 'Signalement rapide envoye depuis l ecran passager.',
        priority: 3,
      });
      setStatus('Incident signale. L equipe operations est notifiee.');
      await loadHistory();
    } catch (error) {
      const feedback = await resolveRiderAppError(error, {
        fallback: "Le signalement n'a pas pu etre envoye.",
      });

      if (feedback.shouldClearSessionToken) {
        setSessionToken(null);
      }

      setStatus(feedback.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <Text style={styles.title}>Historique des trajets</Text>
      <LiveStatusBanner
        label="Suivi direct"
        message={status}
        secondaryMessage={
          activityTransitionLabel
            ?? (recentlyClearedRequestCount
              ? `${recentlyClearedRequestCount} demande${recentlyClearedRequestCount > 1 ? 's' : ''} a disparu du flux actif.`
              : null)
        }
        tone={isRealtimeSyncing || activityTransitionLabel ? 'sky' : 'teal'}
      />
      {isRealtimeSyncing ? (
        <Text style={styles.syncMeta}>
          Resynchronisation silencieuse en cours apres evenement live.
        </Text>
      ) : null}
      <Pressable
        disabled={isRefreshing || isSubmitting}
        onPress={() => void loadHistory()}
        style={[styles.refreshButton, isRefreshing || isSubmitting ? styles.actionButtonDisabled : null]}
      >
        <Text style={styles.refreshButtonLabel}>
          {isRefreshing ? 'Actualisation...' : 'Actualiser le suivi'}
        </Text>
      </Pressable>

      <RiderJourneySection
        currentStep="activity"
        description="Le suivi live reste branche au meme tunnel rider que la reservation, la voix et l accueil."
      />

      {recentlyClearedRequestCount ? (
        <TransitionNoticeCard
          label={
            recentlyClearedRequestCount > 1
              ? `${recentlyClearedRequestCount} demandes mises a jour`
              : 'Demande mise a jour'
          }
          message={`${recentlyClearedRequestCount} demande${recentlyClearedRequestCount > 1 ? 's' : ''} a disparu du flux actif.`}
          tone="rose"
        />
      ) : null}

      <RouteSignalCard
        eyebrow="Vue rapide"
        badgeLabel={isRealtimeSyncing ? 'Sync live' : 'Cockpit'}
        badgeTone={isRealtimeSyncing ? 'sky' : 'teal'}
        title="Pilotage des trajets"
        description="Vue unifiee du flux passager, des demandes actives et du suivi de course."
        insights={[
          {
            label: 'Demandes',
            value: String(history.pendingRequests.length),
            tone: history.pendingRequests.length ? 'amber' : 'sky',
          },
          {
            label: 'Completes',
            value: String(history.stats.completedTrips),
            tone: 'teal',
          },
          {
            label: 'Total',
            value: formatXof(history.stats.totalAmount),
            tone: 'sky',
          },
        ]}
        detailLines={[
          `Demandes actives: ${history.pendingRequests.length}`,
          `Trajets completes: ${history.stats.completedTrips}`,
          `Depense totale connue: ${formatXof(history.stats.totalAmount)}`,
          `Etat principal: ${primaryStatusLabel}`,
        ]}
      />

      {activeTrip ? (
        <RouteSignalCard
          eyebrow="Course active"
          badgeLabel={
            freshTimelineEventIds.length
              ? freshTimelineEventIds.length > 1
                ? `${freshTimelineEventIds.length} evenements live`
                : 'Evenement live'
              : activityTransitionLabel
                ? 'Transition live'
                : primaryStatusLabel
          }
          badgeTone={activityTransitionLabel || freshTimelineEventIds.length ? 'sky' : 'teal'}
          title={`${activeTrip.pickupAddress} vers ${activeTrip.destinationAddress}`}
          description={`Chauffeur: ${activeTrip.counterpartyName ?? 'Assigne'}`}
          insights={[
            {
              label: 'Statut',
              value: primaryStatusLabel,
              tone: 'teal',
            },
            {
              label: 'Support',
              value: 'Actif',
              tone: 'sky',
            },
          ]}
          detailLines={[
            'Partage de trajet et code de prise en charge actifs.',
            activeTrip.status,
            `Etat principal: ${primaryStatusLabel}`,
          ]}
          note={
            activeTrip.pickupCode
              ? `Code a donner au chauffeur: ${activeTrip.pickupCode}`
              : null
          }
          noteTone="amber"
          isHighlighted={Boolean(activityTransitionLabel || freshTimelineEventIds.length)}
        >
          {activityTransitionLabel ? (
            <Text style={styles.transitionMeta}>{activityTransitionLabel}</Text>
          ) : null}
          {activeTripDetail ? (
            <LiveTimeline
              events={activeTripDetail.trip.timeline}
              freshEventIds={freshTimelineEventIds}
            />
          ) : null}
          {['MATCHED', 'DRIVER_ARRIVING'].includes(activeTrip.status) ? (
            <FlowActionButton
              disabled={isSubmitting}
              label="Annuler avant depart"
              onPress={() => handleCancelActiveTrip(activeTrip.id)}
              emphasis="secondary"
              style={isSubmitting ? styles.actionButtonDisabled : null}
            />
          ) : null}
          <FlowActionButton
            disabled={isSubmitting}
            label="Signaler un incident"
            onPress={() => handleReportIncident(activeTrip.id)}
            emphasis="secondary"
            style={isSubmitting ? styles.actionButtonDisabled : null}
          />
        </RouteSignalCard>
      ) : null}

      {history.pendingRequests.map((request) => (
        <RouteSignalCard
          key={request.id}
          eyebrow="Demande active"
          badgeLabel={`Demande ${formatOperationalStatus(request.status)}`}
          badgeTone={request.status === 'REQUESTED' ? 'amber' : 'sky'}
          title={`${request.pickupAddress} vers ${request.destinationAddress}`}
          description={`Estimation: ${formatXof(request.estimatedFare)}`}
          insights={[
            {
              label: 'Statut',
              value: formatOperationalStatus(request.status),
              tone: request.status === 'REQUESTED' ? 'amber' : 'sky',
            },
          ]}
          detailLines={[
            `Estimation: ${formatXof(request.estimatedFare)}`,
            `Demande ${request.status}`,
          ]}
        >
          {request.status === 'REQUESTED' ? (
            <FlowActionButton
              disabled={isSubmitting}
              label="Annuler cette demande"
              onPress={() => handleCancelPendingRequest(request.id)}
              emphasis="secondary"
              style={isSubmitting ? styles.actionButtonDisabled : null}
            />
          ) : null}
        </RouteSignalCard>
      ))}

      {history.recentTrips.map((trip) => (
        <RouteSignalCard
          key={trip.id}
          eyebrow="Trajet recent"
          badgeLabel={formatOperationalStatus(trip.status)}
          badgeTone={trip.status === 'COMPLETED' ? 'teal' : 'amber'}
          title={`${trip.pickupAddress} vers ${trip.destinationAddress}`}
          titleAside={formatXof(trip.amount)}
          description={`Chauffeur: ${trip.counterpartyName ?? 'Attribue automatiquement'}`}
          insights={[
            {
              label: 'Statut',
              value: formatOperationalStatus(trip.status),
              tone: trip.status === 'COMPLETED' ? 'teal' : 'amber',
            },
          ]}
          detailLines={[
            `Chauffeur: ${trip.counterpartyName ?? 'Attribue automatiquement'}`,
          ]}
        />
      ))}
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
  syncMeta: {
    color: mobilisTheme.colors.sky,
    fontWeight: '700',
  },
  refreshButton: {
    alignSelf: 'flex-start',
    backgroundColor: mobilisTheme.colors.backgroundAlt,
    borderWidth: 1,
    borderColor: mobilisTheme.colors.border,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  refreshButtonLabel: {
    color: mobilisTheme.colors.text,
    fontWeight: '700',
    fontSize: 13,
  },
  transitionMeta: {
    color: mobilisTheme.colors.sky,
    fontWeight: '700',
    lineHeight: 19,
  },
  actionButtonDisabled: {
    opacity: 0.6,
  },
});
