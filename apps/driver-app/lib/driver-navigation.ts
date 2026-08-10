import {
  fetchDriverProfile,
  fetchMyTrips,
  isActiveTripLifecycleStatus,
  isOrbiApiError,
  type DriverProfileResponse,
  type MyTripsResponse,
} from '@orbi/api';
import { clearDriverPersistedSession, restoreDriverSession } from './auth';
import { normalizeDriverProfileResponse } from './driver-profile-normalizer';

export type DriverNavigationPath =
  | '/auth'
  | '/onboarding'
  | '/accueil'
  | '/offres'
  | '/revenus'
  | '/profil';

export type DriverNavigationGate =
  | 'UNAUTHENTICATED'
  | 'ONBOARDING_INCOMPLETE'
  | 'VALIDATION_PENDING'
  | 'DOCUMENTS_EXPIRED'
  | 'SUSPENDED'
  | 'ACTIVE_TRIP'
  | 'APPROVED';

export type DriverNavigationDecision = {
  gate: DriverNavigationGate;
  targetPath: DriverNavigationPath | null;
  canUseCurrentPath: boolean;
  recoveredFromNetworkIssue: boolean;
};

export async function resolveDriverNavigationSession(pathname: string) {
  const normalizedPath = normalizeDriverNavigationPath(pathname);

  try {
    const context = await restoreDriverSession();
    const [profileResponse, trips] = await Promise.all([
      fetchDriverProfile(context.authClient),
      fetchMyTrips(context.authClient),
    ]);

    return resolveDriverNavigationDecision({
      pathname: normalizedPath,
      profile: normalizeDriverProfileResponse(profileResponse),
      trips,
    });
  } catch (error) {
    if (isExpiredDriverNavigationSession(error)) {
      await clearDriverPersistedSession();
      return buildDriverNavigationDecision({
        gate: 'UNAUTHENTICATED',
        pathname: normalizedPath,
        defaultPath: '/auth',
      });
    }

    return {
      gate: normalizedPath === '/auth' ? 'UNAUTHENTICATED' : 'APPROVED',
      targetPath: normalizedPath === '/auth' ? null : null,
      canUseCurrentPath: normalizedPath !== '/auth',
      recoveredFromNetworkIssue: true,
    } satisfies DriverNavigationDecision;
  }
}

export function resolveDriverNavigationDecision(input: {
  pathname: string;
  profile: DriverProfileResponse;
  trips: MyTripsResponse | null;
}): DriverNavigationDecision {
  const pathname = normalizeDriverNavigationPath(input.pathname);
  const gate = resolveDriverNavigationGate(input.profile, input.trips);
  const defaultPath = resolveDriverDefaultPath(gate);

  return buildDriverNavigationDecision({
    gate,
    pathname,
    defaultPath,
  });
}

export function normalizeDriverNavigationPath(pathname: string) {
  if (pathname === '/') return '/accueil';
  if (pathname.startsWith('/(tabs)/')) {
    return `/${pathname.slice('/(tabs)/'.length)}`;
  }

  return pathname;
}

function resolveDriverNavigationGate(
  profile: DriverProfileResponse,
  trips: MyTripsResponse | null,
): DriverNavigationGate {
  const normalizedProfile = normalizeDriverProfileResponse(profile);
  const driver = normalizedProfile.profile;
  const hasExpiredDocuments = driver.onboarding.documents.some(
    (document) => document.status === 'EXPIRED',
  );
  const hasActiveTrip = Boolean(
    trips?.recentTrips.some((trip) => isActiveTripLifecycleStatus(trip.status)),
  );

  if (driver.status === 'SUSPENDED') {
    return 'SUSPENDED';
  }

  if (hasExpiredDocuments) {
    return 'DOCUMENTS_EXPIRED';
  }

  if (isDriverOnboardingIncomplete(driver)) {
    return 'ONBOARDING_INCOMPLETE';
  }

  if (driver.verificationStatus !== 'APPROVED') {
    return 'VALIDATION_PENDING';
  }

  if (hasActiveTrip) {
    return 'ACTIVE_TRIP';
  }

  return 'APPROVED';
}

function isDriverOnboardingIncomplete(
  driver: DriverProfileResponse['profile'],
) {
  const reviewStatus = driver.onboarding.reviewStatus;

  if (reviewStatus === 'REJECTED' || reviewStatus === 'CHANGES_REQUESTED') {
    return true;
  }

  if (driver.onboarding.readinessPercent < 100) {
    return true;
  }

  if (driver.vehicles.length === 0) {
    return true;
  }

  return false;
}

function resolveDriverDefaultPath(
  gate: DriverNavigationGate,
): DriverNavigationPath {
  if (gate === 'UNAUTHENTICATED') return '/auth';
  if (gate === 'ONBOARDING_INCOMPLETE') return '/onboarding';
  if (
    gate === 'VALIDATION_PENDING' ||
    gate === 'DOCUMENTS_EXPIRED' ||
    gate === 'SUSPENDED'
  ) {
    return '/profil';
  }

  if (gate === 'ACTIVE_TRIP') return '/offres';

  return '/accueil';
}

function buildDriverNavigationDecision(input: {
  gate: DriverNavigationGate;
  pathname: string;
  defaultPath: DriverNavigationPath;
}): DriverNavigationDecision {
  const currentPath = normalizeDriverNavigationPath(input.pathname);
  const allowedPaths = resolveAllowedDriverPaths(input.gate);
  const canUseCurrentPath = allowedPaths.includes(
    currentPath as DriverNavigationPath,
  );

  return {
    gate: input.gate,
    targetPath: canUseCurrentPath ? null : input.defaultPath,
    canUseCurrentPath,
    recoveredFromNetworkIssue: false,
  };
}

function resolveAllowedDriverPaths(gate: DriverNavigationGate) {
  if (gate === 'UNAUTHENTICATED') {
    return ['/auth'];
  }

  if (gate === 'ONBOARDING_INCOMPLETE') {
    return ['/onboarding'];
  }

  if (
    gate === 'VALIDATION_PENDING' ||
    gate === 'DOCUMENTS_EXPIRED' ||
    gate === 'SUSPENDED'
  ) {
    return ['/profil'];
  }

  if (gate === 'ACTIVE_TRIP') {
    return ['/offres'];
  }

  return ['/accueil', '/offres', '/revenus', '/profil'];
}

function isExpiredDriverNavigationSession(error: unknown) {
  return isOrbiApiError(error) && (error.status === 401 || error.status === 403);
}
