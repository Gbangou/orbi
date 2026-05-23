import { UnauthorizedException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { hashSessionToken } from './auth-crypto';
import { SessionAuthGuard } from './session-auth.guard';

/**
 * OWASP WSTG-SESS-06 (Session Timeout) + WSTG-SESS-07 (Session Logout) +
 * OWASP API2 (Broken Authentication) — Session lifecycle security invariants.
 *
 * The SessionAuthGuard is the sole authentication boundary for all protected
 * endpoints. These tests lock the rejection paths that prevent stale, revoked,
 * and inactive-account sessions from granting access.
 */
describe('SessionAuthGuard — session lifecycle security', () => {
  function createGuard() {
    const prisma = {
      userSession: {
        findUnique: jest.fn(),
        update: jest.fn().mockResolvedValue(undefined),
      },
    };
    return { guard: new SessionAuthGuard(prisma as never), prisma };
  }

  function createContext(token: string) {
    const request = {
      headers: { authorization: `Bearer ${token}` },
    };
    return {
      switchToHttp: () => ({ getRequest: () => request }),
    } as ExecutionContext;
  }

  const validUserBase = {
    id: 'user-1',
    role: 'RIDER',
    isActive: true,
    riderProfile: { id: 'rider-1' },
    driverProfile: null,
  };

  function validSessionBase(overrides: Record<string, unknown> = {}) {
    const now = new Date();
    return {
      id: 'session-1',
      userId: 'user-1',
      tokenHash: hashSessionToken('session-token-valid'),
      createdAt: now,
      lastSeenAt: now,
      expiresAt: new Date(now.getTime() + 3_600_000),
      revokedAt: null,
      userAgent: 'jest',
      ipAddress: '127.0.0.1',
      user: validUserBase,
      ...overrides,
    };
  }

  // ── Token not found ────────────────────────────────────────────────────────

  it('rejects when the session token hash is not in the database', async () => {
    const { guard, prisma } = createGuard();
    prisma.userSession.findUnique.mockResolvedValue(null);

    await expect(
      guard.canActivate(createContext('nonexistent-token')),
    ).rejects.toThrow(UnauthorizedException);
  });

  // ── Expired session ────────────────────────────────────────────────────────

  it('rejects a session whose expiresAt is in the past', async () => {
    const { guard, prisma } = createGuard();
    prisma.userSession.findUnique.mockResolvedValue(
      validSessionBase({
        expiresAt: new Date(Date.now() - 1),
      }),
    );

    await expect(
      guard.canActivate(createContext('session-token-valid')),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('rejects a session that expired one millisecond ago', async () => {
    const { guard, prisma } = createGuard();
    prisma.userSession.findUnique.mockResolvedValue(
      validSessionBase({
        expiresAt: new Date(Date.now() - 1),
      }),
    );

    await expect(
      guard.canActivate(createContext('session-token-valid')),
    ).rejects.toThrow(UnauthorizedException);
  });

  // ── Revoked session ────────────────────────────────────────────────────────

  it('rejects a session with a non-null revokedAt (signed out)', async () => {
    const { guard, prisma } = createGuard();
    prisma.userSession.findUnique.mockResolvedValue(
      validSessionBase({
        revokedAt: new Date(Date.now() - 60_000),
      }),
    );

    await expect(
      guard.canActivate(createContext('session-token-valid')),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('rejects a session revoked in the future (pre-revocation)', async () => {
    const { guard, prisma } = createGuard();
    prisma.userSession.findUnique.mockResolvedValue(
      validSessionBase({
        revokedAt: new Date(Date.now() + 60_000),
      }),
    );

    await expect(
      guard.canActivate(createContext('session-token-valid')),
    ).rejects.toThrow(UnauthorizedException);
  });

  // ── Inactive account ───────────────────────────────────────────────────────

  it('rejects a valid session whose user account has been deactivated', async () => {
    const { guard, prisma } = createGuard();
    prisma.userSession.findUnique.mockResolvedValue(
      validSessionBase({
        user: { ...validUserBase, isActive: false },
      }),
    );

    await expect(
      guard.canActivate(createContext('session-token-valid')),
    ).rejects.toThrow(UnauthorizedException);
  });

  // ── Missing token ──────────────────────────────────────────────────────────

  it('rejects requests with no Authorization header and no query token', async () => {
    const { guard } = createGuard();
    const context = {
      switchToHttp: () => ({ getRequest: () => ({ headers: {}, query: {} }) }),
    } as ExecutionContext;

    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it('rejects an Authorization header with a non-Bearer scheme', async () => {
    const { guard } = createGuard();
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({
          headers: { authorization: 'Basic dXNlcjpwYXNz' },
          query: {},
        }),
      }),
    } as ExecutionContext;

    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  // ── Valid session accepted ─────────────────────────────────────────────────

  it('accepts a valid, non-expired, non-revoked session for an active user', async () => {
    const { guard, prisma } = createGuard();
    prisma.userSession.findUnique.mockResolvedValue(validSessionBase());

    const result = await guard.canActivate(createContext('session-token-valid'));
    expect(result).toBe(true);
  });
});
