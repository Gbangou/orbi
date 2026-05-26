import { BadRequestException, NotFoundException } from '@nestjs/common';
import { RideRequestProjector } from './ride-request.projector';
import { RideRequestsService } from './ride-requests.service';

/**
 * Suite de régression sécurité — invariants IDOR et limites d'entrée pour RideRequests.
 *
 * OWASP API1 (BOLA/IDOR) : cancel() retourne intentionnellement NotFoundException (404)
 * au lieu de ForbiddenException (403) pour empêcher l'énumération de ressources.
 * Ces tests verrouillent ce comportement pour qu'il ne puisse pas être silencieusement annulé.
 *
 * OWASP API4 (Consommation de ressources non limitée) : les IDs malformés ou surdimensionnés
 * ne doivent pas provoquer de crash — Prisma paramètre toutes les requêtes, elles retournent null.
 */
describe('RideRequestsService — Sécurité', () => {
  function createService() {
    const prisma = {
      $transaction: jest.fn(),
      rideRequest: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      trip: {
        findFirst: jest.fn(),
      },
      auditLog: { create: jest.fn() },
    };
    const pricingService = {
      quote: jest.fn().mockResolvedValue({ estimatedFare: 1500 }),
      deriveOperatingContext: jest.fn(() => ({
        demandLevel: 'NORMAL',
        trafficLevel: 'LIGHT',
        weatherCondition: 'CLEAR',
        roadCondition: 'CLEAR',
        supplyPressureLevel: 'BALANCED',
        availabilityScore: 80,
      })),
    };
    const realtimeService = { publish: jest.fn() };
    const rideRequestProjector = new RideRequestProjector();
    const notificationsService = {
      enqueue: jest
        .fn()
        .mockResolvedValue({ notification: { id: 'notif-sec' } }),
    };
    const dispatchCoordinator = {
      proactiveDispatch: jest.fn().mockResolvedValue({
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

  function buildRawRideRequest(
    overrides: {
      riderId?: string;
      status?: string;
      trip?: object | null;
    } = {},
  ) {
    return {
      id: 'req-target',
      riderId: overrides.riderId ?? 'rider-beta',
      status: overrides.status ?? 'REQUESTED',
      trip: overrides.trip !== undefined ? overrides.trip : null,
      pickupAddress: 'Universite Ki-Zerbo',
      destinationAddress: 'Ouaga 2000',
      updatedAt: new Date('2026-05-23T08:00:00.000Z'),
    };
  }

  // ── IDOR: CANCEL RIDE REQUEST ─────────────────────────────────────────────

  describe('IDOR — cancel', () => {
    it('masks another rider request as 404, not 403, to prevent resource enumeration', async () => {
      const { prisma, service } = createService();
      prisma.rideRequest.findUnique.mockResolvedValue(
        buildRawRideRequest({ riderId: 'rider-beta' }),
      );

      await expect(
        service.cancel(
          {
            user: {
              id: 'user-alpha',
              role: 'RIDER',
              riderProfile: { id: 'rider-alpha' },
              driverProfile: null,
            },
          } as never,
          'req-target',
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('does not leak the existence of the resource via 403', async () => {
      const { prisma, service } = createService();
      prisma.rideRequest.findUnique.mockResolvedValue(
        buildRawRideRequest({ riderId: 'rider-beta' }),
      );

      let thrown: Error | undefined;
      try {
        await service.cancel(
          {
            user: {
              id: 'user-alpha',
              role: 'RIDER',
              riderProfile: { id: 'rider-alpha' },
              driverProfile: null,
            },
          } as never,
          'req-target',
        );
      } catch (err) {
        thrown = err as Error;
      }

      // Must be NotFoundException (status 404), never ForbiddenException (403).
      expect(thrown).toBeInstanceOf(NotFoundException);
    });

    it('allows the legitimate rider to cancel their own request', async () => {
      const { prisma, service } = createService();
      prisma.rideRequest.findUnique.mockResolvedValue(
        buildRawRideRequest({ riderId: 'rider-alpha', status: 'REQUESTED' }),
      );
      prisma.rideRequest.update.mockResolvedValue({
        id: 'req-target',
        status: 'CANCELLED',
        riderId: 'rider-alpha',
        pickupAddress: 'Universite Ki-Zerbo',
        destinationAddress: 'Ouaga 2000',
        updatedAt: new Date(),
      });

      const result = await service.cancel(
        {
          user: {
            id: 'user-alpha',
            role: 'RIDER',
            riderProfile: { id: 'rider-alpha' },
            driverProfile: null,
          },
        } as never,
        'req-target',
      );

      expect(result.rideRequest.status).toBe('CANCELLED');
    });

    it('admin can cancel any rider request without IDOR guard', async () => {
      const { prisma, service } = createService();
      prisma.rideRequest.findUnique.mockResolvedValue(
        buildRawRideRequest({ riderId: 'rider-beta', status: 'REQUESTED' }),
      );
      prisma.rideRequest.update.mockResolvedValue({
        id: 'req-target',
        status: 'CANCELLED',
        riderId: 'rider-beta',
        pickupAddress: 'Universite Ki-Zerbo',
        destinationAddress: 'Ouaga 2000',
        updatedAt: new Date(),
      });

      const result = await service.cancel(
        {
          user: {
            id: 'user-admin',
            role: 'ADMIN',
            riderProfile: null,
            driverProfile: null,
          },
        } as never,
        'req-target',
      );

      expect(result.rideRequest.status).toBe('CANCELLED');
    });

    it('rider with misconfigured null riderProfile is denied — no riderProfile.id to match', async () => {
      const { prisma, service } = createService();
      prisma.rideRequest.findUnique.mockResolvedValue(
        buildRawRideRequest({ riderId: 'rider-beta' }),
      );

      await expect(
        service.cancel(
          {
            user: {
              id: 'user-alpha',
              role: 'RIDER',
              riderProfile: null,
              driverProfile: null,
            },
          } as never,
          'req-target',
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ── ACCESS CONTROL: CANNOT CANCEL REQUEST WITH ACTIVE TRIP ───────────────

  describe('Access control — cancel with active trip', () => {
    it('denies cancellation when the request already has an active trip', async () => {
      const { prisma, service } = createService();
      prisma.rideRequest.findUnique.mockResolvedValue(
        buildRawRideRequest({
          riderId: 'rider-alpha',
          status: 'REQUESTED',
          trip: { id: 'trip-existing' },
        }),
      );

      await expect(
        service.cancel(
          {
            user: {
              id: 'user-alpha',
              role: 'RIDER',
              riderProfile: { id: 'rider-alpha' },
              driverProfile: null,
            },
          } as never,
          'req-target',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('denies cancellation when request status is not REQUESTED', async () => {
      const { prisma, service } = createService();
      prisma.rideRequest.findUnique.mockResolvedValue(
        buildRawRideRequest({
          riderId: 'rider-alpha',
          status: 'MATCHED',
          trip: null,
        }),
      );

      await expect(
        service.cancel(
          {
            user: {
              id: 'user-alpha',
              role: 'RIDER',
              riderProfile: { id: 'rider-alpha' },
              driverProfile: null,
            },
          } as never,
          'req-target',
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ── INPUT SAFETY: MALFORMED RIDE REQUEST ID ───────────────────────────────

  describe('Input safety — malformed rideRequestId', () => {
    const dangerousIds = [
      "'; DROP TABLE ride_requests; --",
      '<script>alert(1)</script>',
      '\x00null-byte',
      '../../../etc/shadow',
      '1 OR 1=1',
      'a'.repeat(4096),
    ];

    it.each(dangerousIds)(
      'returns NotFoundException for rideRequestId %j without crashing',
      async (maliciousId) => {
        const { prisma, service } = createService();
        // Prisma parameterises all queries; a non-existent or malformed ID returns null.
        prisma.rideRequest.findUnique.mockResolvedValue(null);

        await expect(
          service.cancel(
            {
              user: {
                id: 'user-alpha',
                role: 'RIDER',
                riderProfile: { id: 'rider-alpha' },
                driverProfile: null,
              },
            } as never,
            maliciousId,
          ),
        ).rejects.toThrow(NotFoundException);
      },
    );
  });
});
