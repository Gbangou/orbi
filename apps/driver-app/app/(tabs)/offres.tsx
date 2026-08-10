import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  canDriverCompleteTrip,
  canDriverMarkArrived,
  canDriverStartTrip,
  completeTripWithApi,
  declineDriverOfferWithApi,
  fetchDriverOffers,
  fetchDriverProfile,
  fetchMyTrips,
  fetchTripDetail,
  reportTripIncidentWithApi,
  triggerTripSafetySosWithApi,
  withNetworkRetry,
  verifyPickupCodeWithApi,
  type DriverFatigueStatus,
  type DriverOffer,
  type MyTripsResponse,
  type TripDetailResponse,
  updateTripStatusWithApi,
} from "@orbi/api";
import {
  formatOperationalStatus,
  orbiCopy,
  type OrbiTheme,
} from "@orbi/ui";
import {
  FlowActionButton,
  LiveTimeline,
  TransitionNoticeCard,
} from "../../lib/realtime-widgets";
import {
  OrbiButton,
  OrbiScreen,
  OrbiStatusBanner,
  OrbiSurface,
  PersonBadge,
  safeHaptics,
  TripStageTracker,
  useOrbiTheme,
} from "@orbi/ui/native";
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
  buildDriverNextActionHint,
  buildDriverRiderTrustSnapshot,
  resolveDriverActiveFlow,
  resolveDriverReservationChangeSet,
} from "../../lib/driver-active-flow";
import { buildDriverShiftReadiness } from "../../lib/driver-shift-readiness";
import {
  buildDriverFatigueMessage,
  buildDriverRouteSafetyBrief,
} from "../../lib/driver-operational-signal";
import { useDriverPresence } from "../../lib/use-driver-presence";
import { useDriverRealtimeStream } from "../../lib/use-driver-realtime-stream";
import { TripMapView } from "../../lib/trip-map-view";
import { normalizeDriverProfileResponse } from "../../lib/driver-profile-normalizer";
import { ApproachMapView } from "../../lib/approach-map-view";
import { useLiveRefresh } from "../../lib/use-live-refresh";
import {
  formatDriverEarningsAmount,
  toFiniteEarningsNumber,
} from "../../lib/driver-earnings-signal";
import {
  formatDriverOfferDistance,
  resolveDriverOfferMoneyDisplay,
} from "../../lib/offer-signal";
import { formatReservationCountdown } from "../../lib/offer-reservation";
import { validateOfferAction } from "../../lib/driver-action-safety";

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

function resolveMissionStageCopy(status: string) {
  if (status === "MATCHED") {
    return {
      eyebrow: "Aller au point de départ",
      title: "Rejoignez le passager",
      primary: "Arrivé au point",
    };
  }

  if (status === "DRIVER_ARRIVING") {
    return {
      eyebrow: "Passager au point de départ",
      title: "Confirmez puis démarrez",
      primary: "Départ course",
    };
  }

  if (status === "IN_PROGRESS") {
    return {
      eyebrow: "Trajet en cours",
      title: "Conduisez vers la destination",
      primary: "Arrivée destination",
    };
  }

  return {
    eyebrow: "Mission active",
    title: "Suivez la course",
    primary: "Action suivante",
  };
}

function formatPaymentMethodLabel(paymentMethod: string | null | undefined) {
  switch ((paymentMethod ?? "MOBILE_MONEY").toUpperCase().replace(/-/g, "_")) {
    case "CASH":
      return "Espèces";
    case "WALLET":
      return "Wallet Orbi";
    case "MOBILE_MONEY":
      return "Mobile Money";
    default:
      return "Paiement confirmé";
  }
}

function formatOfferVehicleTypeLabel(category: DriverOffer["category"]) {
  return category === "motorcycle" ? "Moto" : "Voiture";
}

function TripStartAction({
  state,
  disabled,
  onPress,
}: {
  state: "idle" | "confirming" | "confirmed";
  disabled: boolean;
  onPress: () => void;
}) {
  const theme = useOrbiTheme();
  const styles = useMemo(() => makeTripStartActionStyles(theme), [theme]);
  const isConfirming = state === "confirming";
  const label = isConfirming
    ? "Démarrage..."
    : state === "confirmed"
      ? "Course démarrée"
      : "Démarrer la course";
  const hint = isConfirming
    ? "Confirmation du départ"
    : state === "confirmed"
      ? "Conduisez vers la destination"
      : "Passager à bord, prêt à partir";
  const isDisabled = disabled || isConfirming || state === "confirmed";

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: isConfirming }}
      accessibilityLabel="Démarrer la course"
      disabled={isDisabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        state === "confirmed" ? styles.buttonConfirmed : null,
        pressed ? styles.buttonPressed : null,
        isDisabled ? styles.buttonDisabled : null,
      ]}
    >
      <View style={styles.iconWrap}>
        {isConfirming ? <ActivityIndicator size="small" color="#000000" /> : (
          <Text style={styles.iconText}>{state === "confirmed" ? "OK" : "GO"}</Text>
        )}
      </View>
      <View style={styles.copy}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.hint}>{hint}</Text>
      </View>
    </Pressable>
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
  const [incomingOfferId, setIncomingOfferId] = useState<string | null>(null);
  const [recentlyExpiredCount, setRecentlyExpiredCount] = useState(0);
  const [activeTripTransitionLabel, setActiveTripTransitionLabel] = useState<
    string | null
  >(null);
  const [freshTimelineEventIds, setFreshTimelineEventIds] = useState<string[]>(
    [],
  );
  const [driverProfileStatus, setDriverProfileStatus] =
    useState<string>("OFFLINE");
  const [driverProfileId, setDriverProfileId] = useState<string | null>(null);
  const [driverVerificationStatus, setDriverVerificationStatus] =
    useState<string>("PENDING");
  const [driverFatigue, setDriverFatigue] =
    useState<DriverFatigueStatus>(fallbackFatigue);
  const [tripDetailStatus, setTripDetailStatus] = useState<string | null>(null);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [completionFlash, setCompletionFlash] = useState<{
    fareLabel: string;
    commissionLabel: string;
    netLabel: string;
    paymentLabel: string;
    paymentInstruction: string;
  } | null>(null);
  const [showMissionTimeline, setShowMissionTimeline] = useState(false);
  const [isStartTripConfirming, setIsStartTripConfirming] = useState(false);
  const [startTripRecoveryNote, setStartTripRecoveryNote] = useState<string | null>(null);
  const [pickupCodeInput, setPickupCodeInput] = useState("");
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
      const onRetry = () => setStatus("Connexion en cours...");
      const [offersResponse, historyResponse, profileResponse] =
        await Promise.all([
          withNetworkRetry(() => fetchDriverOffers(authClient), { maxAttempts: 3, onRetry }),
          withNetworkRetry(() => fetchMyTrips(authClient), { maxAttempts: 3, onRetry }),
          withNetworkRetry(() => fetchDriverProfile(authClient), { maxAttempts: 3, onRetry }),
        ]);
      const normalizedProfile = normalizeDriverProfileResponse(profileResponse);
      setOffers(offersResponse);
      setHistory(historyResponse);
      setDriverProfileId(normalizedProfile.profile.id);
      setDriverProfileStatus(normalizedProfile.profile.status);
      setDriverVerificationStatus(normalizedProfile.profile.verificationStatus);
      setDriverFatigue(normalizedProfile.profile.fatigue);
      const flow = resolveDriverActiveFlow({
        history: historyResponse,
        offers: offersResponse,
        reservationNow: Date.now(),
        driverProfileStatus: normalizedProfile.profile.status,
        driverVerificationStatus: normalizedProfile.profile.verificationStatus,
      });
      const activeTrip = flow.activeTrip;

      if (activeTrip) {
        try {
          const detail = await withNetworkRetry(
            () => fetchTripDetail(authClient, activeTrip.id),
            {
              maxAttempts: 3,
              onRetry: () => setStatus("Mise a jour de la course..."),
            },
          );
          setActiveTripDetail(detail);
          setTripDetailStatus(null);
        } catch {
          setActiveTripDetail(null);
          setTripDetailStatus(
            "Suivi detaille en cours de reprise. La mission reste active.",
          );
        }
      } else {
        setActiveTripDetail(null);
        setTripDetailStatus(null);
      }

      if (!silent) {
        setStatus(
          flow.canReceiveOffers && !flow.visibleOffers.length
            ? "Vous êtes prêt. Nous vous prévenons dès qu'une course arrive."
            : buildDriverDispatchStatusLabel({ flow }),
        );
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
      setDriverProfileId(null);
      setDriverProfileStatus("OFFLINE");
      setDriverVerificationStatus("PENDING");
    } finally {
      if (silent) {
        setIsRealtimeSyncing(false);
      }
      if (!silent) {
        setIsRefreshing(false);
      }
    }
  }, []);

  useLiveRefresh(() => loadDriverData(true), 2500);
  useDriverRealtimeStream(
    sessionToken,
    driverProfileId,
    (_eventType) => {
      setIsRealtimeSyncing(true);
      setStatus("Mise à jour des offres...");
      void loadDriverData(true);
    },
    {
      onHeartbeat: () => {
        setStatus("Offres à jour.");
      },
      onOpen: () => {
        setIsRealtimeSyncing(false);
        setStatus("Connexion rétablie.");
      },
      onError: () => {
        setIsRealtimeSyncing(false);
        setStatus("Réseau faible. Nouvelle tentative en cours.");
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
        driverVerificationStatus,
      }),
    [driverProfileStatus, driverVerificationStatus, history, offers, reservationNow],
  );
  const { activeTrip, activeFlowState, visibleOffers } = flow;
  const incomingOffer = useMemo(
    () => visibleOffers.find((offer) => offer.id === incomingOfferId) ?? null,
    [incomingOfferId, visibleOffers],
  );
  const incomingMoneyDisplay = useMemo(
    () => (incomingOffer ? resolveDriverOfferMoneyDisplay(incomingOffer) : null),
    [incomingOffer],
  );
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
  const missionStageCopy = useMemo(
    () => resolveMissionStageCopy(activeTrip?.status ?? ""),
    [activeTrip?.status],
  );
  const activePaymentMethodLabel = useMemo(
    () =>
      formatPaymentMethodLabel(
        activeTripDetail?.trip.paymentMethod ?? activeTrip?.paymentMethod,
      ),
    [activeTrip?.paymentMethod, activeTripDetail?.trip.paymentMethod],
  );
  const driverNextActionHint = useMemo(
    () => buildDriverNextActionHint(flow),
    [flow],
  );
  const startTripToggleState = useMemo<"idle" | "confirming" | "confirmed">(
    () =>
      activeTrip?.status === "IN_PROGRESS"
        ? "confirmed"
        : isStartTripConfirming
          ? "confirming"
          : "idle",
    [activeTrip?.status, isStartTripConfirming],
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
    setShowMissionTimeline(false);
    setIsStartTripConfirming(false);
    setPickupCodeInput("");
  }, [activeTrip?.id]);

  useEffect(() => {
    if (activeTrip?.status !== "DRIVER_ARRIVING") {
      setIsStartTripConfirming(false);
      setStartTripRecoveryNote(null);
    }
  }, [activeTrip?.status]);

  useEffect(() => {
    if (activeTrip?.status !== "DRIVER_ARRIVING") {
      setPickupCodeInput("");
    }
  }, [activeTrip?.status]);

  useEffect(() => {
    const previousVisibleOfferIds = previousVisibleOfferIdsRef.current;
    const nextVisibleOfferIds = visibleOffers.map((offer) => offer.id);

    if (!flow.canReceiveOffers) {
      setIncomingOfferId(null);
    } else if (!previousVisibleOfferIds && nextVisibleOfferIds.length > 0) {
      setIncomingOfferId(nextVisibleOfferIds[0]);
      setFreshOfferIds([nextVisibleOfferIds[0]]);
    } else if (previousVisibleOfferIds) {
      const { freshOfferIds: nextFreshOfferIds, expiredOfferIds } =
        resolveDriverReservationChangeSet(
          previousVisibleOfferIds,
          nextVisibleOfferIds,
        );

      if (nextFreshOfferIds.length > 0) {
        setFreshOfferIds(nextFreshOfferIds);
        setIncomingOfferId(nextFreshOfferIds[0]);
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

  async function runExclusiveDriverAction<T>(action: () => Promise<T>) {
    if (submissionLockRef.current) {
      return undefined;
    }

    submissionLockRef.current = true;
    setIsSubmitting(true);

    try {
      return await action();
    } finally {
      submissionLockRef.current = false;
      setIsSubmitting(false);
    }
  }

  async function recoverStartedTripAfterFailedUpdate(tripId: string) {
    try {
      const { authClient } = await restoreDriverSession();
      const latestHistory = await withNetworkRetry(() => fetchMyTrips(authClient), {
        maxAttempts: 2,
      });
      const recoveredTrip = latestHistory.recentTrips.find((trip) => trip.id === tripId);

      if (recoveredTrip?.status !== "IN_PROGRESS") {
        const detail = await withNetworkRetry(() => fetchTripDetail(authClient, tripId), {
          maxAttempts: 2,
        });

        if (detail.trip.status !== "IN_PROGRESS") {
          return false;
        }

        setActiveTripDetail(detail);
        setHistory((current) => ({
          ...current,
          recentTrips: current.recentTrips.map((trip) =>
            trip.id === tripId ? { ...trip, status: "IN_PROGRESS" } : trip,
          ),
        }));
        setStartTripRecoveryNote(null);
        setStatus("Course démarrée. Statut confirmé.");
        safeHaptics.notify("success");
        return true;
      }

      if (!recoveredTrip) {
        return false;
      }

      setHistory(latestHistory);
      setStartTripRecoveryNote(null);
      setStatus("Course démarrée. Statut confirmé.");
      safeHaptics.notify("success");
      return true;
    } catch {
      return false;
    }
  }

  async function handleAcceptOffer(rideRequestId: string) {
    safeHaptics.impact('medium');
    setIncomingOfferId(null);
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
      setStatus("Acceptation de l'offre...");

      try {
        const { authClient } = await restoreDriverSession();
        await acceptRideRequestWithApi(
          authClient,
          rideRequestId,
        );
        setStatus("Offre acceptée. Le trajet est prêt.");
        await loadDriverData();
      } catch (error) {
        const feedback = await resolveDriverAppError(error, {
          surface: "booking",
          fallback: "L'acceptation de l'offre a échoué.",
        });

        if (feedback.shouldClearSessionToken) {
          setSessionToken(null);
        }

        setStatus(feedback.message);
      }
    });
  }

  async function handleDeclineOffer(rideRequestId: string) {
    setIncomingOfferId(null);
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
      setStatus("Refus de l'offre...");

      try {
        const { authClient } = await restoreDriverSession();
        await declineDriverOfferWithApi(
          authClient,
          rideRequestId,
        );
        setStatus("Offre refusée. Vous recevrez une autre proposition.");
        await loadDriverData();
      } catch (error) {
        const feedback = await resolveDriverAppError(error, {
          surface: "booking",
          fallback: "Le refus de l'offre a échoué.",
        });

        if (feedback.shouldClearSessionToken) {
          setSessionToken(null);
        }

        setStatus(feedback.message);
      }
    });
  }

  // Route safety review is advisory only and surfaced in the
  // handleCompleteTrip confirmation below, never a client-side block. A driver
  // must always reach the authoritative trip system for a real completion decision;
  // a GPS/route warning is not proof of fraud.
  async function handleAdvanceTrip(
    tripId: string,
    nextStatus: "DRIVER_ARRIVING" | "IN_PROGRESS" | "COMPLETED",
  ) {
    return await runExclusiveDriverAction(async () => {
      setStatus(`Mise à jour de la course: ${formatOperationalStatus(nextStatus)}...`);

      try {
        const { authClient } = await restoreDriverSession();
        const response =
          nextStatus === "COMPLETED"
            ? await completeTripWithApi(authClient, tripId)
            : await updateTripStatusWithApi(authClient, tripId, nextStatus);
        setHistory((current) => ({
          ...current,
          recentTrips: current.recentTrips.map((trip) =>
            trip.id === tripId
              ? {
                  ...trip,
                  status: response.trip.status ?? nextStatus,
                  amount:
                    typeof response.trip.actualFare === "number"
                      ? response.trip.actualFare
                      : trip.amount,
                  paymentMethod:
                    response.trip.paymentMethod !== undefined
                      ? response.trip.paymentMethod
                      : trip.paymentMethod,
                }
              : trip,
          ),
        }));
        setStatus(`Course mise à jour: ${formatOperationalStatus(response.trip.status)}.`);
        const gross = toFiniteEarningsNumber(response.trip.actualFare);
        const net = toFiniteEarningsNumber(response.trip.driverPayout);
        const commission = toFiniteEarningsNumber(response.trip.platformFee);
        if (nextStatus === "COMPLETED" && gross !== null && net !== null) {
          const paymentLabel = formatPaymentMethodLabel(response.trip.paymentMethod);
          setCompletionFlash({
            fareLabel: formatDriverEarningsAmount(gross),
            commissionLabel: formatDriverEarningsAmount(commission ?? 0),
            netLabel: formatDriverEarningsAmount(net),
            paymentLabel,
            paymentInstruction:
              paymentLabel === "Espèces"
                ? "Encaissez le montant exact, confirmez avec le passager et gardez la course visible dans l'historique."
                : "Le passager finalise le paiement sur son téléphone. Vérifiez le statut avant de quitter la zone.",
          });
        }
        await loadDriverData(true);
        return true;
      } catch (error) {
        if (
          nextStatus === "IN_PROGRESS" &&
          (await recoverStartedTripAfterFailedUpdate(tripId))
        ) {
          return true;
        }

        const feedback = await resolveDriverAppError(error, {
          surface: "active-trip",
          fallback: "La mise à jour du trajet a échoué.",
        });

        if (feedback.shouldClearSessionToken) {
          setSessionToken(null);
        }

        const nextMessage =
          nextStatus === "IN_PROGRESS"
            ? "Départ non confirmé. Réessayez maintenant ou actualisez le trajet."
            : feedback.message;
        setStatus(nextMessage);
        if (nextStatus === "IN_PROGRESS") {
          setStartTripRecoveryNote(nextMessage);
        } else {
          Alert.alert(
            nextStatus === "COMPLETED" ? "Course non terminée" : "Mise à jour échouée",
            feedback.message,
          );
        }
        return false;
      }
    });
  }

  async function handleStartTripToggle(tripId: string) {
    if (isStartTripConfirming || isSubmitting) {
      return;
    }

    if (activeTrip?.id === tripId && activeTrip.status === "IN_PROGRESS") {
      setStatus("Course déjà démarrée. Continuez vers la destination.");
      setStartTripRecoveryNote(null);
      return;
    }

    const normalizedPickupCode = pickupCodeInput.replace(/\D/g, "").slice(0, 4);
    setPickupCodeInput(normalizedPickupCode);

    if (normalizedPickupCode.length !== 4) {
      setStatus("Demandez au passager son code à 4 chiffres avant de partir.");
      setStartTripRecoveryNote("Saisissez le code à 4 chiffres affiché au passager.");
      return;
    }

    safeHaptics.impact("medium");
    setIsStartTripConfirming(true);
    setStartTripRecoveryNote(null);
    setStatus("Vérification du code...");

    const started = await runExclusiveDriverAction(async () => {
      try {
        const { authClient } = await restoreDriverSession();
        await verifyPickupCodeWithApi(authClient, tripId, normalizedPickupCode);
        setPickupCodeInput("");
        await loadDriverData();
        setStatus("Course démarrée. Statut confirmé.");
        setStartTripRecoveryNote(null);
        return true;
      } catch (error) {
        if (await recoverStartedTripAfterFailedUpdate(tripId)) {
          setPickupCodeInput("");
          return true;
        }

        const feedback = await resolveDriverAppError(error, {
          surface: "active-trip",
          fallback: "Code non confirmé. Vérifiez avec le passager puis réessayez.",
        });

        if (feedback.shouldClearSessionToken) {
          setSessionToken(null);
        }

        setStatus(feedback.message);
        setStartTripRecoveryNote(feedback.message);
        return false;
      }
    });

    if (started) {
      setIsStartTripConfirming(false);
      return;
    }

    if (!started) {
      setIsStartTripConfirming(false);
    }
  }

  function handleCompleteTrip(tripId: string) {
    const grossLabel = formatDriverEarningsAmount(
      toFiniteEarningsNumber(activeTripDetail?.trip.actualFare ?? activeTrip?.amount) ?? 0,
    );
    const netLabel =
      formatDriverEarningsAmount(
        toFiniteEarningsNumber(
          activeTripDetail?.trip.driverPayout ?? activeTrip?.amount,
        ) ?? 0,
      );

    const safetyNote =
      driverRouteSafetyBrief.tone !== "teal"
        ? `\n\nAttention: ${driverRouteSafetyBrief.actionLabel}`
        : "";

    Alert.alert(
      "Terminer la course",
      `Confirmez seulement a la destination. Prix client: ${grossLabel}. Gain chauffeur: ${netLabel}. Paiement: ${activePaymentMethodLabel}.${safetyNote}`,
      [
        { text: "Retour", style: "cancel" },
        {
          text: "Terminer",
          style: "destructive",
          onPress: () => void handleAdvanceTrip(tripId, "COMPLETED"),
        },
      ],
    );
  }

  function handleDriverCancelTrip(tripId: string) {
    const REASONS = [
      "Passager introuvable",
      "Zone inaccessible",
      "Demande expirée",
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
        const response = await updateTripStatusWithApi(
          authClient,
          tripId,
          "CANCELLED",
          reason,
        );
        const cancellationMessage =
          response.trip.cancellationPolicy?.message ??
          "Course annulee. Vous repassez disponible.";
        await loadDriverData(true);
        setStatus(cancellationMessage);
      } catch (error) {
        const feedback = await resolveDriverAppError(error, {
          surface: "active-trip",
          fallback: "L'annulation de la course a échoué.",
        });
        if (feedback.shouldClearSessionToken) {
          setSessionToken(null);
        }
        setStatus(feedback.message);
      }
    });
  }

  async function handleReportIncident(tripId: string) {
    await runExclusiveDriverAction(async () => {
      setStatus("Signalement de l incident au support...");

      try {
        const { authClient } = await restoreDriverSession();
        await reportTripIncidentWithApi(authClient, tripId, {
          incidentType: "DRIVER_ALERT",
          details: "Signalement rapide envoye depuis l ecran chauffeur.",
          priority: 3,
        });
        setStatus("Incident signale. Le support est notifie.");
        await loadDriverData();
      } catch (error) {
        const feedback = await resolveDriverAppError(error, {
          surface: "safety",
          fallback: "Le signalement de l'incident a échoué.",
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
      setStatus("SOS chauffeur en cours: alerte envoyee...");

      try {
        const { authClient } = await restoreDriverSession();
        const response = await triggerTripSafetySosWithApi(authClient, tripId, {
          details: "SOS declenche depuis l'application chauffeur.",
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

    if (canDriverMarkArrived(activeTrip.status)) {
      return (
        <>
          <FlowActionButton
            disabled={isSubmitting}
            label="Je suis au point de départ"
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

    if (canDriverStartTrip(activeTrip.status)) {
      return (
        <View style={styles.codeBlock}>
          <View style={styles.departureChecklist}>
            <View style={styles.departureChecklistHeader}>
              <Text style={styles.departureChecklistTitle}>Départ sécurisé</Text>
              <Text style={styles.departureChecklistPill}>{activePaymentMethodLabel}</Text>
            </View>
            <View style={styles.departureChecklistRow}>
              <Text style={styles.departureChecklistDot}>1</Text>
              <Text style={styles.departureChecklistText}>
                Passager à bord, prêt à partir
              </Text>
            </View>
            <View style={styles.departureChecklistRow}>
              <Text style={styles.departureChecklistDot}>2</Text>
              <Text style={styles.departureChecklistText}>
                Départ confirmé au bon point de prise en charge
              </Text>
            </View>
            <View style={styles.departureChecklistRow}>
              <Text style={styles.departureChecklistDot}>3</Text>
              <Text style={styles.departureChecklistText}>
                Prix et gain visibles, aucun supplément hors app
              </Text>
            </View>
          </View>
          <TripStartAction
            state={startTripToggleState}
            disabled={isSubmitting}
            onPress={() => void handleStartTripToggle(activeTrip.id)}
          />
          <View style={styles.pickupCodeEntry}>
            <Text style={styles.pickupCodeLabel}>Code passager</Text>
            <TextInput
              accessibilityLabel="Code passager"
              placeholder="Code à 4 chiffres"
              value={pickupCodeInput}
              onChangeText={(value) =>
                setPickupCodeInput(value.replace(/\D/g, "").slice(0, 4))
              }
              keyboardType="number-pad"
              maxLength={4}
              secureTextEntry
              style={styles.pickupCodeInput}
            />
            <OrbiButton
              label="Vérifier le code et démarrer"
              onPress={() => void handleStartTripToggle(activeTrip.id)}
              disabled={isSubmitting || isStartTripConfirming || pickupCodeInput.length !== 4}
              tone="teal"
              style={styles.pickupCodeButton}
            />
          </View>
          {startTripRecoveryNote ? (
            <OrbiStatusBanner
              tone="amber"
              title="Départ non confirmé"
              message={startTripRecoveryNote}
            />
          ) : startTripToggleState === "confirming" ? (
            <OrbiStatusBanner
              tone="sky"
              title="Départ en confirmation"
              message="Gardez le passager à bord. Le départ sera confirmé automatiquement si le réseau ralentit."
            />
          ) : null}
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

    if (canDriverCompleteTrip(activeTrip.status)) {
      return (
        <View style={styles.codeBlock}>
          <FlowActionButton
            disabled={isSubmitting}
            label="Terminer la course"
            sublabel={`Client ${riderTrustSnapshot?.fareLabel ?? "prix visible"} · Gain ${riderTrustSnapshot?.driverPayoutLabel ?? formatDriverEarningsAmount(activeTrip.amount)} · ${activePaymentMethodLabel}`}
            onPress={() => handleCompleteTrip(activeTrip.id)}
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
          {driverRouteSafetyBrief.tone !== "teal" ? (
            <Text style={styles.routeSafetyBlockNote}>
              Avant de terminer: {driverRouteSafetyBrief.actionLabel}
            </Text>
          ) : null}
        </View>
      );
    }

    return null;
  }

  return (
    <OrbiScreen audience="driver" style={styles.safe}>
      {incomingOffer && !activeTrip ? (
        <View style={styles.incomingBackdrop}>
          <Pressable
            accessibilityLabel="Fermer l'offre"
            style={styles.incomingScrim}
            onPress={() => setIncomingOfferId(null)}
          />
          {incomingOffer ? (
            <View style={styles.incomingSheet}>
              <View style={styles.incomingGrabber} />
              <View style={styles.incomingHeader}>
                <View style={styles.incomingPulse}>
                  <View style={styles.incomingPulseDot} />
                </View>
                <View style={styles.incomingTitleCol}>
                  <Text style={styles.incomingEyebrow}>Nouvelle course</Text>
                  <Text style={styles.incomingTitle} numberOfLines={2}>
                    {incomingOffer.pickup}
                  </Text>
                </View>
                <View style={styles.incomingMoney}>
                  <Text style={styles.incomingMoneyLabel}>{incomingMoneyDisplay?.label}</Text>
                  <Text style={styles.incomingFare}>{incomingMoneyDisplay?.amountLabel}</Text>
                </View>
              </View>
              <View style={styles.incomingRoute}>
                <Text style={styles.incomingRouteLabel}>Départ</Text>
                <Text style={styles.incomingRouteText} numberOfLines={2}>
                  {incomingOffer.pickup}
                </Text>
                <Text style={styles.incomingRouteLabel}>Destination</Text>
                <Text style={styles.incomingRouteText} numberOfLines={2}>
                  {incomingOffer.destination}
                </Text>
              </View>
              <View style={styles.incomingMetaRow}>
                <View style={styles.incomingMetaItem}>
                  <Text style={styles.incomingMetricLabel}>Véhicule</Text>
                  <Text style={styles.incomingMetricValue}>
                    {formatOfferVehicleTypeLabel(incomingOffer.category)}
                  </Text>
                </View>
                <View style={styles.incomingMetaItem}>
                  <Text style={styles.incomingMetricLabel}>Paiement</Text>
                  <Text style={styles.incomingMetricValue}>
                    {formatPaymentMethodLabel(incomingOffer.paymentMethod)}
                  </Text>
                </View>
              </View>
              <View style={styles.incomingMetrics}>
                <View style={styles.incomingMetric}>
                  <Text style={styles.incomingMetricValue}>
                    {formatDriverOfferDistance(incomingOffer.pickupDistanceKm, "À confirmer")}
                  </Text>
                  <Text style={styles.incomingMetricLabel}>Prise en charge</Text>
                </View>
                <View style={styles.incomingMetric}>
                  <Text style={styles.incomingMetricValue}>
                    {formatDriverOfferDistance(incomingOffer.distanceKm, "À confirmer")}
                  </Text>
                  <Text style={styles.incomingMetricLabel}>Trajet</Text>
                </View>
                <View style={styles.incomingMetric}>
                  <Text style={styles.incomingMetricValue}>
                    {incomingOffer.reservationExpiresAt
                      ? formatReservationCountdown(
                          incomingOffer.reservationExpiresAt,
                          reservationNow,
                        )
                      : "À confirmer"}
                  </Text>
                  <Text style={styles.incomingMetricLabel}>Temps restant</Text>
                </View>
              </View>
              <View style={styles.incomingActions}>
                <OrbiButton
                  label="Refuser"
                  onPress={() => handleDeclineOffer(incomingOffer.id)}
                  disabled={isSubmitting}
                  variant="secondary"
                  tone="danger"
                  style={styles.incomingAction}
                />
                <OrbiButton
                  label="Accepter"
                  onPress={() => handleAcceptOffer(incomingOffer.id)}
                  disabled={isSubmitting}
                  tone="teal"
                  style={styles.incomingAction}
                />
              </View>
            </View>
          ) : null}
        </View>
      ) : null}
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
          <OrbiSurface tone="teal" style={styles.completionCard}>
            <View style={styles.completionCheckWrap}>
              <View style={styles.completionCheck} />
            </View>
            <View style={styles.completionCopy}>
              <Text style={styles.completionTitle}>Course terminée !</Text>
              <Text style={styles.completionFare}>Prix client : {completionFlash.fareLabel}</Text>
              <Text style={styles.completionFare}>Commission : {completionFlash.commissionLabel}</Text>
              <Text style={styles.completionNet}>Votre gain : {completionFlash.netLabel}</Text>
              <Text style={styles.completionPayment}>Paiement : {completionFlash.paymentLabel}</Text>
              <Text style={styles.completionInstruction}>
                {completionFlash.paymentInstruction}
              </Text>
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

        {/* ── Realtime notices ── */}
        {freshOfferIds.length > 0 ? (
          <TransitionNoticeCard
            label={freshOfferIds.length > 1 ? `${freshOfferIds.length} nouvelles offres` : "Nouvelle offre"}
            message="Consultez les détails avant d'accepter."
            tone="sky"
          />
        ) : null}
        {recentlyExpiredCount > 0 ? (
          <TransitionNoticeCard
            label={recentlyExpiredCount > 1 ? `${recentlyExpiredCount} offres expirées` : "Offre expirée"}
            message="Cette course n'est plus disponible."
            tone="rose"
          />
        ) : null}
        {activeTripTransitionLabel && !activeTrip ? (
          <TransitionNoticeCard label="Mise à jour" message={activeTripTransitionLabel} tone="sky" />
        ) : null}

        {/* ── Active mission ── */}
        {activeTrip ? (
          <OrbiSurface style={styles.missionCard}>
            {/* Section label — accessible for tests */}
            <Text style={styles.missionSectionLabel}>Course active</Text>

            {/* Status pill */}
            <View style={styles.missionStatusRow}>
              {(() => {
                const inProgress = activeTrip.status === "IN_PROGRESS";
                const bg = theme.colors.backgroundAlt;
                const color = inProgress ? theme.colors.teal : theme.colors.text;
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

            <TripStageTracker status={activeTrip.status} audience="driver" style={styles.stageTracker} />

            {/* Navigation-first map */}
            {activeTripDetail?.trip.pickupLatitude != null ? (
              <View style={styles.navigationMapShell}>
                {activeTrip.status === "MATCHED" || activeTrip.status === "DRIVER_ARRIVING" ? (
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
                    phase="trip"
                    style={styles.missionMap}
                  />
                )}
                <View style={styles.navigationMapBadge}>
                  <Text style={styles.navigationMapBadgeText}>
                    {activeTrip.status === "IN_PROGRESS" ? "Vers destination" : "Vers pickup"}
                  </Text>
                </View>
              </View>
            ) : (
              <OrbiStatusBanner
                title="Carte en attente"
                message="La carte s'affichera dès que le trajet sera confirmé."
                tone="amber"
              />
            )}

            <View style={styles.missionNavigationPanel}>
              <Text style={styles.missionStageEyebrow}>{missionStageCopy.eyebrow}</Text>
                <Text style={styles.missionStageTitle} numberOfLines={2}>{missionStageCopy.title}</Text>
              <Text style={styles.missionStageHint} numberOfLines={2}>
                {driverNextActionHint}
              </Text>
              <View style={styles.missionMetricRow}>
                <View style={styles.missionMetric}>
                  <Text style={styles.missionMetricLabel}>Arrivee</Text>
                  <Text style={styles.missionMetricValue}>
                    {driverRouteProgress?.etaLabel ?? "Calcul en cours"}
                  </Text>
                </View>
                <View style={styles.missionMetric}>
                  <Text style={styles.missionMetricLabel}>Distance</Text>
                  <Text style={styles.missionMetricValue}>
                    {driverRouteProgress?.distanceLabel ?? "En attente"}
                  </Text>
                </View>
              </View>
              <View style={styles.missionPaymentNotice}>
                <Text style={styles.missionPaymentLabel}>Gain chauffeur</Text>
                <Text style={styles.missionPaymentValue} numberOfLines={1}>
                  {riderTrustSnapshot?.driverPayoutLabel ?? formatDriverEarningsAmount(activeTrip.amount)}
                </Text>
              </View>
              <View style={styles.missionPaymentNotice}>
                <Text style={styles.missionPaymentLabel}>Paiement</Text>
                <Text style={styles.missionPaymentValue} numberOfLines={1}>{activePaymentMethodLabel}</Text>
              </View>
              {driverRouteSafetyBrief.tone !== "teal" ? (
                <Text style={styles.routeSafetyBlockNote}>
                  Avant de terminer: {driverRouteSafetyBrief.actionLabel}
                </Text>
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
              <PersonBadge
                name={riderTrustSnapshot?.riderName ?? activeTrip.counterpartyName ?? "Passager assigné"}
                subtitle={riderTrustSnapshot?.vehicleLabel}
                style={styles.riderBadge}
              />
              {riderTrustSnapshot?.fareLabel ? (
                <View style={styles.riderFareColumn}>
                  <Text style={styles.riderFare}>{riderTrustSnapshot.fareLabel}</Text>
                  {riderTrustSnapshot.driverPayoutLabel ? (
                    <Text style={styles.riderNetFare}>
                      Gain {riderTrustSnapshot.driverPayoutLabel}
                    </Text>
                  ) : null}
                </View>
              ) : null}
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
              <View style={styles.supportTimelineWrap}>
                <Pressable
                  onPress={() => setShowMissionTimeline((value) => !value)}
                  style={styles.supportTimelineToggle}
                >
                  <Text style={styles.supportTimelineToggleText}>
                    {showMissionTimeline ? "Masquer le journal" : "Journal de course"}
                  </Text>
                </Pressable>
                {showMissionTimeline ? (
                  <LiveTimeline
                    events={activeTripDetail.trip.timeline}
                    freshEventIds={freshTimelineEventIds}
                  />
                ) : null}
              </View>
            ) : null}
          </OrbiSurface>
        ) : null}

        {/* ── Offline / suspended ── */}
        {!activeTrip && flow.operationalStatus === "SUSPENDED" ? (
          <OrbiStatusBanner
            title="Compte suspendu"
            message="Les offres restent fermées jusqu'à réactivation du compte."
            tone="danger"
          />
        ) : !activeTrip && flow.availabilityStatus !== "ONLINE" ? (
          <View style={styles.compactOfflineNotice}>
            <View style={styles.compactOfflineDot} />
            <Text style={styles.compactOfflineText}>Hors ligne · passez en ligne pour recevoir des courses</Text>
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
          <OrbiSurface style={styles.emptyState}>
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
                    {flow.canReceiveOffers ? "Disponible" : "En attente"}
                </Text>
                </View>
                <Text style={styles.emptyTitle}>Aucune offre active</Text>
                <Text style={styles.emptyMeta} numberOfLines={2}>
                  {flow.canReceiveOffers
                    ? "Vous êtes disponible. Les courses apparaîtront ici."
                    : "Passez en ligne depuis Accueil quand vous êtes prêt."}
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
                <Text style={styles.emptyCheckMeta}>Actif</Text>
              </View>
              <View style={styles.emptyCheckItem}>
                <Text style={styles.emptyCheckTitle}>Compte</Text>
                <Text style={styles.emptyCheckMeta}>Valide</Text>
              </View>
              <View style={styles.emptyCheckItem}>
                <Text style={styles.emptyCheckTitle}>Mission</Text>
                <Text style={styles.emptyCheckMeta}>{flow.canReceiveOffers ? "Prêt" : "Pause"}</Text>
              </View>
            </View>
          </OrbiSurface>
        ) : null}

        {/* Refresh — accessible for tests + users */}
        <OrbiButton
          label={isRefreshing ? "Actualisation..." : "Actualiser"}
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
  safe: { flex: 1, backgroundColor: '#FFFFFF' },
  incomingBackdrop: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "flex-end",
    zIndex: 20,
  },
  incomingScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.52)",
  },
  incomingSheet: {
    margin: 12,
    borderRadius: 4,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E8E8E8',
    padding: 12,
    gap: 10,
  },
  incomingGrabber: {
    alignSelf: "center",
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#D8D8D8',
  },
  incomingHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  incomingPulse: {
    width: 38,
    height: 38,
    borderRadius: 4,
    backgroundColor: '#F3F3F3',
    alignItems: "center",
    justifyContent: "center",
  },
  incomingPulseDot: {
    width: 16,
    height: 16,
    borderRadius: 4,
    backgroundColor: '#111111',
  },
  incomingTitleCol: { flex: 1, gap: 3 },
  incomingEyebrow: {
    fontSize: 11,
    fontWeight: "800",
    fontFamily: "Inter_700Bold",
    color: '#111111',
    textTransform: "uppercase",
  },
  incomingTitle: {
    fontSize: 16,
    fontWeight: "800",
    fontFamily: "Raleway_800ExtraBold",
    color: '#111111',
  },
  incomingMoney: {
    alignItems: "flex-end",
    maxWidth: 128,
    gap: 2,
  },
  incomingMoneyLabel: {
    fontSize: 10,
    fontWeight: "800",
    fontFamily: "Inter_700Bold",
    color: '#6B6B6B',
    textTransform: "uppercase",
  },
  incomingFare: {
    fontSize: 18,
    fontWeight: "800",
    fontFamily: "Inter_700Bold",
    color: '#111111',
    textAlign: "right",
  },
  incomingRoute: {
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#E8E8E8',
    backgroundColor: '#F7F7F7',
    padding: 10,
    gap: 4,
  },
  incomingRouteLabel: {
    fontSize: 11,
    fontWeight: "700",
    fontFamily: "Inter_700Bold",
    color: '#6B6B6B',
    textTransform: "uppercase",
  },
  incomingRouteText: {
    fontSize: 14,
    fontWeight: "600",
    fontFamily: "Inter_600SemiBold",
    color: '#111111',
    lineHeight: 19,
  },
  incomingMetrics: {
    flexDirection: "row",
    gap: 8,
  },
  incomingMetaRow: {
    flexDirection: "row",
    gap: 8,
  },
  incomingMetaItem: {
    flex: 1,
    minHeight: 48,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#E8E8E8',
    backgroundColor: '#F7F7F7',
    paddingHorizontal: 9,
    paddingVertical: 8,
    justifyContent: "center",
    gap: 2,
  },
  incomingMetric: {
    flex: 1,
    minHeight: 54,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#E8E8E8',
    paddingHorizontal: 9,
    paddingVertical: 8,
    justifyContent: "center",
    gap: 2,
  },
  incomingMetricValue: {
    fontSize: 13,
    fontWeight: "800",
    fontFamily: "Inter_700Bold",
    color: '#111111',
  },
  incomingMetricLabel: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: '#6B6B6B',
  },
  incomingActions: {
    flexDirection: "row",
    gap: 10,
  },
  incomingAction: { flex: 1 },
  header: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingHorizontal: 16, paddingTop: 12, paddingBottom: 10,
    borderBottomWidth: 1, borderBottomColor: '#E8E8E8',
  },
  headerTitle: { fontSize: 20, fontWeight: "900", fontFamily: "Raleway_800ExtraBold", color: '#111111' },
  headerRight: { flexDirection: "row", alignItems: "center", gap: 10 },
  onlineDot: { width: 9, height: 9, borderRadius: 5 },
  headerRefreshBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#F3F3F3', alignItems: "center", justifyContent: "center" },
  content: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 110, gap: 10 },
  completionCard: {
    flexDirection: "row", alignItems: "center", gap: 12,
    padding: 14,
  },
  completionCheckWrap: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#111111', alignItems: "center", justifyContent: "center" },
  completionCheck: { width: 12, height: 12, borderRadius: 6, backgroundColor: "#FFFFFF" },
  completionCopy: { flex: 1, gap: 2 },
  completionTitle: { fontSize: 15, fontWeight: "800", fontFamily: "Inter_700Bold", color: '#111111' },
  completionFare: { fontSize: 13, color: '#525252', fontFamily: "Inter_400Regular" },
  completionNet: { fontSize: 13, fontWeight: "700", fontFamily: "Inter_600SemiBold", color: '#111111' },
  completionPayment: { fontSize: 12, fontWeight: "700", fontFamily: "Inter_700Bold", color: '#525252' },
  completionInstruction: {
    marginTop: 4,
    fontSize: 12,
    lineHeight: 17,
    color: '#111111',
    fontFamily: "Inter_600SemiBold",
  },
  completionClose: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#F3F3F3', alignItems: "center", justifyContent: "center" },
  statusNotice: { fontSize: 13, color: '#525252', fontFamily: "Inter_400Regular", paddingHorizontal: 2 },
  compactOfflineNotice: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 4,
    backgroundColor: '#F3F3F3',
    borderWidth: 1,
    borderColor: '#E8E8E8',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  compactOfflineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#111111',
  },
  compactOfflineText: {
    flex: 1,
    fontSize: 12,
    fontWeight: "700",
    fontFamily: "Inter_700Bold",
    color: '#525252',
  },
  missionCard: { padding: 9, gap: 8, borderColor: '#E8E8E8', borderRadius: 4, backgroundColor: '#FFFFFF' },
  stageTracker: { paddingHorizontal: 2 },
  missionStatusRow: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  missionStatusPill: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 4, paddingHorizontal: 10, paddingVertical: 5 },
  missionStatusDot: { width: 7, height: 7, borderRadius: 4 },
  missionStatusLabel: { fontSize: 13, fontWeight: "700", fontFamily: "Inter_700Bold" },
  missionTransition: { fontSize: 12, color: '#6B6B6B', fontFamily: "Inter_400Regular" },
  missionRoute: { backgroundColor: '#FFFFFF', borderRadius: 4, borderWidth: 1, borderColor: '#E8E8E8', paddingHorizontal: 12, paddingVertical: 2 },
  missionRouteRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8 },
  missionRouteDot: { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  missionRouteSep: { height: 1, backgroundColor: '#E8E8E8', marginLeft: 18 },
  missionRouteText: { flex: 1, fontSize: 13, fontWeight: "600", fontFamily: "Inter_500Medium", color: '#111111' },
  riderCard: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: '#FFFFFF', borderRadius: 4, borderWidth: 1, borderColor: '#E8E8E8', padding: 10 },
  riderBadge: { flex: 1 },
  riderFareColumn: { alignItems: "flex-end", gap: 2 },
  riderFare: { fontSize: 16, fontWeight: "800", fontFamily: "Inter_700Bold", color: '#111111' },
  riderNetFare: { fontSize: 11, fontWeight: "700", fontFamily: "Inter_700Bold", color: '#6B6B6B' },
  navigationMapShell: {
    position: "relative",
    borderRadius: 4,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: '#E8E8E8',
    backgroundColor: '#F3F3F3',
  },
  missionMap: { height: 300, borderRadius: 4, overflow: "hidden" },
  navigationMapBadge: {
    position: "absolute",
    left: 12,
    top: 12,
    borderRadius: 4,
    backgroundColor: "rgba(0,0,0,0.82)",
    paddingHorizontal: 11,
    paddingVertical: 6,
  },
  navigationMapBadgeText: {
    fontSize: 11,
    fontWeight: "800",
    fontFamily: "Inter_700Bold",
    color: "#FFFFFF",
    textTransform: "uppercase",
  },
  missionNavigationPanel: {
    gap: 7,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#E8E8E8',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  missionStageEyebrow: {
    fontSize: 10,
    fontWeight: "800",
    fontFamily: "Inter_700Bold",
    color: '#6B6B6B',
    textTransform: "uppercase",
  },
  missionStageTitle: {
    fontSize: 17,
    lineHeight: 21,
    fontWeight: "800",
    fontFamily: "Raleway_800ExtraBold",
    color: '#111111',
  },
  missionStageHint: {
    fontSize: 12,
    color: '#525252',
    fontFamily: "Inter_400Regular",
    lineHeight: 17,
  },
  missionMetricRow: { flexDirection: "row", gap: 8 },
  missionMetric: {
    flex: 1,
    minHeight: 52,
    borderRadius: 4,
    backgroundColor: '#F7F7F7',
    borderWidth: 1,
    borderColor: '#E8E8E8',
    paddingHorizontal: 9,
    paddingVertical: 8,
    gap: 3,
  },
  missionMetricLabel: {
    fontSize: 10,
    fontWeight: "800",
    fontFamily: "Inter_700Bold",
    color: '#6B6B6B',
    textTransform: "uppercase",
  },
  missionMetricValue: {
    fontSize: 13,
    fontWeight: "800",
    fontFamily: "Inter_700Bold",
    color: '#111111',
    lineHeight: 17,
  },
  missionPaymentNotice: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    borderRadius: 4,
    backgroundColor: '#F7F7F7',
    borderWidth: 1,
    borderColor: '#E8E8E8',
    paddingHorizontal: 9,
    paddingVertical: 8,
  },
  missionPaymentLabel: {
    fontSize: 10,
    fontWeight: "800",
    fontFamily: "Inter_700Bold",
    color: '#6B6B6B',
    textTransform: "uppercase",
  },
  missionPaymentValue: {
    flexShrink: 1,
    fontSize: 13,
    fontWeight: "800",
    fontFamily: "Inter_700Bold",
    color: '#111111',
    textAlign: "right",
  },
  missionActions: { gap: 7 },
  secondaryActions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  secondaryBtn: { flexGrow: 1, flexBasis: "47%", minHeight: 44, borderRadius: 4 },
  tripDetailStatus: { fontSize: 12, color: '#6B6B6B', fontFamily: "Inter_400Regular" },
  supportTimelineWrap: { gap: 8 },
  supportTimelineToggle: {
    alignSelf: "flex-start",
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#E8E8E8',
    backgroundColor: '#F3F3F3',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  supportTimelineToggleText: {
    fontSize: 12,
    fontWeight: "800",
    fontFamily: "Inter_700Bold",
    color: '#525252',
  },
  emptyState: {
    padding: 12,
    gap: 10,
    borderWidth: 1,
    borderColor: '#E8E8E8',
    backgroundColor: '#FFFFFF',
    borderRadius: 4,
  },
  emptyHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  emptyCopy: {
    flex: 1,
    gap: 5,
  },
  emptySignal: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    borderRadius: 4,
    backgroundColor: '#F3F3F3',
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  emptySignalDot: { width: 8, height: 8, borderRadius: 4 },
  emptySignalText: {
    fontSize: 11,
    fontWeight: "800",
    fontFamily: "Inter_700Bold",
    color: '#525252',
    textTransform: "uppercase",
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: "800",
    fontFamily: "Inter_700Bold",
    color: '#111111',
    lineHeight: 21,
  },
  emptyMeta: {
    fontSize: 12,
    color: '#6B6B6B',
    fontFamily: "Inter_400Regular",
    lineHeight: 17,
  },
  emptyRadar: {
    width: 54,
    height: 54,
    borderRadius: 4,
    backgroundColor: '#F3F3F3',
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  emptyRadarRing: {
    position: "absolute",
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    borderColor: '#D8D8D8',
  },
  emptyRadarDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#111111',
    borderWidth: 3,
    borderColor: "#FFFFFF",
  },
  emptyChecklist: { flexDirection: "row", gap: 6 },
  emptyCheckItem: {
    flex: 1,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#E8E8E8',
    backgroundColor: '#F7F7F7',
    paddingHorizontal: 8,
    paddingVertical: 7,
    gap: 2,
  },
  emptyCheckTitle: {
    fontSize: 9,
    fontWeight: "800",
    fontFamily: "Inter_700Bold",
    color: '#6B6B6B',
    textTransform: "uppercase",
  },
  emptyCheckMeta: {
    fontSize: 11,
    fontWeight: "800",
    fontFamily: "Inter_700Bold",
    color: '#111111',
  },
  disabled: { opacity: 0.38 },
  codeBlock: { gap: 10 },
  meta: { fontSize: 13, color: '#525252', fontFamily: "Inter_400Regular", lineHeight: 18 },
  departureChecklist: {
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#E8E8E8',
    backgroundColor: '#F7F7F7',
    paddingHorizontal: 12,
    paddingVertical: 11,
    gap: 8,
  },
  departureChecklistHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    paddingBottom: 2,
  },
  departureChecklistTitle: {
    fontSize: 13,
    fontWeight: "800",
    fontFamily: "Inter_700Bold",
    color: '#111111',
  },
  departureChecklistPill: {
    borderRadius: 4,
    overflow: "hidden",
    backgroundColor: theme.colors.text,
    color: theme.colors.textInverse,
    paddingHorizontal: 9,
    paddingVertical: 4,
    fontSize: 10,
    fontWeight: "800",
    fontFamily: "Inter_700Bold",
  },
  departureChecklistRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  departureChecklistDot: {
    width: 20,
    height: 20,
    borderRadius: 4,
    overflow: "hidden",
    backgroundColor: theme.colors.text,
    color: theme.colors.textInverse,
    textAlign: "center",
    fontSize: 11,
    lineHeight: 20,
    fontWeight: "800",
    fontFamily: "Inter_700Bold",
  },
  departureChecklistText: {
    flex: 1,
    minWidth: 0,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "600",
    fontFamily: "Inter_600SemiBold",
    color: '#525252',
  },
  pickupCodeEntry: {
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#E8E8E8',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 11,
    gap: 8,
  },
  pickupCodeLabel: {
    fontSize: 12,
    fontWeight: "800",
    fontFamily: "Inter_700Bold",
    color: '#111111',
  },
  pickupCodeInput: {
    minHeight: 48,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#D8D8D8',
    backgroundColor: '#F7F7F7',
    paddingHorizontal: 12,
    fontSize: 18,
    fontWeight: "800",
    fontFamily: "Inter_700Bold",
    color: '#111111',
    letterSpacing: 0,
  },
  pickupCodeButton: {
    borderRadius: 4,
  },
  routeSafetyBlockNote: { fontSize: 12, color: '#525252', fontFamily: "Inter_400Regular", lineHeight: 17 },
  // Mission labels
  missionSectionLabel: { fontSize: 11, fontWeight: "800", fontFamily: "Inter_700Bold", color: '#111111', textTransform: "uppercase", letterSpacing: 0 },
  missionSignalsPanel: { gap: 7 },
  missionSignalGrid: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  missionSignalTile: { width: "48%", minHeight: 44, borderRadius: 4, borderWidth: 1, borderColor: '#E8E8E8', backgroundColor: '#FFFFFF', paddingHorizontal: 10, paddingVertical: 8, gap: 2 },
  missionSignalTileDanger: { borderColor: "#BDBDB7", backgroundColor: "#F7F7F4" },
  missionSignalLabel: { fontSize: 9, fontWeight: "800", fontFamily: "Inter_700Bold", color: '#6B6B6B', textTransform: "uppercase", letterSpacing: 0 },
  missionSignalValue: { fontSize: 11, fontWeight: "800", fontFamily: "Inter_700Bold", color: '#111111', lineHeight: 15 },
  routeMonitoringCompact: { gap: 2 },
  missionDetailLabel: { fontSize: 12, fontWeight: "800", fontFamily: "Inter_700Bold", color: '#525252' },
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
    borderRadius: 4,
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
    borderRadius: 4,
    backgroundColor: theme.colors.textSoft,
  },
  closeLineA: {
    transform: [{ rotate: "45deg" }],
  },
  closeLineB: {
    transform: [{ rotate: "-45deg" }],
  },
});

const makeTripStartActionStyles = (theme: OrbiTheme) => StyleSheet.create({
  button: {
    minHeight: 70,
    borderRadius: 4,
    paddingVertical: 9,
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
    gap: 12,
    borderWidth: 1,
    backgroundColor: theme.colors.text,
    borderColor: theme.colors.text,
  },
  buttonConfirmed: {
    backgroundColor: theme.colors.text,
    borderColor: theme.colors.text,
  },
  buttonPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.99 }],
  },
  buttonDisabled: {
    opacity: 0.82,
  },
  iconWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: theme.colors.surface,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  iconText: {
    color: theme.colors.text,
    fontSize: 24,
    fontWeight: "900",
    fontFamily: "Inter_700Bold",
    lineHeight: 16,
  },
  copy: {
    flex: 1,
    alignItems: "flex-start",
    justifyContent: "center",
    gap: 3,
    minWidth: 0,
  },
  label: {
    color: theme.colors.textInverse,
    fontSize: 19,
    fontWeight: "900",
    fontFamily: "Inter_700Bold",
    textAlign: "left",
    lineHeight: 22,
  },
  hint: {
    color: "rgba(255,255,255,0.72)",
    fontSize: 12,
    fontWeight: "700",
    fontFamily: "Inter_700Bold",
    textAlign: "left",
  },
});
