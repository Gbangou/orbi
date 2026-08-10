import {
  inventoryRiderNavigators,
  resolveRiderBackendNavigationState,
  resolveRiderNavigationDecision,
  resolveRiderNotificationTarget,
} from '../lib/rider-navigation';

function buildHistory(input: {
  pendingRequests?: Array<Record<string, unknown>>;
  recentTrips?: Array<Record<string, unknown>>;
}) {
  return {
    role: 'RIDER',
    stats: {
      activeTrips: input.recentTrips?.length ?? 0,
      completedTrips: 0,
      cancelledTrips: 0,
      totalAmount: 0,
      currency: 'XOF',
    },
    pendingRequests: input.pendingRequests ?? [],
    recentTrips: input.recentTrips ?? [],
  };
}

describe('rider navigation guard', () => {
  it('inventories the rider navigators explicitly', () => {
    expect(inventoryRiderNavigators()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'root-stack' }),
        expect.objectContaining({ name: 'tabs' }),
        expect.objectContaining({ name: 'modal-stack-screens' }),
      ]),
    );
  });

  it('sends an unauthenticated rider to auth from protected routes', () => {
    expect(
      resolveRiderNavigationDecision({
        pathname: '/home',
        hasSession: false,
        backendState: { status: 'unknown' },
      }),
    ).toMatchObject({
      action: 'replace',
      targetPath: '/auth',
      reason: 'session-required',
    });
  });

  it('sends an authenticated rider without an active trip to home', () => {
    expect(
      resolveRiderNavigationDecision({
        pathname: '/auth',
        hasSession: true,
        backendState: { status: 'no-active-flow' },
      }),
    ).toMatchObject({
      action: 'replace',
      targetPath: '/home',
      reason: 'session-restored',
    });
  });

  it('restores an active trip after restart and blocks incompatible booking access', () => {
    const backendState = resolveRiderBackendNavigationState(
      buildHistory({
        recentTrips: [
          {
            id: 'trip-active-1',
            status: 'IN_PROGRESS',
            pickupAddress: 'Patte d Oie',
            destinationAddress: 'Ouaga 2000',
            amount: 2500,
            currency: 'XOF',
            createdAt: '2026-08-10T08:00:00.000Z',
          },
        ],
      }) as never,
    );

    expect(backendState).toMatchObject({
      status: 'active-flow',
      flowKind: 'trip',
      flowId: 'trip-active-1',
    });
    expect(
      resolveRiderNavigationDecision({
        pathname: '/book',
        hasSession: true,
        backendState,
      }),
    ).toMatchObject({
      action: 'replace',
      targetPath: '/activity',
      reason: 'incompatible-active-flow-route',
    });
  });

  it('opens the receipt when the backend says the active trip is already completed', () => {
    const backendState = resolveRiderBackendNavigationState(
      buildHistory({
        recentTrips: [
          {
            id: 'trip-completed-1',
            status: 'COMPLETED',
            pickupAddress: 'Patte d Oie',
            destinationAddress: 'Ouaga 2000',
            amount: 2500,
            currency: 'XOF',
            createdAt: '2026-08-10T08:00:00.000Z',
            completedAt: '2026-08-10T08:30:00.000Z',
          },
        ],
      }) as never,
    );

    expect(
      resolveRiderNavigationDecision({
        pathname: '/activity',
        hasSession: true,
        backendState,
      }),
    ).toMatchObject({
      action: 'replace',
      targetPath: '/receipt?tripId=trip-completed-1',
      reason: 'completed-trip-receipt',
    });
  });

  it('treats an expired session as unauthenticated navigation', () => {
    expect(
      resolveRiderNavigationDecision({
        pathname: '/activity',
        hasSession: false,
        backendState: { status: 'unavailable' },
      }),
    ).toMatchObject({
      action: 'replace',
      targetPath: '/auth',
      reason: 'session-required',
    });
  });

  it('routes invalid deep links to a safe authenticated landing', () => {
    expect(
      resolveRiderNavigationDecision({
        pathname: '/debug/socket-health?token=secret',
        hasSession: true,
        backendState: { status: 'no-active-flow' },
      }),
    ).toMatchObject({
      action: 'replace',
      targetPath: '/home',
      reason: 'invalid-deep-link',
    });
  });

  it('uses backend state over stale local route assumptions', () => {
    const backendState = resolveRiderBackendNavigationState(
      buildHistory({
        pendingRequests: [
          {
            id: 'request-active-1',
            status: 'REQUESTED',
            pickupAddress: 'Gounghin',
            destinationAddress: 'Koulouba',
            estimatedFare: 1400,
            createdAt: '2026-08-10T08:00:00.000Z',
          },
        ],
      }) as never,
    );

    expect(
      resolveRiderNavigationDecision({
        pathname: '/receipt',
        hasSession: true,
        backendState,
        params: { tripId: 'old-local-trip' },
      }),
    ).toMatchObject({
      action: 'replace',
      targetPath: '/activity',
      reason: 'incompatible-active-flow-route',
    });
  });

  it('sanitizes notification deep links and never passes unsafe trip ids', () => {
    expect(
      resolveRiderNotificationTarget({
        type: 'trip_completed',
        tripId: 'trip-1',
        hasSession: true,
      }),
    ).toBe('/receipt?tripId=trip-1');

    expect(
      resolveRiderNotificationTarget({
        type: 'trip_completed',
        tripId: '../secret-token',
        hasSession: true,
      }),
    ).toBe('/home');
  });
});
