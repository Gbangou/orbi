import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { hashPassword } from './auth-crypto';
import { SignUpRole } from './dto/sign-up.dto';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  function createService() {
    const prisma = {
      user: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      userSession: {
        create: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
    };

    return {
      prisma,
      service: new AuthService(prisma as never),
    };
  }

  it('creates a rider account with a wallet, profile, and session', async () => {
    const { prisma, service } = createService();

    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockImplementation(
      ({ data }: { data: Record<string, unknown> }) => ({
        id: 'user-1',
        email: data.email,
        fullName: data.fullName,
        phoneNumber: null,
        role: data.role,
        provider: 'EMAIL',
        isActive: true,
        isPhoneVerified: false,
        lastLoginAt: new Date(),
        createdAt: new Date(),
        riderProfile: { id: 'rider-1', userId: 'user-1' },
        driverProfile: null,
        sessions: [
          {
            id: 'session-1',
            createdAt: new Date(),
            lastSeenAt: new Date(),
            expiresAt: new Date(Date.now() + 1000 * 60 * 60),
            revokedAt: null,
            userAgent: 'jest',
            ipAddress: '127.0.0.1',
          },
        ],
      }),
    );

    const result = await service.signUp(
      {
        email: 'rider@mobilis.app',
        fullName: 'Awa Rider',
        password: 'Mobilis123!',
        role: SignUpRole.RIDER,
      },
      { userAgent: 'jest', ipAddress: '127.0.0.1' },
    );

    expect(result.user.role).toBe(UserRole.RIDER);
    expect(result.user.riderProfile?.id).toBe('rider-1');
    expect(result.sessionToken).toBeTruthy();
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { email: 'rider@mobilis.app' },
      select: { id: true },
    });
    expect(prisma.user.create).toHaveBeenCalled();
  });

  it('rejects sign-up when email already exists', async () => {
    const { prisma, service } = createService();

    prisma.user.findUnique.mockResolvedValue({ id: 'existing-user' });

    await expect(
      service.signUp({
        email: 'rider@mobilis.app',
        fullName: 'Awa Rider',
        password: 'Mobilis123!',
        role: SignUpRole.RIDER,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('signs in with valid credentials and returns a session token', async () => {
    const { prisma, service } = createService();
    const passwordHash = await hashPassword('Mobilis123!');

    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'driver@mobilis.app',
      fullName: 'Issa Driver',
      phoneNumber: null,
      passwordHash,
      role: UserRole.DRIVER,
      provider: 'EMAIL',
      isActive: true,
      isPhoneVerified: false,
      lastLoginAt: null,
      createdAt: new Date(),
      riderProfile: null,
      driverProfile: { id: 'driver-1', userId: 'user-1', status: 'ONLINE' },
    });
    prisma.userSession.create.mockResolvedValue({
      id: 'session-2',
      createdAt: new Date(),
      lastSeenAt: new Date(),
      expiresAt: new Date(Date.now() + 1000 * 60 * 60),
      revokedAt: null,
      userAgent: 'jest',
      ipAddress: '127.0.0.1',
    });
    prisma.user.update.mockResolvedValue(undefined);

    const result = await service.signIn(
      { email: 'driver@mobilis.app', password: 'Mobilis123!' },
      { userAgent: 'jest', ipAddress: '127.0.0.1' },
    );

    expect(result.user.role).toBe(UserRole.DRIVER);
    expect(result.sessionToken).toBeTruthy();
    expect(prisma.userSession.create).toHaveBeenCalled();
  });

  it('rejects sign-in with invalid credentials', async () => {
    const { prisma, service } = createService();
    const passwordHash = await hashPassword('Mobilis123!');

    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'driver@mobilis.app',
      fullName: 'Issa Driver',
      phoneNumber: null,
      passwordHash,
      role: UserRole.DRIVER,
      provider: 'EMAIL',
      isActive: true,
      isPhoneVerified: false,
      lastLoginAt: null,
      createdAt: new Date(),
      riderProfile: null,
      driverProfile: { id: 'driver-1', userId: 'user-1', status: 'ONLINE' },
    });

    await expect(
      service.signIn({
        email: 'driver@mobilis.app',
        password: 'WrongPassword1!',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('lists active sessions and marks the current one', async () => {
    const { prisma, service } = createService();
    const now = new Date();

    prisma.userSession.findMany.mockResolvedValue([
      {
        id: 'session-current',
        createdAt: now,
        lastSeenAt: now,
        expiresAt: now,
        revokedAt: null,
        userAgent: 'jest',
        ipAddress: '127.0.0.1',
      },
      {
        id: 'session-other',
        createdAt: now,
        lastSeenAt: now,
        expiresAt: now,
        revokedAt: null,
        userAgent: 'mobile',
        ipAddress: '10.0.0.2',
      },
    ]);

    const result = await service.listSessions({
      user: { id: 'user-1' },
      session: { id: 'session-current' },
    } as never);

    expect(result.sessions).toHaveLength(2);
    expect(prisma.userSession.findMany).toHaveBeenCalledWith({
      where: {
        userId: 'user-1',
        revokedAt: null,
        expiresAt: {
          gt: expect.any(Date),
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
    expect(result.sessions[0]?.isCurrent).toBe(true);
    expect(result.sessions[1]?.isCurrent).toBe(false);
  });

  it('revokes the targeted session on sign-out', async () => {
    const { prisma, service } = createService();
    const now = new Date();

    prisma.userSession.findFirst.mockResolvedValue({
      id: 'session-current',
      userId: 'user-1',
      createdAt: now,
      lastSeenAt: now,
      expiresAt: now,
      revokedAt: null,
      userAgent: 'jest',
      ipAddress: '127.0.0.1',
    });
    prisma.userSession.update.mockResolvedValue(undefined);

    const result = await service.signOut({
      user: { id: 'user-1' },
      session: { id: 'session-current' },
    } as never);

    expect(result.revokedSessionId).toBe('session-current');
    expect(prisma.userSession.update).toHaveBeenCalled();
  });
});
