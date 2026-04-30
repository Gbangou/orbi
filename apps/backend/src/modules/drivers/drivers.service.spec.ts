import { DispatchCoordinator } from './dispatch-coordinator.service';
import { DriverOfferProjector } from './driver-offer-projector';
import { DriversService } from './drivers.service';

describe('DriversService', () => {
  function createService() {
    const prisma = {
      driverProfile: {
        findUnique: jest.fn(),
        update: jest.fn(),
        count: jest.fn().mockResolvedValue(6),
      },
      rideRequest: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn(),
        updateMany: jest.fn(),
      },
      trip: {
        findFirst: jest.fn(),
      },
      user: {
        update: jest.fn(),
      },
      vehicle: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      driverDocument: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      driverOnboardingReview: {
        create: jest.fn(),
      },
      auditLog: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
      systemSetting: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn(),
      },
    };
    const documentLinksService = {
      createUploadLink: jest.fn(),
    };
    const featureFlagsService = {
      isEnabled: jest.fn().mockReturnValue(true),
    };
    const realtimeService = {
      publish: jest.fn(),
    };
    const pricingService = {
      deriveOperatingContext: jest.fn(() => ({
        demandLevel: 'HIGH',
        trafficLevel: 'HEAVY',
        weatherCondition: 'CLEAR',
        roadCondition: 'CONGESTED',
        supplyPressureLevel: 'BALANCED',
        availabilityScore: 74,
      })),
    };
    const configService = {
      get: jest.fn(),
    };
    const driverOfferProjector = new DriverOfferProjector();
    const dispatchCoordinator = new DispatchCoordinator(
      prisma as never,
      realtimeService as never,
      pricingService as never,
      configService as never,
      driverOfferProjector as never,
    );

    return {
      prisma,
      documentLinksService,
      featureFlagsService,
      realtimeService,
      pricingService,
      configService,
      driverOfferProjector,
      dispatchCoordinator,
      service: new DriversService(
        prisma as never,
        documentLinksService as never,
        featureFlagsService as never,
        dispatchCoordinator as never,
      ),
    };
  }

  it('returns only offers compatible with active driver vehicles', async () => {
    const { prisma, realtimeService, pricingService, service } =
      createService();

    prisma.driverProfile.findUnique.mockResolvedValue({
      id: 'driver-1',
      userId: 'user-driver-1',
      status: 'ONLINE',
      verificationStatus: 'APPROVED',
      currentLatitude: 12.36,
      currentLongitude: -1.54,
      serviceRadiusKm: 8,
      vehicles: [
        {
          id: 'vehicle-1',
          type: 'MOTORCYCLE',
          tier: 'MOTO_STANDARD',
          isActive: true,
        },
      ],
    });
    prisma.rideRequest.findMany
      .mockResolvedValueOnce([
        {
          id: 'expired-request',
          riderId: 'rider-expired',
          assignedDriverId: 'driver-2',
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 'request-1',
          riderId: 'rider-1',
          pickupAddress: 'Patte d Oie',
          destinationAddress: 'Ouaga 2000',
          requestedVehicleType: 'MOTORCYCLE',
          requestedServiceTier: 'MOTO_STANDARD',
          pickupLatitude: 12.364,
          pickupLongitude: -1.548,
          estimatedFare: 1800,
          estimatedDistanceKm: 4.2,
          createdAt: new Date('2026-04-18T08:00:00.000Z'),
          rider: {
            user: {
              fullName: 'Awa Rider',
            },
          },
        },
      ]);
    prisma.rideRequest.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 1 });

    const result = await service.getOffers({
      user: {
        id: 'user-driver-1',
        driverProfile: {
          id: 'driver-1',
        },
      },
    } as never);

    expect(prisma.rideRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          requestedVehicleType: {
            in: ['MOTORCYCLE'],
          },
        }),
      }),
    );
    expect(prisma.rideRequest.updateMany).toHaveBeenCalled();
    expect(realtimeService.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: 'ride-request',
        type: 'ride-request.reservation-expired',
        entityId: 'expired-request',
      }),
    );
    expect(realtimeService.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: 'ride-request',
        type: 'ride-request.reservation-assigned',
        entityId: 'request-1',
      }),
    );
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'user-driver-1',
        action: 'DISPATCH_RESERVATION_ASSIGNED',
        entityType: 'RIDE_REQUEST',
        entityId: 'request-1',
      }),
    });
    expect(result).toEqual([
      expect.objectContaining({
        id: 'request-1',
        riderName: 'Awa Rider',
        category: 'motorcycle',
        driverPayout: Math.round(1800 * 0.82),
        matchedTier: 'MOTO_STANDARD',
        dispatchContextSummary: 'HIGH - HEAVY - dispo 74/100',
        dispatchScore: expect.any(Number),
        offerConfidenceScore: expect.any(Number),
        offerConfidenceLabel: expect.any(String),
        reservationWindowSeconds: expect.any(Number),
        dispatchLearningSummary: expect.any(String),
        pickupDistanceSource: 'DRIVER_AND_PICKUP_COORDINATES',
        reservationExpiresAt: expect.any(String),
      }),
    ]);
    expect(pricingService.deriveOperatingContext).toHaveBeenCalled();
  });

  it('prioritizes nearby compatible requests and filters outside the service radius', async () => {
    const { prisma, service } = createService();

    prisma.driverProfile.findUnique.mockResolvedValue({
      id: 'driver-1',
      status: 'ONLINE',
      verificationStatus: 'APPROVED',
      currentLatitude: 12.36,
      currentLongitude: -1.54,
      serviceRadiusKm: 5,
      vehicles: [
        {
          id: 'vehicle-1',
          type: 'MOTORCYCLE',
          tier: 'MOTO_STANDARD',
          isActive: true,
        },
      ],
    });
    prisma.rideRequest.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: 'request-far',
          riderId: 'rider-far',
          pickupAddress: 'Saaba',
          destinationAddress: 'Centre ville',
          requestedVehicleType: 'MOTORCYCLE',
          requestedServiceTier: 'MOTO_STANDARD',
          pickupLatitude: 12.25,
          pickupLongitude: -1.45,
          estimatedFare: 2400,
          estimatedDistanceKm: 9,
          createdAt: new Date('2026-04-18T07:58:00.000Z'),
          rider: {
            user: {
              fullName: 'Far Rider',
            },
          },
        },
        {
          id: 'request-near',
          riderId: 'rider-near',
          pickupAddress: 'Koulouba',
          destinationAddress: 'Ouaga 2000',
          requestedVehicleType: 'MOTORCYCLE',
          requestedServiceTier: 'MOTO_STANDARD',
          pickupLatitude: 12.361,
          pickupLongitude: -1.541,
          estimatedFare: 1500,
          estimatedDistanceKm: 3.2,
          createdAt: new Date('2026-04-18T08:01:00.000Z'),
          rider: {
            user: {
              fullName: 'Near Rider',
            },
          },
        },
      ]);
    prisma.rideRequest.updateMany.mockResolvedValue({ count: 1 });

    const result = await service.getOffers({
      user: {
        driverProfile: {
          id: 'driver-1',
        },
      },
    } as never);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(
      expect.objectContaining({
        id: 'request-near',
        pickupDistanceKm: expect.any(Number),
      }),
    );
  });

  it('returns no offers when the driver is offline', async () => {
    const { prisma, service } = createService();

    prisma.driverProfile.findUnique.mockResolvedValue({
      id: 'driver-1',
      status: 'OFFLINE',
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

    const result = await service.getOffers({
      user: {
        driverProfile: {
          id: 'driver-1',
        },
      },
    } as never);

    expect(result).toEqual([]);
    expect(prisma.rideRequest.findMany).toHaveBeenCalledTimes(1);
  });

  it('marks pickup distance source as fallback when coordinates are unavailable', async () => {
    const { prisma, service } = createService();

    prisma.driverProfile.findUnique.mockResolvedValue({
      id: 'driver-1',
      status: 'ONLINE',
      verificationStatus: 'APPROVED',
      currentLatitude: null,
      currentLongitude: null,
      serviceRadiusKm: 8,
      vehicles: [
        {
          id: 'vehicle-1',
          type: 'MOTORCYCLE',
          tier: 'MOTO_STANDARD',
          isActive: true,
        },
      ],
    });
    prisma.rideRequest.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: 'request-1',
          riderId: 'rider-1',
          pickupAddress: 'Patte d Oie',
          destinationAddress: 'Ouaga 2000',
          requestedVehicleType: 'MOTORCYCLE',
          requestedServiceTier: 'MOTO_STANDARD',
          pickupLatitude: null,
          pickupLongitude: null,
          estimatedFare: 1800,
          estimatedDistanceKm: 4.2,
          createdAt: new Date('2026-04-18T08:00:00.000Z'),
          rider: {
            user: {
              fullName: 'Awa Rider',
            },
          },
        },
      ]);
    prisma.rideRequest.updateMany.mockResolvedValue({ count: 1 });

    const result = await service.getOffers({
      user: {
        driverProfile: {
          id: 'driver-1',
        },
      },
    } as never);

    expect(result[0]).toEqual(
      expect.objectContaining({
        pickupDistanceKm: null,
        pickupDistanceSource: 'DISPATCH_FALLBACK',
        reservationExpiresAt: expect.any(String),
      }),
    );
  });

  it('updates driver availability to online when the profile is approved and has an active vehicle', async () => {
    const { prisma, service } = createService();

    prisma.driverProfile.findUnique.mockResolvedValue({
      id: 'driver-1',
      status: 'OFFLINE',
      verificationStatus: 'APPROVED',
      vehicles: [
        {
          id: 'vehicle-1',
          isActive: true,
        },
      ],
    });
    prisma.trip.findFirst.mockResolvedValue(null);
    prisma.driverProfile.update.mockResolvedValue({
      id: 'driver-1',
      status: 'ONLINE',
    });
    prisma.auditLog.create.mockResolvedValue(undefined);

    const result = await service.updateAvailability(
      {
        user: {
          id: 'user-1',
          driverProfile: { id: 'driver-1' },
        },
      } as never,
      'ONLINE',
    );

    expect(prisma.driverProfile.update).toHaveBeenCalledWith({
      where: { id: 'driver-1' },
      data: { status: 'ONLINE' },
    });
    expect(result.availability.status).toBe('ONLINE');
  });

  it('rejects going online when the driver is not approved yet', async () => {
    const { prisma, service } = createService();

    prisma.driverProfile.findUnique.mockResolvedValue({
      id: 'driver-1',
      status: 'OFFLINE',
      verificationStatus: 'PENDING',
      vehicles: [
        {
          id: 'vehicle-1',
          isActive: true,
        },
      ],
    });

    await expect(
      service.updateAvailability(
        {
          user: {
            id: 'user-1',
            driverProfile: { id: 'driver-1' },
          },
        } as never,
        'ONLINE',
      ),
    ).rejects.toThrow('Only approved drivers can go online.');
  });

  it('updates driver presence coordinates for later dispatch scoring', async () => {
    const { prisma, service } = createService();

    prisma.driverProfile.findUnique.mockResolvedValue({
      id: 'driver-1',
      status: 'ONLINE',
    });
    prisma.driverProfile.update.mockResolvedValue({
      id: 'driver-1',
      status: 'ONLINE',
      currentLatitude: 12.365,
      currentLongitude: -1.533,
    });

    const result = await service.updatePresence(
      {
        user: {
          id: 'user-1',
          driverProfile: { id: 'driver-1' },
        },
      } as never,
      {
        latitude: 12.365,
        longitude: -1.533,
      },
    );

    expect(prisma.driverProfile.update).toHaveBeenCalledWith({
      where: { id: 'driver-1' },
      data: {
        currentLatitude: 12.365,
        currentLongitude: -1.533,
      },
    });
    expect(result.presence).toEqual({
      driverId: 'driver-1',
      status: 'ONLINE',
      latitude: 12.365,
      longitude: -1.533,
    });
  });

  it('builds an onboarding summary from profile state and latest submission', async () => {
    const { prisma, service } = createService();

    prisma.driverProfile.findUnique
      .mockResolvedValueOnce({
        id: 'driver-1',
        user: {
          id: 'user-1',
          fullName: 'Issa Driver',
          email: 'driver@mobilis.app',
          phoneNumber: '+22670000000',
          isPhoneVerified: true,
        },
        licenseNumber: 'BF-12345',
        verificationStatus: 'PENDING',
        serviceRadiusKm: 8,
        vehicles: [],
      })
      .mockResolvedValueOnce({
        id: 'driver-1',
        user: {
          phoneNumber: '+22670000000',
          isPhoneVerified: true,
        },
        licenseNumber: 'BF-12345',
        verificationStatus: 'PENDING',
        serviceRadiusKm: 8,
        onboardingDocuments: [],
        onboardingReviews: [],
        vehicles: [
          {
            id: 'vehicle-1',
          },
        ],
      });
    prisma.auditLog.findFirst.mockResolvedValue({
      createdAt: new Date('2026-04-17T16:00:00.000Z'),
      metadata: {
        city: 'OUAGADOUGOU',
        documents: {
          identityDocumentProvided: true,
          vehicleRegistrationProvided: true,
          insuranceProofProvided: false,
          selfieMatchProvided: true,
        },
      },
    });

    const result = await service.getOnboarding({
      user: {
        driverProfile: { id: 'driver-1' },
      },
    } as never);

    expect(result.onboarding.city).toBe('OUAGADOUGOU');
    expect(result.onboarding.totalItems).toBe(7);
    expect(result.onboarding.completedItems).toBeGreaterThan(0);
  });

  it('marks expired onboarding documents as expired in the driver summary', async () => {
    const { prisma, service } = createService();

    prisma.driverProfile.findUnique
      .mockResolvedValueOnce({
        id: 'driver-1',
        user: {
          id: 'user-1',
          fullName: 'Issa Driver',
          email: 'driver@mobilis.app',
          phoneNumber: '+22670000000',
          isPhoneVerified: true,
        },
        licenseNumber: 'BF-12345',
        verificationStatus: 'PENDING',
        serviceRadiusKm: 8,
        vehicles: [],
      })
      .mockResolvedValueOnce({
        id: 'driver-1',
        user: {
          phoneNumber: '+22670000000',
          isPhoneVerified: true,
        },
        licenseNumber: 'BF-12345',
        verificationStatus: 'PENDING',
        serviceRadiusKm: 8,
        onboardingDocuments: [
          {
            id: 'doc-license',
            type: 'DRIVER_LICENSE',
            status: 'APPROVED',
            fileName: 'license.pdf',
            uploadedAt: new Date('2026-04-17T16:09:00.000Z'),
            expiresAt: new Date('2026-04-01T00:00:00.000Z'),
            reviewedAt: null,
            rejectionReason: null,
          },
        ],
        onboardingReviews: [],
        vehicles: [
          {
            id: 'vehicle-1',
          },
        ],
      });
    prisma.auditLog.findFirst.mockResolvedValue({
      createdAt: new Date('2026-04-17T16:00:00.000Z'),
      metadata: {
        city: 'OUAGADOUGOU',
        documents: {
          driverLicenseProvided: true,
        },
      },
    });

    const result = await service.getOnboarding({
      user: {
        driverProfile: { id: 'driver-1' },
      },
    } as never);

    expect(
      result.onboarding.documents.find((item) => item.type === 'DRIVER_LICENSE')
        ?.status,
    ).toBe('EXPIRED');
    expect(
      result.onboarding.checklist.find((item) => item.id === 'license')
        ?.completed,
    ).toBe(false);
  });

  it('submits onboarding data and writes an audit trail', async () => {
    const { prisma, service } = createService();

    prisma.driverProfile.findUnique
      .mockResolvedValueOnce({
        id: 'driver-1',
        status: 'ONLINE',
        user: {
          id: 'user-1',
          phoneNumber: null,
          isPhoneVerified: false,
          fullName: 'Issa Driver',
          email: 'driver@mobilis.app',
        },
        vehicles: [],
      })
      .mockResolvedValueOnce({
        id: 'driver-1',
        user: {
          phoneNumber: '+22670000000',
          isPhoneVerified: false,
        },
        licenseNumber: 'BF-12345',
        verificationStatus: 'PENDING',
        serviceRadiusKm: 10,
        onboardingDocuments: [
          {
            id: 'doc-1',
            type: 'IDENTITY_DOCUMENT',
            status: 'PENDING',
            fileName: 'id-card.pdf',
            uploadedAt: new Date('2026-04-17T16:09:00.000Z'),
            expiresAt: null,
            reviewedAt: null,
            rejectionReason: null,
          },
          {
            id: 'doc-2',
            type: 'DRIVER_LICENSE',
            status: 'PENDING',
            fileName: 'license.pdf',
            uploadedAt: new Date('2026-04-17T16:09:00.000Z'),
            expiresAt: null,
            reviewedAt: null,
            rejectionReason: null,
          },
        ],
        onboardingReviews: [
          {
            id: 'review-1',
            status: 'SUBMITTED',
            decisionReason: null,
            createdAt: new Date('2026-04-17T16:10:00.000Z'),
            actor: {
              fullName: 'Issa Driver',
            },
          },
        ],
        vehicles: [
          {
            id: 'vehicle-1',
          },
        ],
      });
    prisma.user.update.mockResolvedValue(undefined);
    prisma.driverProfile.update.mockResolvedValue(undefined);
    prisma.vehicle.findUnique.mockResolvedValue(null);
    prisma.vehicle.create.mockResolvedValue(undefined);
    prisma.driverDocument.findUnique.mockResolvedValue(null);
    prisma.driverDocument.create.mockResolvedValue(undefined);
    prisma.driverOnboardingReview.create.mockResolvedValue(undefined);
    prisma.auditLog.create.mockResolvedValue(undefined);
    prisma.auditLog.findFirst.mockResolvedValue({
      createdAt: new Date('2026-04-17T16:10:00.000Z'),
      metadata: {
        city: 'BOBO_DIOULASSO',
        documents: {
          identityDocumentProvided: true,
          driverLicenseProvided: true,
          vehicleRegistrationProvided: true,
          insuranceProofProvided: true,
          selfieMatchProvided: true,
        },
      },
    });

    const result = await service.upsertOnboarding(
      {
        user: {
          id: 'user-1',
          driverProfile: { id: 'driver-1' },
        },
      } as never,
      {
        phoneNumber: '+22670000000',
        licenseNumber: 'BF-12345',
        city: 'BOBO_DIOULASSO',
        serviceRadiusKm: 10,
        documents: {
          identityDocumentProvided: true,
          driverLicenseProvided: true,
          vehicleRegistrationProvided: true,
          insuranceProofProvided: true,
          selfieMatchProvided: true,
        },
        documentArtifacts: [
          {
            type: 'IDENTITY_DOCUMENT',
            fileName: 'id-card.pdf',
            storageKey: 'driver-1/identity/id-card.pdf',
          },
          {
            type: 'DRIVER_LICENSE',
            fileName: 'license.pdf',
            storageKey: 'driver-1/license/license.pdf',
          },
        ],
        vehicles: [
          {
            plateNumber: '11 jd 9021',
            make: 'Toyota',
            model: 'Corolla',
            color: 'White',
            type: 'CAR',
            tier: 'CAR_STANDARD',
          },
        ],
      },
    );

    expect(prisma.driverProfile.update).toHaveBeenCalledWith({
      where: { id: 'driver-1' },
      data: expect.objectContaining({
        licenseNumber: 'BF-12345',
        verificationStatus: 'PENDING',
        status: 'OFFLINE',
      }),
    });
    expect(prisma.vehicle.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        driverId: 'driver-1',
        plateNumber: '11 JD 9021',
      }),
    });
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'DRIVER_ONBOARDING_SUBMITTED',
        entityType: 'DRIVER_PROFILE',
        entityId: 'driver-1',
      }),
    });
    expect(prisma.driverDocument.create).toHaveBeenCalledTimes(2);
    expect(prisma.driverOnboardingReview.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        driverProfileId: 'driver-1',
        status: 'SUBMITTED',
        actorUserId: 'user-1',
      }),
    });
    expect(result.onboarding.city).toBe('BOBO_DIOULASSO');
    expect(
      result.onboarding.checklist.find((item) => item.id === 'phone')
        ?.completed,
    ).toBe(false);
    expect(result.onboarding.reviewStatus).toBe('SUBMITTED');
  });

  it('rejects onboarding when a vehicle plate already belongs to another driver', async () => {
    const { prisma, service } = createService();

    prisma.driverProfile.findUnique.mockResolvedValue({
      id: 'driver-1',
      status: 'OFFLINE',
      user: {
        id: 'user-1',
        phoneNumber: '+22670000000',
        isPhoneVerified: true,
        fullName: 'Issa Driver',
        email: 'driver@mobilis.app',
      },
      vehicles: [],
    });
    prisma.user.update.mockResolvedValue(undefined);
    prisma.driverProfile.update.mockResolvedValue(undefined);
    prisma.vehicle.findUnique.mockResolvedValue({
      id: 'vehicle-999',
      driverId: 'driver-2',
      plateNumber: '11 JD 9021',
    });
    prisma.driverDocument.findUnique.mockResolvedValue(null);

    await expect(
      service.upsertOnboarding(
        {
          user: {
            id: 'user-1',
            driverProfile: { id: 'driver-1' },
          },
        } as never,
        {
          phoneNumber: '+22670000000',
          licenseNumber: 'BF-12345',
          city: 'OUAGADOUGOU',
          serviceRadiusKm: 8,
          documents: {
            identityDocumentProvided: true,
            driverLicenseProvided: true,
            vehicleRegistrationProvided: true,
            insuranceProofProvided: true,
            selfieMatchProvided: true,
          },
          vehicles: [
            {
              plateNumber: '11 jd 9021',
              make: 'Toyota',
              model: 'Corolla',
              color: 'White',
              type: 'CAR',
              tier: 'CAR_STANDARD',
            },
          ],
        },
      ),
    ).rejects.toThrow(
      'Vehicle 11 JD 9021 is already assigned to another driver profile.',
    );
  });

  it('creates signed upload links for driver documents', async () => {
    const { prisma, documentLinksService, service } = createService();

    prisma.driverProfile.findUnique.mockResolvedValue({
      id: 'driver-1',
      user: {
        id: 'user-1',
        phoneNumber: '+22670000000',
        isPhoneVerified: true,
        fullName: 'Issa Driver',
        email: 'driver@mobilis.app',
      },
      vehicles: [],
    });
    documentLinksService.createUploadLink.mockReturnValue({
      storageKey: 'driver-1/identity/key.pdf',
      expiresAt: '2026-04-18T10:00:00.000Z',
      uploadUrl: 'https://storage.mobilis.local/upload/example',
      method: 'PUT',
      headers: {
        'content-type': 'application/pdf',
      },
    });

    const result = await service.createDocumentUploadLinks(
      {
        user: {
          driverProfile: { id: 'driver-1' },
        },
      } as never,
      {
        documents: [
          {
            type: 'IDENTITY_DOCUMENT',
            fileName: 'identity.pdf',
            mimeType: 'application/pdf',
          },
        ],
      },
    );

    expect(documentLinksService.createUploadLink).toHaveBeenCalledWith({
      driverProfileId: 'driver-1',
      documentType: 'IDENTITY_DOCUMENT',
      fileName: 'identity.pdf',
      mimeType: 'application/pdf',
      expiresAt: undefined,
    });
    expect(result.links).toHaveLength(1);
  });

  it('keeps an existing unexpired reservation instead of extending it again', async () => {
    const { prisma, realtimeService, service } = createService();
    const existingExpiry = new Date(Date.now() + 20_000).toISOString();

    prisma.driverProfile.findUnique.mockResolvedValue({
      id: 'driver-1',
      status: 'ONLINE',
      verificationStatus: 'APPROVED',
      currentLatitude: 12.36,
      currentLongitude: -1.54,
      serviceRadiusKm: 8,
      vehicles: [
        {
          id: 'vehicle-1',
          type: 'MOTORCYCLE',
          tier: 'MOTO_STANDARD',
          isActive: true,
        },
      ],
    });
    prisma.rideRequest.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: 'request-1',
          riderId: 'rider-1',
          assignedDriverId: 'driver-1',
          assignmentExpiresAt: new Date(existingExpiry),
          pickupAddress: 'Patte d Oie',
          destinationAddress: 'Ouaga 2000',
          requestedVehicleType: 'MOTORCYCLE',
          requestedServiceTier: 'MOTO_STANDARD',
          pickupLatitude: 12.364,
          pickupLongitude: -1.548,
          estimatedFare: 1800,
          estimatedDistanceKm: 4.2,
          createdAt: new Date('2026-04-18T08:00:00.000Z'),
          rider: {
            user: {
              fullName: 'Awa Rider',
            },
          },
        },
      ]);

    const result = await service.getOffers({
      user: {
        driverProfile: {
          id: 'driver-1',
        },
      },
    } as never);

    expect(prisma.rideRequest.updateMany).not.toHaveBeenCalled();
    expect(realtimeService.publish).not.toHaveBeenCalled();
    expect(result[0]?.reservationExpiresAt).toBe(existingExpiry);
  });

  it('releases reserved offers when the driver goes offline', async () => {
    const { prisma, realtimeService, service } = createService();

    prisma.driverProfile.findUnique.mockResolvedValue({
      id: 'driver-1',
      status: 'ONLINE',
      verificationStatus: 'APPROVED',
      vehicles: [
        {
          id: 'vehicle-1',
          isActive: true,
        },
      ],
    });
    prisma.trip.findFirst.mockResolvedValue(null);
    prisma.rideRequest.findMany.mockResolvedValue([
      {
        id: 'request-1',
        riderId: 'rider-1',
      },
    ]);
    prisma.rideRequest.updateMany.mockResolvedValue({ count: 1 });
    prisma.driverProfile.update.mockResolvedValue({
      id: 'driver-1',
      status: 'OFFLINE',
    });
    prisma.auditLog.create.mockResolvedValue(undefined);

    const result = await service.updateAvailability(
      {
        user: {
          id: 'user-1',
          driverProfile: { id: 'driver-1' },
        },
      } as never,
      'OFFLINE',
    );

    expect(prisma.rideRequest.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'request-1',
        assignedDriverId: 'driver-1',
        assignmentExpiresAt: {
          gt: expect.any(Date),
        },
      },
      data: {
        assignedDriverId: null,
        assignmentExpiresAt: null,
      },
    });
    expect(realtimeService.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: 'ride-request',
        type: 'ride-request.reservation-released',
        entityId: 'request-1',
      }),
    );
    expect(result.availability.status).toBe('OFFLINE');
  });

  it('counts only reservations effectively released during expiry sweeps', async () => {
    const { prisma, realtimeService, service } = createService();

    prisma.rideRequest.findMany.mockResolvedValue([
      {
        id: 'request-1',
        riderId: 'rider-1',
        assignedDriverId: 'driver-1',
      },
      {
        id: 'request-2',
        riderId: 'rider-2',
        assignedDriverId: 'driver-2',
      },
    ]);
    prisma.rideRequest.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });

    const result = await service.expireStaleReservations(
      new Date('2026-04-18T22:00:00.000Z'),
    );

    expect(result).toBe(1);
    expect(realtimeService.publish).toHaveBeenCalledTimes(1);
    expect(realtimeService.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'ride-request.reservation-expired',
        entityId: 'request-1',
      }),
    );
  });

  it('uses a longer reservation window for higher confidence offers', async () => {
    const { prisma, service } = createService();

    prisma.driverProfile.findUnique.mockResolvedValue({
      id: 'driver-1',
      status: 'ONLINE',
      verificationStatus: 'APPROVED',
      currentLatitude: 12.36,
      currentLongitude: -1.54,
      serviceRadiusKm: 10,
      vehicles: [
        {
          id: 'vehicle-1',
          type: 'MOTORCYCLE',
          tier: 'MOTO_STANDARD',
          isActive: true,
        },
      ],
    });
    prisma.rideRequest.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: 'request-strong',
          riderId: 'rider-1',
          pickupAddress: 'Koulouba',
          destinationAddress: 'Ouaga 2000',
          requestedVehicleType: 'MOTORCYCLE',
          requestedServiceTier: 'MOTO_STANDARD',
          pickupLatitude: 12.361,
          pickupLongitude: -1.541,
          estimatedFare: 1800,
          estimatedDistanceKm: 3.2,
          estimatedDurationMinutes: 9,
          createdAt: new Date(Date.now() - 60_000),
          rider: {
            user: {
              fullName: 'Near Rider',
            },
          },
        },
        {
          id: 'request-weaker',
          riderId: 'rider-2',
          pickupAddress: 'Saaba',
          destinationAddress: 'Centre ville',
          requestedVehicleType: 'MOTORCYCLE',
          requestedServiceTier: 'MOTO_STANDARD',
          pickupLatitude: 12.32,
          pickupLongitude: -1.49,
          estimatedFare: 1600,
          estimatedDistanceKm: 8.5,
          estimatedDurationMinutes: 28,
          createdAt: new Date(Date.now() - 6 * 60_000),
          rider: {
            user: {
              fullName: 'Far Rider',
            },
          },
        },
      ]);
    prisma.rideRequest.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 1 });

    const result = await service.getOffers({
      user: {
        driverProfile: {
          id: 'driver-1',
        },
      },
    } as never);

    expect(result).toHaveLength(2);
    expect(result[0]?.offerConfidenceScore).toBeGreaterThan(
      result[1]?.offerConfidenceScore ?? 0,
    );
    expect(result[0]?.reservationWindowSeconds).toBeGreaterThan(
      result[1]?.reservationWindowSeconds ?? 0,
    );
  });

  it('excludes recently declined offers from the next dispatch fetch', async () => {
    const { prisma, service } = createService();

    prisma.driverProfile.findUnique.mockResolvedValue({
      id: 'driver-1',
      userId: 'user-driver-1',
      status: 'ONLINE',
      verificationStatus: 'APPROVED',
      currentLatitude: 12.36,
      currentLongitude: -1.54,
      serviceRadiusKm: 8,
      vehicles: [
        {
          id: 'vehicle-1',
          type: 'MOTORCYCLE',
          tier: 'MOTO_STANDARD',
          isActive: true,
        },
      ],
    });
    prisma.auditLog.findMany
      .mockResolvedValueOnce([
        {
          action: 'DISPATCH_RESERVATION_DECLINED',
          createdAt: new Date(),
        },
      ])
      .mockResolvedValueOnce([
        {
          entityId: 'request-declined',
        },
      ]);
    prisma.rideRequest.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: 'request-fresh',
          riderId: 'rider-1',
          pickupAddress: 'Patte d Oie',
          destinationAddress: 'Ouaga 2000',
          requestedVehicleType: 'MOTORCYCLE',
          requestedServiceTier: 'MOTO_STANDARD',
          pickupLatitude: 12.364,
          pickupLongitude: -1.548,
          estimatedFare: 1800,
          estimatedDistanceKm: 4.2,
          estimatedDurationMinutes: 11,
          createdAt: new Date(),
          rider: {
            user: {
              fullName: 'Awa Rider',
            },
          },
        },
      ]);
    prisma.rideRequest.updateMany.mockResolvedValueOnce({ count: 1 });

    await service.getOffers({
      user: {
        id: 'user-driver-1',
        driverProfile: {
          id: 'driver-1',
        },
      },
    } as never);

    expect(prisma.rideRequest.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([
            expect.objectContaining({
              id: {
                notIn: ['request-declined'],
              },
            }),
          ]),
        }),
      }),
    );
  });

  it('declines a reserved offer and records an explicit dispatch event', async () => {
    const { prisma, realtimeService, service } = createService();

    prisma.driverProfile.findUnique.mockResolvedValueOnce({
      id: 'driver-1',
      userId: 'user-driver-1',
      status: 'ONLINE',
    });
    prisma.rideRequest.findUnique.mockResolvedValue({
      id: 'request-1',
      riderId: 'rider-1',
      status: 'REQUESTED',
      assignedDriverId: 'driver-1',
      assignmentExpiresAt: new Date(Date.now() + 60_000),
    });
    prisma.rideRequest.updateMany.mockResolvedValue({ count: 1 });
    prisma.auditLog.create.mockResolvedValue(undefined);

    const result = await service.declineOffer(
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

    expect(prisma.rideRequest.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'request-1',
          assignedDriverId: 'driver-1',
        }),
        data: {
          assignedDriverId: null,
          assignmentExpiresAt: null,
        },
      }),
    );
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'user-driver-1',
        action: 'DISPATCH_RESERVATION_DECLINED',
        entityType: 'RIDE_REQUEST',
        entityId: 'request-1',
      }),
    });
    expect(realtimeService.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: 'ride-request',
        type: 'ride-request.reservation-released',
        entityId: 'request-1',
        payload: expect.objectContaining({
          reason: 'DRIVER_DECLINED',
        }),
      }),
    );
    expect(result).toEqual({
      offer: {
        rideRequestId: 'request-1',
        status: 'DECLINED',
      },
    });
  });

  it('applies and resets persisted dispatch learning overrides', async () => {
    const { prisma, service } = createService();

    prisma.systemSetting.upsert
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined);

    const updated = await service.updateDispatchLearningSettings({
      lookbackHours: 96,
      halfLifeHours: 24,
      declineCooldownMinutes: 30,
      historyLimit: 60,
      actor: {
        id: 'ops-1',
        name: 'Ops Mobilis',
        role: 'OPS',
      },
    });

    expect(updated).toEqual(
      expect.objectContaining({
        lookbackHours: 96,
        halfLifeHours: 24,
        declineCooldownMinutes: 30,
        historyLimit: 60,
        source: 'DATABASE_OVERRIDE',
      }),
    );

    expect(prisma.systemSetting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          key: 'dispatch-learning',
        },
      }),
    );

    const reset = await service.updateDispatchLearningSettings({
      resetToDefaults: true,
      actor: {
        id: 'ops-1',
        name: 'Ops Mobilis',
        role: 'OPS',
      },
    });

    expect(reset).toEqual(
      expect.objectContaining({
        lookbackHours: 72,
        halfLifeHours: 18,
        declineCooldownMinutes: 20,
        historyLimit: 48,
        source: 'DEFAULT',
      }),
    );
  });

  it('surfaces when dispatch memory is based on older signals', async () => {
    const { prisma, service } = createService();

    prisma.driverProfile.findUnique.mockResolvedValue({
      id: 'driver-1',
      userId: 'user-driver-1',
      status: 'ONLINE',
      verificationStatus: 'APPROVED',
      currentLatitude: 12.36,
      currentLongitude: -1.54,
      serviceRadiusKm: 8,
      vehicles: [
        {
          id: 'vehicle-1',
          type: 'MOTORCYCLE',
          tier: 'MOTO_STANDARD',
          isActive: true,
        },
      ],
    });
    prisma.auditLog.findMany
      .mockResolvedValueOnce([
        {
          action: 'DISPATCH_RESERVATION_ASSIGNED',
          createdAt: new Date(Date.now() - 36 * 3_600_000),
        },
        {
          action: 'DISPATCH_RESERVATION_ACCEPTED',
          createdAt: new Date(Date.now() - 36 * 3_600_000),
        },
      ])
      .mockResolvedValueOnce([]);
    prisma.rideRequest.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: 'request-aged-memory',
          riderId: 'rider-1',
          pickupAddress: 'Patte d Oie',
          destinationAddress: 'Ouaga 2000',
          requestedVehicleType: 'MOTORCYCLE',
          requestedServiceTier: 'MOTO_STANDARD',
          pickupLatitude: 12.364,
          pickupLongitude: -1.548,
          estimatedFare: 1800,
          estimatedDistanceKm: 4.2,
          estimatedDurationMinutes: 11,
          createdAt: new Date(),
          rider: {
            user: {
              fullName: 'Awa Rider',
            },
          },
        },
      ]);
    prisma.rideRequest.updateMany.mockResolvedValueOnce({ count: 1 });

    const result = await service.getOffers({
      user: {
        id: 'user-driver-1',
        driverProfile: {
          id: 'driver-1',
        },
      },
    } as never);

    expect(result[0]?.dispatchLearningSummary).toContain(
      'Signal plus ancien, a revalider sur le terrain.',
    );
  });
});
