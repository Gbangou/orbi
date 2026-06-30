import React from 'react';
import { Alert, Linking, Share } from 'react-native';
import type { ReactTestInstance } from 'react-test-renderer';
import { router } from 'expo-router';
import {
  createOrbiApiClient,
  cancelRideRequestWithApi,
  createCheckoutIntentWithApi,
  createRideRequestWithApi,
  createSavedPlaceWithApi,
  createTripShareLinkWithApi,
  deleteSavedPlaceWithApi,
  fetchNearbyDrivers,
  fetchMyTrips,
  fetchRideOptionsPreview,
  fetchRiderProfile,
  fetchTripDetail,
  getMySupportTicketsWithApi,
  recordTripRoutePositionWithApi,
  reportTripIncidentWithApi,
  resolveVoiceLocationIntentWithApi,
  riderRideOptions,
  triggerTripSafetySosWithApi,
  updateSavedPlaceWithApi,
  updateTrustedContactWithApi,
  updateTripStatusWithApi,
} from '@orbi/api';
import {
  restoreRiderSession,
  signInRiderAccount,
  signOutRiderAccount,
} from '../lib/auth';
import { resolveRiderAppError } from '../lib/session-feedback';
import AccountScreen from '../app/(tabs)/account';
import ActivityScreen from '../app/(tabs)/activity';
import RiderAuthScreen from '../app/auth';
import RiderHomeScreen from '../app/(tabs)/home';
import BookingScreen from '../app/book';
import VoiceScreen from '../app/voice';
import {
  collectText,
  expectText,
  flushMicrotasks,
  changeInputByPlaceholder,
  invokeInAct,
  pressByText,
  pressByLabel,
  renderScreen,
} from '../../../scripts/testing/mobile/test-utils';

jest.mock('../lib/auth', () => ({
  signInRiderAccount: jest.fn(),
  signUpRiderAccount: jest.fn(),
  restoreRiderSession: jest.fn(),
  signOutRiderAccount: jest.fn(),
}));

jest.mock('../lib/session-feedback', () => ({
  resolveRiderAppError: jest.fn(),
}));

jest.mock('../lib/use-live-refresh', () => ({
  useLiveRefresh: jest.fn(),
}));

const riderPositionState = {
  latestPosition: null as null | {
    latitude: number;
    longitude: number;
    accuracyMeters: number | null;
  },
  positionNote: 'Position passager en attente.',
};

jest.mock('../lib/use-rider-position', () => ({
  useRiderPosition: jest.fn(() => riderPositionState),
}));

const riderRealtimeState: {
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

jest.mock('../lib/use-rider-realtime-stream', () => ({
  useRiderRealtimeStream: jest.fn(
    (
      _sessionToken: string | null,
      onEvent: (eventType: string) => void,
      options?: {
        onHeartbeat?: () => void;
        onOpen?: () => void;
        onError?: () => void;
      },
    ) => {
      riderRealtimeState.eventHandler = onEvent;
      riderRealtimeState.options = options ?? null;
    },
  ),
}));

jest.mock('@orbi/api', () => {
  const actual = jest.requireActual('@orbi/api');

  return {
    ...actual,
    createOrbiApiClient: jest.fn(() => ({ kind: 'mock-client' })),
    cancelRideRequestWithApi: jest.fn(),
    fetchNearbyDrivers: jest.fn(),
    fetchRideOptionsPreview: jest.fn(),
    fetchMyTrips: jest.fn(),
    fetchRiderProfile: jest.fn(),
    fetchTripDetail: jest.fn(),
    recordTripRoutePositionWithApi: jest.fn(),
    reportTripIncidentWithApi: jest.fn(),
    triggerTripSafetySosWithApi: jest.fn(),
    resolveVoiceLocationIntentWithApi: jest.fn(),
    createRideRequestWithApi: jest.fn(),
    createTripShareLinkWithApi: jest.fn(),
  createCheckoutIntentWithApi: jest.fn(),
  createSavedPlaceWithApi: jest.fn(),
  getMySupportTicketsWithApi: jest.fn().mockResolvedValue({ tickets: [] }),
  fetchWalletBalanceWithApi: jest.fn().mockResolvedValue({ balance: 0, currency: 'XOF', isLocked: false, lastUpdatedAt: null }),
  initiateWalletTopUpWithApi: jest.fn(),
  fetchWalletTopUpHistoryWithApi: jest.fn().mockResolvedValue([]),
  registerPushTokenWithApi: jest.fn().mockResolvedValue(undefined),
  updateSavedPlaceWithApi: jest.fn(),
    deleteSavedPlaceWithApi: jest.fn(),
    updateTrustedContactWithApi: jest.fn(),
    updateTripStatusWithApi: jest.fn(),
  };
});

const mockedSignInRiderAccount = jest.mocked(signInRiderAccount);
const mockedRestoreRiderSession = jest.mocked(restoreRiderSession);
const mockedSignOutRiderAccount = jest.mocked(signOutRiderAccount);
const mockedCancelRideRequestWithApi = jest.mocked(cancelRideRequestWithApi);
const mockedFetchNearbyDrivers = jest.mocked(fetchNearbyDrivers);
const mockedFetchRideOptionsPreview = jest.mocked(fetchRideOptionsPreview);
const mockedFetchMyTrips = jest.mocked(fetchMyTrips);
const mockedFetchRiderProfile = jest.mocked(fetchRiderProfile);
const mockedFetchTripDetail = jest.mocked(fetchTripDetail);
const mockedGetMySupportTicketsWithApi = jest.mocked(getMySupportTicketsWithApi);
const mockedRecordTripRoutePositionWithApi = jest.mocked(recordTripRoutePositionWithApi);
const mockedReportTripIncidentWithApi = jest.mocked(reportTripIncidentWithApi);
const mockedTriggerTripSafetySosWithApi = jest.mocked(triggerTripSafetySosWithApi);
const mockedResolveVoiceLocationIntentWithApi = jest.mocked(resolveVoiceLocationIntentWithApi);
const mockedCreateRideRequestWithApi = jest.mocked(createRideRequestWithApi);
const mockedCreateTripShareLinkWithApi = jest.mocked(createTripShareLinkWithApi);
const mockedCreateCheckoutIntentWithApi = jest.mocked(createCheckoutIntentWithApi);
const mockedCreateSavedPlaceWithApi = jest.mocked(createSavedPlaceWithApi);
const mockedUpdateSavedPlaceWithApi = jest.mocked(updateSavedPlaceWithApi);
const mockedDeleteSavedPlaceWithApi = jest.mocked(deleteSavedPlaceWithApi);
const mockedUpdateTrustedContactWithApi = jest.mocked(updateTrustedContactWithApi);
const mockedUpdateTripStatusWithApi = jest.mocked(updateTripStatusWithApi);
const mockedResolveRiderAppError = jest.mocked(resolveRiderAppError);

function buildRiderSession() {
  return {
    authClient: { token: 'rider-auth-client' },
    me: {
      user: {
        fullName: 'Awa Ouedraogo',
        phoneNumber: '+22670000000',
      },
    },
    session: {
      sessionToken: 'rider-session-token',
    },
  };
}

function buildRiderTrips() {
  return {
    role: 'RIDER' as const,
    stats: {
      activeTrips: 0,
      completedTrips: 12,
      cancelledTrips: 1,
      totalAmount: 72500,
      currency: 'XOF',
    },
    pendingRequests: [],
    recentTrips: [],
  };
}

function buildRiderRealtimeHistory(status: string) {
  return {
    role: 'RIDER' as const,
    stats: {
      activeTrips: 1,
      completedTrips: 4,
      cancelledTrips: 0,
      totalAmount: 18500,
      currency: 'XOF',
    },
    pendingRequests: [],
    recentTrips: [
      {
        id: 'trip-rider-1',
        pickupAddress: 'Universite Joseph Ki-Zerbo',
        destinationAddress: 'Ouaga 2000',
        status,
        amount: 2500,
        currency: 'XOF',
        counterpartyName: 'Issa Driver',
        vehicleLabel: 'Yamaha Crypton',
        pickupCode: '1234',
        completedAt: null,
        createdAt: '2026-04-19T08:00:00.000Z',
      },
    ],
  };
}

function buildRiderPendingRequestHistory(status: string) {
  return {
    role: 'RIDER' as const,
    stats: {
      activeTrips: 0,
      completedTrips: 4,
      cancelledTrips: 0,
      totalAmount: 18500,
      currency: 'XOF',
    },
    pendingRequests: [
      {
        id: 'ride-request-rider-1',
        pickupAddress: 'Universite Joseph Ki-Zerbo',
        destinationAddress: 'Ouaga 2000',
        estimatedFare: 2500,
        status,
        createdAt: '2026-04-19T08:00:00.000Z',
      },
    ],
    recentTrips: [],
  };
}

function buildTripDetail(eventIds: string[], labels: string[]) {
  return {
    trip: {
      id: 'trip-rider-1',
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
        state: 'critical',
        alertCount: 1,
        lastAlertType: 'ROUTE_DEVIATION',
        lastAlertAt: '2026-04-19T08:03:00.000Z',
        lastPositionAt: '2026-04-19T08:02:30.000Z',
        latestPosition: {
          latitude: 12.37,
          longitude: -1.52,
          accuracyMeters: 12,
          speedKph: 18,
          distanceToPickupKm: 0.4,
          distanceToDestinationKm: 5.1,
          observedAt: '2026-04-19T08:02:30.000Z',
          sourceRole: 'DRIVER',
        },
      },
      pickupCode: '1234',
      actualFare: 2500,
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

function buildRiderProfile() {
  return {
    profile: {
      id: 'rider-1',
      fullName: 'Awa Ouedraogo',
      email: 'rider@orbi.app',
      phoneNumber: '+22670000000',
      preferredTier: 'MOTO_STANDARD',
      emergencyPhone: null,
      trustedContact: {
        phoneNumber: null,
        shareMode: 'DISABLED',
        status: 'MISSING',
        safetyNote: 'Ajoutez un numero Burkina pour accelerer le partage en cas de trajet sensible.',
      },
      savedPlaces: [
        {
          id: 'saved-home',
          label: 'Maison',
          address: 'Patte d Oie, Ouagadougou',
          latitude: 12.3412,
          longitude: -1.5601,
        },
      ],
      stats: {
        totalRideRequests: 12,
        totalTrips: 10,
        completedTrips: 9,
        savedPlaces: 1,
      },
    },
  };
}

beforeEach(() => {
  mockedSignInRiderAccount.mockReset();
  mockedRestoreRiderSession.mockReset();
  mockedSignOutRiderAccount.mockReset();
  mockedCancelRideRequestWithApi.mockReset();
  mockedFetchNearbyDrivers.mockReset();
  mockedFetchRideOptionsPreview.mockReset();
  mockedFetchMyTrips.mockReset();
  mockedFetchRiderProfile.mockReset();
  mockedFetchTripDetail.mockReset();
  mockedGetMySupportTicketsWithApi.mockReset();
  mockedRecordTripRoutePositionWithApi.mockReset();
  riderPositionState.latestPosition = null;
  riderPositionState.positionNote = 'Position passager en attente.';
  mockedReportTripIncidentWithApi.mockReset();
  mockedTriggerTripSafetySosWithApi.mockReset();
  mockedResolveVoiceLocationIntentWithApi.mockReset();
  mockedCreateRideRequestWithApi.mockReset();
  mockedCreateTripShareLinkWithApi.mockReset();
  mockedCreateCheckoutIntentWithApi.mockReset();
  mockedCreateSavedPlaceWithApi.mockReset();
  mockedUpdateSavedPlaceWithApi.mockReset();
  mockedDeleteSavedPlaceWithApi.mockReset();
  mockedUpdateTrustedContactWithApi.mockReset();
  mockedUpdateTripStatusWithApi.mockReset();
  mockedResolveRiderAppError.mockReset();
  jest.mocked(Linking.openURL).mockReset();
  jest.mocked(Share.share).mockReset();

  jest.mocked(createOrbiApiClient).mockReturnValue({ kind: 'mock-client' } as never);
  mockedResolveVoiceLocationIntentWithApi.mockResolvedValue({
    locale: 'fr-BF',
    transcript: 'Je vais a Ouaga 2000',
    normalizedTranscript: 'je vais a ouaga 2000',
    interpretation: 'Destination vers Ouaga 2000',
    intentType: 'destination',
    confidence: 0.91,
    needsClarification: false,
    suggestions: [
      {
        id: 'voice-1',
        name: 'Ouaga 2000',
        address: 'Ouaga 2000, Ouagadougou',
        district: 'Ouaga 2000',
        latitude: 12.3456,
        longitude: -1.5345,
        confidence: 0.91,
      },
    ],
  } as never);

  mockedResolveRiderAppError.mockResolvedValue({
    message: 'Fallback rider error.',
    shouldClearSessionToken: false,
  });
  jest.mocked(Linking.openURL).mockResolvedValue(undefined);
  jest.mocked(Share.share).mockResolvedValue({ action: 'sharedAction' });
  mockedGetMySupportTicketsWithApi.mockResolvedValue({ tickets: [] } as never);
  mockedFetchNearbyDrivers.mockResolvedValue({
    drivers: [
      {
        id: 'driver-1',
        latitude: 12.365,
        longitude: -1.533,
        vehicleType: 'MOTORCYCLE',
        status: 'ONLINE',
      },
    ],
    total: 1,
  } as never);
  mockedTriggerTripSafetySosWithApi.mockResolvedValue({
    sos: {
      tripId: 'trip-1',
      ticketId: 'ticket-sos-1',
      priority: 3,
      incidentType: 'SOS_TRIGGERED',
      reportedByRole: 'RIDER',
      status: 'OPEN',
      localEmergencyNumber: '112',
      locationCaptured: false,
    },
  } as never);
  mockedCreateTripShareLinkWithApi.mockResolvedValue({
    share: {
      tripId: 'trip-1',
      token: 'share-token',
      path: '/trips/shared/share-token',
      expiresAt: '2026-05-02T12:00:00.000Z',
      ttlMinutes: 120,
    },
  } as never);
  mockedCreateSavedPlaceWithApi.mockResolvedValue({
    savedPlace: {
      id: 'saved-market',
      label: 'Marche',
      address: 'Grand Marche, Ouagadougou',
      latitude: 12.365,
      longitude: -1.534,
    },
  } as never);
  mockedUpdateSavedPlaceWithApi.mockResolvedValue({
    savedPlace: {
      id: 'saved-home',
      label: 'Maison',
      address: 'Patte d Oie, Ouagadougou',
      latitude: 12.3412,
      longitude: -1.5601,
    },
  } as never);
  mockedDeleteSavedPlaceWithApi.mockResolvedValue({
    deleted: true,
    savedPlaceId: 'saved-home',
  } as never);
  mockedUpdateTrustedContactWithApi.mockResolvedValue({
    trustedContact: {
      riderProfileId: 'rider-1',
      phoneNumber: '+22670000001',
      shareMode: 'ALL_TRIPS',
      status: 'READY',
      safetyNote: 'Contact de confiance configure et audite.',
    },
  } as never);

  riderRealtimeState.eventHandler = null;
  riderRealtimeState.options = null;
});

describe('rider smoke flows', () => {
  it('signs in and redirects to home', async () => {
    mockedSignInRiderAccount.mockResolvedValue(buildRiderSession() as never);

    const renderer = await renderScreen(<RiderAuthScreen />);

    await changeInputByPlaceholder(renderer, 'exemple@gmail.com', 'rider@orbi.app');
    await changeInputByPlaceholder(renderer, '••••••••', 'Orbi123!');
    await pressByText(renderer, 'Se connecter');

    expect(mockedSignInRiderAccount).toHaveBeenCalledWith({
      email: 'rider@orbi.app',
      password: 'Orbi123!',
    });
    expect(router.replace).toHaveBeenCalledWith('/home');
    expectText(renderer, 'Se connecter');
  });

  it('opens the rider demo session from the top action', async () => {
    mockedSignInRiderAccount.mockResolvedValue(buildRiderSession() as never);

    const renderer = await renderScreen(<RiderAuthScreen />);
    await pressByText(renderer, 'Connexion compte de démonstration');

    expect(mockedSignInRiderAccount).toHaveBeenCalledWith({
      email: 'rider@orbi.app',
      password: 'Orbi123!',
    });
    expect(router.replace).toHaveBeenCalledWith('/home');
  });

  it('normalizes rider sign-in email before submitting', async () => {
    mockedSignInRiderAccount.mockResolvedValue(buildRiderSession() as never);

    const renderer = await renderScreen(<RiderAuthScreen />);
    await changeInputByPlaceholder(renderer, 'exemple@gmail.com', ' Rider@Orbi.App ');
    await changeInputByPlaceholder(renderer, '••••••••', 'Orbi123!');
    await pressByText(renderer, 'Se connecter');

    expect(mockedSignInRiderAccount).toHaveBeenCalledWith({
      email: 'rider@orbi.app',
      password: 'Orbi123!',
    });
    expect(router.replace).toHaveBeenCalledWith('/home');
  });

  it('surfaces a network-specific auth message', async () => {
    mockedSignInRiderAccount.mockRejectedValue(new TypeError('Network request failed'));

    const renderer = await renderScreen(<RiderAuthScreen />);

    await pressByText(renderer, 'Connexion compte de démonstration');

    expect(router.replace).not.toHaveBeenCalled();
    expectText(
      renderer,
      'Connexion impossible. Vérifiez votre réseau.',
    );
  });

  it('loads the home context after authentication', async () => {
    mockedRestoreRiderSession.mockResolvedValue(buildRiderSession() as never);
    mockedFetchRideOptionsPreview.mockResolvedValue({
      route: {
        distanceKm: 5.8,
        durationMinutes: 16,
      },
      options: riderRideOptions.slice(0, 2),
    } as never);
    mockedFetchMyTrips.mockResolvedValue(buildRiderTrips() as never);

    const renderer = await renderScreen(<RiderHomeScreen />);
    // Home screen auto-loads on mount — no manual refresh button needed
    expectText(renderer, 'Où allez-vous ?');
  });

  it('creates a ride request from the booking screen', async () => {
    mockedRestoreRiderSession.mockResolvedValue(buildRiderSession() as never);
    mockedFetchRideOptionsPreview.mockResolvedValue({
      route: {
        distanceKm: 5.8,
        durationMinutes: 16,
      },
      options: riderRideOptions.slice(0, 2),
    } as never);
    mockedFetchMyTrips.mockResolvedValue(buildRiderTrips() as never);
    mockedFetchRiderProfile.mockResolvedValue(buildRiderProfile() as never);
    mockedCreateRideRequestWithApi.mockResolvedValue({
      id: 'ride-request-12345678',
      routeMetricsSource: 'SERVER_COORDINATES',
    } as never);
    mockedCreateCheckoutIntentWithApi.mockResolvedValue({
      provider: 'Orange Money',
      transactionRef: 'txn-123',
      supportedMobileMoneyNetworks: ['ORANGE_MONEY'],
      channel: 'MOBILE_MONEY',
    } as never);

    const renderer = await renderScreen(<BookingScreen />);

    await pressByText(renderer, 'Bobo-Dioulasso');
    await pressByLabel(renderer, 'booking-cta');
    await flushMicrotasks();

    expect(mockedCreateRideRequestWithApi).toHaveBeenCalledWith(
      { token: 'rider-auth-client' },
      expect.objectContaining({
        pickupAddress: 'Gare Routiere de Bobo-Dioulasso',
        destinationAddress: 'Sarfalao, Bobo-Dioulasso',
        paymentMethod: 'CASH',
        pickupAreaType: 'URBAN_EDGE',
        city: 'BOBO_DIOULASSO',
        districtProfile: 'MARKET_DENSE',
      }),
      expect.objectContaining({
        idempotencyKey: expect.stringMatching(
          /^ride-request-rider-bobo-dioulasso-/,
        ),
      }),
    );
    expect(mockedCreateCheckoutIntentWithApi).not.toHaveBeenCalled();
    expect(mockedCreateRideRequestWithApi).toHaveBeenCalledTimes(1);
  });

  it('creates a cash ride request without initializing checkout', async () => {
    mockedRestoreRiderSession.mockResolvedValue(buildRiderSession() as never);
    mockedFetchRideOptionsPreview.mockResolvedValue({
      route: {
        distanceKm: 5.8,
        durationMinutes: 16,
      },
      options: riderRideOptions.slice(0, 2),
    } as never);
    mockedFetchMyTrips.mockResolvedValue(buildRiderTrips() as never);
    mockedFetchRiderProfile.mockResolvedValue(buildRiderProfile() as never);
    mockedCreateRideRequestWithApi.mockResolvedValue({
      id: 'ride-request-cash',
      routeMetricsSource: 'SERVER_COORDINATES',
    } as never);

    const renderer = await renderScreen(<BookingScreen />);
    await flushMicrotasks();
    await pressByText(renderer, 'Espèces');
    await flushMicrotasks();
    await pressByLabel(renderer, 'booking-cta');

    expect(mockedFetchRideOptionsPreview).toHaveBeenLastCalledWith(
      { kind: 'mock-client' },
      expect.objectContaining({
        paymentMethod: 'CASH',
      }),
    );
    expect(mockedCreateRideRequestWithApi).toHaveBeenCalledWith(
      { token: 'rider-auth-client' },
      expect.objectContaining({
        paymentMethod: 'CASH',
      }),
      expect.objectContaining({
        idempotencyKey: expect.stringContaining('-cash-'),
      }),
    );
    expect(mockedCreateCheckoutIntentWithApi).not.toHaveBeenCalled();
  });

  it('blocks an immediate booking when no compatible driver is online nearby', async () => {
    mockedRestoreRiderSession.mockResolvedValue(buildRiderSession() as never);
    mockedFetchNearbyDrivers.mockResolvedValue({
      drivers: [],
      total: 0,
    } as never);
    mockedFetchRideOptionsPreview.mockResolvedValue({
      route: {
        distanceKm: 5.8,
        durationMinutes: 16,
      },
      options: riderRideOptions.slice(0, 2),
    } as never);
    mockedFetchMyTrips.mockResolvedValue(buildRiderTrips() as never);
    mockedFetchRiderProfile.mockResolvedValue(buildRiderProfile() as never);

    const renderer = await renderScreen(<BookingScreen />);
    await flushMicrotasks();

    expectText(renderer, 'Aucun chauffeur proche');
    await pressByLabel(renderer, 'booking-cta');

    expect(mockedCreateRideRequestWithApi).not.toHaveBeenCalled();
  });

  it('uses rider GPS as the pickup coordinates when available', async () => {
    riderPositionState.latestPosition = {
      latitude: 12.365,
      longitude: -1.533,
      accuracyMeters: 18,
    };
    riderPositionState.positionNote = 'Position passager synchronisee. Precision 18 m.';
    mockedRestoreRiderSession.mockResolvedValue(buildRiderSession() as never);
    mockedFetchRideOptionsPreview.mockResolvedValue({
      route: {
        distanceKm: 5.8,
        durationMinutes: 16,
      },
      options: riderRideOptions.slice(0, 2),
    } as never);
    mockedFetchMyTrips.mockResolvedValue(buildRiderTrips() as never);
    mockedFetchRiderProfile.mockResolvedValue(buildRiderProfile() as never);
    mockedCreateRideRequestWithApi.mockResolvedValue({
      id: 'ride-request-gps',
      routeMetricsSource: 'SERVER_COORDINATES',
    } as never);
    mockedCreateCheckoutIntentWithApi.mockResolvedValue({
      provider: 'Orange Money',
      transactionRef: 'txn-gps',
      supportedMobileMoneyNetworks: ['ORANGE_MONEY'],
      channel: 'MOBILE_MONEY',
    } as never);

    const renderer = await renderScreen(<BookingScreen />);
    await flushMicrotasks();

    await pressByLabel(renderer, 'booking-cta');
    await flushMicrotasks();

    expect(mockedCreateRideRequestWithApi).toHaveBeenCalledWith(
      { token: 'rider-auth-client' },
      expect.objectContaining({
        pickupAddress: 'Position GPS actuelle',
        pickupLatitude: 12.365,
        pickupLongitude: -1.533,
      }),
      expect.any(Object),
    );
  });

  it('absorbs double taps while creating a ride request from the booking screen', async () => {
    mockedRestoreRiderSession.mockResolvedValue(buildRiderSession() as never);
    mockedFetchRideOptionsPreview.mockResolvedValue({
      route: {
        distanceKm: 5.8,
        durationMinutes: 16,
      },
      options: riderRideOptions.slice(0, 2),
    } as never);
    mockedFetchMyTrips.mockResolvedValue(buildRiderTrips() as never);
    mockedFetchRiderProfile.mockResolvedValue(buildRiderProfile() as never);

    let resolveRideRequest: (value: unknown) => void = () => {};
    mockedCreateRideRequestWithApi.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveRideRequest = resolve;
        }) as never,
    );
    mockedCreateCheckoutIntentWithApi.mockResolvedValue({
      provider: 'Orange Money',
      transactionRef: 'txn-123',
      supportedMobileMoneyNetworks: ['ORANGE_MONEY'],
      channel: 'MOBILE_MONEY',
    } as never);

    const renderer = await renderScreen(<BookingScreen />);

    await pressByText(renderer, 'Bobo-Dioulasso');
    const confirmButton = renderer.root.find(
      (node: ReactTestInstance) =>
        (node.type as unknown) === 'Pressable' &&
        node.props.accessibilityLabel === 'booking-cta',
    );

    await invokeInAct(() => {
      confirmButton.props.onPress?.();
      confirmButton.props.onPress?.();
    });

    expect(mockedCreateRideRequestWithApi).toHaveBeenCalledTimes(1);

    resolveRideRequest({
      id: 'ride-request-12345678',
      routeMetricsSource: 'SERVER_COORDINATES',
    });
    await flushMicrotasks();
  });

  it('guides the rider to activity when booking is blocked by an active flow', async () => {
    mockedRestoreRiderSession.mockResolvedValue(buildRiderSession() as never);
    mockedFetchRideOptionsPreview.mockResolvedValue({
      route: {
        distanceKm: 5.8,
        durationMinutes: 16,
      },
      options: riderRideOptions.slice(0, 2),
    } as never);
    mockedFetchMyTrips.mockResolvedValue(
      buildRiderPendingRequestHistory('REQUESTED') as never,
    );
    mockedFetchRiderProfile.mockResolvedValue(buildRiderProfile() as never);

    const renderer = await renderScreen(<BookingScreen />);
    await flushMicrotasks();

    expectText(renderer, 'Réserver');
  });

  it('shows the rider fallback profile when the network is down', async () => {
    mockedRestoreRiderSession.mockResolvedValue(buildRiderSession() as never);
    mockedFetchRiderProfile.mockRejectedValue(new TypeError('Network request failed'));
    mockedFetchMyTrips.mockResolvedValue(buildRiderTrips() as never);
    mockedResolveRiderAppError.mockResolvedValue({
      message: 'Profil local de secours affiche en attendant la connexion API.',
      shouldClearSessionToken: false,
    });

    const renderer = await renderScreen(<AccountScreen />);
    await flushMicrotasks();

    expectText(renderer, 'Mon compte');
  });

  it('redirects to auth when the rider session is expired during profile refresh', async () => {
    mockedRestoreRiderSession.mockRejectedValue(new Error('valid session token missing'));
    mockedResolveRiderAppError.mockImplementation(async () => {
      router.replace('/auth');
      return {
        message: 'Votre session passager a expire. Reconnectez-vous pour reprendre vos reservations.',
        shouldClearSessionToken: true,
      };
    });

    const renderer = await renderScreen(<AccountScreen />);
    await flushMicrotasks();

    expect(router.replace).toHaveBeenCalledWith('/auth');
    expectText(
      renderer,
      'Votre session passager a expire. Reconnectez-vous pour reprendre vos reservations.',
    );
  });

  it('signs out the rider account from account screen', async () => {
    mockedRestoreRiderSession.mockResolvedValue(buildRiderSession() as never);
    mockedFetchRiderProfile.mockResolvedValue(buildRiderProfile() as never);
    mockedFetchMyTrips.mockResolvedValue(buildRiderTrips() as never);
    mockedSignOutRiderAccount.mockResolvedValue(undefined);

    const renderer = await renderScreen(<AccountScreen />);
    await flushMicrotasks();
    await pressByText(renderer, 'Déco.');

    expect(mockedSignOutRiderAccount).toHaveBeenCalled();
    expect(router.replace).toHaveBeenCalledWith('/auth');
  });

  it('shows the active rider flow inside account', async () => {
    mockedRestoreRiderSession.mockResolvedValue(buildRiderSession() as never);
    mockedFetchRiderProfile.mockResolvedValue(buildRiderProfile() as never);
    mockedFetchMyTrips.mockResolvedValue(buildRiderRealtimeHistory('MATCHED') as never);

    const renderer = await renderScreen(<AccountScreen />);
    await flushMicrotasks();

    expectText(renderer, 'Awa Ouedraogo');
    expectText(renderer, 'Mon compte');
  });

  it('updates the rider trusted contact from account', async () => {
    mockedRestoreRiderSession.mockResolvedValue(buildRiderSession() as never);
    mockedFetchRiderProfile.mockResolvedValue(buildRiderProfile() as never);
    mockedFetchMyTrips.mockResolvedValue(buildRiderTrips() as never);

    const renderer = await renderScreen(<AccountScreen />);
    await pressByLabel(renderer, 'account-refresh');
    await flushMicrotasks();
    await changeInputByPlaceholder(renderer, '+22670000001', '+22670000001');
    await pressByText(renderer, 'Tous trajets');
    await pressByText(renderer, 'Enregistrer le contact');

    expect(mockedUpdateTrustedContactWithApi).toHaveBeenCalledWith(
      { token: 'rider-auth-client' },
      expect.objectContaining({
        phoneNumber: '+22670000001',
        shareMode: 'ALL_TRIPS',
      }),
    );
    expectText(renderer, 'Contact de confiance configure et audite.');
  });

  it('blocks automatic trusted-contact sharing until a phone number is present', async () => {
    mockedRestoreRiderSession.mockResolvedValue(buildRiderSession() as never);
    mockedFetchRiderProfile.mockResolvedValue(buildRiderProfile() as never);
    mockedFetchMyTrips.mockResolvedValue(buildRiderTrips() as never);

    const renderer = await renderScreen(<AccountScreen />);
    await flushMicrotasks();
    await pressByText(renderer, 'Nuit');
    await pressByText(renderer, 'Enregistrer le contact');

    expect(mockedUpdateTrustedContactWithApi).not.toHaveBeenCalled();
    expectText(renderer, 'Ajoutez un numero Burkina avant d activer le partage automatique.');
  });

  it('creates a saved rider place from account with normalized coordinates', async () => {
    mockedRestoreRiderSession.mockResolvedValue(buildRiderSession() as never);
    mockedFetchRiderProfile.mockResolvedValue(buildRiderProfile() as never);
    mockedFetchMyTrips.mockResolvedValue(buildRiderTrips() as never);

    const renderer = await renderScreen(<AccountScreen />);
    await flushMicrotasks();
    await changeInputByPlaceholder(renderer, 'Libelle du lieu', '  Marche  ');
    await changeInputByPlaceholder(renderer, "Adresse (ex: Patte d'Oie, Ouagadougou)", ' Grand Marche, Ouagadougou ');
    await changeInputByPlaceholder(renderer, 'Latitude', '12,365');
    await changeInputByPlaceholder(renderer, 'Longitude', '-1,534');
    await pressByText(renderer, 'Ajouter un lieu');

    expect(mockedCreateSavedPlaceWithApi).toHaveBeenCalledWith(
      { token: 'rider-auth-client' },
      {
        label: 'Marche',
        address: 'Grand Marche, Ouagadougou',
        latitude: 12.365,
        longitude: -1.534,
      },
    );
    expectText(renderer, 'Lieu enregistre synchronise avec succes.');
  });

  it('rejects unsafe saved place text from account before API mutation', async () => {
    mockedRestoreRiderSession.mockResolvedValue(buildRiderSession() as never);
    mockedFetchRiderProfile.mockResolvedValue(buildRiderProfile() as never);
    mockedFetchMyTrips.mockResolvedValue(buildRiderTrips() as never);

    const renderer = await renderScreen(<AccountScreen />);
    await flushMicrotasks();
    await changeInputByPlaceholder(renderer, 'Libelle du lieu', '<script>');
    await changeInputByPlaceholder(renderer, "Adresse (ex: Patte d'Oie, Ouagadougou)", 'Grand Marche, Ouagadougou');
    await changeInputByPlaceholder(renderer, 'Latitude', '12.365');
    await changeInputByPlaceholder(renderer, 'Longitude', '-1.534');
    await pressByText(renderer, 'Ajouter un lieu');

    expect(mockedCreateSavedPlaceWithApi).not.toHaveBeenCalled();
    expectText(renderer, 'Le lieu contient des caracteres non autorises.');
  });

  it('renders the voice screen with microphone prompt', async () => {
    mockedRestoreRiderSession.mockResolvedValue(buildRiderSession() as never);
    mockedFetchMyTrips.mockResolvedValue(buildRiderPendingRequestHistory('REQUESTED') as never);

    const renderer = await renderScreen(<VoiceScreen />);
    await flushMicrotasks();

    // Voice screen shows the mic button prompt — analyzeTranscript is triggered
    // by user interaction (recording), not automatically on mount
    expectText(renderer, 'Appuyez et parlez');
  });

  it('shows live rider trip transitions in activity after a realtime update', async () => {
    mockedRestoreRiderSession.mockResolvedValue(buildRiderSession() as never);
    mockedFetchMyTrips
      .mockResolvedValueOnce(buildRiderRealtimeHistory('MATCHED') as never)
      .mockResolvedValueOnce(buildRiderRealtimeHistory('DRIVER_ARRIVING') as never);
    mockedFetchTripDetail
      .mockResolvedValueOnce(
        buildTripDetail(['timeline-1'], ['Chauffeur assigne']) as never,
      )
      .mockResolvedValueOnce(
        buildTripDetail(
          ['timeline-1', 'timeline-2'],
          ['Chauffeur assigne', 'Le chauffeur arrive'],
        ) as never,
      );

    const renderer = await renderScreen(<ActivityScreen />);
    await pressByLabel(renderer, 'activity-refresh');
    await flushMicrotasks();

    expectText(renderer, 'Historique charge depuis le flux protege.');
    expectText(renderer, 'Chauffeur assigné');

    await flushMicrotasks();
    await invokeInAct(async () => {
      riderRealtimeState.eventHandler?.('trip.updated');
    });
    await flushMicrotasks();

    // After realtime update: trip detail should reflect new state
    expectText(renderer, 'Issa Driver');
  });

  it('keeps rider activity usable when trip detail is temporarily unavailable', async () => {
    mockedRestoreRiderSession.mockResolvedValue(buildRiderSession() as never);
    mockedFetchMyTrips.mockResolvedValue(buildRiderRealtimeHistory('DRIVER_ARRIVING') as never);
    mockedFetchTripDetail.mockRejectedValue(new Error('Trip detail temporarily unavailable'));

    const renderer = await renderScreen(<ActivityScreen />);
    await pressByLabel(renderer, 'activity-refresh');
    await flushMicrotasks();

    expectText(renderer, 'Chauffeur en route');
    expectText(renderer, 'Issa Driver');
  });

  it('cancels a pending rider request from activity', async () => {
    mockedRestoreRiderSession.mockResolvedValue(buildRiderSession() as never);
    mockedFetchMyTrips
      .mockResolvedValueOnce({
        role: 'RIDER',
        stats: {
          activeTrips: 0,
          completedTrips: 4,
          cancelledTrips: 0,
          totalAmount: 18500,
          currency: 'XOF',
        },
        pendingRequests: [
          {
            id: 'ride-request-pending-1',
            pickupAddress: 'Patte d Oie',
            destinationAddress: 'Ouaga 2000',
            estimatedFare: 2200,
            status: 'REQUESTED',
            createdAt: '2026-04-19T09:00:00.000Z',
          },
        ],
        recentTrips: [],
      } as never)
      .mockResolvedValueOnce({
        role: 'RIDER',
        stats: {
          activeTrips: 0,
          completedTrips: 4,
          cancelledTrips: 1,
          totalAmount: 18500,
          currency: 'XOF',
        },
        pendingRequests: [],
        recentTrips: [],
      } as never);
    mockedCancelRideRequestWithApi.mockResolvedValue({ cancelled: true } as never);

    const renderer = await renderScreen(<ActivityScreen />);
    await pressByLabel(renderer, 'activity-refresh');
    await flushMicrotasks();
    await pressByText(renderer, 'Annuler');

    expect(mockedCancelRideRequestWithApi).toHaveBeenCalledWith(
      { token: 'rider-auth-client' },
      'ride-request-pending-1',
    );
  });

  it('cancels an active rider trip before departure', async () => {
    mockedRestoreRiderSession.mockResolvedValue(buildRiderSession() as never);
    mockedFetchMyTrips
      .mockResolvedValueOnce(buildRiderRealtimeHistory('MATCHED') as never)
      .mockResolvedValueOnce({
        role: 'RIDER',
        stats: {
          activeTrips: 0,
          completedTrips: 4,
          cancelledTrips: 1,
          totalAmount: 18500,
          currency: 'XOF',
        },
        pendingRequests: [],
        recentTrips: [],
      } as never);
    mockedFetchTripDetail.mockResolvedValue(
      buildTripDetail(['timeline-1'], ['Chauffeur assigne']) as never,
    );
    mockedUpdateTripStatusWithApi.mockResolvedValue({
      trip: { id: 'trip-rider-1', status: 'CANCELLED' },
    } as never);

    const renderer = await renderScreen(<ActivityScreen />);
    await pressByLabel(renderer, 'activity-refresh');
    await flushMicrotasks();
    await pressByText(renderer, 'Annuler');
    const cancelOptions = jest.mocked(Alert.alert).mock.calls.at(-1)?.[2] as
      | Array<{ text: string; onPress?: () => void }>
      | undefined;
    await invokeInAct(() => {
      cancelOptions?.[0]?.onPress?.();
    });
    await flushMicrotasks();

    expect(mockedUpdateTripStatusWithApi).toHaveBeenCalledWith(
      { token: 'rider-auth-client' },
      'trip-rider-1',
      'CANCELLED',
      'Chauffeur en retard',
    );
  });

  it('reports a rider incident from activity', async () => {
    mockedRestoreRiderSession.mockResolvedValue(buildRiderSession() as never);
    mockedFetchMyTrips
      .mockResolvedValueOnce(buildRiderRealtimeHistory('IN_PROGRESS') as never)
      .mockResolvedValueOnce(buildRiderRealtimeHistory('IN_PROGRESS') as never);
    mockedFetchTripDetail.mockResolvedValue(
      buildTripDetail(['timeline-1'], ['Course demarree']) as never,
    );
    mockedReportTripIncidentWithApi.mockResolvedValue({
      incident: { ticketId: 'ticket-1' },
    } as never);

    const renderer = await renderScreen(<ActivityScreen />);
    await pressByLabel(renderer, 'activity-refresh');
    await flushMicrotasks();
    await pressByLabel(renderer, 'report-incident');

    expect(mockedReportTripIncidentWithApi).toHaveBeenCalledWith(
      { token: 'rider-auth-client' },
      'trip-rider-1',
      expect.objectContaining({
        incidentType: 'SAFETY_ALERT',
        priority: 3,
      }),
    );
  });

  it('triggers rider SOS from activity and opens the local emergency dialer', async () => {
    riderPositionState.latestPosition = {
      latitude: 12.365,
      longitude: -1.533,
      accuracyMeters: 18,
    };
    mockedRestoreRiderSession.mockResolvedValue(buildRiderSession() as never);
    mockedFetchMyTrips.mockResolvedValue(buildRiderRealtimeHistory('IN_PROGRESS') as never);
    mockedFetchTripDetail.mockResolvedValue(
      buildTripDetail(['timeline-1'], ['Course demarree']) as never,
    );

    const renderer = await renderScreen(<ActivityScreen />);
    await pressByLabel(renderer, 'activity-refresh');
    await flushMicrotasks();
    await pressByText(renderer, 'SOS');

    expect(mockedTriggerTripSafetySosWithApi).toHaveBeenCalledWith(
      { token: 'rider-auth-client' },
      'trip-rider-1',
      {
        details: 'SOS declenche depuis le cockpit passager.',
        latitude: 12.365,
        longitude: -1.533,
        accuracyMeters: 18,
      },
    );
    expect(Linking.openURL).toHaveBeenCalledWith('tel:112');
  });

  it('creates and shares a bounded rider trip tracking link from activity', async () => {
    mockedRestoreRiderSession.mockResolvedValue(buildRiderSession() as never);
    mockedFetchMyTrips.mockResolvedValue(buildRiderRealtimeHistory('IN_PROGRESS') as never);
    mockedFetchTripDetail.mockResolvedValue(
      buildTripDetail(['timeline-1'], ['Course demarree']) as never,
    );

    const renderer = await renderScreen(<ActivityScreen />);
    await pressByLabel(renderer, 'activity-refresh');
    await flushMicrotasks();
    await pressByText(renderer, 'Partager');

    expect(mockedCreateTripShareLinkWithApi).toHaveBeenCalledWith(
      { token: 'rider-auth-client' },
      'trip-rider-1',
    );
    expect(Share.share).toHaveBeenCalledWith({
      message:
        'Suivi securise de ma course Orbi: https://backend-production-d5d1.up.railway.app/trips/shared/share-token',
      url: 'https://backend-production-d5d1.up.railway.app/trips/shared/share-token',
    });
  });

  it('absorbs double taps while reporting a rider incident from activity', async () => {
    mockedRestoreRiderSession.mockResolvedValue(buildRiderSession() as never);
    mockedFetchMyTrips
      .mockResolvedValueOnce(buildRiderRealtimeHistory('IN_PROGRESS') as never)
      .mockResolvedValueOnce(buildRiderRealtimeHistory('IN_PROGRESS') as never);
    mockedFetchTripDetail.mockResolvedValue(
      buildTripDetail(['timeline-1'], ['Course demarree']) as never,
    );

    let resolveIncident: (value: unknown) => void = () => {};
    mockedReportTripIncidentWithApi.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveIncident = resolve;
        }) as never,
    );

    const renderer = await renderScreen(<ActivityScreen />);
    await pressByLabel(renderer, 'activity-refresh');
    await flushMicrotasks();

    const incidentButton = renderer.root.find(
      (node: ReactTestInstance) =>
        (node.type as unknown) === 'Pressable' &&
        node.props.accessibilityLabel === 'report-incident',
    );

    await invokeInAct(() => {
      incidentButton.props.onPress?.();
      incidentButton.props.onPress?.();
    });

    expect(mockedReportTripIncidentWithApi).toHaveBeenCalledTimes(1);

    resolveIncident({
      incident: { ticketId: 'ticket-1' },
    });
    await flushMicrotasks();
  });

});
