import { Prisma } from '@prisma/client';
import { NotFoundException } from '@nestjs/common';
import { RideRequestProjector } from './ride-request.projector';
import { RideRequestsService } from './ride-requests.service';

describe('RideRequestsService', () => {
  function createService() {
    const prisma = {
      $transaction: jest.fn(),
      rideRequest: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      trip: {
        findFirst: jest.fn(),
      },
    };
    const pricingService = {
      quote: jest.fn().mockResolvedValue({
        estimatedFare: 1800,
      }),
      deriveOperatingContext: jest.fn(() => ({
        demandLevel: 'HIGH',
        trafficLevel: 'HEAVY',
        weatherCondition: 'CLEAR',
        roadCondition: 'CONGESTED',
        supplyPressureLevel: 'BALANCED',
        availabilityScore: 72,
      })),
    };
    const realtimeService = {
      publish: jest.fn(),
    };
    const rideRequestProjector = new RideRequestProjector();
    const notificationsService = {
      enqueue: jest.fn().mockResolvedValue({ notification: { id: 'notif-1' } }),
    };
    const dispatchCoordinator = {
      proactiveDispatch: jest
        .fn()
        .mockResolvedValue({
          dispatched: false,
          assignedDriverId: null,
          assignedUserId: null,
        }),
    };

    prisma.$transaction.mockImplementation(
      async (callback: (tx: typeof prisma) => unknown) => callback(prisma),
    );

    return {
      prisma,
      pricingService,
      realtimeService,
      rideRequestProjector,
      notificationsService,
      dispatchCoordinator,
      service: new RideRequestsService(
        prisma as never,
        pricingService as never,
        realtimeService as never,
        rideRequestProjector as never,
        notificationsService as never,
        dispatchCoordinator as never,
      ),
    };
  }

  it('recomputes estimated fare from the pricing engine before creating a request', async () => {
    const { prisma, pricingService, realtimeService, service } =
      createService();

    pricingService.quote.mockResolvedValue({
      estimatedFare: 2150,
    });
    prisma.rideRequest.findFirst.mockResolvedValue(null);
    prisma.trip.findFirst.mockResolvedValue(null);
    prisma.rideRequest.create.mockImplementation(
      async ({ data }: { data: Record<string, unknown> }) => ({
        id: 'request-1',
        ...data,
      }),
    );

    const result = await service.create({
      riderId: 'rider-1',
      pickupAddress: ' Universite Joseph Ki-Zerbo ',
      pickupLatitude: 12.3714,
      pickupLongitude: -1.5197,
      destinationAddress: ' Ouaga 2000 ',
      destinationLatitude: 12.3274,
      destinationLongitude: -1.5339,
      requestedVehicleType: 'MOTORCYCLE',
      requestedServiceTier: 'MOTO_STANDARD',
      estimatedDistanceKm: 5.8,
      estimatedDurationMinutes: 16,
      paymentMethod: 'MOBILE_MONEY',
      pickupAreaType: 'URBAN_CORE',
      city: 'OUAGADOUGOU',
      districtProfile: 'UNIVERSITY',
      notes: ' test request ',
    });

    expect(pricingService.quote).toHaveBeenCalledWith(
      expect.objectContaining({
        vehicleType: 'MOTORCYCLE',
        serviceTier: 'MOTO_STANDARD',
        distanceKm: expect.any(Number),
        durationMinutes: expect.any(Number),
        paymentMethod: 'MOBILE_MONEY',
        zone: 'URBAN_CORE',
        city: 'OUAGADOUGOU',
        districtProfile: 'UNIVERSITY',
        demandLevel: 'HIGH',
        trafficLevel: 'HEAVY',
        weatherCondition: 'CLEAR',
        roadCondition: 'CONGESTED',
        isPeakHour: expect.any(Boolean),
      }),
    );
    expect(prisma.rideRequest.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        riderId: 'rider-1',
        estimatedFare: 2150,
        pickupAddress: 'Universite Joseph Ki-Zerbo',
        pickupLatitude: 12.3714,
        pickupLongitude: -1.5197,
        destinationAddress: 'Ouaga 2000',
        destinationLatitude: 12.3274,
        destinationLongitude: -1.5339,
        paymentMethod: 'MOBILE_MONEY',
        pricingCity: 'OUAGADOUGOU',
        districtProfile: 'UNIVERSITY',
        estimatedDistanceKm: expect.any(Number),
        estimatedDurationMinutes: expect.any(Number),
        notes: 'test request',
        status: 'REQUESTED',
      }),
    });
    expect(realtimeService.publish).toHaveBeenCalledWith({
      channel: 'ride-request',
      type: 'ride-request.created',
      entityId: 'request-1',
      riderId: 'rider-1',
      payload: {
        status: 'REQUESTED',
        estimatedFare: 2150,
        operatingContext: {
          demandLevel: 'HIGH',
          trafficLevel: 'HEAVY',
          weatherCondition: 'CLEAR',
          roadCondition: 'CONGESTED',
          supplyPressureLevel: 'BALANCED',
          availabilityScore: 72,
        },
      },
    });
    expect(result.estimatedFare).toBe(2150);
    expect(result.routeMetricsSource).toBe('SERVER_COORDINATES');
    expect(result.pricingContextSummary).toBe('HIGH - HEAVY - CONGESTED');
    expect(result.bookingReadinessSummary).toContain(
      'Metriques consolidees depuis les coordonnees serveur.',
    );
  });

  it('recomputes distance and duration from coordinates when available', async () => {
    const { prisma, pricingService, service } = createService();

    pricingService.quote.mockResolvedValue({
      estimatedFare: 2350,
    });
    prisma.rideRequest.findFirst.mockResolvedValue(null);
    prisma.trip.findFirst.mockResolvedValue(null);
    prisma.rideRequest.create.mockImplementation(
      async ({ data }: { data: Record<string, unknown> }) => ({
        id: 'request-2',
        ...data,
      }),
    );

    await service.create({
      riderId: 'rider-1',
      pickupAddress: 'Universite Joseph Ki-Zerbo',
      pickupLatitude: 12.3714,
      pickupLongitude: -1.5197,
      destinationAddress: 'Ouaga 2000',
      destinationLatitude: 12.3274,
      destinationLongitude: -1.5339,
      requestedVehicleType: 'MOTORCYCLE',
      requestedServiceTier: 'MOTO_STANDARD',
      estimatedDistanceKm: 99,
      estimatedDurationMinutes: 99,
      paymentMethod: 'MOBILE_MONEY',
      pickupAreaType: 'URBAN_CORE',
    });

    expect(pricingService.quote).toHaveBeenCalledWith(
      expect.objectContaining({
        distanceKm: 5.1,
        durationMinutes: 18,
      }),
    );
    expect(prisma.rideRequest.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        estimatedDistanceKm: 5.1,
        estimatedDurationMinutes: 18,
      }),
    });
  });

  it('rejects ride requests when the rider already has an active one', async () => {
    const { prisma, service } = createService();

    prisma.rideRequest.findFirst.mockResolvedValue({
      id: 'request-active-1',
    });
    prisma.trip.findFirst.mockResolvedValue(null);

    await expect(
      service.create({
        riderId: 'rider-1',
        pickupAddress: 'Universite Joseph Ki-Zerbo',
        destinationAddress: 'Ouaga 2000',
        requestedVehicleType: 'MOTORCYCLE',
        requestedServiceTier: 'MOTO_STANDARD',
        estimatedDistanceKm: 5.8,
        estimatedDurationMinutes: 16,
        paymentMethod: 'MOBILE_MONEY',
        pickupAreaType: 'URBAN_CORE',
      }),
    ).rejects.toThrow('The rider already has an active ride request.');
  });

  it('returns an equivalent active request for duplicate booking retries', async () => {
    const { prisma, pricingService, realtimeService, service } =
      createService();

    pricingService.quote.mockResolvedValue({
      estimatedFare: 2150,
    });
    prisma.rideRequest.findFirst.mockResolvedValue({
      id: 'request-active-1',
      riderId: 'rider-1',
      status: 'REQUESTED',
      pickupAddress: 'Universite Joseph Ki-Zerbo',
      pickupLatitude: 12.3714,
      pickupLongitude: -1.5197,
      destinationAddress: 'Ouaga 2000',
      destinationLatitude: 12.3274,
      destinationLongitude: -1.5339,
      requestedVehicleType: 'MOTORCYCLE',
      requestedServiceTier: 'MOTO_STANDARD',
      paymentMethod: 'MOBILE_MONEY',
      pricingCity: 'OUAGADOUGOU',
      districtProfile: 'UNIVERSITY',
      estimatedFare: 2150,
      estimatedDistanceKm: 5.1,
      estimatedDurationMinutes: 18,
      createdAt: new Date('2026-05-10T09:00:00.000Z'),
    });
    prisma.trip.findFirst.mockResolvedValue(null);

    const result = await service.create({
      riderId: 'rider-1',
      pickupAddress: ' Universite Joseph Ki-Zerbo ',
      pickupLatitude: 12.3714,
      pickupLongitude: -1.5197,
      destinationAddress: ' Ouaga 2000 ',
      destinationLatitude: 12.3274,
      destinationLongitude: -1.5339,
      requestedVehicleType: 'MOTORCYCLE',
      requestedServiceTier: 'MOTO_STANDARD',
      estimatedDistanceKm: 99,
      estimatedDurationMinutes: 99,
      paymentMethod: 'MOBILE_MONEY',
      pickupAreaType: 'URBAN_CORE',
      city: 'OUAGADOUGOU',
      districtProfile: 'UNIVERSITY',
    });

    expect(result.id).toBe('request-active-1');
    expect(result.estimatedFare).toBe(2150);
    expect(prisma.rideRequest.create).not.toHaveBeenCalled();
    expect(realtimeService.publish).not.toHaveBeenCalled();
  });

  it('does not treat a changed payment method as a duplicate booking retry', async () => {
    const { prisma, pricingService, service } = createService();

    pricingService.quote.mockResolvedValue({
      estimatedFare: 2150,
    });
    prisma.rideRequest.findFirst.mockResolvedValue({
      id: 'request-active-1',
      riderId: 'rider-1',
      status: 'REQUESTED',
      pickupAddress: 'Universite Joseph Ki-Zerbo',
      pickupLatitude: 12.3714,
      pickupLongitude: -1.5197,
      destinationAddress: 'Ouaga 2000',
      destinationLatitude: 12.3274,
      destinationLongitude: -1.5339,
      requestedVehicleType: 'MOTORCYCLE',
      requestedServiceTier: 'MOTO_STANDARD',
      paymentMethod: 'MOBILE_MONEY',
      pricingCity: 'OUAGADOUGOU',
      districtProfile: 'UNIVERSITY',
      estimatedFare: 2150,
      estimatedDistanceKm: 5.1,
      estimatedDurationMinutes: 18,
      createdAt: new Date('2026-05-10T09:00:00.000Z'),
    });
    prisma.trip.findFirst.mockResolvedValue(null);

    await expect(
      service.create({
        riderId: 'rider-1',
        pickupAddress: ' Universite Joseph Ki-Zerbo ',
        pickupLatitude: 12.3714,
        pickupLongitude: -1.5197,
        destinationAddress: ' Ouaga 2000 ',
        destinationLatitude: 12.3274,
        destinationLongitude: -1.5339,
        requestedVehicleType: 'MOTORCYCLE',
        requestedServiceTier: 'MOTO_STANDARD',
        estimatedDistanceKm: 99,
        estimatedDurationMinutes: 99,
        paymentMethod: 'CASH',
        pickupAreaType: 'URBAN_CORE',
        city: 'OUAGADOUGOU',
        districtProfile: 'UNIVERSITY',
      }),
    ).rejects.toThrow('The rider already has an active ride request.');
    expect(prisma.rideRequest.create).not.toHaveBeenCalled();
  });

  it('falls back to client route estimates when coordinates are absent', async () => {
    const { prisma, pricingService, service } = createService();

    pricingService.quote.mockResolvedValue({
      estimatedFare: 1800,
    });
    prisma.rideRequest.findFirst.mockResolvedValue(null);
    prisma.trip.findFirst.mockResolvedValue(null);
    prisma.rideRequest.create.mockImplementation(
      async ({ data }: { data: Record<string, unknown> }) => ({
        id: 'request-client-estimate',
        ...data,
      }),
    );

    const result = await service.create({
      riderId: 'rider-1',
      pickupAddress: 'Universite Joseph Ki-Zerbo',
      destinationAddress: 'Ouaga 2000',
      requestedVehicleType: 'MOTORCYCLE',
      requestedServiceTier: 'MOTO_STANDARD',
      estimatedDistanceKm: 5.8,
      estimatedDurationMinutes: 16,
      paymentMethod: 'MOBILE_MONEY',
      pickupAreaType: 'URBAN_CORE',
    });

    expect(pricingService.quote).toHaveBeenCalledWith(
      expect.objectContaining({
        distanceKm: 5.8,
        durationMinutes: 16,
      }),
    );
    expect(result.routeMetricsSource).toBe('CLIENT_ESTIMATE');
  });

  it('rejects incompatible vehicle type and service tier combinations', async () => {
    const { prisma, service } = createService();

    prisma.rideRequest.findFirst.mockResolvedValue(null);
    prisma.trip.findFirst.mockResolvedValue(null);

    await expect(
      service.create({
        riderId: 'rider-1',
        pickupAddress: 'Universite Joseph Ki-Zerbo',
        destinationAddress: 'Ouaga 2000',
        requestedVehicleType: 'MOTORCYCLE',
        requestedServiceTier: 'CAR_COMFORT',
        estimatedDistanceKm: 5.8,
        estimatedDurationMinutes: 16,
        paymentMethod: 'MOBILE_MONEY',
        pickupAreaType: 'URBAN_CORE',
      }),
    ).rejects.toThrow(
      'The requested service tier is not compatible with the selected vehicle type.',
    );
  });

  it('rejects partial pickup coordinates', async () => {
    const { prisma, service } = createService();

    prisma.rideRequest.findFirst.mockResolvedValue(null);
    prisma.trip.findFirst.mockResolvedValue(null);

    await expect(
      service.create({
        riderId: 'rider-1',
        pickupAddress: 'Universite Joseph Ki-Zerbo',
        pickupLatitude: 12.3714,
        destinationAddress: 'Ouaga 2000',
        requestedVehicleType: 'MOTORCYCLE',
        requestedServiceTier: 'MOTO_STANDARD',
        estimatedDistanceKm: 5.8,
        estimatedDurationMinutes: 16,
        paymentMethod: 'MOBILE_MONEY',
        pickupAreaType: 'URBAN_CORE',
      }),
    ).rejects.toThrow(
      'Pickup latitude and longitude must be provided together.',
    );
  });

  it('cancels a requested ride for the authenticated rider', async () => {
    const { prisma, realtimeService, service } = createService();

    prisma.rideRequest.findUnique.mockResolvedValue({
      id: 'request-1',
      riderId: 'rider-1',
      status: 'REQUESTED',
      pickupAddress: 'Universite Joseph Ki-Zerbo',
      destinationAddress: 'Ouaga 2000',
      trip: null,
    });
    prisma.rideRequest.update.mockResolvedValue({
      id: 'request-1',
      riderId: 'rider-1',
      status: 'CANCELLED',
      pickupAddress: 'Universite Joseph Ki-Zerbo',
      destinationAddress: 'Ouaga 2000',
      updatedAt: new Date('2026-04-17T10:00:00.000Z'),
    });

    const result = await service.cancel(
      {
        user: {
          role: 'RIDER',
          riderProfile: {
            id: 'rider-1',
          },
        },
      } as never,
      'request-1',
    );

    expect(prisma.rideRequest.update).toHaveBeenCalledWith({
      where: { id: 'request-1' },
      data: { status: 'CANCELLED' },
    });
    expect(realtimeService.publish).toHaveBeenCalledWith({
      channel: 'ride-request',
      type: 'ride-request.cancelled',
      entityId: 'request-1',
      riderId: 'rider-1',
      actorRole: 'RIDER',
      payload: {
        status: 'CANCELLED',
      },
    });
    expect(result.rideRequest.status).toBe('CANCELLED');
  });

  it('does not reveal or cancel another rider ride request', async () => {
    const { prisma, realtimeService, service } = createService();

    prisma.rideRequest.findUnique.mockResolvedValue({
      id: 'request-1',
      riderId: 'rider-2',
      status: 'REQUESTED',
      trip: null,
    });

    await expect(
      service.cancel(
        {
          user: {
            role: 'RIDER',
            riderProfile: {
              id: 'rider-1',
            },
          },
        } as never,
        'request-1',
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.rideRequest.update).not.toHaveBeenCalled();
    expect(realtimeService.publish).not.toHaveBeenCalled();
  });

  it('rejects ride requests when the rider already has an active trip', async () => {
    const { prisma, service } = createService();

    prisma.rideRequest.findFirst.mockResolvedValue(null);
    prisma.trip.findFirst.mockResolvedValue({
      id: 'trip-active-1',
    });

    await expect(
      service.create({
        riderId: 'rider-1',
        pickupAddress: 'Universite Joseph Ki-Zerbo',
        destinationAddress: 'Ouaga 2000',
        requestedVehicleType: 'MOTORCYCLE',
        requestedServiceTier: 'MOTO_STANDARD',
        estimatedDistanceKm: 5.8,
        estimatedDurationMinutes: 16,
        paymentMethod: 'MOBILE_MONEY',
        pickupAreaType: 'URBAN_CORE',
      }),
    ).rejects.toThrow('The rider already has an active trip.');
  });

  it('maps active-flow unique constraint races to a user-facing validation error', async () => {
    const { prisma, pricingService, service } = createService();

    pricingService.quote.mockResolvedValue({
      estimatedFare: 1800,
    });
    prisma.rideRequest.findFirst.mockResolvedValue(null);
    prisma.trip.findFirst.mockResolvedValue(null);
    prisma.rideRequest.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );

    await expect(
      service.create({
        riderId: 'rider-1',
        pickupAddress: 'Universite Joseph Ki-Zerbo',
        destinationAddress: 'Ouaga 2000',
        requestedVehicleType: 'MOTORCYCLE',
        requestedServiceTier: 'MOTO_STANDARD',
        estimatedDistanceKm: 5.8,
        estimatedDurationMinutes: 16,
        paymentMethod: 'MOBILE_MONEY',
        pickupAreaType: 'URBAN_CORE',
      }),
    ).rejects.toThrow('The rider already has an active ride request or trip.');
  });

  it('triggers proactive dispatch after creating a new ride request', async () => {
    const { prisma, pricingService, dispatchCoordinator, service } =
      createService();

    pricingService.quote.mockResolvedValue({ estimatedFare: 1800 });
    prisma.rideRequest.findFirst.mockResolvedValue(null);
    prisma.trip.findFirst.mockResolvedValue(null);
    prisma.rideRequest.create.mockImplementation(
      async ({ data }: { data: Record<string, unknown> }) => ({
        id: 'request-dispatch-1',
        pickupAddress: 'Gounghin',
        ...data,
      }),
    );

    await service.create({
      riderId: 'rider-1',
      pickupAddress: 'Gounghin',
      destinationAddress: 'Patte d Oie',
      requestedVehicleType: 'MOTORCYCLE',
      requestedServiceTier: 'MOTO_STANDARD',
      estimatedDistanceKm: 3.2,
      estimatedDurationMinutes: 10,
      paymentMethod: 'MOBILE_MONEY',
      pickupAreaType: 'URBAN_CORE',
    });

    // proactiveDispatch est appelé en arrière-plan (void) — on attend la prochaine tick
    await new Promise((resolve) => setImmediate(resolve));

    expect(dispatchCoordinator.proactiveDispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        rideRequestId: 'request-dispatch-1',
        requestedVehicleType: 'MOTORCYCLE',
        requestedServiceTier: 'MOTO_STANDARD',
        pickupAddress: 'Gounghin',
      }),
    );
  });

  it('notifies the assigned driver when proactive dispatch succeeds', async () => {
    const {
      prisma,
      pricingService,
      dispatchCoordinator,
      notificationsService,
      service,
    } = createService();

    pricingService.quote.mockResolvedValue({ estimatedFare: 1800 });
    prisma.rideRequest.findFirst.mockResolvedValue(null);
    prisma.trip.findFirst.mockResolvedValue(null);
    prisma.rideRequest.create.mockImplementation(
      async ({ data }: { data: Record<string, unknown> }) => ({
        id: 'request-dispatch-2',
        pickupAddress: 'Gounghin',
        ...data,
      }),
    );
    dispatchCoordinator.proactiveDispatch.mockResolvedValue({
      dispatched: true,
      assignedDriverId: 'driver-proactive-1',
      assignedUserId: 'user-driver-proactive-1',
    });

    await service.create({
      riderId: 'rider-1',
      pickupAddress: 'Gounghin',
      destinationAddress: 'Patte d Oie',
      requestedVehicleType: 'MOTORCYCLE',
      requestedServiceTier: 'MOTO_STANDARD',
      estimatedDistanceKm: 3.2,
      estimatedDurationMinutes: 10,
      paymentMethod: 'MOBILE_MONEY',
      pickupAreaType: 'URBAN_CORE',
    });

    await new Promise((resolve) => setImmediate(resolve));

    expect(notificationsService.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-driver-proactive-1',
        title: 'Course pour vous !',
        dedupeKey: expect.stringContaining('proactive:request-dispatch-2'),
      }),
    );
  });
});
