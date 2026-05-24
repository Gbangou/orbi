import { NotFoundException } from '@nestjs/common';
import { RidersService } from './riders.service';

/**
 * Security regression suite — IDOR invariants for RidersService.
 *
 * OWASP API1 (BOLA): updateSavedPlace() and deleteSavedPlace() use NotFoundException
 * (404) to prevent resource enumeration when a rider tries to access another
 * rider's saved place. The guard `existingPlace.riderId !== riderProfileId`
 * must not be silently removed.
 */
describe('RidersService — Security (BOLA/IDOR)', () => {
  function createService() {
    const prisma = {
      riderProfile: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
      },
      savedPlace: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      auditLog: { create: jest.fn() },
    };

    return {
      prisma,
      service: new RidersService(prisma as never),
    };
  }

  function makeAuth(riderProfileId: string) {
    return {
      token: 'tok',
      session: { id: 'sess-1' },
      user: {
        id: `user-${riderProfileId}`,
        role: 'RIDER',
        riderProfile: { id: riderProfileId },
        driverProfile: null,
      },
    } as never;
  }

  function makeSavedPlace(riderId: string) {
    return {
      id: 'place-001',
      riderId,
      label: 'Maison',
      address: 'Tampouy, Ouagadougou',
      latitude: 12.3712,
      longitude: -1.5191,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  // ── IDOR: updateSavedPlace ────────────────────────────────────────────────

  describe('IDOR — updateSavedPlace', () => {
    it('masks another rider saved place as 404, not 403, to prevent enumeration', async () => {
      const { service, prisma } = createService();
      prisma.savedPlace.findUnique.mockResolvedValue(
        makeSavedPlace('rider-beta'),
      );

      await expect(
        service.updateSavedPlace(
          makeAuth('rider-alpha'),
          'place-001',
          { label: 'Hijacked' },
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('does not call prisma.savedPlace.update when IDOR guard fires', async () => {
      const { service, prisma } = createService();
      prisma.savedPlace.findUnique.mockResolvedValue(
        makeSavedPlace('rider-beta'),
      );

      await expect(
        service.updateSavedPlace(
          makeAuth('rider-alpha'),
          'place-001',
          { label: 'Hijacked' },
        ),
      ).rejects.toThrow();

      expect(prisma.savedPlace.update).not.toHaveBeenCalled();
    });

    it('treats a non-existent saved place as 404 (no data leak via 403)', async () => {
      const { service, prisma } = createService();
      prisma.savedPlace.findUnique.mockResolvedValue(null);

      await expect(
        service.updateSavedPlace(
          makeAuth('rider-alpha'),
          'place-nonexistent',
          { label: 'Ghost' },
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('allows the legitimate rider to update their own saved place', async () => {
      const { service, prisma } = createService();
      prisma.savedPlace.findUnique.mockResolvedValue(
        makeSavedPlace('rider-alpha'),
      );
      prisma.savedPlace.update.mockResolvedValue({
        ...makeSavedPlace('rider-alpha'),
        label: 'Maison mis a jour',
      });

      const result = await service.updateSavedPlace(
        makeAuth('rider-alpha'),
        'place-001',
        { label: 'Maison mis a jour' },
      );

      expect(result.savedPlace.label).toBe('Maison mis a jour');
    });
  });

  // ── IDOR: deleteSavedPlace ────────────────────────────────────────────────

  describe('IDOR — deleteSavedPlace', () => {
    it('masks another rider saved place as 404 on delete attempt', async () => {
      const { service, prisma } = createService();
      prisma.savedPlace.findUnique.mockResolvedValue(
        makeSavedPlace('rider-beta'),
      );

      await expect(
        service.deleteSavedPlace(makeAuth('rider-alpha'), 'place-001'),
      ).rejects.toThrow(NotFoundException);
    });

    it('does not call prisma.savedPlace.delete when IDOR guard fires', async () => {
      const { service, prisma } = createService();
      prisma.savedPlace.findUnique.mockResolvedValue(
        makeSavedPlace('rider-beta'),
      );

      await expect(
        service.deleteSavedPlace(makeAuth('rider-alpha'), 'place-001'),
      ).rejects.toThrow();

      expect(prisma.savedPlace.delete).not.toHaveBeenCalled();
    });

    it('allows the legitimate rider to delete their own saved place', async () => {
      const { service, prisma } = createService();
      prisma.savedPlace.findUnique.mockResolvedValue(
        makeSavedPlace('rider-alpha'),
      );
      prisma.savedPlace.delete.mockResolvedValue(makeSavedPlace('rider-alpha'));

      const result = await service.deleteSavedPlace(
        makeAuth('rider-alpha'),
        'place-001',
      );

      expect(result).toEqual({ deleted: true, savedPlaceId: 'place-001' });
    });

    it('treats a non-existent saved place as 404 on delete', async () => {
      const { service, prisma } = createService();
      prisma.savedPlace.findUnique.mockResolvedValue(null);

      await expect(
        service.deleteSavedPlace(makeAuth('rider-alpha'), 'place-ghost'),
      ).rejects.toThrow(NotFoundException);

      expect(prisma.savedPlace.delete).not.toHaveBeenCalled();
    });
  });
});
