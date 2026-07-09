import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { preventSensitiveScreenCapture, restoreSensitiveScreenCapture } from "../../lib/privacy/screen-capture";
import { useTranslation } from "../../lib/i18n";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  RefreshControl,
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
  type OrbiTheme,
} from "@orbi/ui";
import {
  FlowActionButton,
  LiveTimeline,
  TransitionNoticeCard,
} from "../../lib/realtime-widgets";
import { OrbiButton, OrbiScreen, OrbiStatusBanner, OrbiSurface, safeHaptics, useOrbiTheme } from "@orbi/ui/native";
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

function RefreshGlyph({ loading }: { loading: boolean }) {
  const theme = useOrbiTheme();
  const iconStyles = useMemo(() => makeIconStyles(theme), [theme]);
  if (loading) {
    return <ActivityIndicator size="small" color={theme.colors.amber} />;
  }

  return (
    <View style={iconStyles.refreshWrap}>
      <View style={iconStyles.refreshArc} />
      <View style={iconStyles.refreshTip} />
    </View>
  );
}

function CloseGlyph() {
  const theme = useOrbiTheme();
  const iconStyles = useMemo(() => makeIconStyles(theme), [theme]);
  return (
    <View style={iconStyles.closeWrap}>
      <View style={[iconStyles.closeLine, iconStyles.closeLineA]} />
      <View style={[iconStyles.closeLine, iconStyles.closeLineB]} />
    </View>
  );
}

export default function OffersScreen() {
  const theme = useOrbiTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { t } = useTranslation();
  const td = (key: string): string => String(t(`driver.${key}` as never));
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
  const riderTrustSnapshot = useMemo(
    () => buildDriverRiderTrustSnapshot({ tripDetail: activeTripDetail }),
    [activeTripDetail],
  );
  const shiftReadiness = useMemo(
    () => buildDriverShiftReadiness({ flow, fatigue: driverFatigue }),
    [driverFatigue, flow],
  );
  const driverRouteProgress = useMemo(
    () => buildDriverLiveRouteProgress({ flow, tripDetail: activeTripDetail }),
    [flow, activeTripDetail],
  );
  const driverMissionSnapshot = useMemo(
    () => buildDriverMissionSnapshot({ flow, tripDetail: activeTripDetail }),
    [flow, activeTripDetail],
  );
  const driverNextActionHint = useMemo(
    () => buildDriverNextActionHint(flow),
    [flow],
  );
  const routeMonitoringLines = useMemo(
    () => buildDriverRouteMonitoringLines(activeTripDetail?.trip.routeMonitoring),
    [activeTripDetail],
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
    preventSensitiveScreenCapture();
    return () => {
      restoreSensitiveScreenCapture();
    };
  }, []);

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
    safeHaptics.impact('medium');
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
    safeHaptics.notify('error');
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
            placeholderTextColor={theme.colors.muted}
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
    <OrbiScreen audience="driver" style={styles.safe}>
      {/* ── Header ── */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{td('missions')}</Text>
        <View style={styles.headerRight}>
          {isRealtimeSyncing ? (
            <ActivityIndicator size="small" color={theme.colors.amber} />
          ) : null}
          <View
            style={[
              styles.onlineDot,
              {
                backgroundColor:
                  flow.availabilityStatus === "ONLINE"
                    ? theme.colors.teal
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
            <RefreshGlyph loading={isRefreshing} />
          </Pressable>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => void loadDriverData()}
            tintColor={theme.colors.amber}
            colors={[theme.colors.amber]}
          />
        }
      >
        {/* ── Completion flash ── */}
        {completionFlash ? (
          <OrbiSurface tone="teal" style={styles.completionCard} elevated>
            <View style={styles.completionCheckWrap}>
              <View style={styles.completionCheck} />
            </View>
            <View style={styles.completionCopy}>
              <Text style={styles.completionTitle}>Course terminée !</Text>
              <Text style={styles.completionFare}>Tarif : {completionFlash.fareLabel}</Text>
              <Text style={styles.completionNet}>Votre gain : {completionFlash.netLabel}</Text>
            </View>
            <Pressable onPress={() => setCompletionFlash(null)} style={styles.completionClose} hitSlop={12}>
              <CloseGlyph />
            </Pressable>
          </OrbiSurface>
        ) : null}

        {/* ── Status notice ── */}
        {status && !status.includes("Chargement") && !status.includes("Connexion") ? (
          <Text style={styles.statusNotice}>{status}</Text>
        ) : null}

        {/* ── Fatigue warning ── */}
        {driverFatigue.state !== "clear" ? (
          <OrbiStatusBanner
            title={driverFatigue.state === "blocked" ? "Pause obligatoire" : "Pause conseillée"}
            message={buildDriverFatigueMessage(driverFatigue)}
            tone={driverFatigue.state === "blocked" ? "danger" : "amber"}
          />
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
          <OrbiSurface tone="amber" style={styles.missionCard} elevated>
            {/* Section label — accessible for tests */}
            <Text style={styles.missionSectionLabel}>Course active</Text>

            {/* Status pill */}
            <View style={styles.missionStatusRow}>
              {(() => {
                const inProgress = activeTrip.status === "IN_PROGRESS";
                const bg = inProgress ? "rgba(0,201,167,0.10)" : "rgba(255,149,0,0.10)";
                const color = inProgress ? theme.colors.teal : theme.colors.amber;
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
                <View style={[styles.missionRouteDot, { backgroundColor: theme.colors.teal }]} />
                <Text style={styles.missionRouteText} numberOfLines={1}>{activeTrip.pickupAddress}</Text>
              </View>
              <View style={styles.missionRouteSep} />
              <View style={styles.missionRouteRow}>
                <View style={[styles.missionRouteDot, { backgroundColor: theme.colors.text }]} />
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
                  vehicleTier={activeTripDetail.trip.driverVerification.vehicle.tier as string | null | undefined}
                  style={styles.missionMap}
                />
              )
            ) : null}

            {/* Mission details — operational signals accessible for tests */}
            <View style={styles.missionSignalsPanel}>
              <Text style={styles.missionDetailLabel}>Mission en direct</Text>
              <View style={styles.missionSignalGrid}>
                <View style={styles.missionSignalTile}>
                  <Text style={styles.missionSignalLabel}>Statut</Text>
                  <Text style={styles.missionSignalValue}>{`Statut: ${activeTrip.status}`}</Text>
                </View>
                {driverRouteSafetyBrief.blocksCompletion ? (
                  <View style={[styles.missionSignalTile, styles.missionSignalTileDanger]}>
                    <Text style={styles.missionSignalLabel}>Blocage</Text>
                    <Text style={styles.missionBlockedLabel}>Finalisation bloquee</Text>
                  </View>
                ) : null}
                {driverRouteProgress?.distanceLabel ? (
                  <View style={styles.missionSignalTile}>
                    <Text style={styles.missionSignalLabel}>Distance</Text>
                    <Text style={styles.missionSignalValue}>{driverRouteProgress.distanceLabel}</Text>
                  </View>
                ) : null}
                {driverRouteProgress?.accuracyLabel ? (
                  <View style={styles.missionSignalTile}>
                    <Text style={styles.missionSignalLabel}>GPS</Text>
                    <Text style={styles.missionSignalValue}>{driverRouteProgress.accuracyLabel}</Text>
                  </View>
                ) : null}
                {driverRouteProgress?.speedLabel ? (
                  <View style={styles.missionSignalTile}>
                    <Text style={styles.missionSignalLabel}>Vitesse</Text>
                    <Text style={styles.missionSignalValue}>
                      {activeTrip.status === "IN_PROGRESS"
                        ? `Rider vers destination - ${driverRouteProgress.speedLabel}`
                        : `Rider au pickup - ${driverRouteProgress.speedLabel}`}
                    </Text>
                  </View>
                ) : null}
                {driverMissionSnapshot.map((item, i) => (
                  <View key={i} style={styles.missionSignalTile}>
                    <Text style={styles.missionSignalLabel}>{item.label}</Text>
                    <Text style={styles.missionSignalValue}>{item.value}</Text>
                  </View>
                ))}
              </View>
              {driverRouteSafetyBrief.description ? (
                <Text style={styles.missionDetailStatus}>{driverRouteSafetyBrief.description}</Text>
              ) : null}
              {driverRouteSafetyBrief.actionLabel ? (
                <Text style={styles.missionDetailStatus}>{driverRouteSafetyBrief.actionLabel}</Text>
              ) : null}
              {driverNextActionHint ? (
                <Text style={styles.missionDetailStatus}>{driverNextActionHint}</Text>
              ) : null}
              {driverRouteProgress?.title ? (
                <Text style={styles.missionDetailStatus}>{driverRouteProgress.title}</Text>
              ) : null}
              {driverRouteProgress?.stateLabel ? (
                <Text style={styles.missionDetailStatus}>{driverRouteProgress.stateLabel}</Text>
              ) : null}
              {driverRouteProgress?.etaLabel ? (
                <Text style={styles.missionDetailStatus}>{driverRouteProgress.etaLabel}</Text>
              ) : null}
              {driverRouteProgress?.freshnessLabel ? (
                <Text style={styles.missionDetailStatus}>{driverRouteProgress.freshnessLabel}</Text>
              ) : null}
              {driverRouteProgress?.coordinateLabel ? (
                <Text style={styles.missionDetailStatus}>{driverRouteProgress.coordinateLabel}</Text>
              ) : null}
              <View style={styles.routeMonitoringCompact}>
                {routeMonitoringLines.map((line, i) => (
                  <Text key={i} style={styles.missionDetailStatus}>{line}</Text>
                ))}
              </View>
            </View>

            {/* Action buttons */}
            <View style={styles.missionActions}>{renderActiveTripAction()}</View>

            {/* Secondary: call · SOS · incident */}
            <View style={styles.secondaryActions}>
              {activeTripDetail?.trip.riderPhoneNumber ? (
                <OrbiButton
                  label="Appeler"
                  helper="Passager"
                  onPress={() => void Linking.openURL(`tel:${activeTripDetail.trip.riderPhoneNumber}`)}
                  style={styles.secondaryBtn}
                  variant="secondary"
                  tone="teal"
                />
              ) : null}
              <OrbiButton
                label="SOS securite"
                onPress={() => handleTriggerSos(activeTrip.id)}
                disabled={isSubmitting}
                style={styles.secondaryBtn}
                variant="danger"
                tone="danger"
              />
              <OrbiButton
                label="Signaler un incident"
                onPress={() => handleReportIncident(activeTrip.id)}
                disabled={isSubmitting}
                style={styles.secondaryBtn}
                variant="secondary"
                tone="amber"
              />
            </View>

            {tripDetailStatus ? (
              <Text style={styles.tripDetailStatus}>{tripDetailStatus}</Text>
            ) : null}

            {activeTripDetail ? (
              <LiveTimeline events={activeTripDetail.trip.timeline} freshEventIds={freshTimelineEventIds} />
            ) : null}
          </OrbiSurface>
        ) : null}

        {/* ── Offline / suspended ── */}
        {!activeTrip && flow.operationalStatus === "SUSPENDED" ? (
          <OrbiStatusBanner
            title="Compte suspendu"
            message="Les offres restent fermées jusqu à réactivation par les opérations."
            tone="danger"
          />
        ) : !activeTrip && flow.availabilityStatus !== "ONLINE" ? (
          <View style={styles.compactOfflineNotice}>
            <View style={styles.compactOfflineDot} />
            <Text style={styles.compactOfflineText}>Hors ligne · activez le Cockpit pour recevoir des courses</Text>
          </View>
        ) : null}

        {/* ── Offer cards ── */}
        {visibleOffers.map((offer, idx) => (
          <OfferCard
            key={offer.id}
            offer={offer}
            index={idx}
            isFresh={freshOfferIds.includes(offer.id)}
            reservationNow={reservationNow}
            isSubmitting={isSubmitting}
            hasActiveTrip={Boolean(activeTrip)}
            onAccept={handleAcceptOffer}
            onDecline={handleDeclineOffer}
          />
        ))}

        {/* ── Empty state ── */}
        {visibleOffers.length === 0 && !activeTrip ? (
          <OrbiSurface style={styles.emptyState} elevated>
            <View style={styles.emptyHeader}>
              <View style={styles.emptyCopy}>
                <View style={styles.emptySignal}>
                  <View
                    style={[
                      styles.emptySignalDot,
                      {
                        backgroundColor: flow.canReceiveOffers
                          ? theme.colors.teal
                          : theme.colors.amber,
                      },
                    ]}
                  />
                  <Text style={styles.emptySignalText}>
                    {flow.canReceiveOffers ? "Disponible" : "Hors ligne"}
                  </Text>
                </View>
                <Text style={styles.emptyTitle}>Aucune offre active</Text>
                <Text style={styles.emptyMeta} numberOfLines={2}>
                  {flow.canReceiveOffers
                    ? "Restez proche des zones de demande. Les offres compatibles arrivent ici."
                    : "Passez en ligne depuis le Cockpit quand vous êtes prêt."}
                </Text>
              </View>
              <View style={styles.emptyRadar}>
                <View style={styles.emptyRadarRing} />
                <View style={styles.emptyRadarDot} />
              </View>
            </View>
            <View style={styles.emptyChecklist}>
              <View style={styles.emptyCheckItem}>
                <Text style={styles.emptyCheckTitle}>Position</Text>
                <Text style={styles.emptyCheckMeta}>Live</Text>
              </View>
              <View style={styles.emptyCheckItem}>
                <Text style={styles.emptyCheckTitle}>Compte</Text>
                <Text style={styles.emptyCheckMeta}>OK</Text>
              </View>
              <View style={styles.emptyCheckItem}>
                <Text style={styles.emptyCheckTitle}>Mission</Text>
                <Text style={styles.emptyCheckMeta}>{flow.canReceiveOffers ? "Scan" : "Pause"}</Text>
              </View>
            </View>
          </OrbiSurface>
        ) : null}

        {/* Refresh — accessible for tests + users */}
        <OrbiButton
          label={isRefreshing ? "Actualisation..." : "Actualiser le direct"}
          onPress={() => void loadDriverData()}
          disabled={isRefreshing}
          style={styles.refreshBtn}
          variant="secondary"
          tone="amber"
        />

        <View style={{ height: 24 }} />
      </ScrollView>
    </OrbiScreen>
  );
}

const makeStyles = (theme: OrbiTheme) => StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: theme.colors.border,
  },
  headerTitle: { fontSize: 22, fontWeight: "800", fontFamily: "Raleway_800ExtraBold", color: theme.colors.text },
  headerRight: { flexDirection: "row", alignItems: "center", gap: 10 },
  onlineDot: { width: 9, height: 9, borderRadius: 5 },
  headerRefreshBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: theme.colors.backgroundAlt, alignItems: "center", justifyContent: "center" },
  content: { paddingHorizontal: 16, paddingTop: 12, gap: 10 },
  completionCard: {
    flexDirection: "row", alignItems: "center", gap: 12,
    padding: 14,
  },
  completionCheckWrap: { width: 36, height: 36, borderRadius: 18, backgroundColor: theme.colors.teal, alignItems: "center", justifyContent: "center" },
  completionCheck: { width: 12, height: 12, borderRadius: 6, backgroundColor: "#FFFFFF" },
  completionCopy: { flex: 1, gap: 2 },
  completionTitle: { fontSize: 15, fontWeight: "700", fontFamily: "Inter_700Bold", color: theme.colors.text },
  completionFare: { fontSize: 13, color: theme.colors.textSoft, fontFamily: "Inter_400Regular" },
  completionNet: { fontSize: 13, fontWeight: "600", fontFamily: "Inter_600SemiBold", color: theme.colors.teal },
  completionClose: { width: 28, height: 28, borderRadius: 14, backgroundColor: theme.colors.backgroundDim, alignItems: "center", justifyContent: "center" },
  statusNotice: { fontSize: 13, color: theme.colors.textSoft, fontFamily: "Inter_400Regular", paddingHorizontal: 2 },
  compactOfflineNotice: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 999,
    backgroundColor: theme.colors.backgroundAlt,
    borderWidth: 1,
    borderColor: theme.colors.borderSoft,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  compactOfflineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.colors.amber,
  },
  compactOfflineText: {
    flex: 1,
    fontSize: 12,
    fontWeight: "700",
    fontFamily: "Inter_700Bold",
    color: theme.colors.textSoft,
  },
  missionCard: { padding: 14, gap: 10 },
  missionStatusRow: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  missionStatusPill: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  missionStatusDot: { width: 7, height: 7, borderRadius: 4 },
  missionStatusLabel: { fontSize: 13, fontWeight: "700", fontFamily: "Inter_700Bold" },
  missionTransition: { fontSize: 12, color: theme.colors.sky, fontFamily: "Inter_400Regular" },
  missionRoute: { backgroundColor: theme.colors.surface, borderRadius: 14, borderWidth: 1, borderColor: "rgba(255,176,32,0.26)", paddingHorizontal: 12, paddingVertical: 2 },
  missionRouteRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8 },
  missionRouteDot: { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  missionRouteSep: { height: 1, backgroundColor: theme.colors.border, marginLeft: 18 },
  missionRouteText: { flex: 1, fontSize: 13, fontWeight: "500", fontFamily: "Inter_500Medium", color: theme.colors.text },
  riderCard: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: theme.colors.surface, borderRadius: 14, borderWidth: 1, borderColor: theme.colors.borderSoft, padding: 10 },
  riderAvatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: theme.colors.accentDark, alignItems: "center", justifyContent: "center" },
  riderInitials: { fontSize: 14, fontWeight: "700", fontFamily: "Inter_700Bold", color: "#FFFFFF" },
  riderInfo: { flex: 1, gap: 2 },
  riderName: { fontSize: 15, fontWeight: "700", fontFamily: "Inter_700Bold", color: theme.colors.text },
  riderMeta: { fontSize: 12, color: theme.colors.textSoft, fontFamily: "Inter_400Regular" },
  riderFare: { fontSize: 16, fontWeight: "700", fontFamily: "Inter_700Bold", color: theme.colors.amber },
  missionMap: { height: 132, borderRadius: 14, overflow: "hidden" },
  missionActions: { gap: 7 },
  secondaryActions: { flexDirection: "row", gap: 8 },
  secondaryBtn: { flex: 1 },
  tripDetailStatus: { fontSize: 12, color: theme.colors.textMuted, fontFamily: "Inter_400Regular" },
  emptyState: {
    padding: 13,
    gap: 11,
    borderWidth: 1,
    borderColor: theme.colors.borderSoft,
    backgroundColor: theme.colors.surface,
  },
  emptyHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  emptyCopy: {
    flex: 1,
    gap: 7,
  },
  emptySignal: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    borderRadius: 999,
    backgroundColor: theme.colors.backgroundAlt,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  emptySignalDot: { width: 8, height: 8, borderRadius: 4 },
  emptySignalText: {
    fontSize: 11,
    fontWeight: "800",
    fontFamily: "Inter_700Bold",
    color: theme.colors.textSoft,
    textTransform: "uppercase",
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: "800",
    fontFamily: "Inter_700Bold",
    color: theme.colors.text,
  },
  emptyMeta: {
    fontSize: 12,
    color: theme.colors.textMuted,
    fontFamily: "Inter_400Regular",
    lineHeight: 17,
  },
  emptyRadar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "rgba(0,201,167,0.08)",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  emptyRadarRing: {
    position: "absolute",
    width: 58,
    height: 58,
    borderRadius: 29,
    borderWidth: 1,
    borderColor: "rgba(0,201,167,0.28)",
  },
  emptyRadarDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: theme.colors.teal,
    borderWidth: 3,
    borderColor: "#FFFFFF",
  },
  emptyChecklist: { flexDirection: "row", gap: 7 },
  emptyCheckItem: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.borderSoft,
    backgroundColor: theme.colors.backgroundAlt,
    paddingHorizontal: 9,
    paddingVertical: 8,
    gap: 2,
  },
  emptyCheckTitle: {
    fontSize: 10,
    fontWeight: "800",
    fontFamily: "Inter_700Bold",
    color: theme.colors.textMuted,
    textTransform: "uppercase",
  },
  emptyCheckMeta: {
    fontSize: 12,
    fontWeight: "800",
    fontFamily: "Inter_700Bold",
    color: theme.colors.text,
  },
  disabled: { opacity: 0.38 },
  codeBlock: { gap: 10 },
  meta: { fontSize: 13, color: theme.colors.textSoft, fontFamily: "Inter_400Regular", lineHeight: 18 },
  codeInput: { backgroundColor: theme.colors.backgroundAlt, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.border, paddingHorizontal: 16, paddingVertical: 14, fontSize: 22, fontWeight: "800", letterSpacing: 0, color: theme.colors.text, textAlign: "center", fontFamily: "Raleway_800ExtraBold" },
  routeSafetyBlockNote: { fontSize: 12, color: theme.colors.danger, fontFamily: "Inter_400Regular", lineHeight: 17 },
  // Mission labels
  missionSectionLabel: { fontSize: 11, fontWeight: "700", fontFamily: "Inter_700Bold", color: theme.colors.amber, textTransform: "uppercase", letterSpacing: 0 },
  missionSignalsPanel: { gap: 7 },
  missionSignalGrid: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  missionSignalTile: { width: "48%", minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.borderSoft, backgroundColor: theme.colors.surface, paddingHorizontal: 10, paddingVertical: 8, gap: 2 },
  missionSignalTileDanger: { borderColor: "rgba(240,68,94,0.28)", backgroundColor: "rgba(240,68,94,0.08)" },
  missionSignalLabel: { fontSize: 9, fontWeight: "800", fontFamily: "Inter_700Bold", color: theme.colors.textMuted, textTransform: "uppercase", letterSpacing: 0 },
  missionSignalValue: { fontSize: 11, fontWeight: "700", fontFamily: "Inter_700Bold", color: theme.colors.text, lineHeight: 15 },
  routeMonitoringCompact: { gap: 2 },
  missionDetailLabel: { fontSize: 12, fontWeight: "800", fontFamily: "Inter_700Bold", color: theme.colors.textSoft },
  missionDetailStatus: { fontSize: 10, color: theme.colors.textMuted, fontFamily: "Inter_400Regular", lineHeight: 14 },
  missionBlockedLabel: { fontSize: 12, fontWeight: "700", fontFamily: "Inter_700Bold", color: theme.colors.danger },
  shiftNote: { fontSize: 11, color: theme.colors.textMuted, fontFamily: "Inter_400Regular", paddingHorizontal: 2 },
  refreshBtn: {
    alignSelf: "center",
    marginTop: 4,
  },
});

const makeIconStyles = (theme: OrbiTheme) => StyleSheet.create({
  refreshWrap: {
    width: 18,
    height: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  refreshArc: {
    width: 15,
    height: 15,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: theme.colors.textSoft,
    borderLeftColor: "transparent",
  },
  refreshTip: {
    position: "absolute",
    right: 1,
    top: 1,
    width: 0,
    height: 0,
    borderLeftWidth: 5,
    borderTopWidth: 4,
    borderBottomWidth: 4,
    borderLeftColor: theme.colors.textSoft,
    borderTopColor: "transparent",
    borderBottomColor: "transparent",
    transform: [{ rotate: "22deg" }],
  },
  closeWrap: {
    width: 14,
    height: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  closeLine: {
    position: "absolute",
    width: 14,
    height: 2,
    borderRadius: 999,
    backgroundColor: theme.colors.textSoft,
  },
  closeLineA: {
    transform: [{ rotate: "45deg" }],
  },
  closeLineB: {
    transform: [{ rotate: "-45deg" }],
  },
});
