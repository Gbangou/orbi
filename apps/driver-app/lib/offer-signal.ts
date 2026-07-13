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

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function formatOfferNumber(value: unknown, fallback = 'ND') {
  return isFiniteNumber(value) ? String(value) : fallback;
}

function formatOfferMinutes(value: unknown) {
  return isFiniteNumber(value) && value >= 0 ? `${Math.round(value)} min` : 'Indisponible';
}

function formatOfferMoney(primary: unknown, fallback: unknown) {
  if (isFiniteNumber(primary)) {
    return formatXof(primary);
  }

  if (isFiniteNumber(fallback)) {
    return formatXof(fallback);
  }

  return 'Gain indisponible';
}

export function formatDriverOfferFare(offer: DriverOffer) {
  return isFiniteNumber(offer.fare) ? formatXof(offer.fare) : 'Prix indisponible';
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
      value: formatOfferMinutes(offer.etaToPickupMinutes),
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
  const hasPickupDistance = isFiniteNumber(offer.pickupDistanceKm);
  const hasServiceRadius = isFiniteNumber(offer.serviceRadiusKm);
  const hasOfferConfidenceScore = isFiniteNumber(offer.offerConfidenceScore);
  const hasFairnessScore = isFiniteNumber(offer.fairnessScore);
  const reservationWindowSeconds = offer.reservationWindowSeconds;
  const hasReservationWindow = isFiniteNumber(reservationWindowSeconds);
  const lines = [
    `${offer.category === 'motorcycle' ? 'Moto' : 'Voiture'} - trajet ${formatOfferNumber(offer.distanceKm)} km - priorite dispatch ${formatOfferNumber(offer.dispatchScore, '-')}`,
    hasPickupDistance
      ? `Pickup a ${offer.pickupDistanceKm} km`
      : null,
    offer.pickupDistanceSource
      ? `Source pickup: ${offer.pickupDistanceSource === 'DRIVER_AND_PICKUP_COORDINATES' ? 'coordonnees reelles' : 'fallback dispatch'}`
      : null,
    hasServiceRadius
      ? `Rayon actif: ${offer.serviceRadiusKm} km`
      : null,
    offer.matchedTier ? `Vehicule retenu: ${offer.matchedTier}` : null,
    offer.dispatchContextSummary
      ? `Contexte dispatch: ${offer.dispatchContextSummary}`
      : null,
    offer.offerConfidenceLabel || hasOfferConfidenceScore
      ? `Confiance offre: ${offer.offerConfidenceLabel ?? 'ND'}${hasOfferConfidenceScore ? ` (${offer.offerConfidenceScore}/100)` : ''}`
      : null,
    offer.fairnessSummary
      ? `Fairness marketplace: ${offer.fairnessSummary}`
      : hasFairnessScore
        ? `Fairness marketplace: ${offer.fairnessScore}/100`
        : null,
    hasReservationWindow && reservationWindowSeconds >= 0
      ? `Fenetre d acceptation: ${reservationWindowSeconds}s`
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

  const score = isFiniteNumber(offer.offerConfidenceScore)
    ? offer.offerConfidenceScore
    : 50;
  const windowSeconds = isFiniteNumber(offer.reservationWindowSeconds)
    ? offer.reservationWindowSeconds
    : null;
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

  if (isFiniteNumber(offer.driverPayout)) {
    return {
      text: `Gain net estime: ${formatXof(offer.driverPayout)}`,
      tone: 'sky' as const,
    };
  }

  return null;
}
