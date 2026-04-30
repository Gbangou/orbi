import { TripsService } from './trips.service';
import { ACTIVE_TRIP_STATUSES } from './trips.constants';

describe('TripsService', () => {
  function createService() {
    const prisma = {
      $transaction: jest.fn(),
      driverProfile: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      supportTicket: {
        create: jest.fn(),
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
        findMany: jest.fn(),
        count: jest.fn(),
      },
      auditLog: {
        create: jest.fn(),
      },
    };
    const realtimeService = {
      publish: jest.fn(),
    };

    prisma.$transaction.mockImplementation(
      async (callback: (tx: typeof prisma) => unknown) => callback(prisma),
    );

    return {
      prisma,
      realtimeService,
      service: new TripsService(prisma as never, realtimeService as never),
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
        amount: Math.round(3000 * 0.82),
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
        pickupCode: expect.any(String),
      }),
    );
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
                pickupCode: '4821',
              },
            },
          },
        }),
      }),
    );
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
    expect(result.trip.pickupCode).toBe('4821');
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
          create: expect.objectContaining({
            eventType: 'INCIDENT_REPORTED',
            payload: expect.objectContaining({
              incidentType: 'SAFETY_ALERT',
              priority: 3,
              reportedByRole: 'RIDER',
            }),
          }),
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
      },
    });
    expect(result.incident.ticketId).toBe('ticket-1');
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
        user: {
          fullName: 'Issa Driver',
        },
      },
      vehicle: {
        make: 'Yamaha',
        model: 'Crypton',
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

    expect(result.trip.pickupCode).toBe('4821');
    expect(result.trip.timeline).toEqual([
      expect.objectContaining({ label: 'Course acceptee par le chauffeur' }),
      expect.objectContaining({ label: 'Code de prise en charge genere' }),
    ]);
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
        }),
      }),
    );
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
    expect(realtimeService.publish).toHaveBeenCalledWith({
      channel: 'trip',
      type: 'trip.updated',
      entityId: 'trip-3',
      riderId: 'rider-1',
      driverId: 'driver-1',
      actorRole: 'RIDER',
      payload: {
        status: 'CANCELLED',
      },
    });
    expect(result.trip.status).toBe('CANCELLED');
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
});
