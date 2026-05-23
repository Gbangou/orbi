import { useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Image,
  Linking,
  Pressable,
  ScrollView,
  Share,
  Text,
  StyleSheet,
  View,
} from "react-native";
import {
  cancelRideRequestWithApi,
  createTripShareLinkWithApi,
  fetchMyTrips,
  fetchTripDetail,
  isActiveTripLifecycleStatus,
  reportTripIncidentWithApi,
  triggerTripSafetySosWithApi,
  type MyTripsResponse,
  type TripDetailResponse,
  updateTripStatusWithApi,
} from "@orbi/api";
import {
  describeRealtimeEvent,
  describeRealtimeConnection,
  formatOperationalStatus,
  formatXof,
  orbiTheme,
} from "@orbi/ui";
import {
  FlowActionButton,
  LiveStatusBanner,
  LiveRouteProgressCard,
  LiveTimeline,
  MetricTile,
  RouteSignalCard,
  TransitionNoticeCard,
} from "../../lib/realtime-widgets";
import { restoreRiderSession } from "../../lib/auth";
import { RiderJourneySection } from "../../lib/rider-journey";
import {
  buildRiderFlowTransitionLabel,
  buildRiderDriverTrustSnapshot,
  buildRiderLiveRouteProgress,
  buildRiderMissionSnapshot,
  buildRiderNextActionHint,
  resolveRiderActiveFlow,
} from "../../lib/rider-active-flow";
import { useLiveRefresh } from "../../lib/use-live-refresh";
import { useRiderRealtimeStream } from "../../lib/use-rider-realtime-stream";
import { useRiderPosition } from "../../lib/use-rider-position";
import { resolveRiderAppError } from "../../lib/session-feedback";
import { TripMapView } from "../../lib/trip-map-view";
import { resolveOrbiApiBaseUrlForRuntime } from "@orbi/config";

const fallbackHistory: MyTripsResponse = {
  role: "RIDER",
  stats: {
    activeTrips: 0,
    completedTrips: 0,
    cancelledTrips: 0,
    totalAmount: 0,
    currency: "XOF",
  },
  pendingRequests: [],
  recentTrips: [],
};

function LiveApproachPreview({
  progressPercent,
  title,
  distanceLabel,
  stateLabel,
  etaLabel,
  freshnessLabel,
  coordinateLabel,
  accuracyLabel,
  speedLabel,
  isInProgress,
}: {
  progressPercent: number;
  title: string;
  distanceLabel: string;
  stateLabel: string;
  etaLabel?: string;
  freshnessLabel: string;
  coordinateLabel: string;
  accuracyLabel: string;
  speedLabel: string;
  isInProgress: boolean;
}) {
  const boundedProgress = Math.max(12, Math.min(88, progressPercent));
  const riderProgress = isInProgress ? 88 : 12;
  const motion = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(motion, {
          toValue: 1,
          duration: 900,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(motion, {
          toValue: 0,
          duration: 900,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );

    animation.start();

    return () => animation.stop();
  }, [motion]);

  const vehicleMotion = {
    transform: [
      {
        translateY: motion.interpolate({
          inputRange: [0, 1],
          outputRange: [0, -4],
        }),
      },
      {
        scale: motion.interpolate({
          inputRange: [0, 1],
          outputRange: [1, 1.035],
        }),
      },
    ],
  };

  return (
    <View style={styles.approachMap}>
      <View style={styles.approachGridLayer}>
        <View style={styles.approachGridLine} />
        <View style={[styles.approachGridLine, styles.approachGridLineLower]} />
      </View>
      <View style={styles.approachRoad} />
      <Animated.View
        style={[
          styles.approachRoadPulse,
          {
            opacity: motion.interpolate({
              inputRange: [0, 1],
              outputRange: [0.18, 0.55],
            }),
            transform: [
              {
                translateX: motion.interpolate({
                  inputRange: [0, 1],
                  outputRange: [-18, 22],
                }),
              },
            ],
          },
        ]}
      />
      <View style={styles.approachRoadMuted} />
      <View style={styles.approachTrail}>
        <View style={styles.approachTrailDot} />
        <View style={[styles.approachTrailDot, styles.approachTrailDotMuted]} />
        <View style={[styles.approachTrailDot, styles.approachTrailDotSoft]} />
      </View>
      <Animated.View
        style={[
          styles.approachVehiclePin,
          { left: `${boundedProgress}%` },
          vehicleMotion,
        ]}
      >
        <View style={styles.approachVehicleBody}>
          <View style={styles.approachVehicleCabin} />
          <View style={styles.approachVehicleWheelRow}>
            <View style={styles.approachVehicleWheel} />
            <View style={styles.approachVehicleWheel} />
          </View>
        </View>
      </Animated.View>
      <View style={styles.approachOriginPin}>
        <Text style={styles.approachPinLabel}>P</Text>
      </View>
      <View style={styles.approachDestinationPin}>
        <Text style={styles.approachPinLabel}>A</Text>
      </View>
      <View style={[styles.approachPersonPin, { left: `${riderProgress}%` }]}>
        <Text style={styles.approachPersonLabel}>Rider</Text>
      </View>
      <Animated.View
        style={[
          styles.approachDriverLabel,
          { left: `${boundedProgress}%` },
          vehicleMotion,
        ]}
      >
        <Text style={styles.approachDriverLabelText}>Driver</Text>
      </Animated.View>
      <View style={styles.approachMapCopy}>
        <View style={styles.approachHudRow}>
          <Text style={styles.approachHudLabel}>{etaLabel ?? "ETA live"}</Text>
          <Text style={styles.approachHudLabel}>{freshnessLabel}</Text>
          <Text style={styles.approachHudLabel}>{accuracyLabel}</Text>
        </View>
        <Text style={styles.approachMapTitle}>{title}</Text>
        <Text style={styles.approachMapMeta}>
          {distanceLabel} - {stateLabel}
        </Text>
        <View style={styles.approachSignalRow}>
          <Text style={styles.approachSignalText}>{coordinateLabel}</Text>
          <Text style={styles.approachSignalText}>
            {isInProgress ? "Rider vers destination" : "Rider au pickup"} -{" "}
            {speedLabel}
          </Text>
        </View>
      </View>
    </View>
  );
}

export default function ActivityScreen() {
  const router = useRouter();
  const [history, setHistory] = useState<MyTripsResponse>(fallbackHistory);
  const [activeTripDetail, setActiveTripDetail] =
    useState<TripDetailResponse | null>(null);
  const [status, setStatus] = useState("Chargement de l historique...");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isRealtimeSyncing, setIsRealtimeSyncing] = useState(false);
  const [activityTransitionLabel, setActivityTransitionLabel] = useState<
    string | null
  >(null);
  const [freshTimelineEventIds, setFreshTimelineEventIds] = useState<string[]>(
    [],
  );
  const [recentlyClearedRequestCount, setRecentlyClearedRequestCount] =
    useState(0);
  const [tripDetailStatus, setTripDetailStatus] = useState<string | null>(null);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const previousActiveTripStatusRef = useRef<string | null>(null);
  const previousActiveTripIdRef = useRef<string | null>(null);
  const previousTimelineEventIdsRef = useRef<string[] | null>(null);
  const previousPendingRequestIdsRef = useRef<string[] | null>(null);
  const submissionLockRef = useRef(false);

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
        try {
          const detail = await fetchTripDetail(authClient, activeTrip.id);
          setActiveTripDetail(detail);
          setTripDetailStatus(null);
        } catch {
          setActiveTripDetail(null);
          setTripDetailStatus(
            "Detail de course indisponible: le suivi principal reste actif.",
          );
        }
      } else {
        setActiveTripDetail(null);
        setTripDetailStatus(null);
      }

      if (!silent) {
        setStatus("Historique charge depuis le flux protege.");
      }
    } catch (error) {
      const feedback = await resolveRiderAppError(error, {
        surface: "active-trip",
        network: "Historique vide de secours en attendant la connexion API.",
        fallback: "Historique vide de secours en attendant la connexion API.",
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
      setStatus(describeRealtimeEvent("rider", eventType));
      void loadHistory(true);
    },
    {
      onHeartbeat: () => {
        setStatus(describeRealtimeConnection("rider", "active"));
      },
      onOpen: () => {
        setIsRealtimeSyncing(false);
        setStatus(describeRealtimeConnection("rider", "connected"));
      },
      onError: () => {
        setIsRealtimeSyncing(false);
        setStatus(describeRealtimeConnection("rider", "reconnecting"));
      },
    },
  );

  const flow = resolveRiderActiveFlow(history);
  const { activeTrip, primaryStatusLabel } = flow;
  const riderPosition = useRiderPosition({
    enabled: Boolean(activeTrip),
    activeTripId: activeTrip?.id,
  });
  const riderNextActionHint = buildRiderNextActionHint(flow);
  const riderMissionSnapshot = buildRiderMissionSnapshot({
    flow,
    tripDetail: activeTripDetail,
  });
  const riderRouteProgress = buildRiderLiveRouteProgress({
    flow,
    tripDetail: activeTripDetail,
  });
  const driverTrustSnapshot = buildRiderDriverTrustSnapshot({
    tripDetail: activeTripDetail,
  });

  useEffect(() => {
    const previousPendingRequestIds = previousPendingRequestIdsRef.current;
    const nextPendingRequestIds = history.pendingRequests.map(
      (request) => request.id,
    );

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
        "activity",
      ),
    );

    previousActiveTripStatusRef.current = activeTrip.status;
    previousActiveTripIdRef.current = activeTrip.id;
  }, [activeTrip]);

  useEffect(() => {
    const previousActiveTripId = previousActiveTripIdRef.current;
    if (!previousActiveTripId || activeTrip) {
      return;
    }
    const justCompleted = history.recentTrips.find(
      (trip) => trip.id === previousActiveTripId && trip.status === "COMPLETED",
    );
    if (justCompleted) {
      previousActiveTripIdRef.current = null;
      router.replace({
        pathname: "/receipt",
        params: { tripId: justCompleted.id },
      });
    }
  }, [activeTrip, history.recentTrips, router]);

  useEffect(() => {
    const timelineEventIds =
      activeTripDetail?.trip.timeline.map((event) => event.id) ?? [];
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
    if (submissionLockRef.current) {
      return;
    }

    submissionLockRef.current = true;
    setIsSubmitting(true);
    setStatus("Annulation de la demande en cours...");

    try {
      const { authClient } = await restoreRiderSession();
      await cancelRideRequestWithApi(authClient, rideRequestId);
      setStatus("Demande annulee avec succes.");
      await loadHistory();
    } catch (error) {
      const feedback = await resolveRiderAppError(error, {
        surface: "booking",
        fallback: "L'annulation de la demande a echoue.",
      });

      if (feedback.shouldClearSessionToken) {
        setSessionToken(null);
      }

      setStatus(feedback.message);
    } finally {
      submissionLockRef.current = false;
      setIsSubmitting(false);
    }
  }

  async function handleCancelActiveTrip(tripId: string) {
    if (submissionLockRef.current) {
      return;
    }

    submissionLockRef.current = true;
    setIsSubmitting(true);
    setStatus("Annulation de la course avant depart...");

    try {
      const { authClient } = await restoreRiderSession();
      await updateTripStatusWithApi(authClient, tripId, "CANCELLED");
      setStatus("Course annulee. Vous pouvez reserver a nouveau.");
      await loadHistory();
    } catch (error) {
      const feedback = await resolveRiderAppError(error, {
        surface: "active-trip",
        fallback: "L'annulation de la course a echoue.",
      });

      if (feedback.shouldClearSessionToken) {
        setSessionToken(null);
      }

      setStatus(feedback.message);
    } finally {
      submissionLockRef.current = false;
      setIsSubmitting(false);
    }
  }

  async function handleReportIncident(tripId: string) {
    if (submissionLockRef.current) {
      return;
    }

    submissionLockRef.current = true;
    setIsSubmitting(true);
    setStatus("Signalement de l incident a l equipe support...");

    try {
      const { authClient } = await restoreRiderSession();
      await reportTripIncidentWithApi(authClient, tripId, {
        incidentType: "SAFETY_ALERT",
        details: "Signalement rapide envoye depuis l ecran passager.",
        priority: 3,
      });
      setStatus("Incident signale. L equipe operations est notifiee.");
      await loadHistory();
    } catch (error) {
      const feedback = await resolveRiderAppError(error, {
        surface: "safety",
        fallback: "Le signalement n'a pas pu etre envoye.",
      });

      if (feedback.shouldClearSessionToken) {
        setSessionToken(null);
      }

      setStatus(feedback.message);
    } finally {
      submissionLockRef.current = false;
      setIsSubmitting(false);
    }
  }

  async function handleDeclareIncidentEvidence(tripId: string) {
    if (submissionLockRef.current) {
      return;
    }

    submissionLockRef.current = true;
    setIsSubmitting(true);
    setStatus("Declaration de preuve volontaire avec consentement...");

    try {
      const { authClient } = await restoreRiderSession();
      await reportTripIncidentWithApi(authClient, tripId, {
        incidentType: "VOLUNTARY_EVIDENCE",
        details:
          "Preuve conservee localement par le passager. Upload support uniquement sur action explicite.",
        priority: 3,
        evidenceConsent: true,
        evidenceType: "AUDIO",
        evidenceRetentionHours: 24,
      });
      setStatus(
        "Preuve volontaire declaree. Aucun fichier n a ete envoye automatiquement.",
      );
      await loadHistory();
    } catch (error) {
      const feedback = await resolveRiderAppError(error, {
        surface: "safety",
        fallback: "La preuve volontaire n'a pas pu etre declaree.",
      });

      if (feedback.shouldClearSessionToken) {
        setSessionToken(null);
      }

      setStatus(feedback.message);
    } finally {
      submissionLockRef.current = false;
      setIsSubmitting(false);
    }
  }

  async function handleTriggerSos(tripId: string) {
    if (submissionLockRef.current) {
      return;
    }

    submissionLockRef.current = true;
    setIsSubmitting(true);
    setStatus("SOS en cours: creation du ticket prioritaire...");

    try {
      const { authClient } = await restoreRiderSession();
      const response = await triggerTripSafetySosWithApi(authClient, tripId, {
        details: "SOS declenche depuis le cockpit passager.",
        latitude: riderPosition.latestPosition?.latitude,
        longitude: riderPosition.latestPosition?.longitude,
        accuracyMeters:
          riderPosition.latestPosition?.accuracyMeters ?? undefined,
      });

      setStatus(
        `SOS envoye aux operations. Appel local ${response.sos.localEmergencyNumber} disponible.`,
      );
      void Linking.openURL(`tel:${response.sos.localEmergencyNumber}`);
      await loadHistory();
    } catch (error) {
      const feedback = await resolveRiderAppError(error, {
        surface: "safety",
        fallback: "Le SOS n'a pas pu etre envoye.",
      });

      if (feedback.shouldClearSessionToken) {
        setSessionToken(null);
      }

      setStatus(feedback.message);
    } finally {
      submissionLockRef.current = false;
      setIsSubmitting(false);
    }
  }

  async function handleShareTrip(tripId: string) {
    if (submissionLockRef.current) {
      return;
    }

    submissionLockRef.current = true;
    setIsSubmitting(true);
    setStatus("Creation du lien de partage securise...");

    try {
      const { authClient } = await restoreRiderSession();
      const response = await createTripShareLinkWithApi(authClient, tripId);
      const shareUrl = new URL(
        response.share.path,
        resolveOrbiApiBaseUrlForRuntime(),
      ).toString();

      await Share.share({
        message: `Suivi securise de ma course Orbi: ${shareUrl}`,
        url: shareUrl,
      });
      setStatus("Lien de partage pret. Il expire automatiquement.");
      await loadHistory();
    } catch (error) {
      const feedback = await resolveRiderAppError(error, {
        surface: "safety",
        fallback: "Le lien de partage n'a pas pu etre cree.",
      });

      if (feedback.shouldClearSessionToken) {
        setSessionToken(null);
      }

      setStatus(feedback.message);
    } finally {
      submissionLockRef.current = false;
      setIsSubmitting(false);
    }
  }

  function buildDriverVerificationLines() {
    const verification = activeTripDetail?.trip.driverVerification;

    if (!verification) {
      return [];
    }

    return [
      `Chauffeur verifie: ${formatOperationalStatus(verification.verificationStatus)}`,
      `Telephone chauffeur: ${verification.phoneVerified ? "verifie" : "non verifie"}`,
      `Vehicule: ${verification.vehicle.color} ${verification.vehicle.make} ${verification.vehicle.model}`,
      `Plaque a verifier: ${verification.vehicle.plateNumber}`,
      verification.averageRating === null
        ? `${verification.completedTripsCount} courses terminees`
        : `Note ${verification.averageRating.toFixed(1)}/5 - ${verification.completedTripsCount} courses terminees`,
    ];
  }

  function buildRouteMonitoringLines() {
    const routeMonitoring = activeTripDetail?.trip.routeMonitoring;

    if (!routeMonitoring) {
      return [];
    }

    if (routeMonitoring.state === "unknown") {
      return ["Ride Check: en attente du premier signal route."];
    }

    if (routeMonitoring.state === "clear") {
      return ["Ride Check: trajet coherent sur le dernier signal route."];
    }

    return [
      `Ride Check: ${formatOperationalStatus(routeMonitoring.state)} (${routeMonitoring.alertCount})`,
      routeMonitoring.lastAlertType
        ? `Dernier signal: ${formatOperationalStatus(routeMonitoring.lastAlertType)}`
        : "Dernier signal: anomalie route",
    ];
  }

  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <Text style={styles.title}>Historique des trajets</Text>
      <LiveStatusBanner
        label="Suivi direct"
        message={status}
        secondaryMessage={
          activityTransitionLabel ??
          (recentlyClearedRequestCount
            ? `${recentlyClearedRequestCount} demande${recentlyClearedRequestCount > 1 ? "s" : ""} a disparu du flux actif.`
            : null)
        }
        tone={isRealtimeSyncing || activityTransitionLabel ? "sky" : "teal"}
      />
      {isRealtimeSyncing ? (
        <Text style={styles.syncMeta}>
          Resynchronisation silencieuse en cours apres evenement live.
        </Text>
      ) : null}
      {activeTrip ? (
        <Text style={styles.syncMeta}>{riderPosition.positionNote}</Text>
      ) : null}
      <Pressable
        disabled={isRefreshing || isSubmitting}
        onPress={() => void loadHistory()}
        style={[
          styles.refreshButton,
          isRefreshing || isSubmitting ? styles.actionButtonDisabled : null,
        ]}
      >
        <Text style={styles.refreshButtonLabel}>
          {isRefreshing ? "Actualisation..." : "Actualiser le suivi"}
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
              : "Demande mise a jour"
          }
          message={`${recentlyClearedRequestCount} demande${recentlyClearedRequestCount > 1 ? "s" : ""} a disparu du flux actif.`}
          tone="rose"
        />
      ) : null}

      <RouteSignalCard
        eyebrow="Vue rapide"
        badgeLabel={isRealtimeSyncing ? "Sync live" : "Cockpit"}
        badgeTone={isRealtimeSyncing ? "sky" : "teal"}
        title="Pilotage des trajets"
        description="Vue unifiee du flux passager, des demandes actives et du suivi de course."
        insights={[
          {
            label: "Demandes",
            value: String(history.pendingRequests.length),
            tone: history.pendingRequests.length ? "amber" : "sky",
          },
          {
            label: "Completes",
            value: String(history.stats.completedTrips),
            tone: "teal",
          },
          {
            label: "Total",
            value: formatXof(history.stats.totalAmount),
            tone: "sky",
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
                : "Evenement live"
              : activityTransitionLabel
                ? "Transition live"
                : primaryStatusLabel
          }
          badgeTone={
            activityTransitionLabel || freshTimelineEventIds.length
              ? "sky"
              : "teal"
          }
          title={`${activeTrip.pickupAddress} vers ${activeTrip.destinationAddress}`}
          description={`Chauffeur: ${activeTrip.counterpartyName ?? "Assigne"}`}
          insights={[
            {
              label: "Statut",
              value: primaryStatusLabel,
              tone: "teal",
            },
            {
              label: "Support",
              value: "Actif",
              tone: "sky",
            },
          ]}
          detailLines={[
            "Partage, code pickup et monitoring route connectes aux operations.",
            ...buildDriverVerificationLines(),
            ...buildRouteMonitoringLines(),
            activeTrip.status,
            `Etat principal: ${primaryStatusLabel}`,
          ]}
          note={
            activeTrip.pickupCode
              ? `Code a donner au chauffeur: ${activeTrip.pickupCode}`
              : null
          }
          noteTone="amber"
          isHighlighted={Boolean(
            activityTransitionLabel || freshTimelineEventIds.length,
          )}
        >
          <TransitionNoticeCard
            label="Prochaine action"
            message={riderNextActionHint}
            tone={activeTrip.status === "IN_PROGRESS" ? "sky" : "amber"}
          />
          <Text style={styles.snapshotTitle}>Mission en direct</Text>
          <View style={styles.snapshotStrip}>
            {riderMissionSnapshot.map((item) => (
              <MetricTile
                key={`${item.label}:${item.value}`}
                label={item.label}
                value={item.value}
                helper={item.helper}
              />
            ))}
          </View>
          {tripDetailStatus ? (
            <TransitionNoticeCard
              label="Mode degrade"
              message={tripDetailStatus}
              tone="amber"
            />
          ) : null}
          {driverTrustSnapshot ? (
            <View style={styles.trustCard}>
              <View style={styles.identityRow}>
                {driverTrustSnapshot.profilePhotoUrl ? (
                  <Image
                    source={{ uri: driverTrustSnapshot.profilePhotoUrl }}
                    style={styles.avatarImage}
                  />
                ) : (
                  <View style={styles.avatarFallback}>
                    <Text style={styles.avatarInitials}>
                      {driverTrustSnapshot.initials}
                    </Text>
                  </View>
                )}
                <View style={styles.identityCopy}>
                  <Text style={styles.identityTitle}>
                    {driverTrustSnapshot.driverName}
                  </Text>
                  <Text style={styles.identityMeta}>
                    {driverTrustSnapshot.verificationLabel} -{" "}
                    {driverTrustSnapshot.ratingLabel}
                  </Text>
                  <Text style={styles.identityMeta}>
                    {driverTrustSnapshot.photoLabel}
                  </Text>
                </View>
              </View>
              <View style={styles.identityDetails}>
                <MetricTile
                  label="Vehicule"
                  value={driverTrustSnapshot.vehicleLabel}
                  helper={
                    driverTrustSnapshot.vehicleMeta.join(" - ") ||
                    "Type confirme par dossier"
                  }
                />
                <MetricTile
                  label="Plaque"
                  value={driverTrustSnapshot.plateLabel}
                  helper={driverTrustSnapshot.phoneLabel}
                />
              </View>
            </View>
          ) : null}
          {riderRouteProgress ? (
            <>
              {activeTripDetail?.trip.pickupLatitude != null ? (
                <TripMapView
                  pickupLat={activeTripDetail.trip.pickupLatitude}
                  pickupLng={activeTripDetail.trip.pickupLongitude}
                  destLat={activeTripDetail.trip.destinationLatitude}
                  destLng={activeTripDetail.trip.destinationLongitude}
                  driverLat={
                    activeTripDetail.trip.routeMonitoring.latestPosition
                      ?.latitude ?? null
                  }
                  driverLng={
                    activeTripDetail.trip.routeMonitoring.latestPosition
                      ?.longitude ?? null
                  }
                  style={styles.tripMap}
                />
              ) : (
                <LiveApproachPreview
                  progressPercent={riderRouteProgress.progressPercent}
                  title={riderRouteProgress.title}
                  distanceLabel={riderRouteProgress.distanceLabel}
                  stateLabel={riderRouteProgress.stateLabel}
                  etaLabel={riderRouteProgress.etaLabel}
                  freshnessLabel={riderRouteProgress.freshnessLabel}
                  coordinateLabel={riderRouteProgress.coordinateLabel}
                  accuracyLabel={riderRouteProgress.accuracyLabel}
                  speedLabel={riderRouteProgress.speedLabel}
                  isInProgress={activeTrip.status === "IN_PROGRESS"}
                />
              )}
              <LiveRouteProgressCard {...riderRouteProgress} />
            </>
          ) : null}
          {activityTransitionLabel ? (
            <Text style={styles.transitionMeta}>{activityTransitionLabel}</Text>
          ) : null}
          {activeTripDetail ? (
            <LiveTimeline
              events={activeTripDetail.trip.timeline}
              freshEventIds={freshTimelineEventIds}
            />
          ) : null}
          {["MATCHED", "DRIVER_ARRIVING"].includes(activeTrip.status) ? (
            <FlowActionButton
              disabled={isSubmitting}
              label="Annuler avant depart"
              onPress={() => handleCancelActiveTrip(activeTrip.id)}
              emphasis="secondary"
              style={isSubmitting ? styles.actionButtonDisabled : null}
            />
          ) : null}
          {activeTripDetail?.trip.driverPhoneNumber ? (
            <FlowActionButton
              label="Appeler le chauffeur"
              onPress={() =>
                void Linking.openURL(
                  `tel:${activeTripDetail.trip.driverPhoneNumber}`,
                )
              }
              emphasis="secondary"
            />
          ) : null}
          <FlowActionButton
            disabled={isSubmitting}
            label="SOS securite"
            onPress={() => handleTriggerSos(activeTrip.id)}
            emphasis="primary"
            style={isSubmitting ? styles.actionButtonDisabled : null}
          />
          <FlowActionButton
            disabled={isSubmitting}
            label="Partager le trajet"
            onPress={() => handleShareTrip(activeTrip.id)}
            emphasis="secondary"
            style={isSubmitting ? styles.actionButtonDisabled : null}
          />
          <FlowActionButton
            disabled={isSubmitting}
            label="Signaler un incident"
            onPress={() => handleReportIncident(activeTrip.id)}
            emphasis="secondary"
            style={isSubmitting ? styles.actionButtonDisabled : null}
          />
          <FlowActionButton
            disabled={isSubmitting}
            label="Preuve volontaire"
            onPress={() => handleDeclareIncidentEvidence(activeTrip.id)}
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
          badgeTone={request.status === "REQUESTED" ? "amber" : "sky"}
          title={`${request.pickupAddress} vers ${request.destinationAddress}`}
          description={`Estimation: ${formatXof(request.estimatedFare)}`}
          insights={[
            {
              label: "Statut",
              value: formatOperationalStatus(request.status),
              tone: request.status === "REQUESTED" ? "amber" : "sky",
            },
          ]}
          detailLines={[
            `Estimation: ${formatXof(request.estimatedFare)}`,
            `Demande ${request.status}`,
          ]}
        >
          {request.status === "REQUESTED" ? (
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
          badgeTone={trip.status === "COMPLETED" ? "teal" : "amber"}
          title={`${trip.pickupAddress} vers ${trip.destinationAddress}`}
          titleAside={formatXof(trip.amount)}
          description={`Chauffeur: ${trip.counterpartyName ?? "Attribue automatiquement"}`}
          insights={[
            {
              label: "Statut",
              value: formatOperationalStatus(trip.status),
              tone: trip.status === "COMPLETED" ? "teal" : "amber",
            },
          ]}
          detailLines={[
            `Chauffeur: ${trip.counterpartyName ?? "Attribue automatiquement"}`,
          ]}
        >
          {trip.status === "COMPLETED" ? (
            <View style={styles.tripCompletedActions}>
              <Pressable
                onPress={() =>
                  router.push({
                    pathname: "/receipt",
                    params: { tripId: trip.id },
                  })
                }
                style={styles.receiptButton}
              >
                <Text style={styles.receiptButtonLabel}>Voir le recu</Text>
              </Pressable>
              <Pressable
                onPress={() =>
                  router.push({
                    pathname: "/rating",
                    params: {
                      tripId: trip.id,
                      driverName: trip.counterpartyName ?? "",
                      fare: String(trip.amount),
                      destination: trip.destinationAddress,
                    },
                  })
                }
                style={styles.rateButton}
              >
                <Text style={styles.rateButtonLabel}>Evaluer</Text>
              </Pressable>
            </View>
          ) : null}
        </RouteSignalCard>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    paddingTop: 88,
    paddingHorizontal: 24,
    paddingBottom: 40,
    backgroundColor: orbiTheme.colors.background,
    gap: 14,
  },
  title: {
    color: orbiTheme.colors.text,
    fontSize: 32,
    fontWeight: "800",
  },
  syncMeta: {
    color: orbiTheme.colors.sky,
    fontWeight: "700",
  },
  refreshButton: {
    alignSelf: "flex-start",
    backgroundColor: orbiTheme.colors.backgroundAlt,
    borderWidth: 1,
    borderColor: orbiTheme.colors.border,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  refreshButtonLabel: {
    color: orbiTheme.colors.text,
    fontWeight: "700",
    fontSize: 13,
  },
  transitionMeta: {
    color: orbiTheme.colors.sky,
    fontWeight: "700",
    lineHeight: 19,
  },
  snapshotTitle: {
    color: orbiTheme.colors.text,
    fontWeight: "800",
    marginTop: 4,
  },
  snapshotStrip: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  trustCard: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: orbiTheme.colors.border,
    backgroundColor: orbiTheme.colors.backgroundAlt,
    padding: 14,
    gap: 12,
  },
  identityRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  avatarFallback: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(45, 212, 191, 0.16)",
    borderWidth: 1,
    borderColor: "rgba(45, 212, 191, 0.36)",
  },
  avatarImage: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: "rgba(45, 212, 191, 0.36)",
    backgroundColor: orbiTheme.colors.backgroundAlt,
  },
  avatarInitials: {
    color: orbiTheme.colors.teal,
    fontWeight: "900",
    fontSize: 18,
  },
  identityCopy: {
    flex: 1,
    gap: 2,
  },
  identityTitle: {
    color: orbiTheme.colors.text,
    fontWeight: "800",
    fontSize: 17,
  },
  identityMeta: {
    color: orbiTheme.colors.muted,
    lineHeight: 18,
  },
  identityDetails: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  approachMap: {
    minHeight: 142,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(56, 189, 248, 0.32)",
    backgroundColor: "rgba(8, 47, 73, 0.18)",
    overflow: "hidden",
    justifyContent: "center",
    padding: 16,
  },
  approachGridLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  approachGridLine: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 34,
    height: 1,
    backgroundColor: "rgba(148, 163, 184, 0.12)",
  },
  approachGridLineLower: {
    top: 112,
  },
  approachRoad: {
    position: "absolute",
    left: 24,
    right: 24,
    top: 70,
    height: 8,
    borderRadius: 999,
    backgroundColor: "rgba(56, 189, 248, 0.34)",
  },
  approachRoadPulse: {
    position: "absolute",
    left: 56,
    top: 69,
    width: 64,
    height: 10,
    borderRadius: 999,
    backgroundColor: "rgba(45, 212, 191, 0.72)",
  },
  approachRoadMuted: {
    position: "absolute",
    left: 34,
    right: 34,
    top: 84,
    height: 2,
    borderRadius: 999,
    backgroundColor: "rgba(148, 163, 184, 0.28)",
  },
  approachTrail: {
    position: "absolute",
    left: 54,
    right: 54,
    top: 66,
    height: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
  },
  approachTrailDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: "rgba(45, 212, 191, 0.7)",
  },
  approachTrailDotMuted: {
    opacity: 0.46,
  },
  approachTrailDotSoft: {
    opacity: 0.28,
  },
  approachVehiclePin: {
    position: "absolute",
    top: 42,
    width: 50,
    marginLeft: -25,
    alignItems: "center",
  },
  approachVehicleBody: {
    width: 44,
    height: 25,
    borderRadius: 9,
    backgroundColor: orbiTheme.colors.teal,
    alignItems: "center",
    justifyContent: "flex-end",
    paddingBottom: 3,
  },
  approachVehicleCabin: {
    position: "absolute",
    top: -8,
    width: 24,
    height: 12,
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
    backgroundColor: "rgba(45, 212, 191, 0.7)",
  },
  approachVehicleWheelRow: {
    width: 36,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  approachVehicleWheel: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: orbiTheme.colors.background,
  },
  approachOriginPin: {
    position: "absolute",
    left: 18,
    top: 56,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: orbiTheme.colors.sky,
  },
  approachDestinationPin: {
    position: "absolute",
    right: 18,
    top: 56,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: orbiTheme.colors.amber,
  },
  approachPersonPin: {
    position: "absolute",
    top: 91,
    minWidth: 48,
    marginLeft: -24,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: "rgba(251, 191, 36, 0.92)",
    alignItems: "center",
  },
  approachPersonLabel: {
    color: "#3b2205",
    fontSize: 10,
    fontWeight: "900",
  },
  approachDriverLabel: {
    position: "absolute",
    top: 24,
    minWidth: 52,
    marginLeft: -26,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: "rgba(45, 212, 191, 0.94)",
    alignItems: "center",
  },
  approachDriverLabelText: {
    color: "#052a28",
    fontSize: 10,
    fontWeight: "900",
  },
  approachPinLabel: {
    color: "#082f49",
    fontSize: 12,
    fontWeight: "900",
  },
  approachMapCopy: {
    marginTop: 78,
    gap: 3,
  },
  approachHudRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 2,
  },
  approachHudLabel: {
    overflow: "hidden",
    borderRadius: 999,
    backgroundColor: "rgba(15, 23, 42, 0.5)",
    paddingHorizontal: 9,
    paddingVertical: 4,
    color: orbiTheme.colors.text,
    fontSize: 11,
    fontWeight: "800",
  },
  approachMapTitle: {
    color: orbiTheme.colors.text,
    fontSize: 16,
    fontWeight: "800",
  },
  approachMapMeta: {
    color: orbiTheme.colors.sky,
    fontWeight: "700",
  },
  approachSignalRow: {
    marginTop: 5,
    gap: 2,
  },
  approachSignalText: {
    color: orbiTheme.colors.muted,
    fontSize: 11,
    fontWeight: "700",
  },
  actionButtonDisabled: {
    opacity: 0.6,
  },
  tripCompletedActions: {
    flexDirection: "row",
    gap: 8,
    marginTop: 4,
    flexWrap: "wrap",
  },
  receiptButton: {
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 9,
    backgroundColor: "rgba(56, 189, 248, 0.12)",
    borderWidth: 1,
    borderColor: "rgba(56, 189, 248, 0.34)",
  },
  receiptButtonLabel: {
    color: orbiTheme.colors.sky,
    fontWeight: "800",
    fontSize: 13,
  },
  rateButton: {
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 9,
    backgroundColor: "rgba(45, 212, 191, 0.14)",
    borderWidth: 1,
    borderColor: "rgba(45, 212, 191, 0.38)",
  },
  rateButtonLabel: {
    color: orbiTheme.colors.teal,
    fontWeight: "800",
    fontSize: 13,
  },
  tripMap: {
    height: 220,
    borderRadius: 14,
    marginBottom: 12,
  },
});
