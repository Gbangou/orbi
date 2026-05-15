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
      // A new account should be immediately usable in the local MVP: wallet,
      // role-specific profile, and first session are bootstrapped in one write.
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

    if (!user?.passwordHash) {
      throw new UnauthorizedException('Invalid email or password.');
    }

    const isPasswordValid = await verifyPassword(
      payload.password,
      user.passwordHash,
    );

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid email or password.');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('This account is currently inactive.');
    }

    const sessionSeed = this.createSessionSeed(metadata);

    const session = await this.prisma.userSession.create({
      data: {
        userId: user.id,
        tokenHash: sessionSeed.tokenHash,
        expiresAt: sessionSeed.expiresAt,
        userAgent: sessionSeed.userAgent,
        ipAddress: sessionSeed.ipAddress,
      },
    });

    if (user.role === UserRole.DRIVER) {
      await this.revokeOtherActiveSessions(user.id, session.id);
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        lastLoginAt: new Date(),
      },
    });

    return {
      message: 'Signed in successfully.',
      sessionToken: sessionSeed.token,
      user: serializeAuthenticatedUser({
        ...user,
        lastLoginAt: new Date(),
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
      where: {
        id: session.id,
      },
      data: {
        revokedAt: new Date(),
      },
    });

    return {
      message: 'Session revoked successfully.',
      revokedSessionId: session.id,
    };
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
