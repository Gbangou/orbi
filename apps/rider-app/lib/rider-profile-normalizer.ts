import type { RiderProfileResponse } from '@orbi/api';

export const fallbackRiderProfile: RiderProfileResponse = {
  profile: {
    id: 'loading',
    fullName: '',
    email: '',
    phoneNumber: null,
    preferredTier: 'MOTO_STANDARD',
    emergencyPhone: null,
    trustedContact: {
      phoneNumber: null,
      shareMode: 'DISABLED',
      status: 'MISSING',
      safetyNote: 'Ajoutez un numéro Burkina pour accélérer le partage en cas de trajet sensible.',
    },
    trustedContacts: [],
    savedPlaces: [],
    stats: {
      totalRideRequests: 0,
      totalTrips: 0,
      completedTrips: 0,
      savedPlaces: 0,
    },
  },
};

function stringOrFallback(value: unknown, fallback: string) {
  return typeof value === 'string' ? value : fallback;
}

function nullableStringOrFallback(
  value: unknown,
  fallback: string | null,
) {
  return typeof value === 'string' || value === null ? value : fallback;
}

function numberOrFallback(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function objectOrNull(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : null;
}

export function normalizeRiderProfileResponse(
  response: unknown,
): RiderProfileResponse {
  const fallback = fallbackRiderProfile.profile;
  const responseObject = objectOrNull(response);
  const input = objectOrNull(responseObject?.profile);
  const trustedContact = objectOrNull(input?.trustedContact);
  const stats = objectOrNull(input?.stats);

  const normalizedTrustedContact: RiderProfileResponse['profile']['trustedContact'] = {
    phoneNumber: nullableStringOrFallback(
      trustedContact?.phoneNumber,
      fallback.trustedContact.phoneNumber,
    ),
    shareMode:
      trustedContact?.shareMode === 'MANUAL' ||
      trustedContact?.shareMode === 'NIGHT' ||
      trustedContact?.shareMode === 'ALL_TRIPS' ||
      trustedContact?.shareMode === 'DISABLED'
        ? trustedContact.shareMode
        : fallback.trustedContact.shareMode,
    status:
      trustedContact?.status === 'READY' || trustedContact?.status === 'MISSING'
        ? trustedContact.status
        : fallback.trustedContact.status,
    safetyNote: stringOrFallback(
      trustedContact?.safetyNote,
      fallback.trustedContact.safetyNote,
    ),
  };

  return {
    profile: {
      id: stringOrFallback(input?.id, fallback.id),
      fullName: stringOrFallback(input?.fullName, fallback.fullName),
      email: stringOrFallback(input?.email, fallback.email),
      phoneNumber: nullableStringOrFallback(
        input?.phoneNumber,
        fallback.phoneNumber,
      ),
      preferredTier:
        input?.preferredTier === 'MOTO_STANDARD' ||
        input?.preferredTier === 'MOTO_PLUS' ||
        input?.preferredTier === 'CAR_STANDARD' ||
        input?.preferredTier === 'CAR_COMFORT' ||
        input?.preferredTier === 'CAR_XL'
          ? input.preferredTier
          : fallback.preferredTier,
      emergencyPhone: nullableStringOrFallback(
        input?.emergencyPhone,
        fallback.emergencyPhone,
      ),
      trustedContact: normalizedTrustedContact,
      trustedContacts: Array.isArray(input?.trustedContacts)
        ? input.trustedContacts
        : fallback.trustedContacts,
      savedPlaces: Array.isArray(input?.savedPlaces)
        ? input.savedPlaces
        : fallback.savedPlaces,
      stats: {
        totalRideRequests: numberOrFallback(
          stats?.totalRideRequests,
          fallback.stats.totalRideRequests,
        ),
        totalTrips: numberOrFallback(stats?.totalTrips, fallback.stats.totalTrips),
        completedTrips: numberOrFallback(
          stats?.completedTrips,
          fallback.stats.completedTrips,
        ),
        savedPlaces: numberOrFallback(
          stats?.savedPlaces,
          Array.isArray(input?.savedPlaces)
            ? input.savedPlaces.length
            : fallback.stats.savedPlaces,
        ),
      },
    },
  };
}
