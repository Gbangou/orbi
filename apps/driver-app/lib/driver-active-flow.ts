import { isActiveTripLifecycleStatus, type DriverOffer, type MyTripsResponse } from '@orbi/api';
import { formatOperationalStatus } from '@orbi/ui';
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
