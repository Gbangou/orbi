import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AdminService } from './admin.service';

function createService() {
  const profile = (overrides: Record<string, unknown> = {}) => ({
    id: 'driver-profile-1',
    userId: 'user-driver-1',
    status: 'ONLINE',
    ...overrides,
  });

  const prisma = {
    driverProfile: {
      findUnique: jest.fn().mockResolvedValue(profile()),
      update: jest
        .fn()
        .mockResolvedValue({ id: 'driver-profile-1', status: 'SUSPENDED' }),
    },
    auditLog: { create: jest.fn().mockResolvedValue({ id: 'log-1' }) },
  };

  const notifications = { enqueue: jest.fn().mockResolvedValue(undefined) };

  const service = new AdminService(
    prisma as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    notifications as never,
    { getOrSet: (_k: string, factory: () => unknown) => factory() } as never,
  );

  const auth = {
    user: { id: 'admin-1', role: 'ADMIN', fullName: 'Admin Test' },
  };

  return { prisma, service, auth, notifications, profile };
}

describe('AdminService.suspendDriver', () => {
  it('met le statut SUSPENDED et cree un audit log', async () => {
    const { service, prisma, auth } = createService();
    const result = await service.suspendDriver(
      'driver-profile-1',
      { reason: 'Comportement inapproprie avec les passagers.' },
      auth as never,
    );

    expect(prisma.driverProfile.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'SUSPENDED' } }),
    );
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'DRIVER_SUSPENDED',
          entityId: 'driver-profile-1',
        }),
      }),
    );
    expect(result.status).toBe('SUSPENDED');
  });

  it('envoie une push notification au chauffeur suspendu', async () => {
    const { service, auth, notifications } = createService();
    await service.suspendDriver(
      'driver-profile-1',
      { reason: 'Comportement inapproprie avec les passagers.' },
      auth as never,
    );

    expect(notifications.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-driver-1',
        data: expect.objectContaining({ type: 'driver_account_suspended' }),
      }),
    );
  });

  it('leve NotFoundException si le profil driver est introuvable', async () => {
    const { service, prisma, auth } = createService();
    prisma.driverProfile.findUnique.mockResolvedValue(null);

    await expect(
      service.suspendDriver(
        'unknown-driver',
        { reason: 'Comportement inapproprie.' },
        auth as never,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('leve BadRequestException si le chauffeur est deja suspendu', async () => {
    const { service, prisma, auth, profile } = createService();
    prisma.driverProfile.findUnique.mockResolvedValue(
      profile({ status: 'SUSPENDED' }),
    );

    await expect(
      service.suspendDriver(
        'driver-profile-1',
        { reason: 'Test doublon.' },
        auth as never,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('AdminService.reactivateDriver', () => {
  it('remet le statut OFFLINE et cree un audit log', async () => {
    const { service, prisma, auth, profile } = createService();
    prisma.driverProfile.findUnique.mockResolvedValue(
      profile({ status: 'SUSPENDED' }),
    );
    prisma.driverProfile.update.mockResolvedValue({
      id: 'driver-profile-1',
      status: 'OFFLINE',
    });

    const result = await service.reactivateDriver(
      'driver-profile-1',
      auth as never,
    );

    expect(prisma.driverProfile.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'OFFLINE' } }),
    );
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'DRIVER_REACTIVATED' }),
      }),
    );
    expect(result.status).toBe('OFFLINE');
  });

  it('envoie une push notification de reactivation au chauffeur', async () => {
    const { service, prisma, auth, profile, notifications } = createService();
    prisma.driverProfile.findUnique.mockResolvedValue(
      profile({ status: 'SUSPENDED' }),
    );

    await service.reactivateDriver('driver-profile-1', auth as never);

    expect(notifications.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-driver-1',
        data: expect.objectContaining({ type: 'driver_account_reactivated' }),
      }),
    );
  });

  it('leve NotFoundException si le profil driver est introuvable', async () => {
    const { service, prisma, auth } = createService();
    prisma.driverProfile.findUnique.mockResolvedValue(null);

    await expect(
      service.reactivateDriver('unknown-driver', auth as never),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('leve BadRequestException si le chauffeur n est pas suspendu', async () => {
    const { service, auth } = createService();

    await expect(
      service.reactivateDriver('driver-profile-1', auth as never),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
