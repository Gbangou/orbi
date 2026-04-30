import {
  buildRiderPeripheralStatusLabel,
  buildRiderFlowTransitionLabel,
  buildRiderHomeStatusLabel,
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
});
