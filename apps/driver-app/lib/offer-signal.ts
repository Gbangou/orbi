import { type DriverOffer } from '@orbi/api';
import { formatXof } from '@orbi/ui';
import { roundXofForCashOperations } from '@orbi/domain';

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

function resolveBusinessPriorityTone(
  label: DriverOffer['businessPriorityLabel'],
): OfferSignalTone {
  switch (label) {
    case 'EXCELLENT':
      return 'teal';
    case 'SOLID':
      return 'sky';
    case 'WATCH':
      return 'amber';
    case 'WEAK':
      return 'rose';
    default:
      return 'sky';
  }
}

function resolveBusinessPriorityLabel(
  label: DriverOffer['businessPriorityLabel'],
) {
  switch (label) {
    case 'EXCELLENT':
      return 'Tres rentable';
    case 'SOLID':
      return 'Solide';
    case 'WATCH':
      return 'A verifier';
    case 'WEAK':
      return 'Faible';
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

export function formatDriverOfferMoney(
  primary: unknown,
  fallback: unknown = null,
  unavailableLabel = 'Gain indisponible',
) {
  const primaryAmount = toFiniteOfferNumber(primary);
  if (primaryAmount !== null) {
    return formatXof(roundXofForCashOperations(primaryAmount).amount);
  }

  const fallbackAmount = toFiniteOfferNumber(fallback);
  if (fallbackAmount !== null) {
    return formatXof(roundXofForCashOperations(fallbackAmount).amount);
  }

  return unavailableLabel;
}

export function formatDriverOfferFare(offer: DriverOffer) {
  const fare = toFiniteOfferNumber(offer.fare);
  return fare !== null
    ? formatXof(roundXofForCashOperations(fare).amount)
    : 'Prix indisponible';
}

export function resolveDriverOfferMoneyDisplay(offer: DriverOffer): {
  amountLabel: string;
  label: string;
  helper: string;
  isNet: boolean;
} {
  const driverPayout = toFiniteOfferNumber(offer.driverPayout);

  if (driverPayout !== null) {
    return {
      amountLabel: formatDriverOfferMoney(driverPayout),
      label: 'Gain net',
      helper: 'Votre part chauffeur estimee',
      isNet: true,
    };
  }

  return {
    amountLabel: formatDriverOfferFare(offer),
    label: 'Prix client',
    helper: 'Gain chauffeur a confirmer',
    isNet: false,
  };
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
      label: 'Qualite',
      value: resolveBusinessPriorityLabel(offer.businessPriorityLabel),
      tone: resolveBusinessPriorityTone(offer.businessPriorityLabel),
    },
    {
      label: 'Gain',
      value: formatDriverOfferMoney(offer.driverPayout, offer.fare),
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
    `${offer.category === 'motorcycle' ? 'Moto' : 'Voiture'} - trajet ${formatOfferNumber(offer.distanceKm)} km`,
    pickupDistanceKm !== null
      ? `Pickup a ${pickupDistanceKm} km`
      : null,
    offer.pickupDistanceSource
      ? `Distance depart: ${offer.pickupDistanceSource === 'DRIVER_AND_PICKUP_COORDINATES' ? 'confirmee' : 'estimee'}`
      : null,
    serviceRadiusKm !== null
      ? `Zone de service: ${serviceRadiusKm} km`
      : null,
    offer.matchedTier ? `Vehicule retenu: ${offer.matchedTier}` : null,
    null,
    offer.offerConfidenceLabel || offerConfidenceScore !== null
      ? `Qualite offre: ${resolveOfferPriorityLabel(offer.offerConfidenceLabel)}${offerConfidenceScore !== null ? ` (${offerConfidenceScore}/100)` : ''}`
      : null,
    offer.businessPriorityLabel || offer.businessPriorityScore
      ? `Rentabilite: ${resolveBusinessPriorityLabel(offer.businessPriorityLabel)}${offer.businessPriorityScore ? ` (${offer.businessPriorityScore}/100)` : ''}`
      : null,
    null,
    fairnessScore !== null
        ? `Equilibre course: ${fairnessScore}/100`
        : null,
    reservationWindow !== null && reservationWindow >= 0
      ? `Fenetre d acceptation: ${reservationWindow}s`
      : null,
    null,
  ];

  return lines.filter((line): line is string => Boolean(line));
}

export function buildDriverOfferDecisionSummary(offer: DriverOffer): {
  title: string;
  subtitle: string;
  tone: OfferSignalTone;
  driverSharePercent: number | null;
  payoutPerEffortKm: number | null;
} {
  const fare = toFiniteOfferNumber(offer.fare);
  const driverPayout = toFiniteOfferNumber(offer.driverPayout);
  const tripDistanceKm = toFiniteOfferNumber(offer.distanceKm);
  const pickupDistanceKm = toFiniteOfferNumber(offer.pickupDistanceKm) ?? 0;
  const driverEffortKm =
    tripDistanceKm !== null ? Math.max(0.1, tripDistanceKm + pickupDistanceKm) : null;
  const driverSharePercent =
    fare !== null && fare > 0 && driverPayout !== null
      ? Math.round((driverPayout / fare) * 100)
      : null;
  const payoutPerEffortKm =
    driverEffortKm !== null && driverPayout !== null
      ? Math.round(driverPayout / driverEffortKm)
      : null;
  const tone: OfferSignalTone =
    offer.fairnessLabel === 'DRIVER_PAYOUT_WATCH'
      ? 'amber'
      : offer.fairnessLabel === 'RIDER_ACCESSIBILITY_WATCH'
        ? 'sky'
        : offer.fairnessLabel === 'OPS_MARGIN_WATCH'
          ? 'rose'
          : 'teal';

  if (driverPayout === null) {
    return {
      title: 'Gain a confirmer',
      subtitle: 'Actualisez les offres avant de prendre une decision.',
      tone: 'amber',
      driverSharePercent,
      payoutPerEffortKm,
    };
  }

  const title =
    payoutPerEffortKm !== null
      ? `${formatDriverOfferMoney(driverPayout)} net - ${payoutPerEffortKm} XOF/km approche`
      : `${formatDriverOfferMoney(driverPayout)} net estime`;
  const share =
    driverSharePercent !== null ? `${driverSharePercent}% du prix` : 'part chauffeur verifiee';
  const subtitle =
    tone === 'amber'
      ? `${share}. Pickup ou distance a surveiller avant acceptation.`
      : tone === 'rose'
        ? `${share}. Acceptez seulement si le trajet est fluide.`
        : `${share}. Offre lisible avec gain et effort connus.`;

  return {
    title,
    subtitle,
    tone,
    driverSharePercent,
    payoutPerEffortKm,
  };
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
      'Votre fiabilite recente est excellente. Cette course vous est proposee en priorite.',
    HIGH:
      'Votre comportement recent est positif. Vous etes le meilleur candidat disponible pour cette course.',
    MEDIUM:
      'Quelques expirations recentes detectees. Accepter aide a garder un profil solide.',
    LOW:
      'Signal faible. Finaliser ce trajet peut ameliorer vos prochaines propositions.',
  };

  return {
    badge: resolveOfferPriorityLabel(offer.offerConfidenceLabel),
    score,
    barPercent: Math.max(5, Math.min(100, score)),
    explanation:
      explanations[offer.offerConfidenceLabel] ??
      'Cette offre correspond a votre profil.',
    windowLabel,
    tone: resolveOfferPriorityTone(offer.offerConfidenceLabel),
  };
}

export function buildDriverOfferNote(offer: DriverOffer) {
  if (offer.pickupCodeRequired) {
    return {
      text: 'Code depart requis avant de commencer.',
      tone: 'amber' as const,
    };
  }

  if (offer.pickupDistanceSource) {
    return {
      text: `Distance depart ${offer.pickupDistanceSource === 'DRIVER_AND_PICKUP_COORDINATES' ? 'confirmee' : 'estimee'}.`,
      tone: 'sky' as const,
    };
  }

  const driverPayout = toFiniteOfferNumber(offer.driverPayout);
  if (driverPayout !== null) {
    return {
      text: `Gain net estime: ${formatDriverOfferMoney(driverPayout)}`,
      tone: 'sky' as const,
    };
  }

  return null;
}
