import type { RequestAuthContext } from './auth.types';

export type SerializedAuthenticatedUser = ReturnType<
  typeof serializeAuthenticatedUser
>;
export type SerializedSession = ReturnType<typeof serializeSession>;

export function serializeAuthenticatedUser(user: RequestAuthContext['user']) {
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    phoneNumber: user.phoneNumber,
    role: user.role,
    provider: user.provider,
    isActive: user.isActive,
    isPhoneVerified: user.isPhoneVerified,
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
    riderProfile: user.riderProfile,
    driverProfile: user.driverProfile,
  };
}

export function serializeSession(
  session: RequestAuthContext['session'],
  isCurrent = false,
) {
  return {
    id: session.id,
    createdAt: session.createdAt,
    lastSeenAt: session.lastSeenAt,
    expiresAt: session.expiresAt,
    revokedAt: session.revokedAt,
    userAgent: session.userAgent,
    ipAddress: session.ipAddress,
    isCurrent,
  };
}
