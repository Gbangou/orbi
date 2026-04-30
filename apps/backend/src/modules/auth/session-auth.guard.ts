import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import { SESSION_LAST_SEEN_UPDATE_INTERVAL_IN_MINUTES } from './auth.constants';
import { hashSessionToken } from './auth-crypto';
import { AuthenticatedRequest, extractSessionToken } from './auth.request';

@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = extractSessionToken(request);

    if (!token) {
      throw new UnauthorizedException(
        'A valid session token is required in the bearer header or sessionToken query parameter.',
      );
    }

    const session = await this.prisma.userSession.findUnique({
      where: {
        tokenHash: hashSessionToken(token),
      },
      include: {
        user: {
          include: {
            riderProfile: true,
            driverProfile: true,
          },
        },
      },
    });

    if (!session || session.revokedAt || session.expiresAt <= new Date()) {
      throw new UnauthorizedException(
        'Your session is invalid or has expired.',
      );
    }

    if (!session.user.isActive) {
      throw new UnauthorizedException('This account is currently inactive.');
    }

    const shouldRefreshLastSeenAt =
      Date.now() - session.lastSeenAt.getTime() >=
      SESSION_LAST_SEEN_UPDATE_INTERVAL_IN_MINUTES * 60 * 1000;
    const lastSeenAt = shouldRefreshLastSeenAt
      ? new Date()
      : session.lastSeenAt;

    if (shouldRefreshLastSeenAt) {
      await this.prisma.userSession.update({
        where: { id: session.id },
        data: {
          lastSeenAt,
        },
      });
    }

    request.auth = {
      token,
      session: {
        id: session.id,
        userId: session.userId,
        createdAt: session.createdAt,
        lastSeenAt,
        expiresAt: session.expiresAt,
        revokedAt: session.revokedAt,
        userAgent: session.userAgent,
        ipAddress: session.ipAddress,
      },
      user: session.user,
    };

    return true;
  }
}
