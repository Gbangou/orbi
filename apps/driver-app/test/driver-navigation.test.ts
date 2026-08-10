import { OrbiApiError, fetchDriverProfile, fetchMyTrips } from '@orbi/api';
import {
  clearDriverPersistedSession,
  restoreDriverSession,
} from '../lib/auth';
import {
  normalizeDriverNavigationPath,
  resolveDriverNavigationDecision,
  resolveDriverNavigationSession,
} from '../lib/driver-navigation';

jest.mock('../lib/auth', () => ({
  restoreDriverSession: jest.fn(),
  clearDriverPersistedSession: jest.fn(),
}));

jest.mock('@orbi/api', () => {
  const actual = jest.requireActual('@orbi/api');

  return {
    ...actual,
    fetchDriverProfile: jest.fn(),
    fetchMyTrips: jest.fn(),
  };
});

const mockedRestoreDriverSession = jest.mocked(restoreDriverSession);
const mockedClearDriverPersistedSession = jest.mocked(clearDriverPersistedSession);
const mockedFetchDriverProfile = jest.mocked(fetchDriverProfile);
const mockedFetchMyTrips = jest.mocked(fetchMyTrips);

function buildProfile(input: {
  status?: string;
  verificationStatus?: string;
  readinessPercent?: number;
  reviewStatus?:
    | 'SUBMITTED'
    | 'UNDER_REVIEW'
    | 'APPROVED'
    | 'REJECTED'
    | 'CHANGES_REQUESTED';
  documentStatus?: 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED';
  hasVehicle?: boolean;
} = {}) {
  return {
    profile: {
      id: 'driver-1',
      fullName: 'Issa Driver',
      email: 'driver@orbi.app',
      phoneNumber: '+22676000000',
      status: input.status ?? 'ONLINE',
      verificationStatus: input.verificationStatus ?? 'APPROVED',
      serviceRadiusKm: 9,
      averageRating: 4.8,
      completedTripsCount: 54,
      fatigue: {
        state: 'clear',
        completedTrips: 2,
        drivingMinutes: 64,
        windowHours: 8,
        maxCompletedTrips: 8,
        maxDrivingMinutes: 300,
        restMinutes: 30,
        restUntil: null,
        reason: 'Aucun signal bloquant.',
      },
      onboarding: {
        verificationStatus: input.verificationStatus ?? 'APPROVED',
        reviewStatus: input.reviewStatus ?? 'APPROVED',
        completedItems: input.readinessPercent === 100 ? 5 : 2,
        totalItems: 5,
        readinessPercent: input.readinessPercent ?? 100,
        serviceRadiusKm: 9,
        city: 'Ouagadougou',
        submittedAt: '2026-04-18T08:00:00.000Z',
        latestReviewAt: '2026-04-18T09:00:00.000Z',
        latestDecisionReason: null,
        reviewActorName: 'Ops Orbi',
        notes: 'Profil pret.',
        checklist: [],
        documents: input.documentStatus
          ? [
              {
                type: 'DRIVER_LICENSE',
                status: input.documentStatus,
                fileName: 'permis.pdf',
                uploadedAt: '2026-04-18T08:00:00.000Z',
                expiresAt: null,
                reviewedAt: null,
                rejectionReason: null,
              },
            ]
          : [],
        reviewTimeline: [],
      },
      vehicles:
        input.hasVehicle === false
          ? []
          : [
              {
                id: 'vehicle-1',
                plateNumber: '11 AB 2345',
                make: 'Yamaha',
                model: 'Crypton',
                color: 'Bleu',
                type: 'MOTORCYCLE',
                tier: 'MOTO_STANDARD',
                isActive: true,
              },
            ],
    },
  } as const;
}

function buildTrips(status?: string) {
  return {
    role: 'DRIVER',
    stats: {
      activeTrips: status ? 1 : 0,
      completedTrips: 6,
      cancelledTrips: 1,
      totalAmount: 68500,
      currency: 'XOF',
    },
    pendingRequests: [],
    recentTrips: status
      ? [
          {
            id: 'trip-driver-1',
            pickupAddress: 'Universite Joseph Ki-Zerbo',
            destinationAddress: 'Ouaga 2000',
            status,
            amount: 3500,
            currency: 'XOF',
            counterpartyName: 'Awa Ouedraogo',
            vehicleLabel: 'Yamaha Crypton',
            paymentMethod: 'CASH',
            pickupCode: null,
            receipt: null,
            completedAt: null,
            createdAt: '2026-04-19T08:00:00.000Z',
          },
        ]
      : [],
  } as const;
}

describe('driver navigation guard', () => {
  beforeEach(() => {
    mockedRestoreDriverSession.mockReset();
    mockedClearDriverPersistedSession.mockReset();
    mockedFetchDriverProfile.mockReset();
    mockedFetchMyTrips.mockReset();
  });

  it('normalizes tab paths without keeping sensitive route parameters', () => {
    expect(normalizeDriverNavigationPath('/(tabs)/offres')).toBe('/offres');
    expect(normalizeDriverNavigationPath('/')).toBe('/accueil');
  });

  it('keeps an approved driver inside the main application', () => {
    expect(
      resolveDriverNavigationDecision({
        pathname: '/revenus',
        profile: buildProfile(),
        trips: buildTrips(),
      }),
    ).toMatchObject({
      gate: 'APPROVED',
      targetPath: null,
      canUseCurrentPath: true,
    });
  });

  it('redirects authenticated access to onboarding when the profile is incomplete', () => {
    expect(
      resolveDriverNavigationDecision({
        pathname: '/accueil',
        profile: buildProfile({ readinessPercent: 60 }),
        trips: buildTrips(),
      }),
    ).toMatchObject({
      gate: 'ONBOARDING_INCOMPLETE',
      targetPath: '/onboarding',
      canUseCurrentPath: false,
    });
  });

  it('keeps pending validation, expired documents and suspension out of offers', () => {
    expect(
      resolveDriverNavigationDecision({
        pathname: '/offres',
        profile: buildProfile({ verificationStatus: 'PENDING', reviewStatus: 'UNDER_REVIEW' }),
        trips: buildTrips(),
      }),
    ).toMatchObject({ gate: 'VALIDATION_PENDING', targetPath: '/profil' });

    expect(
      resolveDriverNavigationDecision({
        pathname: '/offres',
        profile: buildProfile({ documentStatus: 'EXPIRED' }),
        trips: buildTrips(),
      }),
    ).toMatchObject({ gate: 'DOCUMENTS_EXPIRED', targetPath: '/profil' });

    expect(
      resolveDriverNavigationDecision({
        pathname: '/offres',
        profile: buildProfile({ status: 'SUSPENDED' }),
        trips: buildTrips(),
      }),
    ).toMatchObject({ gate: 'SUSPENDED', targetPath: '/profil' });
  });

  it('restores an accepted or active trip to the mission screen on restart', () => {
    for (const status of ['MATCHED', 'DRIVER_ARRIVING', 'IN_PROGRESS']) {
      expect(
        resolveDriverNavigationDecision({
          pathname: '/accueil',
          profile: buildProfile(),
          trips: buildTrips(status),
        }),
      ).toMatchObject({
        gate: 'ACTIVE_TRIP',
        targetPath: '/offres',
        canUseCurrentPath: false,
      });
    }
  });

  it('clears an expired server session and sends the driver to auth', async () => {
    mockedRestoreDriverSession.mockResolvedValue({
      authClient: { token: 'driver-auth-client' },
    } as never);
    mockedFetchDriverProfile.mockRejectedValue(new OrbiApiError('expired', 401));

    await expect(resolveDriverNavigationSession('/accueil')).resolves.toMatchObject({
      gate: 'UNAUTHENTICATED',
      targetPath: '/auth',
    });
    expect(mockedClearDriverPersistedSession).toHaveBeenCalledTimes(1);
  });

  it('keeps the current protected screen during a network recovery window', async () => {
    mockedRestoreDriverSession.mockResolvedValue({
      authClient: { token: 'driver-auth-client' },
    } as never);
    mockedFetchDriverProfile.mockRejectedValue(new TypeError('Network request failed'));

    await expect(resolveDriverNavigationSession('/offres')).resolves.toMatchObject({
      targetPath: null,
      canUseCurrentPath: true,
      recoveredFromNetworkIssue: true,
    });
    expect(mockedClearDriverPersistedSession).not.toHaveBeenCalled();
  });
});
