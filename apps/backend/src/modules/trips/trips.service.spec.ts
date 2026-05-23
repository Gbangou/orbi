import { BadRequestException, NotFoundException } from '@nestjs/common';
import { TripsService } from './trips.service';
import { ACTIVE_TRIP_STATUSES } from './trips.constants';
import { createHash } from 'crypto';

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
      retentionHours: 24,
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

    expect(result.trip.pickupCode).toBe('4821');
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
      expect.objectContaining({ label: 'Code de prise en charge genere' }),
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

  it('blocks driver trip completion when route monitoring is critical', async () => {
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
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.trip.update).not.toHaveBeenCalled();
    expect(prisma.driverProfile.update).not.toHaveBeenCalled();
    expect(realtimeService.publish).not.toHaveBeenCalled();
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
        rider: { id: 'rider-1', user: { id: 'user-rider-1', fullName: 'Awa Test' } },
        driver: { id: 'driver-profile-1', user: { id: 'user-driver-1', fullName: 'Boubacar Test' } },
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
});
