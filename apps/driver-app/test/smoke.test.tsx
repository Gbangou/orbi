import React from 'react';
import { Alert, Linking } from 'react-native';
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
  getMySupportTicketsWithApi,
  reportTripIncidentWithApi,
  triggerTripSafetySosWithApi,
  createSupportTicketWithApi,
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
import DriverHomeScreen from '../app/(tabs)/accueil';
import OffersScreen from '../app/(tabs)/offres';
import ProfilScreen from '../app/(tabs)/profil';
import RevenusScreen from '../app/(tabs)/revenus';
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
      _driverProfileId: string | null,
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
    presenceNote: 'Presence chauffeur a jour.',
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
    getMySupportTicketsWithApi: jest.fn(),
    createSupportTicketWithApi: jest.fn(),
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
const mockedGetMySupportTicketsWithApi = jest.mocked(getMySupportTicketsWithApi);
const mockedCreateSupportTicketWithApi = jest.mocked(createSupportTicketWithApi);
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

function expectNoText(renderer: { root: ReactTestInstance }, text: string) {
  expect(collectText(renderer.root)).not.toContain(text);
}

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
    (sum, trip) => sum + (trip.grossFare ?? trip.payout),
    0,
  );
  const payoutRate =
    recentGrossFare > 0 ? Number((recentNetPayout / recentGrossFare).toFixed(4)) : 0;

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
      payoutRateBps: Math.round(payoutRate * 10_000),
      payoutRate,
      payoutRateMin: payoutRate,
      payoutRateMax: payoutRate,
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
      grossFare: trip.grossFare ?? trip.payout,
      platformFee: trip.platformFee ?? 0,
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

function buildPartialDriverProfile() {
  return {
    profile: {
      id: 'driver-fresh',
      fullName: 'Nouveau Chauffeur',
      email: 'fresh-driver@orbi.app',
      phoneNumber: '+22676000009',
      status: 'ONLINE',
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
        paymentMethod: 'CASH',
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
      pickupLatitude: 12.3712,
      pickupLongitude: -1.5197,
      destinationLatitude: 12.3045,
      destinationLongitude: -1.4921,
      riderName: 'Awa Ouedraogo',
      driverName: 'Issa Driver',
      vehicleLabel: 'Yamaha Crypton',
      paymentMethod: 'CASH',
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
  mockedGetMySupportTicketsWithApi.mockReset();
  mockedCreateSupportTicketWithApi.mockReset();
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
  jest.mocked(Linking.openURL).mockReset();

  mockedResolveDriverAppError.mockResolvedValue({
    message: 'Fallback driver error.',
    shouldClearSessionToken: false,
  });
  mockedGetMySupportTicketsWithApi.mockResolvedValue({ tickets: [] } as never);
  mockedCreateSupportTicketWithApi.mockResolvedValue({
    ticket: {
      id: 'ticket-driver-1',
      subject: 'Support',
      description: 'Demande recue.',
      status: 'OPEN',
      priority: 2,
      adminNote: null,
      createdAt: '2026-04-19T08:00:00.000Z',
    },
  } as never);
  jest.mocked(Linking.openURL).mockResolvedValue(undefined);
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

    await changeInputByPlaceholder(renderer, 'Adresse email', 'driver@orbi.app');
    await changeInputByPlaceholder(renderer, 'Mot de passe', 'Orbi123!');
    await pressByText(renderer, 'Se connecter');

    expect(mockedSignInDriverAccount).toHaveBeenCalledWith({
      email: 'driver@orbi.app',
      password: 'Orbi123!',
    });
    expect(router.replace).toHaveBeenCalledWith('/accueil');
    expectText(renderer, 'Se connecter');
    expectNoText(renderer, 'Accès terrain sécurisé');
  });

  it('normalizes driver sign-in email before submitting', async () => {
    mockedSignInDriverAccount.mockResolvedValue(buildDriverSession() as never);

    const renderer = await renderScreen(<DriverAuthScreen />);
    await changeInputByPlaceholder(renderer, 'Adresse email', ' Driver@Orbi.App ');
    await changeInputByPlaceholder(renderer, 'Mot de passe', 'Orbi123!');
    await pressByText(renderer, 'Se connecter');

    expect(mockedSignInDriverAccount).toHaveBeenCalledWith({
      email: 'driver@orbi.app',
      password: 'Orbi123!',
    });
    expect(router.replace).toHaveBeenCalledWith('/accueil');
  });

  it('explains slow network timeouts during driver sign-in', async () => {
    mockedSignInDriverAccount.mockRejectedValue(
      new DOMException('The operation was aborted.', 'AbortError'),
    );

    const renderer = await renderScreen(<DriverAuthScreen />);
    await changeInputByPlaceholder(renderer, 'Adresse email', 'driver@orbi.app');
    await changeInputByPlaceholder(renderer, 'Mot de passe', 'Orbi123!');
    await pressByText(renderer, 'Se connecter');
    await flushMicrotasks();

    expectText(
      renderer,
      'Le serveur ne repond pas encore. Orbi continue de fonctionner sur reseau faible: reessayez dans un instant ou changez de reseau si besoin.',
    );
  });

  it('loads the driver home screen', async () => {
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
    await pressByText(renderer, 'Actualiser');

    expectText(renderer, "Aujourd'hui");
    expect(collectText(renderer.root)).toContain('12 500');
    expectText(renderer, 'En ligne');
    expectText(renderer, '2 offres — Ouagadougou');
  });

  it('keeps the driver home usable when offer numeric fields arrive as strings', async () => {
    mockedRestoreDriverSession.mockResolvedValue(buildDriverSession() as never);
    mockedFetchDriverOffers.mockResolvedValue([
      {
        ...driverOffers[0],
        fare: '1800',
        driverPayout: '1500',
        distanceKm: '5,8',
        pickupDistanceKm: '1,2',
        etaToPickupMinutes: '4',
        serviceRadiusKm: '8',
        dispatchScore: '86',
        offerConfidenceScore: '91',
        reservationWindowSeconds: '45',
      },
    ] as never);
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
    await pressByText(renderer, 'Actualiser');

    expectText(renderer, '1 offre — Ouagadougou');
    expect(collectText(renderer.root)).toContain('1.2 km');
  });

  it('keeps the driver home usable when profile blocks are partially hydrated', async () => {
    mockedRestoreDriverSession.mockResolvedValue(buildDriverSession() as never);
    mockedFetchDriverOffers.mockResolvedValue([] as never);
    mockedFetchMyTrips.mockResolvedValue(buildDriverTrips() as never);
    mockedFetchDriverEarnings.mockResolvedValue(buildDriverEarningsResponse() as never);
    mockedFetchDriverProfile.mockResolvedValue(buildPartialDriverProfile() as never);

    const renderer = await renderScreen(<DriverHomeScreen />);
    await flushMicrotasks();

    expectText(renderer, 'Hors ligne');
    expectText(renderer, 'Vous êtes hors ligne');
  });

  it('loads the driver earnings screen with active mission context', async () => {
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
    await pressByText(renderer, 'Actualiser');

    expectText(renderer, 'Revenus a jour. Course active: Chauffeur assigné.');
    expectText(renderer, 'Universite Joseph Ki-Zerbo vers Ouaga 2000');
    expectText(renderer, 'Cap du jour');
    expectText(renderer, 'Semaine');
  });

  it('keeps driver earnings usable when profile blocks are partially hydrated', async () => {
    mockedRestoreDriverSession.mockResolvedValue(buildDriverSession() as never);
    mockedFetchDriverEarnings.mockResolvedValue(buildDriverEarningsResponse() as never);
    mockedFetchMyTrips.mockResolvedValue(buildDriverTrips() as never);
    mockedFetchDriverProfile.mockResolvedValue(buildPartialDriverProfile() as never);

    const renderer = await renderScreen(<RevenusScreen />);
    await flushMicrotasks();

    expectText(renderer, 'Revenus');
    expect(collectText(renderer.root)).toContain('Hors ligne');
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
    await pressByText(renderer, 'Actualiser');

    await pressByText(renderer, 'Accepter cette offre');
    await flushMicrotasks();

    expect(mockedAcceptRideRequestWithApi).toHaveBeenCalledWith(
      { token: 'driver-auth-client' },
      driverOffers[0]?.id,
    );
  });

  it('keeps driver offers usable when profile blocks are partially hydrated', async () => {
    mockedRestoreDriverSession.mockResolvedValue(buildDriverSession() as never);
    mockedFetchDriverOffers.mockResolvedValue([] as never);
    mockedFetchMyTrips.mockResolvedValue(buildDriverTrips() as never);
    mockedFetchDriverProfile.mockResolvedValue(buildPartialDriverProfile() as never);

    const renderer = await renderScreen(<OffersScreen />);
    await flushMicrotasks();

    expectText(renderer, 'Missions');
    expectText(renderer, 'Hors ligne · passez en ligne pour recevoir des courses');
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
    await pressByText(renderer, 'Actualiser');

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
    await pressByText(renderer, 'Actualiser');

    await pressByText(renderer, 'Refuser cette offre');
    await flushMicrotasks();

    expect(mockedDeclineDriverOfferWithApi).toHaveBeenCalledWith(
      { token: 'driver-auth-client' },
      driverOffers[0]?.id,
    );
    expectText(renderer, 'Aucune offre active');
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
    await pressByText(renderer, 'Actualiser');

    expectText(renderer, 'Nouvelle course');
    expectText(renderer, 'Accepter cette offre');
    expectText(renderer, '1 400 F CFA net - 193 F/km approche');
    expectText(renderer, '84% du prix. Offre lisible avec gain et effort connus.');
    expectText(renderer, 'Refuser cette offre');
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
    expectText(renderer, 'Identite');
    expectText(renderer, 'Onboarding securise');
  });

  it('keeps a newly created driver profile usable when onboarding blocks are not hydrated yet', async () => {
    mockedRestoreDriverSession.mockResolvedValue(buildDriverSession() as never);
    mockedFetchDriverProfile.mockResolvedValue({
      profile: {
        id: 'driver-new',
        fullName: 'Nouveau Chauffeur',
        email: 'new.driver@orbi.app',
        phoneNumber: null,
        status: 'OFFLINE',
        verificationStatus: 'PENDING',
        serviceRadiusKm: null,
        averageRating: null,
        completedTripsCount: 0,
      },
    } as never);
    mockedFetchMyTrips.mockResolvedValue(buildDriverTrips() as never);
    mockedGetMySupportTicketsWithApi.mockResolvedValue({
      tickets: [
        {
          id: 'ticket-sensitive-driver-1',
          subject: 'Annulation chauffeur a revoir',
          description: 'Revue operationnelle demandee apres annulation.',
          status: 'IN_REVIEW',
          priority: 2,
          adminNote: null,
          createdAt: '2026-04-19T08:00:00.000Z',
        },
      ],
    } as never);

    const renderer = await renderScreen(<ProfilScreen />);
    await flushMicrotasks();

    expectText(renderer, 'Nouveau Chauffeur');
    expectText(renderer, 'Onboarding securise');
    expectText(renderer, 'Profil 0/7 complete a 0%');
    expectText(renderer, 'Aucun véhicule enregistré pour le moment.');
    expectText(renderer, 'Support');
    expectText(
      renderer,
      '1 demande(s) ouverte(s) ou recemment mise(s) a jour. Les details de mission restent dans Missions.',
    );
    expect(collectText(renderer.root)).not.toContain('Annulation chauffeur a revoir');
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
    await pressByText(renderer, 'Modifier');
    await pressByText(renderer, 'Soumettre le profil');

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
    await pressByText(renderer, 'Modifier');

    await changeInputByPlaceholder(renderer, '70 00 00 00', '+22676000000');
    await changeInputByPlaceholder(renderer, 'Numero du permis', 'BF-99887');
    await changeInputByPlaceholder(renderer, 'Plaque d immatriculation', '11 AB 2345');
    await changeInputByPlaceholder(renderer, 'Marque', 'Yamaha');
    await changeInputByPlaceholder(renderer, 'Modele', 'Crypton');
    await changeInputByPlaceholder(renderer, 'Couleur', 'Bleu');
    await changeInputByPlaceholder(renderer, 'piece-identite.pdf', 'carte-identite.pdf');
    await changeInputByPlaceholder(renderer, 'permis.pdf', 'permis.pdf');
    await changeInputByPlaceholder(renderer, 'carte-grise.pdf', 'carte-grise.pdf');
    await changeInputByPlaceholder(renderer, 'assurance.pdf', 'assurance.pdf');
    await changeInputByPlaceholder(renderer, 'selfie.jpg', 'selfie.jpg');
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

    await pressByText(renderer, 'Soumettre le profil');

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
    await pressByText(renderer, 'Actualiser');

    await invokeInAct(async () => {
      driverRealtimeState.eventHandler?.('ride-request.reservation-assigned');
    });
    await flushMicrotasks();

    expectText(renderer, 'Une nouvelle offre est disponible.');
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
    await pressByText(renderer, 'Actualiser');

    await invokeInAct(async () => {
      driverRealtimeState.eventHandler?.('ride-request.reservation-expired');
    });
    await flushMicrotasks();

    expectText(renderer, 'Offre expirée');
    expectText(
      renderer,
      "Cette course n'est plus disponible.",
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
    await pressByText(renderer, 'Actualiser');

    await invokeInAct(async () => {
      driverRealtimeState.eventHandler?.('trip.updated');
    });
    await flushMicrotasks();

    expectText(renderer, 'Statut mis a jour: Chauffeur en route.');
    expectText(renderer, 'Confirmez puis demarrez');
    expectText(renderer, 'ETA');
    expectText(renderer, 'Distance');
    expectText(renderer, '0.4 km restant');
    expectText(renderer, 'Agrandir');
    expectText(renderer, 'Paiement');
    expectText(renderer, 'Especes');
    expectText(renderer, 'Checklist depart');
    expectText(renderer, 'Passager a bord et pret a partir');
    expectText(renderer, 'Prix et gain visibles, aucun supplement hors app');
    expectText(renderer, 'Journal de course');
    await pressByText(renderer, 'Journal de course');
    expectText(renderer, 'Chauffeur en approche');
  });

  it('keeps driver dispatch usable when trip detail is temporarily unavailable', async () => {
    mockedRestoreDriverSession.mockResolvedValue(buildDriverSession() as never);
    mockedFetchDriverOffers.mockResolvedValue([] as never);
    mockedFetchMyTrips.mockResolvedValue(buildDriverTripsWithStatus('DRIVER_ARRIVING') as never);
    mockedFetchDriverProfile.mockResolvedValue(buildDriverProfile() as never);
    mockedFetchTripDetail.mockRejectedValue(new Error('Trip detail temporarily unavailable'));

    const renderer = await renderScreen(<OffersScreen />);
    await pressByText(renderer, 'Actualiser');

    expectText(renderer, 'Course active');
    expectText(renderer, 'Confirmez puis demarrez');
    expectText(renderer, 'Distance');
    expectText(
      renderer,
      'Detail de mission indisponible: la course principale reste active.',
    );
    expectText(renderer, 'Demarrer la course');
  });

  it('lets the server gate trip completion when trip detail is temporarily unavailable', async () => {
    mockedRestoreDriverSession.mockResolvedValue(buildDriverSession() as never);
    mockedFetchDriverOffers.mockResolvedValue([] as never);
    mockedFetchMyTrips.mockResolvedValue(buildDriverTripsWithStatus('IN_PROGRESS') as never);
    mockedFetchDriverProfile.mockResolvedValue(buildDriverProfile() as never);
    mockedFetchTripDetail.mockRejectedValue(new Error('Trip detail temporarily unavailable'));
    mockedUpdateTripStatusWithApi.mockResolvedValue({
      trip: {
        id: 'trip-1',
        status: 'COMPLETED',
        actualFare: 1800,
        driverPayout: 1620,
      },
    } as never);

    const renderer = await renderScreen(<OffersScreen />);
    await pressByText(renderer, 'Actualiser');

    expectText(
      renderer,
      'Detail de mission indisponible: la course principale reste active.',
    );
    await pressByText(renderer, 'Terminer la course');
    const completeOptions = jest.mocked(Alert.alert).mock.calls.at(-1)?.[2] as
      | Array<{ text?: string; onPress?: () => void }>
      | undefined;
    await invokeInAct(async () => {
      completeOptions?.find((option) => option.text === 'Terminer')?.onPress?.();
      await flushMicrotasks();
    });
    expect(mockedUpdateTripStatusWithApi).toHaveBeenCalledWith(
      expect.any(Object),
      'trip-driver-1',
      'COMPLETED',
    );
  });

  it('lets the driver cancel an in-progress trip and receive new offers again', async () => {
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
    mockedFetchTripDetail.mockResolvedValue(
      buildDriverTripDetail(['driver-timeline-1'], ['Course demarree']) as never,
    );
    mockedUpdateTripStatusWithApi.mockResolvedValue({
      trip: {
        id: 'trip-driver-1',
        status: 'CANCELLED',
        cancellationPolicy: {
          actor: 'DRIVER',
          level: 'CLEAR',
          suggestedFeeAmount: 0,
          driverCompensationAmount: 0,
          currency: 'XOF',
          recentCancellationCount: 1,
          message: 'Annulation chauffeur prise en compte. Vous restez eligible aux prochaines offres.',
        },
      },
    } as never);

    const renderer = await renderScreen(<OffersScreen />);
    await pressByText(renderer, 'Actualiser');
    await pressByText(renderer, 'Annuler la course');
    const cancelOptions = jest.mocked(Alert.alert).mock.calls.at(-1)?.[2] as
      | Array<{ text?: string; onPress?: () => void }>
      | undefined;
    await invokeInAct(async () => {
      cancelOptions?.find((option) => option.text === 'Passager introuvable')?.onPress?.();
      await flushMicrotasks();
    });

    expect(mockedUpdateTripStatusWithApi).toHaveBeenCalledWith(
      { token: 'driver-auth-client' },
      'trip-driver-1',
      'CANCELLED',
      'Passager introuvable',
    );
    expectText(
      renderer,
      'Annulation chauffeur prise en compte. Vous restez eligible aux prochaines offres.',
    );
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
    await pressByText(renderer, 'Actualiser');
    await pressByText(renderer, 'Passer hors ligne');

    expect(mockedUpdateDriverAvailabilityWithApi).toHaveBeenCalledWith(
      { token: 'driver-auth-client' },
      'OFFLINE',
    );
    expectText(renderer, 'Vous êtes hors ligne.');
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
    await pressByText(renderer, 'Actualiser');
    await pressByText(renderer, 'Je suis au point de depart');

    expect(mockedUpdateTripStatusWithApi).toHaveBeenCalledWith(
      { token: 'driver-auth-client' },
      'trip-driver-1',
      'DRIVER_ARRIVING',
    );
    expectText(renderer, 'Confirmez puis demarrez');
    expectText(renderer, 'Demarrer la course');
  });

  it('starts the trip from offers after the driver has met the passenger', async () => {
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
    mockedUpdateTripStatusWithApi.mockResolvedValue({
      trip: { id: 'trip-driver-1', status: 'IN_PROGRESS' },
    } as never);

    const renderer = await renderScreen(<OffersScreen />);
    await pressByText(renderer, 'Actualiser');
    expectText(renderer, 'GO');
    expectText(renderer, 'Passager a bord, pret a partir');
    await pressByText(renderer, 'Demarrer la course');

    expect(mockedUpdateTripStatusWithApi).toHaveBeenCalledWith(
      { token: 'driver-auth-client' },
      'trip-driver-1',
      'IN_PROGRESS',
    );
    expect(mockedVerifyPickupCodeWithApi).not.toHaveBeenCalled();
    expectText(renderer, 'Conduisez vers la destination');
    expectText(renderer, 'Terminer la course');
  });

  it('recovers the start flow when the server applied IN_PROGRESS before the network failed', async () => {
    mockedRestoreDriverSession.mockResolvedValue(buildDriverSession() as never);
    mockedFetchDriverOffers.mockResolvedValue([] as never);
    mockedFetchMyTrips
      .mockResolvedValueOnce(buildDriverTripsWithStatus('DRIVER_ARRIVING') as never)
      .mockResolvedValueOnce(buildDriverTripsWithStatus('IN_PROGRESS') as never);
    mockedFetchDriverProfile.mockResolvedValue(buildDriverProfile() as never);
    mockedFetchTripDetail.mockResolvedValue(
      buildDriverTripDetail(['driver-timeline-1'], ['Chauffeur en approche']) as never,
    );
    mockedUpdateTripStatusWithApi.mockRejectedValue(new Error('socket timeout after commit'));

    const renderer = await renderScreen(<OffersScreen />);
    await pressByText(renderer, 'Actualiser');
    await pressByText(renderer, 'Demarrer la course');
    await flushMicrotasks();

    expect(mockedUpdateTripStatusWithApi).toHaveBeenCalledWith(
      { token: 'driver-auth-client' },
      'trip-driver-1',
      'IN_PROGRESS',
    );
    expectText(renderer, 'Course demarree. Statut confirme.');
    expectText(renderer, 'Terminer la course');
  });

  it('keeps the professional start toggle recoverable when the start update fails', async () => {
    mockedRestoreDriverSession.mockResolvedValue(buildDriverSession() as never);
    mockedFetchDriverOffers.mockResolvedValue([] as never);
    mockedFetchMyTrips.mockResolvedValue(buildDriverTripsWithStatus('DRIVER_ARRIVING') as never);
    mockedFetchDriverProfile.mockResolvedValue(buildDriverProfile() as never);
    mockedFetchTripDetail.mockResolvedValue(
      buildDriverTripDetail(['driver-timeline-1'], ['Chauffeur en approche']) as never,
    );
    mockedUpdateTripStatusWithApi.mockRejectedValue(new Error('network down'));
    mockedResolveDriverAppError.mockResolvedValue({
      message: 'La mise a jour du trajet a echoue.',
      shouldClearSessionToken: false,
    });

    const renderer = await renderScreen(<OffersScreen />);
    await pressByText(renderer, 'Actualiser');
    await pressByText(renderer, 'Demarrer la course');
    await flushMicrotasks();

    expect(mockedUpdateTripStatusWithApi).toHaveBeenCalledWith(
      { token: 'driver-auth-client' },
      'trip-driver-1',
      'IN_PROGRESS',
    );
    expectText(renderer, 'Depart non confirme');
    expectText(renderer, 'Depart non confirme. Reessayez maintenant ou actualisez le trajet.');
    expectText(renderer, 'Demarrer la course');
  });

  it('does not show pickup code entry in the standard start flow', async () => {
    mockedRestoreDriverSession.mockResolvedValue(buildDriverSession() as never);
    mockedFetchDriverOffers.mockResolvedValue([] as never);
    mockedFetchMyTrips.mockResolvedValue(buildDriverTripsWithStatus('DRIVER_ARRIVING') as never);
    mockedFetchDriverProfile.mockResolvedValue(buildDriverProfile() as never);
    mockedFetchTripDetail.mockResolvedValue(
      buildDriverTripDetail(['driver-timeline-1'], ['Chauffeur en approche']) as never,
    );

    const renderer = await renderScreen(<OffersScreen />);
    await pressByText(renderer, 'Actualiser');

    expectText(renderer, 'Demarrer la course');
    expect(collectText(renderer.root)).not.toContain('Code a 4 chiffres');
    expect(collectText(renderer.root)).not.toContain('Verifier le code et demarrer');
    expect(mockedVerifyPickupCodeWithApi).not.toHaveBeenCalled();
  });

  it('shows reliability review when driver cancels an accepted trip repeatedly', async () => {
    mockedRestoreDriverSession.mockResolvedValue(buildDriverSession() as never);
    mockedFetchDriverOffers
      .mockResolvedValueOnce([] as never)
      .mockResolvedValueOnce([] as never);
    mockedFetchMyTrips
      .mockResolvedValueOnce(buildDriverTripsWithStatus('MATCHED') as never)
      .mockResolvedValueOnce(buildDriverTrips() as never);
    mockedFetchDriverProfile
      .mockResolvedValueOnce(buildDriverProfile() as never)
      .mockResolvedValueOnce(buildDriverProfile() as never);
    mockedFetchTripDetail.mockResolvedValue(
      buildDriverTripDetail(['driver-timeline-1'], ['Trajet cree']) as never,
    );
    mockedUpdateTripStatusWithApi.mockResolvedValue({
      trip: {
        id: 'trip-driver-1',
        status: 'CANCELLED',
        cancellationPolicy: {
          actor: 'DRIVER',
          level: 'REVIEW',
          suggestedFeeAmount: 0,
          driverCompensationAmount: 0,
          currency: 'XOF',
          recentCancellationCount: 3,
          driverReliabilityImpact: 'SUPPORT_REVIEW',
          temporaryPauseMinutes: 30,
          supportTicketId: 'ticket-driver-cancel-1',
          message:
            'Annulations chauffeur repetees detectees. Revue support ouverte et pause operationnelle recommandee avant nouvelles offres.',
        },
      },
    } as never);

    const renderer = await renderScreen(<OffersScreen />);
    await pressByText(renderer, 'Actualiser');
    await pressByText(renderer, 'Annuler la course');
    const cancelOptions = jest.mocked(Alert.alert).mock.calls.at(-1)?.[2] as
      | Array<{ text: string; onPress?: () => void }>
      | undefined;
    await invokeInAct(() => {
      cancelOptions?.[2]?.onPress?.();
    });
    await flushMicrotasks();

    expect(mockedUpdateTripStatusWithApi).toHaveBeenCalledWith(
      { token: 'driver-auth-client' },
      'trip-driver-1',
      'CANCELLED',
      'Erreur d acceptation',
    );
    expectText(
      renderer,
      'Annulations chauffeur repetees detectees. Revue support ouverte et pause operationnelle recommandee avant nouvelles offres.',
    );
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
      trip: {
        id: 'trip-driver-1',
        status: 'COMPLETED',
        actualFare: 3500,
        driverPayout: 3150,
        paymentMethod: 'CASH',
      },
    } as never);

    const renderer = await renderScreen(<OffersScreen />);
    await pressByText(renderer, 'Actualiser');
    await pressByText(renderer, 'Terminer la course');
    const completeOptions = jest.mocked(Alert.alert).mock.calls.at(-1)?.[2] as
      | Array<{ text?: string; onPress?: () => void }>
      | undefined;
    await invokeInAct(async () => {
      completeOptions?.find((option) => option.text === 'Terminer')?.onPress?.();
      await flushMicrotasks();
    });

    expect(mockedUpdateTripStatusWithApi).toHaveBeenCalledWith(
      { token: 'driver-auth-client' },
      'trip-driver-1',
      'COMPLETED',
    );
    expectText(renderer, 'Prix client : 3 500 F CFA');
    expectText(renderer, 'Votre gain : 3 150 F CFA');
    expectText(renderer, 'Paiement : Especes');
    expectText(
      renderer,
      'Encaissez le montant exact, confirmez au passager et gardez la course visible dans l historique.',
    );
    expectText(renderer, 'Aucune offre active');
  });

  it('keeps trip completion usable when route safety is critical', async () => {
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
    mockedUpdateTripStatusWithApi.mockResolvedValue({
      trip: {
        id: 'trip-driver-1',
        status: 'COMPLETED',
        actualFare: 3500,
        driverPayout: 3150,
        paymentMethod: 'CASH',
      },
    } as never);

    const renderer = await renderScreen(<OffersScreen />);
    await pressByText(renderer, 'Actualiser');
    expectText(
      renderer,
      'Avant de terminer: Terminez seulement si le client est arrive; contactez le support ou utilisez SOS si necessaire.',
    );
    await pressByText(renderer, 'Terminer la course');
    const completeOptions = jest.mocked(Alert.alert).mock.calls.at(-1)?.[2] as
      | Array<{ text?: string; onPress?: () => void }>
      | undefined;
    await invokeInAct(async () => {
      completeOptions?.find((option) => option.text === 'Terminer')?.onPress?.();
      await flushMicrotasks();
    });
    expect(mockedUpdateTripStatusWithApi).toHaveBeenCalledWith(
      { token: 'driver-auth-client' },
      'trip-driver-1',
      'COMPLETED',
    );
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
    await pressByText(renderer, 'Actualiser');
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
    expectText(renderer, 'Conduisez vers la destination');
    expectText(renderer, 'Journal de course');
  });

  it('triggers driver SOS from offers and opens the local emergency dialer', async () => {
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

    const renderer = await renderScreen(<OffersScreen />);
    await pressByText(renderer, 'Actualiser');
    await pressByText(renderer, 'SOS securite');

    expect(mockedTriggerTripSafetySosWithApi).toHaveBeenCalledWith(
      { token: 'driver-auth-client' },
      'trip-driver-1',
      {
        details: "SOS declenche depuis l'application chauffeur.",
      },
    );
    expect(Linking.openURL).toHaveBeenCalledWith('tel:112');
  });
});
