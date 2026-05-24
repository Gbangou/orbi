import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../../core/prisma/prisma.service';
import { DEFAULT_WALLET_CURRENCY, SESSION_TTL_IN_DAYS } from './auth.constants';
import {
  hashPassword,
  verifyPassword,
  generateSessionToken,
  hashSessionToken,
} from './auth-crypto';
import type { AuthRequestMetadata } from './auth.metadata';
import { SignInDto } from './dto/sign-in.dto';
import { SignOutDto } from './dto/sign-out.dto';
import { SignUpDto } from './dto/sign-up.dto';
import { serializeAuthenticatedUser, serializeSession } from './auth.presenter';
import type { RequestAuthContext } from './auth.types';

// Politique de verrouillage de compte : défense en profondeur contre le brute-force
// même lorsque l'attaquant utilise plusieurs adresses IP.
// Seuils : 5 échecs → 15 min | 10 échecs → 1 h | 20+ échecs → 24 h
const LOCKOUT_THRESHOLDS: Array<{ minCount: number; lockMs: number }> = [
  { minCount: 20, lockMs: 24 * 60 * 60_000 },
  { minCount: 10, lockMs: 60 * 60_000 },
  { minCount: 5,  lockMs: 15 * 60_000 },
];

function computeLockoutDuration(failedCount: number): number {
  for (const threshold of LOCKOUT_THRESHOLDS) {
    if (failedCount >= threshold.minCount) return threshold.lockMs;
  }
  return 0;
}

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  async signUp(payload: SignUpDto, metadata: AuthRequestMetadata = {}) {
    const normalizedEmail = this.normalizeEmail(payload.email);
    const role = payload.role as UserRole;

    const existingUser = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true },
    });

    if (existingUser) {
      throw new ConflictException(
        'An account already exists with this email address.',
      );
    }

    const passwordHash = await hashPassword(payload.password);
    const session = this.createSessionSeed(metadata);

    const user = await this.prisma.user.create({
      // Un nouveau compte doit être immédiatement utilisable : portefeuille,
      // profil et première session sont créés en une seule écriture atomique.
      data: this.buildUserSignUpData(
        payload,
        normalizedEmail,
        passwordHash,
        role,
        session,
      ),
      include: {
        riderProfile: true,
        driverProfile: true,
        sessions: true,
      },
    });

    const currentSession = user.sessions[0];

    await this.logAuthEvent(user.id, 'SIGN_UP', metadata);

    return {
      message: 'Account created successfully.',
      sessionToken: session.token,
      user: serializeAuthenticatedUser(user),
      session: serializeSession(currentSession, true),
    };
  }

  async signIn(payload: SignInDto, metadata: AuthRequestMetadata = {}) {
    const normalizedEmail = this.normalizeEmail(payload.email);
    const user = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
      include: {
        riderProfile: true,
        driverProfile: true,
      },
    });

    // Réponse identique que l'utilisateur existe ou non — pas d'énumération d'email.
    if (!user?.passwordHash) {
      throw new UnauthorizedException('Invalid email or password.');
    }

    // Vérification du verrouillage avant de tester le mot de passe.
    const now = new Date();
    if (user.lockedUntil && user.lockedUntil > now) {
      const remainingSeconds = Math.ceil(
        (user.lockedUntil.getTime() - now.getTime()) / 1000,
      );
      throw new UnauthorizedException(
        `Account temporarily locked. Try again in ${remainingSeconds} seconds.`,
      );
    }

    if (!user.isActive) {
      throw new UnauthorizedException('This account is currently inactive.');
    }

    const isPasswordValid = await verifyPassword(
      payload.password,
      user.passwordHash,
    );

    if (!isPasswordValid) {
      // Incrémenter le compteur et recalculer le verrouillage.
      const newCount = user.failedLoginCount + 1;
      const lockMs = computeLockoutDuration(newCount);
      const lockedUntil = lockMs > 0 ? new Date(now.getTime() + lockMs) : null;
      await this.prisma.user.update({
        where: { id: user.id },
        data: { failedLoginCount: newCount, lockedUntil },
      });
      // Journaliser l'échec pour la surveillance de sécurité.
      await this.logAuthEvent(user.id, 'SIGN_IN_FAILED', metadata, {
        failedLoginCount: newCount,
        lockedUntil: lockedUntil?.toISOString() ?? null,
      });
      throw new UnauthorizedException('Invalid email or password.');
    }

    // Connexion réussie : réinitialiser le compteur d'échecs et mettre à jour lastLoginAt.
    const sessionSeed = this.createSessionSeed(metadata);

    const [session] = await this.prisma.$transaction([
      this.prisma.userSession.create({
        data: {
          userId: user.id,
          tokenHash: sessionSeed.tokenHash,
          expiresAt: sessionSeed.expiresAt,
          userAgent: sessionSeed.userAgent,
          ipAddress: sessionSeed.ipAddress,
        },
      }),
      this.prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: now, failedLoginCount: 0, lockedUntil: null },
      }),
    ]);

    if (user.role === UserRole.DRIVER) {
      await this.revokeOtherActiveSessions(user.id, session.id);
    }

    await this.logAuthEvent(user.id, 'SIGN_IN_SUCCESS', metadata);

    return {
      message: 'Signed in successfully.',
      sessionToken: sessionSeed.token,
      user: serializeAuthenticatedUser({ ...user, lastLoginAt: now }),
      session: serializeSession(session, true),
    };
  }

  me(auth: RequestAuthContext) {
    return {
      user: serializeAuthenticatedUser(auth.user),
      session: serializeSession(auth.session, true),
    };
  }

  async listSessions(auth: RequestAuthContext) {
    const now = new Date();
    const sessions = await this.prisma.userSession.findMany({
      where: {
        userId: auth.user.id,
        revokedAt: null,
        expiresAt: {
          gt: now,
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return {
      sessions: sessions.map((session) =>
        serializeSession(session, session.id === auth.session.id),
      ),
    };
  }

  async signOut(auth: RequestAuthContext, payload: SignOutDto = {}) {
    const targetSessionId = payload.sessionId ?? auth.session.id;

    const session = await this.prisma.userSession.findFirst({
      where: {
        id: targetSessionId,
        userId: auth.user.id,
        revokedAt: null,
      },
    });

    if (!session) {
      throw new UnauthorizedException(
        'The requested session could not be revoked.',
      );
    }

    await this.prisma.userSession.update({
      where: { id: session.id },
      data: { revokedAt: new Date() },
    });

    await this.logAuthEvent(auth.user.id, 'SIGN_OUT', {
      ipAddress: auth.session.ipAddress ?? undefined,
      userAgent: auth.session.userAgent ?? undefined,
    });

    return {
      message: 'Session revoked successfully.',
      revokedSessionId: session.id,
    };
  }

  // ── Droit à l'effacement RGPD / GDPR Right to Erasure ────────────────────────
  // Anonymise les données personnelles identifiables tout en conservant les
  // enregistrements financiers (courses, paiements) requis par la loi.
  async deleteAccount(auth: RequestAuthContext) {
    const userId = auth.user.id;
    const anonymizedEmail = `deleted_${userId}@deleted.orbi`;

    await this.prisma.$transaction([
      // Anonymisation des champs PII de l'utilisateur.
      this.prisma.user.update({
        where: { id: userId },
        data: {
          email: anonymizedEmail,
          fullName: 'Compte supprimé',
          phoneNumber: null,
          passwordHash: null,
          isActive: false,
        },
      }),
      // Révocation immédiate de toutes les sessions actives.
      this.prisma.userSession.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    await this.logAuthEvent(userId, 'SIGN_OUT', {
      ipAddress: auth.session.ipAddress ?? undefined,
      userAgent: auth.session.userAgent ?? undefined,
    });

    return { message: 'Account data anonymized and all sessions revoked.' };
  }

  private async logAuthEvent(
    userId: string,
    action: 'SIGN_IN_SUCCESS' | 'SIGN_IN_FAILED' | 'SIGN_UP' | 'SIGN_OUT',
    metadata: AuthRequestMetadata = {},
    extra?: Record<string, unknown>,
  ) {
    try {
      await this.prisma.auditLog.create({
        data: {
          userId,
          action,
          entityType: 'UserSession',
          entityId: userId,
          metadata: {
            ipAddress: metadata.ipAddress ?? null,
            userAgent: metadata.userAgent ?? null,
            ...extra,
          },
        },
      });
    } catch {
      // Non-bloquant : une erreur de log ne doit pas impacter l'auth.
    }
  }

  private async revokeOtherActiveSessions(
    userId: string,
    currentSessionId: string,
  ) {
    await this.prisma.userSession.updateMany({
      where: {
        userId,
        id: {
          not: currentSessionId,
        },
        revokedAt: null,
        expiresAt: {
          gt: new Date(),
        },
      },
      data: {
        revokedAt: new Date(),
      },
    });
  }

  private createSessionExpiryDate() {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + SESSION_TTL_IN_DAYS);

    return expiresAt;
  }

  private normalizeEmail(email: string) {
    return email.trim().toLowerCase();
  }

  private createSessionSeed(metadata: AuthRequestMetadata) {
    const token = generateSessionToken();

    return {
      token,
      tokenHash: hashSessionToken(token),
      expiresAt: this.createSessionExpiryDate(),
      userAgent: metadata.userAgent,
      ipAddress: metadata.ipAddress,
    };
  }

  private buildUserSignUpData(
    payload: SignUpDto,
    normalizedEmail: string,
    passwordHash: string,
    role: UserRole,
    session: ReturnType<AuthService['createSessionSeed']>,
  ) {
    return {
      email: normalizedEmail,
      fullName: payload.fullName.trim(),
      passwordHash,
      role,
      lastLoginAt: new Date(),
      phoneNumber: payload.phoneNumber ?? undefined,
      wallets: {
        create: {
          currency: DEFAULT_WALLET_CURRENCY,
        },
      },
      riderProfile:
        role === UserRole.RIDER
          ? {
              create: {},
            }
          : undefined,
      driverProfile:
        role === UserRole.DRIVER
          ? {
              create: {},
            }
          : undefined,
      sessions: {
        create: {
          tokenHash: session.tokenHash,
          expiresAt: session.expiresAt,
          userAgent: session.userAgent,
          ipAddress: session.ipAddress,
        },
      },
    };
  }
}
