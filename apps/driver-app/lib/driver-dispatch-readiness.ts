import type { DriverDispatchReadinessResponse } from '@orbi/api';

type DriverDispatchReadiness =
  DriverDispatchReadinessResponse['readiness'] | null | undefined;

export function buildDriverDispatchReadinessNote(
  readiness: DriverDispatchReadiness,
) {
  if (!readiness) {
    return 'Verification des offres en cours...';
  }

  const primaryBlocker = readiness.blockers[0];

  if (primaryBlocker) {
    return 'Profil en attente de validation. Les offres reprendront apres approbation.';
  }

  if (readiness.reservedOfferCount > 0) {
    return `${readiness.reservedOfferCount} demande${
      readiness.reservedOfferCount > 1 ? 's' : ''
    } reservee${readiness.reservedOfferCount > 1 ? 's' : ''} pour vous.`;
  }

  if (readiness.nearOpenRequestCount > 0) {
    return `${readiness.nearOpenRequestCount} demande${
      readiness.nearOpenRequestCount > 1 ? 's' : ''
    } proche${readiness.nearOpenRequestCount > 1 ? 's' : ''} detectee${
      readiness.nearOpenRequestCount > 1 ? 's' : ''
    }.`;
  }

  if (readiness.compatibleOpenRequestCount > 0) {
    return `${readiness.compatibleOpenRequestCount} demande${
      readiness.compatibleOpenRequestCount > 1 ? 's' : ''
    } disponible${readiness.compatibleOpenRequestCount > 1 ? 's' : ''}, mais trop eloignee${readiness.compatibleOpenRequestCount > 1 ? 's' : ''}.`;
  }

  if (readiness.heldByOtherDriverCount > 0) {
    return `${readiness.heldByOtherDriverCount} demande${
      readiness.heldByOtherDriverCount > 1 ? 's' : ''
    } deja reservee${readiness.heldByOtherDriverCount > 1 ? 's' : ''} ailleurs. Nous vous prevenons des qu une nouvelle offre arrive.`;
  }

  return 'Aucune demande disponible pour votre vehicule pour le moment.';
}
