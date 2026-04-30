import { type DriverOffer } from '@mobilis/api';
import { formatXof } from '@mobilis/ui';

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
      value: `${offer.etaToPickupMinutes} min`,
      tone: 'teal',
    },
    {
      label: 'Priorite',
      value: resolveOfferPriorityLabel(offer.offerConfidenceLabel),
      tone: resolveOfferPriorityTone(offer.offerConfidenceLabel),
    },
    {
      label: 'Gain',
      value: formatXof(offer.driverPayout ?? offer.fare),
      tone: 'amber',
    },
  ];
}

export function buildDriverOfferDetailLines(offer: DriverOffer) {
  const lines = [
    `${offer.category === 'motorcycle' ? 'Moto' : 'Voiture'} - trajet ${offer.distanceKm} km - priorite dispatch ${offer.dispatchScore ?? '-'}`,
    offer.pickupDistanceKm !== undefined && offer.pickupDistanceKm !== null
      ? `Pickup a ${offer.pickupDistanceKm} km`
      : null,
    offer.pickupDistanceSource
      ? `Source pickup: ${offer.pickupDistanceSource === 'DRIVER_AND_PICKUP_COORDINATES' ? 'coordonnees reelles' : 'fallback dispatch'}`
      : null,
    offer.serviceRadiusKm !== undefined && offer.serviceRadiusKm !== null
      ? `Rayon actif: ${offer.serviceRadiusKm} km`
      : null,
    offer.matchedTier ? `Vehicule retenu: ${offer.matchedTier}` : null,
    offer.dispatchContextSummary
      ? `Contexte dispatch: ${offer.dispatchContextSummary}`
      : null,
    offer.offerConfidenceLabel || offer.offerConfidenceScore !== undefined
      ? `Confiance offre: ${offer.offerConfidenceLabel ?? 'ND'}${offer.offerConfidenceScore !== undefined && offer.offerConfidenceScore !== null ? ` (${offer.offerConfidenceScore}/100)` : ''}`
      : null,
    offer.reservationWindowSeconds !== undefined &&
    offer.reservationWindowSeconds !== null
      ? `Fenetre d acceptation: ${offer.reservationWindowSeconds}s`
      : null,
    offer.dispatchLearningSummary ?? null,
  ];

  return lines.filter((line): line is string => Boolean(line));
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

  if (offer.driverPayout) {
    return {
      text: `Gain net estime: ${formatXof(offer.driverPayout)}`,
      tone: 'sky' as const,
    };
  }

  return null;
}
