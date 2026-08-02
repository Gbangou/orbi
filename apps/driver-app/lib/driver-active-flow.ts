import {
  isActiveTripLifecycleStatus,
  type DriverOffer,
  type MyTripsResponse,
  type TripDetailResponse,
} from "@orbi/api";
import { formatOperationalStatus } from "@orbi/ui";
import { formatDriverEarningsAmount } from "./driver-earnings-signal";
import { isOfferReservationActive } from "./offer-reservation";

function toFiniteFlowNumber(value: unknown) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === "string") {
    const parsed = Number(value.trim().replace(",", "."));
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function formatDistanceKm(value: unknown, fallback = "Distance en attente") {
  const numeric = toFiniteFlowNumber(value);
  return numeric !== null && numeric >= 0 ? `${numeric.toFixed(1)} km` : fallback;
}

export type DriverResolvedOperationalStatus =
  | "ONLINE"
  | "OFFLINE"
  | "BUSY"
  | "SUSPENDED";

export type DriverActiveFlowSummary = {
  activeTrip: MyTripsResponse["recentTrips"][number] | null;
  activeFlowState: string | null;
  primaryStatusLabel: string;
  primaryRouteLabel: string | null;
  operationalStatus: DriverResolvedOperationalStatus;
  accountVerificationStatus: string;
  accountCanReceiveOffers: boolean;
  availabilityStatus: "ONLINE" | "OFFLINE";
  heroTitle: string;
  visibleOffers: DriverOffer[];
  visibleOfferCount: number;
  canReceiveOffers: boolean;
  availabilityLocked: boolean;
};

export function resolveDriverActiveFlow(input: {
  history: MyTripsResponse | null | undefined;
  offers: DriverOffer[];
  reservationNow: number;
  driverProfileStatus: string | null | undefined;
  driverVerificationStatus?: string | null | undefined;
}): DriverActiveFlowSummary {
  const activeTrip =
    input.history?.recentTrips.find((trip) =>
      isActiveTripLifecycleStatus(trip.status),
    ) ?? null;
  const normalizedProfileStatus = normalizeDriverProfileStatus(
    input.driverProfileStatus,
  );
  const accountVerificationStatus = normalizeDriverVerificationStatus(
    input.driverVerificationStatus,
  );
  const accountCanReceiveOffers = accountVerificationStatus === "APPROVED";
  const operationalStatus = activeTrip ? "BUSY" : normalizedProfileStatus;
  const availabilityStatus =
    normalizedProfileStatus === "ONLINE" ? "ONLINE" : "OFFLINE";
  const canReceiveOffers =
    availabilityStatus === "ONLINE" && !activeTrip && accountCanReceiveOffers;
  const visibleOffers = canReceiveOffers
    ? input.offers.filter((offer) =>
        isOfferReservationActive(offer, input.reservationNow),
      )
    : [];

  return {
    activeTrip,
    activeFlowState: activeTrip ? `TRIP:${activeTrip.status}` : null,
    primaryStatusLabel: activeTrip
      ? formatOperationalStatus(activeTrip.status)
      : formatOperationalStatus(operationalStatus),
    primaryRouteLabel: activeTrip
      ? `${activeTrip.pickupAddress} vers ${activeTrip.destinationAddress}`
      : null,
    operationalStatus,
    accountVerificationStatus,
    accountCanReceiveOffers,
    availabilityStatus,
    heroTitle:
      operationalStatus === "BUSY"
        ? "Occupe"
        : operationalStatus === "ONLINE"
          ? accountCanReceiveOffers
            ? "En ligne"
            : "En validation"
          : operationalStatus === "SUSPENDED"
            ? "Suspendu"
            : "Hors ligne",
    visibleOffers,
    visibleOfferCount: visibleOffers.length,
    canReceiveOffers,
    availabilityLocked:
      Boolean(activeTrip) || operationalStatus === "SUSPENDED",
  };
}

export function buildDriverHomeStatusLabel(input: {
  flow: DriverActiveFlowSummary;
  fullName: string;
}) {
  if (input.flow.activeTrip) {
    return `Course ${formatOperationalStatus(input.flow.activeTrip.status)} avec ${input.flow.activeTrip.counterpartyName ?? "votre client"}.`;
  }

  if (input.flow.operationalStatus === "SUSPENDED") {
    return "Compte suspendu. Contactez le support pour reprendre le service.";
  }

  if (
    input.flow.availabilityStatus === "ONLINE" &&
    !input.flow.accountCanReceiveOffers
  ) {
    return "Compte en attente de validation. Les offres seront disponibles apres approbation.";
  }

  return `Connecte comme ${input.fullName}. Statut ${formatOperationalStatus(input.flow.availabilityStatus)}. ${input.flow.visibleOfferCount} offres disponibles.`;
}

export function buildDriverDispatchStatusLabel(input: {
  flow: DriverActiveFlowSummary;
}) {
  if (input.flow.activeTrip) {
    return `Course ${formatOperationalStatus(input.flow.activeTrip.status)} avec ${input.flow.activeTrip.counterpartyName ?? "votre client"}.`;
  }

  if (input.flow.operationalStatus === "SUSPENDED") {
    return "Compte suspendu. Les offres reprendront après réactivation du profil.";
  }

  if (
    input.flow.availabilityStatus === "ONLINE" &&
    !input.flow.accountCanReceiveOffers
  ) {
    return "Compte chauffeur en validation. Les offres sont bloquées jusqu'à approbation.";
  }

  return `${input.flow.visibleOfferCount} offres disponibles. Statut ${formatOperationalStatus(input.flow.availabilityStatus)}.`;
}

export function buildDriverNextActionHint(flow: DriverActiveFlowSummary) {
  if (flow.activeTrip?.status === "MATCHED") {
    return "Rejoignez le point de départ et signalez votre arrivée uniquement sur place.";
  }

  if (flow.activeTrip?.status === "DRIVER_ARRIVING") {
    return "Démarrez seulement quand le passager est avec vous et prêt à partir.";
  }

  if (flow.activeTrip?.status === "IN_PROGRESS") {
    return "Terminez la course seulement après dépôt au point confirmé.";
  }

  if (flow.operationalStatus === "SUSPENDED") {
    return "Aucune action requise: attendez la réactivation du profil.";
  }

  if (flow.availabilityStatus === "ONLINE" && !flow.accountCanReceiveOffers) {
    return "Finalisez votre profil pour débloquer les offres.";
  }

  if (flow.availabilityStatus === "ONLINE") {
    return flow.visibleOfferCount > 0
      ? "Traitez les offres réservées avant expiration."
      : "Restez disponible et gardez l'application ouverte.";
  }

  return "Passez en ligne quand vous êtes prêt à recevoir des offres.";
}

export function buildDriverMissionSnapshot(input: {
  flow: DriverActiveFlowSummary;
  tripDetail?: TripDetailResponse | null;
}) {
  const { activeTrip } = input.flow;

  if (!activeTrip) {
    return [];
  }

  const detail = input.tripDetail?.trip ?? null;
  const routeMonitoring = detail?.routeMonitoring ?? null;
  const latestPosition = routeMonitoring?.latestPosition ?? null;
  const approachDistance =
    activeTrip.status === "IN_PROGRESS"
      ? latestPosition?.distanceToDestinationKm
      : latestPosition?.distanceToPickupKm;
  const approachDistanceLabel = formatDistanceKm(
    approachDistance,
    routeMonitoring ? formatOperationalStatus(routeMonitoring.state) : "En attente",
  );
  const hasApproachDistance = toFiniteFlowNumber(approachDistance) !== null;

  return [
    {
      label: "Action",
      value: input.flow.primaryStatusLabel,
      helper: buildDriverNextActionHint(input.flow),
    },
    {
      label: "Passager",
      value: activeTrip.counterpartyName ?? detail?.riderName ?? "Assigné",
      helper:
        activeTrip.status === "DRIVER_ARRIVING"
          ? "Confirmez oralement le nom et le point de départ"
          : "Vérifiez le passager avant départ",
    },
    {
      label: activeTrip.status === "IN_PROGRESS" ? "Destination" : "Prise en charge",
      value: approachDistanceLabel,
      helper:
        hasApproachDistance
          ? latestPosition?.observedAt
            ? `Position mise à jour ${formatTimeLabel(latestPosition.observedAt)}`
            : "Position mission reçue"
          : routeMonitoring
            ? routeMonitoring.alertCount > 0
              ? `${routeMonitoring.alertCount} alerte trajet`
              : "Trajet cohérent"
            : "Position attendue",
    },
    {
      label: "Véhicule",
      value: activeTrip.vehicleLabel ?? detail?.vehicleLabel ?? "Actif",
      helper: "Profil verrouillé pendant la mission",
    },
    {
      label: "Gain chauffeur",
      value: formatDriverEarningsAmount(
        detail?.driverPayout ?? activeTrip.amount,
      ),
      helper: detail?.actualFare
        ? `Prix client ${formatDriverEarningsAmount(detail.actualFare)}`
        : activeTrip.currency,
    },
  ];
}

export function buildDriverLiveRouteProgress(input: {
  flow: DriverActiveFlowSummary;
  tripDetail?: TripDetailResponse | null;
}) {
  const { activeTrip } = input.flow;
  const routeMonitoring = input.tripDetail?.trip.routeMonitoring ?? null;
  const latestPosition = routeMonitoring?.latestPosition ?? null;

  if (!activeTrip || !routeMonitoring || !latestPosition) {
    return null;
  }

  const isHeadingToDestination = activeTrip.status === "IN_PROGRESS";
  const remainingDistanceKm = isHeadingToDestination
    ? latestPosition.distanceToDestinationKm
    : latestPosition.distanceToPickupKm;
  const remainingDistance = toFiniteFlowNumber(remainingDistanceKm);
  const speedKph = toFiniteFlowNumber(latestPosition.speedKph);
  const accuracyMeters = toFiniteFlowNumber(latestPosition.accuracyMeters);

  return {
    title: isHeadingToDestination
      ? "Vers destination"
      : "Approche prise en charge",
    stateLabel: formatOperationalStatus(routeMonitoring.state),
    distanceLabel:
      remainingDistance !== null
        ? `${remainingDistance.toFixed(1)} km restant`
        : "Distance en attente",
    progressPercent:
      remainingDistance !== null
        ? estimateRouteProgressPercent(remainingDistance)
        : routeMonitoring.state === "clear"
          ? 42
          : 18,
    freshnessLabel: `Position ${formatTimeLabel(latestPosition.observedAt)}`,
    coordinateLabel: "Position actualisée",
    accuracyLabel:
      accuracyMeters !== null
        ? `Signal ${Math.round(accuracyMeters)} m`
        : "Signal en attente",
    speedLabel:
      speedKph !== null
        ? `${Math.round(speedKph)} km/h`
        : "Vitesse indisponible",
    etaLabel:
      remainingDistance !== null
        ? estimateArrivalLabel({
            remainingDistanceKm: remainingDistance,
            speedKph,
            isHeadingToDestination,
          })
        : "Arrivée en attente",
    note:
      routeMonitoring.state === "unknown"
        ? "Position en attente."
        : routeMonitoring.state === "clear"
          ? "Route cohérente sur la dernière position."
          : "Route à vérifier avec attention.",
    tone:
      routeMonitoring.state === "critical"
        ? "rose"
        : routeMonitoring.state === "warning"
          ? "amber"
          : "sky",
  } as const;
}

export function buildDriverRiderTrustSnapshot(input: {
  tripDetail?: TripDetailResponse | null;
}) {
  const detail = input.tripDetail?.trip ?? null;

  if (!detail) {
    return null;
  }

  return {
    riderName: detail.riderName,
    initials: buildInitials(detail.riderName),
    routeLabel: `${detail.pickupAddress} vers ${detail.destinationAddress}`,
    fareLabel: formatDriverEarningsAmount(detail.actualFare),
    driverPayoutLabel:
      detail.driverPayout !== null && detail.driverPayout !== undefined
        ? formatDriverEarningsAmount(detail.driverPayout)
        : null,
    platformFeeLabel:
      detail.platformFee !== null && detail.platformFee !== undefined
        ? formatDriverEarningsAmount(detail.platformFee)
        : null,
    vehicleLabel: detail.vehicleLabel,
  };
}

function estimateRouteProgressPercent(remainingDistanceKm: number) {
  if (remainingDistanceKm <= 0.1) {
    return 96;
  }

  if (remainingDistanceKm <= 0.5) {
    return 78;
  }

  if (remainingDistanceKm <= 1) {
    return 62;
  }

  if (remainingDistanceKm <= 3) {
    return 38;
  }

  return 18;
}

function estimateArrivalLabel(input: {
  remainingDistanceKm: number;
  speedKph?: number | null;
  isHeadingToDestination: boolean;
}) {
  const fallbackSpeedKph = input.isHeadingToDestination ? 24 : 18;
  const speedKph =
    typeof input.speedKph === "number" && input.speedKph >= 6
      ? input.speedKph
      : fallbackSpeedKph;
  const etaMinutes = Math.max(
    1,
    Math.round((input.remainingDistanceKm / speedKph) * 60),
  );

  return input.isHeadingToDestination
    ? `Arrivée ~${etaMinutes} min`
    : `Prise en charge ~${etaMinutes} min`;
}

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

function formatApproxCoordinateLabel(
  latitude: unknown,
  longitude: unknown,
  label: string,
) {
  const lat = toFiniteFlowNumber(latitude);
  const lon = toFiniteFlowNumber(longitude);

  return lat !== null && lon !== null
    ? `${label} approx. ${lat.toFixed(4)}, ${lon.toFixed(4)}`
    : `${label} position approximative indisponible`;
}

function formatTimeLabel(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "recent";
  }

  return date.toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function buildDriverEarningsStatusLabel(input: {
  flow: DriverActiveFlowSummary;
}) {
  if (input.flow.activeTrip) {
    return `Revenus à jour. Course active: ${input.flow.primaryStatusLabel}.`;
  }

  if (input.flow.operationalStatus === "SUSPENDED") {
    return "Revenus à jour. Compte suspendu, reprise en attente.";
  }

  return input.flow.availabilityStatus === "ONLINE"
    ? "Revenus à jour. Vous êtes en ligne pour recevoir des courses."
    : "Revenus à jour. Passez en ligne pour recevoir des courses.";
}

export function buildDriverProfileStatusLabel(input: {
  flow: DriverActiveFlowSummary;
}) {
  if (input.flow.activeTrip) {
    return `Profil charge. Mission ${input.flow.primaryStatusLabel} en cours.`;
  }

  if (input.flow.operationalStatus === "SUSPENDED") {
    return "Profil charge. Compte suspendu, verification requise.";
  }

  return input.flow.availabilityStatus === "ONLINE"
    ? "Profil charge. Chauffeur en ligne."
    : "Profil charge. Chauffeur hors ligne.";
}

export function buildDriverFlowTransitionLabel(
  previousFlowState: string | null,
  nextFlowState: string | null,
  surface: "home" | "offers",
) {
  const nextStatus = extractStatusFromFlowState(nextFlowState);

  if (surface === "home") {
    if (!previousFlowState && nextFlowState && nextStatus) {
      return `Mission active ouverte: ${formatOperationalStatus(nextStatus)}.`;
    }

    if (
      previousFlowState &&
      nextFlowState &&
      previousFlowState !== nextFlowState &&
      nextStatus
    ) {
      return `Mission mise à jour: ${formatOperationalStatus(nextStatus)}.`;
    }

    if (previousFlowState && !nextFlowState) {
    return "La mission active est terminee.";
    }

    return null;
  }

  if (!previousFlowState && nextFlowState && nextStatus) {
    return `Mission ouverte: ${formatOperationalStatus(nextStatus)}.`;
  }

  if (
    previousFlowState &&
    nextFlowState &&
    previousFlowState !== nextFlowState &&
    nextStatus
  ) {
    return `Statut mis a jour: ${formatOperationalStatus(nextStatus)}.`;
  }

  if (previousFlowState && !nextFlowState) {
    return "La mission active est terminee.";
  }

  return null;
}

export function resolveDriverReservationChangeSet(
  previousVisibleOfferIds: string[] | null,
  nextVisibleOfferIds: string[],
) {
  if (!previousVisibleOfferIds) {
    return {
      freshOfferIds: [] as string[],
      expiredOfferIds: [] as string[],
    };
  }

  return {
    freshOfferIds: nextVisibleOfferIds.filter(
      (offerId) => !previousVisibleOfferIds.includes(offerId),
    ),
    expiredOfferIds: previousVisibleOfferIds.filter(
      (offerId) => !nextVisibleOfferIds.includes(offerId),
    ),
  };
}

function normalizeDriverProfileStatus(
  status: string | null | undefined,
): DriverResolvedOperationalStatus {
  if (status === "ONLINE") {
    return "ONLINE";
  }

  if (status === "BUSY") {
    return "BUSY";
  }

  if (status === "SUSPENDED") {
    return "SUSPENDED";
  }

  return "OFFLINE";
}

function normalizeDriverVerificationStatus(status: string | null | undefined) {
  const normalized = status?.toUpperCase();

  if (
    normalized === "APPROVED" ||
    normalized === "PENDING" ||
    normalized === "REJECTED"
  ) {
    return normalized;
  }

  return "APPROVED";
}

function extractStatusFromFlowState(flowState: string | null) {
  if (!flowState) {
    return null;
  }

  const [, status] = flowState.split(":");

  return status ?? null;
}
