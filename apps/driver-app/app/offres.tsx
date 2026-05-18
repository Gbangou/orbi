import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  acceptRideRequestWithApi,
  declineDriverOfferWithApi,
  driverOffers,
  fetchDriverOffers,
  fetchDriverProfile,
  fetchMyTrips,
  fetchTripDetail,
  reportTripIncidentWithApi,
  triggerTripSafetySosWithApi,
  type DriverFatigueStatus,
  type DriverOffer,
  type MyTripsResponse,
  type TripDetailResponse,
  updateTripStatusWithApi,
  updateDriverAvailabilityWithApi,
  verifyPickupCodeWithApi,
} from "@orbi/api";
import {
  describeRealtimeEvent,
  describeRealtimeConnection,
  formatRealtimeBadgeLabel,
  formatOperationalStatus,
  formatXof,
  orbiTheme,
} from "@orbi/ui";
import {
  FlowActionButton,
  LiveRouteProgressCard,
  LiveStatusBanner,
  LiveTimeline,
  MetricTile,
  RouteSignalCard,
  TransitionNoticeCard,
} from "../lib/realtime-widgets";
import { restoreDriverSession } from "../lib/auth";
import { resolveDriverAppError } from "../lib/session-feedback";
import {
  formatReservationCountdown,
  useReservationExpiryRefresh,
  useReservationClock,
} from "../lib/offer-reservation";
import {
  buildDriverDispatchStatusLabel,
  buildDriverFlowTransitionLabel,
  buildDriverLiveRouteProgress,
  buildDriverMissionSnapshot,
  buildDriverNextActionHint,
  buildDriverRiderTrustSnapshot,
  resolveDriverActiveFlow,
  resolveDriverReservationChangeSet,
} from "../lib/driver-active-flow";
import {
  buildDriverFatigueMessage,
  buildDriverRouteSafetyBrief,
  buildDriverRouteMonitoringLines,
} from "../lib/driver-operational-signal";
import {
  buildDriverOfferDetailLines,
  formatDriverOfferFare,
  buildDriverOfferInsights,
  buildDriverOfferNote,
} from "../lib/offer-signal";
import { useDriverPresence } from "../lib/use-driver-presence";
import { useDriverRealtimeStream } from "../lib/use-driver-realtime-stream";
import { useLiveRefresh } from "../lib/use-live-refresh";
import { DriverJourneySection } from "../lib/driver-journey";
import { buildDriverShiftReadiness } from "../lib/driver-shift-readiness";
import {
  normalizePickupCode,
  validateOfferAction,
  validatePickupCode,
  validateTripAdvance,
} from "../lib/driver-action-safety";

const fallbackHistory: MyTripsResponse = {
  role: "DRIVER",
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

const fallbackFatigue: DriverFatigueStatus = {
  state: "clear",
  completedTrips: 0,
  drivingMinutes: 0,
  windowHours: 8,
  maxCompletedTrips: 8,
  maxDrivingMinutes: 300,
  restMinutes: 30,
  restUntil: null,
  reason: "Aucun signal fatigue bloquant sur la fenetre recente.",
};

function buildInitials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join("") || "OR"
  );
}

function formatOfferDistance(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value)
    ? `${value.toFixed(1)} km`
    : "Distance ND";
}

function MissionVehicleMark({
  category,
}: {
  category: DriverOffer["category"];
}) {
  const isMoto = category === "motorcycle";
  const accent = isMoto ? orbiTheme.colors.teal : orbiTheme.colors.sky;

  return (
    <View style={[styles.missionVehicleMark, { borderColor: accent }]}>
      {isMoto ? (
        <View style={styles.missionMoto}>
          <View style={[styles.missionMotoSeat, { backgroundColor: accent }]} />
          <View style={styles.missionWheelRow}>
            <View style={[styles.missionWheel, { borderColor: accent }]} />
            <View style={[styles.missionWheel, { borderColor: accent }]} />
          </View>
        </View>
      ) : (
        <View style={styles.missionCar}>
          <View style={[styles.missionCarBody, { backgroundColor: accent }]} />
          <View style={styles.missionWheelRow}>
            <View style={[styles.missionWheel, { borderColor: accent }]} />
            <View style={[styles.missionWheel, { borderColor: accent }]} />
          </View>
        </View>
      )}
    </View>
  );
}

function ActiveMissionMap({
  progressPercent,
  title,
  distanceLabel,
  stateLabel,
  isInProgress,
  etaLabel,
  freshnessLabel,
  coordinateLabel,
  accuracyLabel,
  speedLabel,
}: {
  progressPercent: number;
  title: string;
  distanceLabel: string;
  stateLabel: string;
  isInProgress: boolean;
  etaLabel?: string;
  freshnessLabel: string;
  coordinateLabel: string;
  accuracyLabel: string;
  speedLabel: string;
}) {
  const boundedProgress = Math.max(12, Math.min(88, progressPercent));
  const riderProgress = isInProgress ? 88 : 12;
  const accent = isInProgress ? orbiTheme.colors.sky : orbiTheme.colors.amber;
  const motion = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(motion, {
          toValue: 1,
          duration: 850,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(motion, {
          toValue: 0,
          duration: 850,
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
          outputRange: [1, 1.03],
        }),
      },
    ],
  };

  return (
    <View style={styles.activeMissionMap}>
      <View style={styles.activeMissionGridLine} />
      <View
        style={[
          styles.activeMissionGridLine,
          styles.activeMissionGridLineLower,
        ]}
      />
      <View style={[styles.activeMissionRoad, { backgroundColor: accent }]} />
      <Animated.View
        style={[
          styles.activeMissionRoadPulse,
          {
            backgroundColor: accent,
            opacity: motion.interpolate({
              inputRange: [0, 1],
              outputRange: [0.2, 0.58],
            }),
            transform: [
              {
                translateX: motion.interpolate({
                  inputRange: [0, 1],
                  outputRange: [-16, 24],
                }),
              },
            ],
          },
        ]}
      />
      <View style={styles.activeMissionRoadShadow} />
      <View style={styles.activeMissionTrail}>
        <View
          style={[styles.activeMissionTrailDot, { backgroundColor: accent }]}
        />
        <View
          style={[
            styles.activeMissionTrailDot,
            styles.activeMissionTrailDotMuted,
            { backgroundColor: accent },
          ]}
        />
        <View
          style={[
            styles.activeMissionTrailDot,
            styles.activeMissionTrailDotSoft,
            { backgroundColor: accent },
          ]}
        />
      </View>
      <View style={styles.activeMissionPickupPin}>
        <Text style={styles.activeMissionPinLabel}>P</Text>
      </View>
      <View style={styles.activeMissionDestinationPin}>
        <Text style={styles.activeMissionPinLabel}>
          {isInProgress ? "D" : "A"}
        </Text>
      </View>
      <View style={[styles.activeMissionRiderPin, { left: `${riderProgress}%` }]}>
        <Text style={styles.activeMissionRiderLabel}>Rider</Text>
      </View>
      <Animated.View
        style={[
          styles.activeMissionVehiclePin,
          { left: `${boundedProgress}%` },
          vehicleMotion,
        ]}
      >
        <View
          style={[
            styles.activeMissionVehicleCabin,
            { backgroundColor: accent },
          ]}
        />
        <View
          style={[styles.activeMissionVehicleBody, { backgroundColor: accent }]}
        >
          <View style={styles.activeMissionVehicleLight} />
          <View style={styles.activeMissionVehicleLight} />
        </View>
        <View style={styles.activeMissionWheelRow}>
          <View style={[styles.activeMissionWheel, { borderColor: accent }]} />
          <View style={[styles.activeMissionWheel, { borderColor: accent }]} />
        </View>
      </Animated.View>
      <Animated.View
        style={[
          styles.activeMissionDriverLabel,
          { left: `${boundedProgress}%` },
          vehicleMotion,
        ]}
      >
        <Text style={styles.activeMissionDriverLabelText}>Driver</Text>
      </Animated.View>
      <View style={styles.activeMissionMapCopy}>
        <View style={styles.activeMissionHudRow}>
          <Text style={styles.activeMissionHudLabel}>
            {etaLabel ?? "ETA mission"}
          </Text>
          <Text style={styles.activeMissionHudLabel}>{freshnessLabel}</Text>
          <Text style={styles.activeMissionHudLabel}>{accuracyLabel}</Text>
        </View>
        <Text style={styles.activeMissionMapTitle}>{title}</Text>
        <Text style={styles.activeMissionMapMeta}>
          {distanceLabel} - {stateLabel}
        </Text>
        <View style={styles.activeMissionSignalRow}>
          <Text style={styles.activeMissionSignalText}>{coordinateLabel}</Text>
          <Text style={styles.activeMissionSignalText}>
            {isInProgress ? "Rider vers destination" : "Rider au pickup"} -{" "}
            {speedLabel}
          </Text>
        </View>
      </View>
    </View>
  );
}

export default function OffersScreen() {
  const [offers, setOffers] = useState<DriverOffer[]>(driverOffers);
  const [history, setHistory] = useState<MyTripsResponse>(fallbackHistory);
  const [activeTripDetail, setActiveTripDetail] =
    useState<TripDetailResponse | null>(null);
  const [status, setStatus] = useState("Connexion au compte chauffeur...");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isRealtimeSyncing, setIsRealtimeSyncing] = useState(false);
  const [freshOfferIds, setFreshOfferIds] = useState<string[]>([]);
  const [recentlyExpiredCount, setRecentlyExpiredCount] = useState(0);
  const [activeTripTransitionLabel, setActiveTripTransitionLabel] = useState<
    string | null
  >(null);
  const [freshTimelineEventIds, setFreshTimelineEventIds] = useState<string[]>(
    [],
  );
  const [driverProfileStatus, setDriverProfileStatus] =
    useState<string>("OFFLINE");
  const [driverFatigue, setDriverFatigue] =
    useState<DriverFatigueStatus>(fallbackFatigue);
  const [pickupCodeInput, setPickupCodeInput] = useState("");
  const [tripDetailStatus, setTripDetailStatus] = useState<string | null>(null);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const previousVisibleOfferIdsRef = useRef<string[] | null>(null);
  const previousFlowStateRef = useRef<string | null>(null);
  const previousTimelineEventIdsRef = useRef<string[] | null>(null);
  const submissionLockRef = useRef(false);

  const loadDriverData = useCallback(async (silent = false) => {
    if (!silent) {
      setIsRefreshing(true);
    }

    try {
      const { authClient, session } = await restoreDriverSession();
      setSessionToken(session.sessionToken);
      const [offersResponse, historyResponse, profileResponse] =
        await Promise.all([
          fetchDriverOffers(authClient),
          fetchMyTrips(authClient),
          fetchDriverProfile(authClient),
        ]);
      setOffers(offersResponse);
      setHistory(historyResponse);
      setDriverProfileStatus(profileResponse.profile.status);
      setDriverFatigue(profileResponse.profile.fatigue);
      const flow = resolveDriverActiveFlow({
        history: historyResponse,
        offers: offersResponse,
        reservationNow: Date.now(),
        driverProfileStatus: profileResponse.profile.status,
      });
      const activeTrip = flow.activeTrip;

      if (activeTrip) {
        try {
          const detail = await fetchTripDetail(authClient, activeTrip.id);
          setActiveTripDetail(detail);
          setTripDetailStatus(null);
        } catch {
          setActiveTripDetail(null);
          setTripDetailStatus(
            "Detail de mission indisponible: le dispatch principal reste actif.",
          );
        }
      } else {
        setActiveTripDetail(null);
        setTripDetailStatus(null);
      }

      if (!silent) {
        setStatus(buildDriverDispatchStatusLabel({ flow }));
      }
    } catch (error) {
      const feedback = await resolveDriverAppError(error, {
        surface: "active-trip",
        network: "Preview locale active en attendant la connexion API.",
        fallback: "Preview locale active en attendant la connexion API.",
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
      setStatus(describeRealtimeEvent("driver", eventType));
      void loadDriverData(true);
    },
    {
      onHeartbeat: () => {
        setStatus(describeRealtimeConnection("driver", "active"));
      },
      onOpen: () => {
        setIsRealtimeSyncing(false);
        setStatus(describeRealtimeConnection("driver", "connected"));
      },
      onError: () => {
        setIsRealtimeSyncing(false);
        setStatus(describeRealtimeConnection("driver", "reconnecting"));
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
  const driverNextActionHint = buildDriverNextActionHint(flow);
  const driverMissionSnapshot = buildDriverMissionSnapshot({
    flow,
    tripDetail: activeTripDetail,
  });
  const driverRouteProgress = buildDriverLiveRouteProgress({
    flow,
    tripDetail: activeTripDetail,
  });
  const driverRouteSafetyBrief = useMemo(
    () =>
      buildDriverRouteSafetyBrief({
        routeMonitoring: activeTripDetail?.trip.routeMonitoring,
        now: reservationNow,
      }),
    [activeTripDetail, reservationNow],
  );
  const riderTrustSnapshot = buildDriverRiderTrustSnapshot({
    tripDetail: activeTripDetail,
  });
  const shiftReadiness = useMemo(
    () =>
      buildDriverShiftReadiness({
        flow,
        fatigue: driverFatigue,
      }),
    [driverFatigue, flow],
  );
  const { presenceNote } = useDriverPresence(
    flow.availabilityStatus === "ONLINE" || Boolean(activeTrip),
    activeTrip?.id,
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
        resolveDriverReservationChangeSet(
          previousVisibleOfferIds,
          nextVisibleOfferIds,
        );

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
      buildDriverFlowTransitionLabel(
        previousFlowState,
        activeFlowState,
        "offers",
      ),
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
      setActiveTripTransitionLabel(null);
    }, 5000);

    return () => clearTimeout(timeout);
  }, [freshTimelineEventIds]);

  async function runExclusiveDriverAction(action: () => Promise<void>) {
    if (submissionLockRef.current) {
      return;
    }

    submissionLockRef.current = true;
    setIsSubmitting(true);

    try {
      await action();
    } finally {
      submissionLockRef.current = false;
      setIsSubmitting(false);
    }
  }

  async function handleToggleAvailability() {
    await runExclusiveDriverAction(async () => {
      const nextStatus =
        flow.availabilityStatus === "ONLINE" ? "OFFLINE" : "ONLINE";
      setStatus(
        nextStatus === "ONLINE"
          ? "Passage en ligne du compte chauffeur..."
          : "Passage hors ligne du compte chauffeur...",
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
          surface: "driver-availability",
          fallback: "Le changement de disponibilite a echoue.",
        });

        if (feedback.shouldClearSessionToken) {
          setSessionToken(null);
        }

        setStatus(feedback.message);
      }
    });
  }

  async function handleAcceptOffer(rideRequestId: string) {
    const validation = validateOfferAction({
      activeTripId: activeTrip?.id,
      offer: visibleOffers.find((offer) => offer.id === rideRequestId),
      now: reservationNow,
    });
    if (!validation.ok) {
      setStatus(validation.message);
      return;
    }

    await runExclusiveDriverAction(async () => {
      setStatus("Acceptation de l offre et creation du trajet...");

      try {
        const { authClient } = await restoreDriverSession();
        const response = await acceptRideRequestWithApi(
          authClient,
          rideRequestId,
        );
        setStatus(
          `Trajet ${response.trip.id.slice(0, 8)} cree avec statut ${response.trip.status}.`,
        );
        await loadDriverData();
      } catch (error) {
        const feedback = await resolveDriverAppError(error, {
          surface: "booking",
          fallback: "L'acceptation de l'offre a echoue.",
        });

        if (feedback.shouldClearSessionToken) {
          setSessionToken(null);
        }

        setStatus(feedback.message);
      }
    });
  }

  async function handleDeclineOffer(rideRequestId: string) {
    const validation = validateOfferAction({
      activeTripId: activeTrip?.id,
      offer: visibleOffers.find((offer) => offer.id === rideRequestId),
      now: reservationNow,
    });
    if (!validation.ok) {
      setStatus(validation.message);
      return;
    }

    await runExclusiveDriverAction(async () => {
      setStatus(
        "Refus explicite de l offre et liberation de la reservation...",
      );

      try {
        const { authClient } = await restoreDriverSession();
        const response = await declineDriverOfferWithApi(
          authClient,
          rideRequestId,
        );
        setStatus(
          `Offre ${response.offer.rideRequestId.slice(0, 8)} refusee. Le dispatch memorise ce signal.`,
        );
        await loadDriverData();
      } catch (error) {
        const feedback = await resolveDriverAppError(error, {
          surface: "booking",
          fallback: "Le refus explicite de l'offre a echoue.",
        });

        if (feedback.shouldClearSessionToken) {
          setSessionToken(null);
        }

        setStatus(feedback.message);
      }
    });
  }

  async function handleAdvanceTrip(
    tripId: string,
    nextStatus: "DRIVER_ARRIVING" | "IN_PROGRESS" | "COMPLETED",
  ) {
    const validation = validateTripAdvance({
      blocksCompletion: driverRouteSafetyBrief.blocksCompletion,
      nextStatus,
    });
    if (!validation.ok) {
      setStatus(validation.message);
      return;
    }

    await runExclusiveDriverAction(async () => {
      setStatus(`Mise a jour du trajet vers ${nextStatus}...`);

      try {
        const { authClient } = await restoreDriverSession();
        const response = await updateTripStatusWithApi(
          authClient,
          tripId,
          nextStatus,
        );
        setStatus(
          `Trajet ${response.trip.id.slice(0, 8)} mis a jour: ${response.trip.status}.`,
        );
        await loadDriverData();
      } catch (error) {
        const feedback = await resolveDriverAppError(error, {
          surface: "active-trip",
          fallback: "La mise a jour du trajet a echoue.",
        });

        if (feedback.shouldClearSessionToken) {
          setSessionToken(null);
        }

        setStatus(feedback.message);
      }
    });
  }

  async function handleVerifyPickupCode(tripId: string, pickupCode: string) {
    const normalizedPickupCode = normalizePickupCode(pickupCode);
    const validation = validatePickupCode(normalizedPickupCode);
    if (!validation.ok) {
      setStatus(validation.message);
      return;
    }

    await runExclusiveDriverAction(async () => {
      setStatus("Verification du code de prise en charge...");

      try {
        const { authClient } = await restoreDriverSession();
        const response = await verifyPickupCodeWithApi(
          authClient,
          tripId,
          normalizedPickupCode,
        );
        setPickupCodeInput("");
        setStatus(
          `Code valide. Trajet ${response.trip.id.slice(0, 8)} demarre.`,
        );
        await loadDriverData();
      } catch (error) {
        const feedback = await resolveDriverAppError(error, {
          surface: "active-trip",
          fallback: "Code incorrect ou verification impossible.",
        });

        if (feedback.shouldClearSessionToken) {
          setSessionToken(null);
        }

        setStatus(feedback.message);
      }
    });
  }

  function handlePickupCodeChange(value: string) {
    setPickupCodeInput(normalizePickupCode(value));
  }

  async function handleReportIncident(tripId: string) {
    await runExclusiveDriverAction(async () => {
      setStatus("Signalement de l incident a l equipe operations...");

      try {
        const { authClient } = await restoreDriverSession();
        await reportTripIncidentWithApi(authClient, tripId, {
          incidentType: "DRIVER_ALERT",
          details: "Signalement rapide envoye depuis l ecran chauffeur.",
          priority: 3,
        });
        setStatus("Incident signale. Le support live a ete notifie.");
        await loadDriverData();
      } catch (error) {
        const feedback = await resolveDriverAppError(error, {
          surface: "safety",
          fallback: "Le signalement de l'incident a echoue.",
        });

        if (feedback.shouldClearSessionToken) {
          setSessionToken(null);
        }

        setStatus(feedback.message);
      }
    });
  }

  async function handleDeclareIncidentEvidence(tripId: string) {
    await runExclusiveDriverAction(async () => {
      setStatus("Declaration de preuve volontaire chauffeur...");

      try {
        const { authClient } = await restoreDriverSession();
        await reportTripIncidentWithApi(authClient, tripId, {
          incidentType: "DRIVER_VOLUNTARY_EVIDENCE",
          details:
            "Preuve conservee localement par le chauffeur. Upload support uniquement sur action explicite.",
          priority: 3,
          evidenceConsent: true,
          evidenceType: "AUDIO",
          evidenceRetentionHours: 24,
        });
        setStatus(
          "Preuve volontaire declaree. Aucun fichier n a ete envoye automatiquement.",
        );
        await loadDriverData();
      } catch (error) {
        const feedback = await resolveDriverAppError(error, {
          surface: "safety",
          fallback: "La preuve volontaire chauffeur n'a pas pu etre declaree.",
        });

        if (feedback.shouldClearSessionToken) {
          setSessionToken(null);
        }

        setStatus(feedback.message);
      }
    });
  }

  async function handleTriggerSos(tripId: string) {
    await runExclusiveDriverAction(async () => {
      setStatus("SOS chauffeur en cours: notification operations...");

      try {
        const { authClient } = await restoreDriverSession();
        const response = await triggerTripSafetySosWithApi(authClient, tripId, {
          details: "SOS declenche depuis le cockpit chauffeur.",
        });

        setStatus(
          `SOS envoye au support. Appel local ${response.sos.localEmergencyNumber} disponible.`,
        );
        void Linking.openURL(`tel:${response.sos.localEmergencyNumber}`);
        await loadDriverData();
      } catch (error) {
        const feedback = await resolveDriverAppError(error, {
          surface: "safety",
          fallback: "Le SOS chauffeur n'a pas pu etre envoye.",
        });

        if (feedback.shouldClearSessionToken) {
          setSessionToken(null);
        }

        setStatus(feedback.message);
      }
    });
  }

  function renderActiveTripAction() {
    if (!activeTrip) {
      return null;
    }

    if (activeTrip.status === "MATCHED") {
      return (
        <FlowActionButton
          disabled={isSubmitting}
          label="Signaler l arrivee"
          onPress={() => handleAdvanceTrip(activeTrip.id, "DRIVER_ARRIVING")}
          tone="amber"
          emphasis="primary"
          style={isSubmitting ? styles.disabled : null}
        />
      );
    }

    if (activeTrip.status === "DRIVER_ARRIVING") {
      return (
        <View style={styles.codeBlock}>
          <Text style={styles.meta}>
            Saisir le code donne par le passager avant de demarrer.
          </Text>
          <TextInput
            value={pickupCodeInput}
            onChangeText={handlePickupCodeChange}
            placeholder="Code a 4 chiffres"
            placeholderTextColor={orbiTheme.colors.muted}
            keyboardType="number-pad"
            maxLength={4}
            style={styles.codeInput}
          />
          <FlowActionButton
            disabled={isSubmitting || pickupCodeInput.length !== 4}
            label="Verifier le code et demarrer"
            onPress={() =>
              handleVerifyPickupCode(activeTrip.id, pickupCodeInput)
            }
            tone="amber"
            emphasis="primary"
            style={
              isSubmitting || pickupCodeInput.length !== 4
                ? styles.disabled
                : null
            }
          />
        </View>
      );
    }

    if (activeTrip.status === "IN_PROGRESS") {
      return (
        <View style={styles.codeBlock}>
          <FlowActionButton
            disabled={isSubmitting || driverRouteSafetyBrief.blocksCompletion}
            label={
              driverRouteSafetyBrief.blocksCompletion
                ? "Finalisation bloquee par Ride Check"
                : "Terminer la course"
            }
            onPress={() => handleAdvanceTrip(activeTrip.id, "COMPLETED")}
            tone="amber"
            emphasis="primary"
            style={
              isSubmitting || driverRouteSafetyBrief.blocksCompletion
                ? styles.disabled
                : null
            }
          />
          {driverRouteSafetyBrief.blocksCompletion ? (
            <Text style={styles.routeSafetyBlockNote}>
              {driverRouteSafetyBrief.actionLabel}
            </Text>
          ) : null}
        </View>
      );
    }

    return null;
  }

  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <Text style={styles.title}>Offres de course</Text>
      <LiveStatusBanner
        label={formatRealtimeBadgeLabel("Direct", isRealtimeSyncing)}
        message={status}
        secondaryMessage={
          isRealtimeSyncing
            ? "Mise a jour silencieuse en cours pour absorber les derniers evenements."
            : presenceNote
        }
        tone={isRealtimeSyncing ? "sky" : "teal"}
      />
      <View style={styles.snapshotRow}>
        <MetricTile label="Mission" value={flow.primaryStatusLabel} />
        <MetricTile
          label="Reservations"
          value={String(flow.visibleOfferCount)}
        />
        <MetricTile
          label="Profil"
          value={formatOperationalStatus(driverProfileStatus)}
        />
        <MetricTile
          label="Fatigue"
          value={
            driverFatigue.state === "blocked"
              ? "Pause"
              : driverFatigue.state === "warning"
                ? "A surveiller"
                : "OK"
          }
        />
      </View>
      {driverFatigue.state !== "clear" ? (
        <TransitionNoticeCard
          label={
            driverFatigue.state === "blocked"
              ? "Pause obligatoire"
              : "Pause conseillee"
          }
          message={buildDriverFatigueMessage(driverFatigue)}
          tone={driverFatigue.state === "blocked" ? "rose" : "amber"}
        />
      ) : null}
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
      {freshOfferIds.length ? (
        <TransitionNoticeCard
          label={
            freshOfferIds.length > 1
              ? `${freshOfferIds.length} nouvelles offres live`
              : "Nouvelle offre live"
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
              : "Une reservation a expire"
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
      {flow.operationalStatus === "SUSPENDED" ? (
        <Text style={styles.subtitle}>
          Le compte est suspendu. Les actions dispatch sont verrouillees jusqu a
          reactivation operations.
        </Text>
      ) : driverProfileStatus === "BUSY" ? (
        <Text style={styles.subtitle}>
          Le chauffeur reste visible pour le suivi course avec un statut occupe.
        </Text>
      ) : null}
      <Pressable
        onPress={() => void loadDriverData()}
        disabled={isRefreshing || isSubmitting}
        style={[
          styles.refreshButton,
          isRefreshing || isSubmitting ? styles.disabled : null,
        ]}
      >
        <Text style={styles.refreshButtonLabel}>
          {isRefreshing ? "Actualisation..." : "Actualiser le direct"}
        </Text>
      </Pressable>
      <Pressable
        onPress={() => void handleToggleAvailability()}
        disabled={isSubmitting || flow.availabilityLocked}
        style={[
          styles.toggleButton,
          flow.availabilityStatus === "ONLINE"
            ? styles.toggleButtonOffline
            : styles.toggleButtonOnline,
          isSubmitting || flow.availabilityLocked ? styles.disabled : null,
        ]}
      >
        <Text
          style={[
            styles.toggleButtonLabel,
            flow.availabilityStatus === "ONLINE"
              ? styles.toggleButtonLabelOffline
              : styles.toggleButtonLabelOnline,
          ]}
        >
          {activeTrip
            ? "Disponibilite verrouillee pendant la course"
            : flow.operationalStatus === "SUSPENDED"
              ? "Suspension geree par les operations"
              : flow.availabilityStatus === "ONLINE"
                ? "Passer hors ligne"
                : "Passer en ligne"}
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
                : "Evenement live"
              : activeTripTransitionLabel
                ? "Transition live"
                : null
          }
          badgeTone="sky"
          title={
            flow.primaryRouteLabel ??
            `${activeTrip.pickupAddress} vers ${activeTrip.destinationAddress}`
          }
          description={`Client: ${activeTrip.counterpartyName ?? "Affecte"}${activeTrip.vehicleLabel ? ` - Vehicule: ${activeTrip.vehicleLabel}` : ""}`}
          insights={[
            {
              label: "Statut",
              value: flow.primaryStatusLabel,
              tone: "amber",
            },
            {
              label: "Profil",
              value: formatOperationalStatus(driverProfileStatus),
              tone: "teal",
            },
          ]}
          detailLines={[
            `Statut: ${activeTrip.status}`,
            "Monitoring route actif cote operations pendant la mission.",
            ...buildDriverRouteMonitoringLines(
              activeTripDetail?.trip.routeMonitoring,
            ),
          ]}
          note={
            activeTrip.pickupCode
              ? "Le passager doit vous communiquer un code a 4 chiffres."
              : null
          }
          noteTone="amber"
          isHighlighted={Boolean(
            activeTripTransitionLabel || freshTimelineEventIds.length,
          )}
        >
          <TransitionNoticeCard
            label="Prochaine action"
            message={driverNextActionHint}
            tone={activeTrip.status === "IN_PROGRESS" ? "sky" : "amber"}
          />
          <RouteSignalCard
            eyebrow={driverRouteSafetyBrief.eyebrow}
            badgeLabel={
              driverRouteSafetyBrief.blocksCompletion
                ? "Finalisation bloquee"
                : "Controle actif"
            }
            badgeTone={driverRouteSafetyBrief.tone}
            title={driverRouteSafetyBrief.title}
            description={driverRouteSafetyBrief.description}
            insights={driverRouteSafetyBrief.insights}
            note={driverRouteSafetyBrief.actionLabel}
            noteTone={driverRouteSafetyBrief.tone}
            isHighlighted={driverRouteSafetyBrief.blocksCompletion}
          />
          <Text style={styles.snapshotTitle}>Mission en direct</Text>
          <View style={styles.snapshotStrip}>
            {driverMissionSnapshot.map((item) => (
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
          {riderTrustSnapshot ? (
            <View style={styles.trustCard}>
              <View style={styles.identityRow}>
                <View style={styles.avatarFallback}>
                  <Text style={styles.avatarInitials}>
                    {riderTrustSnapshot.initials}
                  </Text>
                </View>
                <View style={styles.identityCopy}>
                  <Text style={styles.identityTitle}>
                    {riderTrustSnapshot.riderName}
                  </Text>
                  <Text style={styles.identityMeta}>
                    {riderTrustSnapshot.routeLabel}
                  </Text>
                  <Text style={styles.identityMeta}>
                    Vehicule mission: {riderTrustSnapshot.vehicleLabel}
                  </Text>
                </View>
              </View>
              <View style={styles.identityDetails}>
                <MetricTile
                  label="Tarif"
                  value={riderTrustSnapshot.fareLabel}
                  helper="Montant verrouille sur la mission"
                />
                <MetricTile
                  label="Client"
                  value="Verifie"
                  helper="Compte passager authentifie"
                />
              </View>
            </View>
          ) : null}
          {driverRouteProgress ? (
            <>
              <ActiveMissionMap
                progressPercent={driverRouteProgress.progressPercent}
                title={driverRouteProgress.title}
                distanceLabel={driverRouteProgress.distanceLabel}
                stateLabel={driverRouteProgress.stateLabel}
                isInProgress={activeTrip.status === "IN_PROGRESS"}
                etaLabel={driverRouteProgress.etaLabel}
                freshnessLabel={driverRouteProgress.freshnessLabel}
                coordinateLabel={driverRouteProgress.coordinateLabel}
                accuracyLabel={driverRouteProgress.accuracyLabel}
                speedLabel={driverRouteProgress.speedLabel}
              />
              <LiveRouteProgressCard {...driverRouteProgress} />
            </>
          ) : null}
          {activeTripTransitionLabel ? (
            <Text style={styles.transitionInlineLabel}>
              {activeTripTransitionLabel}
            </Text>
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
            label="SOS securite"
            onPress={() => handleTriggerSos(activeTrip.id)}
            emphasis="primary"
            style={isSubmitting ? styles.disabled : null}
          />
          <FlowActionButton
            disabled={isSubmitting}
            label="Signaler un incident"
            onPress={() => handleReportIncident(activeTrip.id)}
            emphasis="secondary"
            style={isSubmitting ? styles.disabled : null}
          />
          <FlowActionButton
            disabled={isSubmitting}
            label="Preuve volontaire"
            onPress={() => handleDeclareIncidentEvidence(activeTrip.id)}
            emphasis="secondary"
            style={isSubmitting ? styles.disabled : null}
          />
        </RouteSignalCard>
      ) : null}
      {flow.operationalStatus === "SUSPENDED" && !activeTrip ? (
        <RouteSignalCard
          eyebrow="Dispatch"
          title="Compte suspendu"
          description="Le dispatch reste coupe pendant que les operations traitent la suspension du compte."
          insights={[
            { label: "Profil", value: "Suspendu", tone: "rose" },
            { label: "Flux", value: "Bloque", tone: "amber" },
          ]}
          note="Les reservations reapparaitront automatiquement apres reactivation."
          noteTone="rose"
        />
      ) : flow.availabilityStatus !== "ONLINE" && !activeTrip ? (
        <RouteSignalCard
          eyebrow="Dispatch"
          title="Mode hors ligne"
          description="Activez votre disponibilite pour voir et accepter les demandes."
          insights={[
            { label: "Statut", value: "Hors ligne", tone: "amber" },
            { label: "Flux", value: "Suspendu", tone: "rose" },
          ]}
          note="Les reservations reviendront automatiquement dans cette liste apres reactivation."
          noteTone="amber"
        />
      ) : null}
      {visibleOffers.map((offer) => {
        const offerNote = buildDriverOfferNote(offer);
        const riderInitials = buildInitials(offer.riderName);

        return (
          <RouteSignalCard
            key={offer.id}
            eyebrow={
              freshOfferIds.includes(offer.id)
                ? "Nouvelle reservation live"
                : "Offre reservee"
            }
            badgeLabel={
              offer.reservationExpiresAt
                ? `Reservation ${formatReservationCountdown(offer.reservationExpiresAt, reservationNow)}`
                : null
            }
            badgeTone={freshOfferIds.includes(offer.id) ? "sky" : "amber"}
            title={offer.riderName}
            titleAside={formatDriverOfferFare(offer)}
            titleAsideColor={orbiTheme.colors.amber}
            description={`${offer.pickup} vers ${offer.destination}`}
            insights={buildDriverOfferInsights(offer)}
            detailLines={buildDriverOfferDetailLines(offer)}
            note={offerNote?.text}
            noteTone={offerNote?.tone ?? "sky"}
            isHighlighted={freshOfferIds.includes(offer.id)}
          >
            <View style={styles.offerMissionCard}>
              <View style={styles.offerMissionTop}>
                <View style={styles.offerRiderAvatar}>
                  <Text style={styles.offerRiderInitials}>{riderInitials}</Text>
                </View>
                <View style={styles.offerMissionCopy}>
                  <Text style={styles.offerMissionTitle}>
                    {offer.riderName}
                  </Text>
                  <Text style={styles.offerMissionMeta}>
                    {offer.pickup} vers {offer.destination}
                  </Text>
                </View>
                <MissionVehicleMark category={offer.category} />
              </View>
              <View style={styles.offerMissionRail}>
                <View style={styles.offerMissionDot} />
                <View style={styles.offerMissionLine} />
                <View
                  style={[styles.offerMissionDot, styles.offerMissionDotEnd]}
                />
              </View>
              <View style={styles.offerMissionMetrics}>
                <MetricTile
                  label="Pickup"
                  value={formatOfferDistance(offer.pickupDistanceKm)}
                  helper={`${Math.round(offer.etaToPickupMinutes)} min estime`}
                />
                <MetricTile
                  label="Trajet"
                  value={formatOfferDistance(offer.distanceKm)}
                  helper={
                    offer.category === "motorcycle"
                      ? "Mission moto"
                      : "Mission voiture"
                  }
                />
                <MetricTile
                  label="Net"
                  value={
                    typeof offer.driverPayout === "number"
                      ? formatXof(offer.driverPayout)
                      : formatDriverOfferFare(offer)
                  }
                  helper="Gain chauffeur estime"
                />
              </View>
            </View>
            <View style={styles.offerActionRow}>
              <FlowActionButton
                disabled={isSubmitting || Boolean(activeTrip)}
                label={
                  activeTrip
                    ? "Une course est deja en cours"
                    : "Accepter cette offre"
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
            { label: "Statut", value: "En ligne", tone: "teal" },
            { label: "Attente", value: "Aucune offre", tone: "sky" },
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
    backgroundColor: orbiTheme.colors.background,
    gap: 14,
  },
  title: {
    color: orbiTheme.colors.text,
    fontSize: 32,
    fontWeight: "800",
  },
  subtitle: {
    color: orbiTheme.colors.muted,
  },
  snapshotRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  refreshButton: {
    alignSelf: "flex-start",
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: orbiTheme.colors.backgroundAlt,
    borderWidth: 1,
    borderColor: orbiTheme.colors.border,
  },
  refreshButtonLabel: {
    color: orbiTheme.colors.text,
    fontWeight: "700",
    fontSize: 13,
  },
  toggleButton: {
    alignSelf: "flex-start",
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
  },
  toggleButtonOnline: {
    backgroundColor: "rgba(45, 212, 191, 0.16)",
    borderColor: orbiTheme.colors.teal,
  },
  toggleButtonOffline: {
    backgroundColor: "rgba(245, 158, 11, 0.16)",
    borderColor: orbiTheme.colors.amber,
  },
  toggleButtonLabel: {
    fontWeight: "700",
    fontSize: 13,
  },
  toggleButtonLabelOnline: {
    color: orbiTheme.colors.teal,
  },
  toggleButtonLabelOffline: {
    color: orbiTheme.colors.amber,
  },
  transitionInlineLabel: {
    color: orbiTheme.colors.sky,
    fontWeight: "700",
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
    backgroundColor: "rgba(56, 189, 248, 0.16)",
    borderWidth: 1,
    borderColor: "rgba(56, 189, 248, 0.36)",
  },
  avatarInitials: {
    color: orbiTheme.colors.sky,
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
  activeMissionMap: {
    minHeight: 154,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(56, 189, 248, 0.32)",
    backgroundColor: "rgba(8, 47, 73, 0.18)",
    overflow: "hidden",
    justifyContent: "center",
    padding: 16,
  },
  activeMissionGridLine: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 34,
    height: 1,
    backgroundColor: "rgba(148, 163, 184, 0.13)",
  },
  activeMissionGridLineLower: {
    top: 116,
  },
  activeMissionRoad: {
    position: "absolute",
    left: 24,
    right: 24,
    top: 72,
    height: 8,
    borderRadius: 999,
    opacity: 0.45,
  },
  activeMissionRoadPulse: {
    position: "absolute",
    left: 56,
    top: 71,
    width: 68,
    height: 10,
    borderRadius: 999,
  },
  activeMissionRoadShadow: {
    position: "absolute",
    left: 34,
    right: 34,
    top: 88,
    height: 2,
    borderRadius: 999,
    backgroundColor: "rgba(148, 163, 184, 0.28)",
  },
  activeMissionTrail: {
    position: "absolute",
    left: 54,
    right: 54,
    top: 68,
    height: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
  },
  activeMissionTrailDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  activeMissionTrailDotMuted: {
    opacity: 0.46,
  },
  activeMissionTrailDotSoft: {
    opacity: 0.28,
  },
  activeMissionPickupPin: {
    position: "absolute",
    left: 18,
    top: 58,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: orbiTheme.colors.teal,
  },
  activeMissionDestinationPin: {
    position: "absolute",
    right: 18,
    top: 58,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: orbiTheme.colors.amber,
  },
  activeMissionRiderPin: {
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
  activeMissionRiderLabel: {
    color: "#3b2205",
    fontSize: 10,
    fontWeight: "900",
  },
  activeMissionDriverLabel: {
    position: "absolute",
    top: 24,
    minWidth: 52,
    marginLeft: -26,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: "rgba(56, 189, 248, 0.94)",
    alignItems: "center",
  },
  activeMissionDriverLabelText: {
    color: "#082f49",
    fontSize: 10,
    fontWeight: "900",
  },
  activeMissionPinLabel: {
    color: "#052a28",
    fontSize: 12,
    fontWeight: "900",
  },
  activeMissionVehiclePin: {
    position: "absolute",
    top: 42,
    width: 52,
    marginLeft: -26,
    alignItems: "center",
  },
  activeMissionVehicleCabin: {
    width: 24,
    height: 12,
    borderTopLeftRadius: 9,
    borderTopRightRadius: 9,
    opacity: 0.74,
    marginBottom: -2,
  },
  activeMissionVehicleBody: {
    width: 46,
    height: 24,
    borderRadius: 9,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 6,
  },
  activeMissionVehicleLight: {
    width: 6,
    height: 4,
    borderRadius: 3,
    backgroundColor: "rgba(255, 255, 255, 0.76)",
  },
  activeMissionWheelRow: {
    width: 38,
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: -5,
  },
  activeMissionWheel: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
    backgroundColor: orbiTheme.colors.background,
  },
  activeMissionMapCopy: {
    marginTop: 88,
    gap: 3,
  },
  activeMissionHudRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 2,
  },
  activeMissionHudLabel: {
    overflow: "hidden",
    borderRadius: 999,
    backgroundColor: "rgba(15, 23, 42, 0.5)",
    paddingHorizontal: 9,
    paddingVertical: 4,
    color: orbiTheme.colors.text,
    fontSize: 11,
    fontWeight: "800",
  },
  activeMissionMapTitle: {
    color: orbiTheme.colors.text,
    fontSize: 16,
    fontWeight: "900",
  },
  activeMissionMapMeta: {
    color: orbiTheme.colors.sky,
    fontWeight: "700",
  },
  activeMissionSignalRow: {
    marginTop: 5,
    gap: 2,
  },
  activeMissionSignalText: {
    color: orbiTheme.colors.muted,
    fontSize: 11,
    fontWeight: "700",
  },
  codeBlock: {
    gap: 10,
  },
  codeInput: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: orbiTheme.colors.border,
    backgroundColor: orbiTheme.colors.panel,
    color: orbiTheme.colors.text,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: 4,
  },
  meta: {
    color: orbiTheme.colors.muted,
  },
  routeSafetyBlockNote: {
    color: orbiTheme.colors.rose,
    fontWeight: "700",
    lineHeight: 19,
  },
  offerMissionCard: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: orbiTheme.colors.border,
    backgroundColor: orbiTheme.colors.backgroundAlt,
    padding: 14,
    gap: 12,
  },
  offerMissionTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  offerRiderAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(245, 158, 11, 0.14)",
    borderWidth: 1,
    borderColor: "rgba(245, 158, 11, 0.34)",
  },
  offerRiderInitials: {
    color: orbiTheme.colors.amber,
    fontWeight: "900",
    fontSize: 16,
  },
  offerMissionCopy: {
    flex: 1,
    gap: 3,
  },
  offerMissionTitle: {
    color: orbiTheme.colors.text,
    fontWeight: "900",
    fontSize: 17,
  },
  offerMissionMeta: {
    color: orbiTheme.colors.muted,
    lineHeight: 18,
  },
  missionVehicleMark: {
    width: 52,
    height: 44,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: orbiTheme.colors.panel,
  },
  missionMoto: {
    width: 36,
    height: 24,
    justifyContent: "flex-end",
  },
  missionMotoSeat: {
    width: 24,
    height: 7,
    borderRadius: 999,
    marginLeft: 6,
    marginBottom: 3,
  },
  missionCar: {
    width: 38,
    height: 24,
    justifyContent: "flex-end",
  },
  missionCarBody: {
    width: 36,
    height: 13,
    borderRadius: 7,
    alignSelf: "center",
    marginBottom: -3,
  },
  missionWheelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  missionWheel: {
    width: 11,
    height: 11,
    borderRadius: 6,
    borderWidth: 2,
    backgroundColor: orbiTheme.colors.background,
  },
  offerMissionRail: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  offerMissionDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: orbiTheme.colors.teal,
  },
  offerMissionDotEnd: {
    backgroundColor: orbiTheme.colors.sky,
  },
  offerMissionLine: {
    flex: 1,
    height: 2,
    borderRadius: 999,
    backgroundColor: orbiTheme.colors.border,
  },
  offerMissionMetrics: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  offerActionRow: {
    flexDirection: "row",
    gap: 10,
  },
  offerAction: {
    flex: 1,
  },
  disabled: {
    opacity: 0.6,
  },
});
