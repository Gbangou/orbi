import {
  serializeTripDetail,
  serializeTripHistoryItem,
  serializeTripLifecycle,
} from './trips.presenter';

function createBaseTrip(overrides: Record<string, unknown> = {}) {
  return {
    id: 'trip-1',
    rideRequestId: 'req-1',
    status: 'COMPLETED',
    pickupAddress: 'Universite Joseph Ki-Zerbo',
    destinationAddress: 'Ouaga 2000',
    actualFare: 1800,
    currency: 'XOF',
    startedAt: new Date('2026-05-01T09:00:00.000Z'),
    completedAt: new Date('2026-05-01T09:18:00.000Z'),
    createdAt: new Date('2026-05-01T08:55:00.000Z'),
    rider: {
      user: {
        fullName: 'Awa Rider',
        phoneNumber: '+22670000001',
        isPhoneVerified: true,
      },
    },
    driver: {
      verificationStatus: 'APPROVED',
      averageRating: 4.8,
      completedTripsCount: 120,
      profilePhotoUrl: null,
      user: {
        fullName: 'Issa Driver',
        isPhoneVerified: true,
        phoneNumber: '+22671000002',
      },
    },
    vehicle: {
      plateNumber: '12BF345',
      make: 'Yamaha',
      model: 'Crypton',
      color: 'Noir',
      year: 2022,
      seats: 2,
      type: 'MOTORCYCLE',
      tier: 'MOTO_STANDARD',
    },
    rideRequest: null,
    promoCode: null,
    events: [],
    ...overrides,
  };
}

describe('serializeTripDetail — privacy guards', () => {
  it('hides driver phone number when trip is COMPLETED', () => {
    const { trip } = serializeTripDetail(
      createBaseTrip({ status: 'COMPLETED' }) as never,
    );

    expect(trip.driverPhoneNumber).toBeNull();
  });

  it('hides rider phone number when trip is COMPLETED', () => {
    const { trip } = serializeTripDetail(
      createBaseTrip({ status: 'COMPLETED' }) as never,
    );

    expect(trip.riderPhoneNumber).toBeNull();
  });

  it('exposes driver phone number when trip is IN_PROGRESS', () => {
    const { trip } = serializeTripDetail(
      createBaseTrip({ status: 'IN_PROGRESS' }) as never,
    );

    expect(trip.driverPhoneNumber).toBe('+22671000002');
  });

  it('hides driver phone number on active trips when phone is not verified', () => {
    const { trip } = serializeTripDetail(
      createBaseTrip({
        status: 'IN_PROGRESS',
        driver: {
          verificationStatus: 'APPROVED',
          averageRating: 4.8,
          completedTripsCount: 120,
          profilePhotoUrl: null,
          user: {
            fullName: 'Issa Driver',
            isPhoneVerified: false,
            phoneNumber: '+22671000002',
          },
        },
      }) as never,
    );

    expect(trip.driverPhoneNumber).toBeNull();
  });

  it('exposes rider phone number when trip is DRIVER_ARRIVING', () => {
    const { trip } = serializeTripDetail(
      createBaseTrip({ status: 'DRIVER_ARRIVING' }) as never,
    );

    expect(trip.riderPhoneNumber).toBe('+22670000001');
  });

  it('exposes payment method on trip detail for field handoff', () => {
    const { trip } = serializeTripDetail(
      createBaseTrip({
        rideRequest: {
          paymentMethod: 'CASH',
          pickupLatitude: 12.36,
          pickupLongitude: -1.53,
          destinationLatitude: 12.31,
          destinationLongitude: -1.49,
        },
      }) as never,
    );

    expect(trip.paymentMethod).toBe('CASH');
  });

  it('hides rider phone number on active trips when phone is not verified', () => {
    const { trip } = serializeTripDetail(
      createBaseTrip({
        status: 'DRIVER_ARRIVING',
        rider: {
          user: {
            fullName: 'Awa Rider',
            phoneNumber: '+22670000001',
            isPhoneVerified: false,
          },
        },
      }) as never,
    );

    expect(trip.riderPhoneNumber).toBeNull();
  });

  it('hides pickup code when trip is COMPLETED', () => {
    const { trip } = serializeTripDetail(
      createBaseTrip({
        status: 'COMPLETED',
        events: [
          {
            id: 'e-1',
            eventType: 'PICKUP_CODE_ISSUED',
            payload: { pickupCode: '4821' },
            createdAt: new Date(),
          },
        ],
      }) as never,
    );

    expect(trip.pickupCode).toBeNull();
  });

  it('hides pickup code in the standard simple pickup flow', () => {
    const { trip } = serializeTripDetail(
      createBaseTrip({
        status: 'MATCHED',
        events: [
          {
            id: 'e-1',
            eventType: 'PICKUP_CODE_ISSUED',
            payload: { pickupCode: '4821' },
            createdAt: new Date(),
          },
        ],
      }) as never,
    );

    expect(trip.pickupCode).toBeNull();
  });

  it('hides pickup code from driver detail even before departure', () => {
    const { trip } = serializeTripDetail(
      createBaseTrip({
        status: 'DRIVER_ARRIVING',
        events: [
          {
            id: 'e-1',
            eventType: 'PICKUP_CODE_ISSUED',
            payload: { pickupCode: '4821' },
            createdAt: new Date(),
          },
        ],
      }) as never,
      { viewerRole: 'DRIVER' },
    );

    expect(trip.pickupCode).toBeNull();
  });
});

describe('serializeTripDetail — route monitoring', () => {
  it('returns unknown state when no events are present', () => {
    const { trip } = serializeTripDetail(createBaseTrip() as never);

    expect(trip.routeMonitoring.state).toBe('unknown');
    expect(trip.routeMonitoring.latestPosition).toBeNull();
  });

  it('returns clear state when a route position exists but no alerts', () => {
    const { trip } = serializeTripDetail(
      createBaseTrip({
        events: [
          {
            id: 'e-1',
            eventType: 'ROUTE_POSITION_RECORDED',
            payload: {
              latitude: 12.365,
              longitude: -1.534,
              sourceRole: 'DRIVER',
            },
            createdAt: new Date(),
          },
        ],
      }) as never,
    );

    expect(trip.routeMonitoring.state).toBe('clear');
    expect(trip.routeMonitoring.latestPosition).not.toBeNull();
  });

  it('returns critical state when a ROUTE_MONITORING_ALERT with critical severity exists', () => {
    const { trip } = serializeTripDetail(
      createBaseTrip({
        events: [
          {
            id: 'e-1',
            eventType: 'ROUTE_MONITORING_ALERT',
            payload: { alertType: 'ROUTE_DEVIATION', severity: 'critical' },
            createdAt: new Date(),
          },
        ],
      }) as never,
    );

    expect(trip.routeMonitoring.state).toBe('critical');
  });
});

describe('serializeTripDetail — serialization', () => {
  it('converts dates to ISO strings', () => {
    const { trip } = serializeTripDetail(createBaseTrip() as never);

    expect(trip.startedAt).toBe('2026-05-01T09:00:00.000Z');
    expect(trip.completedAt).toBe('2026-05-01T09:18:00.000Z');
    expect(trip.createdAt).toBe('2026-05-01T08:55:00.000Z');
  });

  it('formats vehicle label as make + model', () => {
    const { trip } = serializeTripDetail(createBaseTrip() as never);

    expect(trip.vehicleLabel).toBe('Yamaha Crypton');
  });

  it('includes a timeline entry for each event', () => {
    const { trip } = serializeTripDetail(
      createBaseTrip({
        events: [
          {
            id: 'e-1',
            eventType: 'TRIP_STARTED',
            createdAt: new Date('2026-05-01T09:00:00.000Z'),
          },
        ],
      }) as never,
    );

    expect(trip.timeline).toHaveLength(1);
    expect(trip.timeline[0]?.eventType).toBe('TRIP_STARTED');
    expect(trip.timeline[0]?.createdAt).toBe('2026-05-01T09:00:00.000Z');
  });
});

describe('serializeTripLifecycle', () => {
  it('serializes the core lifecycle fields', () => {
    const { trip } = serializeTripLifecycle({
      id: 'trip-1',
      rideRequestId: 'req-1',
      status: 'COMPLETED',
      actualFare: 1800,
      driverPayout: 1620,
      platformFee: 180,
      commissionRate: 0.1,
      currency: 'XOF',
      pickupAddress: 'Universite Ki-Zerbo',
      destinationAddress: 'Ouaga 2000',
      rider: { user: { fullName: 'Awa Rider' } },
      vehicle: { make: 'Yamaha', model: 'Crypton' },
      rideRequest: { paymentMethod: 'CASH' },
      pickupCode: null,
      createdAt: new Date('2026-05-01T08:55:00.000Z'),
      startedAt: null,
      completedAt: null,
    });

    expect(trip.id).toBe('trip-1');
    expect(trip.actualFare).toBe(1800);
    expect(trip.driverPayout).toBe(1620);
    expect(trip.platformFee).toBe(180);
    expect(trip.commissionRate).toBe(0.1);
    expect(trip.paymentMethod).toBe('CASH');
    expect(trip.vehicleLabel).toBe('Yamaha Crypton');
    expect(trip.createdAt).toBe('2026-05-01T08:55:00.000Z');
    expect(trip.startedAt).toBeNull();
  });
});

describe('serializeTripHistoryItem', () => {
  it('hides pickup code when trip is COMPLETED', () => {
    const result = serializeTripHistoryItem({
      id: 'trip-1',
      pickupAddress: 'Ouaga 2000',
      destinationAddress: 'Koulouba',
      status: 'COMPLETED',
      actualFare: 1800,
      currency: 'XOF',
      completedAt: new Date(),
      createdAt: new Date(),
      events: [
        {
          eventType: 'PICKUP_CODE_ISSUED',
          payload: { pickupCode: '4821' },
        },
      ],
      vehicle: { make: 'Yamaha', model: 'Crypton' },
    });

    expect(result.pickupCode).toBeNull();
  });

  it('hides active pickup code from driver trip history', () => {
    const result = serializeTripHistoryItem(
      {
        id: 'trip-1',
        pickupAddress: 'Ouaga 2000',
        destinationAddress: 'Koulouba',
        status: 'DRIVER_ARRIVING',
        actualFare: 1800,
        currency: 'XOF',
        completedAt: null,
        createdAt: new Date(),
        events: [
          {
            eventType: 'PICKUP_CODE_ISSUED',
            payload: { pickupCode: '4821' },
          },
        ],
        vehicle: { make: 'Yamaha', model: 'Crypton' },
      },
      { viewerRole: 'DRIVER' },
    );

    expect(result.pickupCode).toBeNull();
  });

  it('converts actualFare to a number', () => {
    const result = serializeTripHistoryItem({
      id: 'trip-1',
      pickupAddress: 'A',
      destinationAddress: 'B',
      status: 'COMPLETED',
      actualFare: '2200',
      currency: 'XOF',
      completedAt: null,
      createdAt: new Date(),
      events: [],
      vehicle: { make: 'Bajaj', model: 'Boxer' },
      rideRequest: { paymentMethod: 'WALLET' },
    });

    expect(result.amount).toBe(2200);
    expect(result.paymentMethod).toBe('WALLET');
  });

  it('builds a cash receipt from the cash confirmation event when no payment attempt exists', () => {
    const result = serializeTripHistoryItem({
      id: 'trip-cash-1',
      pickupAddress: 'Rue de Pissy',
      destinationAddress: 'Koulouba',
      status: 'COMPLETED',
      actualFare: 1500,
      currency: 'XOF',
      completedAt: new Date('2026-07-21T11:00:00.000Z'),
      createdAt: new Date('2026-07-21T10:30:00.000Z'),
      events: [
        {
          eventType: 'CASH_PAYMENT_CONFIRMED',
          payload: {
            amount: 1500,
            currency: 'XOF',
            confirmedAt: '2026-07-21T11:00:00.000Z',
          },
          createdAt: new Date('2026-07-21T11:00:00.000Z'),
        },
      ],
      vehicle: { make: 'Yamaha', model: 'Crypton' },
    });

    expect(result.receipt).toEqual({
      paymentAttemptId: 'cash:1784631600000',
      status: 'SUCCEEDED',
      provider: 'CASH',
      channel: 'CASH',
      amount: 1500,
      currency: 'XOF',
      transactionRef: null,
      updatedAt: '2026-07-21T11:00:00.000Z',
    });
  });
});
