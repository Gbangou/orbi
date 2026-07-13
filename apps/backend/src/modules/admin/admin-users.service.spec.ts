import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { RequestAuthContext } from '../auth/auth.types';
import { AdminUsersService } from './admin-users.service';

describe('AdminUsersService', () => {
  function authContext(
    overrides: Partial<{ id: string }> = {},
  ): RequestAuthContext {
    const id = overrides.id ?? 'ops-1';
    const now = new Date('2026-05-01T08:00:00.000Z');

    return {
      user: {
        id,
        email: `${id}@orbi.test`,
        phoneNumber: null,
        passwordHash: null,
        fullName: 'Ops Orbi',
        role: 'OPS',
        provider: 'EMAIL',
        isActive: true,
        isPhoneVerified: true,
        lastLoginAt: now,
        createdAt: now,
        updatedAt: now,
        pushToken: null,
        failedLoginCount: 0,
        lockedUntil: null,
        riderProfile: null,
        driverProfile: null,
      },
      session: {
        id: `session-${id}`,
        userId: id,
        createdAt: now,
        lastSeenAt: now,
        expiresAt: new Date('2026-05-01T12:00:00.000Z'),
        revokedAt: null,
        userAgent: 'jest',
        ipAddress: '127.0.0.1',
      },
      token: `test-token-${id}`,
    } as unknown as RequestAuthContext;
  }

  function createService() {
    const prisma = {
      driverProfile: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      user: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      auditLog: {
        create: jest.fn().mockResolvedValue(undefined),
      },
    };

    return {
      prisma,
      service: new AdminUsersService(prisma as never),
    };
  }

  describe('listDrivers', () => {
    it('lists driver accounts with bounded pagination and search filters', async () => {
      const { prisma, service } = createService();

      prisma.driverProfile.findMany.mockResolvedValue([
        {
          id: 'driver-profile-1',
          status: 'ONLINE',
          verificationStatus: 'APPROVED',
          completedTripsCount: 12,
          createdAt: new Date('2026-05-01T08:00:00.000Z'),
          user: {
            id: 'driver-user-1',
            fullName: 'Moussa Traore',
            email: 'moussa@orbi.test',
            phoneNumber: '+22670000001',
            isActive: true,
          },
          vehicles: [
            {
              make: 'Honda',
              model: 'CB150',
              plateNumber: '01-BF-1234',
              type: 'MOTORCYCLE',
            },
          ],
        },
      ]);
      prisma.driverProfile.count.mockResolvedValue(1);

      const result = await service.listDrivers({
        page: 0,
        pageSize: 200,
        search: ' moussa ',
        status: 'ACTIVE',
      });

      expect(prisma.driverProfile.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            verificationStatus: 'APPROVED',
            status: { not: 'SUSPENDED' },
            OR: expect.arrayContaining([
              {
                user: {
                  fullName: { contains: 'moussa', mode: 'insensitive' },
                },
              },
            ]),
          }),
          skip: 0,
          take: 100,
        }),
      );
      expect(result).toEqual({
        drivers: [
          {
            id: 'driver-profile-1',
            userId: 'driver-user-1',
            fullName: 'Moussa Traore',
            email: 'moussa@orbi.test',
            phoneNumber: '+22670000001',
            isActive: true,
            status: 'ONLINE',
            verificationStatus: 'APPROVED',
            createdAt: '2026-05-01T08:00:00.000Z',
            completedTripsCount: 12,
            vehicle: {
              make: 'Honda',
              model: 'CB150',
              plateNumber: '01-BF-1234',
              vehicleType: 'MOTORCYCLE',
            },
          },
        ],
        total: 1,
        page: 1,
        pageSize: 100,
      });
    });

    // Le filtre admin (PENDING/ACTIVE/SUSPENDED/REJECTED) decrit le cycle de
    // vie du dossier chauffeur, pas la presence en direct (DriverStatus:
    // OFFLINE/ONLINE/BUSY/SUSPENDED) — seul SUSPENDED existe dans les deux
    // modeles. Caster les 3 autres valeurs directement vers DriverStatus
    // faisait planter la requete Prisma avec une valeur d'enum invalide (500
    // reproduit en direct en filtrant "Actifs" depuis la console admin).
    it('maps each admin-facing driver status filter to the correct underlying field', async () => {
      const { prisma, service } = createService();

      await service.listDrivers({ status: 'active' });
      expect(prisma.driverProfile.findMany).toHaveBeenLastCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            verificationStatus: 'APPROVED',
            status: { not: 'SUSPENDED' },
          }),
        }),
      );

      await service.listDrivers({ status: 'pending' });
      expect(prisma.driverProfile.findMany).toHaveBeenLastCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ verificationStatus: 'PENDING' }),
        }),
      );

      await service.listDrivers({ status: 'rejected' });
      expect(prisma.driverProfile.findMany).toHaveBeenLastCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ verificationStatus: 'REJECTED' }),
        }),
      );

      await service.listDrivers({ status: 'suspended' });
      expect(prisma.driverProfile.findMany).toHaveBeenLastCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: 'SUSPENDED' }),
        }),
      );
    });

    it('rejects unknown status filters without crashing', async () => {
      const { prisma, service } = createService();

      await service.listDrivers({ status: 'INVALID_STATUS' });

      expect(prisma.driverProfile.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.not.objectContaining({ status: 'INVALID_STATUS' }),
        }),
      );
    });

    it('returns null vehicle when driver has no active vehicle registered', async () => {
      const { prisma, service } = createService();

      prisma.driverProfile.findMany.mockResolvedValue([
        {
          id: 'driver-profile-2',
          status: 'OFFLINE',
          verificationStatus: 'PENDING',
          completedTripsCount: 0,
          createdAt: new Date('2026-05-10T09:00:00.000Z'),
          user: {
            id: 'driver-user-2',
            fullName: 'Fatima Kone',
            email: 'fatima@orbi.test',
            phoneNumber: null,
            isActive: true,
          },
          vehicles: [],
        },
      ]);
      prisma.driverProfile.count.mockResolvedValue(1);

      const result = await service.listDrivers({});

      expect(result.drivers[0].vehicle).toBeNull();
      expect(result.drivers[0].phoneNumber).toBeNull();
    });
  });

  describe('listRiders', () => {
    it('lists rider accounts with bounded pagination and search filters', async () => {
      const { prisma, service } = createService();

      prisma.user.findMany.mockResolvedValue([
        {
          id: 'rider-user-1',
          fullName: 'Awa Ouedraogo',
          email: 'awa@orbi.test',
          phoneNumber: '+22670000000',
          isActive: true,
          createdAt: new Date('2026-05-01T08:00:00.000Z'),
          riderProfile: {
            id: 'rider-profile-1',
            _count: { trips: 4, rideRequests: 9 },
          },
        },
      ]);
      prisma.user.count.mockResolvedValue(1);

      const result = await service.listRiders({
        page: 0,
        pageSize: 500,
        search: ' awa ',
        activeOnly: true,
      });

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            role: 'RIDER',
            isActive: true,
            OR: expect.arrayContaining([
              { fullName: { contains: 'awa', mode: 'insensitive' } },
              { email: { contains: 'awa', mode: 'insensitive' } },
              { phoneNumber: { contains: 'awa' } },
            ]),
          }),
          skip: 0,
          take: 100,
        }),
      );
      expect(result).toEqual({
        riders: [
          {
            id: 'rider-user-1',
            fullName: 'Awa Ouedraogo',
            email: 'awa@orbi.test',
            phoneNumber: '+22670000000',
            isActive: true,
            createdAt: '2026-05-01T08:00:00.000Z',
            riderId: 'rider-profile-1',
            completedTripsCount: 4,
            rideRequestsCount: 9,
          },
        ],
        total: 1,
        page: 1,
        pageSize: 100,
      });
    });
  });

  describe('setRiderStatus', () => {
    it('updates rider status and writes an audit log', async () => {
      const { prisma, service } = createService();
      const auth = authContext({ id: 'ops-rider-1' });

      prisma.user.findUnique.mockResolvedValue({
        id: 'rider-user-1',
        role: 'RIDER',
        isActive: true,
        fullName: 'Awa Rider',
      });
      prisma.user.update.mockResolvedValue({
        id: 'rider-user-1',
        isActive: false,
      });

      const result = await service.setRiderStatus(
        'rider-user-1',
        { isActive: false, reason: 'Signal support confirme.' },
        auth,
      );

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'rider-user-1' },
        data: { isActive: false },
      });
      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: {
          userId: 'ops-rider-1',
          action: 'RIDER_SUSPENDED',
          entityType: 'USER',
          entityId: 'rider-user-1',
          metadata: {
            reason: 'Signal support confirme.',
            previousIsActive: true,
          },
        },
      });
      expect(result).toEqual({ riderId: 'rider-user-1', isActive: false });
    });

    it('normalizes empty rider status reasons before audit logging', async () => {
      const { prisma, service } = createService();

      prisma.user.findUnique.mockResolvedValue({
        id: 'rider-user-1',
        role: 'RIDER',
        isActive: false,
        fullName: 'Awa Rider',
      });
      prisma.user.update.mockResolvedValue({
        id: 'rider-user-1',
        isActive: true,
      });

      await service.setRiderStatus(
        'rider-user-1',
        { isActive: true, reason: '   ' },
        authContext({ id: 'admin-rider-1' }),
      );

      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: {
          userId: 'admin-rider-1',
          action: 'RIDER_ACTIVATED',
          entityType: 'USER',
          entityId: 'rider-user-1',
          metadata: { reason: null, previousIsActive: false },
        },
      });
    });

    it('rejects rider status updates for non-rider accounts', async () => {
      const { prisma, service } = createService();

      prisma.user.findUnique.mockResolvedValue({
        id: 'driver-user-1',
        role: 'DRIVER',
        isActive: true,
        fullName: 'Issa Driver',
      });

      await expect(
        service.setRiderStatus(
          'driver-user-1',
          { isActive: false, reason: 'Mauvaise cible.' },
          authContext(),
        ),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(prisma.auditLog.create).not.toHaveBeenCalled();
    });

    it('rejects redundant status updates', async () => {
      const { prisma, service } = createService();

      prisma.user.findUnique.mockResolvedValue({
        id: 'rider-user-1',
        role: 'RIDER',
        isActive: true,
        fullName: 'Awa Rider',
      });

      await expect(
        service.setRiderStatus(
          'rider-user-1',
          { isActive: true },
          authContext(),
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
