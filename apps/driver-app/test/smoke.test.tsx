import React from 'react';
import type { ReactTestInstance } from 'react-test-renderer';
import { router } from 'expo-router';
import {
  acceptRideRequestWithApi,
  declineDriverOfferWithApi,
  driverOffers,
  fetchDriverEarnings,
  fetchDriverOffers,
  fetchDriverProfile,
  fetchMyTrips,
  fetchTripDetail,
  reportTripIncidentWithApi,
  triggerTripSafetySosWithApi,
  requestDriverDocumentUploadLinks,
  upsertDriverOnboarding,
  updateDriverAvailabilityWithApi,
  updateTripStatusWithApi,
  verifyPickupCodeWithApi,
} from '@orbi/api';
import {
  restoreDriverSession,
  signInDriverAccount,
  signOutDriverAccount,
} from '../lib/auth';
import { resolveDriverAppError } from '../lib/session-feedback';
import DriverAuthScreen from '../app/auth';
import DriverHomeScreen from '../app/accueil';
import OffersScreen from '../app/offres';
import ProfilScreen from '../app/profil';
import RevenusScreen from '../app/revenus';
import {
  changeInputByPlaceholder,
  collectText,
  expectText,
  flushMicrotasks,
  invokeInAct,
  pressByText,
  renderScreen,
} from '../../../scripts/testing/mobile/test-utils';

jest.mock('../lib/auth', () => ({
  signInDriverAccount: jest.fn(),
  signUpDriverAccount: jest.fn(),
  restoreDriverSession: jest.fn(),
  signOutDriverAccount: jest.fn(),
}));

jest.mock('../lib/session-feedback', () => ({
  resolveDriverAppError: jest.fn(),
}));

jest.mock('../lib/use-live-refresh', () => ({
  useLiveRefresh: jest.fn(),
}));

const driverRealtimeState: {
  eventHandler: ((eventType: string) => void) | null;
  options:
    | {
        onHeartbeat?: () => void;
        onOpen?: () => void;
        onError?: () => void;
      }
    | null;
} = {
  eventHandler: null,
  options: null,
};

jest.mock('../lib/use-driver-realtime-stream', () => ({
  useDriverRealtimeStream: jest.fn(
    (
      _sessionToken: string | null,
      onEvent: (eventType: string) => void,
      options?: {
        onHeartbeat?: () => void;
        onOpen?: () => void;
        onError?: () => void;
      },
    ) => {
      driverRealtimeState.eventHandler = onEvent;
      driverRealtimeState.options = options ?? null;
    },
  ),
}));

jest.mock('../lib/use-driver-presence', () => ({
  useDriverPresence: jest.fn(() => ({
    presenceNote: 'Presence chauffeur synchronisee.',
  })),
}));

jest.mock('../lib/offer-reservation', () => ({
  formatReservationCountdown: jest.fn(() => '05:00'),
  isOfferReservationActive: jest.fn(() => true),
  useReservationClock: jest.fn(() => Date.parse('2026-04-19T10:00:00.000Z')),
  useReservationExpiryRefresh: jest.fn(),
}));

jest.mock('@orbi/api', () => {
  const actual = jest.requireActual('@orbi/api');

  return {
    ...actual,
    fetchDriverOffers: jest.fn(),
    fetchDriverEarnings: jest.fn(),
    fetchDriverProfile: jest.fn(),
    fetchMyTrips: jest.fn(),
    fetchTripDetail: jest.fn(),
    acceptRideRequestWithApi: jest.fn(),
    declineDriverOfferWithApi: jest.fn(),
    requestDriverDocumentUploadLinks: jest.fn(),
    upsertDriverOnboarding: jest.fn(),
    updateDriverAvailabilityWithApi: jest.fn(),
    updateTripStatusWithApi: jest.fn(),
    verifyPickupCodeWithApi: jest.fn(),
    reportTripIncidentWithApi: jest.fn(),
    triggerTripSafetySosWithApi: jest.fn(),
  };
});

const mockedSignInDriverAccount = jest.mocked(signInDriverAccount);
const mockedRestoreDriverSession = jest.mocked(restoreDriverSession);
const mockedSignOutDriverAccount = jest.mocked(signOutDriverAccount);
const mockedFetchDriverOffers = jest.mocked(fetchDriverOffers);
const mockedFetchMyTrips = jest.mocked(fetchMyTrips);
const mockedFetchDriverEarnings = jest.mocked(fetchDriverEarnings);
const mockedFetchDriverProfile = jest.mocked(fetchDriverProfile);
const mockedFetchTripDetail = jest.mocked(fetchTripDetail);
const mockedAcceptRideRequestWithApi = jest.mocked(acceptRideRequestWithApi);
const mockedDeclineDriverOfferWithApi = jest.mocked(declineDriverOfferWithApi);
const mockedReportTripIncidentWithApi = jest.mocked(reportTripIncidentWithApi);
const mockedTriggerTripSafetySosWithApi = jest.mocked(triggerTripSafetySosWithApi);
const mockedRequestDriverDocumentUploadLinks = jest.mocked(requestDriverDocumentUploadLinks);
const mockedUpsertDriverOnboarding = jest.mocked(upsertDriverOnboarding);
const mockedUpdateDriverAvailabilityWithApi = jest.mocked(updateDriverAvailabilityWithApi);
const mockedUpdateTripStatusWithApi = jest.mocked(updateTripStatusWithApi);
const mockedVerifyPickupCodeWithApi = jest.mocked(verifyPickupCodeWithApi);
const mockedResolveDriverAppError = jest.mocked(resolveDriverAppError);

function buildDriverSession() {
  return {
    authClient: { token: 'driver-auth-client' },
    me: {
      user: {
        fullName: 'Issa Driver',
      },
    },
    session: {
      sessionToken: 'driver-session-token',
    },
  };
}

function buildDriverTrips() {
  return {
    role: 'DRIVER' as const,
    stats: {
      activeTrips: 0,
      completedTrips: 6,
      cancelledTrips: 1,
      totalAmount: 68500,
      currency: 'XOF',
    },
    pendingRequests: [],
    recentTrips: [],
  };
}

function buildDriverEarningsResponse(input: {
  today?: number;
  week?: number;
  month?: number;
  completedTrips?: number;
  averagePayout?: number;
  recentTrips?: Array<{
    id: string;
    route: string;
    payout: number;
    grossFare?: number;
    platformFee?: number;
    status: string;
    completedAt: string | null;
  }>;
} = {}) {
  const recentTrips = input.recentTrips ?? [];
  const recentNetPayout = recentTrips.reduce((sum, trip) => sum + trip.payout, 0);
  const recentGrossFare = recentTrips.reduce(
    (sum, trip) => sum + (trip.grossFare ?? Math.round(trip.payout / 0.82)),
    0,
  );

  return {
    summary: {
      currency: 'XOF',
      today: input.today ?? 0,
      week: input.week ?? 0,
      month: input.month ?? 0,
      completedTrips: input.completedTrips ?? 0,
      averagePayout: input.averagePayout ?? 0,
    },
    settlement: {
      currency: 'XOF',
      source: 'COMPLETED_TRIPS',
      payoutRateBps: 8200,
      payoutRate: 0.82,
      recentTripCount: recentTrips.length,
      recentGrossFare,
      recentNetPayout,
      recentPlatformFee: Math.max(0, recentGrossFare - recentNetPayout),
      state: 'RECONCILED',
      anomalies: [],
      calculatedAt: '2026-04-19T08:45:00.000Z',
    },
    recentTrips: recentTrips.map((trip) => ({
      ...trip,
      grossFare: trip.grossFare ?? Math.round(trip.payout / 0.82),
      platformFee:
        trip.platformFee ??
        Math.max(0, Math.round(trip.payout / 0.82) - trip.payout),
    })),
  };
}

function buildDriverProfile() {
  return {
    profile: {
      id: 'driver-1',
      fullName: 'Issa Driver',
      email: 'driver@orbi.app',
      phoneNumber: '+22676000000',
      status: 'ONLINE',
      verificationStatus: 'APPROVED',
      serviceRadiusKm: 9,
      currentLatitude: null,
      currentLongitude: null,
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
        reason: 'Aucun signal fatigue bloquant sur la fenetre recente.',
      },
      onboarding: {
        verificationStatus: 'APPROVED',
        reviewStatus: 'APPROVED',
        completedItems: 5,
        totalItems: 5,
        readinessPercent: 100,
        serviceRadiusKm: 9,
        city: 'Ouagadougou',
        submittedAt: '2026-04-18T08:00:00.000Z',
        latestReviewAt: '2026-04-18T09:00:00.000Z',
        latestDecisionReason: null,
        reviewActorName: 'Ops Orbi',
        notes: 'Profil pret.',
        checklist: [],
        documents: [],
        reviewTimeline: [],
      },
      vehicles: [
        {
          id: 'vehicle-1',
          plateNumber: '11 AB 2345',
          make: 'Yamaha',
          model: 'Crypton',
          color: 'Blue',
          type: 'MOTORCYCLE',
          tier: 'MOTO_STANDARD',
          isActive: true,
        },
      ],
    },
  };
}

function buildDriverTripsWithStatus(status: string) {
  return {
    role: 'DRIVER' as const,
    stats: {
      activeTrips: 1,
      completedTrips: 6,
      cancelledTrips: 1,
      totalAmount: 68500,
      currency: 'XOF',
    },
    pendingRequests: [],
    recentTrips: [
      {
        id: 'trip-driver-1',
        pickupAddress: 'Universite Joseph Ki-Zerbo',
        destinationAddress: 'Ouaga 2000',
        status,
        amount: 3500,
        currency: 'XOF',
        counterpartyName: 'Awa Ouedraogo',
        vehicleLabel: 'Yamaha Crypton',
        pickupCode: '1234',
        completedAt: null,
        createdAt: '2026-04-19T08:00:00.000Z',
      },
    ],
  };
}

function buildDriverTripDetail(eventIds: string[], labels: string[]) {
  const latestRouteSignalAt = new Date().toISOString();

  return {
    trip: {
      id: 'trip-driver-1',
      rideRequestId: 'ride-request-1',
      status: 'MATCHED',
      pickupAddress: 'Universite Joseph Ki-Zerbo',
      destinationAddress: 'Ouaga 2000',
      riderName: 'Awa Ouedraogo',
      driverName: 'Issa Driver',
      vehicleLabel: 'Yamaha Crypton',
      driverVerification: {
        verificationStatus: 'APPROVED',
        phoneVerified: true,
        averageRating: 4.8,
        completedTripsCount: 126,
        vehicle: {
          plateNumber: '11 AA 1234',
          color: 'rouge',
          make: 'Yamaha',
          model: 'Crypton',
        },
      },
      routeMonitoring: {
        state: 'warning',
        alertCount: 1,
        lastAlertType: 'LONG_STOP',
        lastAlertAt: latestRouteSignalAt,
        lastPositionAt: latestRouteSignalAt,
        latestPosition: {
          latitude: 12.37,
          longitude: -1.52,
          accuracyMeters: 12,
          speedKph: 18,
          distanceToPickupKm: 0.4,
          distanceToDestinationKm: 5.1,
          observedAt: latestRouteSignalAt,
          sourceRole: 'DRIVER',
        },
      },
      pickupCode: '1234',
      actualFare: 3500,
      currency: 'XOF',
      startedAt: null,
      completedAt: null,
      createdAt: '2026-04-19T08:00:00.000Z',
      timeline: eventIds.map((id, index) => ({
        id,
        eventType: `event-${index + 1}`,
        label: labels[index] ?? `Event ${index + 1}`,
        createdAt: `2026-04-19T08:0${index}:00.000Z`,
      })),
    },
  };
}

beforeEach(() => {
  mockedSignInDriverAccount.mockReset();
  mockedRestoreDriverSession.mockReset();
  mockedSignOutDriverAccount.mockReset();
  mockedFetchDriverOffers.mockReset();
  mockedFetchMyTrips.mockReset();
  mockedFetchDriverEarnings.mockReset();
  mockedFetchDriverProfile.mockReset();
  mockedFetchTripDetail.mockReset();
  mockedAcceptRideRequestWithApi.mockReset();
  mockedDeclineDriverOfferWithApi.mockReset();
  mockedReportTripIncidentWithApi.mockReset();
  mockedTriggerTripSafetySosWithApi.mockReset();
  mockedRequestDriverDocumentUploadLinks.mockReset();
  mockedUpsertDriverOnboarding.mockReset();
  mockedUpdateDriverAvailabilityWithApi.mockReset();
  mockedUpdateTripStatusWithApi.mockReset();
  mockedVerifyPickupCodeWithApi.mockReset();
  mockedResolveDriverAppError.mockReset();

  mockedResolveDriverAppError.mockResolvedValue({
    message: 'Fallback driver error.',
    shouldClearSessionToken: false,
  });
  mockedTriggerTripSafetySosWithApi.mockResolvedValue({
    sos: {
      tripId: 'trip-1',
      ticketId: 'ticket-sos-1',
      priority: 3,
      incidentType: 'SOS_TRIGGERED',
      reportedByRole: 'DRIVER',
      status: 'OPEN',
      localEmergencyNumber: '112',
      locationCaptured: false,
    },
  } as never);
  driverRealtimeState.eventHandler = null;
  driverRealtimeState.options = null;
});

describe('driver smoke flows', () => {
  it('signs in and redirects to accueil', async () => {
    mockedSignInDriverAccount.mockResolvedValue(buildDriverSession() as never);

    const renderer = await renderScreen(<DriverAuthScreen />);

    expectText(renderer, 'Saisissez un email pour ouvrir une session reelle.');
    await pressByText(renderer, 'Utiliser le compte demo');
    expectText(renderer, 'Email pret');
    expectText(renderer, 'Mot de passe pret');
    await pressByText(renderer, 'Se connecter');

    expect(mockedSignInDriverAccount).toHaveBeenCalledWith({
      email: 'driver@orbi.app',
      password: 'Orbi123!',
    });
    expect(router.replace).toHaveBeenCalledWith('/accueil');
    expectText(renderer, 'Session chauffeur active.');
  });

  it('opens the driver demo session from the top action', async () => {
    mockedSignInDriverAccount.mockResolvedValue(buildDriverSession() as never);

    const renderer = await renderScreen(<DriverAuthScreen />);
    await pressByText(renderer, 'Demo driver');

    expect(mockedSignInDriverAccount).toHaveBeenCalledWith({
      email: 'driver@orbi.app',
      password: 'Orbi123!',
    });
    expect(router.replace).toHaveBeenCalledWith('/accueil');
  });

  it('loads the driver home cockpit', async () => {
    mockedRestoreDriverSession.mockResolvedValue(buildDriverSession() as never);
    mockedFetchDriverOffers.mockResolvedValue(driverOffers.slice(0, 2) as never);
    mockedFetchMyTrips.mockResolvedValue(buildDriverTrips() as never);
    mockedFetchDriverEarnings.mockResolvedValue(
      buildDriverEarningsResponse({
        today: 12500,
        week: 48200,
        month: 160300,
        completedTrips: 6,
        averagePayout: 8033,
      }) as never,
    );
    mockedFetchDriverProfile.mockResolvedValue(buildDriverProfile() as never);

    const renderer = await renderScreen(<DriverHomeScreen />);
    await pressByText(renderer, 'Actualiser le direct');

    expectText(
      renderer,
      'Connecte comme Issa Driver. Statut ONLINE. 2 offres disponibles et 0 course active.',
    );
    expectText(renderer, 'Voir toutes les offres');
  });

  it('loads the driver earnings cockpit with active mission context', async () => {
    mockedRestoreDriverSession.mockResolvedValue(buildDriverSession() as never);
    mockedFetchDriverEarnings.mockResolvedValue(
      buildDriverEarningsResponse({
        today: 12500,
        week: 48200,
        month: 160300,
        completedTrips: 6,
        averagePayout: 8033,
        recentTrips: [
          {
            id: 'earning-trip-1',
            route: 'Universite Joseph Ki-Zerbo vers Ouaga 2000',
            payout: 3500,
            grossFare: 4268,
            platformFee: 768,
            status: 'COMPLETED',
            completedAt: '2026-04-19T08:40:00.000Z',
          },
        ],
      }) as never,
    );
    mockedFetchMyTrips.mockResolvedValue(buildDriverTripsWithStatus('MATCHED') as never);
    mockedFetchDriverProfile.mockResolvedValue(buildDriverProfile() as never);

    const renderer = await renderScreen(<RevenusScreen />);
    await pressByText(renderer, 'Actualiser les revenus');

    expectText(renderer, 'Revenus synchronises. Mission Matched en cours.');
    expectText(renderer, 'Universite Joseph Ki-Zerbo vers Ouaga 2000');
    expectText(renderer, 'Controle payout');
    expectText(renderer, '82% chauffeur');
    expectText(renderer, 'Plateforme estimee');
    expectText(renderer, 'Completed');
  });

  it('accepts an offer from the offres screen', async () => {
    mockedRestoreDriverSession.mockResolvedValue(buildDriverSession() as never);
    mockedFetchDriverOffers.mockResolvedValue(
      driverOffers.slice(0, 1).map((offer) => ({
        ...offer,
        reservationExpiresAt: '2099-01-01T00:00:00.000Z',
      })) as never,
    );
    mockedFetchMyTrips.mockResolvedValue(buildDriverTrips() as never);
    mockedFetchDriverProfile.mockResolvedValue(buildDriverProfile() as never);
    mockedAcceptRideRequestWithApi.mockResolvedValue({
      trip: {
        id: 'trip-accepted-12345678',
        status: 'MATCHED',
      },
    } as never);

    const renderer = await renderScreen(<OffersScreen />);
    await pressByText(renderer, 'Actualiser le direct');

    await pressByText(renderer, 'Accepter cette offre');
    await flushMicrotasks();

    expect(mockedAcceptRideRequestWithApi).toHaveBeenCalledWith(
      { token: 'driver-auth-client' },
      driverOffers[0]?.id,
    );
  });

  it('absorbs double taps while accepting an offer from the offres screen', async () => {
    mockedRestoreDriverSession.mockResolvedValue(buildDriverSession() as never);
    mockedFetchDriverOffers.mockResolvedValue(
      driverOffers.slice(0, 1).map((offer) => ({
        ...offer,
        reservationExpiresAt: '2099-01-01T00:00:00.000Z',
      })) as never,
    );
    mockedFetchMyTrips.mockResolvedValue(buildDriverTrips() as never);
    mockedFetchDriverProfile.mockResolvedValue(buildDriverProfile() as never);

    let resolveAccept: (value: unknown) => void = () => {};
    mockedAcceptRideRequestWithApi.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveAccept = resolve;
        }) as never,
    );

    const renderer = await renderScreen(<OffersScreen />);
    await pressByText(renderer, 'Actualiser le direct');

    const acceptButton = renderer.root.find(
      (node: ReactTestInstance) =>
        (node.type as unknown) === 'Pressable' &&
        collectText(node).includes('Accepter cette offre'),
    );

    await invokeInAct(() => {
      acceptButton.props.onPress?.();
      acceptButton.props.onPress?.();
    });

    expect(mockedAcceptRideRequestWithApi).toHaveBeenCalledTimes(1);

    resolveAccept({
      trip: {
        id: 'trip-accepted-12345678',
        status: 'MATCHED',
      },
    });
    await flushMicrotasks();
  });

  it('declines an offer from the offres screen', async () => {
    mockedRestoreDriverSession.mockResolvedValue(buildDriverSession() as never);
    mockedFetchDriverOffers
      .mockResolvedValueOnce(
        driverOffers.slice(0, 1).map((offer) => ({
          ...offer,
          reservationExpiresAt: '2099-01-01T00:00:00.000Z',
        })) as never,
      )
      .mockResolvedValueOnce([] as never);
    mockedFetchMyTrips
      .mockResolvedValueOnce(buildDriverTrips() as never)
      .mockResolvedValueOnce(buildDriverTrips() as never);
    mockedFetchDriverProfile
      .mockResolvedValueOnce(buildDriverProfile() as never)
      .mockResolvedValueOnce(buildDriverProfile() as never);
    mockedDeclineDriverOfferWithApi.mockResolvedValue({
      offer: {
        rideRequestId: driverOffers[0]?.id,
        status: 'DECLINED',
      },
    } as never);

    const renderer = await renderScreen(<OffersScreen />);
    await pressByText(renderer, 'Actualiser le direct');

    await pressByText(renderer, 'Refuser cette offre');
    await flushMicrotasks();

    expect(mockedDeclineDriverOfferWithApi).toHaveBeenCalledWith(
      { token: 'driver-auth-client' },
      driverOffers[0]?.id,
    );
    expectText(renderer, 'Aucune reservation active');
  });

  it('shows offer confidence and adaptive reservation window on the offres screen', async () => {
    mockedRestoreDriverSession.mockResolvedValue(buildDriverSession() as never);
    mockedFetchDriverOffers.mockResolvedValue(
      driverOffers.slice(0, 1).map((offer) => ({
        ...offer,
        reservationExpiresAt: '2099-01-01T00:00:00.000Z',
      })) as never,
    );
    mockedFetchMyTrips.mockResolvedValue(buildDriverTrips() as never);
    mockedFetchDriverProfile.mockResolvedValue(buildDriverProfile() as never);

    const renderer = await renderScreen(<OffersScreen />);
    await pressByText(renderer, 'Actualiser le direct');

    expectText(renderer, 'Contexte dispatch: HIGH - HEAVY - dispo 74/100');
    expectText(renderer, 'Confiance offre: PRIORITY (91/100)');
    expectText(renderer, 'Fenetre d acceptation: 45s');
    expectText(
      renderer,
      'Memoire dispatch solide: acceptations recentes elevees. Signal recent.',
    );
  });

  it('shows the driver fallback profile when the network is down', async () => {
    mockedRestoreDriverSession.mockResolvedValue(buildDriverSession() as never);
    mockedFetchDriverProfile.mockRejectedValue(new TypeError('Network request failed'));
    mockedResolveDriverAppError.mockResolvedValue({
      message: 'Profil local de secours affiche en attendant la connexion API.',
      shouldClearSessionToken: false,
    });

    const renderer = await renderScreen(<ProfilScreen />);
    await flushMicrotasks();

    expectText(renderer, 'Profil local de secours affiche en attendant la connexion API.');
    expectText(renderer, 'Issa Driver');
    expectText(renderer, 'Onboarding securise');
  });

  it('redirects to auth when the driver session is expired during profile refresh', async () => {
    mockedRestoreDriverSession.mockRejectedValue(new Error('currently inactive session'));
    mockedResolveDriverAppError.mockImplementation(async () => {
      router.replace('/auth');
      return {
        message: 'Votre session chauffeur a expire. Reconnectez-vous pour reprendre le direct.',
        shouldClearSessionToken: true,
      };
    });

    const renderer = await renderScreen(<ProfilScreen />);
    await flushMicrotasks();

    expect(router.replace).toHaveBeenCalledWith('/auth');
    expectText(
      renderer,
      'Votre session chauffeur a expire. Reconnectez-vous pour reprendre le direct.',
    );
  });

  it('blocks onboarding submission when required driver data is missing', async () => {
    mockedRestoreDriverSession.mockResolvedValue(buildDriverSession() as never);
    mockedFetchDriverProfile.mockRejectedValue(new TypeError('Network request failed'));
    mockedResolveDriverAppError.mockResolvedValue({
      message: 'Profil local de secours affiche en attendant la connexion API.',
      shouldClearSessionToken: false,
    });

    const renderer = await renderScreen(<ProfilScreen />);
    await flushMicrotasks();
    await pressByText(renderer, 'Soumettre le dossier ops');

    expect(mockedRequestDriverDocumentUploadLinks).not.toHaveBeenCalled();
    expect(mockedUpsertDriverOnboarding).not.toHaveBeenCalled();
    expectText(renderer, 'Le numero de telephone est requis avant la soumission.');
  });

  it('shows document upload constraints and submits driver-app integrity source', async () => {
    const profile = buildDriverProfile();
    profile.profile.onboarding.city = 'OUAGADOUGOU';
    mockedRestoreDriverSession.mockResolvedValue(buildDriverSession() as never);
    mockedFetchDriverProfile.mockResolvedValue(profile as never);
    mockedFetchMyTrips.mockResolvedValue(buildDriverTrips() as never);
    mockedRequestDriverDocumentUploadLinks.mockResolvedValue({
      links: [
        'identity-document',
        'driver-license',
        'vehicle-registration',
        'insurance-proof',
        'selfie-verification',
      ].map((key, index) => ({
        storageKey: `driver-1/${key}.pdf`,
        expiresAt: '2026-05-02T12:00:00.000Z',
        uploadUrl: `https://storage.orbi.local/upload/${key}`,
        method: 'PUT' as const,
        headers: {
          'content-type': index === 4 ? 'image/jpeg' : 'application/pdf',
        },
        constraints: {
          allowedMimeTypes:
            index === 4
              ? ['image/jpeg', 'image/png']
              : ['application/pdf', 'image/jpeg', 'image/png'],
          allowedExtensions:
            index === 4 ? ['jpg', 'jpeg', 'png'] : ['pdf', 'jpg', 'jpeg', 'png'],
          maxBytes: index === 4 ? 3_000_000 : 5_000_000,
        },
      })),
    } as never);
    mockedUpsertDriverOnboarding.mockResolvedValue({
      onboarding: {
        ...profile.profile.onboarding,
        reviewStatus: 'SUBMITTED',
      },
    } as never);

    const renderer = await renderScreen(<ProfilScreen />);
    await flushMicrotasks();

    await changeInputByPlaceholder(renderer, 'BF-12345', 'BF-99887');
    await changeInputByPlaceholder(renderer, 'ex: carte-identite.pdf', 'carte-identite.pdf');
    await changeInputByPlaceholder(renderer, 'ex: permis.pdf', 'permis.pdf');
    await changeInputByPlaceholder(renderer, 'ex: carte-grise.pdf', 'carte-grise.pdf');
    await changeInputByPlaceholder(renderer, 'ex: assurance.pdf', 'assurance.pdf');
    await changeInputByPlaceholder(renderer, 'ex: selfie.jpg', 'selfie.jpg');
    await pressByText(renderer, 'Preparer les liens documentaires');

    expectText(
      renderer,
      'Liens documentaires securises prets avec contraintes visibles.',
    );
    expectText(
      renderer,
      'Lien securise pret jusqu au 02/05/2026 12:00:00. Limite: 5.0 MB, formats: pdf, jpg, jpeg, png',
    );
    expectText(
      renderer,
      'Lien securise pret jusqu au 02/05/2026 12:00:00. Limite: 3.0 MB, formats: jpg, jpeg, png',
    );

    await pressByText(renderer, 'Soumettre le dossier ops');

    expect(mockedUpsertDriverOnboarding).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        documentArtifacts: expect.arrayContaining([
          expect.objectContaining({
            type: 'IDENTITY_DOCUMENT',
            uploadSource: 'driver-app',
          }),
          expect.objectContaining({
            type: 'SELFIE_VERIFICATION',
            uploadSource: 'driver-app',
          }),
        ]),
      }),
    );
  });

  it('signs out the driver account from profile screen', async () => {
    mockedRestoreDriverSession.mockResolvedValue(buildDriverSession() as never);
    mockedFetchDriverProfile.mockResolvedValue(buildDriverProfile() as never);
    mockedSignOutDriverAccount.mockResolvedValue(undefined);

    const renderer = await renderScreen(<ProfilScreen />);
    await flushMicrotasks();
    await pressByText(renderer, 'Se deconnecter');

    expect(mockedSignOutDriverAccount).toHaveBeenCalled();
    expect(router.replace).toHaveBeenCalledWith('/auth');
  });

  it('shows a fresh offer banner on driver home after realtime sync', async () => {
    mockedRestoreDriverSession.mockResolvedValue(buildDriverSession() as never);
    mockedFetchDriverOffers
      .mockResolvedValueOnce(driverOffers.slice(0, 1) as never)
      .mockResolvedValueOnce(driverOffers.slice(0, 2) as never);
    mockedFetchMyTrips
      .mockResolvedValueOnce(buildDriverTrips() as never)
      .mockResolvedValueOnce(buildDriverTrips() as never);
    mockedFetchDriverEarnings
      .mockResolvedValueOnce(
        buildDriverEarningsResponse({
          today: 12500,
          week: 48200,
          month: 160300,
          completedTrips: 6,
          averagePayout: 8033,
        }) as never,
      )
      .mockResolvedValueOnce(
        buildDriverEarningsResponse({
          today: 12500,
          week: 48200,
          month: 160300,
          completedTrips: 6,
          averagePayout: 8033,
        }) as never,
      );
    mockedFetchDriverProfile
      .mockResolvedValueOnce(buildDriverProfile() as never)
      .mockResolvedValueOnce(buildDriverProfile() as never);

    const renderer = await renderScreen(<DriverHomeScreen />);
    await pressByText(renderer, 'Actualiser le direct');

    await invokeInAct(async () => {
      driverRealtimeState.eventHandler?.('ride-request.reservation-assigned');
    });
    await flushMicrotasks();

    expectText(renderer, 'Une nouvelle offre vient d etre resynchronisee.');
    expectText(renderer, 'Nouvelle offre live');
  });

  it('shows expired reservation notice on offers after realtime sync removes an offer', async () => {
    mockedRestoreDriverSession.mockResolvedValue(buildDriverSession() as never);
    mockedFetchDriverOffers
      .mockResolvedValueOnce(
        driverOffers.slice(0, 1).map((offer) => ({
          ...offer,
          reservationExpiresAt: '2099-01-01T00:00:00.000Z',
        })) as never,
      )
      .mockResolvedValueOnce([] as never);
    mockedFetchMyTrips
      .mockResolvedValueOnce(buildDriverTrips() as never)
      .mockResolvedValueOnce(buildDriverTrips() as never);
    mockedFetchDriverProfile
      .mockResolvedValueOnce(buildDriverProfile() as never)
      .mockResolvedValueOnce(buildDriverProfile() as never);

    const renderer = await renderScreen(<OffersScreen />);
    await pressByText(renderer, 'Actualiser le direct');

    await invokeInAct(async () => {
      driverRealtimeState.eventHandler?.('ride-request.reservation-expired');
    });
    await flushMicrotasks();

    expectText(renderer, 'Une reservation a expire');
    expectText(
      renderer,
      'Les elements sortis du flux live ont ete retires pour garder la liste fiable.',
    );
  });

  it('shows driver trip transition details after a realtime update on offers', async () => {
    mockedRestoreDriverSession.mockResolvedValue(buildDriverSession() as never);
    mockedFetchDriverOffers
      .mockResolvedValueOnce([] as never)
      .mockResolvedValueOnce([] as never);
    mockedFetchMyTrips
      .mockResolvedValueOnce(buildDriverTripsWithStatus('MATCHED') as never)
      .mockResolvedValueOnce(buildDriverTripsWithStatus('DRIVER_ARRIVING') as never);
    mockedFetchDriverProfile
      .mockResolvedValueOnce(buildDriverProfile() as never)
      .mockResolvedValueOnce(buildDriverProfile() as never);
    mockedFetchTripDetail
      .mockResolvedValueOnce(
        buildDriverTripDetail(['driver-timeline-1'], ['Trajet cree']) as never,
      )
      .mockResolvedValueOnce(
        buildDriverTripDetail(
          ['driver-timeline-1', 'driver-timeline-2'],
          ['Trajet cree', 'Chauffeur en approche'],
        ) as never,
      );

    const renderer = await renderScreen(<OffersScreen />);
    await pressByText(renderer, 'Actualiser le direct');

    await invokeInAct(async () => {
      driverRealtimeState.eventHandler?.('trip.updated');
    });
    await flushMicrotasks();

    expectText(renderer, 'Statut critique mis a jour: Driver Arriving.');
    expectText(renderer, 'Chauffeur en approche');
    expectText(renderer, 'Mission en direct');
    expectText(renderer, 'Rider');
    expectText(renderer, 'Driver');
    expectText(renderer, 'Zone mission approx. 12.3700, -1.5200');
    expectText(renderer, 'Precision 12 m');
    expectText(renderer, 'Rider au pickup - 18 km/h');
    expectText(renderer, 'Pickup');
    expectText(renderer, '0.4 km');
    expectText(
      renderer,
      'Demandez le code pickup au passager avant de demarrer la course.',
    );
  });

  it('keeps driver dispatch usable when trip detail is temporarily unavailable', async () => {
    mockedRestoreDriverSession.mockResolvedValue(buildDriverSession() as never);
    mockedFetchDriverOffers.mockResolvedValue([] as never);
    mockedFetchMyTrips.mockResolvedValue(buildDriverTripsWithStatus('DRIVER_ARRIVING') as never);
    mockedFetchDriverProfile.mockResolvedValue(buildDriverProfile() as never);
    mockedFetchTripDetail.mockRejectedValue(new TypeError('Network request failed'));

    const renderer = await renderScreen(<OffersScreen />);
    await pressByText(renderer, 'Actualiser le direct');

    expectText(renderer, 'Course active');
    expectText(renderer, 'Mission en direct');
    expectText(
      renderer,
      'Detail de mission indisponible: le dispatch principal reste actif.',
    );
    expectText(renderer, 'Verifier le code et demarrer');
  });

  it('blocks trip completion when trip detail is temporarily unavailable', async () => {
    mockedRestoreDriverSession.mockResolvedValue(buildDriverSession() as never);
    mockedFetchDriverOffers.mockResolvedValue([] as never);
    mockedFetchMyTrips.mockResolvedValue(buildDriverTripsWithStatus('IN_PROGRESS') as never);
    mockedFetchDriverProfile.mockResolvedValue(buildDriverProfile() as never);
    mockedFetchTripDetail.mockRejectedValue(new TypeError('Network request failed'));

    const renderer = await renderScreen(<OffersScreen />);
    await pressByText(renderer, 'Actualiser le direct');

    expectText(renderer, 'Finalisation bloquee par Ride Check');
    expectText(
      renderer,
      'Actualisez le direct, gardez le telephone ouvert et contactez le support si le signal ne revient pas.',
    );
    expect(mockedUpdateTripStatusWithApi).not.toHaveBeenCalled();
  });

  it('toggles driver availability from home', async () => {
    mockedRestoreDriverSession.mockResolvedValue(buildDriverSession() as never);
    mockedFetchDriverOffers
      .mockResolvedValueOnce([] as never)
      .mockResolvedValueOnce([] as never);
    mockedFetchMyTrips
      .mockResolvedValueOnce(buildDriverTrips() as never)
      .mockResolvedValueOnce(buildDriverTrips() as never);
    mockedFetchDriverEarnings
      .mockResolvedValueOnce(
        buildDriverEarningsResponse({
          today: 12500,
          week: 48200,
          month: 160300,
          completedTrips: 6,
          averagePayout: 8033,
        }) as never,
      )
      .mockResolvedValueOnce(
        buildDriverEarningsResponse({
          today: 12500,
          week: 48200,
          month: 160300,
          completedTrips: 6,
          averagePayout: 8033,
        }) as never,
      );
    mockedFetchDriverProfile
      .mockResolvedValueOnce(buildDriverProfile() as never)
      .mockResolvedValueOnce(buildDriverProfile() as never);
    mockedUpdateDriverAvailabilityWithApi.mockResolvedValue({
      availability: {
        driverId: 'driver-1',
        status: 'OFFLINE',
        fatigue: {
          state: 'clear',
          completedTrips: 2,
          drivingMinutes: 64,
          windowHours: 8,
          maxCompletedTrips: 8,
          maxDrivingMinutes: 300,
          restMinutes: 30,
          restUntil: null,
          reason: 'Aucun signal fatigue bloquant sur la fenetre recente.',
        },
      },
    } as never);

    const renderer = await renderScreen(<DriverHomeScreen />);
    await pressByText(renderer, 'Actualiser le direct');
    await pressByText(renderer, 'Passer hors ligne');

    expect(mockedUpdateDriverAvailabilityWithApi).toHaveBeenCalledWith(
      { token: 'driver-auth-client' },
      'OFFLINE',
    );
    expectText(renderer, 'Vous etes hors ligne et ne recevrez plus de nouvelles offres.');
  });

  it('advances a matched trip to driver arriving from offers', async () => {
    mockedRestoreDriverSession.mockResolvedValue(buildDriverSession() as never);
    mockedFetchDriverOffers
      .mockResolvedValueOnce([] as never)
      .mockResolvedValueOnce([] as never);
    mockedFetchMyTrips
      .mockResolvedValueOnce(buildDriverTripsWithStatus('MATCHED') as never)
      .mockResolvedValueOnce(buildDriverTripsWithStatus('DRIVER_ARRIVING') as never);
    mockedFetchDriverProfile
      .mockResolvedValueOnce(buildDriverProfile() as never)
      .mockResolvedValueOnce(buildDriverProfile() as never);
    mockedFetchTripDetail
      .mockResolvedValueOnce(
        buildDriverTripDetail(['driver-timeline-1'], ['Trajet cree']) as never,
      )
      .mockResolvedValueOnce(
        buildDriverTripDetail(
          ['driver-timeline-1', 'driver-timeline-2'],
          ['Trajet cree', 'Chauffeur en approche'],
        ) as never,
      );
    mockedUpdateTripStatusWithApi.mockResolvedValue({
      trip: { id: 'trip-driver-1', status: 'DRIVER_ARRIVING' },
    } as never);

    const renderer = await renderScreen(<OffersScreen />);
    await pressByText(renderer, 'Actualiser le direct');
    await pressByText(renderer, 'Signaler l arrivee');

    expect(mockedUpdateTripStatusWithApi).toHaveBeenCalledWith(
      { token: 'driver-auth-client' },
      'trip-driver-1',
      'DRIVER_ARRIVING',
    );
    expectText(renderer, 'Statut: DRIVER_ARRIVING');
  });

  it('verifies pickup code and starts the trip from offers', async () => {
    mockedRestoreDriverSession.mockResolvedValue(buildDriverSession() as never);
    mockedFetchDriverOffers
      .mockResolvedValueOnce([] as never)
      .mockResolvedValueOnce([] as never);
    mockedFetchMyTrips
      .mockResolvedValueOnce(buildDriverTripsWithStatus('DRIVER_ARRIVING') as never)
      .mockResolvedValueOnce(buildDriverTripsWithStatus('IN_PROGRESS') as never);
    mockedFetchDriverProfile
      .mockResolvedValueOnce(buildDriverProfile() as never)
      .mockResolvedValueOnce(buildDriverProfile() as never);
    mockedFetchTripDetail
      .mockResolvedValueOnce(
        buildDriverTripDetail(['driver-timeline-1'], ['Chauffeur en approche']) as never,
      )
      .mockResolvedValueOnce(
        buildDriverTripDetail(
          ['driver-timeline-1', 'driver-timeline-2'],
          ['Chauffeur en approche', 'Course demarree'],
        ) as never,
      );
    mockedVerifyPickupCodeWithApi.mockResolvedValue({
      trip: { id: 'trip-driver-1', status: 'IN_PROGRESS' },
    } as never);

    const renderer = await renderScreen(<OffersScreen />);
    await pressByText(renderer, 'Actualiser le direct');
    await changeInputByPlaceholder(renderer, 'Code a 4 chiffres', '12a3-4<script>');
    await pressByText(renderer, 'Verifier le code et demarrer');

    expect(mockedVerifyPickupCodeWithApi).toHaveBeenCalledWith(
      { token: 'driver-auth-client' },
      'trip-driver-1',
      '1234',
    );
    expectText(renderer, 'Statut: IN_PROGRESS');
  });

  it('rejects incomplete pickup code before driver API verification', async () => {
    mockedRestoreDriverSession.mockResolvedValue(buildDriverSession() as never);
    mockedFetchDriverOffers.mockResolvedValue([] as never);
    mockedFetchMyTrips.mockResolvedValue(buildDriverTripsWithStatus('DRIVER_ARRIVING') as never);
    mockedFetchDriverProfile.mockResolvedValue(buildDriverProfile() as never);
    mockedFetchTripDetail.mockResolvedValue(
      buildDriverTripDetail(['driver-timeline-1'], ['Chauffeur en approche']) as never,
    );

    const renderer = await renderScreen(<OffersScreen />);
    await pressByText(renderer, 'Actualiser le direct');
    await changeInputByPlaceholder(renderer, 'Code a 4 chiffres', '12');
    await pressByText(renderer, 'Verifier le code et demarrer');

    expect(mockedVerifyPickupCodeWithApi).not.toHaveBeenCalled();
    expectText(renderer, 'Le code pickup doit contenir exactement 4 chiffres.');
  });

  it('completes an in-progress trip from offers', async () => {
    mockedRestoreDriverSession.mockResolvedValue(buildDriverSession() as never);
    mockedFetchDriverOffers
      .mockResolvedValueOnce([] as never)
      .mockResolvedValueOnce([] as never);
    mockedFetchMyTrips
      .mockResolvedValueOnce(buildDriverTripsWithStatus('IN_PROGRESS') as never)
      .mockResolvedValueOnce(buildDriverTrips() as never);
    mockedFetchDriverProfile
      .mockResolvedValueOnce(buildDriverProfile() as never)
      .mockResolvedValueOnce(buildDriverProfile() as never);
    mockedFetchTripDetail
      .mockResolvedValueOnce(
        buildDriverTripDetail(['driver-timeline-1'], ['Course demarree']) as never,
      )
      .mockResolvedValueOnce(
        buildDriverTripDetail(['driver-timeline-2'], ['Course terminee']) as never,
      );
    mockedUpdateTripStatusWithApi.mockResolvedValue({
      trip: { id: 'trip-driver-1', status: 'COMPLETED' },
    } as never);

    const renderer = await renderScreen(<OffersScreen />);
    await pressByText(renderer, 'Actualiser le direct');
    await pressByText(renderer, 'Terminer la course');

    expect(mockedUpdateTripStatusWithApi).toHaveBeenCalledWith(
      { token: 'driver-auth-client' },
      'trip-driver-1',
      'COMPLETED',
    );
    expectText(renderer, 'Aucune reservation active');
  });

  it('blocks trip completion when route safety is critical', async () => {
    const criticalRouteDetail = buildDriverTripDetail(
      ['driver-timeline-1'],
      ['Course demarree'],
    );
    criticalRouteDetail.trip.routeMonitoring.state = 'critical';
    criticalRouteDetail.trip.routeMonitoring.latestPosition = {
      ...criticalRouteDetail.trip.routeMonitoring.latestPosition,
      accuracyMeters: 420,
      speedKph: 126,
    };

    mockedRestoreDriverSession.mockResolvedValue(buildDriverSession() as never);
    mockedFetchDriverOffers.mockResolvedValue([] as never);
    mockedFetchMyTrips.mockResolvedValue(
      buildDriverTripsWithStatus('IN_PROGRESS') as never,
    );
    mockedFetchDriverProfile.mockResolvedValue(buildDriverProfile() as never);
    mockedFetchTripDetail.mockResolvedValue(criticalRouteDetail as never);

    const renderer = await renderScreen(<OffersScreen />);
    await pressByText(renderer, 'Actualiser le direct');
    await pressByText(renderer, 'Finalisation bloquee par Ride Check');

    expectText(renderer, 'Finalisation bloquee par Ride Check');
    expectText(
      renderer,
      'Finalisation bloquee par Ride Check. Actualisez le direct ou contactez le support.',
    );
    expect(mockedUpdateTripStatusWithApi).not.toHaveBeenCalled();
  });

  it('reports a driver incident from offers', async () => {
    mockedRestoreDriverSession.mockResolvedValue(buildDriverSession() as never);
    mockedFetchDriverOffers
      .mockResolvedValueOnce([] as never)
      .mockResolvedValueOnce([] as never);
    mockedFetchMyTrips
      .mockResolvedValueOnce(buildDriverTripsWithStatus('IN_PROGRESS') as never)
      .mockResolvedValueOnce(buildDriverTripsWithStatus('IN_PROGRESS') as never);
    mockedFetchDriverProfile
      .mockResolvedValueOnce(buildDriverProfile() as never)
      .mockResolvedValueOnce(buildDriverProfile() as never);
    mockedFetchTripDetail.mockResolvedValue(
      buildDriverTripDetail(['driver-timeline-1'], ['Course demarree']) as never,
    );
    mockedReportTripIncidentWithApi.mockResolvedValue({
      incident: { ticketId: 'ticket-driver-1' },
    } as never);

    const renderer = await renderScreen(<OffersScreen />);
    await pressByText(renderer, 'Actualiser le direct');
    await pressByText(renderer, 'Signaler un incident');

    expect(mockedReportTripIncidentWithApi).toHaveBeenCalledWith(
      { token: 'driver-auth-client' },
      'trip-driver-1',
      expect.objectContaining({
        incidentType: 'DRIVER_ALERT',
        priority: 3,
      }),
    );
    expectText(renderer, 'Course active');
    expectText(renderer, 'Ride Check: Warning (1)');
    expectText(renderer, 'Dernier signal: Long Stop');
  });
});
