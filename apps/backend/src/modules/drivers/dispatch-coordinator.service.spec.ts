import { DriverOfferProjector } from './driver-offer-projector';
import { DispatchCoordinator } from './dispatch-coordinator.service';

describe('DispatchCoordinator.proactiveDispatch', () => {
  function createService() {
    const prisma = {
      systemSetting: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn(),
      },
      driverProfile: {
        findMany: jest.fn(),
        count: jest.fn().mockResolvedValue(5),
        findUnique: jest.fn(),
      },
      trip: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      rideRequest: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn(),
        updateMany: jest.fn(),
      },
      auditLog: {
        create: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    const realtimeService = {
      publish: jest.fn(),
    };

    const pricingService = {
      deriveOperatingContext: jest.fn().mockReturnValue({
        demandLevel: 'NORMAL',
        trafficLevel: 'MODERATE',
        weatherCondition: 'CLEAR',
        roadCondition: 'OPEN',
        supplyPressureLevel: 'BALANCED',
        availabilityScore: 70,
      }),
    };

    const configService = {
      get: jest.fn(),
    };

    const driverOfferProjector = new DriverOfferProjector();
    const coordinator = new DispatchCoordinator(
      prisma as never,
      realtimeService as never,
      pricingService as never,
      configService as never,
      driverOfferProjector,
    );

    return { coordinator, prisma, realtimeService, pricingService };
  }

  const baseInput = {
    rideRequestId: 'req-001',
    requestedVehicleType: 'MOTORCYCLE' as never,
    requestedServiceTier: null,
    estimatedDistanceKm: 5,
    estimatedDurationMinutes: 12,
    pickupLatitude: 12.365,
    pickupLongitude: -1.5345,
    pickupAddress: 'Ouagadougou centre',
    createdAt: new Date('2026-05-23T10:00:00.000Z'),
  };

  function buildDriverProfile(overrides: {
    id: string;
    userId: string;
    vehicleType?: string;
  }) {
    return {
      id: overrides.id,
      userId: overrides.userId,
      status: 'ONLINE',
      verificationStatus: 'APPROVED',
      currentLatitude: 12.3655,
      currentLongitude: -1.535,
      serviceRadiusKm: 10,
      vehicles: [
        {
          id: `vehicle-${overrides.id}`,
          type: overrides.vehicleType ?? 'MOTORCYCLE',
          tier: 'MOTO_STANDARD',
          isActive: true,
        },
      ],
    };
  }

  it('returns dispatched:false and skips audit when no ONLINE driver is found', async () => {
    const { coordinator, prisma } = createService();

    prisma.driverProfile.findMany.mockResolvedValue([]);

    const result = await coordinator.proactiveDispatch(baseInput);

    expect(result).toEqual({
      dispatched: false,
      assignedDriverId: null,
      assignedUserId: null,
    });
    // recordDispatchAuditEvent receives userId:null → returns early without writing
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
    expect(prisma.rideRequest.updateMany).not.toHaveBeenCalled();
  });

  it('excludes a driver that has an active trip and returns dispatched:false', async () => {
    const { coordinator, prisma } = createService();
    const busyDriver = buildDriverProfile({
      id: 'driver-busy',
      userId: 'user-busy',
    });

    prisma.driverProfile.findMany.mockResolvedValue([busyDriver]);
    // The driver has an active trip → is in busyDriverIds
    prisma.trip.findMany.mockResolvedValue([{ driverId: 'driver-busy' }]);

    const result = await coordinator.proactiveDispatch(baseInput);

    expect(result).toEqual({
      dispatched: false,
      assignedDriverId: null,
      assignedUserId: null,
    });
    // scored array is empty after busy exclusion → DISPATCH_PROACTIVE_NO_CANDIDATE
    // but userId is null in that branch so no audit row is written
    expect(prisma.rideRequest.updateMany).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it('assigns the best available driver and records DISPATCH_PROACTIVE_ASSIGNMENT', async () => {
    const { coordinator, prisma, realtimeService } = createService();
    const bestDriver = buildDriverProfile({
      id: 'driver-best',
      userId: 'user-best',
    });

    prisma.driverProfile.findMany.mockResolvedValue([bestDriver]);
    prisma.trip.findMany.mockResolvedValue([]);
    prisma.rideRequest.updateMany.mockResolvedValue({ count: 1 });

    const result = await coordinator.proactiveDispatch(baseInput);

    expect(result).toEqual({
      dispatched: true,
      assignedDriverId: 'driver-best',
      assignedUserId: 'user-best',
    });
    expect(prisma.rideRequest.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'req-001',
          assignedDriverId: null,
        }),
        data: expect.objectContaining({
          assignedDriverId: 'driver-best',
        }),
      }),
    );
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'user-best',
          action: 'DISPATCH_PROACTIVE_ASSIGNMENT',
          entityId: 'req-001',
        }),
      }),
    );
    expect(realtimeService.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'ride-request.created',
        entityId: 'req-001',
        payload: expect.objectContaining({
          proactiveAssignment: true,
          assignedDriverId: 'driver-best',
        }),
      }),
    );
  });

  it('returns dispatched:false when concurrent claim fails (updateMany count:0)', async () => {
    const { coordinator, prisma, realtimeService } = createService();
    const driver = buildDriverProfile({
      id: 'driver-claimed',
      userId: 'user-claimed',
    });

    prisma.driverProfile.findMany.mockResolvedValue([driver]);
    prisma.trip.findMany.mockResolvedValue([]);
    // Another process already claimed the slot
    prisma.rideRequest.updateMany.mockResolvedValue({ count: 0 });

    const result = await coordinator.proactiveDispatch(baseInput);

    expect(result).toEqual({
      dispatched: false,
      assignedDriverId: null,
      assignedUserId: null,
    });
    // No audit and no realtime event when claim is lost
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
    expect(realtimeService.publish).not.toHaveBeenCalled();
  });
});
