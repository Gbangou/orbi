import { isActiveTripLifecycleStatus, type MyTripsResponse } from '@mobilis/api';
import { formatOperationalStatus } from '@mobilis/ui';

export type RiderActiveFlowSummary = {
  activeTrip: MyTripsResponse['recentTrips'][number] | null;
  activeRequest: MyTripsResponse['pendingRequests'][number] | null;
  activeFlowState: string | null;
  hasOpenFlow: boolean;
  primaryStatusLabel: string;
  primaryRouteLabel: string | null;
};

export function resolveRiderActiveFlow(
  history: MyTripsResponse | null | undefined,
): RiderActiveFlowSummary {
  const activeTrip =
    history?.recentTrips.find((trip) => isActiveTripLifecycleStatus(trip.status)) ??
    null;
  const activeRequest = history?.pendingRequests[0] ?? null;
  const activeFlowState = activeTrip
    ? `TRIP:${activeTrip.status}`
    : activeRequest
      ? `REQUEST:${activeRequest.status}`
      : null;

  return {
    activeTrip,
    activeRequest,
    activeFlowState,
    hasOpenFlow: Boolean(activeTrip || activeRequest),
    primaryStatusLabel: activeTrip
      ? formatOperationalStatus(activeTrip.status)
      : activeRequest
        ? formatOperationalStatus(activeRequest.status)
        : 'Aucun flux actif',
    primaryRouteLabel: activeTrip
      ? `${activeTrip.pickupAddress} vers ${activeTrip.destinationAddress}`
      : activeRequest
        ? `${activeRequest.pickupAddress} vers ${activeRequest.destinationAddress}`
        : null,
  };
}

export function buildRiderHomeStatusLabel(input: {
  flow: RiderActiveFlowSummary;
  fullName: string;
  optionCount: number;
}) {
  if (input.flow.activeTrip) {
    return `Course ${input.flow.activeTrip.status} avec ${input.flow.activeTrip.counterpartyName ?? 'votre chauffeur'}.`;
  }

  if (input.flow.activeRequest) {
    return `Demande ${input.flow.activeRequest.status} en attente de chauffeur.`;
  }

  return `Connecte comme ${input.fullName}. ${input.optionCount} options tarifees disponibles.`;
}

export function buildRiderFlowTransitionLabel(
  previousFlowState: string | null,
  nextFlowState: string | null,
  surface: 'home' | 'booking' | 'activity' | 'account' | 'voice',
) {
  const nextStatus = extractStatusFromFlowState(nextFlowState);

  if (surface === 'home') {
    if (previousFlowState && nextFlowState && previousFlowState !== nextFlowState && nextStatus) {
      return `Evolution live: ${formatOperationalStatus(nextStatus)}.`;
    }

    if (previousFlowState && !nextFlowState) {
      return 'Le flux actif a disparu de la vue principale.';
    }

    return null;
  }

  if (surface === 'booking') {
    if (!previousFlowState && nextFlowState) {
      return 'Une reservation active vient d apparaitre dans le flux live.';
    }

    if (previousFlowState && nextFlowState && previousFlowState !== nextFlowState && nextStatus) {
      return `La reservation a change de phase: ${formatOperationalStatus(nextStatus)}.`;
    }

    if (previousFlowState && !nextFlowState) {
      return 'Le flux actif a ete nettoye de cette reservation.';
    }

    return null;
  }

  if (surface === 'account') {
    if (!previousFlowState && nextFlowState && nextStatus) {
      return `Le compte reflete maintenant un flux actif: ${formatOperationalStatus(nextStatus)}.`;
    }

    if (previousFlowState && nextFlowState && previousFlowState !== nextFlowState && nextStatus) {
      return `Le compte a resynchronise le flux actif: ${formatOperationalStatus(nextStatus)}.`;
    }

    if (previousFlowState && !nextFlowState) {
      return 'Le compte ne detecte plus de reservation active.';
    }

    return null;
  }

  if (surface === 'voice') {
    if (!previousFlowState && nextFlowState && nextStatus) {
      return `La voix detecte maintenant un flux actif: ${formatOperationalStatus(nextStatus)}.`;
    }

    if (previousFlowState && nextFlowState && previousFlowState !== nextFlowState && nextStatus) {
      return `Le contexte vocal a change de phase: ${formatOperationalStatus(nextStatus)}.`;
    }

    if (previousFlowState && !nextFlowState) {
      return 'Le contexte vocal n a plus de reservation active a rattacher.';
    }

    return null;
  }

  if (previousFlowState && nextFlowState && previousFlowState !== nextFlowState && nextStatus) {
    return `Changement critique: ${formatOperationalStatus(nextStatus)}.`;
  }

  return null;
}

export function buildRiderPeripheralStatusLabel(input: {
  flow: RiderActiveFlowSummary;
  surface: 'account' | 'voice';
  fullName?: string;
}) {
  if (input.flow.activeTrip) {
    return input.surface === 'account'
      ? `Profil charge. Course ${input.flow.activeTrip.status} en cours.`
      : `Contexte vocal charge. Course ${input.flow.activeTrip.status} en cours.`;
  }

  if (input.flow.activeRequest) {
    return input.surface === 'account'
      ? `Profil charge. Demande ${input.flow.activeRequest.status} en cours.`
      : `Contexte vocal charge. Demande ${input.flow.activeRequest.status} en cours.`;
  }

  if (input.surface === 'account') {
    return input.fullName
      ? `Profil charge pour ${input.fullName}.`
      : 'Profil charge depuis la session reelle.';
  }

  return 'Contexte vocal charge depuis la session reelle.';
}

function extractStatusFromFlowState(flowState: string | null) {
  if (!flowState) {
    return null;
  }

  const [, status] = flowState.split(':');

  return status ?? null;
}
