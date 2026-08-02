import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Animated,
  Easing,
  Image,
  Linking,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  Share,
  Text,
  StyleSheet,
  View,
} from "react-native";
import {
  cancelRideRequestWithApi,
  canRiderCancelTrip,
  canRiderStopTrip,
  createSupportTicketWithApi,
  createTripShareLinkWithApi,
  fetchMyTrips,
  fetchTripDetail,
  getMySupportTicketsWithApi,
  isActiveTripLifecycleStatus,
  reportTripIncidentWithApi,
  triggerTripSafetySosWithApi,
  withNetworkRetry,
  type CreateSupportTicketPayload,
  type MyTripsResponse,
  type SupportTicket,
  type TripDetailResponse,
  updateTripStatusWithApi,
} from "@orbi/api";
import {
  describeRealtimeEvent,
  describeRealtimeConnection,
  formatOperationalStatus,
  type OrbiTheme,
} from "@orbi/ui";
import {
  OrbiButton,
  OrbiMetricTile,
  OrbiStatusBanner,
  OrbiSurface,
  safeHaptics,
  TripStageTracker,
  useOrbiTheme,
} from "@orbi/ui/native";
import {
  estimateRiderPickupEtaMinutes,
  formatRiderDistanceKm,
  formatRiderMoneyAmount,
  formatRiderRatingLabel,
  formatRiderShortDate,
  resolveRiderMoneyAmount,
} from "../../lib/rider-display-format";
import { restoreRiderSession } from "../../lib/auth";
import { useTranslation } from "../../lib/i18n";
import {
  buildRiderFlowTransitionLabel,
  buildRiderDriverTrustSnapshot,
  buildRiderLiveRouteProgress,
  buildRiderNextActionHint,
  resolveRiderActiveFlow,
} from "../../lib/rider-active-flow";
import { useLiveRefresh } from "../../lib/use-live-refresh";
import { useRiderRealtimeStream } from "../../lib/use-rider-realtime-stream";
import { useRiderPosition } from "../../lib/use-rider-position";
import { resolveRiderAppError } from "../../lib/session-feedback";
import { TripMapView } from "../../lib/trip-map-view";
import { resolveOrbiApiBaseUrlForRuntime } from "@orbi/config";
import {
  fallbackRiderTrips,
  normalizeRiderTripsResponse,
} from "../../lib/rider-trips-normalizer";
import { filterRiderVisibleSupportTickets } from "../../lib/rider-support-tickets";

const QUICK_SUPPORT_ACTIONS = [
  {
    key: "payment",
    label: "Paiement",
    subject: "Paiement a verifier",
    category: "payment",
    description:
      "Le passager demande une verification paiement depuis l activite rider.",
  },
  {
    key: "refund",
    label: "Remboursement",
    subject: "Remboursement a suivre",
    category: "payment",
    description:
      "Le passager demande un suivi remboursement depuis l activite rider.",
  },
  {
    key: "fare",
    label: "Prix",
    subject: "Prix de course conteste",
    category: "trip",
    description:
      "Le passager demande une revue du prix affiche ou facture depuis l activite rider.",
  },
  {
    key: "cancellation",
    label: "Annulation",
    subject: "Annulation a revoir",
    category: "trip",
    description:
      "Le passager demande une revue d annulation depuis l activite rider.",
  },
] as const satisfies ReadonlyArray<
  {
    key: string;
    label: string;
    subject: string;
    category: NonNullable<CreateSupportTicketPayload["category"]>;
    description: string;
  }
>;

function formatRiderPaymentMethodLabel(paymentMethod: string | null | undefined) {
  switch ((paymentMethod ?? "MOBILE_MONEY").toUpperCase()) {
    case "CASH":
      return "Cash";
    case "WALLET":
      return "Wallet Orbi";
    case "MOBILE_MONEY":
    default:
      return "Mobile Money";
  }
}

function formatRiderReceiptProvider(provider: string | null | undefined) {
  switch ((provider ?? '').toUpperCase()) {
    case 'ORANGE_MONEY':
      return 'Orange Money';
    case 'MOOV_MONEY':
      return 'Moov Money';
    case 'WALLET':
      return 'Wallet Orbi';
    case 'CASH':
      return 'Cash';
    case 'MOBILE_MONEY':
      return 'Mobile Money';
    default:
      return provider ? formatOperationalStatus(provider) : 'Paiement';
  }
}

export default function ActivityScreen() {
  const router = useRouter();
  const theme = useOrbiTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { t } = useTranslation();
  const [history, setHistory] = useState<MyTripsResponse>(fallbackRiderTrips);
  const [supportTickets, setSupportTickets] = useState<SupportTicket[]>([]);
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
      const response = await withNetworkRetry(
        () => fetchMyTrips(authClient),
        {
          maxAttempts: 3,
          onRetry: () => setStatus("Connexion en cours..."),
        },
      );
      const normalizedHistory = normalizeRiderTripsResponse(response);
      setHistory(normalizedHistory);
      const supportResponse = await getMySupportTicketsWithApi(authClient).catch(
        () => ({ tickets: [] as SupportTicket[] }),
      );
      setSupportTickets(
        filterRiderVisibleSupportTickets(supportResponse.tickets).slice(0, 3),
      );

      const activeTrip = normalizedHistory.recentTrips.find((trip) =>
        isActiveTripLifecycleStatus(trip.status),
      );

      if (activeTrip) {
        try {
          const detail = await withNetworkRetry(
            () => fetchTripDetail(authClient, activeTrip.id),
            {
              maxAttempts: 3,
              onRetry: () => setStatus("Mise a jour du trajet..."),
            },
          );
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
        setStatus("");
      }
    } catch (error) {
      const feedback = await resolveRiderAppError(error, {
        surface: "active-trip",
        network: "Vos trajets seront affiches des que la connexion revient.",
        fallback: "Vos trajets seront affiches des que la connexion revient.",
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
      const response = await cancelRideRequestWithApi(authClient, rideRequestId);
      const cancellationMessage =
        response.cancellationPolicy?.message ?? "Demande annulee avec succes.";
      await loadHistory();
      setStatus(cancellationMessage);
    } catch (error) {
      const feedback = await resolveRiderAppError(error, {
        surface: "booking",
        fallback: "L'annulation de la demande a echoue.",
      });

      if (feedback.shouldClearSessionToken) {
        setSessionToken(null);
      }

      setStatus(feedback.message);
      Alert.alert("Annulation non prise en compte", feedback.message);
    } finally {
      submissionLockRef.current = false;
      setIsSubmitting(false);
    }
  }

  async function handleCreateQuickSupportTicket(
    action: (typeof QUICK_SUPPORT_ACTIONS)[number],
  ) {
    if (submissionLockRef.current) {
      return;
    }

    const activeTripId = activeTrip?.id ?? null;
    const latestTrip = history.recentTrips[0] ?? null;
    const pendingRequest = history.pendingRequests[0] ?? null;
    const routeContext =
      activeTrip ??
      latestTrip ??
      pendingRequest ??
      null;
    const routeLabel = routeContext
      ? `${routeContext.pickupAddress} -> ${routeContext.destinationAddress}`
      : "Aucune course recente disponible";
    const referenceId = activeTripId ?? latestTrip?.id ?? pendingRequest?.id ?? "none";
    const receiptContext = latestTrip?.receipt
      ? [
          `Paiement: ${latestTrip.receipt.status}`,
          `Montant: ${latestTrip.receipt.amount} ${latestTrip.receipt.currency}`,
          `Operateur: ${latestTrip.receipt.provider}`,
          `Reference transaction: ${latestTrip.receipt.transactionRef ?? "absente"}`,
        ].join("\n")
      : null;

    submissionLockRef.current = true;
    setIsSubmitting(true);
    setStatus(`Ouverture de la demande support ${action.label.toLowerCase()}...`);

    try {
      const { authClient } = await restoreRiderSession();
      await createSupportTicketWithApi(authClient, {
        subject: action.subject,
        category: action.category,
        description:
          `${action.description}\n` +
          `Reference: ${referenceId}\n` +
          `Trajet: ${routeLabel}\n` +
          `${receiptContext ? `${receiptContext}\n` : ""}` +
          `Message visible: ${status}`,
      });
      await loadHistory(true);
      setStatus("Votre demande a été envoyée au support.");
    } catch (error) {
      const feedback = await resolveRiderAppError(error, {
        surface: action.category === "payment" ? "payments" : "active-trip",
        fallback: "La demande support n'a pas pu etre ouverte.",
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

  function handleCancelActiveTrip(tripId: string) {
    safeHaptics.impact('medium');
    const REASONS = [
      "Chauffeur en retard",
      "Chauffeur ne repond pas",
      "Changement de plan",
    ];

    Alert.alert(
      "Annuler avant depart",
      "Vous pouvez annuler tant que vous n etes pas monte et que la course n a pas demarre.",
      [
        ...REASONS.map((reason) => ({
          text: reason,
          onPress: () => void doCancelActiveTrip(tripId, reason),
        })),
        { text: "Ne pas annuler", style: "cancel" as const },
      ],
    );
  }

  function handleStopInProgressTrip(tripId: string) {
    safeHaptics.impact('medium');
    const fareLabel = formatRiderMoneyAmount(
      activeTripDetail?.trip.actualFare ?? activeTrip?.amount,
    );
    Alert.alert(
      "Terminer ma course maintenant",
      `Confirmez seulement si vous descendez ici. Orbi cloture la course, calcule le montant du trajet deja effectue, puis ouvre le recu pour payer. Estimation actuelle: ${fareLabel}.`,
      [
        {
          text: "Arreter et voir le montant",
          style: "destructive" as const,
          onPress: () =>
            void doStopInProgressTrip(tripId, "Arret demande par le passager"),
        },
        { text: "Continuer", style: "cancel" as const },
      ],
    );
  }

  async function doStopInProgressTrip(tripId: string, reason: string) {
    if (submissionLockRef.current) {
      return;
    }

    submissionLockRef.current = true;
    setIsSubmitting(true);
    setStatus("Cloture de la course et calcul du montant...");

    try {
      const { authClient } = await restoreRiderSession();
      const response = await updateTripStatusWithApi(
        authClient,
        tripId,
        "COMPLETED",
        reason,
      );
      await loadHistory();
      setStatus(
        `Course terminee. Montant a payer: ${formatRiderMoneyAmount(response.trip.actualFare)}.`,
      );
      router.replace({
        pathname: "/receipt",
        params: { tripId: response.trip.id },
      });
    } catch (error) {
      const feedback = await resolveRiderAppError(error, {
        surface: "active-trip",
        fallback: "L'arret de la course a echoue.",
      });

      if (feedback.shouldClearSessionToken) {
        setSessionToken(null);
      }

      setStatus(feedback.message);
      Alert.alert("Arret non pris en compte", feedback.message);
    } finally {
      submissionLockRef.current = false;
      setIsSubmitting(false);
    }
  }

  async function doCancelActiveTrip(tripId: string, reason: string) {
    if (submissionLockRef.current) {
      return;
    }

    submissionLockRef.current = true;
    setIsSubmitting(true);
    setStatus("Annulation de la course en cours...");

    try {
      const { authClient } = await restoreRiderSession();
      const response = await updateTripStatusWithApi(
        authClient,
        tripId,
        "CANCELLED",
        reason,
      );
      const cancellationMessage =
        response.trip.cancellationPolicy?.message ??
        "Course annulee. Vous pouvez reserver a nouveau.";
      await loadHistory();
      setStatus(cancellationMessage);
    } catch (error) {
      const feedback = await resolveRiderAppError(error, {
        surface: "active-trip",
        fallback: "L'annulation de la course a echoue.",
      });

      if (feedback.shouldClearSessionToken) {
        setSessionToken(null);
      }

      setStatus(feedback.message);
      Alert.alert("Annulation non prise en compte", feedback.message);
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
    setStatus("Signalement de l incident en cours...");

    try {
      const { authClient } = await restoreRiderSession();
      await reportTripIncidentWithApi(authClient, tripId, {
        incidentType: "SAFETY_ALERT",
        details: "Signalement rapide envoye depuis l ecran passager.",
        priority: 3,
      });
      setStatus("Incident signalé. Le support est prévenu.");
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
    setStatus("Ajout de votre preuve securisee...");

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
    safeHaptics.notify('error');

    submissionLockRef.current = true;
    setIsSubmitting(true);
    setStatus("SOS en cours: alerte prioritaire envoyee...");

    try {
      const { authClient } = await restoreRiderSession();
      const response = await triggerTripSafetySosWithApi(authClient, tripId, {
        details: "SOS declenche depuis l'application passager.",
        latitude: riderPosition.latestPosition?.latitude,
        longitude: riderPosition.latestPosition?.longitude,
        accuracyMeters:
          riderPosition.latestPosition?.accuracyMeters ?? undefined,
      });

      setStatus(`SOS envoyé. Appel local ${response.sos.localEmergencyNumber} disponible.`);
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
    setStatus("Preparation du partage securise...");

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

    const ratingLabel = formatRiderRatingLabel(verification.averageRating);

    return [
      `Chauffeur verifie: ${formatOperationalStatus(verification.verificationStatus)}`,
      `Telephone chauffeur: ${verification.phoneVerified ? "verifie" : "non verifie"}`,
      `Vehicule: ${verification.vehicle.color} ${verification.vehicle.make} ${verification.vehicle.model}`,
      `Plaque a verifier: ${verification.vehicle.plateNumber}`,
      ratingLabel === null
        ? `${verification.completedTripsCount} courses terminees`
        : `Note ${ratingLabel}/5 - ${verification.completedTripsCount} courses terminees`,
    ];
  }

  function getStatusColor(status: string) {
    return "#111111";
  }

  function getStatusBg(status: string) {
    return status === 'IN_PROGRESS' ? "#FFFFFF" : "#F3F3F3";
  }

  // ── Active trip view ────────────────────────────────────────────────────────
  if (activeTrip) {
    const hasTripCoords = activeTripDetail?.trip.pickupLatitude != null;
    const driverLat =
      activeTripDetail?.trip.routeMonitoring.latestPosition?.latitude ?? null;
    const driverLng =
      activeTripDetail?.trip.routeMonitoring.latestPosition?.longitude ?? null;
    const driverVehicleType =
      activeTripDetail?.trip.driverVerification.vehicle.type ?? null;
    const driverVehicleTier =
      activeTripDetail?.trip.driverVerification.vehicle.tier ?? null;
    const canCancel = canRiderCancelTrip(activeTrip.status);
    const canStop = canRiderStopTrip(activeTrip.status);
    const activeFareLabel = formatRiderMoneyAmount(
      activeTripDetail?.trip.actualFare ?? activeTrip.amount,
    );
    const activePaymentLabel = formatRiderPaymentMethodLabel(
      activeTripDetail?.trip.paymentMethod,
    );

    return (
      <View style={styles.tripRoot}>
        {/* Status feedback — visible in active trip view for operational signals */}
        {status && !status.includes('Chargement') ? (
          <OrbiStatusBanner
            tone="amber"
            title="Information trajet"
            message={status}
            style={styles.tripStatusOverlay}
          />
        ) : null}
        {/* Map */}
        {hasTripCoords ? (
          <TripMapView
            pickupLat={activeTripDetail!.trip.pickupLatitude!}
            pickupLng={activeTripDetail!.trip.pickupLongitude!}
            destLat={activeTripDetail!.trip.destinationLatitude!}
            destLng={activeTripDetail!.trip.destinationLongitude!}
            driverLat={driverLat}
            driverLng={driverLng}
            driverVehicleType={driverVehicleType}
            driverVehicleTier={driverVehicleTier as string | null | undefined}
            style={StyleSheet.absoluteFill}
          />
        ) : (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: "#F3F3F3" }]} />
        )}

        {/* Bottom sheet */}
        <View style={styles.tripSheet}>
          {/* Handle */}
          <View style={styles.sheetHandle} />
          <ScrollView
            style={styles.tripSheetScroll}
            contentContainerStyle={styles.tripSheetContent}
            showsVerticalScrollIndicator={false}
          >

          {/* Étapes de la course */}
          <TripStageTracker status={activeTrip.status} audience="rider" style={styles.stageTracker} />

          {/* Status pill */}
          <View style={styles.statusRow}>
            <View style={[styles.statusPill, { backgroundColor: getStatusBg(activeTrip.status) }]}>
              <View style={[styles.statusDot, { backgroundColor: getStatusColor(activeTrip.status) }]} />
              <Text style={[styles.statusLabel, { color: getStatusColor(activeTrip.status) }]}>
                {primaryStatusLabel}
              </Text>
            </View>
            {isRealtimeSyncing ? (
              <Text style={styles.realtimeDot}>jour</Text>
            ) : null}
          </View>

          <OrbiSurface tone={activeTrip.status === 'IN_PROGRESS' ? 'teal' : 'sky'} style={styles.tripFocusPanel}>
            <View style={styles.tripFocusCopy}>
              <Text style={styles.tripFocusEyebrow}>
                {activeTrip.status === 'IN_PROGRESS' ? 'Trajet en cours' : 'Avant de monter'}
              </Text>
              <Text style={styles.tripFocusTitle} numberOfLines={2}>
                {riderNextActionHint}
              </Text>
            </View>
            <View style={styles.tripFocusMetrics}>
              <View style={styles.tripFocusMetric}>
                <Text style={styles.tripFocusMetricLabel}>Prix</Text>
                <Text style={styles.tripFocusMetricValue}>{activeFareLabel}</Text>
              </View>
              <View style={styles.tripFocusMetric}>
                <Text style={styles.tripFocusMetricLabel}>Paiement</Text>
                <Text style={styles.tripFocusMetricValue}>{activePaymentLabel}</Text>
              </View>
            </View>
          </OrbiSurface>

          {/* ETA banner — live distance & ETA when driver is approaching */}
          {(activeTrip.status === 'MATCHED' || activeTrip.status === 'DRIVER_ARRIVING') ? (() => {
            const distKm = activeTripDetail?.trip.routeMonitoring.latestPosition?.distanceToPickupKm ?? null;
            const etaMins = estimateRiderPickupEtaMinutes(distKm);
            const distanceLabel = formatRiderDistanceKm(distKm);
            return (
              <OrbiSurface tone="sky" style={styles.etaBanner}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.etaEyebrow}>
                    {activeTrip.status === 'MATCHED' ? 'Chauffeur en route' : 'Chauffeur proche'}
                  </Text>
                  <Text style={styles.etaValue}>
                    {etaMins != null ? `Dans ~${etaMins} min` : 'En route vers vous'}
                  </Text>
                </View>
                {distanceLabel ? (
                  <View style={styles.etaDistBadge}>
                    <Text style={styles.etaDistText}>{distanceLabel}</Text>
                  </View>
                ) : null}
              </OrbiSurface>
            );
          })() : null}

          {activeTrip.status === 'IN_PROGRESS' && riderRouteProgress ? (
            <OrbiSurface tone="teal" style={styles.etaBanner}>
              <View style={{ flex: 1 }}>
                <Text style={styles.etaEyebrow}>Arrivée estimée</Text>
                <Text style={styles.etaValue}>{riderRouteProgress.etaLabel}</Text>
              </View>
              <View style={styles.etaDistBadge}>
                <Text style={styles.etaDistText} numberOfLines={1}>
                  {riderRouteProgress.distanceLabel}
                </Text>
              </View>
            </OrbiSurface>
          ) : null}

          {/* Driver card */}
          <OrbiSurface style={styles.driverCard}>
            <View style={styles.driverCardTop}>
              <View style={styles.driverAvatar}>
                {driverTrustSnapshot?.profilePhotoUrl ? (
                  <Image
                    source={{ uri: driverTrustSnapshot.profilePhotoUrl }}
                    style={styles.driverAvatarImg}
                  />
                ) : (
                  <Text style={styles.driverAvatarInitials}>
                    {driverTrustSnapshot?.initials ?? 'OR'}
                  </Text>
                )}
              </View>
              <View style={styles.driverInfo}>
                <Text style={styles.driverName}>
                  {driverTrustSnapshot?.driverName ?? activeTrip.counterpartyName ?? 'Chauffeur assigné'}
                </Text>
                <Text style={styles.driverMeta}>
                  {driverTrustSnapshot
                    ? `${driverTrustSnapshot.ratingLabel} · ${driverTrustSnapshot.vehicleLabel}`
                    : 'En route vers vous'}
                </Text>
                {driverTrustSnapshot?.plateLabel ? (
                  <Text style={styles.driverPlate}>{driverTrustSnapshot.plateLabel}</Text>
                ) : null}
              </View>
              {activeTripDetail?.trip.driverPhoneNumber ? (
                <OrbiButton
                  onPress={() => void Linking.openURL(`tel:${activeTripDetail.trip.driverPhoneNumber}`)}
                  style={styles.callDriverBtn}
                  accessibilityLabel="call-driver"
                  label="Appeler"
                  variant="secondary"
                  tone="teal"
                  labelStyle={styles.callDriverLabel}
                />
              ) : null}
            </View>
            {driverTrustSnapshot ? (
              <View style={styles.boardingChecklist}>
                {driverTrustSnapshot.boardingChecklist.map((item) => (
                  <View
                    key={item.label}
                    style={[
                      styles.boardingCheckItem,
                      item.ok ? styles.boardingCheckItemOk : styles.boardingCheckItemWarn,
                    ]}
                  >
                    <Text style={styles.boardingCheckLabel}>{item.label}</Text>
                    <Text style={styles.boardingCheckValue} numberOfLines={1}>
                      {item.value}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}
          </OrbiSurface>

          {activeTrip.status === 'DRIVER_ARRIVING' && canCancel ? (
            <OrbiSurface tone="teal" style={styles.pickupCheckCard}>
              <Text style={styles.pickupCheckEyebrow}>Chauffeur arrive</Text>
              <Text style={styles.pickupCheckHint}>
                Comparez les lignes Nom, Plaque, Vehicule et Paiement ci-dessus. Montez seulement si tout correspond.
              </Text>
            </OrbiSurface>
          ) : null}

          {/* Route */}
          <OrbiSurface style={styles.routeCard}>
            <View style={styles.routeRow}>
              <View style={[styles.routeDot, { backgroundColor: "#111111" }]} />
              <Text style={styles.routeText} numberOfLines={1}>
                {activeTrip.pickupAddress}
              </Text>
            </View>
            <View style={styles.routeLineSep} />
            <View style={styles.routeRow}>
              <View style={[styles.routeDot, { backgroundColor: "#111111" }]} />
              <Text style={styles.routeText} numberOfLines={1}>
                {activeTrip.destinationAddress}
              </Text>
            </View>
          </OrbiSurface>

          {/* Actions */}
          <View style={styles.actionsRow}>
            <OrbiButton
              onPress={() => void handleShareTrip(activeTrip.id)}
              disabled={isSubmitting}
              style={styles.actionBtn}
              label="Partager"
              variant="secondary"
              tone="teal"
              labelStyle={styles.actionBtnLabel}
            />
            <OrbiButton
              onPress={() => void handleReportIncident(activeTrip.id)}
              disabled={isSubmitting}
              style={styles.actionBtn}
              accessibilityLabel="report-incident"
              label="Signal"
              variant="secondary"
              tone="amber"
              labelStyle={styles.actionBtnLabel}
            />
            <OrbiButton
              onPress={() => void handleTriggerSos(activeTrip.id)}
              disabled={isSubmitting}
              style={styles.actionBtn}
              label="SOS"
              variant="danger"
              tone="danger"
              labelStyle={styles.actionBtnLabel}
            />
            {canCancel ? (
              <OrbiButton
                onPress={() => handleCancelActiveTrip(activeTrip.id)}
                disabled={isSubmitting}
                style={styles.actionBtn}
                label="Annuler avant depart"
                variant="danger"
                tone="danger"
                labelStyle={styles.actionBtnLabel}
              />
            ) : null}
            {canStop ? (
              <OrbiButton
                onPress={() => handleStopInProgressTrip(activeTrip.id)}
                disabled={isSubmitting}
                style={styles.actionBtn}
                label="Arreter la course"
                variant="danger"
                tone="danger"
                labelStyle={styles.actionBtnLabel}
              />
            ) : null}
          </View>
          </ScrollView>
        </View>
      </View>
    );
  }

  // ── History view ────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t('activity.title', { defaultValue: 'Activité' })}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          {isRealtimeSyncing ? <Text style={styles.headerLiveText}>jour</Text> : null}
          <OrbiButton
            onPress={() => void loadHistory()}
            style={styles.refreshButton}
            loading={isRefreshing}
            accessibilityLabel="activity-refresh"
            label="Actualiser le suivi"
            variant="secondary"
            tone="teal"
            labelStyle={styles.refreshButtonLabel}
          />
        </View>
      </View>
      {/* Status feedback */}
      {status && !status.includes('Chargement') ? (
        <OrbiStatusBanner
          tone="amber"
          title="Information"
          message={status}
          style={styles.historyStatusBanner}
        />
      ) : null}

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => void loadHistory()}
            tintColor="#111111"
            colors={["#111111"]}
          />
        }
      >
        {/* Stats */}
        <View style={styles.statsRow}>
          <OrbiMetricTile
            label="Courses"
            value={String(history.stats.completedTrips)}
            style={styles.statCard}
          />
          <OrbiMetricTile
            label="Dépensé"
            value={formatRiderMoneyAmount(history.stats.totalAmount)}
            style={styles.statCard}
          />
        </View>

        <OrbiSurface style={styles.supportCard}>
          <View style={styles.supportHeader}>
            <View>
              <Text style={styles.supportEyebrow}>Assistance trajet</Text>
              <Text style={styles.supportTitle}>Paiement, prix, annulation</Text>
            </View>
            {supportTickets.length ? (
              <View style={styles.supportCountBadge}>
                <Text style={styles.supportCountText}>
                  {supportTickets.length}
                </Text>
              </View>
            ) : null}
          </View>
          <View style={styles.supportActionGrid}>
            {QUICK_SUPPORT_ACTIONS.map((action) => (
              <OrbiButton
                key={action.key}
                onPress={() => void handleCreateQuickSupportTicket(action)}
                disabled={isSubmitting}
                style={styles.supportActionButton}
                accessibilityLabel={`quick-support-${action.key}`}
                label={action.label}
                variant="secondary"
                tone={action.category === "payment" ? "amber" : "teal"}
                labelStyle={styles.supportActionLabel}
              />
            ))}
          </View>
          {supportTickets.length ? (
            <View style={styles.supportFollowUp}>
              <Text style={styles.supportFollowUpTitle}>
                Suivi support actif
              </Text>
              <Text style={styles.supportHint}>
                {supportTickets.length} demande(s) en cours. L equipe garde les
                details de course et vous recontacte si une action est
                necessaire.
              </Text>
            </View>
          ) : (
            <Text style={styles.supportHint}>
              Choisissez le sujet. Notre équipe verra les détails utiles.
            </Text>
          )}
        </OrbiSurface>

        {/* Pending requests */}
        {history.pendingRequests.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('activity.pendingRequests')}</Text>
            {history.pendingRequests.map((req) => (
              <View key={req.id} style={styles.requestCard}>
                <View style={styles.requestDot} />
                <View style={styles.requestInfo}>
                  <Text style={styles.requestTitle} numberOfLines={1}>
                    {req.pickupAddress}
                  </Text>
                  <Text style={styles.requestSub} numberOfLines={1}>
                    → {req.destinationAddress}
                  </Text>
                </View>
                <OrbiButton
                  onPress={() => void handleCancelPendingRequest(req.id)}
                  disabled={isSubmitting}
                  style={styles.cancelBtn}
                  label="Annuler"
                  variant="danger"
                  tone="danger"
                  labelStyle={styles.cancelBtnText}
                />
              </View>
            ))}
          </View>
        ) : null}

        {/* Recent trips */}
        {history.recentTrips.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('activity.recentTrips')}</Text>
            {history.recentTrips.slice(0, 10).map((trip) => {
              const dateStr = trip.completedAt ?? trip.createdAt;
              const date = formatRiderShortDate(dateStr);
              const isDone = trip.status === 'COMPLETED';
              return (
                <View key={trip.id} style={styles.tripHistRow}>
                  <View style={styles.tripHistDate}>
                    <Text style={styles.tripHistDateText}>{date}</Text>
                  </View>
                  <View style={styles.tripHistInfo}>
                    <Text style={styles.tripHistRoute} numberOfLines={1}>
                      {trip.pickupAddress} → {trip.destinationAddress}
                    </Text>
                    <Text
                      style={[
                        styles.tripHistStatus,
                        isDone && styles.tripHistStatusDone,
                      ]}
                    >
                      {isDone
                        ? t('activity.completed')
                        : trip.status === 'CANCELLED'
                          ? t('activity.cancelled')
                          : trip.status === 'IN_PROGRESS'
                            ? t('activity.inProgress')
                            : trip.status === 'DRIVER_ARRIVING'
                              ? t('activity.driverArriving')
                              : trip.status === 'MATCHED'
                                ? t('activity.matched')
                                : formatOperationalStatus(trip.status)}
                    </Text>
                    {trip.receipt ? (
                      <Text style={styles.tripHistReceipt} numberOfLines={1}>
                        Recu {formatOperationalStatus(trip.receipt.status)} - {formatRiderReceiptProvider(trip.receipt.provider)}
                        {trip.receipt.transactionRef
                          ? ` - ${trip.receipt.transactionRef.slice(0, 12)}`
                          : ''}
                      </Text>
                    ) : null}
                  </View>
                  {resolveRiderMoneyAmount(trip.amount) ? (
                    <Text style={styles.tripHistFare}>
                      {formatRiderMoneyAmount(trip.amount)}
                    </Text>
                  ) : null}
                </View>
              );
            })}
          </View>
        ) : history.pendingRequests.length === 0 ? (
          <View style={styles.emptyState}>
            <View style={styles.emptyOrbit}>
              <View style={styles.emptyOrbitRing} />
              <View style={styles.emptyOrbitDot} />
            </View>
            <View style={styles.emptyCopy}>
              <Text style={styles.emptyEyebrow}>Historique prêt</Text>
              <Text style={styles.emptyTitle}>Aucun trajet</Text>
              <Text style={styles.emptyMeta}>
                Vos courses apparaîtront ici après votre première réservation.
              </Text>
            </View>
            <OrbiButton
              onPress={() => router.push('/book')}
              label="Réserver"
              tone="teal"
              style={styles.emptyAction}
              labelStyle={styles.emptyActionLabel}
            />
          </View>
        ) : null}

        <View style={{ height: 24 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const makeStyles = (theme: OrbiTheme) => StyleSheet.create({
  // ── Active trip layout
  tripRoot: { flex: 1 },
  tripStatusOverlay: {
    position: 'absolute',
    top: 52,
    left: 12,
    right: 12,
    zIndex: 100,
    backgroundColor: "#FFFFFF",
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "#E8E8E8",
  },
  tripSheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    maxHeight: '70%',
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
    paddingHorizontal: 16,
    paddingBottom: 18,
    paddingTop: 8,
    borderTopWidth: 1,
    borderColor: "#E8E8E8",
  },
  tripSheetScroll: {
    flexGrow: 0,
  },
  tripSheetContent: {
    gap: 14,
    paddingBottom: 128,
  },
  sheetHandle: {
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#E0E0E0',
    alignSelf: 'center',
    marginBottom: 4,
  },
  stageTracker: { marginBottom: 2 },
  statusRow: { flexDirection: 'row', alignItems: 'center' },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusLabel: {
    fontSize: 13,
    fontWeight: '700',
    fontFamily: 'Inter_700Bold',
  },
  realtimeDot: {
    marginLeft: 8,
    fontSize: 11,
    fontWeight: '800',
    fontFamily: 'Inter_700Bold',
    color: "#111111",
    textTransform: 'uppercase',
  },
  tripFocusPanel: {
    gap: 12,
    borderRadius: 4,
    backgroundColor: "#F7F7F7",
    borderColor: "#E8E8E8",
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  tripFocusCopy: {
    gap: 4,
  },
  tripFocusEyebrow: {
    fontSize: 10,
    fontWeight: '800',
    fontFamily: 'Inter_700Bold',
    color: "#6B6B6B",
    textTransform: 'uppercase',
    letterSpacing: 0,
  },
  tripFocusTitle: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '800',
    fontFamily: 'Inter_700Bold',
    color: "#111111",
  },
  tripFocusMetrics: {
    flexDirection: 'row',
    gap: 8,
  },
  tripFocusMetric: {
    flex: 1,
    minHeight: 52,
    borderRadius: 4,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E8E8E8",
    paddingHorizontal: 10,
    paddingVertical: 8,
    justifyContent: 'center',
  },
  tripFocusMetricLabel: {
    fontSize: 10,
    fontWeight: '800',
    fontFamily: 'Inter_700Bold',
    color: "#6B6B6B",
    textTransform: 'uppercase',
  },
  tripFocusMetricValue: {
    marginTop: 2,
    fontSize: 13,
    fontWeight: '800',
    fontFamily: 'Inter_700Bold',
    color: "#111111",
  },

  // Driver card
  driverCard: {
    borderRadius: 4,
    padding: 12,
    gap: 10,
    backgroundColor: "#FFFFFF",
    borderColor: "#E8E8E8",
  },
  driverCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  driverAvatar: {
    width: 48,
    height: 48,
    borderRadius: 4,
    backgroundColor: "#111111",
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  driverAvatarImg: { width: 48, height: 48, borderRadius: 4 },
  driverAvatarInitials: {
    fontSize: 18,
    fontWeight: '700',
    fontFamily: 'Inter_700Bold',
    color: '#FFFFFF',
  },
  driverInfo: { flex: 1, gap: 2 },
  driverName: {
    fontSize: 16,
    fontWeight: '700',
    fontFamily: 'Inter_700Bold',
    color: "#111111",
  },
  driverMeta: {
    fontSize: 13,
    color: "#5F5F5F",
    fontFamily: 'Inter_400Regular',
  },
  driverPlate: {
    fontSize: 13,
    fontWeight: '700',
    fontFamily: 'Inter_700Bold',
    color: "#111111",
    letterSpacing: 0,
  },
  boardingChecklist: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingTop: 2,
  },
  boardingCheckItem: {
    width: '48%',
    minHeight: 48,
    borderRadius: 4,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
    justifyContent: 'center',
    gap: 2,
  },
  boardingCheckItemOk: {
    borderColor: "#111111",
    backgroundColor: "#FFFFFF",
  },
  boardingCheckItemWarn: {
    borderColor: "#E8E8E8",
    backgroundColor: "#F7F7F7",
  },
  boardingCheckLabel: {
    fontSize: 10,
    fontWeight: '800',
    fontFamily: 'Inter_700Bold',
    color: "#6B6B6B",
    textTransform: 'uppercase',
  },
  boardingCheckValue: {
    fontSize: 12,
    fontWeight: '800',
    fontFamily: 'Inter_700Bold',
    color: "#111111",
  },

  // Pickup verification
  pickupCheckCard: {
    borderRadius: 4,
    padding: 14,
    alignItems: 'center',
    gap: 4,
    backgroundColor: "#F7F7F7",
    borderColor: "#E8E8E8",
  },
  pickupCheckEyebrow: {
    fontSize: 11,
    fontWeight: '700',
    fontFamily: 'Inter_700Bold',
    color: "#111111",
    textTransform: 'uppercase',
    letterSpacing: 0,
  },
  pickupCheckHint: {
    fontSize: 12,
    color: "#6B6B6B",
    fontFamily: 'Inter_400Regular',
    textAlign: 'center',
  },

  // Route card
  routeCard: {
    gap: 0,
    borderRadius: 4,
    paddingHorizontal: 14,
    paddingVertical: 4,
    backgroundColor: "#FFFFFF",
    borderColor: "#E8E8E8",
  },
  routeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
  },
  routeDot: { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  routeText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
    fontFamily: 'Inter_500Medium',
    color: "#111111",
  },
  routeLineSep: {
    height: 1,
    backgroundColor: "#E8E8E8",
    marginLeft: 18,
  },

  // Actions row
  actionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  actionBtn: {
    flexGrow: 1,
    flexBasis: '47%',
    minHeight: 48,
    paddingHorizontal: 6,
    borderRadius: 4,
  },
  actionBtnLabel: {
    fontSize: 12,
  },

  // ETA banner
  etaBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 4,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: "#F7F7F7",
    borderColor: "#E8E8E8",
  },
  etaEyebrow: {
    fontSize: 11,
    fontWeight: '600',
    fontFamily: 'Inter_600SemiBold',
    color: "#6B6B6B",
    textTransform: 'uppercase',
    letterSpacing: 0,
    marginBottom: 2,
  },
  etaValue: {
    fontSize: 18,
    fontWeight: '800',
    fontFamily: 'Inter_700Bold',
    color: "#111111",
  },
  etaDistBadge: {
    maxWidth: '42%',
    flexShrink: 1,
    backgroundColor: "#FFFFFF",
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "#E8E8E8",
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  etaDistText: {
    fontSize: 14,
    fontWeight: '700',
    fontFamily: 'Inter_700Bold',
    color: "#111111",
  },

  // Call driver button (inside driver card)
  callDriverBtn: {
    minHeight: 40,
    paddingHorizontal: 10,
    flexShrink: 0,
  },
  callDriverLabel: { fontSize: 12 },

  // ── History layout
  safe: { flex: 1, backgroundColor: "#FFFFFF" },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#E8E8E8",
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    fontFamily: 'Raleway_800ExtraBold',
    color: "#111111",
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 110,
    gap: 12,
  },
  headerLiveText: {
    fontSize: 11,
    fontWeight: '800',
    fontFamily: 'Inter_700Bold',
    color: "#111111",
    textTransform: 'uppercase',
  },
  historyStatusBanner: {
    marginHorizontal: 16,
    marginTop: 8,
  },

  // Stats row
  statsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  statCard: {
    flex: 1,
    borderRadius: 4,
    backgroundColor: "#FFFFFF",
    borderColor: "#E8E8E8",
  },

  // Sections
  section: { gap: 8 },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    fontFamily: 'Inter_700Bold',
    color: "#111111",
    paddingHorizontal: 2,
  },

  // Support
  supportCard: {
    padding: 14,
    gap: 12,
    borderRadius: 4,
    backgroundColor: "#FFFFFF",
    borderColor: "#E8E8E8",
  },
  supportHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
  },
  supportEyebrow: {
    fontSize: 11,
    fontWeight: '800',
    fontFamily: 'Inter_700Bold',
    color: "#6B6B6B",
    textTransform: 'uppercase',
    letterSpacing: 0,
  },
  supportTitle: {
    fontSize: 16,
    fontWeight: '800',
    fontFamily: 'Raleway_800ExtraBold',
    color: "#111111",
    marginTop: 2,
  },
  supportCountBadge: {
    minWidth: 28,
    height: 28,
    borderRadius: 4,
    backgroundColor: "#F3F3F3",
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  supportCountText: {
    fontSize: 13,
    fontWeight: '800',
    fontFamily: 'Inter_700Bold',
    color: "#111111",
  },
  supportActionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  supportActionButton: {
    width: '48%',
    minHeight: 42,
    borderRadius: 4,
    paddingHorizontal: 8,
  },
  supportActionLabel: {
    fontSize: 12,
    fontWeight: '700',
    fontFamily: 'Inter_700Bold',
  },
  supportHint: {
    fontSize: 12,
    lineHeight: 17,
    fontFamily: 'Inter_400Regular',
    color: "#6B6B6B",
  },
  supportFollowUp: {
    gap: 4,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#E8E8E8",
  },
  supportFollowUpTitle: {
    fontSize: 13,
    fontWeight: '800',
    fontFamily: 'Inter_700Bold',
    color: "#111111",
  },

  // Pending requests
  requestCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: "#F7F7F7",
    borderWidth: 1,
    borderColor: "#E8E8E8",
    borderRadius: 4,
    padding: 12,
  },
  requestDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#111111",
    flexShrink: 0,
  },
  requestInfo: { flex: 1 },
  requestTitle: {
    fontSize: 13,
    fontWeight: '600',
    fontFamily: 'Inter_600SemiBold',
    color: "#111111",
  },
  requestSub: {
    fontSize: 12,
    color: "#5F5F5F",
    fontFamily: 'Inter_400Regular',
  },
  cancelBtn: {
    borderRadius: 4,
    minHeight: 34,
    paddingHorizontal: 12,
  },
  cancelBtnText: {
    fontSize: 12,
    fontWeight: '700',
    fontFamily: 'Inter_700Bold',
    color: "#111111",
  },

  // Trip history rows
  tripHistRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#E8E8E8",
  },
  tripHistDate: {
    width: 40,
    alignItems: 'center',
  },
  tripHistDateText: {
    fontSize: 11,
    fontWeight: '600',
    fontFamily: 'Inter_600SemiBold',
    color: "#6B6B6B",
    textAlign: 'center',
  },
  tripHistInfo: { flex: 1 },
  tripHistRoute: {
    fontSize: 13,
    fontWeight: '500',
    fontFamily: 'Inter_500Medium',
    color: "#111111",
  },
  tripHistStatus: {
    fontSize: 11,
    color: "#6B6B6B",
    fontFamily: 'Inter_400Regular',
    marginTop: 2,
  },
  tripHistStatusDone: { color: "#111111" },
  tripHistReceipt: {
    fontSize: 10,
    color: "#6B6B6B",
    fontFamily: 'Inter_400Regular',
    marginTop: 2,
  },
  tripHistFare: {
    fontSize: 14,
    fontWeight: '700',
    fontFamily: 'Inter_700Bold',
    color: "#111111",
  },

  // Empty state
  emptyState: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: "#FFFFFF",
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "#E8E8E8",
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  emptyOrbit: {
    width: 58,
    height: 58,
    borderRadius: 4,
    backgroundColor: "#F7F7F7",
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    flexShrink: 0,
  },
  emptyOrbitRing: {
    position: 'absolute',
    width: 44,
    height: 44,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "#E8E8E8",
  },
  emptyOrbitDot: {
    width: 12,
    height: 12,
    borderRadius: 4,
    backgroundColor: "#111111",
    borderWidth: 3,
    borderColor: '#FFFFFF',
  },
  emptyCopy: {
    flex: 1,
    gap: 2,
  },
  emptyEyebrow: {
    fontSize: 10,
    fontWeight: '800',
    fontFamily: 'Inter_700Bold',
    color: "#6B6B6B",
    textTransform: 'uppercase',
    letterSpacing: 0,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '700',
    fontFamily: 'Inter_700Bold',
    color: "#111111",
  },
  emptyMeta: {
    fontSize: 12,
    color: "#6B6B6B",
    fontFamily: 'Inter_400Regular',
    lineHeight: 17,
  },
  emptyAction: {
    minHeight: 42,
    paddingHorizontal: 14,
    borderRadius: 4,
    flexShrink: 0,
  },
  emptyActionLabel: {
    fontSize: 12,
  },

  // ── Legacy stubs
  screen: { gap: 16 },
  title: { fontSize: 24, fontWeight: '800', color: "#111111" },
  syncMeta: { color: "#6B6B6B", fontSize: 12 },
  refreshButton: {
    borderRadius: 4,
    minHeight: 38,
    paddingHorizontal: 14,
    alignSelf: 'flex-start',
  },
  refreshButtonLabel: { fontSize: 13 },
  snapshotTitle: { fontSize: 13, fontWeight: '700', color: "#111111" },
  snapshotStrip: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  trustCard: {
    backgroundColor: "#F7F7F7",
    borderRadius: 4,
    padding: 14,
    gap: 10,
  },
  identityRow: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  identityCopy: { flex: 1, gap: 2 },
  identityTitle: { fontSize: 15, fontWeight: '700', color: "#111111" },
  identityMeta: { fontSize: 12, color: "#5F5F5F" },
  identityDetails: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  avatarImage: { width: 48, height: 48, borderRadius: 4 },
  avatarFallback: {
    width: 48, height: 48, borderRadius: 4,
    backgroundColor: "#111111",
    alignItems: 'center', justifyContent: 'center',
  },
  avatarInitials: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },
  actionButtonDisabled: { opacity: 0.6 },
  tripCompletedActions: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
});
