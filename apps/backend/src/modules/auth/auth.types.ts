import type {
  DriverProfile,
  RiderProfile,
  User,
  UserRole,
} from '@prisma/client';

export type AuthenticatedUser = User & {
  riderProfile: RiderProfile | null;
  driverProfile: DriverProfile | null;
};

export type AuthenticatedSession = {
  id: string;
  userId: string;
  createdAt: Date;
  lastSeenAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
  userAgent: string | null;
  ipAddress: string | null;
};

export type RequestAuthContext = {
  user: AuthenticatedUser;
  session: AuthenticatedSession;
  token: string;
};

export type AuthenticatedRequestState = {
  auth: RequestAuthContext;
};

export type CurrentUserIdentity = {
  id: string;
  email: string;
  fullName: string;
  phoneNumber: string | null;
  role: UserRole;
  provider: User['provider'];
  isActive: boolean;
  isPhoneVerified: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
  riderProfile: RiderProfile | null;
  driverProfile: DriverProfile | null;
};
