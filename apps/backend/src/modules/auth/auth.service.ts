import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { NotificationChannel, UserRole } from '@prisma/client';
import { PrismaService } from '../../core/prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
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
import type { CreateSupportTicketDto } from './dto/create-support-ticket.dto';
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
      user: serializeAuthenticatedUser({ ...user, lastLoginAt: now }),
      session: serializeSession(session, true),
      isNewDevice,
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

    const [user, sessions, wallet, notifications, supportTickets, paymentAttempts] =
      await Promise.all([
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
              averageRating: user.driverProfile.averageRating?.toString() ?? null,
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
    const ticket = await this.prisma.supportTicket.create({
      data: {
        userId: auth.user.id,
        subject: payload.subject,
        description: payload.description,
        priority: payload.category === 'safety' ? 3 : 1,
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

  async getMySupportTickets(auth: RequestAuthContext) {
    const tickets = await this.prisma.supportTicket.findMany({
      where: { userId: auth.user.id },
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

  private async logAuthEvent(
    userId: string,
    action:
      | 'SIGN_IN_SUCCESS'
      | 'SIGN_IN_FAILED'
      | 'SIGN_UP'
      | 'SIGN_OUT'
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
