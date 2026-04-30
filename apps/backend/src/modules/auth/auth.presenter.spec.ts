import { serializeAuthenticatedUser, serializeSession } from './auth.presenter';

describe('auth.presenter', () => {
  it('serializes the authenticated user with stable public fields', () => {
    const createdAt = new Date('2026-04-17T10:00:00.000Z');

    const result = serializeAuthenticatedUser({
      id: 'user-1',
      email: 'rider@mobilis.app',
      fullName: 'Awa Rider',
      phoneNumber: '+22670112233',
      role: 'RIDER',
      provider: 'EMAIL',
      isActive: true,
      isPhoneVerified: false,
      lastLoginAt: null,
      createdAt,
      riderProfile: { id: 'rider-1' },
      driverProfile: null,
    } as never);

    expect(result).toEqual(
      expect.objectContaining({
        id: 'user-1',
        email: 'rider@mobilis.app',
        role: 'RIDER',
        riderProfile: { id: 'rider-1' },
      }),
    );
  });

  it('serializes a session and marks the current flag explicitly', () => {
    const now = new Date('2026-04-17T10:00:00.000Z');

    const result = serializeSession(
      {
        id: 'session-1',
        createdAt: now,
        lastSeenAt: now,
        expiresAt: now,
        revokedAt: null,
        userAgent: 'jest',
        ipAddress: '127.0.0.1',
      } as never,
      true,
    );

    expect(result).toEqual(
      expect.objectContaining({
        id: 'session-1',
        isCurrent: true,
      }),
    );
  });
});
