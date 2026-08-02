import { driverOffers } from '@orbi/api';
import {
  buildDriverEarningsStatusLabel,
  buildDriverFlowTransitionLabel,
  buildDriverHomeStatusLabel,
  buildDriverLiveRouteProgress,
  buildDriverMissionSnapshot,
  buildDriverNextActionHint,
  buildDriverProfileStatusLabel,
  buildDriverRiderTrustSnapshot,
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
    expect(flow.primaryStatusLabel).toBe('Chauffeur en route');
    expect(flow.primaryRouteLabel).toBe('Universite Joseph Ki-Zerbo vers Ouaga 2000');
    expect(flow.visibleOfferCount).toBe(0);
    expect(flow.availabilityLocked).toBe(true);
    expect(buildDriverNextActionHint(flow)).toBe(
      'Demarrez seulement quand le passager est avec vous et pret a partir.',
    );
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
    ).toBe('Compte suspendu. Contactez le support pour reprendre le service.');
    expect(buildDriverNextActionHint(flow)).toBe(
      'Aucune action requise: attendez la reactivation du profil.',
    );
  });

  it('blocks offer exposure for online drivers until operations approval', () => {
    const flow = resolveDriverActiveFlow({
      history: {
        role: 'DRIVER',
        stats: {
          activeTrips: 0,
          completedTrips: 0,
          cancelledTrips: 0,
          totalAmount: 0,
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
      driverProfileStatus: 'ONLINE',
      driverVerificationStatus: 'PENDING',
    });

    expect(flow.accountCanReceiveOffers).toBe(false);
    expect(flow.heroTitle).toBe('En validation');
    expect(flow.visibleOfferCount).toBe(0);
    expect(buildDriverHomeStatusLabel({ flow, fullName: 'Issa Driver' })).toBe(
      'Compte en attente de validation. Les offres seront disponibles apres approbation.',
    );
    expect(buildDriverNextActionHint(flow)).toBe(
      'Finalisez votre profil pour debloquer les offres.',
    );
  });

  it('builds consistent transition and reservation delta messages', () => {
    expect(
      buildDriverFlowTransitionLabel(null, 'TRIP:MATCHED', 'home'),
    ).toBe('Mission active ouverte: Chauffeur assigné.');

    expect(
      buildDriverFlowTransitionLabel(
        'TRIP:MATCHED',
        'TRIP:DRIVER_ARRIVING',
        'offers',
      ),
    ).toBe('Statut mis a jour: Chauffeur en route.');

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
      'Revenus a jour. Vous etes en ligne pour recevoir des courses.',
    );
    expect(buildDriverEarningsStatusLabel({ flow: offlineFlow })).toBe(
      'Revenus a jour. Passez en ligne pour recevoir des courses.',
    );
    expect(buildDriverProfileStatusLabel({ flow: onlineFlow })).toBe(
      'Profil charge. Chauffeur en ligne.',
    );
    expect(buildDriverProfileStatusLabel({ flow: offlineFlow })).toBe(
      'Profil charge. Chauffeur hors ligne.',
    );
  });

  it('guides online drivers based on current reservation exposure', () => {
    const flow = resolveDriverActiveFlow({
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
      offers: driverOffers.slice(0, 1).map((offer) => ({
        ...offer,
        reservationExpiresAt: '2099-01-01T00:00:00.000Z',
      })),
      reservationNow: Date.parse('2026-04-19T10:00:00.000Z'),
      driverProfileStatus: 'ONLINE',
    });

    expect(buildDriverNextActionHint(flow)).toBe(
      'Traitez les offres reservees avant expiration.',
    );
  });

  it('builds a compact driver mission snapshot from trip detail', () => {
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
      offers: [],
      reservationNow: Date.parse('2026-04-19T10:00:00.000Z'),
      driverProfileStatus: 'BUSY',
    });

    const snapshot = buildDriverMissionSnapshot({
      flow,
      tripDetail: {
        trip: {
            id: 'trip-driver-1',
            rideRequestId: 'request-1',
            status: 'DRIVER_ARRIVING',
            pickupAddress: 'Universite Joseph Ki-Zerbo',
            destinationAddress: 'Ouaga 2000',
            riderName: 'Awa Ouedraogo',
            driverName: 'Issa Driver',
            vehicleLabel: 'Yamaha Crypton',
            driverVerification: {
              verificationStatus: 'APPROVED',
              phoneVerified: true,
              averageRating: 4.8,
              completedTripsCount: 126,
              vehicle: {
                plateNumber: '11 AA 1234',
                color: 'rouge',
                make: 'Yamaha',
                model: 'Crypton',
              },
            },
            routeMonitoring: {
              state: 'warning',
              alertCount: 1,
              lastAlertType: 'LONG_STOP',
              lastAlertAt: '2026-04-19T08:03:00.000Z',
              lastPositionAt: '2026-04-19T08:02:30.000Z',
              latestPosition: {
                latitude: 12.37,
                longitude: -1.52,
                accuracyMeters: 12,
                speedKph: 18,
                distanceToPickupKm: 0.4,
                distanceToDestinationKm: 5.1,
                observedAt: '2026-04-19T08:02:30.000Z',
                sourceRole: 'DRIVER',
              },
            },
            pickupCode: '1234',
            actualFare: '3500',
            currency: 'XOF',
            startedAt: null,
            completedAt: null,
            createdAt: '2026-04-19T08:00:00.000Z',
            timeline: [],
          },
        },
      });

    expect(snapshot).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: 'Passager',
          value: 'Awa Ouedraogo',
          helper: 'Confirmez oralement le nom et le point de depart',
        }),
        expect.objectContaining({
          label: 'Pickup',
          value: '0.4 km',
        }),
        expect.objectContaining({
          label: 'Vehicule',
          value: 'Yamaha Crypton',
        }),
        expect.objectContaining({
          label: 'Gain chauffeur',
          value: expect.stringContaining('3 500'),
          helper: expect.stringContaining('Prix client'),
        }),
      ]),
    );
    expect(JSON.stringify(snapshot)).not.toContain('1234');
  });

  it('builds driver live route and rider trust signals from trip detail', () => {
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
            status: 'IN_PROGRESS',
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
      offers: [],
      reservationNow: Date.parse('2026-04-19T10:00:00.000Z'),
      driverProfileStatus: 'BUSY',
    });
    const tripDetail = {
      trip: {
        id: 'trip-driver-1',
        rideRequestId: 'request-1',
        status: 'IN_PROGRESS',
        pickupAddress: 'Universite Joseph Ki-Zerbo',
        destinationAddress: 'Ouaga 2000',
        riderName: 'Awa Ouedraogo',
        driverName: 'Issa Driver',
        vehicleLabel: 'Yamaha Crypton',
        driverVerification: {
          verificationStatus: 'APPROVED',
          phoneVerified: true,
          averageRating: 4.8,
          completedTripsCount: 126,
          profilePhotoUrl: null,
          vehicle: {
            plateNumber: '11 AA 1234',
            color: 'rouge',
            make: 'Yamaha',
            model: 'Crypton',
          },
        },
        routeMonitoring: {
          state: 'clear' as const,
          alertCount: 0,
          lastAlertType: null,
          lastAlertAt: null,
          lastPositionAt: '2026-04-19T08:02:30.000Z',
          latestPosition: {
            latitude: '12,37',
            longitude: '-1,52',
            accuracyMeters: '12',
            speedKph: '18',
            distanceToPickupKm: '0,4',
            distanceToDestinationKm: '5,1',
            observedAt: '2026-04-19T08:02:30.000Z',
            sourceRole: 'DRIVER',
          },
        },
        pickupCode: '1234',
        actualFare: 3500,
        driverPayout: 3150,
        platformFee: 350,
        commissionRate: 0.1,
        currency: 'XOF',
        startedAt: '2026-04-19T08:05:00.000Z',
        completedAt: null,
        createdAt: '2026-04-19T08:00:00.000Z',
        timeline: [],
      },
    };

    expect(buildDriverLiveRouteProgress({ flow, tripDetail })).toEqual(
      expect.objectContaining({
        title: 'Vers destination',
        distanceLabel: '5.1 km restant',
        progressPercent: 18,
      }),
    );
    expect(buildDriverRiderTrustSnapshot({ tripDetail })).toEqual(
      expect.objectContaining({
        riderName: 'Awa Ouedraogo',
        initials: 'AO',
        fareLabel: expect.stringContaining('500'),
        driverPayoutLabel: expect.stringContaining('150'),
      }),
    );
  });

  it('does not duplicate the in-progress wording on earnings status', () => {
    const flow = resolveDriverActiveFlow({
      history: {
        role: 'DRIVER',
        stats: {
          activeTrips: 1,
          completedTrips: 1,
          cancelledTrips: 0,
          totalAmount: 3150,
          currency: 'XOF',
        },
        pendingRequests: [],
        recentTrips: [
          {
            id: 'trip-active',
            pickupAddress: 'Kalgondin',
            destinationAddress: 'Pissy',
            status: 'IN_PROGRESS',
            amount: 3150,
            currency: 'XOF',
            counterpartyName: 'Awa Ouedraogo',
            vehicleLabel: 'Kia Picanto',
            receipt: null,
            completedAt: null,
            createdAt: '2026-04-19T08:00:00.000Z',
          },
        ],
      },
      offers: [],
      reservationNow: Date.parse('2026-04-19T10:00:00.000Z'),
      driverProfileStatus: 'BUSY',
    });

    expect(buildDriverEarningsStatusLabel({ flow })).toBe(
      'Revenus synchronises. Course active: En cours.',
    );
  });
});
