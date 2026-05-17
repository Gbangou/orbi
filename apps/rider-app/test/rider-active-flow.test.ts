import {
  buildRiderPeripheralStatusLabel,
  buildRiderFlowTransitionLabel,
  buildRiderHomeStatusLabel,
  buildRiderMissionSnapshot,
  buildRiderNextActionHint,
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
    expect(flow.primaryStatusLabel).toBe('Driver Arriving');
    expect(flow.primaryRouteLabel).toBe(
      'Universite Joseph Ki-Zerbo vers Ouaga 2000',
    );
    expect(flow.activeFlowState).toBe('TRIP:DRIVER_ARRIVING');
    expect(buildRiderNextActionHint(flow)).toBe(
      'Gardez le code pickup pret et ne le donnez qu au bon chauffeur.',
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
    ).toBe('Une reservation active vient d apparaitre dans le flux live.');

    expect(
      buildRiderFlowTransitionLabel(
        'TRIP:MATCHED',
        'TRIP:DRIVER_ARRIVING',
        'activity',
      ),
    ).toBe('Changement critique: Driver Arriving.');

    expect(
      buildRiderFlowTransitionLabel(
        null,
        'REQUEST:REQUESTED',
        'account',
      ),
    ).toBe('Le compte reflete maintenant un flux actif: Requested.');

    expect(
      buildRiderFlowTransitionLabel(
        'REQUEST:REQUESTED',
        'TRIP:MATCHED',
        'voice',
      ),
    ).toBe('Le contexte vocal a change de phase: Matched.');
  });

  it('builds peripheral status labels for account and voice surfaces', () => {
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
        surface: 'account',
        fullName: 'Awa Ouedraogo',
      }),
    ).toBe('Profil charge pour Awa Ouedraogo.');

    expect(
      buildRiderPeripheralStatusLabel({
        flow: idleFlow,
        surface: 'voice',
      }),
    ).toBe('Contexte vocal charge depuis la session reelle.');
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
      'Restez joignable: le dispatch cherche un chauffeur compatible.',
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
          value: 'Approved',
          helper: 'rouge Yamaha Crypton',
        }),
        expect.objectContaining({
          label: 'Approche',
          value: '0.4 km',
        }),
        expect.objectContaining({
          label: 'Code',
          value: '1234',
        }),
      ]),
    );
  });
});
