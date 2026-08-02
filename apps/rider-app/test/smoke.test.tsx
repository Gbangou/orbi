import React from 'react';
import { Alert, Linking, Share } from 'react-native';
import type { ReactTestInstance } from 'react-test-renderer';
import { router } from 'expo-router';
import {
  createOrbiApiClient,
  cancelRideRequestWithApi,
  createCheckoutIntentWithApi,
  createRideRequestWithApi,
  createSupportTicketWithApi,
  createSavedPlaceWithApi,
  createTrustedContactWithApi,
  createTripShareLinkWithApi,
  deleteSavedPlaceWithApi,
  deleteTrustedContactWithApi,
  fetchNearbyDrivers,
  fetchMyTrips,
  fetchRideOptionsPreview,
  fetchRiderProfile,
  fetchTripDetail,
  getMySupportTicketsWithApi,
  recordTripRoutePositionWithApi,
  reportTripIncidentWithApi,
  riderRideOptions,
  triggerTripSafetySosWithApi,
  updateTrustedContactEntryWithApi,
  updateSavedPlaceWithApi,
  updateTrustedContactWithApi,
  updateTripStatusWithApi,
} from '@orbi/api';
import type { RiderProfileResponse } from '@orbi/api';
import {
  restoreRiderSession,
  signInRiderAccount,
  signUpRiderAccount,
  signOutRiderAccount,
} from '../lib/auth';
import { resolveRiderAppError } from '../lib/session-feedback';
import AccountScreen from '../app/(tabs)/account';
import ActivityScreen from '../app/(tabs)/activity';
import RiderAuthScreen from '../app/auth';
import RiderHomeScreen from '../app/(tabs)/home';
import BookingScreen from '../app/book';
import ReceiptScreen from '../app/receipt';
import TripsScreen from '../app/(tabs)/trips';
import { PlaceSearch } from '../lib/place-search';
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

const fieldTestDestination = {
  id: 'field-destination-patte-doie',
  label: 'Patte d Oie',
  address: 'Patte d Oie, Ouagadougou',
  coordinates: {
    latitude: 12.334,
    longitude: -1.537,
  },
};

async function selectBookingDestination(renderer: {
  root: ReactTestInstance;
}) {
  const destinationSearch = renderer.root
    .findAllByType(PlaceSearch)
    .find((node) => node.props.placeholder === 'Où allez-vous ?');

  if (!destinationSearch) {
    throw new Error('Destination search field not found.');
  }

  await invokeInAct(() => {
    destinationSearch.props.onSelectPlace(fieldTestDestination);
  });
}

jest.mock('../lib/auth', () => ({
  createRiderPublicClient: jest.fn(() => ({ kind: 'mock-client' })),
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
    createRideRequestWithApi: jest.fn(),
    createSupportTicketWithApi: jest.fn(),
  createTripShareLinkWithApi: jest.fn(),
  createTrustedContactWithApi: jest.fn(),
  createCheckoutIntentWithApi: jest.fn(),
  createSavedPlaceWithApi: jest.fn(),
  getMySupportTicketsWithApi: jest.fn().mockResolvedValue({ tickets: [] }),
  fetchWalletBalanceWithApi: jest.fn().mockResolvedValue({ balance: 0, currency: 'XOF', isLocked: false, lastUpdatedAt: null }),
  initiateWalletTopUpWithApi: jest.fn(),
  fetchWalletTopUpHistoryWithApi: jest.fn().mockResolvedValue([]),
  registerPushTokenWithApi: jest.fn().mockResolvedValue(undefined),
  updateSavedPlaceWithApi: jest.fn(),
    deleteSavedPlaceWithApi: jest.fn(),
    deleteTrustedContactWithApi: jest.fn(),
    updateTrustedContactEntryWithApi: jest.fn(),
    updateTrustedContactWithApi: jest.fn(),
    updateTripStatusWithApi: jest.fn(),
  };
});

const mockedSignInRiderAccount = jest.mocked(signInRiderAccount);
const mockedSignUpRiderAccount = jest.mocked(signUpRiderAccount);
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
const mockedCreateRideRequestWithApi = jest.mocked(createRideRequestWithApi);
const mockedCreateSupportTicketWithApi = jest.mocked(createSupportTicketWithApi);
const mockedCreateTripShareLinkWithApi = jest.mocked(createTripShareLinkWithApi);
const mockedCreateTrustedContactWithApi = jest.mocked(createTrustedContactWithApi);
const mockedCreateCheckoutIntentWithApi = jest.mocked(createCheckoutIntentWithApi);
const mockedCreateSavedPlaceWithApi = jest.mocked(createSavedPlaceWithApi);
const mockedUpdateSavedPlaceWithApi = jest.mocked(updateSavedPlaceWithApi);
const mockedDeleteSavedPlaceWithApi = jest.mocked(deleteSavedPlaceWithApi);
const mockedDeleteTrustedContactWithApi = jest.mocked(deleteTrustedContactWithApi);
const mockedUpdateTrustedContactEntryWithApi = jest.mocked(updateTrustedContactEntryWithApi);
const mockedUpdateTrustedContactWithApi = jest.mocked(updateTrustedContactWithApi);
const mockedUpdateTripStatusWithApi = jest.mocked(updateTripStatusWithApi);
const mockedResolveRiderAppError = jest.mocked(resolveRiderAppError);

function expectNoText(renderer: { root: ReactTestInstance }, text: string) {
  expect(collectText(renderer.root)).not.toContain(text);
}

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

function buildPartialRiderTrips() {
  return {
    role: 'RIDER',
    stats: {
      completedTrips: 0,
    },
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
      driverPhoneNumber: '+22670000000',
      riderPhoneNumber: '+22671000000',
      paymentMethod: 'MOBILE_MONEY',
      receipt: null,
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

function buildRiderProfile(
  overrides: Partial<RiderProfileResponse['profile']> = {},
): RiderProfileResponse {
  const profile: RiderProfileResponse['profile'] = {
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
    trustedContacts: [],
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
    ...overrides,
  };

  return {
    profile: {
      ...profile,
    },
  };
}

beforeEach(() => {
  mockedSignInRiderAccount.mockReset();
  mockedSignUpRiderAccount.mockReset();
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
  mockedCreateRideRequestWithApi.mockReset();
  mockedCreateSupportTicketWithApi.mockReset();
  mockedCreateTripShareLinkWithApi.mockReset();
  mockedCreateTrustedContactWithApi.mockReset();
  mockedCreateCheckoutIntentWithApi.mockReset();
  mockedCreateSavedPlaceWithApi.mockReset();
  mockedUpdateSavedPlaceWithApi.mockReset();
  mockedDeleteSavedPlaceWithApi.mockReset();
  mockedDeleteTrustedContactWithApi.mockReset();
  mockedUpdateTrustedContactEntryWithApi.mockReset();
  mockedUpdateTrustedContactWithApi.mockReset();
  mockedUpdateTripStatusWithApi.mockReset();
  mockedResolveRiderAppError.mockReset();
  jest.mocked(Linking.openURL).mockReset();
  jest.mocked(Share.share).mockReset();

  jest.mocked(createOrbiApiClient).mockReturnValue({ kind: 'mock-client' } as never);
  mockedResolveRiderAppError.mockResolvedValue({
    message: 'Fallback rider error.',
    shouldClearSessionToken: false,
  });
  jest.mocked(Linking.openURL).mockResolvedValue(undefined);
  jest.mocked(Share.share).mockResolvedValue({ action: 'sharedAction' });
  mockedGetMySupportTicketsWithApi.mockResolvedValue({ tickets: [] } as never);
  mockedCreateSupportTicketWithApi.mockResolvedValue({
    ticket: {
      id: 'ticket-quick-1',
      subject: 'Paiement a verifier',
      description: 'Ticket support rapide.',
      status: 'OPEN',
      priority: 2,
      adminNote: null,
      createdAt: '2026-04-19T09:05:00.000Z',
      updatedAt: '2026-04-19T09:05:00.000Z',
    },
  } as never);
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
    trustedContacts: [
      {
        id: 'trusted-contact-1',
        label: 'Contact principal',
        phoneNumber: '+22670000001',
        priority: 1,
        isActive: true,
      },
    ],
  } as never);
  mockedCreateTrustedContactWithApi.mockResolvedValue({
    trustedContacts: [
      {
        id: 'trusted-contact-1',
        label: 'Contact principal',
        phoneNumber: '+22670000001',
        priority: 1,
        isActive: true,
      },
      {
        id: 'trusted-contact-2',
        label: 'Frere',
        phoneNumber: '+22670000002',
        priority: 2,
        isActive: true,
      },
    ],
  } as never);
  mockedUpdateTrustedContactEntryWithApi.mockResolvedValue({
    trustedContacts: [
      {
        id: 'trusted-contact-2',
        label: 'Frere',
        phoneNumber: '+22670000002',
        priority: 1,
        isActive: true,
      },
    ],
  } as never);
  mockedDeleteTrustedContactWithApi.mockResolvedValue({
    deleted: true,
    trustedContactId: 'trusted-contact-2',
    trustedContacts: [],
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
    expectNoText(renderer, 'Compte de démonstration');
    expectNoText(renderer, 'Accès démo');
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

  it('creates a fresh rider account and redirects to home', async () => {
    mockedSignUpRiderAccount.mockResolvedValue(buildRiderSession() as never);

    const renderer = await renderScreen(<RiderAuthScreen />);
    await pressByText(renderer, 'Inscription');
    await changeInputByPlaceholder(renderer, 'Aminata Traore', ' Nouveau Passager ');
    await changeInputByPlaceholder(renderer, 'exemple@gmail.com', ' Fresh@Orbi.App ');
    await changeInputByPlaceholder(renderer, 'Min. 8 car. · Maj · Chiffre · Symbole', 'Orbi123!');
    await pressByText(renderer, 'Créer mon compte');

    expect(mockedSignUpRiderAccount).toHaveBeenCalledWith({
      fullName: 'Nouveau Passager',
      email: 'fresh@orbi.app',
      password: 'Orbi123!',
    });
    expect(router.replace).toHaveBeenCalledWith('/home');
  });

  it('surfaces a network-specific auth message', async () => {
    mockedSignInRiderAccount.mockRejectedValue(new TypeError('Network request failed'));

    const renderer = await renderScreen(<RiderAuthScreen />);

    await changeInputByPlaceholder(renderer, 'exemple@gmail.com', 'rider@orbi.app');
    await changeInputByPlaceholder(renderer, '••••••••', 'Orbi123!');
    await pressByText(renderer, 'Se connecter');

    expect(router.replace).not.toHaveBeenCalled();
    expectText(
      renderer,
      'Connexion impossible. Verifiez votre reseau mobile et reessayez.',
    );
  });

  it('surfaces a slow-network auth timeout without blaming credentials', async () => {
    mockedSignInRiderAccount.mockRejectedValue(
      new DOMException('The operation was aborted.', 'AbortError'),
    );

    const renderer = await renderScreen(<RiderAuthScreen />);

    await changeInputByPlaceholder(renderer, 'exemple@gmail.com', 'rider@orbi.app');
    await changeInputByPlaceholder(renderer, '••••••••', 'Orbi123!');
    await pressByText(renderer, 'Se connecter');

    expect(router.replace).not.toHaveBeenCalled();
    expectText(
      renderer,
      'Le serveur ne repond pas encore. Orbi continue de fonctionner sur reseau faible: reessayez dans un instant ou changez de reseau si besoin.',
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

  it('keeps home usable when a fresh rider trip history is partially hydrated', async () => {
    mockedRestoreRiderSession.mockResolvedValue(buildRiderSession() as never);
    mockedFetchRideOptionsPreview.mockResolvedValue({
      route: {
        distanceKm: 5.8,
        durationMinutes: 16,
      },
      options: riderRideOptions.slice(0, 2),
    } as never);
    mockedFetchMyTrips.mockResolvedValue(buildPartialRiderTrips() as never);

    const renderer = await renderScreen(<RiderHomeScreen />);
    await flushMicrotasks();

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

    await flushMicrotasks();
    await selectBookingDestination(renderer);
    await pressByLabel(renderer, 'booking-cta');
    await flushMicrotasks();

    expect(mockedCreateRideRequestWithApi).toHaveBeenCalledWith(
      { token: 'rider-auth-client' },
      expect.objectContaining({
        pickupAddress: 'Universite Joseph Ki-Zerbo, Ouagadougou',
        destinationAddress: 'Patte d Oie, Ouagadougou',
        paymentMethod: 'CASH',
        pickupAreaType: 'URBAN_CORE',
        city: 'OUAGADOUGOU',
        districtProfile: 'UNIVERSITY',
      }),
      expect.objectContaining({
        idempotencyKey: expect.stringMatching(
          /^ride-request-rider-ouagadougou-/,
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

  it('keeps booking usable when saved place coordinates arrive as strings', async () => {
    mockedRestoreRiderSession.mockResolvedValue(buildRiderSession() as never);
    mockedFetchRideOptionsPreview.mockResolvedValue({
      route: {
        distanceKm: 5.8,
        durationMinutes: 16,
      },
      options: riderRideOptions.slice(0, 2),
    } as never);
    mockedFetchMyTrips.mockResolvedValue(buildRiderTrips() as never);
    mockedFetchRiderProfile.mockResolvedValue(
      buildRiderProfile({
        savedPlaces: [
          {
            id: 'saved-string-coordinates',
            label: 'Maison',
            address: 'Patte d Oie, Ouagadougou',
            latitude: '12,3412',
            longitude: '-1.5601',
          },
        ] as never,
      }) as never,
    );

    const renderer = await renderScreen(<BookingScreen />);
    await flushMicrotasks();

    expectText(renderer, 'Réserver');
    expectText(renderer, 'Destination');
    expectNoText(renderer, 'Destinations rapides');
    expectNoText(renderer, 'Voix');
  });

  it('keeps booking usable when a new rider profile is partially hydrated', async () => {
    mockedRestoreRiderSession.mockResolvedValue(buildRiderSession() as never);
    mockedFetchRideOptionsPreview.mockResolvedValue({
      route: {
        distanceKm: 5.8,
        durationMinutes: 16,
      },
      options: riderRideOptions.slice(0, 2),
    } as never);
    mockedFetchMyTrips.mockResolvedValue(buildRiderTrips() as never);
    mockedFetchRiderProfile.mockResolvedValue({
      profile: {
        id: 'rider-fresh',
        fullName: 'Nouveau Passager',
        email: 'fresh@orbi.app',
        phoneNumber: '+22670000009',
      },
    } as never);

    const renderer = await renderScreen(<BookingScreen />);
    await flushMicrotasks();

    expectText(renderer, 'Réserver');
  });

  it('keeps booking usable when rider trip history is partially hydrated', async () => {
    mockedRestoreRiderSession.mockResolvedValue(buildRiderSession() as never);
    mockedFetchRideOptionsPreview.mockResolvedValue({
      route: {
        distanceKm: 5.8,
        durationMinutes: 16,
      },
      options: riderRideOptions.slice(0, 2),
    } as never);
    mockedFetchMyTrips.mockResolvedValue(buildPartialRiderTrips() as never);
    mockedFetchRiderProfile.mockResolvedValue(buildRiderProfile() as never);

    const renderer = await renderScreen(<BookingScreen />);
    await flushMicrotasks();

    expectText(renderer, 'Réserver');
  });

  it('suggests Burkina localities despite a typo while typing a booking destination', async () => {
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

    const renderer = await renderScreen(<BookingScreen />);
    await flushMicrotasks();
    await changeInputByPlaceholder(renderer, 'Où allez-vous ?', 'Tmpuy');

    expectText(renderer, 'Tampuy');
    expectNoText(renderer, 'Recherche indisponible. Verifiez la connexion.');
  });

  it('shows a compact upfront fare summary before booking confirmation', async () => {
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

    const renderer = await renderScreen(<BookingScreen />);
    await flushMicrotasks();

    expectText(renderer, 'Prix estime');
    expectText(renderer, 'Moto');
    expectNoText(renderer, 'Prix transparent');
    expectNoText(renderer, 'Equilibre course');
  });

  it('uses the selected Mobile Money phone number when creating checkout', async () => {
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
      id: 'ride-request-mobile-money',
      routeMetricsSource: 'SERVER_COORDINATES',
    } as never);
    mockedCreateCheckoutIntentWithApi.mockResolvedValue({
      provider: 'Orange Money',
      transactionRef: 'txn-mm',
      supportedMobileMoneyNetworks: ['ORANGE_MONEY'],
      channel: 'MOBILE_MONEY',
    } as never);

    const renderer = await renderScreen(<BookingScreen />);
    await flushMicrotasks();
    await pressByText(renderer, 'Mobile Money');
    await changeInputByPlaceholder(renderer, '70 12 34 56', '76 54 32 10');
    await pressByLabel(renderer, 'booking-cta');
    await flushMicrotasks();

    expect(mockedCreateCheckoutIntentWithApi).toHaveBeenCalledWith(
      { token: 'rider-auth-client' },
      expect.objectContaining({
        channel: 'MOBILE_MONEY',
        mobileMoneyNetwork: 'ORANGE_MONEY',
        customerPhoneNumber: '76543210',
      }),
      expect.objectContaining({
        idempotencyKey: 'checkout-ride-request-mobile-money-mobile-money',
      }),
    );
  });

  it('creates a wallet checkout when Wallet Orbi is selected', async () => {
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
      id: 'ride-request-wallet',
      routeMetricsSource: 'SERVER_COORDINATES',
    } as never);
    mockedCreateCheckoutIntentWithApi.mockResolvedValue({
      provider: 'PAWAPAY',
      transactionRef: 'txn-wallet',
      supportedMobileMoneyNetworks: [],
      channel: 'WALLET',
    } as never);

    const renderer = await renderScreen(<BookingScreen />);
    await flushMicrotasks();
    await pressByText(renderer, 'Wallet Orbi');
    await pressByLabel(renderer, 'booking-cta');
    await flushMicrotasks();

    expect(mockedCreateRideRequestWithApi).toHaveBeenCalledWith(
      { token: 'rider-auth-client' },
      expect.objectContaining({
        paymentMethod: 'WALLET',
      }),
      expect.objectContaining({
        idempotencyKey: expect.stringContaining('-wallet-'),
      }),
    );
    expect(mockedCreateCheckoutIntentWithApi).toHaveBeenCalledWith(
      { token: 'rider-auth-client' },
      expect.objectContaining({
        channel: 'WALLET',
        mobileMoneyNetwork: undefined,
        customerPhoneNumber: undefined,
      }),
      expect.objectContaining({
        idempotencyKey: 'checkout-ride-request-wallet-wallet',
      }),
    );
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
        pickupAddress: 'Position actuelle',
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

    await flushMicrotasks();
    await selectBookingDestination(renderer);
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

  it('keeps account usable when a new rider profile is partially hydrated', async () => {
    mockedRestoreRiderSession.mockResolvedValue(buildRiderSession() as never);
    mockedFetchRiderProfile.mockResolvedValue({
      profile: {
        id: 'rider-fresh',
        fullName: 'Nouveau Passager',
        email: 'fresh@orbi.app',
        phoneNumber: '+22670000009',
        preferredTier: 'MOTO_STANDARD',
        emergencyPhone: null,
      },
    } as never);
    mockedFetchMyTrips.mockResolvedValue(buildRiderTrips() as never);
    mockedGetMySupportTicketsWithApi.mockResolvedValue({
      tickets: [
        {
          id: 'ticket-sensitive-rider-1',
          subject: 'Prix de course conteste',
          description: 'Le prix affiche apres course doit etre revu.',
          status: 'OPEN',
          priority: 2,
          adminNote: null,
          createdAt: '2026-04-19T08:00:00.000Z',
        },
      ],
    } as never);

    const renderer = await renderScreen(<AccountScreen />);
    await flushMicrotasks();

    expectText(renderer, 'Nouveau Passager');
    expectText(renderer, 'Mon compte');
    expectText(renderer, 'Aucun contact actif');
    expectText(renderer, 'Contacts suivis');
    expectText(renderer, 'Support');
    expectText(
      renderer,
      '1 demande(s) ouverte(s) ou recemment mise(s) a jour. Les details de course restent dans Activite.',
    );
    expect(collectText(renderer.root)).not.toContain('Prix de course conteste');
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
    await changeInputByPlaceholder(renderer, 'Telephone du contact principal', '+22670000001');
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

  it('shows the rider trusted contacts list with masked phone numbers', async () => {
    mockedRestoreRiderSession.mockResolvedValue(buildRiderSession() as never);
    mockedFetchRiderProfile.mockResolvedValue(
      buildRiderProfile({
        trustedContact: {
          phoneNumber: '+22670000001',
          shareMode: 'ALL_TRIPS',
          status: 'READY',
          safetyNote: 'Contact de confiance pret pour le partage trajet automatique selon vos regles.',
        },
        trustedContacts: [
          {
            id: 'trusted-contact-1',
            label: 'Contact principal',
            phoneNumber: '+22670000001',
            priority: 1,
            isActive: true,
          },
          {
            id: 'trusted-contact-2',
            label: 'Frere',
            phoneNumber: '+22670000002',
            priority: 2,
            isActive: true,
          },
        ],
      }) as never,
    );
    mockedFetchMyTrips.mockResolvedValue(buildRiderTrips() as never);

    const renderer = await renderScreen(<AccountScreen />);
    await flushMicrotasks();

    expectText(renderer, 'Contacts suivis');
    expectText(renderer, '2 contacts actifs');
    expectText(renderer, 'Contact principal');
    expectText(renderer, 'Frere');
    expectText(renderer, 'Principal');
    expectText(renderer, '*** 0001');
    expectText(renderer, '*** 0002');
  });

  it('adds and manages rider trusted contacts from account', async () => {
    mockedRestoreRiderSession.mockResolvedValue(buildRiderSession() as never);
    mockedFetchRiderProfile.mockResolvedValue(
      buildRiderProfile({
        trustedContact: {
          phoneNumber: '+22670000001',
          shareMode: 'ALL_TRIPS',
          status: 'READY',
          safetyNote: 'Contact de confiance pret pour le partage trajet automatique selon vos regles.',
        },
        trustedContacts: [
          {
            id: 'trusted-contact-1',
            label: 'Contact principal',
            phoneNumber: '+22670000001',
            priority: 1,
            isActive: true,
          },
          {
            id: 'trusted-contact-2',
            label: 'Frere',
            phoneNumber: '+22670000002',
            priority: 2,
            isActive: true,
          },
        ],
      }) as never,
    );
    mockedFetchMyTrips.mockResolvedValue(buildRiderTrips() as never);

    const renderer = await renderScreen(<AccountScreen />);
    await flushMicrotasks();
    await changeInputByPlaceholder(renderer, 'Nom du contact', 'Tantie');
    await changeInputByPlaceholder(renderer, 'Telephone du contact secondaire', '+22670000003');
    await pressByText(renderer, 'Priorite 3');
    await pressByText(renderer, 'Ajouter un contact');

    expect(mockedCreateTrustedContactWithApi).toHaveBeenCalledWith(
      { token: 'rider-auth-client' },
      {
        label: 'Tantie',
        phoneNumber: '+22670000003',
        priority: 3,
      },
    );

    await pressByText(renderer, 'Prioriser');
    expect(mockedUpdateTrustedContactEntryWithApi).toHaveBeenCalledWith(
      { token: 'rider-auth-client' },
      'trusted-contact-2',
      { priority: 1 },
    );

    await pressByText(renderer, 'Retirer');
    expect(mockedDeleteTrustedContactWithApi).toHaveBeenCalledWith(
      { token: 'rider-auth-client' },
      'trusted-contact-1',
    );
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
    await changeInputByPlaceholder(renderer, 'Nom du lieu', '  Marche  ');
    await changeInputByPlaceholder(renderer, 'Adresse ou quartier', ' Grand Marche, Ouagadougou ');
    await changeInputByPlaceholder(renderer, 'Position nord-sud', '12,365');
    await changeInputByPlaceholder(renderer, 'Position est-ouest', '-1,534');
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
    await changeInputByPlaceholder(renderer, 'Nom du lieu', '<script>');
    await changeInputByPlaceholder(renderer, 'Adresse ou quartier', 'Grand Marche, Ouagadougou');
    await changeInputByPlaceholder(renderer, 'Position nord-sud', '12.365');
    await changeInputByPlaceholder(renderer, 'Position est-ouest', '-1.534');
    await pressByText(renderer, 'Ajouter un lieu');

    expect(mockedCreateSavedPlaceWithApi).not.toHaveBeenCalled();
    expectText(renderer, 'Le lieu contient des caracteres non autorises.');
  });

  it('keeps rider support follow-up discreet inside activity', async () => {
    mockedRestoreRiderSession.mockResolvedValue(buildRiderSession() as never);
    mockedFetchMyTrips.mockResolvedValue(buildRiderTrips() as never);
    mockedGetMySupportTicketsWithApi.mockResolvedValue({
      tickets: [
        {
          id: 'ticket-sensitive-activity-1',
          subject: 'SOS trajet',
          description: 'Signalement prioritaire ouvert pendant le trajet.',
          status: 'OPEN',
          priority: 3,
          adminNote: null,
          createdAt: '2026-04-19T08:00:00.000Z',
        },
      ],
    } as never);

    const renderer = await renderScreen(<ActivityScreen />);
    await pressByLabel(renderer, 'activity-refresh');
    await flushMicrotasks();
    await flushMicrotasks();

    expectText(renderer, 'Activité');
    expectText(renderer, 'Suivi support actif');
    expectText(
      renderer,
      '1 demande(s) en cours. L equipe garde les details de course et vous recontacte si une action est necessaire.',
    );
    expect(collectText(renderer.root)).not.toContain('SOS trajet');
  });

  it('keeps trips usable when rider trip history is partially hydrated', async () => {
    mockedRestoreRiderSession.mockResolvedValue(buildRiderSession() as never);
    mockedFetchMyTrips.mockResolvedValue(buildPartialRiderTrips() as never);

    const renderer = await renderScreen(<TripsScreen />);
    await flushMicrotasks();

    expectText(renderer, 'Mes trajets');
    expectText(renderer, '0 courses au total · 0 terminees');
  });

  it('lets the rider restart a completed trip from history', async () => {
    mockedRestoreRiderSession.mockResolvedValue(buildRiderSession() as never);
    mockedFetchMyTrips.mockResolvedValue({
      role: 'RIDER',
      stats: {
        activeTrips: 0,
        completedTrips: 1,
        cancelledTrips: 0,
        totalAmount: 2700,
        currency: 'XOF',
      },
      pendingRequests: [],
      recentTrips: [
        {
          id: 'trip-repeat-1',
          pickupAddress: 'Tampuy, Ouagadougou',
          destinationAddress: 'Ouaga 2000',
          status: 'COMPLETED',
          amount: 2700,
          currency: 'XOF',
          counterpartyName: 'Issa Driver',
          vehicleLabel: 'Moto',
          receipt: null,
          completedAt: '2026-04-19T08:40:00.000Z',
          createdAt: '2026-04-19T08:00:00.000Z',
        },
      ],
    } as never);

    const renderer = await renderScreen(<TripsScreen />);
    await flushMicrotasks();
    await pressByText(renderer, 'Refaire ce trajet');

    expect(router.push).toHaveBeenCalledWith({
      pathname: '/book',
      params: {
        prefillPickup: 'Tampuy, Ouagadougou',
        prefillDest: 'Ouaga 2000',
      },
    });
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

    expectText(renderer, 'Chauffeur assigné');

    await flushMicrotasks();
    await invokeInAct(async () => {
      riderRealtimeState.eventHandler?.('trip.updated');
    });
    await flushMicrotasks();

    // After realtime update: trip detail should reflect new state
    expectText(renderer, 'Issa Driver');
    expectText(renderer, 'Plaque');
    expectText(renderer, '11 AA 1234');
    expectText(renderer, 'Vehicule');
    expectText(renderer, 'rouge Yamaha Crypton');
    expectText(renderer, 'Telephone');
    expectText(renderer, 'Verifie');
    expectText(renderer, 'Paiement');
    expectText(renderer, 'Mobile Money');
    expectText(
      renderer,
      'Comparez les lignes Nom, Plaque, Vehicule et Paiement ci-dessus. Montez seulement si tout correspond.',
    );
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

  it('opens a contextual rider payment support ticket from activity', async () => {
    mockedRestoreRiderSession.mockResolvedValue(buildRiderSession() as never);
    mockedFetchMyTrips.mockResolvedValue({
      role: 'RIDER',
      stats: {
        activeTrips: 0,
        completedTrips: 4,
        cancelledTrips: 1,
        totalAmount: 18500,
        currency: 'XOF',
      },
      pendingRequests: [],
      recentTrips: [
        {
          id: 'trip-paid-1',
          pickupAddress: 'Patte d Oie',
          destinationAddress: 'Ouaga 2000',
          amount: 2200,
          status: 'COMPLETED',
          createdAt: '2026-04-19T09:00:00.000Z',
          completedAt: '2026-04-19T09:25:00.000Z',
        },
      ],
    } as never);

    const renderer = await renderScreen(<ActivityScreen />);
    await pressByLabel(renderer, 'activity-refresh');
    await flushMicrotasks();
    await pressByLabel(renderer, 'quick-support-payment');

    expect(mockedCreateSupportTicketWithApi).toHaveBeenCalledWith(
      { token: 'rider-auth-client' },
      expect.objectContaining({
        subject: 'Paiement a verifier',
        category: 'payment',
        description: expect.stringContaining('Reference: trip-paid-1'),
      }),
    );
    expectText(
      renderer,
      'Votre demande a été envoyée au support.',
    );
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
    mockedCancelRideRequestWithApi.mockResolvedValue({
      rideRequest: {
        id: 'ride-request-pending-1',
        status: 'CANCELLED',
        pickupAddress: 'Patte d Oie',
        destinationAddress: 'Ouaga 2000',
        updatedAt: '2026-04-19T09:05:00.000Z',
      },
      cancellationPolicy: {
        level: 'WATCH',
        recentCancellationCount: 2,
        feeRisk: false,
        message:
          'Annulation prise en compte. Evitez les annulations repetees pour proteger le temps des chauffeurs.',
        supportTicketId: null,
      },
    } as never);

    const renderer = await renderScreen(<ActivityScreen />);
    await pressByLabel(renderer, 'activity-refresh');
    await flushMicrotasks();
    await pressByText(renderer, 'Annuler');

    expect(mockedCancelRideRequestWithApi).toHaveBeenCalledWith(
      { token: 'rider-auth-client' },
      'ride-request-pending-1',
    );
    expectText(
      renderer,
      'Annulation prise en compte. Evitez les annulations repetees pour proteger le temps des chauffeurs.',
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
      trip: {
        id: 'trip-rider-1',
        status: 'CANCELLED',
        cancellationPolicy: {
          level: 'FEE_RECOMMENDED',
          suggestedFeeAmount: 300,
          driverCompensationAmount: 240,
          currency: 'XOF',
          recentCancellationCount: 1,
          supportTicketId: 'ticket-cancel-fee-1',
          message:
            'Annulation apres chauffeur mobilise. Revue support ouverte: frais suggere 300 XOF, 240 XOF pour proteger le chauffeur si le contexte le confirme.',
        },
      },
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
    expectText(
      renderer,
      'Annulation apres chauffeur mobilise. Revue support ouverte: frais suggere 300 XOF, 240 XOF pour proteger le chauffeur si le contexte le confirme.',
    );
  });

  it('stops an in-progress rider trip and opens the receipt with the adjusted fare', async () => {
    mockedRestoreRiderSession.mockResolvedValue(buildRiderSession() as never);
    mockedFetchMyTrips
      .mockResolvedValueOnce(buildRiderRealtimeHistory('IN_PROGRESS') as never)
      .mockResolvedValueOnce({
        role: 'RIDER',
        stats: {
          activeTrips: 0,
          completedTrips: 5,
          cancelledTrips: 0,
          totalAmount: 20500,
          currency: 'XOF',
        },
        pendingRequests: [],
        recentTrips: [
          {
            id: 'trip-rider-1',
            pickupAddress: 'Universite Joseph Ki-Zerbo',
            destinationAddress: 'Ouaga 2000',
            status: 'COMPLETED',
            amount: 2100,
            currency: 'XOF',
            counterpartyName: 'Issa Driver',
            vehicleLabel: 'Yamaha Crypton',
            completedAt: '2026-04-19T08:18:00.000Z',
            createdAt: '2026-04-19T08:00:00.000Z',
          },
        ],
      } as never);
    mockedFetchTripDetail.mockResolvedValue(
      {
        ...buildTripDetail(['timeline-1'], ['Course demarree']),
        trip: {
          ...buildTripDetail(['timeline-1'], ['Course demarree']).trip,
          status: 'IN_PROGRESS',
        },
      } as never,
    );
    mockedUpdateTripStatusWithApi.mockResolvedValue({
      trip: {
        id: 'trip-rider-1',
        status: 'COMPLETED',
        actualFare: 2100,
      },
    } as never);

    const renderer = await renderScreen(<ActivityScreen />);
    await pressByLabel(renderer, 'activity-refresh');
    await flushMicrotasks();
    await pressByText(renderer, 'Arreter la course');
    const stopOptions = jest.mocked(Alert.alert).mock.calls.at(-1)?.[2] as
      | Array<{ text: string; onPress?: () => void }>
      | undefined;
    await invokeInAct(async () => {
      stopOptions?.find((option) => option.text === 'Arreter et voir le montant')?.onPress?.();
      await flushMicrotasks();
    });

    expect(mockedUpdateTripStatusWithApi).toHaveBeenCalledWith(
      { token: 'rider-auth-client' },
      'trip-rider-1',
      'COMPLETED',
      'Arret demande par le passager',
    );
    expectText(renderer, 'Course terminee. Montant a payer: 2 100 F CFA.');
    expect(router.replace).toHaveBeenCalledWith({
      pathname: '/receipt',
      params: { tripId: 'trip-rider-1' },
    });
  });

  it('lets the rider finalize mobile money payment from receipt before rating', async () => {
    const expoRouter = jest.requireMock('expo-router') as {
      __setLocalSearchParams: (params: Record<string, unknown>) => void;
    };
    expoRouter.__setLocalSearchParams({ tripId: 'trip-rider-1' });

    const unpaidReceipt = {
      ...buildTripDetail(['timeline-1'], ['Course terminee']),
      trip: {
        ...buildTripDetail(['timeline-1'], ['Course terminee']).trip,
        status: 'COMPLETED',
        actualFare: 2500,
        paymentMethod: 'MOBILE_MONEY',
        receipt: null,
        completedAt: '2026-04-19T08:30:00.000Z',
      },
    };
    const paidReceipt = {
      ...unpaidReceipt,
      trip: {
        ...unpaidReceipt.trip,
        receipt: {
          paymentAttemptId: 'payment-1',
          status: 'SUCCEEDED',
          provider: 'PAWAPAY',
          channel: 'MOBILE_MONEY',
          amount: 2500,
          currency: 'XOF',
          transactionRef: 'orbi-payment-1',
          updatedAt: '2026-04-19T08:31:00.000Z',
        },
      },
    };

    mockedRestoreRiderSession.mockResolvedValue({
      authClient: { token: 'rider-auth-client' },
      session: { sessionToken: 'session-rider-1' },
    } as never);
    mockedFetchTripDetail
      .mockResolvedValueOnce(unpaidReceipt as never)
      .mockResolvedValueOnce(paidReceipt as never);
    mockedFetchRiderProfile.mockResolvedValue(buildRiderProfile({
      phoneNumber: '+22670000000',
    }) as never);
    mockedCreateCheckoutIntentWithApi.mockResolvedValue({
      provider: 'PAWAPAY',
      transactionRef: 'orbi-payment-1',
      checkoutMode: 'PUSH_USSD',
      amount: 2500,
      currency: 'XOF',
      channel: 'MOBILE_MONEY',
      supportedMobileMoneyNetworks: ['ORANGE_MONEY'],
      providerMetadata: {},
      trustNotes: {
        providerAbstractionEnabled: true,
        webhookVerificationRequired: true,
        settlementModel: 'aggregator',
      },
    } as never);

    const renderer = await renderScreen(<ReceiptScreen />);
    await flushMicrotasks();

    expectText(renderer, 'Paiement a finaliser');
    expectText(renderer, 'Montant a payer: 2 500 F CFA. Finalisez le paiement avant de quitter le flux.');
    expectText(renderer, 'Finaliser le paiement');
    await pressByText(renderer, 'Finaliser le paiement');
    await flushMicrotasks();

    expect(mockedCreateCheckoutIntentWithApi).toHaveBeenCalledWith(
      { token: 'rider-auth-client' },
      expect.objectContaining({
        rideRequestId: 'ride-request-1',
        channel: 'MOBILE_MONEY',
        amount: 2500,
        customerPhoneNumber: '+22670000000',
      }),
      { idempotencyKey: 'receipt-ride-request-1-mobile-money' },
    );
    expectText(renderer, 'Paiement PAWAPAY initialise. Confirmez la demande sur votre telephone. Ref orbi-payment.');
    expectText(renderer, 'Evaluer ce trajet');
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
        details: "SOS declenche depuis l'application passager.",
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
        'Suivi securise de ma course Orbi: https://orbi-field-api.onrender.com/trips/shared/share-token',
      url: 'https://orbi-field-api.onrender.com/trips/shared/share-token',
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
