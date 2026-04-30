import { UnauthorizedException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { hashSessionToken } from './auth-crypto';
import { SessionAuthGuard } from './session-auth.guard';

describe('SessionAuthGuard', () => {
  function createGuard() {
    const prisma = {
      userSession: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    };

    return {
      prisma,
      guard: new SessionAuthGuard(prisma as never),
    };
  }

  function createExecutionContext(request: Record<string, unknown>) {
    return {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as ExecutionContext;
  }

  it('attaches auth context for a valid active session', async () => {
    const { guard, prisma } = createGuard();
    const request = {
      headers: {
        authorization: 'Bearer session-token-123',
      },
    };
    const now = new Date('2026-04-17T10:00:00.000Z');

    prisma.userSession.findUnique.mockResolvedValue({
      id: 'session-1',
      userId: 'user-1',
      tokenHash: hashSessionToken('session-token-123'),
      createdAt: now,
      lastSeenAt: now,
      expiresAt: new Date('2026-05-17T10:00:00.000Z'),
      revokedAt: null,
      userAgent: 'jest',
      ipAddress: '127.0.0.1',
      user: {
        id: 'user-1',
        role: 'RIDER',
        isActive: true,
        riderProfile: { id: 'rider-1' },
        driverProfile: null,
      },
    });
    prisma.userSession.update.mockResolvedValue(undefined);

    const result = await guard.canActivate(createExecutionContext(request));

    expect(result).toBe(true);
    expect(prisma.userSession.findUnique).toHaveBeenCalledWith({
      where: {
        tokenHash: hashSessionToken('session-token-123'),
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
    expect((request as { auth?: unknown }).auth).toBeDefined();
  });

  it('skips lastSeenAt writes when the session was refreshed recently', async () => {
    const { guard, prisma } = createGuard();
    const now = new Date();
    const request = {
      headers: {
        authorization: 'Bearer session-token-123',
      },
    };

    prisma.userSession.findUnique.mockResolvedValue({
      id: 'session-1',
      userId: 'user-1',
      tokenHash: hashSessionToken('session-token-123'),
      createdAt: now,
      lastSeenAt: new Date(now.getTime() - 60 * 1000),
      expiresAt: new Date(now.getTime() + 1000 * 60 * 60),
      revokedAt: null,
      userAgent: 'jest',
      ipAddress: '127.0.0.1',
      user: {
        id: 'user-1',
        role: 'RIDER',
        isActive: true,
        riderProfile: { id: 'rider-1' },
        driverProfile: null,
      },
    });

    await expect(
      guard.canActivate(createExecutionContext(request)),
    ).resolves.toBe(true);

    expect(prisma.userSession.update).not.toHaveBeenCalled();
  });

  it('rejects missing bearer tokens', async () => {
    const { guard } = createGuard();

    await expect(
      guard.canActivate(
        createExecutionContext({
          headers: {},
          query: {},
        }),
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('accepts a session token passed via the query string for SSE streams', async () => {
    const { guard, prisma } = createGuard();
    const request = {
      headers: {},
      query: {
        sessionToken: 'session-token-sse-456',
      },
    };
    const now = new Date('2026-04-17T10:00:00.000Z');

    prisma.userSession.findUnique.mockResolvedValue({
      id: 'session-2',
      userId: 'user-2',
      tokenHash: hashSessionToken('session-token-sse-456'),
      createdAt: now,
      lastSeenAt: now,
      expiresAt: new Date('2026-05-17T10:00:00.000Z'),
      revokedAt: null,
      userAgent: 'jest',
      ipAddress: '127.0.0.1',
      user: {
        id: 'user-2',
        role: 'DRIVER',
        isActive: true,
        riderProfile: null,
        driverProfile: { id: 'driver-1' },
      },
    });

    await expect(
      guard.canActivate(createExecutionContext(request)),
    ).resolves.toBe(true);
    expect(prisma.userSession.findUnique).toHaveBeenCalledWith({
      where: {
        tokenHash: hashSessionToken('session-token-sse-456'),
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
  });
});
