import { NotFoundException } from '@nestjs/common';
import { TripsService } from './trips.service';

/**
 * Security regression suite — IDOR and input-boundary invariants.
 *
 * OWASP API1 (BOLA/IDOR): assertTripAccess purposely returns NotFoundException
 * (404) instead of ForbiddenException (403) to prevent resource enumeration.
 * These tests lock that behaviour so it cannot be silently reverted.
 */
describe('TripsService — Security', () => {
  function createService() {
    const prisma = {
      $transaction: jest.fn(),
      driverProfile: { findUnique: jest.fn(), update: jest.fn() },
      supportTicket: { create: jest.fn() },
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
      tripEvent: { findFirst: jest.fn() },
      auditLog: { create: jest.fn() },
      rating: {
        findFirst: jest.fn(),
        create: jest.fn(),
        aggregate: jest.fn(),
      },
    };
    const realtimeService = { publish: jest.fn() };
    const documentLinksService = {
      createViewLink: jest.fn().mockReturnValue({
        signedUrl: 'https://storage.orbi.local/signed',
        expiresAt: '2026-12-01T00:00:00.000Z',
      }),
    };
    const notificationsService = {
      enqueue: jest
        .fn()
        .mockResolvedValue({ notification: { id: 'notif-sec' } }),
    };

    prisma.$transaction.mockImplementation(
      async (callback: (tx: typeof prisma) => unknown) => callback(prisma),
    );

    return {
      prisma,
      service: new TripsService(
        prisma as never,
        realtimeService as never,
        documentLinksService as never,
        notificationsService as never,
      ),
    };
  }

  function buildRawTrip(overrides: {
    riderId?: string;
    driverId?: string;
    status?: string;
  } = {}) {
    const riderId = overrides.riderId ?? 'rider-beta';
    const driverId = overrides.driverId ?? 'driver-beta';

    return {
      id: 'trip-target',
      riderId,
      driverId,
      rideRequestId: 'req-target',
      vehicleId: 'vehicle-target',
      status: overrides.status ?? 'COMPLETED',
      cancelledBy: null,
      startedAt: null,
      completedAt: new Date('2026-05-20T10:00:00.000Z'),
      pickupAddress: 'Universite Ki-Zerbo',
      destinationAddress: 'Ouaga 2000',
      actualFare: { toNumber: () => 2200 },
      distanceKm: { toNumber: () => 5.2 },
      durationMinutes: 14,
      currency: 'XOF',
      pickupLatitude: null,
      pickupLongitude: null,
      destinationLatitude: null,
      destinationLongitude: null,
      createdAt: new Date('2026-05-20T09:45:00.000Z'),
      updatedAt: new Date('2026-05-20T10:00:00.000Z'),
      rideRequest: null,
      events: [],
      rider: {
        id: riderId,
        userId: 'user-rider-b',
        user: { fullName: 'Rider B', phoneNumber: null },
      },
      driver: {
        id: driverId,
        userId: 'user-driver-b',
        user: { fullName: 'Driver B', phoneNumber: null },
        onboardingDocuments: [],
      },
      vehicle: { make: 'Yamaha', model: 'Crypton' },
      ratings: [],
    };
  }

  // ── IDOR: GET TRIP DETAIL ──────────────────────────────────────────────────

  describe('IDOR — getTripDetail', () => {
    it('masks another rider trip as 404, not 403, to prevent resource enumeration', async () => {
      const { prisma, service } = createService();
      prisma.trip.findUnique.mockResolvedValue(
        buildRawTrip({ riderId: 'rider-beta' }),
      );

      await expect(
        service.getTripDetail(
          {
            user: {
              id: 'user-alpha',
              role: 'RIDER',
              riderProfile: { id: 'rider-alpha' },
              driverProfile: null,
            },
          } as never,
          'trip-target',
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('masks another driver trip as 404, not 403, to prevent resource enumeration', async () => {
      const { prisma, service } = createService();
      prisma.trip.findUnique.mockResolvedValue(
        buildRawTrip({ driverId: 'driver-beta' }),
      );

      await expect(
        service.getTripDetail(
          {
            user: {
              id: 'user-alpha',
              role: 'DRIVER',
              riderProfile: null,
              driverProfile: { id: 'driver-alpha' },
            },
          } as never,
          'trip-target',
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('allows the legitimate rider to access their own trip', async () => {
      const { prisma, service } = createService();
      prisma.trip.findUnique.mockResolvedValue(
        buildRawTrip({ riderId: 'rider-alpha' }),
      );

      const result = await service.getTripDetail(
        {
          user: {
            id: 'user-alpha',
            role: 'RIDER',
            riderProfile: { id: 'rider-alpha' },
            driverProfile: null,
          },
        } as never,
        'trip-target',
      );

      expect(result.trip.id).toBe('trip-target');
    });
  });

  // ── IDOR: RATE TRIP ────────────────────────────────────────────────────────

  describe('IDOR — rateTrip', () => {
    it('prevents a rider from rating a trip they did not book — masked as 404', async () => {
      const { prisma, service } = createService();
      prisma.trip.findUnique.mockResolvedValue(
        buildRawTrip({ riderId: 'rider-beta', status: 'COMPLETED' }),
      );

      await expect(
        service.rateTrip(
          {
            user: {
              id: 'user-alpha',
              role: 'RIDER',
              riderProfile: { id: 'rider-alpha' },
              driverProfile: null,
            },
          } as never,
          'trip-target',
          { score: 5 },
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ── IDOR: UPDATE STATUS ───────────────────────────────────────────────────

  describe('IDOR — updateStatus', () => {
    it('prevents a rider from cancelling another rider trip — masked as 404', async () => {
      const { prisma, service } = createService();
      prisma.trip.findUnique.mockResolvedValue(
        buildRawTrip({ riderId: 'rider-beta', status: 'MATCHED' }),
      );

      await expect(
        service.updateStatus(
          {
            user: {
              id: 'user-alpha',
              role: 'RIDER',
              riderProfile: { id: 'rider-alpha' },
              driverProfile: null,
            },
          } as never,
          'trip-target',
          'CANCELLED' as never,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('prevents a driver from completing another driver trip — masked as 404', async () => {
      const { prisma, service } = createService();
      prisma.trip.findUnique.mockResolvedValue(
        buildRawTrip({ driverId: 'driver-beta', status: 'IN_PROGRESS' }),
      );

      await expect(
        service.updateStatus(
          {
            user: {
              id: 'user-alpha',
              role: 'DRIVER',
              riderProfile: null,
              driverProfile: { id: 'driver-alpha' },
            },
          } as never,
          'trip-target',
          'COMPLETED' as never,
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ── INPUT SAFETY: SQL-INJECTION-LIKE TRIP ID ──────────────────────────────

  describe('Input safety — malformed tripId', () => {
    const dangerousIds = [
      "'; DROP TABLE trips; --",
      '<script>alert(1)</script>',
      '\x00null-byte',
      '../../../etc/passwd',
      '1 OR 1=1',
      'a'.repeat(4096),
    ];

    it.each(dangerousIds)(
      'returns NotFoundException for tripId %j without crashing',
      async (maliciousId) => {
        const { prisma, service } = createService();
        // Prisma parameterises queries; a non-existent (or malformed) ID simply
        // returns null, which the service converts to NotFoundException.
        prisma.trip.findUnique.mockResolvedValue(null);

        await expect(
          service.getTripDetail(
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

  // ── INPUT SAFETY: XSS / INJECTION IN COMMENT ─────────────────────────────

  describe('Input safety — rateTrip comment content', () => {
    it('stores a comment with HTML/script content without throwing — ORM parameterises', async () => {
      const { prisma, service } = createService();
      prisma.trip.findUnique.mockResolvedValue(
        buildRawTrip({ riderId: 'rider-alpha', status: 'COMPLETED' }),
      );
      prisma.rating.findFirst.mockResolvedValue(null);
      prisma.rating.create.mockResolvedValue({
        id: 'rating-1',
        tripId: 'trip-target',
        score: 4,
        comment: '<script>steal()</script>',
        createdAt: new Date(),
      });
      prisma.rating.aggregate.mockResolvedValue({
        _avg: { score: 4 },
        _count: { score: 1 },
      });
      prisma.driverProfile.update.mockResolvedValue({});
      prisma.auditLog.create.mockResolvedValue({});

      const result = await service.rateTrip(
        {
          user: {
            id: 'user-alpha',
            role: 'RIDER',
            riderProfile: { id: 'rider-alpha' },
            driverProfile: null,
          },
        } as never,
        'trip-target',
        { score: 4, comment: '<script>steal()</script>' },
      );

      // Service doesn't sanitise at this layer — the DTO and output
      // encoding (controller/serialiser) handle escaping. Verify it stored.
      expect(result.rating.score).toBe(4);
    });

    it('stores a comment with SQL-injection-like content without throwing', async () => {
      const { prisma, service } = createService();
      const sqlComment = "'; UPDATE ratings SET score=5 WHERE 1=1; --";
      prisma.trip.findUnique.mockResolvedValue(
        buildRawTrip({ riderId: 'rider-alpha', status: 'COMPLETED' }),
      );
      prisma.rating.findFirst.mockResolvedValue(null);
      prisma.rating.create.mockResolvedValue({
        id: 'rating-2',
        tripId: 'trip-target',
        score: 3,
        comment: sqlComment,
        createdAt: new Date(),
      });
      prisma.rating.aggregate.mockResolvedValue({
        _avg: { score: 3 },
        _count: { score: 1 },
      });
      prisma.driverProfile.update.mockResolvedValue({});
      prisma.auditLog.create.mockResolvedValue({});

      const result = await service.rateTrip(
        {
          user: {
            id: 'user-alpha',
            role: 'RIDER',
            riderProfile: { id: 'rider-alpha' },
            driverProfile: null,
          },
        } as never,
        'trip-target',
        { score: 3, comment: sqlComment },
      );

      expect(result.rating.score).toBe(3);
    });
  });

  // ── ACCESS CONTROL: ADMIN BYPASSES IDOR GUARD ────────────────────────────

  describe('Access control — admin role', () => {
    it('admin can access any trip without IDOR guard', async () => {
      const { prisma, service } = createService();
      prisma.trip.findUnique.mockResolvedValue(
        buildRawTrip({ riderId: 'rider-beta', driverId: 'driver-beta' }),
      );

      const result = await service.getTripDetail(
        {
          user: {
            id: 'user-admin',
            role: 'ADMIN',
            riderProfile: null,
            driverProfile: null,
          },
        } as never,
        'trip-target',
      );

      expect(result.trip.id).toBe('trip-target');
    });
  });
});
