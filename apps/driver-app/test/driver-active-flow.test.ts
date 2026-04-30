import { driverOffers } from '@mobilis/api';
import {
  buildDriverEarningsStatusLabel,
  buildDriverFlowTransitionLabel,
  buildDriverHomeStatusLabel,
  buildDriverProfileStatusLabel,
  resolveDriverActiveFlow,
  resolveDriverReservationChangeSet,
} from '../lib/driver-active-flow';

describe('driver-active-flow', () => {
  it('prefers the active trip and hides reservations while a mission is running', () => {
    const flow = resolveDriverActiveFlow({
      history: {
        role: 'DRIVER',
        stats: {
          activeTrips: 1,
          completedTrips: 6,
          cancelledTrips: 1,
          totalAmount: 68500,
          currency: 'XOF',
        },
        pendingRequests: [],
        recentTrips: [
          {
            id: 'trip-driver-1',
            pickupAddress: 'Universite Joseph Ki-Zerbo',
            destinationAddress: 'Ouaga 2000',
            status: 'DRIVER_ARRIVING',
            amount: 3500,
            currency: 'XOF',
            counterpartyName: 'Awa Ouedraogo',
            vehicleLabel: 'Yamaha Crypton',
            pickupCode: '1234',
            completedAt: null,
            createdAt: '2026-04-19T08:00:00.000Z',
          },
        ],
      },
      offers: driverOffers.map((offer) => ({
        ...offer,
        reservationExpiresAt: '2099-01-01T00:00:00.000Z',
      })),
      reservationNow: Date.parse('2026-04-19T10:00:00.000Z'),
      driverProfileStatus: 'BUSY',
    });

    expect(flow.operationalStatus).toBe('BUSY');
    expect(flow.primaryStatusLabel).toBe('Driver Arriving');
    expect(flow.primaryRouteLabel).toBe('Universite Joseph Ki-Zerbo vers Ouaga 2000');
    expect(flow.visibleOfferCount).toBe(0);
    expect(flow.availabilityLocked).toBe(true);
  });

  it('keeps a suspended profile offline and blocks reservation exposure', () => {
    const flow = resolveDriverActiveFlow({
      history: {
        role: 'DRIVER',
        stats: {
          activeTrips: 0,
          completedTrips: 6,
          cancelledTrips: 1,
          totalAmount: 68500,
          currency: 'XOF',
        },
        pendingRequests: [],
        recentTrips: [],
      },
      offers: driverOffers.map((offer) => ({
        ...offer,
        reservationExpiresAt: '2099-01-01T00:00:00.000Z',
      })),
      reservationNow: Date.parse('2026-04-19T10:00:00.000Z'),
      driverProfileStatus: 'SUSPENDED',
    });

    expect(flow.operationalStatus).toBe('SUSPENDED');
    expect(flow.availabilityStatus).toBe('OFFLINE');
    expect(flow.heroTitle).toBe('Suspendu');
    expect(flow.visibleOfferCount).toBe(0);
    expect(
      buildDriverHomeStatusLabel({
        flow,
        fullName: 'Issa Driver',
      }),
    ).toBe('Compte suspendu. Contactez les operations pour reprendre le direct.');
  });

  it('builds consistent transition and reservation delta messages', () => {
    expect(
      buildDriverFlowTransitionLabel(null, 'TRIP:MATCHED', 'home'),
    ).toBe('Mission active ouverte: Matched.');

    expect(
      buildDriverFlowTransitionLabel(
        'TRIP:MATCHED',
        'TRIP:DRIVER_ARRIVING',
        'offers',
      ),
    ).toBe('Statut critique mis a jour: Driver Arriving.');

    expect(
      resolveDriverReservationChangeSet(['offer-1', 'offer-2'], ['offer-2', 'offer-3']),
    ).toEqual({
      freshOfferIds: ['offer-3'],
      expiredOfferIds: ['offer-1'],
    });
  });

  it('keeps earnings and profile copy aligned with the shared driver flow', () => {
    const onlineFlow = resolveDriverActiveFlow({
      history: {
        role: 'DRIVER',
        stats: {
          activeTrips: 0,
          completedTrips: 2,
          cancelledTrips: 0,
          totalAmount: 12000,
          currency: 'XOF',
        },
        pendingRequests: [],
        recentTrips: [],
      },
      offers: [],
      reservationNow: Date.parse('2026-04-19T10:00:00.000Z'),
      driverProfileStatus: 'ONLINE',
    });

    const offlineFlow = resolveDriverActiveFlow({
      history: {
        role: 'DRIVER',
        stats: {
          activeTrips: 0,
          completedTrips: 2,
          cancelledTrips: 0,
          totalAmount: 12000,
          currency: 'XOF',
        },
        pendingRequests: [],
        recentTrips: [],
      },
      offers: [],
      reservationNow: Date.parse('2026-04-19T10:00:00.000Z'),
      driverProfileStatus: 'OFFLINE',
    });

    expect(buildDriverEarningsStatusLabel({ flow: onlineFlow })).toBe(
      'Revenus charges depuis le flux protege. Chauffeur en ligne pour le dispatch.',
    );
    expect(buildDriverEarningsStatusLabel({ flow: offlineFlow })).toBe(
      'Revenus charges depuis le flux protege. Chauffeur hors ligne, historique toujours disponible.',
    );
    expect(buildDriverProfileStatusLabel({ flow: onlineFlow })).toBe(
      'Profil charge depuis la session reelle. Chauffeur en ligne.',
    );
    expect(buildDriverProfileStatusLabel({ flow: offlineFlow })).toBe(
      'Profil charge depuis la session reelle. Chauffeur hors ligne.',
    );
  });
});
