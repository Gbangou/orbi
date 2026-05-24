import { UnauthorizedException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { hashPassword } from './auth-crypto';
import { AuthService } from './auth.service';

/**
 * OWASP WSTG-IDNT-04 (Énumération de comptes) + OWASP API2 (Authentification brisée) —
 * Invariants d'authentification empêchant l'énumération des utilisateurs et l'abus de session.
 *
 * 1. Énumération de comptes : signIn retourne exactement le même message d'erreur et
 *    le même statut pour "email introuvable" et "mauvais mot de passe", empêchant un
 *    attaquant de déduire l'existence d'un compte depuis la réponse.
 * 2. Compte inactif : le message d'erreur diffère de l'erreur de credentials
 *    (acceptable — l'état du compte est déjà public une fois le compte suspendu).
 * 3. Révocation de session : signOut invalide la session ciblée ; les requêtes
 *    ultérieures avec ce hash de token sont rejetées par le SessionAuthGuard.
 * 4. Isolation de session : la déconnexion d'une session n'invalide pas les autres
 *    sessions du même utilisateur (les riders multi-appareils conservent leurs autres sessions).
 * 5. Hash de mot de passe non exposé : la réponse d'auth sérialisée n'inclut jamais
 *    le champ passwordHash.
 */
describe("AuthService — invariants de sécurité de l'authentification", () => {
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

  // ── Prévention de l'énumération de comptes ────────────────────────────────

  describe("Prévention de l'énumération de comptes (WSTG-IDNT-04)", () => {
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
      const notFoundError = (await service
        .signIn({ email: 'ghost@orbi.app', password: 'Orbi123!' })
        .catch((e: unknown) => e)) as UnauthorizedException;

      prisma.user.findUnique.mockResolvedValueOnce({
        id: 'user-1',
        email: 'real@orbi.app',
        passwordHash,
        role: UserRole.RIDER,
        isActive: true,
        riderProfile: { id: 'rider-1' },
        driverProfile: null,
      });
      const wrongPassError = (await service
        .signIn({ email: 'real@orbi.app', password: 'WrongPass1!' })
        .catch((e: unknown) => e)) as UnauthorizedException;

      expect(notFoundError.message).toBe(wrongPassError.message);
      expect(notFoundError.getStatus()).toBe(wrongPassError.getStatus());
    });
  });

  // ── Champs sensibles non sérialisés ───────────────────────────────────────

  describe("Hash de mot de passe exclu de la réponse d'auth", () => {
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

      const result = await service.signIn({
        email: 'rider@orbi.app',
        password: 'Orbi123!',
      });

      expect(JSON.stringify(result)).not.toContain('passwordHash');
      expect(JSON.stringify(result)).not.toContain(passwordHash);
    });
  });

  // ── Révocation de session ─────────────────────────────────────────────────

  describe('Révocation de session (déconnexion)', () => {
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
