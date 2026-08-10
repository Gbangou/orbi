import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthProvider, DriverStatus, NotificationChannel, ServiceTier, TripStatus, UserRole, VehicleType, VerificationStatus } from '@prisma/client';
import { PrismaService } from '../../core/prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  DEFAULT_WALLET_CURRENCY,
  ACCESS_TOKEN_TTL_IN_MINUTES,
  PHONE_OTP_MAX_VERIFY_ATTEMPTS,
  PHONE_OTP_MAX_ACTIVE_CODES_PER_PHONE,
  PHONE_OTP_TTL_IN_MINUTES,
  REFRESH_TOKEN_TTL_IN_DAYS,
} from './auth.constants';
import {
  hashPassword,
  verifyPassword,
  generateRefreshToken,
  generateSessionToken,
  hashSessionToken,
  generateOtpCode,
  hashOtpCode,
  verifyOtpCode,
} from './auth-crypto';
import type { AuthRequestMetadata } from './auth.metadata';
import { SignInDto } from './dto/sign-in.dto';
import { SignOutDto } from './dto/sign-out.dto';
import { SignUpDto } from './dto/sign-up.dto';
import type { SendPhoneOtpDto } from './dto/send-phone-otp.dto';
import type { VerifyPhoneOtpDto } from './dto/verify-phone-otp.dto';
import type { RefreshSessionDto } from './dto/refresh-session.dto';
import type { CreateSupportTicketDto } from './dto/create-support-ticket.dto';
import { serializeAuthenticatedUser, serializeSession } from './auth.presenter';
import type { RequestAuthContext } from './auth.types';

// Politique de verrouillage de compte : défense en profondeur contre le brute-force
// même lorsque l'attaquant utilise plusieurs adresses IP.
// Seuils : 5 échecs → 15 min | 10 échecs → 1 h | 20+ échecs → 24 h
const LOCKOUT_THRESHOLDS: Array<{ minCount: number; lockMs: number }> = [
  { minCount: 20, lockMs: 24 * 60 * 60_000 },
  { minCount: 10, lockMs: 60 * 60_000 },
  { minCount: 5, lockMs: 15 * 60_000 },
];

function computeLockoutDuration(failedCount: number): number {
  for (const threshold of LOCKOUT_THRESHOLDS) {
    if (failedCount >= threshold.minCount) return threshold.lockMs;
  }
  return 0;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

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
      refreshToken: session.refreshToken,
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

    // Identifiants corrects, mais mauvaise app (ex: identifiants chauffeur
    // utilisés sur l'app passagère). Même message générique qu'un mot de
    // passe invalide — ne jamais révéler que le compte existe sous un autre
    // rôle — mais sans compter d'échec ni verrouiller, puisque le mot de
    // passe était bien correct.
    if (payload.expectedRole && user.role !== payload.expectedRole) {
      await this.logAuthEvent(user.id, 'SIGN_IN_ROLE_MISMATCH', metadata, {
        actualRole: user.role,
        expectedRole: payload.expectedRole,
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
          refreshTokenHash: sessionSeed.refreshTokenHash,
          expiresAt: sessionSeed.expiresAt,
          refreshTokenExpiresAt: sessionSeed.refreshTokenExpiresAt,
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

    const isNewDevice = await this.detectNewDevice(
      user.id,
      session.id,
      sessionSeed.userAgent ?? null,
    );

    await this.logAuthEvent(user.id, 'SIGN_IN_SUCCESS', metadata);
    if (isNewDevice) {
      await this.logAuthEvent(user.id, 'NEW_DEVICE_SIGN_IN', metadata);
      await this.sendNewDeviceAlert(user.id, session.id, metadata);
    }

    return {
      message: 'Signed in successfully.',
      sessionToken: sessionSeed.token,
      refreshToken: sessionSeed.refreshToken,
      user: serializeAuthenticatedUser({ ...user, lastLoginAt: now }),
      session: serializeSession(session, true),
      isNewDevice,
    };
  }

  async sendPhoneOtp(
    payload: SendPhoneOtpDto,
    metadata: AuthRequestMetadata = {},
  ) {
    const phoneNumber = this.normalizePhoneNumber(payload.phoneNumber);
    const code = generateOtpCode();
    const role = payload.role as UserRole;
    const now = new Date();

    const activeOtpCount = await this.prisma.phoneOtp.count({
      where: {
        phoneNumber,
        role,
        consumedAt: null,
        expiresAt: { gt: now },
      },
    });

    if (activeOtpCount >= PHONE_OTP_MAX_ACTIVE_CODES_PER_PHONE) {
      return {
        message: 'A verification code has been sent by SMS.',
        expiresInMinutes: PHONE_OTP_TTL_IN_MINUTES,
      };
    }

    await this.prisma.phoneOtp.create({
      data: {
        phoneNumber,
        role,
        codeHash: hashOtpCode(code),
        expiresAt: new Date(Date.now() + PHONE_OTP_TTL_IN_MINUTES * 60_000),
      },
    });

    await this.deliverOtpSms(phoneNumber, code);

    return {
      message: 'A verification code has been sent by SMS.',
      expiresInMinutes: PHONE_OTP_TTL_IN_MINUTES,
    };
  }

  async verifyPhoneOtp(
    payload: VerifyPhoneOtpDto,
    metadata: AuthRequestMetadata = {},
  ) {
    const phoneNumber = this.normalizePhoneNumber(payload.phoneNumber);
    const role = payload.role as UserRole;

    const otp = await this.prisma.phoneOtp.findFirst({
      where: {
        phoneNumber,
        role,
        consumedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Même message que le code soit absent, expiré, ou épuisé (anti-énumération).
    if (!otp || otp.attempts >= PHONE_OTP_MAX_VERIFY_ATTEMPTS) {
      throw new UnauthorizedException('Invalid or expired code.');
    }

    if (!verifyOtpCode(payload.code, otp.codeHash)) {
      await this.prisma.phoneOtp.update({
        where: { id: otp.id },
        data: { attempts: { increment: 1 } },
      });
      throw new UnauthorizedException('Invalid or expired code.');
    }

    await this.prisma.phoneOtp.update({
      where: { id: otp.id },
      data: { consumedAt: new Date() },
    });

    const existingUser = await this.prisma.user.findUnique({
      where: { phoneNumber },
      include: { riderProfile: true, driverProfile: true },
    });

    const sessionSeed = this.createSessionSeed(metadata);

    if (!existingUser) {
      if (!payload.fullName?.trim()) {
        throw new BadRequestException(
          'fullName is required to create a new account.',
        );
      }

      const user = await this.prisma.user.create({
        data: {
          email: this.buildPhonePlaceholderEmail(phoneNumber),
          fullName: payload.fullName.trim(),
          phoneNumber,
          role,
          provider: AuthProvider.PHONE,
          isPhoneVerified: true,
          lastLoginAt: new Date(),
          wallets: {
            create: { currency: DEFAULT_WALLET_CURRENCY },
          },
          riderProfile:
            role === UserRole.RIDER ? { create: {} } : undefined,
          driverProfile:
            role === UserRole.DRIVER
              ? { create: this.buildDriverProfileSeed() }
              : undefined,
          sessions: {
            create: {
              tokenHash: sessionSeed.tokenHash,
              refreshTokenHash: sessionSeed.refreshTokenHash,
              expiresAt: sessionSeed.expiresAt,
              refreshTokenExpiresAt: sessionSeed.refreshTokenExpiresAt,
              userAgent: sessionSeed.userAgent,
              ipAddress: sessionSeed.ipAddress,
            },
          },
        },
        include: {
          riderProfile: true,
          driverProfile: true,
          sessions: true,
        },
      });

      await this.logAuthEvent(user.id, 'SIGN_UP', metadata);

      return {
        message: 'Account created successfully.',
        sessionToken: sessionSeed.token,
        refreshToken: sessionSeed.refreshToken,
        user: serializeAuthenticatedUser(user),
        session: serializeSession(user.sessions[0], true),
      };
    }

    if (!existingUser.isActive) {
      throw new UnauthorizedException('This account is currently inactive.');
    }

    // Code correct, mais numéro déjà enregistré sous un autre rôle (ex: compte
    // chauffeur essayant de se vérifier via l'app passagère). Même message
    // générique que "code invalide" — anti-énumération de compte par rôle.
    if (existingUser.role !== role) {
      await this.logAuthEvent(existingUser.id, 'SIGN_IN_ROLE_MISMATCH', metadata, {
        actualRole: existingUser.role,
        expectedRole: role,
      });
      throw new UnauthorizedException('Invalid or expired code.');
    }

    const [session] = await this.prisma.$transaction([
      this.prisma.userSession.create({
        data: {
          userId: existingUser.id,
          tokenHash: sessionSeed.tokenHash,
          refreshTokenHash: sessionSeed.refreshTokenHash,
          expiresAt: sessionSeed.expiresAt,
          refreshTokenExpiresAt: sessionSeed.refreshTokenExpiresAt,
          userAgent: sessionSeed.userAgent,
          ipAddress: sessionSeed.ipAddress,
        },
      }),
      this.prisma.user.update({
        where: { id: existingUser.id },
        data: {
          lastLoginAt: new Date(),
          isPhoneVerified: true,
          failedLoginCount: 0,
          lockedUntil: null,
        },
      }),
    ]);

    if (existingUser.role === UserRole.DRIVER) {
      await this.revokeOtherActiveSessions(existingUser.id, session.id);
    }

    await this.logAuthEvent(existingUser.id, 'SIGN_IN_SUCCESS', metadata);

    return {
      message: 'Signed in successfully.',
      sessionToken: sessionSeed.token,
      refreshToken: sessionSeed.refreshToken,
      user: serializeAuthenticatedUser({
        ...existingUser,
        isPhoneVerified: true,
      }),
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
    if (payload.allDevices) {
      const now = new Date();
      await this.prisma.userSession.updateMany({
        where: { userId: auth.user.id, revokedAt: null },
        data: { revokedAt: now, refreshRevokedAt: now },
      });

      await this.logAuthEvent(auth.user.id, 'SIGN_OUT_ALL', {
        ipAddress: auth.session.ipAddress ?? undefined,
        userAgent: auth.session.userAgent ?? undefined,
      });

      return {
        message: 'All sessions revoked successfully.',
        revokedSessionId: auth.session.id,
      };
    }

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
      data: { revokedAt: new Date(), refreshRevokedAt: new Date() },
    });

    const isCurrentDriverSession =
      session.id === auth.session.id && auth.user.role === UserRole.DRIVER;

    if (isCurrentDriverSession) {
      await this.prisma.driverProfile.updateMany({
        where: {
          userId: auth.user.id,
          status: DriverStatus.ONLINE,
          assignedTrips: {
            none: {
              status: {
                in: [
                  TripStatus.MATCHED,
                  TripStatus.DRIVER_ARRIVING,
                  TripStatus.IN_PROGRESS,
                ],
              },
            },
          },
        },
        data: {
          status: DriverStatus.OFFLINE,
          currentLatitude: null,
          currentLongitude: null,
        },
      });
    }

    await this.logAuthEvent(auth.user.id, 'SIGN_OUT', {
      ipAddress: auth.session.ipAddress ?? undefined,
      userAgent: auth.session.userAgent ?? undefined,
    });

    return {
      message: 'Session revoked successfully.',
      revokedSessionId: session.id,
    };
  }

  async refreshSession(
    payload: RefreshSessionDto,
    metadata: AuthRequestMetadata = {},
  ) {
    const refreshTokenHash = hashSessionToken(payload.refreshToken);
    const session = await this.prisma.userSession.findUnique({
      where: { refreshTokenHash },
      include: {
        user: {
          include: {
            riderProfile: true,
            driverProfile: true,
          },
        },
      },
    });
    const now = new Date();

    if (!session) {
      throw new UnauthorizedException('Your session is invalid or has expired.');
    }

    if (
      session.revokedAt ||
      session.refreshRevokedAt ||
      session.refreshReusedAt ||
      !session.refreshTokenExpiresAt ||
      session.refreshTokenExpiresAt <= now
    ) {
      await this.prisma.userSession.update({
        where: { id: session.id },
        data: { refreshReusedAt: now },
      });
      await this.prisma.userSession.updateMany({
        where: { userId: session.userId, revokedAt: null },
        data: { revokedAt: now, refreshRevokedAt: now },
      });
      await this.logAuthEvent(session.userId, 'REFRESH_REUSE_DETECTED', metadata);
      throw new UnauthorizedException('Your session is invalid or has expired.');
    }

    if (!session.user.isActive) {
      throw new UnauthorizedException('This account is currently inactive.');
    }

    const nextSeed = this.createSessionSeed(metadata);
    const [nextSession] = await this.prisma.$transaction([
      this.prisma.userSession.create({
        data: {
          userId: session.userId,
          tokenHash: nextSeed.tokenHash,
          refreshTokenHash: nextSeed.refreshTokenHash,
          expiresAt: nextSeed.expiresAt,
          refreshTokenExpiresAt: nextSeed.refreshTokenExpiresAt,
          userAgent: nextSeed.userAgent,
          ipAddress: nextSeed.ipAddress,
        },
      }),
      this.prisma.userSession.update({
        where: { id: session.id },
        data: { revokedAt: now, refreshRevokedAt: now },
      }),
    ]);

    await this.logAuthEvent(session.userId, 'SESSION_REFRESHED', metadata);

    return {
      message: 'Session refreshed successfully.',
      sessionToken: nextSeed.token,
      refreshToken: nextSeed.refreshToken,
      user: serializeAuthenticatedUser(session.user),
      session: serializeSession(nextSession, true),
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

  private async sendNewDeviceAlert(
    userId: string,
    sessionId: string,
    metadata: AuthRequestMetadata,
  ) {
    try {
      await this.notifications.enqueue({
        userId,
        title: 'Nouvelle connexion détectée',
        body: "Connexion depuis un nouvel appareil. Si ce n'est pas vous, déconnectez les appareils inconnus dans vos paramètres.",
        channel: NotificationChannel.PUSH,
        dedupeKey: `new-device:${userId}:${sessionId}`,
        data: {
          type: 'new_device_signin',
          ipAddress: metadata.ipAddress ?? '',
        },
      });
    } catch {
      // Non-bloquant : l'alerte de sécurité ne doit pas impacter la connexion.
    }
  }

  private async detectNewDevice(
    userId: string,
    currentSessionId: string,
    userAgent: string | null,
  ): Promise<boolean> {
    const previousSessions = await this.prisma.userSession.findMany({
      where: { userId, id: { not: currentSessionId } },
      select: { userAgent: true },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    if (previousSessions.length === 0) return false;
    return !previousSessions.some((s) => s.userAgent === userAgent);
  }

  async dataExport(auth: RequestAuthContext) {
    const userId = auth.user.id;

    const [
      user,
      sessions,
      wallet,
      notifications,
      supportTickets,
      paymentAttempts,
    ] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({
        where: { id: userId },
        include: {
          riderProfile: {
            include: {
              savedPlaces: true,
              trips: {
                orderBy: { createdAt: 'desc' as const },
                take: 200,
              },
              ratingsGiven: {
                select: { score: true, comment: true, createdAt: true },
                orderBy: { createdAt: 'desc' as const },
              },
            },
          },
          driverProfile: {
            include: {
              vehicles: true,
              assignedTrips: {
                orderBy: { createdAt: 'desc' as const },
                take: 200,
              },
              ratingsReceived: {
                select: { score: true, comment: true, createdAt: true },
                orderBy: { createdAt: 'desc' as const },
              },
              onboardingDocuments: {
                select: {
                  type: true,
                  status: true,
                  uploadedAt: true,
                  expiresAt: true,
                },
              },
            },
          },
        },
      }),
      this.prisma.userSession.findMany({
        where: { userId },
        select: {
          userAgent: true,
          ipAddress: true,
          createdAt: true,
          expiresAt: true,
          revokedAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
      this.prisma.wallet.findFirst({
        where: { userId },
        include: {
          transactions: {
            select: {
              type: true,
              amount: true,
              reference: true,
              description: true,
              createdAt: true,
            },
            orderBy: { createdAt: 'desc' },
            take: 500,
          },
        },
      }),
      this.prisma.notification.findMany({
        where: { userId },
        select: {
          title: true,
          body: true,
          channel: true,
          isRead: true,
          sentAt: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 200,
      }),
      this.prisma.supportTicket.findMany({
        where: { userId },
        select: {
          subject: true,
          description: true,
          status: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.paymentAttempt.findMany({
        where: { userId },
        select: {
          provider: true,
          channel: true,
          status: true,
          amount: true,
          currency: true,
          mobileMoneyNetwork: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 200,
      }),
    ]);

    await this.logAuthEvent(userId, 'DATA_EXPORT', {
      ipAddress: auth.session.ipAddress ?? undefined,
      userAgent: auth.session.userAgent ?? undefined,
    });

    return {
      exportedAt: new Date().toISOString(),
      profile: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        phoneNumber: user.phoneNumber,
        role: user.role,
        provider: user.provider,
        isActive: user.isActive,
        isPhoneVerified: user.isPhoneVerified,
        lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
        createdAt: user.createdAt.toISOString(),
      },
      sessions: sessions.map((s) => ({
        userAgent: s.userAgent,
        ipAddress: s.ipAddress,
        createdAt: s.createdAt.toISOString(),
        expiresAt: s.expiresAt.toISOString(),
        revokedAt: s.revokedAt?.toISOString() ?? null,
      })),
      wallet: wallet
        ? {
            currency: wallet.currency,
            balance: wallet.balance.toString(),
            transactions: wallet.transactions.map((t) => ({
              type: t.type,
              amount: t.amount.toString(),
              reference: t.reference,
              description: t.description,
              createdAt: t.createdAt.toISOString(),
            })),
          }
        : null,
      notifications: notifications.map((n) => ({
        title: n.title,
        body: n.body,
        channel: n.channel,
        isRead: n.isRead,
        sentAt: n.sentAt?.toISOString() ?? null,
        createdAt: n.createdAt.toISOString(),
      })),
      supportTickets: supportTickets.map((t) => ({
        subject: t.subject,
        description: t.description,
        status: t.status,
        createdAt: t.createdAt.toISOString(),
      })),
      paymentAttempts: paymentAttempts.map((p) => ({
        provider: p.provider,
        channel: p.channel,
        status: p.status,
        amount: p.amount.toString(),
        currency: p.currency,
        mobileMoneyNetwork: p.mobileMoneyNetwork,
        createdAt: p.createdAt.toISOString(),
      })),
      ...(user.riderProfile
        ? {
            riderProfile: {
              savedPlaces: user.riderProfile.savedPlaces.map((p) => ({
                label: p.label,
                address: p.address,
                latitude: p.latitude.toString(),
                longitude: p.longitude.toString(),
                createdAt: p.createdAt.toISOString(),
              })),
              trips: user.riderProfile.trips.map((t) => ({
                pickupAddress: t.pickupAddress,
                destinationAddress: t.destinationAddress,
                status: t.status,
                actualFare: t.actualFare?.toString() ?? null,
                currency: t.currency,
                distanceKm: t.distanceKm?.toString() ?? null,
                durationMinutes: t.durationMinutes,
                startedAt: t.startedAt?.toISOString() ?? null,
                completedAt: t.completedAt?.toISOString() ?? null,
                createdAt: t.createdAt.toISOString(),
              })),
              ratingsGiven: user.riderProfile.ratingsGiven.map((r) => ({
                score: r.score,
                comment: r.comment,
                createdAt: r.createdAt.toISOString(),
              })),
            },
          }
        : {}),
      ...(user.driverProfile
        ? {
            driverProfile: {
              licenseNumber: user.driverProfile.licenseNumber,
              verificationStatus: user.driverProfile.verificationStatus,
              averageRating:
                user.driverProfile.averageRating?.toString() ?? null,
              completedTripsCount: user.driverProfile.completedTripsCount,
              vehicles: user.driverProfile.vehicles.map((v) => ({
                make: v.make,
                model: v.model,
                type: v.type,
                tier: v.tier,
                plateNumber: v.plateNumber,
                year: v.year,
                isActive: v.isActive,
                createdAt: v.createdAt.toISOString(),
              })),
              trips: user.driverProfile.assignedTrips.map((t) => ({
                pickupAddress: t.pickupAddress,
                destinationAddress: t.destinationAddress,
                status: t.status,
                actualFare: t.actualFare?.toString() ?? null,
                currency: t.currency,
                distanceKm: t.distanceKm?.toString() ?? null,
                durationMinutes: t.durationMinutes,
                startedAt: t.startedAt?.toISOString() ?? null,
                completedAt: t.completedAt?.toISOString() ?? null,
                createdAt: t.createdAt.toISOString(),
              })),
              ratingsReceived: user.driverProfile.ratingsReceived.map((r) => ({
                score: r.score,
                comment: r.comment,
                createdAt: r.createdAt.toISOString(),
              })),
              documents: user.driverProfile.onboardingDocuments.map((d) => ({
                type: d.type,
                status: d.status,
                uploadedAt: d.uploadedAt.toISOString(),
                expiresAt: d.expiresAt?.toISOString() ?? null,
              })),
            },
          }
        : {}),
    };
  }

  async createSupportTicket(
    auth: RequestAuthContext,
    payload: CreateSupportTicketDto,
  ) {
    const paymentContext =
      payload.category === 'payment'
        ? await this.prisma.paymentAttempt.findFirst({
            where: {
              userId: auth.user.id,
            },
            orderBy: {
              createdAt: 'desc',
            },
            select: {
              id: true,
              status: true,
              amount: true,
              currency: true,
              provider: true,
              rideRequestId: true,
              transactionRef: true,
              createdAt: true,
            },
          })
        : null;
    const enrichedDescription = [
      payload.description,
      paymentContext
        ? [
            `PaymentAttempt: ${paymentContext.id}`,
            `PaymentStatus: ${paymentContext.status}`,
            `PaymentAmount: ${Number(paymentContext.amount)} ${paymentContext.currency}`,
            `PaymentProvider: ${paymentContext.provider}`,
            `PaymentRideRequest: ${paymentContext.rideRequestId}`,
            `PaymentTransaction: ${paymentContext.transactionRef ?? 'absente'}`,
          ].join('\n')
        : null,
    ]
      .filter(Boolean)
      .join('\n');

    const ticket = await this.prisma.supportTicket.create({
      data: {
        userId: auth.user.id,
        subject: payload.subject,
        description: enrichedDescription,
        priority: this.resolveSupportTicketPriority(payload.category),
      },
      select: {
        id: true,
        subject: true,
        description: true,
        status: true,
        priority: true,
        createdAt: true,
      },
    });

    return {
      ticket: {
        id: ticket.id,
        subject: ticket.subject,
        description: ticket.description,
        status: ticket.status,
        priority: ticket.priority,
        createdAt: ticket.createdAt.toISOString(),
      },
    };
  }

  private resolveSupportTicketPriority(category?: string) {
    if (category === 'safety') {
      return 3;
    }

    if (category === 'payment') {
      return 2;
    }

    return 1;
  }

  async getMySupportTickets(auth: RequestAuthContext) {
    const tickets = await this.prisma.supportTicket.findMany({
      where: {
        userId: auth.user.id,
        NOT: {
          subject: {
            startsWith: 'Erreur mobile ',
          },
        },
      },
      select: {
        id: true,
        subject: true,
        description: true,
        status: true,
        priority: true,
        adminNote: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    return {
      tickets: tickets.map((t) => ({
        id: t.id,
        subject: t.subject,
        description: t.description,
        status: t.status,
        priority: t.priority,
        adminNote: t.adminNote ?? null,
        createdAt: t.createdAt.toISOString(),
        updatedAt: t.updatedAt.toISOString(),
      })),
    };
  }

  async validatePromoCode(code: string, auth: RequestAuthContext) {
    const normalizedCode = code.toUpperCase().trim();

    const promo = await this.prisma.promoCode.findUnique({
      where: { code: normalizedCode },
      select: {
        id: true,
        code: true,
        description: true,
        discountBps: true,
        maxUses: true,
        usedCount: true,
        validFrom: true,
        validTo: true,
        firstTripOnly: true,
        active: true,
      },
    });

    if (!promo || !promo.active) {
      throw new BadRequestException('Code promo invalide ou inactif.');
    }

    const now = new Date();

    if (promo.validTo < now) {
      throw new BadRequestException('Ce code promo a expire.');
    }

    if (promo.validFrom > now) {
      throw new BadRequestException('Ce code promo n est pas encore actif.');
    }

    if (promo.maxUses !== null && promo.usedCount >= promo.maxUses) {
      throw new BadRequestException(
        'Ce code promo a atteint son nombre maximum d utilisations.',
      );
    }

    if (promo.firstTripOnly) {
      const riderProfile = await this.prisma.riderProfile.findUnique({
        where: { userId: auth.user.id },
        select: { id: true },
      });

      if (riderProfile) {
        const completedTripsCount = await this.prisma.trip.count({
          where: { riderId: riderProfile.id, status: TripStatus.COMPLETED },
        });

        if (completedTripsCount > 0) {
          throw new BadRequestException(
            'Ce code est reserve aux nouveaux passagers (premier trajet).',
          );
        }
      }
    }

    const discountPercent = promo.discountBps / 100;

    return {
      valid: true,
      code: promo.code,
      discountBps: promo.discountBps,
      discountPercent,
      description: promo.description,
      firstTripOnly: promo.firstTripOnly,
      validTo: promo.validTo.toISOString(),
    };
  }

  private async logAuthEvent(
    userId: string,
    action:
      | 'SIGN_IN_SUCCESS'
      | 'SIGN_IN_FAILED'
      | 'SIGN_IN_ROLE_MISMATCH'
      | 'SIGN_UP'
      | 'SIGN_OUT'
      | 'SIGN_OUT_ALL'
      | 'SESSION_REFRESHED'
      | 'REFRESH_REUSE_DETECTED'
      | 'NEW_DEVICE_SIGN_IN'
      | 'DATA_EXPORT',
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

  private createAccessTokenExpiryDate() {
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + ACCESS_TOKEN_TTL_IN_MINUTES);

    return expiresAt;
  }

  private createRefreshTokenExpiryDate() {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_TTL_IN_DAYS);

    return expiresAt;
  }

  private normalizeEmail(email: string) {
    return email.trim().toLowerCase();
  }

  private normalizePhoneNumber(phoneNumber: string) {
    return phoneNumber.trim();
  }

  // Le compte doit avoir un email unique en base même pour une inscription
  // 100% téléphone : placeholder déterministe, jamais affiché à l'utilisateur.
  private buildPhonePlaceholderEmail(phoneNumber: string) {
    return `phone-${phoneNumber.replace(/\D/g, '')}@phone.orbi.internal`;
  }

  private async deliverOtpSms(phoneNumber: string, code: string) {
    const apiUrl = process.env.SMS_PROVIDER_API_URL;
    const apiKey = process.env.SMS_PROVIDER_API_KEY;
    const message = `Orbi : votre code de vérification est ${code}. Il expire dans ${PHONE_OTP_TTL_IN_MINUTES} minutes.`;

    if (!apiUrl || !apiKey) {
      // Aucune passerelle SMS configurée (pilote) : le code est journalisé
      // pour permettre une vérification manuelle en attendant l'intégration.
      this.logger.warn(
        `[OTP] No SMS gateway configured for ${phoneNumber}. Code generated but not logged.`,
      );
      return;
    }

    try {
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ to: phoneNumber, message }),
      });

      if (!response.ok) {
        throw new Error(`sms_gateway_http_error:${response.status}`);
      }
    } catch (error) {
      this.logger.error(
        `[OTP] Failed to deliver SMS to ${phoneNumber}: ${(error as Error).message}`,
      );
    }
  }

  private createSessionSeed(metadata: AuthRequestMetadata) {
    const token = generateSessionToken();
    const refreshToken = generateRefreshToken();

    return {
      token,
      refreshToken,
      tokenHash: hashSessionToken(token),
      refreshTokenHash: hashSessionToken(refreshToken),
      expiresAt: this.createAccessTokenExpiryDate(),
      refreshTokenExpiresAt: this.createRefreshTokenExpiryDate(),
      userAgent: metadata.userAgent,
      ipAddress: metadata.ipAddress,
    };
  }

  private buildDriverProfileSeed() {
    const autoOnboard = process.env.FEATURE_FLAG_DRIVER_AUTO_ONBOARD === 'on';
    if (!autoOnboard) {
      return {};
    }
    const shortId = Date.now().toString(36).slice(-5).toUpperCase();
    return {
      verificationStatus: VerificationStatus.APPROVED,
      licenseNumber: `FIELD-${shortId}`,
      serviceRadiusKm: 15,
      vehicles: {
        create: {
          plateNumber: `ORB-${shortId}`,
          make: 'Honda',
          model: 'CB125',
          color: 'Rouge',
          year: 2022,
          type: VehicleType.MOTORCYCLE,
          tier: ServiceTier.MOTO_STANDARD,
          seats: 2,
        },
      },
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
              create: this.buildDriverProfileSeed(),
            }
          : undefined,
      sessions: {
        create: {
          tokenHash: session.tokenHash,
          refreshTokenHash: session.refreshTokenHash,
          expiresAt: session.expiresAt,
          refreshTokenExpiresAt: session.refreshTokenExpiresAt,
          userAgent: session.userAgent,
          ipAddress: session.ipAddress,
        },
      },
    };
  }
}
