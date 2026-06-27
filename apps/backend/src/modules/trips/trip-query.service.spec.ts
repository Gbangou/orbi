import { NotFoundException } from '@nestjs/common';
import { TripQueryService } from './trip-query.service';

describe('TripQueryService', () => {
  function makeService(prismaMock: object) {
    return new TripQueryService(
      prismaMock as never,
      { createViewLink: jest.fn().mockReturnValue({ signedUrl: null }) } as never,
    );
  }

  function authAs(role: 'RIDER' | 'DRIVER' | 'OPS', overrides: object = {}) {
    return {
      user: {
        id: 'user-1',
        role,
        riderProfile: role === 'RIDER' ? { id: 'rider-1' } : null,
        driverProfile: role === 'DRIVER' ? { id: 'driver-1' } : null,
        ...overrides,
      },
      session: { id: 'sess-1', expiresAt: new Date('2027-01-01') },
      token: 'tok',
    } as never;
  }

  describe('dashboard', () => {
    it('returns active trip count and recent trips', async () => {
      const prisma = {
        trip: {
          count: jest.fn().mockResolvedValue(3),
          findMany: jest.fn().mockResolvedValue([
            { id: 'trip-1', status: 'DRIVER_ARRIVING', riderId: 'r1', driverId: 'd1' },
          ]),
        },
      };
      const service = makeService(prisma);
      const result = await service.dashboard();

      expect(result.activeTrips).toBe(3);
      expect(result.recentTrips).toHaveLength(1);
    });
  });

  describe('findMine', () => {
    it('throws when rider profile is missing', async () => {
      const service = makeService({});
      const auth = authAs('RIDER', { riderProfile: null });

      await expect(service.findMine(auth)).rejects.toThrow(NotFoundException);
    });

    it('throws when driver profile is missing', async () => {
      const service = makeService({});
      const auth = authAs('DRIVER', { driverProfile: null });

      await expect(service.findMine(auth)).rejects.toThrow(NotFoundException);
    });

    it('returns rider trips with stats', async () => {
      const prisma = {
        rideRequest: {
          findMany: jest.fn().mockResolvedValue([]),
        },
        trip: {
          findMany: jest.fn().mockResolvedValue([]),
          count: jest.fn().mockResolvedValue(0),
        },
      };
      const service = makeService(prisma);
      const result = await service.findMine(authAs('RIDER'));

      expect(result.role).toBe('RIDER');
      expect(result.stats).toBeDefined();
      expect(result.pendingRequests).toEqual([]);
      expect(result.recentTrips).toEqual([]);
    });
  });

  describe('getSharedTrip', () => {
    it('rejects tokens that are too short', async () => {
      const service = makeService({});
      await expect(service.getSharedTrip('short')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('rejects expired share links', async () => {
      const prisma = {
        tripEvent: {
          findFirst: jest.fn().mockResolvedValue({
            payload: { expiresAt: new Date('2020-01-01').toISOString() },
            trip: { id: 't1', status: 'COMPLETED', events: [] },
          }),
        },
      };
      const service = makeService(prisma);
      // 24-char base64url token
      await expect(
        service.getSharedTrip('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('assertTripAccess', () => {
    it('throws when rider accesses another riders trip', () => {
      const service = makeService({});
      const auth = authAs('RIDER');

      expect(() =>
        service.assertTripAccess(auth, { riderId: 'other-rider', driverId: 'd1' }),
      ).toThrow(NotFoundException);
    });

    it('allows rider to access their own trip', () => {
      const service = makeService({});
      const auth = authAs('RIDER');

      expect(() =>
        service.assertTripAccess(auth, { riderId: 'rider-1', driverId: 'd1' }),
      ).not.toThrow();
    });

    it('throws when driver accesses another drivers trip', () => {
      const service = makeService({});
      const auth = authAs('DRIVER');

      expect(() =>
        service.assertTripAccess(auth, { riderId: 'r1', driverId: 'other-driver' }),
      ).toThrow(NotFoundException);
    });

    it('allows ops to access any trip', () => {
      const service = makeService({});
      const auth = authAs('OPS');

      expect(() =>
        service.assertTripAccess(auth, { riderId: 'any', driverId: 'any' }),
      ).not.toThrow();
    });
  });
});
