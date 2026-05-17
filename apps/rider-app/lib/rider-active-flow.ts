import {
  isActiveTripLifecycleStatus,
  type MyTripsResponse,
  type TripDetailResponse,
} from '@orbi/api';
import { formatOperationalStatus, formatXof } from '@orbi/ui';

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

export function buildRiderNextActionHint(flow: RiderActiveFlowSummary) {
  if (flow.activeTrip?.status === 'MATCHED') {
    return 'Verifiez le chauffeur, le vehicule et la plaque avant de monter.';
  }

  if (flow.activeTrip?.status === 'DRIVER_ARRIVING') {
    return flow.activeTrip.pickupCode
      ? 'Gardez le code pickup pret et ne le donnez qu au bon chauffeur.'
      : 'Attendez le chauffeur au point de depart confirme.';
  }

  if (flow.activeTrip?.status === 'IN_PROGRESS') {
    return 'Suivez le trajet live et utilisez SOS ou partage si la course devient sensible.';
  }

  if (flow.activeTrip) {
    return 'Le flux actif est en transition, actualisez le suivi si besoin.';
  }

  if (flow.activeRequest) {
    return 'Restez joignable: le dispatch cherche un chauffeur compatible.';
  }

  return 'Aucune action urgente: vous pouvez preparer une nouvelle reservation.';
}

export function buildRiderMissionSnapshot(input: {
  flow: RiderActiveFlowSummary;
  tripDetail?: TripDetailResponse | null;
}) {
  const { activeTrip } = input.flow;

  if (!activeTrip) {
    return [];
  }

  const detail = input.tripDetail?.trip ?? null;
  const verification = detail?.driverVerification ?? null;
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
      helper: buildRiderNextActionHint(input.flow),
    },
    {
      label: 'Chauffeur',
      value: verification
        ? formatOperationalStatus(verification.verificationStatus)
        : activeTrip.counterpartyName ?? 'Assigne',
      helper: verification
        ? `${verification.vehicle.color} ${verification.vehicle.make} ${verification.vehicle.model}`
        : activeTrip.vehicleLabel ?? 'Details vehicule en attente',
    },
    {
      label: activeTrip.status === 'IN_PROGRESS' ? 'Destination' : 'Approche',
      value:
        typeof approachDistance === 'number'
          ? `${approachDistance.toFixed(1)} km`
          : routeMonitoring
            ? formatOperationalStatus(routeMonitoring.state)
            : 'Position',
      helper:
        typeof approachDistance === 'number'
          ? latestPosition?.observedAt
            ? `Dernier signal ${formatTimeLabel(latestPosition.observedAt)}`
            : 'Position chauffeur recue'
          : routeMonitoring
            ? routeMonitoring.alertCount > 0
              ? `${routeMonitoring.alertCount} signal route`
              : 'Trajet coherent'
            : 'En attente du premier signal route',
    },
    {
      label: 'Code',
      value: pickupCode ? pickupCode : 'Attente',
      helper: pickupCode
        ? 'A communiquer uniquement au bon chauffeur'
        : 'Code visible quand le chauffeur arrive',
    },
    {
      label: 'Tarif',
      value: formatXof(detail?.actualFare ?? activeTrip.amount),
      helper: activeTrip.currency,
    },
  ];
}

export function buildRiderLiveRouteProgress(input: {
  flow: RiderActiveFlowSummary;
  tripDetail?: TripDetailResponse | null;
  now?: string | Date;
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
  const signalHealth = buildRiderRouteSignalHealth({
    observedAt: latestPosition.observedAt,
    routeState: routeMonitoring.state,
    now: input.now,
  });
  const etaLabel =
    typeof remainingDistanceKm === 'number'
      ? estimateArrivalLabel({
          remainingDistanceKm,
          speedKph: latestPosition.speedKph,
          isHeadingToDestination,
        })
      : 'ETA en attente';

  return {
    title: isHeadingToDestination
      ? 'Trajet vers destination'
      : 'Chauffeur en approche',
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
    freshnessLabel: signalHealth.freshnessLabel,
    coordinateLabel: `${latestPosition.latitude.toFixed(5)}, ${latestPosition.longitude.toFixed(5)}`,
    accuracyLabel:
      typeof latestPosition.accuracyMeters === 'number'
        ? `Precision ${Math.round(latestPosition.accuracyMeters)} m`
        : 'Precision inconnue',
    speedLabel:
      typeof latestPosition.speedKph === 'number'
        ? `${Math.round(latestPosition.speedKph)} km/h`
        : 'Vitesse indisponible',
    etaLabel,
    note: signalHealth.note,
    tone: signalHealth.tone,
  } as const;
}

export function buildRiderRouteSignalHealth(input: {
  observedAt: string;
  routeState: string;
  now?: string | Date;
}) {
  const observedAt = new Date(input.observedAt);
  const now = input.now ? new Date(input.now) : new Date();
  const ageMs = now.getTime() - observedAt.getTime();

  if (Number.isNaN(observedAt.getTime()) || Number.isNaN(now.getTime())) {
    return {
      freshnessLabel: 'Signal recent',
      note: 'Signal route recu, horodatage a verifier.',
      tone: 'amber' as const,
    };
  }

  const ageSeconds = Math.max(0, Math.round(ageMs / 1000));
  const freshnessLabel =
    ageSeconds < 45
      ? 'Signal maintenant'
      : ageSeconds < 120
        ? `Signal il y a ${Math.round(ageSeconds / 60)} min`
        : `Signal ancien ${Math.round(ageSeconds / 60)} min`;

  if (input.routeState === 'critical') {
    return {
      freshnessLabel,
      note: 'Alerte route critique: restez attentif et gardez le partage actif.',
      tone: 'rose' as const,
    };
  }

  if (input.routeState === 'warning') {
    return {
      freshnessLabel,
      note: 'Signal route a surveiller: les operations voient aussi cette anomalie.',
      tone: 'amber' as const,
    };
  }

  if (ageSeconds >= 120) {
    return {
      freshnessLabel,
      note: 'Signal chauffeur ancien: Orbi garde le dernier point et attend une nouvelle position.',
      tone: 'amber' as const,
    };
  }

  return {
    freshnessLabel,
    note:
      input.routeState === 'unknown'
        ? 'Le premier signal route est attendu.'
        : 'Le dernier signal route est coherent.',
    tone: 'sky' as const,
  };
}

export function buildRiderDriverTrustSnapshot(input: {
  tripDetail?: TripDetailResponse | null;
}) {
  const detail = input.tripDetail?.trip ?? null;
  const verification = detail?.driverVerification ?? null;

  if (!detail || !verification) {
    return null;
  }

  const vehicle = verification.vehicle;
  const vehicleMeta = [
    vehicle.type ? formatOperationalStatus(vehicle.type) : null,
    vehicle.tier ? formatOperationalStatus(vehicle.tier) : null,
    vehicle.year ? String(vehicle.year) : null,
    vehicle.seats ? `${vehicle.seats} places` : null,
  ].filter((item): item is string => Boolean(item));

  return {
    driverName: detail.driverName,
    initials: buildInitials(detail.driverName),
    profilePhotoUrl: verification.profilePhotoUrl ?? null,
    verificationLabel: formatOperationalStatus(verification.verificationStatus),
    ratingLabel:
      verification.averageRating === null
        ? `${verification.completedTripsCount} courses`
        : `${verification.averageRating.toFixed(1)}/5, ${verification.completedTripsCount} courses`,
    phoneLabel: verification.phoneVerified
      ? 'Telephone verifie'
      : 'Telephone non verifie',
    vehicleLabel: `${vehicle.color} ${vehicle.make} ${vehicle.model}`,
    plateLabel: vehicle.plateNumber,
    vehicleMeta,
    photoLabel: verification.profilePhotoUrl
      ? 'Photo chauffeur verifiee'
      : 'Photo chauffeur pas encore exposee',
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
    typeof input.speedKph === 'number' && input.speedKph >= 6
      ? input.speedKph
      : fallbackSpeedKph;
  const etaMinutes = Math.max(
    1,
    Math.round((input.remainingDistanceKm / speedKph) * 60),
  );

  return input.isHeadingToDestination
    ? `Arrivee ~${etaMinutes} min`
    : `Pickup ~${etaMinutes} min`;
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
