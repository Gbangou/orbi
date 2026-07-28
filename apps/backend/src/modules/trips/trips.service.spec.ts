import { BadRequestException, NotFoundException } from '@nestjs/common';
import { TripsService } from './trips.service';
import { ACTIVE_TRIP_STATUSES } from './trips.constants';
import { createHash } from 'crypto';
import { parseStrictTripShareExpiry } from './trip-share-expiry';
import { calculateDriverEconomics } from '../../common/economics/driver-commission';

describe('TripsService', () => {
  function buildFreshDriverRouteEvent(overrides: Record<string, unknown> = {}) {
    return {
      eventType: 'ROUTE_POSITION_RECORDED',
      payload: {
        latitude: 12.37,
        longitude: -1.52,
        accuracyMeters: 18,
        speedKph: 24,
        distanceToDestinationKm: 0.2,
        observedAt: new Date().toISOString(),
        sourceRole: 'DRIVER',
        ...overrides,
      },
      createdAt: new Date(),
    };
  }

  function createService() {
    const prisma = {
      $transaction: jest.fn(),
      $queryRaw: jest.fn().mockResolvedValue([
        { enumlabel: 'REQUESTED' },
        { enumlabel: 'MATCHED' },
        { enumlabel: 'DRIVER_ARRIVING' },
        { enumlabel: 'EXPIRED' },
        { enumlabel: 'CANCELLED' },
        { enumlabel: 'FULFILLED' },
      ]),
      driverProfile: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      riderProfile: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
      supportTicket: {
        create: jest.fn().mockResolvedValue({
          id: 'support-ticket-1',
          priority: 2,
        }),
      },
      rideRequest: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      trip: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn(),
      },
      tripEvent: {
        findFirst: jest.fn(),
      },
      auditLog: {
        create: jest.fn(),
      },
      rating: {
        findFirst: jest.fn(),
        create: jest.fn(),
        aggregate: jest.fn(),
      },
      user: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const realtimeService = {
      publish: jest.fn(),
    };
    const documentLinksService = {
      createViewLink: jest.fn().mockReturnValue({
        signedUrl: 'https://storage.orbi.local/view/selfie.jpg?signed=1',
        expiresAt: '2026-04-17T08:18:00.000Z',
      }),
    };

    prisma.$transaction.mockImplementation(
      async (callback: (tx: typeof prisma) => unknown) => callback(prisma),
    );

    const notificationsService = {
      enqueue: jest.fn().mockResolvedValue({ notification: { id: 'notif-1' } }),
    };

    return {
      prisma,
      realtimeService,
      documentLinksService,
      notificationsService,
      service: new TripsService(
        prisma as never,
        realtimeService as never,
        documentLinksService as never,
        notificationsService as never,
      ),
    };
  }

  it('returns rider history including pending requests and recent trips', async () => {
    const { prisma, service } = createService();

    prisma.rideRequest.findMany.mockResolvedValue([
      {
        id: 'request-1',
        pickupAddress: 'Universite Joseph Ki-Zerbo',
        destinationAddress: 'Ouaga 2000',
        estimatedFare: 1600,
        status: 'REQUESTED',
        createdAt: new Date('2026-04-17T08:00:00.000Z'),
      },
    ]);
    prisma.trip.findMany.mockResolvedValue([
      {
        id: 'trip-1',
        pickupAddress: 'Patte d Oie',
        destinationAddress: 'Koulouba',
        actualFare: 2200,
        currency: 'XOF',
        status: 'COMPLETED',
        completedAt: new Date('2026-04-16T10:00:00.000Z'),
        createdAt: new Date('2026-04-16T09:00:00.000Z'),
        driver: {
          user: {
            fullName: 'Issa Driver',
          },
        },
        vehicle: {
          make: 'Yamaha',
          model: 'Crypton',
        },
      },
    ]);
    prisma.trip.count
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(0);

    const result = await service.findMine({
      user: {
        role: 'RIDER',
        riderProfile: {
          id: 'rider-1',
        },
      },
    } as never);

    expect(result.role).toBe('RIDER');
    expect(result.pendingRequests).toHaveLength(1);
    expect(result.recentTrips[0]).toEqual(
      expect.objectContaining({
        counterpartyName: 'Issa Driver',
        amount: 2200,
      }),
    );
    expect(result.stats.completedTrips).toBe(3);
  });

  it('returns driver history with commission-adjusted payouts', async () => {
    const { prisma, service } = createService();

    prisma.trip.findMany.mockResolvedValue([
      {
        id: 'trip-2',
        pickupAddress: 'Zone du Bois',
        destinationAddress: 'Centre Ville',
        actualFare: 3000,
        currency: 'XOF',
        status: 'COMPLETED',
        completedAt: new Date('2026-04-17T11:00:00.000Z'),
        createdAt: new Date('2026-04-17T10:30:00.000Z'),
        rider: {
          user: {
            fullName: 'Awa Rider',
          },
        },
        vehicle: {
          make: 'Toyota',
          model: 'Corolla',
        },
      },
    ]);
    prisma.trip.count
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(8)
      .mockResolvedValueOnce(1);

    const result = await service.findMine({
      user: {
        role: 'DRIVER',
        driverProfile: {
          id: 'driver-1',
        },
      },
    } as never);

    expect(result.role).toBe('DRIVER');
    expect(result.pendingRequests).toHaveLength(0);
    expect(result.recentTrips[0]).toEqual(
      expect.objectContaining({
        counterpartyName: 'Awa Rider',
        amount: calculateDriverEconomics(3000).driverPayout,
      }),
    );
    expect(result.stats.completedTrips).toBe(8);
  });

  it('accepts a compatible ride request and creates a trip for the driver', async () => {
    const { prisma, realtimeService, service } = createService();

    prisma.driverProfile.findUnique.mockResolvedValue({
      id: 'driver-1',
      status: 'ONLINE',
      verificationStatus: 'APPROVED',
      vehicles: [
        {
          id: 'vehicle-1',
          type: 'MOTORCYCLE',
          tier: 'MOTO_STANDARD',
        },
      ],
    });
    prisma.trip.findFirst.mockResolvedValue(null);
    prisma.rideRequest.findUnique.mockResolvedValue({
      id: 'request-1',
      riderId: 'rider-1',
      status: 'REQUESTED',
      assignedDriverId: null,
      assignmentExpiresAt: null,
      requestedVehicleType: 'MOTORCYCLE',
      requestedServiceTier: 'MOTO_STANDARD',
      pickupAddress: 'Universite Joseph Ki-Zerbo',
      destinationAddress: 'Ouaga 2000',
      estimatedFare: 1600,
      estimatedDistanceKm: 5.8,
      estimatedDurationMinutes: 16,
      currency: 'XOF',
    });
    prisma.trip.findUnique.mockResolvedValue(null);
    prisma.rideRequest.updateMany.mockResolvedValue({ count: 1 });
    prisma.trip.create.mockResolvedValue({
      id: 'trip-accept-1',
      rideRequestId: 'request-1',
      riderId: 'rider-1',
      driverId: 'driver-1',
      status: 'MATCHED',
      pickupAddress: 'Universite Joseph Ki-Zerbo',
      destinationAddress: 'Ouaga 2000',
      actualFare: 1600,
      currency: 'XOF',
      createdAt: new Date('2026-04-17T08:00:00.000Z'),
      rider: {
        user: {
          fullName: 'Awa Rider',
        },
      },
      vehicle: {
        make: 'Yamaha',
        model: 'Crypton',
      },
      events: [
        {
          eventType: 'PICKUP_CODE_ISSUED',
          payload: {
            pickupCode: '4821',
          },
        },
      ],
    });
    prisma.auditLog.create.mockResolvedValue(undefined);
    prisma.driverProfile.update.mockResolvedValue(undefined);

    const result = await service.acceptRideRequest(
      {
        user: {
          id: 'user-driver-1',
          driverProfile: {
            id: 'driver-1',
          },
        },
      } as never,
      'request-1',
    );

    expect(prisma.rideRequest.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'request-1',
        status: {
          in: ['REQUESTED', 'MATCHED'],
        },
        OR: [
          {
            assignedDriverId: null,
          },
          {
            assignedDriverId: 'driver-1',
          },
          {
            assignmentExpiresAt: {
              lt: expect.any(Date),
            },
          },
        ],
      },
      data: {
        status: 'MATCHED',
        assignedDriverId: 'driver-1',
        assignmentExpiresAt: null,
      },
    });
    expect(prisma.trip.findFirst).toHaveBeenCalledWith({
      where: {
        driverId: 'driver-1',
        status: {
          in: ACTIVE_TRIP_STATUSES,
        },
      },
      select: {
        id: true,
      },
    });
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'user-driver-1',
        action: 'DISPATCH_RESERVATION_ACCEPTED',
        entityType: 'RIDE_REQUEST',
        entityId: 'request-1',
      }),
    });
    expect(prisma.trip.create).toHaveBeenCalled();
    expect(realtimeService.publish).toHaveBeenCalledWith({
      channel: 'trip',
      type: 'trip.created',
      entityId: 'trip-accept-1',
      riderId: 'rider-1',
      driverId: 'driver-1',
      actorRole: undefined,
      payload: {
        status: 'MATCHED',
        rideRequestId: 'request-1',
      },
    });
    expect(result.trip).toEqual(
      expect.objectContaining({
        id: 'trip-accept-1',
        riderName: 'Awa Rider',
        vehicleLabel: 'Yamaha Crypton',
        pickupCode: null,
      }),
    );
  });

  it('covers the field flow: driver accepts, arrives, starts, completes, and cash receipt is auditable', async () => {
    const { prisma, realtimeService, service } = createService();
    const driverCreatedAt = new Date('2026-04-01T08:00:00.000Z');
    const expectedEconomics = calculateDriverEconomics(6200, {
      driverCreatedAt,
    });
    const driverAuth = {
      user: {
        id: 'user-driver-1',
        role: 'DRIVER',
        driverProfile: {
          id: 'driver-1',
          createdAt: driverCreatedAt,
        },
      },
    } as never;
    const riderId = 'rider-1';
    const tripId = 'trip-field-1';
    const rideRequestId = 'request-field-1';
    const routeEvent = buildFreshDriverRouteEvent({
      distanceToDestinationKm: 0.1,
    });
    const baseTrip = {
      id: tripId,
      rideRequestId,
      riderId,
      driverId: 'driver-1',
      pickupAddress: 'Marche Katr yaar, Ouagadougou',
      destinationAddress: 'Plateau omnisports de Pissy',
      actualFare: 6200,
      distanceKm: 9.3,
      durationMinutes: 11,
      currency: 'XOF',
      createdAt: new Date('2026-07-22T11:56:00.000Z'),
      rider: { userId: 'user-rider-1' },
      driver: { userId: 'user-driver-1' },
      rideRequest: { paymentMethod: 'CASH' },
    };
    const { rider: _rider, driver: _driver, ...tripUpdateBase } = baseTrip;

    prisma.driverProfile.findUnique.mockResolvedValue({
      id: 'driver-1',
      status: 'ONLINE',
      verificationStatus: 'APPROVED',
      vehicles: [
        {
          id: 'vehicle-1',
          type: 'MOTORCYCLE',
          tier: 'MOTO_STANDARD',
          isActive: true,
        },
      ],
    });
    prisma.trip.findFirst.mockResolvedValue(null);
    prisma.rideRequest.findUnique.mockResolvedValue({
      id: rideRequestId,
      riderId,
      status: 'REQUESTED',
      assignedDriverId: 'driver-1',
      assignmentExpiresAt: new Date(Date.now() + 30_000),
      requestedVehicleType: 'MOTORCYCLE',
      requestedServiceTier: 'MOTO_STANDARD',
      pickupAddress: baseTrip.pickupAddress,
      destinationAddress: baseTrip.destinationAddress,
      estimatedFare: 6200,
      estimatedDistanceKm: 9.3,
      estimatedDurationMinutes: 11,
      currency: 'XOF',
    });
    prisma.rideRequest.updateMany.mockResolvedValue({ count: 1 });
    prisma.riderProfile.findUnique.mockResolvedValue(null);
    prisma.trip.create.mockResolvedValue({
      ...baseTrip,
      status: 'MATCHED',
      startedAt: null,
      completedAt: null,
      rider: { user: { fullName: 'Awa Rider' } },
      vehicle: { make: 'Yamaha', model: 'Crypton' },
      events: [{ eventType: 'TRIP_ACCEPTED', payload: { driverId: 'driver-1' } }],
    });
    prisma.trip.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        ...baseTrip,
        status: 'MATCHED',
        startedAt: null,
        completedAt: null,
        events: [],
      })
      .mockResolvedValueOnce({
        ...baseTrip,
        status: 'DRIVER_ARRIVING',
        startedAt: null,
        completedAt: null,
        events: [],
      })
      .mockResolvedValueOnce({
        ...baseTrip,
        status: 'IN_PROGRESS',
        startedAt: new Date('2026-07-22T11:58:00.000Z'),
        completedAt: null,
        events: [routeEvent],
      });
    prisma.trip.update.mockImplementation(
      async ({ data }: { data: Record<string, unknown> }) => {
        if (!('status' in data)) {
          return {
            ...tripUpdateBase,
            status: 'COMPLETED',
            startedAt: new Date('2026-07-22T11:58:00.000Z'),
            completedAt: new Date('2026-07-22T12:09:00.000Z'),
          };
        }

        return {
          ...tripUpdateBase,
          status: data.status,
          startedAt:
            data.status === 'IN_PROGRESS' || data.status === 'COMPLETED'
              ? ((data.startedAt as Date | undefined) ??
                new Date('2026-07-22T11:58:00.000Z'))
              : null,
          completedAt:
            data.status === 'COMPLETED'
              ? ((data.completedAt as Date | undefined) ??
                new Date('2026-07-22T12:09:00.000Z'))
              : null,
        };
      },
    );
    prisma.rideRequest.update.mockResolvedValue(undefined);
    prisma.driverProfile.update.mockResolvedValue(undefined);
    prisma.auditLog.create.mockResolvedValue(undefined);

    const accepted = await service.acceptRideRequest(driverAuth, rideRequestId);
    const arriving = await service.updateStatus(
      driverAuth,
      tripId,
      'DRIVER_ARRIVING',
    );
    const started = await service.updateStatus(driverAuth, tripId, 'IN_PROGRESS');
    const completed = await service.updateStatus(driverAuth, tripId, 'COMPLETED');

    expect(accepted.trip.status).toBe('MATCHED');
    expect(arriving.trip.status).toBe('DRIVER_ARRIVING');
    expect(started.trip.status).toBe('IN_PROGRESS');
    expect(completed.trip.status).toBe('COMPLETED');
    expect(completed.trip.actualFare).toBe(6200);
    expect(completed.trip.paymentMethod).toBe('CASH');
    expect(completed.trip.driverPayout).toBe(expectedEconomics.driverPayout);
    expect(completed.trip.platformFee).toBe(expectedEconomics.commissionAmount);
    expect(completed.trip.commissionRate).toBe(expectedEconomics.commissionRate);

    expect(prisma.rideRequest.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: rideRequestId,
          status: { in: ['REQUESTED', 'MATCHED'] },
        }),
        data: expect.objectContaining({
          status: 'MATCHED',
          assignedDriverId: 'driver-1',
        }),
      }),
    );
    expect(prisma.rideRequest.update).toHaveBeenCalledWith({
      where: { id: rideRequestId },
      data: { status: 'DRIVER_ARRIVING' },
    });
    expect(prisma.rideRequest.update).toHaveBeenCalledWith({
      where: { id: rideRequestId },
      data: { status: 'FULFILLED' },
    });
    expect(prisma.driverProfile.update).toHaveBeenCalledWith({
      where: { id: 'driver-1' },
      data: { status: 'BUSY' },
    });
    expect(prisma.driverProfile.update).toHaveBeenCalledWith({
      where: { id: 'driver-1' },
      data: { status: 'ONLINE', completedTripsCount: { increment: 1 } },
    });
    expect(prisma.trip.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'DRIVER_ARRIVING',
          events: {
            create: expect.objectContaining({
              eventType: 'DRIVER_ARRIVING',
            }),
          },
        }),
      }),
    );
    expect(prisma.trip.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'IN_PROGRESS',
          events: {
            create: expect.objectContaining({
              eventType: 'TRIP_STARTED',
            }),
          },
        }),
      }),
    );
    expect(prisma.trip.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'COMPLETED',
          events: {
            create: expect.objectContaining({
              eventType: 'TRIP_COMPLETED',
            }),
          },
        }),
      }),
    );
    expect(prisma.trip.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          events: {
            create: expect.objectContaining({
              eventType: 'CASH_PAYMENT_CONFIRMED',
              payload: expect.objectContaining({
                amount: 6200,
                currency: 'XOF',
                collectedByDriverId: 'driver-1',
                confirmedByRole: 'DRIVER',
              }),
            }),
          },
        }),
      }),
    );
    expect(realtimeService.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'trip.created',
        entityId: tripId,
        riderId,
        driverId: 'driver-1',
        payload: expect.objectContaining({ status: 'MATCHED' }),
      }),
    );
    expect(realtimeService.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'trip.updated',
        entityId: tripId,
        payload: { status: 'DRIVER_ARRIVING' },
      }),
    );
    expect(realtimeService.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'trip.updated',
        entityId: tripId,
        payload: { status: 'IN_PROGRESS' },
      }),
    );
    expect(realtimeService.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'trip.updated',
        entityId: tripId,
        payload: { status: 'COMPLETED' },
      }),
    );
  });

  it('does not fail trip completion when the deployed database lacks the FULFILLED ride-request enum', async () => {
    const { prisma, realtimeService, service } = createService();
    const driverAuth = {
      user: {
        id: 'user-driver-legacy-db',
        role: 'DRIVER',
        driverProfile: {
          id: 'driver-legacy-db',
          createdAt: new Date('2026-04-01T08:00:00.000Z'),
        },
      },
    } as never;

    prisma.$queryRaw.mockResolvedValue([
      { enumlabel: 'REQUESTED' },
      { enumlabel: 'MATCHED' },
      { enumlabel: 'DRIVER_ARRIVING' },
      { enumlabel: 'EXPIRED' },
      { enumlabel: 'CANCELLED' },
    ]);
    prisma.trip.findUnique.mockResolvedValue({
      id: 'trip-legacy-db',
      rideRequestId: 'request-legacy-db',
      riderId: 'rider-legacy-db',
      driverId: 'driver-legacy-db',
      status: 'IN_PROGRESS',
      pickupAddress: 'Marche Katr yaar, Ouagadougou',
      destinationAddress: 'Plateau omnisports de Pissy',
      actualFare: 6140,
      distanceKm: 8.4,
      durationMinutes: 14,
      currency: 'XOF',
      startedAt: new Date('2026-07-28T10:45:00.000Z'),
      completedAt: null,
      createdAt: new Date('2026-07-28T10:30:00.000Z'),
      events: [buildFreshDriverRouteEvent({ distanceToDestinationKm: 0 })],
      rider: { userId: 'user-rider-legacy-db' },
      driver: { userId: 'user-driver-legacy-db' },
      rideRequest: { paymentMethod: 'MOBILE_MONEY' },
    });
    prisma.trip.update.mockResolvedValue({
      id: 'trip-legacy-db',
      rideRequestId: 'request-legacy-db',
      riderId: 'rider-legacy-db',
      driverId: 'driver-legacy-db',
      status: 'COMPLETED',
      actualFare: 6140,
      currency: 'XOF',
      completedAt: new Date('2026-07-28T11:00:00.000Z'),
    });
    prisma.rideRequest.update.mockResolvedValue(undefined);
    prisma.driverProfile.update.mockResolvedValue(undefined);
    prisma.auditLog.create.mockResolvedValue(undefined);

    const result = await service.updateStatus(
      driverAuth,
      'trip-legacy-db',
      'COMPLETED',
    );

    expect(result.trip.status).toBe('COMPLETED');
    expect(prisma.rideRequest.update).toHaveBeenCalledWith({
      where: { id: 'request-legacy-db' },
      data: { status: 'EXPIRED' },
    });
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'RIDE_REQUEST_COMPLETION_STATUS_SCHEMA_FALLBACK',
        entityType: 'RIDE_REQUEST',
        entityId: 'request-legacy-db',
        metadata: expect.objectContaining({
          tripId: 'trip-legacy-db',
          requestedStatus: 'FULFILLED',
          appliedStatus: 'EXPIRED',
        }),
      }),
    });
    expect(realtimeService.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'trip.updated',
        entityId: 'trip-legacy-db',
        payload: { status: 'COMPLETED' },
      }),
    );
  });

  it('does not fail rider early stop when the deployed database lacks the FULFILLED ride-request enum', async () => {
    const { prisma, realtimeService, service } = createService();
    const riderAuth = {
      user: {
        id: 'user-rider-legacy-db',
        role: 'RIDER',
        riderProfile: {
          id: 'rider-legacy-db',
        },
      },
    } as never;

    prisma.$queryRaw.mockResolvedValue([
      { enumlabel: 'REQUESTED' },
      { enumlabel: 'MATCHED' },
      { enumlabel: 'DRIVER_ARRIVING' },
      { enumlabel: 'EXPIRED' },
      { enumlabel: 'CANCELLED' },
    ]);
    prisma.trip.findUnique.mockResolvedValue({
      id: 'trip-rider-stop-legacy-db',
      rideRequestId: 'request-rider-stop-legacy-db',
      riderId: 'rider-legacy-db',
      driverId: 'driver-legacy-db',
      status: 'IN_PROGRESS',
      pickupAddress: 'Marche Katr yaar, Ouagadougou',
      destinationAddress: 'Plateau omnisports de Pissy',
      actualFare: 6140,
      distanceKm: 8.4,
      durationMinutes: 14,
      currency: 'XOF',
      startedAt: new Date('2026-07-28T10:45:00.000Z'),
      completedAt: null,
      createdAt: new Date('2026-07-28T10:30:00.000Z'),
      events: [buildFreshDriverRouteEvent({ distanceToDestinationKm: 0 })],
      rider: { userId: 'user-rider-legacy-db' },
      driver: { userId: 'user-driver-legacy-db' },
      rideRequest: { paymentMethod: 'MOBILE_MONEY' },
    });
    prisma.trip.update.mockResolvedValue({
      id: 'trip-rider-stop-legacy-db',
      rideRequestId: 'request-rider-stop-legacy-db',
      riderId: 'rider-legacy-db',
      driverId: 'driver-legacy-db',
      status: 'COMPLETED',
      actualFare: 6140,
      currency: 'XOF',
      completedAt: new Date('2026-07-28T11:00:00.000Z'),
    });
    prisma.rideRequest.update.mockResolvedValue(undefined);
    prisma.driverProfile.update.mockResolvedValue(undefined);
    prisma.auditLog.create.mockResolvedValue(undefined);

    const result = await service.updateStatus(
      riderAuth,
      'trip-rider-stop-legacy-db',
      'COMPLETED',
      'RIDER_REQUESTED_STOP',
    );

    expect(result.trip.status).toBe('COMPLETED');
    expect(prisma.rideRequest.update).toHaveBeenCalledWith({
      where: { id: 'request-rider-stop-legacy-db' },
      data: { status: 'EXPIRED' },
    });
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'RIDE_REQUEST_COMPLETION_STATUS_SCHEMA_FALLBACK',
        entityType: 'RIDE_REQUEST',
        entityId: 'request-rider-stop-legacy-db',
      }),
    });
    expect(realtimeService.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'trip.updated',
        entityId: 'trip-rider-stop-legacy-db',
        payload: { status: 'COMPLETED' },
      }),
    );
  });

  it('treats repeated driver completion as an idempotent success without double-counting the driver', async () => {
    const { prisma, realtimeService, service } = createService();
    const driverAuth = {
      user: {
        id: 'user-driver-repeat',
        role: 'DRIVER',
        driverProfile: {
          id: 'driver-repeat',
          createdAt: new Date('2026-07-28T10:00:00.000Z'),
        },
      },
    } as never;

    prisma.trip.findUnique.mockResolvedValue({
      id: 'trip-repeat-complete',
      rideRequestId: 'request-repeat-complete',
      riderId: 'rider-repeat',
      driverId: 'driver-repeat',
      status: 'COMPLETED',
      pickupAddress: 'Marche Katr yaar, Ouagadougou',
      destinationAddress: 'Plateau omnisports de Pissy',
      actualFare: 6140,
      distanceKm: 8.4,
      durationMinutes: 14,
      currency: 'XOF',
      startedAt: new Date('2026-07-28T10:45:00.000Z'),
      completedAt: new Date('2026-07-28T11:00:00.000Z'),
      createdAt: new Date('2026-07-28T10:30:00.000Z'),
      events: [buildFreshDriverRouteEvent({ distanceToDestinationKm: 0 })],
      rider: { userId: 'user-rider-repeat' },
      driver: {
        userId: 'user-driver-repeat',
        createdAt: new Date('2026-07-28T10:00:00.000Z'),
      },
      rideRequest: { paymentMethod: 'MOBILE_MONEY' },
    });

    const result = await service.updateStatus(
      driverAuth,
      'trip-repeat-complete',
      'COMPLETED',
    );

    expect(result.trip.status).toBe('COMPLETED');
    expect(result.trip.driverPayout).toBe(5530);
    expect(result.trip.platformFee).toBe(610);
    expect(prisma.trip.update).not.toHaveBeenCalled();
    expect(prisma.rideRequest.update).not.toHaveBeenCalled();
    expect(prisma.driverProfile.update).not.toHaveBeenCalled();
    expect(realtimeService.publish).not.toHaveBeenCalled();
  });

  it('uses the assigned driver creation date for rider early-stop payout economics', async () => {
    const { prisma, service } = createService();
    const riderAuth = {
      user: {
        id: 'user-rider-founder-stop',
        role: 'RIDER',
        riderProfile: {
          id: 'rider-founder-stop',
        },
      },
    } as never;

    prisma.trip.findUnique.mockResolvedValue({
      id: 'trip-founder-stop',
      rideRequestId: 'request-founder-stop',
      riderId: 'rider-founder-stop',
      driverId: 'driver-founder-stop',
      status: 'IN_PROGRESS',
      pickupAddress: 'Marche Katr yaar, Ouagadougou',
      destinationAddress: 'Plateau omnisports de Pissy',
      actualFare: 6140,
      distanceKm: 8.4,
      durationMinutes: 14,
      currency: 'XOF',
      startedAt: new Date('2026-07-28T10:45:00.000Z'),
      completedAt: null,
      createdAt: new Date('2026-07-28T10:30:00.000Z'),
      events: [buildFreshDriverRouteEvent({ distanceToDestinationKm: 0 })],
      rider: { userId: 'user-rider-founder-stop' },
      driver: {
        userId: 'user-driver-founder-stop',
        createdAt: new Date(),
      },
      rideRequest: { paymentMethod: 'MOBILE_MONEY' },
    });
    prisma.trip.update.mockResolvedValue({
      id: 'trip-founder-stop',
      rideRequestId: 'request-founder-stop',
      riderId: 'rider-founder-stop',
      driverId: 'driver-founder-stop',
      status: 'COMPLETED',
      actualFare: 6140,
      currency: 'XOF',
      completedAt: new Date('2026-07-28T11:00:00.000Z'),
    });
    prisma.rideRequest.update.mockResolvedValue(undefined);
    prisma.driverProfile.update.mockResolvedValue(undefined);

    const result = await service.updateStatus(
      riderAuth,
      'trip-founder-stop',
      'COMPLETED',
      'RIDER_REQUESTED_STOP',
    );

    expect(result.trip.status).toBe('COMPLETED');
    expect(result.trip.commissionRate).toBe(0.1);
    expect(result.trip.platformFee).toBe(610);
    expect(result.trip.driverPayout).toBe(5530);
  });

  it('prepares a trusted-contact share link when the rider enables all-trip sharing', async () => {
    const { prisma, realtimeService, service } = createService();

    prisma.driverProfile.findUnique.mockResolvedValue({
      id: 'driver-1',
      status: 'ONLINE',
      verificationStatus: 'APPROVED',
      vehicles: [
        {
          id: 'vehicle-1',
          type: 'MOTORCYCLE',
          tier: 'MOTO_STANDARD',
        },
      ],
    });
    prisma.trip.findFirst.mockResolvedValue(null);
    prisma.rideRequest.findUnique.mockResolvedValue({
      id: 'request-auto-share-1',
      riderId: 'rider-1',
      status: 'REQUESTED',
      assignedDriverId: null,
      assignmentExpiresAt: null,
      requestedVehicleType: 'MOTORCYCLE',
      requestedServiceTier: 'MOTO_STANDARD',
      pickupAddress: 'Universite Joseph Ki-Zerbo',
      destinationAddress: 'Ouaga 2000',
      estimatedFare: 1600,
      estimatedDistanceKm: 5.8,
      estimatedDurationMinutes: 16,
      currency: 'XOF',
    });
    prisma.riderProfile.findUnique.mockResolvedValue({
      emergencyPhone: '+22670000009',
      trustedContactShareMode: 'ALL_TRIPS',
      trustedContacts: [
        {
          phoneNumber: '+22670000001',
        },
      ],
    });
    prisma.trip.findUnique.mockResolvedValue(null);
    prisma.rideRequest.updateMany.mockResolvedValue({ count: 1 });
    prisma.trip.create.mockResolvedValue({
      id: 'trip-auto-share-1',
      rideRequestId: 'request-auto-share-1',
      riderId: 'rider-1',
      driverId: 'driver-1',
      status: 'MATCHED',
      pickupAddress: 'Universite Joseph Ki-Zerbo',
      destinationAddress: 'Ouaga 2000',
      actualFare: 1600,
      currency: 'XOF',
      createdAt: new Date('2026-04-17T08:00:00.000Z'),
      rider: {
        user: {
          id: 'user-rider-1',
          fullName: 'Awa Rider',
        },
      },
      vehicle: {
        make: 'Yamaha',
        model: 'Crypton',
      },
      events: [
        {
          eventType: 'PICKUP_CODE_ISSUED',
          payload: {
            pickupCode: '4821',
          },
        },
        {
          eventType: 'SHARE_LINK_CREATED',
          payload: {
            reason: 'TRUSTED_CONTACT_AUTO_SHARE',
            expiresAt: '2026-04-17T10:00:00.000Z',
            ttlMinutes: 120,
            deliveryState: 'PENDING_PROVIDER',
          },
        },
      ],
    });
    prisma.auditLog.create.mockResolvedValue(undefined);
    prisma.driverProfile.update.mockResolvedValue(undefined);

    await service.acceptRideRequest(
      {
        user: {
          id: 'user-driver-1',
          role: 'DRIVER',
          driverProfile: {
            id: 'driver-1',
            createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 10),
          },
        },
      } as never,
      'request-auto-share-1',
    );

    expect(prisma.trip.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          events: {
            create: expect.arrayContaining([
              expect.objectContaining({
                eventType: 'SHARE_LINK_CREATED',
                payload: expect.objectContaining({
                  reason: 'TRUSTED_CONTACT_AUTO_SHARE',
                  shareMode: 'ALL_TRIPS',
                  deliveryState: 'PENDING_PROVIDER',
                  ttlMinutes: 120,
                  tokenHash: expect.any(String),
                  expiresAt: expect.any(String),
                }),
              }),
            ]),
          },
        }),
      }),
    );
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'TRIP_TRUSTED_CONTACT_SHARE_PREPARED',
        entityType: 'TRIP',
        entityId: 'trip-auto-share-1',
        metadata: expect.objectContaining({
          shareMode: 'ALL_TRIPS',
          deliveryState: 'PENDING_PROVIDER',
        }),
      }),
    });
    expect(realtimeService.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'trip.share-link-created',
        entityId: 'trip-auto-share-1',
        actorRole: 'SYSTEM',
        payload: expect.objectContaining({
          reason: 'TRUSTED_CONTACT_AUTO_SHARE',
          deliveryState: 'PENDING_PROVIDER',
        }),
      }),
    );
  });

  it('blocks trip acceptance when driver fatigue limits require rest', async () => {
    const { prisma, service } = createService();
    const completedAt = new Date();
    const startedAt = new Date(completedAt.getTime() - 45 * 60 * 1000);

    prisma.trip.findMany.mockResolvedValue(
      Array.from({ length: 8 }, (_, index) => ({
        id: `trip-fatigue-${index}`,
        startedAt,
        completedAt,
      })),
    );
    prisma.auditLog.create.mockResolvedValue(undefined);

    await expect(
      service.acceptRideRequest(
        {
          user: {
            id: 'user-driver-1',
            driverProfile: {
              id: 'driver-1',
            },
          },
        } as never,
        'request-1',
      ),
    ).rejects.toThrow('Pause chauffeur requise');
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'DRIVER_FATIGUE_TRIP_ACCEPTANCE_BLOCKED',
        entityType: 'DRIVER_PROFILE',
        entityId: 'driver-1',
      }),
    });
    expect(prisma.driverProfile.findUnique).not.toHaveBeenCalled();
  });

  it('rejects ride acceptance when the driver is not approved', async () => {
    const { prisma, service } = createService();

    prisma.driverProfile.findUnique.mockResolvedValue({
      id: 'driver-1',
      status: 'ONLINE',
      verificationStatus: 'PENDING',
      vehicles: [],
    });

    await expect(
      service.acceptRideRequest(
        {
          user: {
            driverProfile: {
              id: 'driver-1',
            },
          },
        } as never,
        'request-1',
      ),
    ).rejects.toThrow('Only approved drivers can accept ride requests.');
  });

  it('rejects ride acceptance when the request is reserved for another driver', async () => {
    const { prisma, service } = createService();

    prisma.driverProfile.findUnique.mockResolvedValue({
      id: 'driver-1',
      status: 'ONLINE',
      verificationStatus: 'APPROVED',
      vehicles: [
        {
          id: 'vehicle-1',
          type: 'MOTORCYCLE',
          tier: 'MOTO_STANDARD',
        },
      ],
    });
    prisma.trip.findFirst.mockResolvedValue(null);
    prisma.rideRequest.findUnique.mockResolvedValue({
      id: 'request-1',
      riderId: 'rider-1',
      status: 'REQUESTED',
      assignedDriverId: 'driver-2',
      assignmentExpiresAt: new Date(Date.now() + 20_000),
      requestedVehicleType: 'MOTORCYCLE',
      requestedServiceTier: 'MOTO_STANDARD',
      pickupAddress: 'Universite Joseph Ki-Zerbo',
      destinationAddress: 'Ouaga 2000',
      estimatedFare: 1600,
      estimatedDistanceKm: 5.8,
      estimatedDurationMinutes: 16,
      currency: 'XOF',
    });

    await expect(
      service.acceptRideRequest(
        {
          user: {
            driverProfile: {
              id: 'driver-1',
            },
          },
        } as never,
        'request-1',
      ),
    ).rejects.toThrow(
      'This ride request is currently reserved for another driver.',
    );
  });

  it('allows accepting a ride request when another driver reservation has expired', async () => {
    const { prisma, service } = createService();

    prisma.driverProfile.findUnique.mockResolvedValue({
      id: 'driver-1',
      status: 'ONLINE',
      verificationStatus: 'APPROVED',
      vehicles: [
        {
          id: 'vehicle-1',
          type: 'MOTORCYCLE',
          tier: 'MOTO_STANDARD',
        },
      ],
    });
    prisma.trip.findFirst.mockResolvedValue(null);
    prisma.rideRequest.findUnique.mockResolvedValue({
      id: 'request-1',
      riderId: 'rider-1',
      status: 'REQUESTED',
      assignedDriverId: 'driver-2',
      assignmentExpiresAt: new Date(Date.now() - 20_000),
      requestedVehicleType: 'MOTORCYCLE',
      requestedServiceTier: 'MOTO_STANDARD',
      pickupAddress: 'Universite Joseph Ki-Zerbo',
      destinationAddress: 'Ouaga 2000',
      estimatedFare: 1600,
      estimatedDistanceKm: 5.8,
      estimatedDurationMinutes: 16,
      currency: 'XOF',
    });
    prisma.rideRequest.updateMany.mockResolvedValue({ count: 1 });
    prisma.trip.findUnique.mockResolvedValue(null);
    prisma.trip.create.mockResolvedValue({
      id: 'trip-expired-claim-1',
      rideRequestId: 'request-1',
      riderId: 'rider-1',
      driverId: 'driver-1',
      status: 'MATCHED',
      pickupAddress: 'Universite Joseph Ki-Zerbo',
      destinationAddress: 'Ouaga 2000',
      actualFare: 1600,
      currency: 'XOF',
      createdAt: new Date('2026-04-17T08:00:00.000Z'),
      rider: {
        user: {
          fullName: 'Awa Rider',
        },
      },
      vehicle: {
        make: 'Yamaha',
        model: 'Crypton',
      },
      events: [],
    });
    prisma.driverProfile.update.mockResolvedValue(undefined);
    prisma.auditLog.create.mockResolvedValue(undefined);

    await expect(
      service.acceptRideRequest(
        {
          user: {
            id: 'user-driver-1',
            driverProfile: {
              id: 'driver-1',
            },
          },
        } as never,
        'request-1',
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        trip: expect.objectContaining({
          id: 'trip-expired-claim-1',
        }),
      }),
    );
  });

  it('rejects ride acceptance when the database claim is lost under concurrency', async () => {
    const { prisma, service } = createService();

    prisma.driverProfile.findUnique.mockResolvedValue({
      id: 'driver-1',
      status: 'ONLINE',
      verificationStatus: 'APPROVED',
      vehicles: [
        {
          id: 'vehicle-1',
          type: 'MOTORCYCLE',
          tier: 'MOTO_STANDARD',
        },
      ],
    });
    prisma.trip.findFirst.mockResolvedValue(null);
    prisma.rideRequest.findUnique.mockResolvedValue({
      id: 'request-1',
      riderId: 'rider-1',
      status: 'REQUESTED',
      assignedDriverId: null,
      assignmentExpiresAt: null,
      requestedVehicleType: 'MOTORCYCLE',
      requestedServiceTier: 'MOTO_STANDARD',
      pickupAddress: 'Universite Joseph Ki-Zerbo',
      destinationAddress: 'Ouaga 2000',
      estimatedFare: 1600,
      estimatedDistanceKm: 5.8,
      estimatedDurationMinutes: 16,
      currency: 'XOF',
    });
    prisma.rideRequest.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.acceptRideRequest(
        {
          user: {
            driverProfile: {
              id: 'driver-1',
            },
          },
        } as never,
        'request-1',
      ),
    ).rejects.toThrow('This ride request is no longer available.');

    expect(prisma.trip.create).not.toHaveBeenCalled();
    expect(prisma.driverProfile.update).not.toHaveBeenCalled();
  });

  it('rejects ride acceptance when the driver already has an active trip', async () => {
    const { prisma, service } = createService();

    prisma.driverProfile.findUnique.mockResolvedValue({
      id: 'driver-1',
      status: 'ONLINE',
      verificationStatus: 'APPROVED',
      vehicles: [
        {
          id: 'vehicle-1',
          type: 'MOTORCYCLE',
          tier: 'MOTO_STANDARD',
        },
      ],
    });
    prisma.trip.findFirst.mockResolvedValue({
      id: 'trip-active-1',
    });

    await expect(
      service.acceptRideRequest(
        {
          user: {
            driverProfile: {
              id: 'driver-1',
            },
          },
        } as never,
        'request-1',
      ),
    ).rejects.toThrow('The driver already has an active trip in progress.');
  });

  it('rejects ride acceptance when the driver profile cannot be loaded inside the transaction', async () => {
    const { prisma, service } = createService();

    // fatigue check passes (no recent trips), but profile lookup inside TX returns null
    prisma.driverProfile.findUnique.mockResolvedValue(null);

    await expect(
      service.acceptRideRequest(
        {
          user: {
            driverProfile: {
              id: 'driver-1',
            },
          },
        } as never,
        'request-1',
      ),
    ).rejects.toThrow('Driver profile could not be loaded.');

    expect(prisma.trip.create).not.toHaveBeenCalled();
  });

  it('rejects ride acceptance when the driver is offline inside the transaction', async () => {
    const { prisma, service } = createService();

    prisma.driverProfile.findUnique.mockResolvedValue({
      id: 'driver-1',
      status: 'OFFLINE',
      verificationStatus: 'APPROVED',
      vehicles: [],
    });

    await expect(
      service.acceptRideRequest(
        {
          user: {
            driverProfile: {
              id: 'driver-1',
            },
          },
        } as never,
        'request-1',
      ),
    ).rejects.toThrow(
      'The driver must be online before accepting a ride request.',
    );

    expect(prisma.trip.create).not.toHaveBeenCalled();
  });

  it('verifies the pickup code before starting a trip', async () => {
    const { prisma, realtimeService, service } = createService();

    prisma.trip.findUnique.mockResolvedValue({
      id: 'trip-verify-1',
      rideRequestId: 'request-verify-1',
      driverId: 'driver-1',
      status: 'DRIVER_ARRIVING',
      startedAt: null,
      completedAt: null,
      actualFare: 1800,
      currency: 'XOF',
      events: [
        {
          eventType: 'PICKUP_CODE_ISSUED',
          payload: {
            pickupCode: '4821',
          },
        },
      ],
    });
    prisma.trip.update.mockResolvedValue({
      id: 'trip-verify-1',
      rideRequestId: 'request-verify-1',
      status: 'IN_PROGRESS',
      startedAt: new Date('2026-04-17T10:05:00.000Z'),
      completedAt: null,
      actualFare: 1800,
      currency: 'XOF',
      events: [],
    });

    const result = await service.verifyPickupCode(
      {
        user: {
          id: 'user-driver-1',
          driverProfile: {
            id: 'driver-1',
          },
        },
      } as never,
      'trip-verify-1',
      '4821',
    );

    expect(prisma.trip.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'trip-verify-1' },
        data: expect.objectContaining({
          status: 'IN_PROGRESS',
          events: {
            create: {
              eventType: 'PICKUP_CODE_VERIFIED',
              payload: {
                verifiedByRole: undefined,
                verifiedByUserId: 'user-driver-1',
              },
            },
          },
        }),
      }),
    );
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'user-driver-1',
        action: 'TRIP_PICKUP_CODE_VERIFIED',
        entityType: 'TRIP',
        entityId: 'trip-verify-1',
      }),
    });
    expect(realtimeService.publish).toHaveBeenCalledWith({
      channel: 'trip',
      type: 'trip.pickup-code-verified',
      entityId: 'trip-verify-1',
      riderId: undefined,
      driverId: 'driver-1',
      actorRole: undefined,
      payload: {
        status: 'IN_PROGRESS',
      },
    });
    expect(result.trip.status).toBe('IN_PROGRESS');
    expect(result.trip.pickupCode).toBeNull();
  });

  it('allows drivers to start a trip after they have arrived with the passenger', async () => {
    const { prisma, realtimeService, service } = createService();

    prisma.trip.findUnique.mockResolvedValue({
      id: 'trip-direct-start-1',
      rideRequestId: 'request-direct-start-1',
      driverId: 'driver-1',
      riderId: 'rider-1',
      status: 'DRIVER_ARRIVING',
      startedAt: null,
      completedAt: null,
      actualFare: 1800,
      currency: 'XOF',
      events: [],
      rider: {
        userId: 'user-rider-1',
      },
      driver: {
        userId: 'user-driver-1',
      },
      rideRequest: {
        paymentMethod: 'CASH',
      },
    });
    prisma.trip.update.mockResolvedValue({
      id: 'trip-direct-start-1',
      rideRequestId: 'request-direct-start-1',
      riderId: 'rider-1',
      driverId: 'driver-1',
      status: 'IN_PROGRESS',
      startedAt: new Date('2026-04-17T10:05:00.000Z'),
      completedAt: null,
      actualFare: 1800,
      currency: 'XOF',
      events: [],
    });

    const result = await service.updateStatus(
      {
        user: {
          id: 'user-driver-1',
          role: 'DRIVER',
          driverProfile: {
            id: 'driver-1',
          },
        },
      } as never,
      'trip-direct-start-1',
      'IN_PROGRESS',
    );

    expect(prisma.trip.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'trip-direct-start-1' },
        data: expect.objectContaining({
          status: 'IN_PROGRESS',
          startedAt: expect.any(Date),
          events: {
            create: expect.objectContaining({
              eventType: 'TRIP_STARTED',
              payload: expect.objectContaining({
                status: 'IN_PROGRESS',
                actorRole: 'DRIVER',
              }),
            }),
          },
        }),
      }),
    );
    expect(result.trip.status).toBe('IN_PROGRESS');
    expect(realtimeService.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'trip.updated',
        entityId: 'trip-direct-start-1',
        driverId: 'driver-1',
        riderId: 'rider-1',
      }),
    );
  });

  it('creates a support incident for an active trip and records an event', async () => {
    const { prisma, realtimeService, service } = createService();

    prisma.trip.findUnique.mockResolvedValue({
      id: 'trip-incident-1',
      riderId: 'rider-1',
      driverId: 'driver-1',
      status: 'IN_PROGRESS',
    });
    prisma.supportTicket.create.mockResolvedValue({
      id: 'ticket-1',
    });
    prisma.trip.update.mockResolvedValue({
      id: 'trip-incident-1',
    });

    const result = await service.reportIncident(
      {
        user: {
          id: 'user-rider-1',
          role: 'RIDER',
          riderProfile: {
            id: 'rider-1',
          },
        },
      } as never,
      'trip-incident-1',
      {
        incidentType: 'SAFETY_ALERT',
        details: 'Le chauffeur a pris une route inattendue.',
        priority: 3,
      },
    );

    expect(prisma.supportTicket.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'user-rider-1',
        priority: 3,
        subject: 'Incident trajet trip-incident-1',
      }),
    });
    expect(prisma.trip.update).toHaveBeenCalledWith({
      where: { id: 'trip-incident-1' },
      data: {
        events: {
          create: [
            expect.objectContaining({
              eventType: 'INCIDENT_REPORTED',
              payload: expect.objectContaining({
                incidentType: 'SAFETY_ALERT',
                priority: 3,
                reportedByRole: 'RIDER',
              }),
            }),
          ],
        },
      },
    });
    expect(realtimeService.publish).toHaveBeenCalledWith({
      channel: 'trip',
      type: 'trip.incident-reported',
      entityId: 'trip-incident-1',
      riderId: 'rider-1',
      driverId: 'driver-1',
      actorRole: 'RIDER',
      payload: {
        incidentType: 'SAFETY_ALERT',
        priority: 3,
        ticketStatus: 'OPEN',
        hasVoluntaryEvidence: false,
      },
    });
    expect(result.incident.ticketId).toBe('ticket-1');
  });

  it('throttles repeated incident reports from the same actor and type', async () => {
    const { prisma, realtimeService, service } = createService();

    prisma.trip.findUnique.mockResolvedValue({
      id: 'trip-incident-1',
      riderId: 'rider-1',
      driverId: 'driver-1',
      status: 'IN_PROGRESS',
      events: [
        {
          eventType: 'INCIDENT_REPORTED',
          createdAt: new Date(),
          payload: {
            incidentType: 'SAFETY_ALERT',
            reportedByUserId: 'user-rider-1',
          },
        },
      ],
    });

    await expect(
      service.reportIncident(
        {
          user: {
            id: 'user-rider-1',
            role: 'RIDER',
            riderProfile: {
              id: 'rider-1',
            },
          },
        } as never,
        'trip-incident-1',
        {
          incidentType: 'safety_alert',
          details: 'Second report from the same button tap.',
        },
      ),
    ).rejects.toThrow('Incident already reported recently.');

    expect(prisma.trip.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          events: expect.objectContaining({
            where: {
              eventType: 'INCIDENT_REPORTED',
            },
            take: 10,
          }),
        }),
      }),
    );
    expect(prisma.supportTicket.create).not.toHaveBeenCalled();
    expect(prisma.trip.update).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
    expect(realtimeService.publish).not.toHaveBeenCalled();
  });

  it('declares voluntary incident evidence with consent and audit trail', async () => {
    const { prisma, realtimeService, service } = createService();

    prisma.trip.findUnique.mockResolvedValue({
      id: 'trip-evidence-1',
      riderId: 'rider-1',
      driverId: 'driver-1',
      status: 'IN_PROGRESS',
    });
    prisma.supportTicket.create.mockResolvedValue({
      id: 'ticket-evidence-1',
    });
    prisma.trip.update.mockResolvedValue({
      id: 'trip-evidence-1',
    });
    prisma.auditLog.create.mockResolvedValue(undefined);

    const result = await service.reportIncident(
      {
        user: {
          id: 'user-rider-1',
          role: 'RIDER',
          riderProfile: {
            id: 'rider-1',
          },
        },
      } as never,
      'trip-evidence-1',
      {
        incidentType: 'SAFETY_ALERT',
        details: 'Audio conserve localement avec consentement.',
        priority: 3,
        evidenceConsent: true,
        evidenceType: 'AUDIO',
        evidenceRetentionHours: 24,
      },
    );

    expect(prisma.trip.update).toHaveBeenCalledWith({
      where: { id: 'trip-evidence-1' },
      data: {
        events: {
          create: [
            expect.objectContaining({
              eventType: 'INCIDENT_REPORTED',
              payload: expect.objectContaining({
                hasVoluntaryEvidence: true,
              }),
            }),
            expect.objectContaining({
              eventType: 'INCIDENT_EVIDENCE_DECLARED',
              payload: expect.objectContaining({
                evidence: expect.objectContaining({
                  type: 'AUDIO',
                  expiresAt: expect.any(String),
                  retentionHours: 24,
                  uploadRequired: false,
                }),
              }),
            }),
          ],
        },
      },
    });
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'TRIP_INCIDENT_EVIDENCE_DECLARED',
        entityType: 'TRIP',
        entityId: 'trip-evidence-1',
        metadata: expect.objectContaining({
          expiresAt: expect.any(String),
          retentionHours: 24,
        }),
      }),
    });
    expect(realtimeService.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'trip.incident-reported',
        payload: expect.objectContaining({
          hasVoluntaryEvidence: true,
        }),
      }),
    );
    expect(result.incident.voluntaryEvidence).toMatchObject({
      declared: true,
      type: 'AUDIO',
      expiresAt: expect.any(String),
      retentionHours: 24,
    });
  });

  it('bounds voluntary incident evidence retention even when service is called directly', async () => {
    const { prisma, service } = createService();

    prisma.trip.findUnique.mockResolvedValue({
      id: 'trip-evidence-bound-1',
      riderId: 'rider-1',
      driverId: 'driver-1',
      status: 'IN_PROGRESS',
    });
    prisma.supportTicket.create.mockResolvedValue({
      id: 'ticket-evidence-bound-1',
    });
    prisma.trip.update.mockResolvedValue({
      id: 'trip-evidence-bound-1',
    });
    prisma.auditLog.create.mockResolvedValue(undefined);

    const result = await service.reportIncident(
      {
        user: {
          id: 'user-rider-1',
          role: 'RIDER',
          riderProfile: {
            id: 'rider-1',
          },
        },
      } as never,
      'trip-evidence-bound-1',
      {
        incidentType: 'SAFETY_ALERT',
        evidenceConsent: true,
        evidenceType: 'VIDEO',
        evidenceRetentionHours: 999,
      },
    );

    expect(prisma.trip.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          events: {
            create: expect.arrayContaining([
              expect.objectContaining({
                eventType: 'INCIDENT_EVIDENCE_DECLARED',
                payload: expect.objectContaining({
                  evidence: expect.objectContaining({
                    type: 'VIDEO',
                    retentionHours: 72,
                    expiresAt: expect.any(String),
                  }),
                }),
              }),
            ]),
          },
        },
      }),
    );
    expect(result.incident.voluntaryEvidence).toMatchObject({
      declared: true,
      type: 'VIDEO',
      retentionHours: 72,
      expiresAt: expect.any(String),
    });
  });

  it('creates an audited SOS ticket for an active trip', async () => {
    const { prisma, realtimeService, service } = createService();

    prisma.trip.findUnique.mockResolvedValue({
      id: 'trip-sos-1',
      riderId: 'rider-1',
      driverId: 'driver-1',
      status: 'IN_PROGRESS',
    });
    prisma.supportTicket.create.mockResolvedValue({
      id: 'ticket-sos-1',
    });
    prisma.trip.update.mockResolvedValue({
      id: 'trip-sos-1',
    });

    const result = await service.triggerSafetySos(
      {
        user: {
          id: 'user-rider-1',
          role: 'RIDER',
          riderProfile: {
            id: 'rider-1',
          },
        },
      } as never,
      'trip-sos-1',
      {
        details: 'Besoin d aide immediate.',
        latitude: 12.3714,
        longitude: -1.5197,
        accuracyMeters: 20,
      },
    );

    expect(prisma.supportTicket.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'user-rider-1',
        priority: 3,
        subject: 'SOS trajet trip-sos-1',
        description: expect.stringContaining('Type: SOS_TRIGGERED'),
      }),
    });
    expect(prisma.trip.update).toHaveBeenCalledWith({
      where: { id: 'trip-sos-1' },
      data: {
        events: {
          create: expect.objectContaining({
            eventType: 'SOS_TRIGGERED',
            payload: expect.objectContaining({
              incidentType: 'SOS_TRIGGERED',
              priority: 3,
              reportedByRole: 'RIDER',
              supportTicketId: 'ticket-sos-1',
              location: expect.objectContaining({
                latitude: 12.3714,
                longitude: -1.5197,
              }),
            }),
          }),
        },
      },
    });
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'user-rider-1',
        action: 'TRIP_SOS_TRIGGERED',
        entityType: 'TRIP',
        entityId: 'trip-sos-1',
      }),
    });
    expect(realtimeService.publish).toHaveBeenCalledWith({
      channel: 'trip',
      type: 'trip.sos-triggered',
      entityId: 'trip-sos-1',
      riderId: 'rider-1',
      driverId: 'driver-1',
      actorRole: 'RIDER',
      payload: {
        incidentType: 'SOS_TRIGGERED',
        priority: 3,
        ticketStatus: 'OPEN',
        supportTicketId: 'ticket-sos-1',
        hasLocation: true,
      },
    });
    expect(result.sos).toMatchObject({
      ticketId: 'ticket-sos-1',
      priority: 3,
      localEmergencyNumber: '112',
      locationCaptured: true,
    });
  });

  it('throttles repeated SOS triggers from the same actor on a trip', async () => {
    const { prisma, realtimeService, service } = createService();

    prisma.trip.findUnique.mockResolvedValue({
      id: 'trip-sos-1',
      riderId: 'rider-1',
      driverId: 'driver-1',
      status: 'IN_PROGRESS',
      events: [
        {
          eventType: 'SOS_TRIGGERED',
          createdAt: new Date(),
          payload: {
            reportedByUserId: 'user-rider-1',
          },
        },
      ],
    });

    await expect(
      service.triggerSafetySos(
        {
          user: {
            id: 'user-rider-1',
            role: 'RIDER',
            riderProfile: {
              id: 'rider-1',
            },
          },
        } as never,
        'trip-sos-1',
        {
          details: 'Second tap accidental.',
        },
      ),
    ).rejects.toThrow('SOS already triggered recently.');

    expect(prisma.trip.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          events: expect.objectContaining({
            where: {
              eventType: 'SOS_TRIGGERED',
            },
            take: 5,
          }),
        }),
      }),
    );
    expect(prisma.supportTicket.create).not.toHaveBeenCalled();
    expect(prisma.trip.update).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
    expect(realtimeService.publish).not.toHaveBeenCalled();
  });

  it('sends push notifications to all active OPS and SUPPORT staff on SOS trigger', async () => {
    const { prisma, notificationsService, service } = createService();

    prisma.trip.findUnique.mockResolvedValue({
      id: 'trip-sos-2',
      riderId: 'rider-1',
      driverId: 'driver-1',
      status: 'IN_PROGRESS',
    });
    prisma.supportTicket.create.mockResolvedValue({ id: 'ticket-sos-2' });
    prisma.trip.update.mockResolvedValue({ id: 'trip-sos-2' });
    prisma.user.findMany.mockResolvedValue([
      { id: 'ops-user-1' },
      { id: 'support-user-1' },
    ]);

    await service.triggerSafetySos(
      {
        user: {
          id: 'user-rider-1',
          role: 'RIDER',
          riderProfile: { id: 'rider-1' },
        },
      } as never,
      'trip-sos-2',
      {},
    );

    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          role: { in: expect.arrayContaining(['OPS', 'SUPPORT']) },
          isActive: true,
        }),
      }),
    );
    expect(notificationsService.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'ops-user-1',
        channel: 'PUSH',
        dedupeKey: 'sos:trip-sos-2:ops-user-1',
      }),
    );
    expect(notificationsService.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'support-user-1',
        channel: 'PUSH',
        dedupeKey: 'sos:trip-sos-2:support-user-1',
      }),
    );
    expect(notificationsService.enqueue).toHaveBeenCalledTimes(2);
  });

  it('creates an audited expiring share link for an active trip', async () => {
    const { prisma, realtimeService, service } = createService();

    prisma.trip.findUnique.mockResolvedValue({
      id: 'trip-share-1',
      riderId: 'rider-1',
      driverId: 'driver-1',
      status: 'IN_PROGRESS',
      rider: { id: 'rider-1' },
      driver: { id: 'driver-1' },
    });
    prisma.trip.update.mockResolvedValue({
      id: 'trip-share-1',
    });

    const result = await service.createShareLink(
      {
        user: {
          id: 'user-rider-1',
          role: 'RIDER',
          riderProfile: {
            id: 'rider-1',
          },
        },
      } as never,
      'trip-share-1',
    );

    expect(result.share.token).toHaveLength(32);
    expect(result.share.path).toBe(`/trips/shared/${result.share.token}`);
    expect(result.share.ttlMinutes).toBe(120);
    expect(prisma.trip.update).toHaveBeenCalledWith({
      where: { id: 'trip-share-1' },
      data: {
        events: {
          create: expect.objectContaining({
            eventType: 'SHARE_LINK_CREATED',
            payload: expect.objectContaining({
              createdByRole: 'RIDER',
              ttlMinutes: 120,
              tokenHash: expect.any(String),
            }),
          }),
        },
      },
    });
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'user-rider-1',
        action: 'TRIP_SHARE_LINK_CREATED',
        entityType: 'TRIP',
        entityId: 'trip-share-1',
      }),
    });
    expect(realtimeService.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: 'trip',
        type: 'trip.share-link-created',
        entityId: 'trip-share-1',
      }),
    );
  });

  it('rejects public share link creation from a driver account', async () => {
    const { prisma, service } = createService();

    await expect(
      service.createShareLink(
        {
          user: {
            id: 'user-driver-1',
            role: 'DRIVER',
            driverProfile: {
              id: 'driver-1',
            },
          },
        } as never,
        'trip-share-1',
      ),
    ).rejects.toThrow('Only the rider can create a public trip share link.');

    expect(prisma.trip.findUnique).not.toHaveBeenCalled();
    expect(prisma.trip.update).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it('returns limited public trip data for a valid share token', async () => {
    const { prisma, service } = createService();
    const token = 'share-token-1234567890';
    const tokenHash = createHash('sha256').update(token).digest('hex');

    prisma.tripEvent.findFirst.mockResolvedValue({
      id: 'event-share-1',
      eventType: 'SHARE_LINK_CREATED',
      payload: {
        tokenHash,
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      },
      createdAt: new Date('2026-05-02T10:00:00.000Z'),
      trip: {
        id: 'trip-share-1',
        status: 'IN_PROGRESS',
        pickupAddress: 'Universite Joseph Ki-Zerbo',
        destinationAddress: 'Ouaga 2000',
        rider: { user: { fullName: 'Awa Rider' } },
        driver: { user: { fullName: 'Issa Driver' } },
        vehicle: { make: 'Yamaha', model: 'Crypton' },
        events: [
          {
            id: 'event-share-1',
            eventType: 'SHARE_LINK_CREATED',
            payload: {
              tokenHash,
              expiresAt: new Date(Date.now() + 60_000).toISOString(),
            },
            createdAt: new Date('2026-05-02T10:00:00.000Z'),
          },
          {
            id: 'event-start-1',
            eventType: 'TRIP_STARTED',
            payload: null,
            createdAt: new Date('2026-05-02T10:05:00.000Z'),
          },
        ],
      },
    });

    const result = await service.getSharedTrip(token);

    expect(prisma.tripEvent.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          eventType: 'SHARE_LINK_CREATED',
          payload: {
            path: ['tokenHash'],
            equals: tokenHash,
          },
        }),
      }),
    );
    expect(prisma.trip.findMany).not.toHaveBeenCalled();
    expect(result.sharedTrip).toMatchObject({
      tripId: 'trip-share-1',
      status: 'IN_PROGRESS',
      riderName: 'Passager Orbi',
      driverName: 'Chauffeur Orbi',
      vehicleLabel: 'Yamaha Crypton',
      lastEvent: {
        label: 'Course demarree',
        createdAt: '2026-05-02T10:05:00.000Z',
      },
    });
    expect(result.sharedTrip.safetyNote).toContain('Aucun nom reel');
    expect(result.sharedTrip).not.toMatchObject({
      riderName: 'Awa Rider',
      driverName: 'Issa Driver',
    });
  });

  it('rejects expired public share tokens after direct token lookup', async () => {
    const { prisma, service } = createService();
    const token = 'share-token-expired-1234567890';

    prisma.tripEvent.findFirst.mockResolvedValue({
      id: 'event-share-expired',
      eventType: 'SHARE_LINK_CREATED',
      payload: {
        tokenHash: createHash('sha256').update(token).digest('hex'),
        expiresAt: new Date(Date.now() - 60_000).toISOString(),
      },
      createdAt: new Date('2026-05-02T10:00:00.000Z'),
      trip: {
        id: 'trip-share-expired',
        status: 'IN_PROGRESS',
        pickupAddress: 'Universite Joseph Ki-Zerbo',
        destinationAddress: 'Ouaga 2000',
        rider: { user: { fullName: 'Awa Rider' } },
        driver: { user: { fullName: 'Issa Driver' } },
        vehicle: { make: 'Yamaha', model: 'Crypton' },
        events: [],
      },
    });

    await expect(service.getSharedTrip(token)).rejects.toThrow(
      'Shared trip not found.',
    );
  });

  it('rejects public share tokens with normalized invalid expiry dates', async () => {
    const { prisma, service } = createService();
    const token = 'share-token-invalid-expiry-1234567890';

    expect(
      parseStrictTripShareExpiry('2027-04-18T06:30:00Z')?.toISOString(),
    ).toBe('2027-04-18T06:30:00.000Z');
    expect(parseStrictTripShareExpiry('2027-02-31T00:00:00.000Z')).toBeNull();
    expect(parseStrictTripShareExpiry('2027-04-18')).toBeNull();

    prisma.tripEvent.findFirst.mockResolvedValue({
      id: 'event-share-invalid-expiry',
      eventType: 'SHARE_LINK_CREATED',
      payload: {
        tokenHash: createHash('sha256').update(token).digest('hex'),
        expiresAt: '2027-02-31T00:00:00.000Z',
      },
      createdAt: new Date('2026-05-02T10:00:00.000Z'),
      trip: {
        id: 'trip-share-invalid-expiry',
        status: 'IN_PROGRESS',
        pickupAddress: 'Universite Joseph Ki-Zerbo',
        destinationAddress: 'Ouaga 2000',
        rider: { user: { fullName: 'Awa Rider' } },
        driver: { user: { fullName: 'Issa Driver' } },
        vehicle: { make: 'Yamaha', model: 'Crypton' },
        events: [],
      },
    });

    await expect(service.getSharedTrip(token)).rejects.toThrow(
      'Shared trip not found.',
    );
  });

  it('records route monitoring positions and escalates abnormal deviation', async () => {
    const { prisma, realtimeService, service } = createService();

    prisma.trip.findUnique.mockResolvedValue({
      id: 'trip-route-1',
      riderId: 'rider-1',
      driverId: 'driver-1',
      status: 'IN_PROGRESS',
      distanceKm: 5,
      durationMinutes: 12,
      rideRequest: {
        pickupLatitude: 12.3714,
        pickupLongitude: -1.5197,
        destinationLatitude: 12.359,
        destinationLongitude: -1.536,
      },
      events: [],
    });
    prisma.trip.update.mockResolvedValue({ id: 'trip-route-1' });
    prisma.supportTicket.create.mockResolvedValue({ id: 'ticket-route-1' });
    prisma.auditLog.create.mockResolvedValue(undefined);

    const result = await service.recordRoutePosition(
      {
        user: {
          id: 'user-driver-1',
          role: 'DRIVER',
          driverProfile: {
            id: 'driver-1',
            createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 10),
          },
        },
      } as never,
      'trip-route-1',
      {
        latitude: 12.39,
        longitude: -1.58,
        accuracyMeters: 12,
        speedKph: 24,
        distanceToDestinationKm: 7,
      },
    );

    expect(result.routeMonitoring).toMatchObject({
      tripId: 'trip-route-1',
      state: 'alert',
      latestPosition: {
        latitude: 12.39,
        longitude: -1.58,
        accuracyMeters: 12,
        speedKph: 24,
        distanceToPickupKm: expect.any(Number),
        distanceToDestinationKm: 7,
        observedAt: expect.any(String),
        sourceRole: 'DRIVER',
      },
      ticketIds: ['ticket-route-1'],
      alerts: [
        expect.objectContaining({
          alertType: 'ROUTE_DEVIATION',
          severity: 'critical',
          priority: 3,
        }),
      ],
    });
    expect(prisma.trip.update).toHaveBeenCalledWith({
      where: { id: 'trip-route-1' },
      data: {
        events: {
          create: expect.objectContaining({
            eventType: 'ROUTE_POSITION_RECORDED',
          }),
        },
      },
    });
    expect(prisma.supportTicket.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        subject: 'Alerte route trajet trip-route-1',
        priority: 3,
      }),
    });
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'TRIP_ROUTE_MONITORING_ALERT_CREATED',
        entityType: 'TRIP',
        entityId: 'trip-route-1',
      }),
    });
    expect(realtimeService.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'trip.route-monitor-alert',
        entityId: 'trip-route-1',
      }),
    );
  });

  it('records rider location without creating driver route alerts', async () => {
    const { prisma, realtimeService, service } = createService();

    prisma.trip.findUnique.mockResolvedValue({
      id: 'trip-route-rider-1',
      riderId: 'rider-1',
      driverId: 'driver-1',
      status: 'IN_PROGRESS',
      distanceKm: 5,
      durationMinutes: 12,
      rideRequest: {
        pickupLatitude: 12.3714,
        pickupLongitude: -1.5197,
        destinationLatitude: 12.359,
        destinationLongitude: -1.536,
      },
      events: [],
    });
    prisma.trip.update.mockResolvedValue({ id: 'trip-route-rider-1' });

    const result = await service.recordRoutePosition(
      {
        user: {
          id: 'user-rider-1',
          role: 'RIDER',
          riderProfile: {
            id: 'rider-1',
          },
        },
      } as never,
      'trip-route-rider-1',
      {
        latitude: 12.39,
        longitude: -1.58,
        accuracyMeters: 12,
        speedKph: 4,
      },
    );

    expect(result.routeMonitoring).toMatchObject({
      tripId: 'trip-route-rider-1',
      state: 'clear',
      latestPosition: {
        latitude: 12.39,
        longitude: -1.58,
        accuracyMeters: 12,
        speedKph: 4,
        distanceToPickupKm: expect.any(Number),
        distanceToDestinationKm: expect.any(Number),
        observedAt: expect.any(String),
        sourceRole: 'RIDER',
      },
      alerts: [],
      ticketIds: [],
    });
    expect(prisma.supportTicket.create).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'TRIP_ROUTE_MONITORING_ALERT_CREATED',
        }),
      }),
    );
    expect(realtimeService.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'trip.route-position',
        entityId: 'trip-route-rider-1',
      }),
    );
  });

  it('returns a trip detail timeline for the authenticated rider', async () => {
    const { prisma, service } = createService();

    prisma.trip.findUnique.mockResolvedValue({
      id: 'trip-detail-1',
      rideRequestId: 'request-detail-1',
      riderId: 'rider-1',
      driverId: 'driver-1',
      status: 'DRIVER_ARRIVING',
      pickupAddress: 'Universite Joseph Ki-Zerbo',
      destinationAddress: 'Ouaga 2000',
      actualFare: 1600,
      currency: 'XOF',
      startedAt: null,
      completedAt: null,
      createdAt: new Date('2026-04-17T08:00:00.000Z'),
      rider: {
        user: {
          fullName: 'Awa Rider',
        },
      },
      driver: {
        verificationStatus: 'APPROVED',
        averageRating: 4.7,
        completedTripsCount: 84,
        user: {
          fullName: 'Issa Driver',
          isPhoneVerified: true,
        },
      },
      vehicle: {
        plateNumber: '11 AA 1234',
        make: 'Yamaha',
        model: 'Crypton',
        color: 'rouge',
        year: 2023,
        seats: 2,
        type: 'MOTORCYCLE',
        tier: 'MOTO_STANDARD',
      },
      rideRequest: {
        pickupLatitude: 12.3714,
        pickupLongitude: -1.5197,
        destinationLatitude: 12.359,
        destinationLongitude: -1.536,
      },
      events: [
        {
          id: 'event-1',
          eventType: 'TRIP_ACCEPTED',
          createdAt: new Date('2026-04-17T08:01:00.000Z'),
        },
        {
          id: 'event-2',
          eventType: 'PICKUP_CODE_ISSUED',
          payload: {
            pickupCode: '4821',
          },
          createdAt: new Date('2026-04-17T08:02:00.000Z'),
        },
        {
          id: 'event-3',
          eventType: 'ROUTE_POSITION_RECORDED',
          payload: {
            latitude: 12.34,
            longitude: -1.53,
            accuracyMeters: 14,
            speedKph: 18,
            observedAt: '2026-04-17T08:03:00.000Z',
            sourceRole: 'DRIVER',
          },
          createdAt: new Date('2026-04-17T08:03:00.000Z'),
        },
        {
          id: 'event-4',
          eventType: 'ROUTE_MONITORING_ALERT',
          payload: {
            alertType: 'ROUTE_DEVIATION',
            severity: 'critical',
          },
          createdAt: new Date('2026-04-17T08:04:00.000Z'),
        },
      ],
    });

    const result = await service.getTripDetail(
      {
        user: {
          role: 'RIDER',
          riderProfile: {
            id: 'rider-1',
          },
        },
      } as never,
      'trip-detail-1',
    );

    expect(result.trip.pickupCode).toBeNull();
    expect(result.trip.driverVerification).toEqual({
      verificationStatus: 'APPROVED',
      phoneVerified: true,
      averageRating: 4.7,
      completedTripsCount: 84,
      profilePhotoUrl: null,
      vehicle: {
        plateNumber: '11 AA 1234',
        color: 'rouge',
        make: 'Yamaha',
        model: 'Crypton',
        year: 2023,
        seats: 2,
        type: 'MOTORCYCLE',
        tier: 'MOTO_STANDARD',
      },
    });
    expect(result.trip.routeMonitoring).toEqual({
      state: 'critical',
      alertCount: 1,
      lastAlertType: 'ROUTE_DEVIATION',
      lastAlertAt: '2026-04-17T08:04:00.000Z',
      lastPositionAt: '2026-04-17T08:03:00.000Z',
      latestPosition: {
        latitude: 12.34,
        longitude: -1.53,
        accuracyMeters: 14,
        speedKph: 18,
        distanceToPickupKm: expect.any(Number),
        distanceToDestinationKm: expect.any(Number),
        observedAt: '2026-04-17T08:03:00.000Z',
        sourceRole: 'DRIVER',
      },
    });
    expect(result.trip.timeline).toEqual([
      expect.objectContaining({ label: 'Course acceptee par le chauffeur' }),
      expect.objectContaining({ label: 'Position trajet recue' }),
      expect.objectContaining({ label: 'Alerte monitoring trajet' }),
    ]);
  });

  it('keeps the rider position from replacing the driver live vehicle signal', async () => {
    const { prisma, service } = createService();

    prisma.trip.findUnique.mockResolvedValue({
      id: 'trip-detail-rider-signal-1',
      rideRequestId: 'request-detail-1',
      riderId: 'rider-1',
      driverId: 'driver-1',
      status: 'DRIVER_ARRIVING',
      pickupAddress: 'Universite Joseph Ki-Zerbo',
      destinationAddress: 'Ouaga 2000',
      actualFare: 1600,
      currency: 'XOF',
      startedAt: null,
      completedAt: null,
      createdAt: new Date('2026-04-17T08:00:00.000Z'),
      rider: {
        user: {
          fullName: 'Awa Rider',
        },
      },
      driver: {
        verificationStatus: 'APPROVED',
        averageRating: 4.7,
        completedTripsCount: 84,
        user: {
          fullName: 'Issa Driver',
          isPhoneVerified: true,
        },
      },
      vehicle: {
        plateNumber: '11 AA 1234',
        make: 'Yamaha',
        model: 'Crypton',
        color: 'rouge',
        year: 2023,
        seats: 2,
        type: 'MOTORCYCLE',
        tier: 'MOTO_STANDARD',
      },
      rideRequest: {
        pickupLatitude: 12.3714,
        pickupLongitude: -1.5197,
        destinationLatitude: 12.359,
        destinationLongitude: -1.536,
      },
      events: [
        {
          id: 'event-driver-position',
          eventType: 'ROUTE_POSITION_RECORDED',
          payload: {
            latitude: 12.34,
            longitude: -1.53,
            accuracyMeters: 14,
            speedKph: 18,
            observedAt: '2026-04-17T08:03:00.000Z',
            sourceRole: 'DRIVER',
          },
          createdAt: new Date('2026-04-17T08:03:00.000Z'),
        },
        {
          id: 'event-rider-position',
          eventType: 'ROUTE_POSITION_RECORDED',
          payload: {
            latitude: 12.3714,
            longitude: -1.5197,
            accuracyMeters: 8,
            speedKph: 0,
            observedAt: '2026-04-17T08:04:00.000Z',
            sourceRole: 'RIDER',
          },
          createdAt: new Date('2026-04-17T08:04:00.000Z'),
        },
      ],
    });

    const result = await service.getTripDetail(
      {
        user: {
          role: 'RIDER',
          riderProfile: {
            id: 'rider-1',
          },
        },
      } as never,
      'trip-detail-rider-signal-1',
    );

    expect(result.trip.routeMonitoring.latestPosition).toMatchObject({
      latitude: 12.34,
      longitude: -1.53,
      sourceRole: 'DRIVER',
      observedAt: '2026-04-17T08:03:00.000Z',
    });
    expect(result.trip.routeMonitoring.lastPositionAt).toBe(
      '2026-04-17T08:03:00.000Z',
    );
  });

  it('exposes a signed driver profile photo only from an approved verified selfie', async () => {
    const { documentLinksService, prisma, service } = createService();

    prisma.trip.findUnique.mockResolvedValue({
      id: 'trip-detail-1',
      rideRequestId: 'request-detail-1',
      riderId: 'rider-1',
      driverId: 'driver-1',
      status: 'DRIVER_ARRIVING',
      pickupAddress: 'Universite Joseph Ki-Zerbo',
      destinationAddress: 'Ouaga 2000',
      actualFare: 1600,
      currency: 'XOF',
      startedAt: null,
      completedAt: null,
      createdAt: new Date('2026-04-17T08:00:00.000Z'),
      rider: {
        user: {
          fullName: 'Awa Rider',
        },
      },
      driver: {
        id: 'driver-1',
        verificationStatus: 'APPROVED',
        averageRating: 4.7,
        completedTripsCount: 84,
        user: {
          fullName: 'Issa Driver',
          isPhoneVerified: true,
        },
        onboardingDocuments: [
          {
            id: 'selfie-doc-1',
            driverProfileId: 'driver-1',
            type: 'SELFIE_VERIFICATION',
            status: 'APPROVED',
            storageKey: 'driver-1/selfie_verification/selfie.jpg',
            metadata: {
              objectVerification: {
                state: 'confirmed',
              },
            },
          },
        ],
      },
      vehicle: {
        plateNumber: '11 AA 1234',
        make: 'Yamaha',
        model: 'Crypton',
        color: 'rouge',
      },
      rideRequest: null,
      events: [],
    });

    const result = await service.getTripDetail(
      {
        user: {
          role: 'RIDER',
          riderProfile: {
            id: 'rider-1',
          },
        },
      } as never,
      'trip-detail-1',
    );

    expect(result.trip.driverVerification.profilePhotoUrl).toBe(
      'https://storage.orbi.local/view/selfie.jpg?signed=1',
    );
    expect(documentLinksService.createViewLink).toHaveBeenCalledWith({
      documentId: 'selfie-doc-1',
      driverProfileId: 'driver-1',
      storageKey: 'driver-1/selfie_verification/selfie.jpg',
      actorRole: 'RIDER',
    });
  });

  it('does not reveal trip detail to another rider', async () => {
    const { prisma, service } = createService();

    prisma.trip.findUnique.mockResolvedValue({
      id: 'trip-detail-1',
      rideRequestId: 'request-detail-1',
      riderId: 'rider-2',
      driverId: 'driver-1',
      status: 'DRIVER_ARRIVING',
      pickupAddress: 'Universite Joseph Ki-Zerbo',
      destinationAddress: 'Ouaga 2000',
      actualFare: 1600,
      currency: 'XOF',
      startedAt: null,
      completedAt: null,
      createdAt: new Date('2026-04-17T08:00:00.000Z'),
      rider: {
        user: {
          fullName: 'Other Rider',
        },
      },
      driver: {
        user: {
          fullName: 'Issa Driver',
        },
      },
      vehicle: {
        make: 'Yamaha',
        model: 'Crypton',
      },
      events: [],
    });

    await expect(
      service.getTripDetail(
        {
          user: {
            role: 'RIDER',
            riderProfile: {
              id: 'rider-1',
            },
          },
        } as never,
        'trip-detail-1',
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('updates trip status and returns the trip to online after completion', async () => {
    const { prisma, realtimeService, service } = createService();

    prisma.trip.findUnique.mockResolvedValue({
      id: 'trip-1',
      rideRequestId: 'request-1',
      driverId: 'driver-1',
      status: 'IN_PROGRESS',
      startedAt: new Date('2026-04-17T09:00:00.000Z'),
      completedAt: null,
      actualFare: 2200,
      currency: 'XOF',
      events: [buildFreshDriverRouteEvent()],
      rideRequest: {
        paymentMethod: 'MOBILE_MONEY',
      },
    });
    prisma.trip.update.mockResolvedValue({
      id: 'trip-1',
      rideRequestId: 'request-1',
      status: 'COMPLETED',
      startedAt: new Date('2026-04-17T09:00:00.000Z'),
      completedAt: new Date('2026-04-17T09:30:00.000Z'),
      actualFare: 2200,
      currency: 'XOF',
    });
    prisma.driverProfile.update.mockResolvedValue(undefined);
    prisma.rideRequest.update.mockResolvedValue(undefined);

    const result = await service.updateStatus(
      {
        user: {
          role: 'DRIVER',
          driverProfile: {
            id: 'driver-1',
            createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 10),
          },
        },
      } as never,
      'trip-1',
      'COMPLETED',
    );

    expect(prisma.trip.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'trip-1' },
        data: expect.objectContaining({
          status: 'COMPLETED',
        }),
      }),
    );
    // Sans ceci, la ride request reste bloquee en statut actif pour toujours
    // et le rider ne peut plus jamais reserver une course differente.
    expect(prisma.rideRequest.update).toHaveBeenCalledWith({
      where: { id: 'request-1' },
      data: { status: 'FULFILLED' },
    });
    expect(prisma.driverProfile.update).toHaveBeenCalledWith({
      where: { id: 'driver-1' },
      data: { status: 'ONLINE', completedTripsCount: { increment: 1 } },
    });
    expect(realtimeService.publish).toHaveBeenCalledWith({
      channel: 'trip',
      type: 'trip.updated',
      entityId: 'trip-1',
      riderId: undefined,
      driverId: 'driver-1',
      actorRole: 'DRIVER',
      payload: {
        status: 'COMPLETED',
      },
    });
    expect(result.trip.status).toBe('COMPLETED');
    expect(result.trip.driverPayout).toBe(1980);
    expect(result.trip.platformFee).toBe(220);
    expect(result.trip.commissionRate).toBe(0.1);
  });

  it('records a cash receipt event when a cash trip is completed', async () => {
    const { prisma, service } = createService();

    prisma.trip.findUnique.mockResolvedValue({
      id: 'trip-cash-1',
      rideRequestId: 'request-cash-1',
      driverId: 'driver-1',
      riderId: 'rider-1',
      status: 'IN_PROGRESS',
      startedAt: new Date('2026-04-17T09:00:00.000Z'),
      completedAt: null,
      actualFare: 1500,
      currency: 'XOF',
      events: [buildFreshDriverRouteEvent()],
      rider: { userId: 'user-rider-1' },
      driver: { userId: 'user-driver-1' },
      rideRequest: {
        paymentMethod: 'CASH',
      },
    });
    prisma.trip.update.mockResolvedValue({
      id: 'trip-cash-1',
      rideRequestId: 'request-cash-1',
      riderId: 'rider-1',
      driverId: 'driver-1',
      status: 'COMPLETED',
      startedAt: new Date('2026-04-17T09:00:00.000Z'),
      completedAt: new Date('2026-04-17T09:30:00.000Z'),
      actualFare: 1500,
      currency: 'XOF',
    });
    prisma.driverProfile.update.mockResolvedValue(undefined);
    prisma.rideRequest.update.mockResolvedValue(undefined);

    const result = await service.updateStatus(
      {
        user: {
          role: 'DRIVER',
          driverProfile: {
            id: 'driver-1',
            createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 10),
          },
        },
      } as never,
      'trip-cash-1',
      'COMPLETED',
    );

    expect(prisma.trip.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'trip-cash-1' },
        data: expect.objectContaining({
          events: {
            create: expect.objectContaining({
              eventType: 'CASH_PAYMENT_CONFIRMED',
              payload: expect.objectContaining({
                amount: 1500,
                currency: 'XOF',
                collectedByDriverId: 'driver-1',
                confirmedByRole: 'DRIVER',
              }),
            }),
          },
        }),
      }),
    );
    expect(result.trip.status).toBe('COMPLETED');
    expect(result.trip.driverPayout).toBe(1350);
    expect(result.trip.platformFee).toBe(150);
  });

  it('audits driver trip completion when route monitoring is critical', async () => {
    const { prisma, realtimeService, service } = createService();

    prisma.trip.findUnique.mockResolvedValue({
      id: 'trip-1',
      rideRequestId: 'request-1',
      driverId: 'driver-1',
      riderId: 'rider-1',
      status: 'IN_PROGRESS',
      startedAt: new Date('2026-04-17T09:00:00.000Z'),
      completedAt: null,
      actualFare: 2200,
      currency: 'XOF',
      events: [
        buildFreshDriverRouteEvent({
          accuracyMeters: 18,
          speedKph: 24,
        }),
        {
          eventType: 'ROUTE_MONITORING_ALERT',
          payload: {
            alertType: 'ROUTE_DEVIATION',
            severity: 'critical',
          },
          createdAt: new Date(),
        },
      ],
      rider: { userId: 'user-rider-1' },
      driver: { userId: 'user-driver-1' },
      rideRequest: {
        paymentMethod: 'MOBILE_MONEY',
      },
    });
    prisma.trip.update.mockResolvedValue({
      id: 'trip-1',
      rideRequestId: 'request-1',
      riderId: 'rider-1',
      driverId: 'driver-1',
      status: 'COMPLETED',
      startedAt: new Date('2026-04-17T09:00:00.000Z'),
      completedAt: new Date('2026-04-17T09:30:00.000Z'),
      actualFare: 2200,
      currency: 'XOF',
    });
    prisma.driverProfile.update.mockResolvedValue(undefined);
    prisma.rideRequest.update.mockResolvedValue(undefined);

    const result = await service.updateStatus(
      {
        user: {
          role: 'DRIVER',
          driverProfile: {
            id: 'driver-1',
          },
        },
      } as never,
      'trip-1',
      'COMPLETED',
    );

    expect(prisma.trip.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'trip-1' },
        data: expect.objectContaining({
          status: 'COMPLETED',
          events: {
            create: expect.objectContaining({
              eventType: 'TRIP_COMPLETED',
              payload: expect.objectContaining({
                routeCompletionReview: expect.objectContaining({
                  level: 'ROUTE_MONITORING_CRITICAL',
                }),
              }),
            }),
          },
        }),
      }),
    );
    expect(result.trip.status).toBe('COMPLETED');
    expect(realtimeService.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'trip.updated',
        payload: { status: 'COMPLETED' },
      }),
    );
  });

  it('does not let another driver update trip status', async () => {
    const { prisma, realtimeService, service } = createService();

    prisma.trip.findUnique.mockResolvedValue({
      id: 'trip-1',
      rideRequestId: 'request-1',
      driverId: 'driver-2',
      status: 'IN_PROGRESS',
      startedAt: new Date('2026-04-17T09:00:00.000Z'),
      completedAt: null,
      actualFare: 2200,
      currency: 'XOF',
    });

    await expect(
      service.updateStatus(
        {
          user: {
            role: 'DRIVER',
            driverProfile: {
              id: 'driver-1',
            },
          },
        } as never,
        'trip-1',
        'COMPLETED',
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.trip.update).not.toHaveBeenCalled();
    expect(prisma.driverProfile.update).not.toHaveBeenCalled();
    expect(realtimeService.publish).not.toHaveBeenCalled();
  });

  it('allows a rider to cancel a matched trip before departure', async () => {
    const { prisma, realtimeService, service } = createService();

    prisma.trip.findUnique.mockResolvedValue({
      id: 'trip-3',
      rideRequestId: 'request-3',
      riderId: 'rider-1',
      driverId: 'driver-1',
      status: 'MATCHED',
      startedAt: null,
      completedAt: null,
      actualFare: 1800,
      currency: 'XOF',
    });
    prisma.trip.update.mockResolvedValue({
      id: 'trip-3',
      rideRequestId: 'request-3',
      status: 'CANCELLED',
      startedAt: null,
      completedAt: null,
      actualFare: 1800,
      currency: 'XOF',
    });
    prisma.rideRequest.update.mockResolvedValue(undefined);
    prisma.driverProfile.update.mockResolvedValue(undefined);

    const result = await service.updateStatus(
      {
        user: {
          role: 'RIDER',
          riderProfile: {
            id: 'rider-1',
          },
        },
      } as never,
      'trip-3',
      'CANCELLED',
    );

    expect(prisma.trip.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'trip-3' },
        data: expect.objectContaining({
          status: 'CANCELLED',
          cancelledBy: 'RIDER',
        }),
      }),
    );
    expect(prisma.rideRequest.update).toHaveBeenCalledWith({
      where: { id: 'request-3' },
      data: { status: 'CANCELLED' },
    });
    expect(realtimeService.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: 'trip',
        type: 'trip.updated',
        entityId: 'trip-3',
        riderId: 'rider-1',
        driverId: 'driver-1',
        actorRole: 'RIDER',
        payload: expect.objectContaining({
          status: 'CANCELLED',
          cancellationPolicy: expect.objectContaining({
            level: 'FEE_RECOMMENDED',
            suggestedFeeAmount: 200,
          }),
        }),
      }),
    );
    expect(result.trip.status).toBe('CANCELLED');
  });

  it('allows a rider to stop an in-progress trip with a prorated rounded fare', async () => {
    const { prisma, realtimeService, service } = createService();

    prisma.trip.findUnique.mockResolvedValue({
      id: 'trip-rider-stop-1',
      rideRequestId: 'request-rider-stop-1',
      riderId: 'rider-1',
      driverId: 'driver-1',
      status: 'IN_PROGRESS',
      startedAt: new Date('2026-04-17T09:00:00.000Z'),
      completedAt: null,
      actualFare: 5000,
      distanceKm: 10,
      currency: 'XOF',
      events: [
        buildFreshDriverRouteEvent({
          distanceToDestinationKm: 4,
        }),
      ],
      rider: { userId: 'user-rider-1' },
      driver: { userId: 'user-driver-1' },
      rideRequest: {
        paymentMethod: 'CASH',
      },
    });
    prisma.trip.update.mockResolvedValue({
      id: 'trip-rider-stop-1',
      rideRequestId: 'request-rider-stop-1',
      riderId: 'rider-1',
      driverId: 'driver-1',
      status: 'COMPLETED',
      startedAt: new Date('2026-04-17T09:00:00.000Z'),
      completedAt: new Date('2026-04-17T09:16:00.000Z'),
      actualFare: 3000,
      currency: 'XOF',
    });
    prisma.rideRequest.update.mockResolvedValue(undefined);
    prisma.driverProfile.update.mockResolvedValue(undefined);

    const result = await service.updateStatus(
      {
        user: {
          role: 'RIDER',
          riderProfile: {
            id: 'rider-1',
          },
        },
      } as never,
      'trip-rider-stop-1',
      'COMPLETED',
      'Arret demande par le passager',
    );

    expect(prisma.trip.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'trip-rider-stop-1' },
        data: expect.objectContaining({
          status: 'COMPLETED',
          actualFare: 3000,
          distanceKm: 6,
          events: {
            create: expect.objectContaining({
              eventType: 'TRIP_COMPLETED',
              payload: expect.objectContaining({
                earlyStop: expect.objectContaining({
                  requestedByRole: 'RIDER',
                  originalFare: 5000,
                  adjustedFare: 3000,
                  completedDistanceKm: 6,
                  remainingDistanceKm: 4,
                }),
              }),
            }),
          },
        }),
      }),
    );
    expect(prisma.rideRequest.update).toHaveBeenCalledWith({
      where: { id: 'request-rider-stop-1' },
      data: { status: 'FULFILLED' },
    });
    expect(result.trip.status).toBe('COMPLETED');
    expect(result.trip.actualFare).toBe(3000);
    expect(realtimeService.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'trip.updated',
        riderId: 'rider-1',
        driverId: 'driver-1',
        payload: { status: 'COMPLETED' },
      }),
    );
  });

  it('opens a support review with a rounded fee suggestion when rider cancels after driver is mobilized', async () => {
    const { prisma, realtimeService, service } = createService();

    prisma.trip.count.mockResolvedValue(0);
    prisma.supportTicket.create.mockResolvedValue({ id: 'ticket-cancel-fee-1' });
    prisma.trip.findUnique.mockResolvedValue({
      id: 'trip-3',
      rideRequestId: 'request-3',
      riderId: 'rider-1',
      driverId: 'driver-1',
      status: 'DRIVER_ARRIVING',
      startedAt: null,
      completedAt: null,
      actualFare: 1800,
      currency: 'XOF',
      rider: {
        userId: 'user-rider-1',
      },
      driver: {
        userId: 'user-driver-1',
      },
      events: [],
    });
    prisma.trip.update.mockResolvedValue({
      id: 'trip-3',
      rideRequestId: 'request-3',
      riderId: 'rider-1',
      driverId: 'driver-1',
      status: 'CANCELLED',
      startedAt: null,
      completedAt: null,
      actualFare: 1800,
      currency: 'XOF',
    });
    prisma.rideRequest.update.mockResolvedValue(undefined);
    prisma.driverProfile.update.mockResolvedValue(undefined);

    const result = await service.updateStatus(
      {
        user: {
          id: 'user-rider-1',
          role: 'RIDER',
          riderProfile: {
            id: 'rider-1',
          },
        },
      } as never,
      'trip-3',
      'CANCELLED',
      'Changement de plan',
    );

    expect(prisma.supportTicket.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'user-rider-1',
        subject: 'Revue frais annulation course trip-3',
        priority: 2,
      }),
      select: {
        id: true,
      },
    });
    expect(realtimeService.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          status: 'CANCELLED',
          cancellationPolicy: expect.objectContaining({
            level: 'FEE_RECOMMENDED',
            suggestedFeeAmount: 300,
            driverCompensationAmount: 240,
            supportTicketId: 'ticket-cancel-fee-1',
          }),
        }),
      }),
    );
    expect(result.trip.cancellationPolicy).toEqual(
      expect.objectContaining({
        level: 'FEE_RECOMMENDED',
        suggestedFeeAmount: 300,
        driverCompensationAmount: 240,
        supportTicketId: 'ticket-cancel-fee-1',
      }),
    );
  });

  it('opens a support review when driver repeatedly cancels accepted trips', async () => {
    const { prisma, realtimeService, service } = createService();

    prisma.trip.count.mockResolvedValue(2);
    prisma.supportTicket.create.mockResolvedValue({ id: 'ticket-driver-cancel-1' });
    prisma.trip.findUnique.mockResolvedValue({
      id: 'trip-driver-cancel-1',
      rideRequestId: 'request-driver-cancel-1',
      riderId: 'rider-1',
      driverId: 'driver-1',
      status: 'MATCHED',
      startedAt: null,
      completedAt: null,
      actualFare: 1800,
      currency: 'XOF',
      rider: {
        userId: 'user-rider-1',
      },
      driver: {
        userId: 'user-driver-1',
      },
      events: [],
    });
    prisma.trip.update.mockResolvedValue({
      id: 'trip-driver-cancel-1',
      rideRequestId: 'request-driver-cancel-1',
      riderId: 'rider-1',
      driverId: 'driver-1',
      status: 'CANCELLED',
      startedAt: null,
      completedAt: null,
      actualFare: 1800,
      currency: 'XOF',
    });
    prisma.rideRequest.update.mockResolvedValue(undefined);
    prisma.driverProfile.update.mockResolvedValue(undefined);

    const result = await service.updateStatus(
      {
        user: {
          id: 'user-driver-1',
          role: 'DRIVER',
          driverProfile: {
            id: 'driver-1',
          },
        },
      } as never,
      'trip-driver-cancel-1',
      'CANCELLED',
      'Erreur d acceptation',
    );

    expect(prisma.supportTicket.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'user-driver-1',
        subject: 'Revue annulations chauffeur trip-driver-cancel-1',
        priority: 2,
      }),
      select: {
        id: true,
      },
    });
    expect(prisma.driverProfile.update).toHaveBeenCalledWith({
      where: {
        id: 'driver-1',
      },
      data: {
        status: 'OFFLINE',
      },
    });
    expect(realtimeService.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          status: 'CANCELLED',
          cancellationPolicy: expect.objectContaining({
            actor: 'DRIVER',
            level: 'REVIEW',
            driverReliabilityImpact: 'SUPPORT_REVIEW',
            temporaryPauseMinutes: 30,
            supportTicketId: 'ticket-driver-cancel-1',
          }),
        }),
      }),
    );
    expect(result.trip.cancellationPolicy).toEqual(
      expect.objectContaining({
        actor: 'DRIVER',
        level: 'REVIEW',
        driverReliabilityImpact: 'SUPPORT_REVIEW',
        temporaryPauseMinutes: 30,
        supportTicketId: 'ticket-driver-cancel-1',
      }),
    );
  });

  it('publishes a trip update and mirrors ride-request status when the driver arrives', async () => {
    const { prisma, realtimeService, service } = createService();

    prisma.trip.findUnique.mockResolvedValue({
      id: 'trip-arrive-1',
      rideRequestId: 'request-arrive-1',
      riderId: 'rider-1',
      driverId: 'driver-1',
      status: 'MATCHED',
      startedAt: null,
      completedAt: null,
      actualFare: 1800,
      currency: 'XOF',
    });
    prisma.trip.update.mockResolvedValue({
      id: 'trip-arrive-1',
      rideRequestId: 'request-arrive-1',
      status: 'DRIVER_ARRIVING',
      startedAt: null,
      completedAt: null,
      actualFare: 1800,
      currency: 'XOF',
    });
    prisma.rideRequest.update.mockResolvedValue(undefined);
    prisma.driverProfile.update.mockResolvedValue(undefined);

    const result = await service.updateStatus(
      {
        user: {
          role: 'DRIVER',
          driverProfile: {
            id: 'driver-1',
          },
        },
      } as never,
      'trip-arrive-1',
      'DRIVER_ARRIVING',
    );

    expect(prisma.rideRequest.update).toHaveBeenCalledWith({
      where: { id: 'request-arrive-1' },
      data: { status: 'DRIVER_ARRIVING' },
    });
    expect(realtimeService.publish).toHaveBeenCalledWith({
      channel: 'trip',
      type: 'trip.updated',
      entityId: 'trip-arrive-1',
      riderId: 'rider-1',
      driverId: 'driver-1',
      actorRole: 'DRIVER',
      payload: {
        status: 'DRIVER_ARRIVING',
      },
    });
    expect(result.trip.status).toBe('DRIVER_ARRIVING');
  });

  // ---------------------------------------------------------------------------
  // rateTrip — notation d'une course par le passager
  // ---------------------------------------------------------------------------
  describe('rateTrip', () => {
    function buildCompletedTrip(overrides: Record<string, unknown> = {}) {
      return {
        id: 'trip-rate-1',
        riderId: 'rider-1',
        driverId: 'driver-profile-1',
        status: 'COMPLETED',
        rider: {
          id: 'rider-1',
          user: { id: 'user-rider-1', fullName: 'Awa Test' },
        },
        driver: {
          id: 'driver-profile-1',
          user: { id: 'user-driver-1', fullName: 'Boubacar Test' },
        },
        ...overrides,
      };
    }

    function buildRiderAuth(overrides: Record<string, unknown> = {}) {
      return {
        user: {
          id: 'user-rider-1',
          role: 'RIDER',
          riderProfile: { id: 'rider-1' },
          ...overrides,
        },
      } as never;
    }

    it('throws NotFoundException when the trip does not exist', async () => {
      const { prisma, service } = createService();

      prisma.trip.findUnique.mockResolvedValue(null);

      await expect(
        service.rateTrip(buildRiderAuth(), 'trip-rate-missing', { score: 4 }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when the rider does not own the trip', async () => {
      const { prisma, service } = createService();

      // La course appartient à un autre passager
      prisma.trip.findUnique.mockResolvedValue(
        buildCompletedTrip({ riderId: 'rider-autre' }),
      );

      await expect(
        service.rateTrip(buildRiderAuth(), 'trip-rate-1', { score: 5 }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when the trip is not COMPLETED', async () => {
      const { prisma, service } = createService();

      prisma.trip.findUnique.mockResolvedValue(
        buildCompletedTrip({ status: 'IN_PROGRESS' }),
      );

      await expect(
        service.rateTrip(buildRiderAuth(), 'trip-rate-1', { score: 5 }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when the trip has already been rated by this rider', async () => {
      const { prisma, service } = createService();

      prisma.trip.findUnique.mockResolvedValue(buildCompletedTrip());
      // Notation existante trouvée dans la base
      prisma.rating.findFirst.mockResolvedValue({
        id: 'rating-existant',
        tripId: 'trip-rate-1',
        riderId: 'rider-1',
        score: 3,
        comment: null,
        createdAt: new Date('2026-05-01T10:00:00.000Z'),
      });

      await expect(
        service.rateTrip(buildRiderAuth(), 'trip-rate-1', { score: 5 }),
      ).rejects.toThrow(BadRequestException);
    });

    it('crée la notation et met à jour la note moyenne du chauffeur', async () => {
      const { prisma, service } = createService();

      const createdAt = new Date('2026-05-20T14:00:00.000Z');

      prisma.trip.findUnique.mockResolvedValue(buildCompletedTrip());
      prisma.rating.findFirst.mockResolvedValue(null);
      prisma.rating.create.mockResolvedValue({
        id: 'rating-new-1',
        tripId: 'trip-rate-1',
        riderId: 'rider-1',
        driverId: 'driver-profile-1',
        score: 4,
        comment: 'Chauffeur ponctuel et courtois.',
        createdAt,
      });
      prisma.rating.aggregate.mockResolvedValue({
        _avg: { score: 4.25 },
        _count: { score: 8 },
      });
      prisma.driverProfile.update.mockResolvedValue(undefined);

      const result = await service.rateTrip(buildRiderAuth(), 'trip-rate-1', {
        score: 4,
        comment: 'Chauffeur ponctuel et courtois.',
      });

      // La note doit être persisée avec chauffeur et passager corrects
      expect(prisma.rating.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tripId: 'trip-rate-1',
            riderId: 'rider-1',
            driverId: 'driver-profile-1',
            score: 4,
            comment: 'Chauffeur ponctuel et courtois.',
          }),
        }),
      );

      // La note moyenne doit être mise à jour sur le profil chauffeur
      expect(prisma.driverProfile.update).toHaveBeenCalledWith({
        where: { id: 'driver-profile-1' },
        data: { averageRating: 4.25 },
      });

      // Réponse correctement sérialisée
      expect(result.rating.id).toBe('rating-new-1');
      expect(result.rating.score).toBe(4);
      expect(result.rating.comment).toBe('Chauffeur ponctuel et courtois.');
      expect(result.rating.tripId).toBe('trip-rate-1');
      expect(result.rating.createdAt).toBe(createdAt.toISOString());
    });

    it('stocke null comme commentaire quand aucun commentaire nest fourni', async () => {
      const { prisma, service } = createService();

      prisma.trip.findUnique.mockResolvedValue(buildCompletedTrip());
      prisma.rating.findFirst.mockResolvedValue(null);
      prisma.rating.create.mockResolvedValue({
        id: 'rating-no-comment',
        tripId: 'trip-rate-1',
        riderId: 'rider-1',
        driverId: 'driver-profile-1',
        score: 5,
        comment: null,
        createdAt: new Date(),
      });
      prisma.rating.aggregate.mockResolvedValue({
        _avg: { score: 4.8 },
        _count: { score: 5 },
      });
      prisma.driverProfile.update.mockResolvedValue(undefined);

      await service.rateTrip(buildRiderAuth(), 'trip-rate-1', { score: 5 });

      expect(prisma.rating.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            score: 5,
            comment: null,
          }),
        }),
      );
    });

    it('ouvre une revue qualite support pour une note faible', async () => {
      const { prisma, realtimeService, service } = createService();
      const createdAt = new Date('2026-05-20T14:00:00.000Z');

      prisma.trip.findUnique.mockResolvedValue(buildCompletedTrip());
      prisma.rating.findFirst.mockResolvedValue(null);
      prisma.rating.create.mockResolvedValue({
        id: 'rating-low-1',
        tripId: 'trip-rate-1',
        riderId: 'rider-1',
        driverId: 'driver-profile-1',
        score: 2,
        comment: 'Chauffeur peu courtois.',
        createdAt,
      });
      prisma.rating.aggregate.mockResolvedValue({
        _avg: { score: 3.2 },
        _count: { score: 9 },
      });
      prisma.driverProfile.update.mockResolvedValue(undefined);
      prisma.supportTicket.create.mockResolvedValue({
        id: 'ticket-quality-1',
        priority: 2,
      });

      const result = await service.rateTrip(buildRiderAuth(), 'trip-rate-1', {
        score: 2,
        comment: 'Chauffeur peu courtois.',
      });

      expect(prisma.supportTicket.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'user-rider-1',
          subject: 'Revue qualite course trip-rate-1',
          description: expect.stringContaining('Score: 2/5'),
          priority: 2,
        }),
        select: {
          id: true,
          priority: true,
        },
      });
      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'TRIP_LOW_RATING_QUALITY_REVIEW_OPENED',
            entityId: 'trip-rate-1',
            metadata: expect.objectContaining({
              supportTicketId: 'ticket-quality-1',
              score: 2,
            }),
          }),
        }),
      );
      expect(realtimeService.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          channel: 'admin',
          type: 'support-ticket.updated',
          entityId: 'ticket-quality-1',
          payload: expect.objectContaining({
            category: 'quality_review',
            score: 2,
          }),
        }),
      );
      expect(result.qualityReview).toEqual({
        ticketId: 'ticket-quality-1',
        priority: 2,
        message:
          'Votre note a ouvert une revue qualite. Le support peut verifier ce trajet.',
      });
    });

    it('ne met pas à jour driverProfile.averageRating quand laggrégat retourne null', async () => {
      const { prisma, service } = createService();

      prisma.trip.findUnique.mockResolvedValue(buildCompletedTrip());
      prisma.rating.findFirst.mockResolvedValue(null);
      prisma.rating.create.mockResolvedValue({
        id: 'rating-first',
        tripId: 'trip-rate-1',
        riderId: 'rider-1',
        driverId: 'driver-profile-1',
        score: 3,
        comment: null,
        createdAt: new Date(),
      });
      // Premier rating : average peut être null si Prisma retourne null
      prisma.rating.aggregate.mockResolvedValue({
        _avg: { score: null },
        _count: { score: 1 },
      });

      await service.rateTrip(buildRiderAuth(), 'trip-rate-1', { score: 3 });

      // La note moyenne ne doit pas être écrasée avec null
      expect(prisma.driverProfile.update).not.toHaveBeenCalled();
    });

    it('vérifie la recherche de doublon sur le bon tripId et riderId', async () => {
      const { prisma, service } = createService();

      prisma.trip.findUnique.mockResolvedValue(buildCompletedTrip());
      prisma.rating.findFirst.mockResolvedValue(null);
      prisma.rating.create.mockResolvedValue({
        id: 'rating-check',
        tripId: 'trip-rate-1',
        riderId: 'rider-1',
        driverId: 'driver-profile-1',
        score: 2,
        comment: null,
        createdAt: new Date(),
      });
      prisma.rating.aggregate.mockResolvedValue({
        _avg: { score: 2 },
        _count: { score: 1 },
      });
      prisma.driverProfile.update.mockResolvedValue(undefined);

      await service.rateTrip(buildRiderAuth(), 'trip-rate-1', { score: 2 });

      // La vérification de doublon doit cibler exactement ce trajet et ce passager
      expect(prisma.rating.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tripId: 'trip-rate-1',
            riderId: 'rider-1',
          }),
        }),
      );
    });

    it('agrège les notes sur le bon driverId', async () => {
      const { prisma, service } = createService();

      prisma.trip.findUnique.mockResolvedValue(buildCompletedTrip());
      prisma.rating.findFirst.mockResolvedValue(null);
      prisma.rating.create.mockResolvedValue({
        id: 'rating-agg',
        tripId: 'trip-rate-1',
        riderId: 'rider-1',
        driverId: 'driver-profile-1',
        score: 5,
        comment: null,
        createdAt: new Date(),
      });
      prisma.rating.aggregate.mockResolvedValue({
        _avg: { score: 4.5 },
        _count: { score: 10 },
      });
      prisma.driverProfile.update.mockResolvedValue(undefined);

      await service.rateTrip(buildRiderAuth(), 'trip-rate-1', { score: 5 });

      // L'agrégat doit filtrer uniquement les notes du chauffeur concerné
      expect(prisma.rating.aggregate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { driverId: 'driver-profile-1' },
          _avg: { score: true },
          _count: { score: true },
        }),
      );
    });
  });

  describe('evaluateRouteMonitoringAlerts (via recordRoutePosition)', () => {
    function buildDriverMonitorAuth() {
      return {
        user: {
          id: 'user-driver-monitor',
          role: 'DRIVER',
          driverProfile: { id: 'driver-monitor' },
        },
      } as never;
    }

    function buildTripWithHistory(overrides: {
      previousEventCreatedAt: Date;
      previousPayload: Record<string, unknown>;
      status?: string;
      createdAt?: Date;
      extraEvents?: Array<{
        eventType: string;
        payload: Record<string, unknown>;
        createdAt: Date;
      }>;
      rideRequest?: Record<string, unknown>;
    }) {
      return {
        id: 'trip-monitor-1',
        riderId: 'rider-monitor',
        driverId: 'driver-monitor',
        status: overrides.status ?? 'IN_PROGRESS',
        createdAt: overrides.createdAt ?? new Date(Date.now() - 20 * 60 * 1000),
        distanceKm: 5,
        durationMinutes: 20,
        rideRequest: overrides.rideRequest ?? {},
        events: [
          {
            eventType: 'ROUTE_POSITION_RECORDED',
            payload: overrides.previousPayload,
            createdAt: overrides.previousEventCreatedAt,
          },
          ...(overrides.extraEvents ?? []),
        ],
      };
    }

    it('raises LONG_STOP alert when driver is stationary for over 8 minutes', async () => {
      const { prisma, service } = createService();
      const nineMinutesAgo = new Date(Date.now() - 9 * 60 * 1000);

      prisma.trip.findUnique.mockResolvedValue(
        buildTripWithHistory({
          previousEventCreatedAt: nineMinutesAgo,
          previousPayload: {
            latitude: 12.37,
            longitude: -1.52,
            speedKph: 0,
            distanceToDestinationKm: 2.0,
            sourceRole: 'DRIVER',
          },
        }),
      );
      prisma.trip.update.mockResolvedValue({ id: 'trip-monitor-1' });
      prisma.supportTicket.create.mockResolvedValue({ id: 'ticket-stop-1' });
      prisma.auditLog.create.mockResolvedValue(undefined);

      const result = await service.recordRoutePosition(
        buildDriverMonitorAuth(),
        'trip-monitor-1',
        {
          latitude: 12.3701,
          longitude: -1.5201,
          speedKph: 0,
          distanceToDestinationKm: 2.0,
        },
      );

      const stopAlerts = result.routeMonitoring.alerts.filter(
        (a) => a.alertType === 'LONG_STOP',
      );
      expect(stopAlerts).toHaveLength(1);
      expect(stopAlerts[0].severity).toBe('warning');
      expect(stopAlerts[0].priority).toBe(2);
      expect(prisma.supportTicket.create).toHaveBeenCalled();
    });

    it('raises NO_PROGRESS alert when driver makes less than 200m progress in 10 minutes', async () => {
      const { prisma, service } = createService();
      const elevenMinutesAgo = new Date(Date.now() - 11 * 60 * 1000);

      prisma.trip.findUnique.mockResolvedValue(
        buildTripWithHistory({
          previousEventCreatedAt: elevenMinutesAgo,
          previousPayload: {
            latitude: 12.372,
            longitude: -1.523,
            speedKph: 4,
            distanceToDestinationKm: 3.5,
            sourceRole: 'DRIVER',
          },
        }),
      );
      prisma.trip.update.mockResolvedValue({ id: 'trip-monitor-1' });
      prisma.supportTicket.create.mockResolvedValue({
        id: 'ticket-noprogress-1',
      });
      prisma.auditLog.create.mockResolvedValue(undefined);

      const result = await service.recordRoutePosition(
        buildDriverMonitorAuth(),
        'trip-monitor-1',
        {
          latitude: 12.3725,
          longitude: -1.5234,
          speedKph: 3,
          distanceToDestinationKm: 3.45,
        },
      );

      const noProgressAlerts = result.routeMonitoring.alerts.filter(
        (a) => a.alertType === 'NO_PROGRESS',
      );
      expect(noProgressAlerts).toHaveLength(1);
      expect(noProgressAlerts[0].severity).toBe('warning');
    });

    it('emits no stop or progress alerts when driver is moving normally', async () => {
      const { prisma, service } = createService();
      const threeMinutesAgo = new Date(Date.now() - 3 * 60 * 1000);

      prisma.trip.findUnique.mockResolvedValue(
        buildTripWithHistory({
          previousEventCreatedAt: threeMinutesAgo,
          previousPayload: {
            latitude: 12.37,
            longitude: -1.52,
            speedKph: 40,
            distanceToDestinationKm: 4.0,
            sourceRole: 'DRIVER',
          },
        }),
      );
      prisma.trip.update.mockResolvedValue({ id: 'trip-monitor-1' });
      prisma.supportTicket.create.mockResolvedValue({ id: 'ticket-ok' });
      prisma.auditLog.create.mockResolvedValue(undefined);

      const result = await service.recordRoutePosition(
        buildDriverMonitorAuth(),
        'trip-monitor-1',
        {
          latitude: 12.382,
          longitude: -1.531,
          speedKph: 38,
          distanceToDestinationKm: 2.4,
        },
      );

      expect(
        result.routeMonitoring.alerts.filter(
          (a) => a.alertType === 'LONG_STOP',
        ),
      ).toHaveLength(0);
      expect(
        result.routeMonitoring.alerts.filter(
          (a) => a.alertType === 'NO_PROGRESS',
        ),
      ).toHaveLength(0);
    });

    it('suppresses a duplicate LONG_STOP alert within the 15-minute cooldown window', async () => {
      const { prisma, service } = createService();
      const nineMinutesAgo = new Date(Date.now() - 9 * 60 * 1000);

      prisma.trip.findUnique.mockResolvedValue(
        buildTripWithHistory({
          previousEventCreatedAt: nineMinutesAgo,
          previousPayload: {
            latitude: 12.37,
            longitude: -1.52,
            speedKph: 0,
            distanceToDestinationKm: 2.0,
            sourceRole: 'DRIVER',
          },
          extraEvents: [
            {
              eventType: 'ROUTE_MONITORING_ALERT',
              payload: { alertType: 'LONG_STOP', severity: 'warning' },
              createdAt: new Date(Date.now() - 5 * 60 * 1000),
            },
          ],
        }),
      );
      prisma.trip.update.mockResolvedValue({ id: 'trip-monitor-1' });
      prisma.supportTicket.create.mockResolvedValue({ id: 'ticket-cooldown' });
      prisma.auditLog.create.mockResolvedValue(undefined);

      await service.recordRoutePosition(
        buildDriverMonitorAuth(),
        'trip-monitor-1',
        {
          latitude: 12.3701,
          longitude: -1.5201,
          speedKph: 0,
          distanceToDestinationKm: 2.0,
        },
      );

      expect(prisma.supportTicket.create).not.toHaveBeenCalled();
    });

    it('raises PICKUP_MISMATCH when a matched driver stays far from pickup after grace period', async () => {
      const { prisma, service } = createService();
      const eightMinutesAgo = new Date(Date.now() - 8 * 60 * 1000);

      prisma.trip.findUnique.mockResolvedValue(
        buildTripWithHistory({
          status: 'MATCHED',
          createdAt: eightMinutesAgo,
          previousEventCreatedAt: new Date(Date.now() - 2 * 60 * 1000),
          previousPayload: {
            latitude: 12.39,
            longitude: -1.58,
            speedKph: 10,
            sourceRole: 'DRIVER',
          },
          rideRequest: {
            pickupLatitude: 12.3714,
            pickupLongitude: -1.5197,
            destinationLatitude: 12.359,
            destinationLongitude: -1.536,
          },
        }),
      );
      prisma.trip.update.mockResolvedValue({ id: 'trip-monitor-1' });
      prisma.supportTicket.create.mockResolvedValue({ id: 'ticket-pickup-1' });
      prisma.auditLog.create.mockResolvedValue(undefined);

      const result = await service.recordRoutePosition(
        buildDriverMonitorAuth(),
        'trip-monitor-1',
        {
          latitude: 12.39,
          longitude: -1.58,
          speedKph: 10,
        },
      );

      const pickupAlerts = result.routeMonitoring.alerts.filter(
        (a) => a.alertType === 'PICKUP_MISMATCH',
      );
      expect(pickupAlerts).toHaveLength(1);
      expect(pickupAlerts[0]).toEqual(
        expect.objectContaining({
          severity: 'warning',
          priority: 2,
          threshold: 0.8,
        }),
      );
      expect(prisma.supportTicket.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          priority: 2,
          description: expect.stringContaining('PICKUP_MISMATCH'),
        }),
      });
    });

    it('does not raise PICKUP_MISMATCH during the pickup grace period', async () => {
      const { prisma, service } = createService();
      const threeMinutesAgo = new Date(Date.now() - 3 * 60 * 1000);

      prisma.trip.findUnique.mockResolvedValue(
        buildTripWithHistory({
          status: 'MATCHED',
          createdAt: threeMinutesAgo,
          previousEventCreatedAt: new Date(Date.now() - 60 * 1000),
          previousPayload: {
            latitude: 12.39,
            longitude: -1.58,
            speedKph: 10,
            sourceRole: 'DRIVER',
          },
          rideRequest: {
            pickupLatitude: 12.3714,
            pickupLongitude: -1.5197,
            destinationLatitude: 12.359,
            destinationLongitude: -1.536,
          },
        }),
      );
      prisma.trip.update.mockResolvedValue({ id: 'trip-monitor-1' });
      prisma.supportTicket.create.mockResolvedValue({ id: 'ticket-pickup-2' });
      prisma.auditLog.create.mockResolvedValue(undefined);

      const result = await service.recordRoutePosition(
        buildDriverMonitorAuth(),
        'trip-monitor-1',
        {
          latitude: 12.39,
          longitude: -1.58,
          speedKph: 10,
        },
      );

      expect(
        result.routeMonitoring.alerts.filter(
          (a) => a.alertType === 'PICKUP_MISMATCH',
        ),
      ).toHaveLength(0);
    });

    it('raises GPS_POSITION_ANOMALY when driver teleports faster than 500 km/h', async () => {
      const { prisma, service } = createService();
      // Previous position: Ouaga city centre
      // New position: Abidjan (~1100 km away) in 10 seconds → impossible
      const tenSecondsAgo = new Date(Date.now() - 10 * 1000);

      prisma.trip.findUnique.mockResolvedValue(
        buildTripWithHistory({
          previousEventCreatedAt: tenSecondsAgo,
          previousPayload: {
            latitude: 12.3714,
            longitude: -1.5197,
            speedKph: 30,
            distanceToDestinationKm: 4.0,
            sourceRole: 'DRIVER',
          },
        }),
      );
      prisma.trip.update.mockResolvedValue({ id: 'trip-monitor-1' });
      prisma.supportTicket.create.mockResolvedValue({ id: 'ticket-gps-1' });
      prisma.auditLog.create.mockResolvedValue(undefined);

      // Abidjan coordinates — ~1100 km from Ouagadougou
      const result = await service.recordRoutePosition(
        buildDriverMonitorAuth(),
        'trip-monitor-1',
        {
          latitude: 5.36,
          longitude: -4.0083,
          speedKph: 30,
          distanceToDestinationKm: 1100,
        },
      );

      const anomalyAlerts = result.routeMonitoring.alerts.filter(
        (a) => a.alertType === 'GPS_POSITION_ANOMALY',
      );
      expect(anomalyAlerts).toHaveLength(1);
      expect(anomalyAlerts[0].severity).toBe('critical');
      expect(anomalyAlerts[0].priority).toBe(3);
      expect(anomalyAlerts[0].measuredValue).toBeGreaterThan(500);
      expect(prisma.supportTicket.create).toHaveBeenCalled();
    });

    it('does not raise GPS_POSITION_ANOMALY for the first position update (no previous position)', async () => {
      const { prisma, service } = createService();

      // Trip with no previous ROUTE_POSITION_RECORDED events
      prisma.trip.findUnique.mockResolvedValue({
        id: 'trip-monitor-1',
        riderId: 'rider-monitor',
        driverId: 'driver-monitor',
        status: 'IN_PROGRESS',
        distanceKm: 5,
        durationMinutes: 20,
        rideRequest: {},
        events: [],
      });
      prisma.trip.update.mockResolvedValue({ id: 'trip-monitor-1' });
      prisma.auditLog.create.mockResolvedValue(undefined);

      const result = await service.recordRoutePosition(
        buildDriverMonitorAuth(),
        'trip-monitor-1',
        { latitude: 12.3714, longitude: -1.5197, speedKph: 30 },
      );

      expect(
        result.routeMonitoring.alerts.filter(
          (a) => a.alertType === 'GPS_POSITION_ANOMALY',
        ),
      ).toHaveLength(0);
    });

    it('does not raise GPS_POSITION_ANOMALY for a legitimate fast route update', async () => {
      const { prisma, service } = createService();
      // 10 km in 10 minutes → 60 km/h — well within the threshold
      const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);

      prisma.trip.findUnique.mockResolvedValue(
        buildTripWithHistory({
          previousEventCreatedAt: tenMinutesAgo,
          previousPayload: {
            latitude: 12.3714,
            longitude: -1.5197,
            speedKph: 60,
            distanceToDestinationKm: 8.0,
            sourceRole: 'DRIVER',
          },
        }),
      );
      prisma.trip.update.mockResolvedValue({ id: 'trip-monitor-1' });
      prisma.auditLog.create.mockResolvedValue(undefined);

      // ~10 km away from previous position — fine for 10 minutes
      const result = await service.recordRoutePosition(
        buildDriverMonitorAuth(),
        'trip-monitor-1',
        {
          latitude: 12.3714,
          longitude: -1.43,
          speedKph: 60,
          distanceToDestinationKm: 2.0,
        },
      );

      expect(
        result.routeMonitoring.alerts.filter(
          (a) => a.alertType === 'GPS_POSITION_ANOMALY',
        ),
      ).toHaveLength(0);
    });

    it('does not raise GPS_POSITION_ANOMALY after a long gap (> 30 min) even for large distance', async () => {
      const { prisma, service } = createService();
      // 35 minutes gap: driver restarted the app — position jump is explainable
      const thirtyFiveMinutesAgo = new Date(Date.now() - 35 * 60 * 1000);

      prisma.trip.findUnique.mockResolvedValue(
        buildTripWithHistory({
          previousEventCreatedAt: thirtyFiveMinutesAgo,
          previousPayload: {
            latitude: 12.3714,
            longitude: -1.5197,
            speedKph: 0,
            distanceToDestinationKm: 5.0,
            sourceRole: 'DRIVER',
          },
        }),
      );
      prisma.trip.update.mockResolvedValue({ id: 'trip-monitor-1' });
      // NO_PROGRESS alert may fire (driver moved far from destination) — mock ticket
      prisma.supportTicket.create.mockResolvedValue({ id: 'ticket-gap-1' });
      prisma.auditLog.create.mockResolvedValue(undefined);

      // Abidjan — huge jump but gap > 30 min → no anomaly flagged
      const result = await service.recordRoutePosition(
        buildDriverMonitorAuth(),
        'trip-monitor-1',
        {
          latitude: 5.36,
          longitude: -4.0083,
          speedKph: 0,
          distanceToDestinationKm: 1100,
        },
      );

      expect(
        result.routeMonitoring.alerts.filter(
          (a) => a.alertType === 'GPS_POSITION_ANOMALY',
        ),
      ).toHaveLength(0);
    });
  });
});
