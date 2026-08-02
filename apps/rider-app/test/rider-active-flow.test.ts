import {
  buildRiderPeripheralStatusLabel,
  buildRiderFlowTransitionLabel,
  buildRiderDriverTrustSnapshot,
  buildRiderHomeStatusLabel,
  buildRiderLiveRouteProgress,
  buildRiderMissionSnapshot,
  buildRiderNextActionHint,
  buildRiderRouteSignalHealth,
  resolveRiderActiveFlow,
} from '../lib/rider-active-flow';

describe('rider-active-flow', () => {
  it('prefers the active trip over a pending request when resolving the primary flow', () => {
    const flow = resolveRiderActiveFlow({
      role: 'RIDER',
      stats: {
        activeTrips: 1,
        completedTrips: 4,
        cancelledTrips: 0,
        totalAmount: 18500,
        currency: 'XOF',
      },
      pendingRequests: [
        {
          id: 'request-1',
          pickupAddress: 'Patte d Oie',
          destinationAddress: 'Ouaga 2000',
          estimatedFare: 2200,
          status: 'REQUESTED',
          createdAt: '2026-04-19T09:00:00.000Z',
        },
      ],
      recentTrips: [
        {
          id: 'trip-1',
          pickupAddress: 'Universite Joseph Ki-Zerbo',
          destinationAddress: 'Ouaga 2000',
          status: 'DRIVER_ARRIVING',
          amount: 2500,
          currency: 'XOF',
          counterpartyName: 'Issa Driver',
          vehicleLabel: 'Yamaha Crypton',
          pickupCode: '1234',
          completedAt: null,
          createdAt: '2026-04-19T08:00:00.000Z',
        },
      ],
    });

    expect(flow.hasOpenFlow).toBe(true);
    expect(flow.primaryStatusLabel).toBe('Chauffeur en route');
    expect(flow.primaryRouteLabel).toBe(
      'Universite Joseph Ki-Zerbo vers Ouaga 2000',
    );
    expect(flow.activeFlowState).toBe('TRIP:DRIVER_ARRIVING');
    expect(buildRiderNextActionHint(flow)).toBe(
      'Confirmez le nom du chauffeur et la plaque avant de monter.',
    );
  });

  it('builds the expected home status label from the resolved flow', () => {
    const flow = resolveRiderActiveFlow({
      role: 'RIDER',
      stats: {
        activeTrips: 0,
        completedTrips: 12,
        cancelledTrips: 1,
        totalAmount: 72500,
        currency: 'XOF',
      },
      pendingRequests: [],
      recentTrips: [],
    });

    expect(
      buildRiderHomeStatusLabel({
        flow,
        fullName: 'Awa Ouedraogo',
        optionCount: 2,
      }),
    ).toBe('Connecte comme Awa Ouedraogo. 2 options tarifees disponibles.');
  });

  it('builds consistent transition messages for booking and activity surfaces', () => {
    expect(
      buildRiderFlowTransitionLabel(
        null,
        'REQUEST:REQUESTED',
        'booking',
      ),
    ).toBe('Une reservation active vient d apparaitre.');

    expect(
      buildRiderFlowTransitionLabel(
        'TRIP:MATCHED',
        'TRIP:DRIVER_ARRIVING',
        'activity',
      ),
    ).toBe('Changement critique: Chauffeur en route.');

    expect(
      buildRiderFlowTransitionLabel(
        null,
        'REQUEST:REQUESTED',
        'account',
      ),
    ).toBe('Le compte affiche maintenant une course active: En attente.');

  });

  it('builds peripheral status labels for account surfaces', () => {
    const idleFlow = resolveRiderActiveFlow({
      role: 'RIDER',
      stats: {
        activeTrips: 0,
        completedTrips: 12,
        cancelledTrips: 1,
        totalAmount: 72500,
        currency: 'XOF',
      },
      pendingRequests: [],
      recentTrips: [],
    });

    expect(
      buildRiderPeripheralStatusLabel({
        flow: idleFlow,
        fullName: 'Awa Ouedraogo',
      }),
    ).toBe('Profil charge pour Awa Ouedraogo.');
  });

  it('guides the rider while dispatch is still matching a request', () => {
    const flow = resolveRiderActiveFlow({
      role: 'RIDER',
      stats: {
        activeTrips: 0,
        completedTrips: 1,
        cancelledTrips: 0,
        totalAmount: 2500,
        currency: 'XOF',
      },
      pendingRequests: [
        {
          id: 'request-1',
          pickupAddress: 'Patte d Oie',
          destinationAddress: 'Ouaga 2000',
          estimatedFare: 2200,
          status: 'REQUESTED',
          createdAt: '2026-04-19T09:00:00.000Z',
        },
      ],
      recentTrips: [],
    });

    expect(buildRiderNextActionHint(flow)).toBe(
      'Restez joignable: nous cherchons un chauffeur pour vous.',
    );
  });

  it('builds a compact rider mission snapshot from trip detail', () => {
    const flow = resolveRiderActiveFlow({
      role: 'RIDER',
      stats: {
        activeTrips: 1,
        completedTrips: 4,
        cancelledTrips: 0,
        totalAmount: 18500,
        currency: 'XOF',
      },
      pendingRequests: [],
      recentTrips: [
        {
          id: 'trip-1',
          pickupAddress: 'Universite Joseph Ki-Zerbo',
          destinationAddress: 'Ouaga 2000',
          status: 'DRIVER_ARRIVING',
          amount: 2500,
          currency: 'XOF',
          counterpartyName: 'Issa Driver',
          vehicleLabel: 'Yamaha Crypton',
          pickupCode: '1234',
          completedAt: null,
          createdAt: '2026-04-19T08:00:00.000Z',
        },
      ],
    });

    expect(
      buildRiderMissionSnapshot({
        flow,
        tripDetail: {
          trip: {
            id: 'trip-1',
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
              state: 'critical',
              alertCount: 1,
              lastAlertType: 'ROUTE_DEVIATION',
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
            actualFare: 2500,
            currency: 'XOF',
            startedAt: null,
            completedAt: null,
            createdAt: '2026-04-19T08:00:00.000Z',
            timeline: [],
          },
        },
      }),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: 'Chauffeur',
          value: 'Approuvé',
          helper: 'rouge Yamaha Crypton',
        }),
        expect.objectContaining({
          label: 'Approche',
          value: '0.4 km',
        }),
        expect.objectContaining({
          label: 'Depart',
          value: 'Chauffeur arrive',
          helper: 'Montez seulement dans le vehicule confirme',
        }),
      ]),
    );
  });

  it('builds rider live route and trust signals from trip detail', () => {
    const flow = resolveRiderActiveFlow({
      role: 'RIDER',
      stats: {
        activeTrips: 1,
        completedTrips: 4,
        cancelledTrips: 0,
        totalAmount: 18500,
        currency: 'XOF',
      },
      pendingRequests: [],
      recentTrips: [
        {
          id: 'trip-1',
          pickupAddress: 'Universite Joseph Ki-Zerbo',
          destinationAddress: 'Ouaga 2000',
          status: 'DRIVER_ARRIVING',
          amount: 2500,
          currency: 'XOF',
          counterpartyName: 'Issa Driver',
          vehicleLabel: 'Yamaha Crypton',
          pickupCode: '1234',
          completedAt: null,
          createdAt: '2026-04-19T08:00:00.000Z',
        },
      ],
    });
    const tripDetail = {
      trip: {
        id: 'trip-1',
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
          profilePhotoUrl: null,
          vehicle: {
            plateNumber: '11 AA 1234',
            color: 'rouge',
            make: 'Yamaha',
            model: 'Crypton',
            type: 'MOTORCYCLE',
            tier: 'MOTO_STANDARD',
            year: 2023,
            seats: 2,
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
        actualFare: 2500,
        currency: 'XOF',
        startedAt: null,
        completedAt: null,
        createdAt: '2026-04-19T08:00:00.000Z',
        timeline: [],
      },
    };

    expect(
      buildRiderLiveRouteProgress({
        flow,
        tripDetail,
        now: '2026-04-19T08:02:40.000Z',
      }),
    ).toEqual(
      expect.objectContaining({
        title: 'Chauffeur en approche',
        distanceLabel: '0.4 km restant',
        progressPercent: 78,
        etaLabel: 'Pickup ~1 min',
        freshnessLabel: 'Position maintenant',
      }),
    );
    expect(buildRiderDriverTrustSnapshot({ tripDetail })).toEqual(
      expect.objectContaining({
        driverName: 'Issa Driver',
        initials: 'ID',
        plateLabel: '11 AA 1234',
      }),
    );
  });

  it('downgrades rider route confidence when the driver signal becomes stale', () => {
    expect(
      buildRiderRouteSignalHealth({
        observedAt: '2026-04-19T08:00:00.000Z',
        routeState: 'clear',
        now: '2026-04-19T08:03:20.000Z',
      }),
    ).toEqual({
      freshnessLabel: 'Position ancienne 3 min',
      note: 'Position chauffeur ancienne: nous attendons une nouvelle position.',
      tone: 'amber',
    });

    expect(
      buildRiderRouteSignalHealth({
        observedAt: '2026-04-19T08:03:15.000Z',
        routeState: 'critical',
        now: '2026-04-19T08:03:20.000Z',
      }),
    ).toEqual({
      freshnessLabel: 'Position maintenant',
      note: 'Alerte route critique: restez attentif et gardez le partage actif.',
      tone: 'rose',
    });
  });
});
