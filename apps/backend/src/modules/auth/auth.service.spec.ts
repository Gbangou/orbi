import {
  BadRequestException,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { hashPassword, hashOtpCode } from './auth-crypto';
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
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      driverProfile: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      phoneOtp: {
        create: jest.fn().mockResolvedValue(undefined),
        findFirst: jest.fn(),
        update: jest.fn().mockResolvedValue(undefined),
      },
      auditLog: {
        create: jest.fn().mockResolvedValue(undefined),
      },
      // $transaction exécute les opérations reçues et renvoie leurs résultats.
      $transaction: jest.fn(async (ops: unknown[]) =>
        Promise.all(ops.map((op) => Promise.resolve(op))),
      ),
    };

    const notifications = {
      enqueue: jest.fn().mockResolvedValue({ notification: { id: 'notif-1' } }),
    };

    return {
      prisma,
      notifications,
      service: new AuthService(prisma as never, notifications as never),
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
      expect.objectContaining({
        where: expect.objectContaining({ userId: 'user-1' }),
      }),
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

  it('rejects sign-in when credentials are correct but the account is a different role than the calling app expects', async () => {
    const { prisma, service } = createService();
    const passwordHash = await hashPassword('Orbi123!');

    // Compte chauffeur reel, mais l'app passagere s'attend a un rider.
    prisma.user.findUnique.mockResolvedValue(
      makeUser({ role: UserRole.DRIVER, passwordHash }),
    );

    await expect(
      service.signIn({
        email: 'driver@orbi.app',
        password: 'Orbi123!',
        expectedRole: SignUpRole.RIDER,
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    // Le mot de passe etait correct : pas de comptage d'echec ni de session creee.
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'SIGN_IN_ROLE_MISMATCH' }),
      }),
    );
  });

  it('allows sign-in without expectedRole (admin-web) regardless of the account role', async () => {
    const { prisma, service } = createService();
    const passwordHash = await hashPassword('Orbi123!');

    prisma.user.findUnique.mockResolvedValue(
      makeUser({ role: UserRole.ADMIN, passwordHash }),
    );
    prisma.$transaction.mockResolvedValue([
      { ...SESSION_STUB, id: 'session-admin' },
      undefined,
    ]);

    const result = await service.signIn({
      email: 'driver@orbi.app',
      password: 'Orbi123!',
    });

    expect(result.user.role).toBe(UserRole.ADMIN);
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
        data: expect.objectContaining({
          failedLoginCount: 0,
          lockedUntil: null,
        }),
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

  // ── Détection nouvel appareil ─────────────────────────────────────────────────

  it('flags isNewDevice when userAgent has never signed in before', async () => {
    const { prisma, service } = createService();
    const passwordHash = await hashPassword('Orbi123!');

    prisma.user.findUnique.mockResolvedValue(
      makeUser({ passwordHash, role: UserRole.RIDER }),
    );
    prisma.$transaction.mockResolvedValue([
      { ...SESSION_STUB, id: 'new-session' },
      undefined,
    ]);
    // Previous sessions exist but with a different userAgent.
    prisma.userSession.findMany.mockResolvedValue([
      { userAgent: 'OldDevice/1.0' },
      { userAgent: 'OldDevice/2.0' },
    ]);

    const result = await service.signIn(
      { email: 'driver@orbi.app', password: 'Orbi123!' },
      { userAgent: 'NewDevice/3.0', ipAddress: '127.0.0.1' },
    );

    expect(result.isNewDevice).toBe(true);
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'NEW_DEVICE_SIGN_IN' }),
      }),
    );
  });

  it('does not flag isNewDevice for a known userAgent', async () => {
    const { prisma, service } = createService();
    const passwordHash = await hashPassword('Orbi123!');

    prisma.user.findUnique.mockResolvedValue(
      makeUser({ passwordHash, role: UserRole.RIDER }),
    );
    prisma.$transaction.mockResolvedValue([
      { ...SESSION_STUB, id: 'returning-session' },
      undefined,
    ]);
    // Same userAgent as one of the previous sessions.
    prisma.userSession.findMany.mockResolvedValue([
      { userAgent: 'KnownDevice/1.0' },
    ]);

    const result = await service.signIn(
      { email: 'driver@orbi.app', password: 'Orbi123!' },
      { userAgent: 'KnownDevice/1.0', ipAddress: '127.0.0.1' },
    );

    expect(result.isNewDevice).toBe(false);
  });

  it('does not flag isNewDevice on the very first sign-in (no prior sessions)', async () => {
    const { prisma, service } = createService();
    const passwordHash = await hashPassword('Orbi123!');

    prisma.user.findUnique.mockResolvedValue(
      makeUser({ passwordHash, role: UserRole.RIDER }),
    );
    prisma.$transaction.mockResolvedValue([
      { ...SESSION_STUB, id: 'first-session' },
      undefined,
    ]);
    // No previous sessions at all.
    prisma.userSession.findMany.mockResolvedValue([]);

    const result = await service.signIn(
      { email: 'driver@orbi.app', password: 'Orbi123!' },
      { userAgent: 'FirstDevice/1.0', ipAddress: '127.0.0.1' },
    );

    expect(result.isNewDevice).toBe(false);
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
      session: {
        id: 'session-current',
        ipAddress: '127.0.0.1',
        userAgent: 'jest',
      },
    } as never);

    expect(result.revokedSessionId).toBe('session-current');
    expect(prisma.userSession.update).toHaveBeenCalled();
  });

  it('clears online driver presence on current driver sign-out when no trip is active', async () => {
    const { prisma, service } = createService();

    prisma.userSession.findFirst.mockResolvedValue({
      ...SESSION_STUB,
      id: 'session-current',
      userId: 'user-1',
    });
    prisma.userSession.update.mockResolvedValue(undefined);

    await service.signOut({
      user: { id: 'user-1', role: UserRole.DRIVER },
      session: {
        id: 'session-current',
        ipAddress: '127.0.0.1',
        userAgent: 'jest',
      },
    } as never);

    expect(prisma.driverProfile.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        userId: 'user-1',
        status: 'ONLINE',
        assignedTrips: {
          none: {
            status: {
              in: ['MATCHED', 'DRIVER_ARRIVING', 'IN_PROGRESS'],
            },
          },
        },
      }),
      data: {
        status: 'OFFLINE',
        currentLatitude: null,
        currentLongitude: null,
      },
    });
  });

  // ── RGPD account deletion ─────────────────────────────────────────────────────

  it('anonymizes PII and revokes all sessions on account deletion', async () => {
    const { prisma, service } = createService();
    prisma.$transaction.mockResolvedValue([undefined, undefined]);

    const result = await service.deleteAccount({
      user: { id: 'user-1' },
      session: {
        id: 'session-current',
        ipAddress: '127.0.0.1',
        userAgent: 'jest',
      },
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

  // ── Phone OTP ────────────────────────────────────────────────────────────────

  describe('sendPhoneOtp', () => {
    it('stores a hashed OTP with an expiry and never persists the raw code', async () => {
      const { prisma, service } = createService();

      await service.sendPhoneOtp({
        phoneNumber: '+22670000000',
        role: SignUpRole.RIDER,
      });

      expect(prisma.phoneOtp.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            phoneNumber: '+22670000000',
            role: UserRole.RIDER,
            codeHash: expect.any(String),
            expiresAt: expect.any(Date),
          }),
        }),
      );
      const { codeHash } = prisma.phoneOtp.create.mock.calls[0][0].data;
      expect(codeHash).not.toMatch(/^\d{6}$/);
    });
  });

  describe('verifyPhoneOtp', () => {
    function stubOtp(code: string, overrides: Record<string, unknown> = {}) {
      return {
        id: 'otp-1',
        phoneNumber: '+22670000000',
        role: UserRole.RIDER,
        codeHash: hashOtpCode(code),
        attempts: 0,
        expiresAt: new Date(Date.now() + 60_000),
        consumedAt: null,
        createdAt: new Date(),
        ...overrides,
      };
    }

    it('rejects when no active OTP exists for the phone number', async () => {
      const { prisma, service } = createService();
      prisma.phoneOtp.findFirst.mockResolvedValue(null);

      await expect(
        service.verifyPhoneOtp({
          phoneNumber: '+22670000000',
          code: '123456',
          role: SignUpRole.RIDER,
        }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('increments attempts and rejects on a wrong code', async () => {
      const { prisma, service } = createService();
      prisma.phoneOtp.findFirst.mockResolvedValue(stubOtp('111111'));

      await expect(
        service.verifyPhoneOtp({
          phoneNumber: '+22670000000',
          code: '999999',
          role: SignUpRole.RIDER,
        }),
      ).rejects.toBeInstanceOf(UnauthorizedException);

      expect(prisma.phoneOtp.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'otp-1' },
          data: { attempts: { increment: 1 } },
        }),
      );
    });

    it('rejects once max verify attempts have been reached', async () => {
      const { prisma, service } = createService();
      prisma.phoneOtp.findFirst.mockResolvedValue(
        stubOtp('111111', { attempts: 5 }),
      );

      await expect(
        service.verifyPhoneOtp({
          phoneNumber: '+22670000000',
          code: '111111',
          role: SignUpRole.RIDER,
        }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('requires fullName to create a new account on first verification', async () => {
      const { prisma, service } = createService();
      prisma.phoneOtp.findFirst.mockResolvedValue(stubOtp('111111'));
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.verifyPhoneOtp({
          phoneNumber: '+22670000000',
          code: '111111',
          role: SignUpRole.RIDER,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('creates a new account with a placeholder email on first verification', async () => {
      const { prisma, service } = createService();
      prisma.phoneOtp.findFirst.mockResolvedValue(stubOtp('111111'));
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockImplementation(
        ({ data }: { data: Record<string, unknown> }) => ({
          id: 'user-new',
          email: data.email,
          fullName: data.fullName,
          phoneNumber: data.phoneNumber,
          role: data.role,
          provider: 'PHONE',
          isActive: true,
          isPhoneVerified: true,
          failedLoginCount: 0,
          lockedUntil: null,
          lastLoginAt: new Date(),
          createdAt: new Date(),
          riderProfile: { id: 'rider-2' },
          driverProfile: null,
          sessions: [SESSION_STUB],
        }),
      );

      const result = await service.verifyPhoneOtp({
        phoneNumber: '+22670000000',
        code: '111111',
        role: SignUpRole.RIDER,
        fullName: 'Fatou Rider',
      });

      expect(result.user.phoneNumber).toBe('+22670000000');
      expect(result.user.email).toContain('phone-22670000000@');
      expect(result.sessionToken).toBeTruthy();
      expect(prisma.phoneOtp.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'otp-1' },
          data: { consumedAt: expect.any(Date) },
        }),
      );
    });

    it('signs in an existing verified phone user without requiring fullName', async () => {
      const { prisma, service } = createService();
      prisma.phoneOtp.findFirst.mockResolvedValue(stubOtp('111111'));
      prisma.user.findUnique.mockResolvedValue(
        makeUser({ role: UserRole.RIDER, phoneNumber: '+22670000000' }),
      );
      prisma.$transaction.mockResolvedValue([
        { ...SESSION_STUB, id: 'session-otp' },
        undefined,
      ]);

      const result = await service.verifyPhoneOtp({
        phoneNumber: '+22670000000',
        code: '111111',
        role: SignUpRole.RIDER,
      });

      expect(result.user.isPhoneVerified).toBe(true);
      expect(result.sessionToken).toBeTruthy();
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it('rejects verification when the phone number is already registered under a different role', async () => {
      const { prisma, service } = createService();
      prisma.phoneOtp.findFirst.mockResolvedValue(stubOtp('111111'));
      // Le numero est deja un compte chauffeur reel, mais l'OTP a ete verifie
      // via l'app passagere (role: RIDER dans la requete).
      prisma.user.findUnique.mockResolvedValue(
        makeUser({ role: UserRole.DRIVER, phoneNumber: '+22670000000' }),
      );

      await expect(
        service.verifyPhoneOtp({
          phoneNumber: '+22670000000',
          code: '111111',
          role: SignUpRole.RIDER,
        }),
      ).rejects.toBeInstanceOf(UnauthorizedException);

      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: 'SIGN_IN_ROLE_MISMATCH' }),
        }),
      );
    });
  });
});
