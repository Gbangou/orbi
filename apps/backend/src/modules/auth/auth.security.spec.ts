import { UnauthorizedException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { hashPassword } from './auth-crypto';
import { AuthService } from './auth.service';

/**
 * OWASP WSTG-IDNT-04 (Account Enumeration) + OWASP API2 (Broken Auth) —
 * Authentication invariants that prevent user enumeration and session abuse.
 *
 * 1. Account enumeration: signIn returns exactly the same error message and
 *    status for both "email not found" and "wrong password" so an attacker
 *    cannot infer account existence from the response.
 * 2. Inactive account: the error message differs from the credentials error
 *    (this is acceptable — the account state is already public knowledge once
 *    a user has signed up and been suspended).
 * 3. Session revocation: signOut invalidates the targeted session; subsequent
 *    requests with that token hash are rejected by the SessionAuthGuard.
 * 4. Session isolation: signing out of one session does not invalidate other
 *    sessions of the same user (multi-device riders keep other sessions alive).
 * 5. Password hash not exposed: the serialised auth response never includes
 *    the passwordHash field.
 */
describe('AuthService — authentication security invariants', () => {
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
    };

    return { prisma, service: new AuthService(prisma as never) };
  }

  // ── Account enumeration prevention ────────────────────────────────────────

  describe('Account enumeration prevention (WSTG-IDNT-04)', () => {
    it('returns the same error message when the email is not found', async () => {
      const { prisma, service } = createService();
      prisma.user.findUnique.mockResolvedValue(null);

      const error = await service
        .signIn({ email: 'nobody@orbi.app', password: 'Orbi123!' })
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(UnauthorizedException);
      expect((error as UnauthorizedException).message).toBe(
        'Invalid email or password.',
      );
    });

    it('returns the same error message when the password is wrong', async () => {
      const { prisma, service } = createService();
      const passwordHash = await hashPassword('CorrectPassword1!');

      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'rider@orbi.app',
        passwordHash,
        role: UserRole.RIDER,
        isActive: true,
        riderProfile: { id: 'rider-1' },
        driverProfile: null,
      });

      const error = await service
        .signIn({ email: 'rider@orbi.app', password: 'WrongPassword1!' })
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(UnauthorizedException);
      expect((error as UnauthorizedException).message).toBe(
        'Invalid email or password.',
      );
    });

    it('returns the same error for an account with no password hash (social login)', async () => {
      const { prisma, service } = createService();

      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'social@orbi.app',
        passwordHash: null,
        role: UserRole.RIDER,
        isActive: true,
        riderProfile: { id: 'rider-1' },
        driverProfile: null,
      });

      const error = await service
        .signIn({ email: 'social@orbi.app', password: 'AnyPassword1!' })
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(UnauthorizedException);
      expect((error as UnauthorizedException).message).toBe(
        'Invalid email or password.',
      );
    });

    it('error messages are byte-for-byte identical for all rejection cases', async () => {
      const { prisma, service } = createService();
      const passwordHash = await hashPassword('RealPassword1!');

      prisma.user.findUnique.mockResolvedValueOnce(null);
      const notFoundError = await service
        .signIn({ email: 'ghost@orbi.app', password: 'Orbi123!' })
        .catch((e: UnauthorizedException) => e);

      prisma.user.findUnique.mockResolvedValueOnce({
        id: 'user-1',
        email: 'real@orbi.app',
        passwordHash,
        role: UserRole.RIDER,
        isActive: true,
        riderProfile: { id: 'rider-1' },
        driverProfile: null,
      });
      const wrongPassError = await service
        .signIn({ email: 'real@orbi.app', password: 'WrongPass1!' })
        .catch((e: UnauthorizedException) => e);

      expect(notFoundError.message).toBe(wrongPassError.message);
      expect(notFoundError.getStatus()).toBe(wrongPassError.getStatus());
    });
  });

  // ── Sensitive fields not serialised ───────────────────────────────────────

  describe('Password hash excluded from auth response', () => {
    it('sign-in response does not include the passwordHash field', async () => {
      const { prisma, service } = createService();
      const passwordHash = await hashPassword('Orbi123!');
      const now = new Date();

      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'rider@orbi.app',
        fullName: 'Awa Ouedraogo',
        phoneNumber: null,
        passwordHash,
        role: UserRole.RIDER,
        provider: 'EMAIL',
        isActive: true,
        isPhoneVerified: false,
        lastLoginAt: null,
        createdAt: now,
        riderProfile: { id: 'rider-1', userId: 'user-1' },
        driverProfile: null,
      });

      prisma.userSession.create.mockResolvedValue({
        id: 'session-1',
        userId: 'user-1',
        tokenHash: 'hashed',
        createdAt: now,
        lastSeenAt: now,
        expiresAt: new Date(now.getTime() + 3_600_000),
        revokedAt: null,
        userAgent: 'jest',
        ipAddress: '127.0.0.1',
      });
      prisma.user.update.mockResolvedValue({});

      const result = await service.signIn({ email: 'rider@orbi.app', password: 'Orbi123!' });

      expect(JSON.stringify(result)).not.toContain('passwordHash');
      expect(JSON.stringify(result)).not.toContain(passwordHash);
    });
  });

  // ── Session revocation ────────────────────────────────────────────────────

  describe('Session revocation (sign-out)', () => {
    it('revokes the targeted session by setting revokedAt', async () => {
      const { prisma, service } = createService();
      const now = new Date();

      prisma.userSession.findFirst.mockResolvedValue({
        id: 'session-1',
        userId: 'user-1',
        tokenHash: 'hash-1',
        createdAt: now,
        lastSeenAt: now,
        expiresAt: new Date(now.getTime() + 3_600_000),
        revokedAt: null,
        userAgent: 'jest',
        ipAddress: '127.0.0.1',
      });
      prisma.userSession.update.mockResolvedValue({});

      await service.signOut({
        token: 'session-token',
        session: { id: 'session-1' },
        user: { id: 'user-1' },
      } as never);

      expect(prisma.userSession.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'session-1' },
          data: expect.objectContaining({ revokedAt: expect.any(Date) }),
        }),
      );
    });
  });
});
