import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DriverOfferProjector } from './driver-offer-projector';
import { DispatchCoordinator } from './dispatch-coordinator.service';

/**
 * Suite de régression sécurité — invariants BOLA/IDOR pour DispatchCoordinator.
 *
 * OWASP API1 (BOLA) : declineOffer() doit vérifier que le chauffeur authentifié est
 * bien celui actuellement assigné à la réservation. Sans ce guard, un chauffeur
 * pourrait décliner l'assignation d'un autre chauffeur, perturbant le dispatch.
 *
 * Le guard est doublement vérifié :
 * 1. En mémoire : reservation.assignedDriverId !== driverProfileId → 400
 * 2. En base : updateMany WHERE assignedDriverId = driverProfileId — même si le
 *    guard mémoire est contourné, l'écriture DB est un no-op → 400 (count: 0)
 */
describe('DispatchCoordinator — Sécurité (BOLA/IDOR)', () => {
  function createService() {
    const prisma = {
      systemSetting: { findUnique: jest.fn().mockResolvedValue(null) },
      driverProfile: {
        findMany: jest.fn(),
        count: jest.fn().mockResolvedValue(3),
        findUnique: jest.fn(),
      },
      trip: { findMany: jest.fn().mockResolvedValue([]) },
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

    const realtimeService = { publish: jest.fn() };
    const pricingService = {
      deriveOperatingContext: jest.fn().mockReturnValue({
        demandLevel: 'NORMAL',
        trafficLevel: 'LIGHT',
        weatherCondition: 'CLEAR',
        roadCondition: 'OPEN',
        supplyPressureLevel: 'BALANCED',
        availabilityScore: 80,
      }),
    };
    const configService = { get: jest.fn() };
    const driverOfferProjector = new DriverOfferProjector();

    const coordinator = new DispatchCoordinator(
      prisma as never,
      realtimeService as never,
      pricingService as never,
      configService as never,
      driverOfferProjector,
    );

    return { coordinator, prisma, realtimeService };
  }

  function makeAuth(driverProfileId: string) {
    return {
      token: 'tok',
      session: { id: 'sess-1' },
      user: {
        id: `user-${driverProfileId}`,
        role: 'DRIVER',
        riderProfile: null,
        driverProfile: { id: driverProfileId },
      },
    } as never;
  }

  function makeReservation(
    overrides: {
      assignedDriverId?: string | null;
      status?: string;
      assignmentExpiresAt?: Date | null;
    } = {},
  ) {
    return {
      id: 'req-001',
      riderId: 'rider-001',
      status: overrides.status ?? 'REQUESTED',
      assignedDriverId: overrides.assignedDriverId ?? 'driver-alpha',
      assignmentExpiresAt:
        overrides.assignmentExpiresAt !== undefined
          ? overrides.assignmentExpiresAt
          : new Date(Date.now() + 30_000),
    };
  }

  // ── BOLA : un chauffeur ne peut pas décliner la réservation d'un autre ──────

  describe('IDOR — declineOffer', () => {
    it('rejects when the authenticated driver is not the assigned driver', async () => {
      const { coordinator, prisma } = createService();
      prisma.driverProfile.findUnique.mockResolvedValue({
        id: 'driver-beta',
        userId: 'user-driver-beta',
        status: 'ONLINE',
      });
      prisma.rideRequest.findUnique.mockResolvedValue(
        makeReservation({ assignedDriverId: 'driver-alpha' }),
      );

      await expect(
        coordinator.declineOffer(makeAuth('driver-beta'), 'req-001'),
      ).rejects.toThrow(BadRequestException);
    });

    it('does not update the DB when the in-memory guard rejects', async () => {
      const { coordinator, prisma } = createService();
      prisma.driverProfile.findUnique.mockResolvedValue({
        id: 'driver-beta',
        userId: 'user-driver-beta',
        status: 'ONLINE',
      });
      prisma.rideRequest.findUnique.mockResolvedValue(
        makeReservation({ assignedDriverId: 'driver-alpha' }),
      );

      await expect(
        coordinator.declineOffer(makeAuth('driver-beta'), 'req-001'),
      ).rejects.toThrow();

      expect(prisma.rideRequest.updateMany).not.toHaveBeenCalled();
    });

    it('rejects when the reservation has already expired', async () => {
      const { coordinator, prisma } = createService();
      prisma.driverProfile.findUnique.mockResolvedValue({
        id: 'driver-alpha',
        userId: 'user-driver-alpha',
        status: 'ONLINE',
      });
      prisma.rideRequest.findUnique.mockResolvedValue(
        makeReservation({
          assignedDriverId: 'driver-alpha',
          assignmentExpiresAt: new Date(Date.now() - 1),
        }),
      );

      await expect(
        coordinator.declineOffer(makeAuth('driver-alpha'), 'req-001'),
      ).rejects.toThrow(BadRequestException);

      expect(prisma.rideRequest.updateMany).not.toHaveBeenCalled();
    });

    it('rejects when the reservation has no assigned driver (already released)', async () => {
      const { coordinator, prisma } = createService();
      prisma.driverProfile.findUnique.mockResolvedValue({
        id: 'driver-alpha',
        userId: 'user-driver-alpha',
        status: 'ONLINE',
      });
      // assignedDriverId: null → guard mémoire `null !== 'driver-alpha'` est vrai → BadRequest
      prisma.rideRequest.findUnique.mockResolvedValue(
        makeReservation({ assignedDriverId: null }),
      );
      // updateMany n'est jamais atteint dans ce chemin, mais on le mocke par sécurité
      prisma.rideRequest.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        coordinator.declineOffer(makeAuth('driver-alpha'), 'req-001'),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects when the ride request is not found — masked as 404', async () => {
      const { coordinator, prisma } = createService();
      prisma.driverProfile.findUnique.mockResolvedValue({
        id: 'driver-alpha',
        userId: 'user-driver-alpha',
        status: 'ONLINE',
      });
      prisma.rideRequest.findUnique.mockResolvedValue(null);

      await expect(
        coordinator.declineOffer(makeAuth('driver-alpha'), 'req-001'),
      ).rejects.toThrow(NotFoundException);
    });

    it('allows the legitimately assigned driver to decline their own reservation', async () => {
      const { coordinator, prisma, realtimeService } = createService();
      prisma.driverProfile.findUnique.mockResolvedValue({
        id: 'driver-alpha',
        userId: 'user-driver-alpha',
        status: 'ONLINE',
      });
      prisma.rideRequest.findUnique.mockResolvedValue(
        makeReservation({ assignedDriverId: 'driver-alpha' }),
      );
      prisma.rideRequest.updateMany.mockResolvedValue({ count: 1 });

      const result = await coordinator.declineOffer(
        makeAuth('driver-alpha'),
        'req-001',
      );

      expect(result).toEqual({
        offer: { rideRequestId: 'req-001', status: 'DECLINED' },
      });
      expect(prisma.rideRequest.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            assignedDriverId: 'driver-alpha',
          }),
        }),
      );
      expect(realtimeService.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'ride-request.reservation-released',
        }),
      );
    });

    it('fails gracefully when DB claim is lost to a race (updateMany count:0)', async () => {
      const { coordinator, prisma } = createService();
      prisma.driverProfile.findUnique.mockResolvedValue({
        id: 'driver-alpha',
        userId: 'user-driver-alpha',
        status: 'ONLINE',
      });
      prisma.rideRequest.findUnique.mockResolvedValue(
        makeReservation({ assignedDriverId: 'driver-alpha' }),
      );
      prisma.rideRequest.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        coordinator.declineOffer(makeAuth('driver-alpha'), 'req-001'),
      ).rejects.toThrow(BadRequestException);
    });

    it('denies a driver with no driverProfile — no profile id to match', async () => {
      const { coordinator } = createService();
      const noProfileAuth = {
        token: 'tok',
        session: { id: 'sess-1' },
        user: {
          id: 'user-x',
          role: 'DRIVER',
          riderProfile: null,
          driverProfile: null,
        },
      } as never;

      await expect(
        coordinator.declineOffer(noProfileAuth, 'req-001'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
