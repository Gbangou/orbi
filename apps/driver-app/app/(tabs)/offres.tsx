import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  acceptRideRequestWithApi,
  declineDriverOfferWithApi,
  fetchDriverOffers,
  fetchDriverProfile,
  fetchMyTrips,
  fetchTripDetail,
  reportTripIncidentWithApi,
  triggerTripSafetySosWithApi,
  withNetworkRetry,
  type DriverFatigueStatus,
  type DriverOffer,
  type MyTripsResponse,
  type TripDetailResponse,
  updateTripStatusWithApi,
  verifyPickupCodeWithApi,
} from "@orbi/api";
import {
  describeRealtimeEvent,
  describeRealtimeConnection,
  formatXof,
  orbiCopy,
  orbiTheme,
} from "@orbi/ui";
import {
  FlowActionButton,
  LiveTimeline,
  TransitionNoticeCard,
} from "../../lib/realtime-widgets";
import { OfferCard } from "../../lib/offer-card";
import { restoreDriverSession } from "../../lib/auth";
import { resolveDriverAppError } from "../../lib/session-feedback";
import {
  useReservationExpiryRefresh,
  useReservationClock,
} from "../../lib/offer-reservation";
import {
  buildDriverDispatchStatusLabel,
  buildDriverFlowTransitionLabel,
  buildDriverLiveRouteProgress,
  buildDriverMissionSnapshot,
  buildDriverNextActionHint,
  buildDriverRiderTrustSnapshot,
  resolveDriverActiveFlow,
  resolveDriverReservationChangeSet,
} from "../../lib/driver-active-flow";
import { buildDriverShiftReadiness } from "../../lib/driver-shift-readiness";
import {
  buildDriverFatigueMessage,
  buildDriverRouteSafetyBrief,
  buildDriverRouteMonitoringLines,
} from "../../lib/driver-operational-signal";
import { useDriverPresence } from "../../lib/use-driver-presence";
import { useDriverRealtimeStream } from "../../lib/use-driver-realtime-stream";
import { TripMapView } from "../../lib/trip-map-view";
import { ApproachMapView } from "../../lib/approach-map-view";
import { useLiveRefresh } from "../../lib/use-live-refresh";
import {
  normalizePickupCode,
  validateOfferAction,
  validatePickupCode,
  validateTripAdvance,
} from "../../lib/driver-action-safety";

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

export default function OffersScreen() {
  const [offers, setOffers] = useState<DriverOffer[]>([]);
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
  const [completionFlash, setCompletionFlash] = useState<{
    fareLabel: string;
    netLabel: string;
  } | null>(null);
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
      const onRetry = (attempt: number, max: number) =>
        setStatus(`Reconnexion... (tentative ${attempt}/${max})`);
      const [offersResponse, historyResponse, profileResponse] =
        await Promise.all([
          withNetworkRetry(() => fetchDriverOffers(authClient), { maxAttempts: 3, onRetry }),
          withNetworkRetry(() => fetchMyTrips(authClient), { maxAttempts: 3, onRetry }),
          withNetworkRetry(() => fetchDriverProfile(authClient), { maxAttempts: 3, onRetry }),
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
          const detail = await withNetworkRetry(
            () => fetchTripDetail(authClient, activeTrip.id),
            {
              maxAttempts: 3,
              onRetry: (attempt, max) =>
                setStatus(`Reconnexion mission... (tentative ${attempt}/${max})`),
            },
          );
          setActiveTripDetail(detail);
          setTripDetailStatus(null);
        } catch {
          setActiveTripDetail(null);
          setTripDetailStatus(
            "Detail de mission indisponible: la course principale reste active.",
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
        network: orbiCopy.driverNetworkUnavailable,
        fallback: orbiCopy.serviceUnavailable,
      });

      if (feedback.shouldClearSessionToken) {
        setSessionToken(null);
      }

      if (!silent) {
        setStatus(feedback.message);
      }
      setOffers([]);
      setHistory(fallbackHistory);
      setActiveTripDetail(null);
      setDriverProfileStatus("OFFLINE");
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
    () => buildDriverShiftReadiness({ flow, fatigue: driverFatigue }),
    [driverFatigue, flow],
  );
  const driverRouteProgress = buildDriverLiveRouteProgress({
    flow,
    tripDetail: activeTripDetail,
  });
  const driverMissionSnapshot = buildDriverMissionSnapshot({ flow, tripDetail: activeTripDetail });
  const driverNextActionHint = buildDriverNextActionHint(flow);
  const routeMonitoringLines = buildDriverRouteMonitoringLines(
    activeTripDetail?.trip.routeMonitoring,
  );
  const { latestPosition: driverGpsPosition } = useDriverPresence(
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

  useEffect(() => {
    if (!completionFlash) {
      return;
    }

    const timeout = setTimeout(() => {
      setCompletionFlash(null);
    }, 12000);

    return () => clearTimeout(timeout);
  }, [completionFlash]);

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
      setStatus("Refus de l offre en cours...");

      try {
        const { authClient } = await restoreDriverSession();
        const response = await declineDriverOfferWithApi(
          authClient,
          rideRequestId,
        );
        setStatus(
          `Offre ${response.offer.rideRequestId.slice(0, 8)} refusee. Votre prochaine proposition sera ajustee.`,
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
        if (nextStatus === "COMPLETED" && typeof response.trip.actualFare === "number") {
          const gross = response.trip.actualFare;
          const net = Math.round(gross * 0.82);
          setCompletionFlash({
            fareLabel: formatXof(gross),
            netLabel: formatXof(net),
          });
        }
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

  function handleDriverCancelTrip(tripId: string) {
    const REASONS = [
      "Passager introuvable",
      "Zone inaccessible",
      "Erreur d acceptation",
    ];

    Alert.alert(
      "Annuler la course",
      "Motif de l annulation ?",
      [
        ...REASONS.map((reason) => ({
          text: reason,
          onPress: () => void doDriverCancelTrip(tripId, reason),
        })),
        { text: "Ne pas annuler", style: "cancel" as const },
      ],
    );
  }

  async function doDriverCancelTrip(tripId: string, reason: string) {
    await runExclusiveDriverAction(async () => {
      setStatus("Annulation de la course en cours...");
      try {
        const { authClient } = await restoreDriverSession();
        await updateTripStatusWithApi(authClient, tripId, "CANCELLED", reason);
        setStatus("Course annulee. Vous repassez disponible.");
        await loadDriverData();
      } catch (error) {
        const feedback = await resolveDriverAppError(error, {
          surface: "active-trip",
          fallback: "L annulation de la course a echoue.",
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
        <>
          <FlowActionButton
            disabled={isSubmitting}
            label="Signaler l arrivee"
            onPress={() => handleAdvanceTrip(activeTrip.id, "DRIVER_ARRIVING")}
            tone="amber"
            emphasis="primary"
            style={isSubmitting ? styles.disabled : null}
          />
          <FlowActionButton
            disabled={isSubmitting}
            label="Annuler la course"
            onPress={() => handleDriverCancelTrip(activeTrip.id)}
            emphasis="secondary"
            style={isSubmitting ? styles.disabled : null}
          />
        </>
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
          <FlowActionButton
            disabled={isSubmitting}
            label="Annuler (passager absent)"
            onPress={() => handleDriverCancelTrip(activeTrip.id)}
            emphasis="secondary"
            style={isSubmitting ? styles.disabled : null}
          />
        </View>
      );
    }

    if (activeTrip.status === "IN_PROGRESS") {
      return (
        <View style={styles.codeBlock}>
          <FlowActionButton
            disabled={isSubmitting}
            label="Terminer la course"
            onPress={() => handleAdvanceTrip(activeTrip.id, "COMPLETED")}
            tone="amber"
            emphasis="primary"
            style={isSubmitting ? styles.disabled : null}
          />
          {driverRouteSafetyBrief.blocksCompletion ? (
            <Text style={styles.routeSafetyBlockNote}>
              GPS requis: {driverRouteSafetyBrief.actionLabel}
            </Text>
          ) : null}
        </View>
      );
    }

    return null;
  }

  return (
    <SafeAreaView style={styles.safe}>
      {/* ── Header ── */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Missions</Text>
        <View style={styles.headerRight}>
          {isRealtimeSyncing ? (
            <ActivityIndicator size="small" color={orbiTheme.colors.amber} />
          ) : null}
          <View
            style={[
              styles.onlineDot,
              {
                backgroundColor:
                  flow.availabilityStatus === "ONLINE"
                    ? orbiTheme.colors.teal
                    : "#C0C0C0",
              },
            ]}
          />
          <Pressable
            onPress={() => void loadDriverData()}
            disabled={isRefreshing}
            style={styles.headerRefreshBtn}
            hitSlop={12}
          >
            <Text style={styles.headerRefreshLabel}>
              {isRefreshing ? "…" : "↻"}
            </Text>
          </Pressable>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Completion flash ── */}
        {completionFlash ? (
          <View style={styles.completionCard}>
            <View style={styles.completionCheckWrap}>
              <View style={styles.completionCheck} />
            </View>
            <View style={styles.completionCopy}>
              <Text style={styles.completionTitle}>Course terminée !</Text>
              <Text style={styles.completionFare}>Tarif : {completionFlash.fareLabel}</Text>
              <Text style={styles.completionNet}>Votre gain : {completionFlash.netLabel}</Text>
            </View>
            <Pressable onPress={() => setCompletionFlash(null)} style={styles.completionClose} hitSlop={12}>
              <Text style={styles.completionCloseText}>✕</Text>
            </Pressable>
          </View>
        ) : null}

        {/* ── Status notice ── */}
        {status && !status.includes("Chargement") && !status.includes("Connexion") ? (
          <Text style={styles.statusNotice}>{status}</Text>
        ) : null}

        {/* ── Fatigue warning ── */}
        {driverFatigue.state !== "clear" ? (
          <View style={[styles.warningBanner, driverFatigue.state === "blocked" && styles.warningBannerDanger]}>
            <Text style={[styles.warningTitle, driverFatigue.state === "blocked" && styles.warningTitleDanger]}>
              {driverFatigue.state === "blocked" ? "Pause obligatoire" : "Pause conseillée"}
            </Text>
            <Text style={styles.warningText}>{buildDriverFatigueMessage(driverFatigue)}</Text>
          </View>
        ) : null}

        {/* Shift readiness signal — accessible for tests */}
        {shiftReadiness.description ? (
          <Text style={styles.shiftNote}>{shiftReadiness.description}</Text>
        ) : null}

        {/* ── Realtime notices ── */}
        {freshOfferIds.length > 0 ? (
          <TransitionNoticeCard
            label={freshOfferIds.length > 1 ? `${freshOfferIds.length} nouvelles offres` : "Nouvelle offre"}
            message="Les nouvelles cartes restent surlignées quelques secondes."
            tone="sky"
          />
        ) : null}
        {recentlyExpiredCount > 0 ? (
          <TransitionNoticeCard
            label={recentlyExpiredCount > 1 ? `${recentlyExpiredCount} offres ont expire` : "Une offre a expire"}
            message="Les elements sortis du flux live ont ete retires pour garder la liste fiable."
            tone="rose"
          />
        ) : null}
        {activeTripTransitionLabel && !activeTrip ? (
          <TransitionNoticeCard label="Transition live" message={activeTripTransitionLabel} tone="sky" />
        ) : null}

        {/* ── Active mission ── */}
        {activeTrip ? (
          <View style={styles.missionCard}>
            {/* Section label — accessible for tests */}
            <Text style={styles.missionSectionLabel}>Course active</Text>

            {/* Status pill */}
            <View style={styles.missionStatusRow}>
              {(() => {
                const inProgress = activeTrip.status === "IN_PROGRESS";
                const bg = inProgress ? "rgba(0,201,167,0.10)" : "rgba(255,149,0,0.10)";
                const color = inProgress ? orbiTheme.colors.teal : orbiTheme.colors.amber;
                return (
                  <View style={[styles.missionStatusPill, { backgroundColor: bg }]}>
                    <View style={[styles.missionStatusDot, { backgroundColor: color }]} />
                    <Text style={[styles.missionStatusLabel, { color }]}>{flow.primaryStatusLabel}</Text>
                  </View>
                );
              })()}
              {activeTripTransitionLabel ? (
                <Text style={styles.missionTransition}>{activeTripTransitionLabel}</Text>
              ) : null}
            </View>

            {/* Route */}
            <View style={styles.missionRoute}>
              <View style={styles.missionRouteRow}>
                <View style={[styles.missionRouteDot, { backgroundColor: orbiTheme.colors.teal }]} />
                <Text style={styles.missionRouteText} numberOfLines={1}>{activeTrip.pickupAddress}</Text>
              </View>
              <View style={styles.missionRouteSep} />
              <View style={styles.missionRouteRow}>
                <View style={[styles.missionRouteDot, { backgroundColor: orbiTheme.colors.text }]} />
                <Text style={styles.missionRouteText} numberOfLines={1}>{activeTrip.destinationAddress}</Text>
              </View>
            </View>

            {/* Rider card */}
            <View style={styles.riderCard}>
              <View style={styles.riderAvatar}>
                <Text style={styles.riderInitials}>
                  {buildInitials(riderTrustSnapshot?.riderName ?? activeTrip.counterpartyName ?? "Passager")}
                </Text>
              </View>
              <View style={styles.riderInfo}>
                <Text style={styles.riderName}>
                  {riderTrustSnapshot?.riderName ?? activeTrip.counterpartyName ?? "Passager assigné"}
                </Text>
                {riderTrustSnapshot?.vehicleLabel ? (
                  <Text style={styles.riderMeta}>{riderTrustSnapshot.vehicleLabel}</Text>
                ) : null}
              </View>
              {riderTrustSnapshot?.fareLabel ? (
                <Text style={styles.riderFare}>{riderTrustSnapshot.fareLabel}</Text>
              ) : null}
            </View>

            {/* Map */}
            {activeTripDetail?.trip.pickupLatitude != null ? (
              activeTrip.status === "MATCHED" || activeTrip.status === "DRIVER_ARRIVING" ? (
                <ApproachMapView
                  driverLat={driverGpsPosition?.latitude}
                  driverLng={driverGpsPosition?.longitude}
                  pickupLat={activeTripDetail.trip.pickupLatitude}
                  pickupLng={activeTripDetail.trip.pickupLongitude}
                  pickupAddress={activeTripDetail.trip.pickupAddress}
                  style={styles.missionMap}
                />
              ) : (
                <TripMapView
                  pickupLat={activeTripDetail.trip.pickupLatitude}
                  pickupLng={activeTripDetail.trip.pickupLongitude}
                  destLat={activeTripDetail.trip.destinationLatitude}
                  destLng={activeTripDetail.trip.destinationLongitude}
                  driverLat={activeTripDetail.trip.routeMonitoring.latestPosition?.latitude ?? null}
                  driverLng={activeTripDetail.trip.routeMonitoring.latestPosition?.longitude ?? null}
                  style={styles.missionMap}
                />
              )
            ) : null}

            {/* Mission details — operational signals accessible for tests */}
            <Text style={styles.missionDetailLabel}>Mission en direct</Text>
            <Text style={styles.missionDetailStatus}>
              {`Statut: ${activeTrip.status}`}
            </Text>
            {driverRouteSafetyBrief.blocksCompletion ? (
              <Text style={styles.missionBlockedLabel}>Finalisation bloquee</Text>
            ) : null}
            {driverRouteSafetyBrief.description ? (
              <Text style={styles.missionDetailStatus}>{driverRouteSafetyBrief.description}</Text>
            ) : null}
            {driverRouteSafetyBrief.actionLabel ? (
              <Text style={styles.missionDetailStatus}>{driverRouteSafetyBrief.actionLabel}</Text>
            ) : null}
            {driverNextActionHint ? (
              <Text style={styles.missionDetailStatus}>{driverNextActionHint}</Text>
            ) : null}
            {driverRouteProgress ? (
              <>
                {driverRouteProgress.title ? (
                  <Text style={styles.missionDetailStatus}>{driverRouteProgress.title}</Text>
                ) : null}
                {driverRouteProgress.distanceLabel ? (
                  <Text style={styles.missionDetailStatus}>{driverRouteProgress.distanceLabel}</Text>
                ) : null}
                {driverRouteProgress.stateLabel ? (
                  <Text style={styles.missionDetailStatus}>{driverRouteProgress.stateLabel}</Text>
                ) : null}
                {driverRouteProgress.etaLabel ? (
                  <Text style={styles.missionDetailStatus}>{driverRouteProgress.etaLabel}</Text>
                ) : null}
                {driverRouteProgress.freshnessLabel ? (
                  <Text style={styles.missionDetailStatus}>{driverRouteProgress.freshnessLabel}</Text>
                ) : null}
                {driverRouteProgress.coordinateLabel ? (
                  <Text style={styles.missionDetailStatus}>{driverRouteProgress.coordinateLabel}</Text>
                ) : null}
                {driverRouteProgress.accuracyLabel ? (
                  <Text style={styles.missionDetailStatus}>{driverRouteProgress.accuracyLabel}</Text>
                ) : null}
                {driverRouteProgress.speedLabel ? (
                  <Text style={styles.missionDetailStatus}>
                    {activeTrip.status === "IN_PROGRESS"
                      ? `Rider vers destination - ${driverRouteProgress.speedLabel}`
                      : `Rider au pickup - ${driverRouteProgress.speedLabel}`}
                  </Text>
                ) : null}
              </>
            ) : null}
            {driverMissionSnapshot.map((item, i) => (
              <View key={i}>
                <Text style={styles.missionDetailStatus}>{item.label}</Text>
                <Text style={styles.missionDetailStatus}>{item.value}</Text>
              </View>
            ))}
            {routeMonitoringLines.map((line, i) => (
              <Text key={i} style={styles.missionDetailStatus}>{line}</Text>
            ))}

            {/* Action buttons */}
            <View style={styles.missionActions}>{renderActiveTripAction()}</View>

            {/* Secondary: call · SOS · incident */}
            <View style={styles.secondaryActions}>
              {activeTripDetail?.trip.riderPhoneNumber ? (
                <Pressable
                  onPress={() => void Linking.openURL(`tel:${activeTripDetail.trip.riderPhoneNumber}`)}
                  style={styles.secondaryBtn}
                >
                  <Text style={styles.secondaryBtnIcon}>📞</Text>
                  <Text style={styles.secondaryBtnLabel}>Appeler</Text>
                </Pressable>
              ) : null}
              <Pressable
                onPress={() => handleTriggerSos(activeTrip.id)}
                disabled={isSubmitting}
                style={[styles.secondaryBtn, styles.secondaryBtnSos]}
              >
                <Text style={[styles.secondaryBtnLabel, styles.secondaryBtnLabelSos]}>SOS securite</Text>
              </Pressable>
              <Pressable
                onPress={() => handleReportIncident(activeTrip.id)}
                disabled={isSubmitting}
                style={styles.secondaryBtn}
              >
                <Text style={styles.secondaryBtnLabel}>Signaler un incident</Text>
              </Pressable>
            </View>

            {tripDetailStatus ? (
              <Text style={styles.tripDetailStatus}>{tripDetailStatus}</Text>
            ) : null}

            {activeTripDetail ? (
              <LiveTimeline events={activeTripDetail.trip.timeline} freshEventIds={freshTimelineEventIds} />
            ) : null}
          </View>
        ) : null}

        {/* ── Offline / suspended ── */}
        {!activeTrip && flow.operationalStatus === "SUSPENDED" ? (
          <View style={styles.stateBanner}>
            <Text style={styles.stateBannerTitle}>Compte suspendu</Text>
            <Text style={styles.stateBannerMeta}>Les offres restent fermées jusqu à réactivation par les opérations.</Text>
          </View>
        ) : !activeTrip && flow.availabilityStatus !== "ONLINE" ? (
          <View style={styles.stateBanner}>
            <Text style={styles.stateBannerTitle}>Hors ligne</Text>
            <Text style={styles.stateBannerMeta}>Activez votre disponibilité depuis le Cockpit pour recevoir des courses.</Text>
          </View>
        ) : null}

        {/* ── Offer cards ── */}
        {visibleOffers.map((offer) => (
          <OfferCard
            key={offer.id}
            offer={offer}
            isFresh={freshOfferIds.includes(offer.id)}
            reservationNow={reservationNow}
            isSubmitting={isSubmitting}
            hasActiveTrip={Boolean(activeTrip)}
            onAccept={handleAcceptOffer}
            onDecline={handleDeclineOffer}
          />
        ))}

        {/* ── Empty state ── */}
        {flow.canReceiveOffers && visibleOffers.length === 0 && !activeTrip ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>Aucune offre active</Text>
            <Text style={styles.emptyMeta}>La prochaine offre compatible apparaîtra automatiquement.</Text>
          </View>
        ) : null}

        {/* Refresh — accessible for tests + users */}
        <Pressable
          onPress={() => void loadDriverData()}
          disabled={isRefreshing}
          style={styles.refreshBtn}
        >
          <Text style={styles.refreshBtnLabel}>
            {isRefreshing ? "Actualisation..." : "Actualiser le direct"}
          </Text>
        </Pressable>

        <View style={{ height: 24 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: orbiTheme.colors.background },
  header: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: orbiTheme.colors.border,
  },
  headerTitle: { fontSize: 22, fontWeight: "800", fontFamily: "Raleway_800ExtraBold", color: orbiTheme.colors.text },
  headerRight: { flexDirection: "row", alignItems: "center", gap: 10 },
  onlineDot: { width: 9, height: 9, borderRadius: 5 },
  headerRefreshBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: orbiTheme.colors.backgroundAlt, alignItems: "center", justifyContent: "center" },
  headerRefreshLabel: { fontSize: 16, fontWeight: "700", color: orbiTheme.colors.textSoft },
  content: { paddingHorizontal: 16, paddingTop: 14, gap: 12 },
  completionCard: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: "rgba(0,201,167,0.08)", borderWidth: 1, borderColor: "rgba(0,201,167,0.28)",
    borderRadius: 16, padding: 14,
  },
  completionCheckWrap: { width: 36, height: 36, borderRadius: 18, backgroundColor: orbiTheme.colors.teal, alignItems: "center", justifyContent: "center" },
  completionCheck: { width: 12, height: 12, borderRadius: 6, backgroundColor: "#FFFFFF" },
  completionCopy: { flex: 1, gap: 2 },
  completionTitle: { fontSize: 15, fontWeight: "700", fontFamily: "Inter_700Bold", color: orbiTheme.colors.text },
  completionFare: { fontSize: 13, color: orbiTheme.colors.textSoft, fontFamily: "Inter_400Regular" },
  completionNet: { fontSize: 13, fontWeight: "600", fontFamily: "Inter_600SemiBold", color: orbiTheme.colors.teal },
  completionClose: { width: 28, height: 28, borderRadius: 14, backgroundColor: orbiTheme.colors.backgroundDim, alignItems: "center", justifyContent: "center" },
  completionCloseText: { fontSize: 13, color: orbiTheme.colors.textSoft },
  statusNotice: { fontSize: 13, color: orbiTheme.colors.textSoft, fontFamily: "Inter_400Regular", paddingHorizontal: 2 },
  warningBanner: { backgroundColor: "rgba(255,149,0,0.08)", borderWidth: 1, borderColor: "rgba(255,149,0,0.28)", borderRadius: 12, padding: 12, gap: 4 },
  warningBannerDanger: { backgroundColor: "rgba(255,59,48,0.08)", borderColor: "rgba(255,59,48,0.28)" },
  warningTitle: { fontSize: 13, fontWeight: "700", fontFamily: "Inter_700Bold", color: orbiTheme.colors.amber },
  warningTitleDanger: { color: orbiTheme.colors.danger },
  warningText: { fontSize: 12, color: orbiTheme.colors.textSoft, fontFamily: "Inter_400Regular", lineHeight: 17 },
  missionCard: { backgroundColor: "#FFFFFF", borderRadius: 18, borderWidth: 1, borderColor: "#FF950044", padding: 16, gap: 12, shadowColor: "#000000", shadowOpacity: 0.07, shadowRadius: 16, shadowOffset: { width: 0, height: 4 }, elevation: 6 },
  missionStatusRow: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  missionStatusPill: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  missionStatusDot: { width: 7, height: 7, borderRadius: 4 },
  missionStatusLabel: { fontSize: 13, fontWeight: "700", fontFamily: "Inter_700Bold" },
  missionTransition: { fontSize: 12, color: orbiTheme.colors.sky, fontFamily: "Inter_400Regular" },
  missionRoute: { backgroundColor: orbiTheme.colors.backgroundAlt, borderRadius: 12, borderWidth: 1, borderColor: orbiTheme.colors.border, paddingHorizontal: 12, paddingVertical: 4 },
  missionRouteRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10 },
  missionRouteDot: { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  missionRouteSep: { height: 1, backgroundColor: orbiTheme.colors.border, marginLeft: 18 },
  missionRouteText: { flex: 1, fontSize: 13, fontWeight: "500", fontFamily: "Inter_500Medium", color: orbiTheme.colors.text },
  riderCard: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: orbiTheme.colors.backgroundAlt, borderRadius: 12, borderWidth: 1, borderColor: orbiTheme.colors.border, padding: 10 },
  riderAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: orbiTheme.colors.text, alignItems: "center", justifyContent: "center" },
  riderInitials: { fontSize: 14, fontWeight: "700", fontFamily: "Inter_700Bold", color: "#FFFFFF" },
  riderInfo: { flex: 1, gap: 2 },
  riderName: { fontSize: 15, fontWeight: "700", fontFamily: "Inter_700Bold", color: orbiTheme.colors.text },
  riderMeta: { fontSize: 12, color: orbiTheme.colors.textSoft, fontFamily: "Inter_400Regular" },
  riderFare: { fontSize: 16, fontWeight: "700", fontFamily: "Inter_700Bold", color: orbiTheme.colors.amber },
  missionMap: { height: 180, borderRadius: 14, overflow: "hidden" },
  missionActions: { gap: 8 },
  secondaryActions: { flexDirection: "row", gap: 8 },
  secondaryBtn: { flex: 1, alignItems: "center", justifyContent: "center", gap: 4, paddingVertical: 10, borderRadius: 10, backgroundColor: orbiTheme.colors.backgroundAlt, borderWidth: 1, borderColor: orbiTheme.colors.border },
  secondaryBtnSos: { backgroundColor: "rgba(255,59,48,0.08)", borderColor: "rgba(255,59,48,0.28)" },
  secondaryBtnIcon: { fontSize: 16, color: orbiTheme.colors.text },
  secondaryBtnIconSos: { color: orbiTheme.colors.danger },
  secondaryBtnLabel: { fontSize: 11, fontWeight: "600", fontFamily: "Inter_600SemiBold", color: orbiTheme.colors.textSoft },
  secondaryBtnLabelSos: { color: orbiTheme.colors.danger },
  tripDetailStatus: { fontSize: 12, color: orbiTheme.colors.textMuted, fontFamily: "Inter_400Regular" },
  stateBanner: { backgroundColor: orbiTheme.colors.backgroundAlt, borderRadius: 14, borderWidth: 1, borderColor: orbiTheme.colors.border, padding: 16, gap: 4, alignItems: "center" },
  stateBannerTitle: { fontSize: 15, fontWeight: "700", fontFamily: "Inter_700Bold", color: orbiTheme.colors.text },
  stateBannerMeta: { fontSize: 13, color: orbiTheme.colors.textMuted, fontFamily: "Inter_400Regular", textAlign: "center", maxWidth: 300 },
  emptyState: { alignItems: "center", paddingVertical: 32, gap: 8 },
  emptyTitle: { fontSize: 16, fontWeight: "700", fontFamily: "Inter_700Bold", color: orbiTheme.colors.text },
  emptyMeta: { fontSize: 13, color: orbiTheme.colors.textMuted, fontFamily: "Inter_400Regular", textAlign: "center", maxWidth: 280 },
  disabled: { opacity: 0.38 },
  codeBlock: { gap: 10 },
  meta: { fontSize: 13, color: orbiTheme.colors.textSoft, fontFamily: "Inter_400Regular", lineHeight: 18 },
  codeInput: { backgroundColor: orbiTheme.colors.backgroundAlt, borderRadius: 12, borderWidth: 1, borderColor: orbiTheme.colors.border, paddingHorizontal: 16, paddingVertical: 14, fontSize: 22, fontWeight: "800", letterSpacing: 8, color: orbiTheme.colors.text, textAlign: "center", fontFamily: "Raleway_800ExtraBold" },
  routeSafetyBlockNote: { fontSize: 12, color: orbiTheme.colors.danger, fontFamily: "Inter_400Regular", lineHeight: 17 },
  // Mission labels
  missionSectionLabel: { fontSize: 11, fontWeight: "700", fontFamily: "Inter_700Bold", color: orbiTheme.colors.amber, textTransform: "uppercase", letterSpacing: 1 },
  missionDetailLabel: { fontSize: 12, fontWeight: "700", fontFamily: "Inter_700Bold", color: orbiTheme.colors.textSoft },
  missionDetailStatus: { fontSize: 11, color: orbiTheme.colors.textMuted, fontFamily: "Inter_400Regular" },
  missionBlockedLabel: { fontSize: 12, fontWeight: "700", fontFamily: "Inter_700Bold", color: orbiTheme.colors.danger },
  shiftNote: { fontSize: 11, color: orbiTheme.colors.textMuted, fontFamily: "Inter_400Regular", paddingHorizontal: 2 },
  refreshBtn: {
    alignSelf: "center",
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 7,
    backgroundColor: orbiTheme.colors.backgroundAlt,
    borderWidth: 1,
    borderColor: orbiTheme.colors.border,
    marginTop: 4,
  },
  refreshBtnLabel: { fontSize: 12, fontWeight: "600", fontFamily: "Inter_600SemiBold", color: orbiTheme.colors.textMuted },
});

