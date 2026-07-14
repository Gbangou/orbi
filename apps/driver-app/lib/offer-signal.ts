import { type DriverOffer } from '@orbi/api';
import { formatXof } from '@orbi/ui';

export type OfferSignalTone = 'teal' | 'amber' | 'sky' | 'rose';

function resolveOfferPriorityTone(
  label: DriverOffer['offerConfidenceLabel'],
): OfferSignalTone {
  switch (label) {
    case 'PRIORITY':
      return 'amber';
    case 'HIGH':
      return 'teal';
    case 'MEDIUM':
      return 'sky';
    case 'LOW':
    default:
      return 'rose';
  }
}

function resolveOfferPriorityLabel(label: DriverOffer['offerConfidenceLabel']) {
  switch (label) {
    case 'PRIORITY':
      return 'Priorite max';
    case 'HIGH':
      return 'Tres solide';
    case 'MEDIUM':
      return 'A evaluer';
    case 'LOW':
      return 'Signal faible';
    default:
      return 'Standard';
  }
}

export function toFiniteOfferNumber(value: unknown) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === 'string') {
    const parsed = Number(value.trim().replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function formatOfferNumber(value: unknown, fallback = 'ND') {
  const numeric = toFiniteOfferNumber(value);
  return numeric !== null ? String(numeric) : fallback;
}

export function formatDriverOfferMinutes(value: unknown, fallback = 'Indisponible') {
  const numeric = toFiniteOfferNumber(value);
  return numeric !== null && numeric >= 0
    ? `${Math.round(numeric)} min`
    : fallback;
}

export function formatDriverOfferDistance(
  value: unknown,
  fallback = 'Distance indisponible',
) {
  const numeric = toFiniteOfferNumber(value);

  if (numeric === null || numeric < 0) {
    return fallback;
  }

  return `${numeric.toFixed(1)} km`;
}

function formatOfferMoney(primary: unknown, fallback: unknown) {
  const primaryAmount = toFiniteOfferNumber(primary);
  if (primaryAmount !== null) {
    return formatXof(primaryAmount);
  }

  const fallbackAmount = toFiniteOfferNumber(fallback);
  if (fallbackAmount !== null) {
    return formatXof(fallbackAmount);
  }

  return 'Gain indisponible';
}

export function formatDriverOfferFare(offer: DriverOffer) {
  const fare = toFiniteOfferNumber(offer.fare);
  return fare !== null ? formatXof(fare) : 'Prix indisponible';
}

export function buildDriverOfferInsights(
  offer: DriverOffer,
): Array<{
  label: string;
  value: string;
  tone?: OfferSignalTone;
}> {
  return [
    {
      label: 'Pickup',
      value: formatDriverOfferMinutes(offer.etaToPickupMinutes),
      tone: 'teal',
    },
    {
      label: 'Priorite',
      value: resolveOfferPriorityLabel(offer.offerConfidenceLabel),
      tone: resolveOfferPriorityTone(offer.offerConfidenceLabel),
    },
    {
      label: 'Gain',
      value: formatOfferMoney(offer.driverPayout, offer.fare),
      tone: 'amber',
    },
  ];
}

export function buildDriverOfferDetailLines(offer: DriverOffer) {
  const pickupDistanceKm = toFiniteOfferNumber(offer.pickupDistanceKm);
  const serviceRadiusKm = toFiniteOfferNumber(offer.serviceRadiusKm);
  const offerConfidenceScore = toFiniteOfferNumber(offer.offerConfidenceScore);
  const fairnessScore = toFiniteOfferNumber(offer.fairnessScore);
  const reservationWindowSeconds = offer.reservationWindowSeconds;
  const reservationWindow = toFiniteOfferNumber(reservationWindowSeconds);
  const lines = [
    `${offer.category === 'motorcycle' ? 'Moto' : 'Voiture'} - trajet ${formatOfferNumber(offer.distanceKm)} km - priorite dispatch ${formatOfferNumber(offer.dispatchScore, '-')}`,
    pickupDistanceKm !== null
      ? `Pickup a ${pickupDistanceKm} km`
      : null,
    offer.pickupDistanceSource
      ? `Source pickup: ${offer.pickupDistanceSource === 'DRIVER_AND_PICKUP_COORDINATES' ? 'coordonnees reelles' : 'fallback dispatch'}`
      : null,
    serviceRadiusKm !== null
      ? `Rayon actif: ${serviceRadiusKm} km`
      : null,
    offer.matchedTier ? `Vehicule retenu: ${offer.matchedTier}` : null,
    offer.dispatchContextSummary
      ? `Contexte dispatch: ${offer.dispatchContextSummary}`
      : null,
    offer.offerConfidenceLabel || offerConfidenceScore !== null
      ? `Confiance offre: ${offer.offerConfidenceLabel ?? 'ND'}${offerConfidenceScore !== null ? ` (${offerConfidenceScore}/100)` : ''}`
      : null,
    offer.fairnessSummary
      ? `Fairness marketplace: ${offer.fairnessSummary}`
      : fairnessScore !== null
        ? `Fairness marketplace: ${fairnessScore}/100`
        : null,
    reservationWindow !== null && reservationWindow >= 0
      ? `Fenetre d acceptation: ${reservationWindow}s`
      : null,
    offer.dispatchLearningSummary ?? null,
  ];

  return lines.filter((line): line is string => Boolean(line));
}

export function buildDriverOfferConfidenceExplainer(offer: DriverOffer): {
  badge: string;
  score: number;
  barPercent: number;
  explanation: string;
  windowLabel: string;
  tone: OfferSignalTone;
} | null {
  if (!offer.offerConfidenceLabel) {
    return null;
  }

  const score = toFiniteOfferNumber(offer.offerConfidenceScore)
    ?? 50;
  const windowSeconds = toFiniteOfferNumber(offer.reservationWindowSeconds);
  const windowLabel =
    windowSeconds !== null && windowSeconds > 0
      ? `${windowSeconds}s pour accepter`
      : 'Fenetre limitee';

  const explanations: Record<string, string> = {
    PRIORITY:
      'Votre historique recent est excellent. Le dispatch vous a selectionne en priorite pour ce trajet.',
    HIGH:
      'Votre comportement recent est positif. Vous etes le meilleur candidat disponible pour cette course.',
    MEDIUM:
      'Quelques expirations recentes detectees. Accepter renforce votre score pour les prochaines offres.',
    LOW:
      'Signal dispatch faible. Finaliser ce trajet redressera votre profil pour les prochaines assignations.',
  };

  return {
    badge: resolveOfferPriorityLabel(offer.offerConfidenceLabel),
    score,
    barPercent: Math.max(5, Math.min(100, score)),
    explanation:
      explanations[offer.offerConfidenceLabel] ??
      'Le dispatch a selectionne cette offre pour votre profil.',
    windowLabel,
    tone: resolveOfferPriorityTone(offer.offerConfidenceLabel),
  };
}

export function buildDriverOfferNote(offer: DriverOffer) {
  if (offer.pickupCodeRequired) {
    return {
      text: 'Depart protege par code de verification.',
      tone: 'amber' as const,
    };
  }

  if (offer.pickupDistanceSource) {
    return {
      text: `Source dispatch: ${offer.pickupDistanceSource === 'DRIVER_AND_PICKUP_COORDINATES' ? 'coordonnees reelles' : 'fallback dispatch'}`,
      tone: 'sky' as const,
    };
  }

  const driverPayout = toFiniteOfferNumber(offer.driverPayout);
  if (driverPayout !== null) {
    return {
      text: `Gain net estime: ${formatXof(driverPayout)}`,
      tone: 'sky' as const,
    };
  }

  return null;
}
