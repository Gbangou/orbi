import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { hashPassword } from './auth-crypto';
import { SignUpRole } from './dto/sign-up.dto';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  const SESSION_STUB = {
    id: 'session-1',
    createdAt: new Date(),
    lastSeenAt: new Date(),
    expiresAt: new Date(Date.now() + 1000 * 60 * 60),
    revokedAt: null,
    userAgent: 'jest',
    ipAddress: '127.0.0.1',
  };

  function makeUser(overrides: Record<string, unknown> = {}) {
    return {
      id: 'user-1',
      email: 'driver@orbi.app',
      fullName: 'Issa Driver',
      phoneNumber: null,
      passwordHash: null,
      role: UserRole.DRIVER,
      provider: 'EMAIL',
      isActive: true,
      isPhoneVerified: false,
      lastLoginAt: null,
      failedLoginCount: 0,
      lockedUntil: null,
      createdAt: new Date(),
      riderProfile: null,
      driverProfile: { id: 'driver-1', userId: 'user-1', status: 'ONLINE' },
      ...overrides,
    };
  }

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
        updateMany: jest.fn(),
      },
      auditLog: {
        create: jest.fn().mockResolvedValue(undefined),
      },
      // $transaction exécute les opérations reçues et renvoie leurs résultats.
      $transaction: jest.fn(async (ops: unknown[]) =>
        Promise.all(ops.map((op) => Promise.resolve(op))),
      ),
    };

    return {
      prisma,
      service: new AuthService(prisma as never),
    };
  }

  // ── Sign-up ──────────────────────────────────────────────────────────────────

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
        failedLoginCount: 0,
        lockedUntil: null,
        lastLoginAt: new Date(),
        createdAt: new Date(),
        riderProfile: { id: 'rider-1', userId: 'user-1' },
        driverProfile: null,
        sessions: [SESSION_STUB],
      }),
    );

    const result = await service.signUp(
      {
        email: 'rider@orbi.app',
        fullName: 'Awa Rider',
        password: 'Orbi123!',
        role: SignUpRole.RIDER,
      },
      { userAgent: 'jest', ipAddress: '127.0.0.1' },
    );

    expect(result.user.role).toBe(UserRole.RIDER);
    expect(result.user.riderProfile?.id).toBe('rider-1');
    expect(result.sessionToken).toBeTruthy();
    expect(prisma.user.create).toHaveBeenCalled();
  });

  it('rejects sign-up when email already exists', async () => {
    const { prisma, service } = createService();
    prisma.user.findUnique.mockResolvedValue({ id: 'existing-user' });

    await expect(
      service.signUp({
        email: 'rider@orbi.app',
        fullName: 'Awa Rider',
        password: 'Orbi123!',
        role: SignUpRole.RIDER,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  // ── Sign-in ──────────────────────────────────────────────────────────────────

  it('signs in with valid credentials and returns a session token', async () => {
    const { prisma, service } = createService();
    const passwordHash = await hashPassword('Orbi123!');

    prisma.user.findUnique.mockResolvedValue(makeUser({ passwordHash }));
    // $transaction returns [session, updatedUser]
    prisma.$transaction.mockResolvedValue([
      { ...SESSION_STUB, id: 'session-2' },
      undefined,
    ]);
    prisma.userSession.updateMany.mockResolvedValue(undefined);

    const result = await service.signIn(
      { email: 'driver@orbi.app', password: 'Orbi123!' },
      { userAgent: 'jest', ipAddress: '127.0.0.1' },
    );

    expect(result.user.role).toBe(UserRole.DRIVER);
    expect(result.sessionToken).toBeTruthy();
    expect(prisma.$transaction).toHaveBeenCalled();
    // Driver single-device: other sessions revoked.
    expect(prisma.userSession.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ userId: 'user-1' }) }),
    );
  });

  it('keeps rider multi-device sessions active on sign-in', async () => {
    const { prisma, service } = createService();
    const passwordHash = await hashPassword('Orbi123!');

    prisma.user.findUnique.mockResolvedValue(
      makeUser({
        id: 'rider-user-1',
        email: 'rider@orbi.app',
        role: UserRole.RIDER,
        passwordHash,
        riderProfile: { id: 'rider-1', userId: 'rider-user-1' },
        driverProfile: null,
      }),
    );
    prisma.$transaction.mockResolvedValue([
      { ...SESSION_STUB, id: 'rider-session-2' },
      undefined,
    ]);

    const result = await service.signIn(
      { email: 'rider@orbi.app', password: 'Orbi123!' },
      { userAgent: 'jest', ipAddress: '127.0.0.1' },
    );

    expect(result.user.role).toBe(UserRole.RIDER);
    expect(prisma.userSession.updateMany).not.toHaveBeenCalled();
  });

  it('rejects sign-in with invalid credentials and increments failedLoginCount', async () => {
    const { prisma, service } = createService();
    const passwordHash = await hashPassword('Orbi123!');

    prisma.user.findUnique.mockResolvedValue(
      makeUser({ passwordHash, failedLoginCount: 0 }),
    );
    prisma.user.update.mockResolvedValue(undefined);

    await expect(
      service.signIn({ email: 'driver@orbi.app', password: 'WrongPassword1!' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    // Doit incrémenter le compteur d'échecs.
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ failedLoginCount: 1 }),
      }),
    );
  });

  it('locks account for 15 minutes after 5 consecutive failed logins', async () => {
    const { prisma, service } = createService();
    const passwordHash = await hashPassword('Orbi123!');

    // 4 échecs déjà enregistrés → prochain échec = 5ème → lockout 15 min.
    prisma.user.findUnique.mockResolvedValue(
      makeUser({ passwordHash, failedLoginCount: 4 }),
    );
    prisma.user.update.mockResolvedValue(undefined);

    await expect(
      service.signIn({ email: 'driver@orbi.app', password: 'WrongAgain1!' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          failedLoginCount: 5,
          lockedUntil: expect.any(Date),
        }),
      }),
    );
  });

  it('refuses sign-in while account is locked', async () => {
    const { prisma, service } = createService();
    const passwordHash = await hashPassword('Orbi123!');
    const futureDate = new Date(Date.now() + 10 * 60 * 1000); // +10 min

    prisma.user.findUnique.mockResolvedValue(
      makeUser({ passwordHash, failedLoginCount: 5, lockedUntil: futureDate }),
    );

    const error = await service
      .signIn({ email: 'driver@orbi.app', password: 'Orbi123!' })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(UnauthorizedException);
    // Même avec le bon mot de passe, le compte verrouillé doit être refusé.
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('resets failedLoginCount and lockedUntil on successful sign-in', async () => {
    const { prisma, service } = createService();
    const passwordHash = await hashPassword('Orbi123!');

    // Compte précédemment partiellement verrouillé (2 échecs, pas encore locked).
    prisma.user.findUnique.mockResolvedValue(
      makeUser({ passwordHash, failedLoginCount: 2, lockedUntil: null }),
    );
    prisma.$transaction.mockResolvedValue([{ ...SESSION_STUB }, undefined]);

    await service.signIn(
      { email: 'driver@orbi.app', password: 'Orbi123!' },
      { userAgent: 'jest', ipAddress: '127.0.0.1' },
    );

    // La transaction doit inclure un update qui remet failedLoginCount à 0.
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ failedLoginCount: 0, lockedUntil: null }),
      }),
    );
  });

  it('logs SIGN_IN_FAILED to audit log on wrong password', async () => {
    const { prisma, service } = createService();
    const passwordHash = await hashPassword('Orbi123!');
    prisma.user.findUnique.mockResolvedValue(makeUser({ passwordHash }));
    prisma.user.update.mockResolvedValue(undefined);

    await expect(
      service.signIn({ email: 'driver@orbi.app', password: 'Bad1!' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'SIGN_IN_FAILED' }),
      }),
    );
  });

  it('logs SIGN_IN_SUCCESS to audit log on correct password', async () => {
    const { prisma, service } = createService();
    const passwordHash = await hashPassword('Orbi123!');
    prisma.user.findUnique.mockResolvedValue(
      makeUser({ passwordHash, role: UserRole.RIDER }),
    );
    prisma.$transaction.mockResolvedValue([{ ...SESSION_STUB }, undefined]);

    await service.signIn(
      { email: 'driver@orbi.app', password: 'Orbi123!' },
      { userAgent: 'jest', ipAddress: '127.0.0.1' },
    );

    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'SIGN_IN_SUCCESS' }),
      }),
    );
  });

  // ── Sessions ─────────────────────────────────────────────────────────────────

  it('lists active sessions and marks the current one', async () => {
    const { prisma, service } = createService();
    const now = new Date();

    prisma.userSession.findMany.mockResolvedValue([
      { ...SESSION_STUB, id: 'session-current' },
      { ...SESSION_STUB, id: 'session-other', ipAddress: '10.0.0.2' },
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
        expiresAt: { gt: expect.any(Date) },
      },
      orderBy: { createdAt: 'desc' },
    });
    expect(result.sessions[0]?.isCurrent).toBe(true);
    expect(result.sessions[1]?.isCurrent).toBe(false);
    void now;
  });

  it('revokes the targeted session on sign-out', async () => {
    const { prisma, service } = createService();

    prisma.userSession.findFirst.mockResolvedValue({
      ...SESSION_STUB,
      id: 'session-current',
      userId: 'user-1',
    });
    prisma.userSession.update.mockResolvedValue(undefined);

    const result = await service.signOut({
      user: { id: 'user-1' },
      session: { id: 'session-current', ipAddress: '127.0.0.1', userAgent: 'jest' },
    } as never);

    expect(result.revokedSessionId).toBe('session-current');
    expect(prisma.userSession.update).toHaveBeenCalled();
  });

  // ── RGPD account deletion ─────────────────────────────────────────────────────

  it('anonymizes PII and revokes all sessions on account deletion', async () => {
    const { prisma, service } = createService();
    prisma.$transaction.mockResolvedValue([undefined, undefined]);

    const result = await service.deleteAccount({
      user: { id: 'user-1' },
      session: { id: 'session-current', ipAddress: '127.0.0.1', userAgent: 'jest' },
    } as never);

    expect(result.message).toContain('anonymized');
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          phoneNumber: null,
          passwordHash: null,
          isActive: false,
        }),
      }),
    );
    expect(prisma.userSession.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ revokedAt: expect.any(Date) }),
      }),
    );
  });
});
