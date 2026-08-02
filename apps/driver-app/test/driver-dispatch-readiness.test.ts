import type { DriverDispatchReadinessResponse } from '@orbi/api';

import { buildDriverDispatchReadinessNote } from '../lib/driver-dispatch-readiness';

function createReadiness(
  overrides: Partial<DriverDispatchReadinessResponse['readiness']> = {},
): DriverDispatchReadinessResponse['readiness'] {
  return {
    driverId: 'driver-1',
    canReceiveOffers: true,
    status: 'ONLINE',
    verificationStatus: 'APPROVED',
    activeVehicleCount: 1,
    supportedVehicleTypes: ['MOTORCYCLE'],
    supportedServiceTiers: ['MOTO_STANDARD'],
    hasGpsPosition: true,
    serviceRadiusKm: 8,
    activeTripId: null,
    compatibleOpenRequestCount: 0,
    nearOpenRequestCount: 0,
    reservedOfferCount: 0,
    heldByOtherDriverCount: 0,
    blockers: [],
    checkedAt: '2026-07-21T10:00:00.000Z',
    ...overrides,
  };
}

describe('driver-dispatch-readiness', () => {
  it('surfaces the first backend blocker before generic empty copy', () => {
    const note = buildDriverDispatchReadinessNote(
      createReadiness({
        canReceiveOffers: false,
        blockers: [
          {
            code: 'UNAPPROVED',
            message:
              'Dossier non approuve: les offres restent bloquees jusqu a validation.',
          },
        ],
      }),
    );

    expect(note).toBe(
      'Profil en attente de validation. Les offres reprendront apres approbation.',
    );
  });

  it('explains when open requests exist but are outside the driver radius', () => {
    const note = buildDriverDispatchReadinessNote(
      createReadiness({
        compatibleOpenRequestCount: 2,
        nearOpenRequestCount: 0,
      }),
    );

    expect(note).toBe('2 demandes disponibles, mais trop eloignees.');
  });

  it('confirms when the dispatch scan is really empty', () => {
    expect(buildDriverDispatchReadinessNote(createReadiness())).toBe(
      'Aucune demande disponible pour votre vehicule pour le moment.',
    );
  });
});
