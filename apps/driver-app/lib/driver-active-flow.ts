import {
  isActiveTripLifecycleStatus,
  type DriverOffer,
  type MyTripsResponse,
  type TripDetailResponse,
} from '@orbi/api';
import { formatOperationalStatus, formatXof } from '@orbi/ui';
import { isOfferReservationActive } from './offer-reservation';

export type DriverResolvedOperationalStatus =
  | 'ONLINE'
  | 'OFFLINE'
  | 'BUSY'
  | 'SUSPENDED';

export type DriverActiveFlowSummary = {
  activeTrip: MyTripsResponse['recentTrips'][number] | null;
  activeFlowState: string | null;
  primaryStatusLabel: string;
  primaryRouteLabel: string | null;
  operationalStatus: DriverResolvedOperationalStatus;
  availabilityStatus: 'ONLINE' | 'OFFLINE';
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
}): DriverActiveFlowSummary {
  const activeTrip =
    input.history?.recentTrips.find((trip) => isActiveTripLifecycleStatus(trip.status)) ??
    null;
  const normalizedProfileStatus = normalizeDriverProfileStatus(input.driverProfileStatus);
  const operationalStatus = activeTrip ? 'BUSY' : normalizedProfileStatus;
  const availabilityStatus = normalizedProfileStatus === 'ONLINE' ? 'ONLINE' : 'OFFLINE';
  const canReceiveOffers = availabilityStatus === 'ONLINE' && !activeTrip;
  const visibleOffers = canReceiveOffers
    ? input.offers.filter((offer) => isOfferReservationActive(offer, input.reservationNow))
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
    availabilityStatus,
    heroTitle:
      operationalStatus === 'BUSY'
        ? 'Occupe'
        : operationalStatus === 'ONLINE'
          ? 'En ligne'
          : operationalStatus === 'SUSPENDED'
            ? 'Suspendu'
            : 'Hors ligne',
    visibleOffers,
    visibleOfferCount: visibleOffers.length,
    canReceiveOffers,
    availabilityLocked: Boolean(activeTrip) || operationalStatus === 'SUSPENDED',
  };
}

export function buildDriverHomeStatusLabel(input: {
  flow: DriverActiveFlowSummary;
  fullName: string;
}) {
  if (input.flow.activeTrip) {
    return `Course ${input.flow.activeTrip.status} avec ${input.flow.activeTrip.counterpartyName ?? 'votre client'}.`;
  }

  if (input.flow.operationalStatus === 'SUSPENDED') {
    return 'Compte suspendu. Contactez les operations pour reprendre le direct.';
  }

  return `Connecte comme ${input.fullName}. Statut ${input.flow.availabilityStatus}. ${input.flow.visibleOfferCount} offres disponibles et 0 course active.`;
}

export function buildDriverDispatchStatusLabel(input: {
  flow: DriverActiveFlowSummary;
}) {
  if (input.flow.activeTrip) {
    return `Course ${input.flow.activeTrip.status} avec ${input.flow.activeTrip.counterpartyName ?? 'votre client'}.`;
  }

  if (input.flow.operationalStatus === 'SUSPENDED') {
    return 'Compte suspendu. Le dispatch reste bloque tant que les operations n ont pas reactive le profil.';
  }

  return `${input.flow.visibleOfferCount} offres chargees. Statut chauffeur ${input.flow.availabilityStatus}.`;
}

export function buildDriverNextActionHint(flow: DriverActiveFlowSummary) {
  if (flow.activeTrip?.status === 'MATCHED') {
    return 'Rejoignez le point de depart et signalez votre arrivee uniquement sur place.';
  }

  if (flow.activeTrip?.status === 'DRIVER_ARRIVING') {
    return 'Demandez le code pickup au passager avant de demarrer la course.';
  }

  if (flow.activeTrip?.status === 'IN_PROGRESS') {
    return 'Terminez la course seulement apres depot au point confirme.';
  }

  if (flow.operationalStatus === 'SUSPENDED') {
    return 'Aucune action terrain: attendez la reactivation par les operations.';
  }

  if (flow.availabilityStatus === 'ONLINE') {
    return flow.visibleOfferCount > 0
      ? 'Traitez les offres reservees avant expiration.'
      : 'Restez proche de votre zone et gardez la presence active.';
  }

  return 'Passez en ligne quand vous etes pret a recevoir des offres.';
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
  const pickupCode = detail?.pickupCode ?? activeTrip.pickupCode ?? null;
  const approachDistance =
    activeTrip.status === 'IN_PROGRESS'
      ? latestPosition?.distanceToDestinationKm
      : latestPosition?.distanceToPickupKm;

  return [
    {
      label: 'Action',
      value: input.flow.primaryStatusLabel,
      helper: buildDriverNextActionHint(input.flow),
    },
    {
      label: 'Passager',
      value: activeTrip.counterpartyName ?? detail?.riderName ?? 'Assigne',
      helper: pickupCode
        ? `Code attendu: ${pickupCode}`
        : 'Verifier le passager avant depart',
    },
    {
      label: activeTrip.status === 'IN_PROGRESS' ? 'Destination' : 'Pickup',
      value:
        typeof approachDistance === 'number'
          ? `${approachDistance.toFixed(1)} km`
          : routeMonitoring
            ? formatOperationalStatus(routeMonitoring.state)
            : 'En attente',
      helper:
        typeof approachDistance === 'number'
          ? latestPosition?.observedAt
            ? `Dernier signal ${formatTimeLabel(latestPosition.observedAt)}`
            : 'Position mission recue'
          : routeMonitoring
            ? routeMonitoring.alertCount > 0
              ? `${routeMonitoring.alertCount} signal route`
              : 'Trajet coherent'
            : 'Premier signal route attendu',
    },
    {
      label: 'Vehicule',
      value: activeTrip.vehicleLabel ?? detail?.vehicleLabel ?? 'Actif',
      helper: 'Profil verrouille pendant la mission',
    },
    {
      label: 'Tarif',
      value: formatXof(detail?.actualFare ?? activeTrip.amount),
      helper: activeTrip.currency,
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

  const isHeadingToDestination = activeTrip.status === 'IN_PROGRESS';
  const remainingDistanceKm = isHeadingToDestination
    ? latestPosition.distanceToDestinationKm
    : latestPosition.distanceToPickupKm;

  return {
    title: isHeadingToDestination ? 'Progression destination' : 'Approche pickup',
    stateLabel: formatOperationalStatus(routeMonitoring.state),
    distanceLabel:
      typeof remainingDistanceKm === 'number'
        ? `${remainingDistanceKm.toFixed(1)} km restant`
        : 'Distance en attente',
    progressPercent:
      typeof remainingDistanceKm === 'number'
        ? estimateRouteProgressPercent(remainingDistanceKm)
        : routeMonitoring.state === 'clear'
          ? 42
          : 18,
    freshnessLabel: `Signal ${formatTimeLabel(latestPosition.observedAt)}`,
    coordinateLabel: `${latestPosition.latitude.toFixed(5)}, ${latestPosition.longitude.toFixed(5)}`,
    accuracyLabel:
      typeof latestPosition.accuracyMeters === 'number'
        ? `Precision ${Math.round(latestPosition.accuracyMeters)} m`
        : 'Precision inconnue',
    speedLabel:
      typeof latestPosition.speedKph === 'number'
        ? `${Math.round(latestPosition.speedKph)} km/h`
        : 'Vitesse indisponible',
    note:
      routeMonitoring.state === 'unknown'
        ? 'Premier signal route attendu par les operations.'
        : routeMonitoring.state === 'clear'
          ? 'Route coherente sur le dernier signal.'
          : 'Une anomalie route est visible cote operations.',
    tone:
      routeMonitoring.state === 'critical'
        ? 'rose'
        : routeMonitoring.state === 'warning'
          ? 'amber'
          : 'sky',
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
    fareLabel: formatXof(detail.actualFare),
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

function buildInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('') || 'OR';
}

function formatTimeLabel(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return 'recent';
  }

  return date.toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function buildDriverEarningsStatusLabel(input: {
  flow: DriverActiveFlowSummary;
}) {
  if (input.flow.activeTrip) {
    return `Revenus synchronises. Mission ${input.flow.primaryStatusLabel} en cours.`;
  }

  if (input.flow.operationalStatus === 'SUSPENDED') {
    return 'Revenus synchronises. Compte suspendu, reprise du direct en attente des operations.';
  }

  return input.flow.availabilityStatus === 'ONLINE'
    ? 'Revenus charges depuis le flux protege. Chauffeur en ligne pour le dispatch.'
    : 'Revenus charges depuis le flux protege. Chauffeur hors ligne, historique toujours disponible.';
}

export function buildDriverProfileStatusLabel(input: {
  flow: DriverActiveFlowSummary;
}) {
  if (input.flow.activeTrip) {
    return `Profil charge. Mission ${input.flow.primaryStatusLabel} en cours.`;
  }

  if (input.flow.operationalStatus === 'SUSPENDED') {
    return 'Profil charge. Compte suspendu, revue operations requise.';
  }

  return input.flow.availabilityStatus === 'ONLINE'
    ? 'Profil charge depuis la session reelle. Chauffeur en ligne.'
    : 'Profil charge depuis la session reelle. Chauffeur hors ligne.';
}

export function buildDriverFlowTransitionLabel(
  previousFlowState: string | null,
  nextFlowState: string | null,
  surface: 'home' | 'offers',
) {
  const nextStatus = extractStatusFromFlowState(nextFlowState);

  if (surface === 'home') {
    if (!previousFlowState && nextFlowState && nextStatus) {
      return `Mission active ouverte: ${formatOperationalStatus(nextStatus)}.`;
    }

    if (previousFlowState && nextFlowState && previousFlowState !== nextFlowState && nextStatus) {
      return `Evolution live: ${formatOperationalStatus(nextStatus)}.`;
    }

    if (previousFlowState && !nextFlowState) {
      return 'La mission active a quitte le cockpit.';
    }

    return null;
  }

  if (!previousFlowState && nextFlowState && nextStatus) {
    return `Mission live ouverte: ${formatOperationalStatus(nextStatus)}.`;
  }

  if (previousFlowState && nextFlowState && previousFlowState !== nextFlowState && nextStatus) {
    return `Statut critique mis a jour: ${formatOperationalStatus(nextStatus)}.`;
  }

  if (previousFlowState && !nextFlowState) {
    return 'La mission active a quitte le flux live.';
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

function normalizeDriverProfileStatus(status: string | null | undefined): DriverResolvedOperationalStatus {
  if (status === 'ONLINE') {
    return 'ONLINE';
  }

  if (status === 'BUSY') {
    return 'BUSY';
  }

  if (status === 'SUSPENDED') {
    return 'SUSPENDED';
  }

  return 'OFFLINE';
}

function extractStatusFromFlowState(flowState: string | null) {
  if (!flowState) {
    return null;
  }

  const [, status] = flowState.split(':');

  return status ?? null;
}
