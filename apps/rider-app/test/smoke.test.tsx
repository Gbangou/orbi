/// <reference path="../../backend/node_modules/@types/jest/index.d.ts" />
import React from 'react';
import { router } from 'expo-router';
import {
  createMobilisApiClient,
  cancelRideRequestWithApi,
  createCheckoutIntentWithApi,
  createRideRequestWithApi,
  createTripShareLinkWithApi,
  fetchMyTrips,
  fetchRideOptionsPreview,
  fetchRiderProfile,
  fetchTripDetail,
  reportTripIncidentWithApi,
  resolveVoiceLocationIntentWithApi,
  riderRideOptions,
  triggerTripSafetySosWithApi,
  updateTrustedContactWithApi,
  updateTripStatusWithApi,
} from '@mobilis/api';
import {
  restoreRiderSession,
  signInRiderAccount,
  signOutRiderAccount,
} from '../lib/auth';
import { resolveRiderAppError } from '../lib/session-feedback';
import AccountScreen from '../app/account';
import ActivityScreen from '../app/activity';
import RiderAuthScreen from '../app/auth';
import RiderHomeScreen from '../app/home';
import BookingScreen from '../app/book';
import VoiceScreen from '../app/voice';
import {
  expectText,
  flushMicrotasks,
  changeInputByPlaceholder,
  invokeInAct,
  pressByText,
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

jest.mock('@mobilis/api', () => {
  const actual = jest.requireActual('@mobilis/api');

  return {
    ...actual,
    createMobilisApiClient: jest.fn(() => ({ kind: 'mock-client' })),
    cancelRideRequestWithApi: jest.fn(),
    fetchRideOptionsPreview: jest.fn(),
    fetchMyTrips: jest.fn(),
    fetchRiderProfile: jest.fn(),
    fetchTripDetail: jest.fn(),
    reportTripIncidentWithApi: jest.fn(),
    triggerTripSafetySosWithApi: jest.fn(),
    resolveVoiceLocationIntentWithApi: jest.fn(),
    createRideRequestWithApi: jest.fn(),
    createTripShareLinkWithApi: jest.fn(),
    createCheckoutIntentWithApi: jest.fn(),
    updateTrustedContactWithApi: jest.fn(),
    updateTripStatusWithApi: jest.fn(),
  };
});

const mockedSignInRiderAccount = jest.mocked(signInRiderAccount);
const mockedRestoreRiderSession = jest.mocked(restoreRiderSession);
const mockedSignOutRiderAccount = jest.mocked(signOutRiderAccount);
const mockedCancelRideRequestWithApi = jest.mocked(cancelRideRequestWithApi);
const mockedFetchRideOptionsPreview = jest.mocked(fetchRideOptionsPreview);
const mockedFetchMyTrips = jest.mocked(fetchMyTrips);
const mockedFetchRiderProfile = jest.mocked(fetchRiderProfile);
const mockedFetchTripDetail = jest.mocked(fetchTripDetail);
const mockedReportTripIncidentWithApi = jest.mocked(reportTripIncidentWithApi);
const mockedTriggerTripSafetySosWithApi = jest.mocked(triggerTripSafetySosWithApi);
const mockedResolveVoiceLocationIntentWithApi = jest.mocked(resolveVoiceLocationIntentWithApi);
const mockedCreateRideRequestWithApi = jest.mocked(createRideRequestWithApi);
const mockedCreateTripShareLinkWithApi = jest.mocked(createTripShareLinkWithApi);
const mockedCreateCheckoutIntentWithApi = jest.mocked(createCheckoutIntentWithApi);
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
      email: 'rider@mobilis.app',
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
  mockedFetchRideOptionsPreview.mockReset();
  mockedFetchMyTrips.mockReset();
  mockedFetchRiderProfile.mockReset();
  mockedFetchTripDetail.mockReset();
  mockedReportTripIncidentWithApi.mockReset();
  mockedTriggerTripSafetySosWithApi.mockReset();
  mockedResolveVoiceLocationIntentWithApi.mockReset();
  mockedCreateRideRequestWithApi.mockReset();
  mockedCreateTripShareLinkWithApi.mockReset();
  mockedCreateCheckoutIntentWithApi.mockReset();
  mockedUpdateTrustedContactWithApi.mockReset();
  mockedUpdateTripStatusWithApi.mockReset();
  mockedResolveRiderAppError.mockReset();

  jest.mocked(createMobilisApiClient).mockReturnValue({ kind: 'mock-client' } as never);
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

    await pressByText(renderer, 'Se connecter');

    expect(mockedSignInRiderAccount).toHaveBeenCalledWith({
      email: 'rider@mobilis.app',
      password: 'Mobilis123!',
    });
    expect(router.replace).toHaveBeenCalledWith('/home');
    expectText(renderer, 'Session passager active.');
  });

  it('surfaces a network-specific auth message', async () => {
    mockedSignInRiderAccount.mockRejectedValue(new TypeError('Network request failed'));

    const renderer = await renderScreen(<RiderAuthScreen />);

    await pressByText(renderer, 'Se connecter');

    expect(router.replace).not.toHaveBeenCalled();
    expectText(
      renderer,
      'Connexion reseau indisponible. Verifiez le backend avant de relancer la session passager.',
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
    await pressByText(renderer, 'Actualiser les donnees');

    expectText(renderer, 'Connecte comme Awa Ouedraogo. 2 options tarifees disponibles.');
    expectText(renderer, 'Ouvrir la reservation');
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
    await pressByText(renderer, `Confirmer ${riderRideOptions[0]?.title}`);
    await flushMicrotasks();

    expect(mockedCreateRideRequestWithApi).toHaveBeenCalledWith(
      { token: 'rider-auth-client' },
      expect.objectContaining({
        pickupAddress: 'Gare Routiere de Bobo-Dioulasso',
        destinationAddress: 'Sarfalao, Bobo-Dioulasso',
        paymentMethod: 'MOBILE_MONEY',
        pickupAreaType: 'URBAN_EDGE',
        city: 'BOBO_DIOULASSO',
        districtProfile: 'MARKET_DENSE',
      }),
    );
    expect(mockedCreateCheckoutIntentWithApi).toHaveBeenCalledWith(
      { token: 'rider-auth-client' },
      expect.objectContaining({
        rideRequestId: 'ride-request-12345678',
        channel: 'MOBILE_MONEY',
        mobileMoneyNetwork: 'ORANGE_MONEY',
        redirectUrl: 'http://localhost:8081/book',
      }),
      {
        idempotencyKey: 'checkout-ride-request-12345678-mobile-money',
      },
    );
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

    expectText(renderer, 'Flux actif');
    expectText(renderer, 'Suivre le flux actif');
    expectText(renderer, 'Demande deja en cours');
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

    expectText(renderer, 'Profil local de secours affiche en attendant la connexion API.');
    expectText(renderer, 'Awa Ouedraogo');
    expectText(renderer, 'Maison');
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
    await pressByText(renderer, 'Se deconnecter');

    expect(mockedSignOutRiderAccount).toHaveBeenCalled();
    expect(router.replace).toHaveBeenCalledWith('/auth');
  });

  it('shows the active rider flow inside account', async () => {
    mockedRestoreRiderSession.mockResolvedValue(buildRiderSession() as never);
    mockedFetchRiderProfile.mockResolvedValue(buildRiderProfile() as never);
    mockedFetchMyTrips.mockResolvedValue(buildRiderRealtimeHistory('MATCHED') as never);

    const renderer = await renderScreen(<AccountScreen />);
    await flushMicrotasks();

    expectText(renderer, 'Profil charge. Course MATCHED en cours.');
    expectText(renderer, 'Flux actif');
    expectText(renderer, 'Matched');
    expectText(renderer, 'Reservation active: Matched - Universite Joseph Ki-Zerbo vers Ouaga 2000');
  });

  it('updates the rider trusted contact from account', async () => {
    mockedRestoreRiderSession.mockResolvedValue(buildRiderSession() as never);
    mockedFetchRiderProfile.mockResolvedValue(buildRiderProfile() as never);
    mockedFetchMyTrips.mockResolvedValue(buildRiderTrips() as never);

    const renderer = await renderScreen(<AccountScreen />);
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

  it('shows the active rider flow inside voice', async () => {
    mockedRestoreRiderSession.mockResolvedValue(buildRiderSession() as never);
    mockedFetchMyTrips.mockResolvedValue(buildRiderPendingRequestHistory('REQUESTED') as never);

    const renderer = await renderScreen(<VoiceScreen />);
    await flushMicrotasks();

    expect(mockedResolveVoiceLocationIntentWithApi).toHaveBeenCalled();
    expectText(renderer, 'Flux actif');
    expectText(renderer, 'Requested');
    expectText(renderer, 'Reservation active: Requested - Universite Joseph Ki-Zerbo vers Ouaga 2000');
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
    await pressByText(renderer, 'Actualiser le suivi');

    expectText(renderer, 'Historique charge depuis le flux protege.');
    expectText(renderer, 'MATCHED');

    await flushMicrotasks();
    await invokeInAct(async () => {
      riderRealtimeState.eventHandler?.('trip.updated');
    });
    await flushMicrotasks();

    expectText(renderer, 'Changement critique: Driver Arriving.');
    expectText(renderer, 'Le chauffeur arrive');
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
    await pressByText(renderer, 'Actualiser le suivi');
    await pressByText(renderer, 'Annuler cette demande');

    expect(mockedCancelRideRequestWithApi).toHaveBeenCalledWith(
      { token: 'rider-auth-client' },
      'ride-request-pending-1',
    );
    expectText(renderer, 'Demandes actives: 0');
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
    await pressByText(renderer, 'Actualiser le suivi');
    await pressByText(renderer, 'Annuler avant depart');

    expect(mockedUpdateTripStatusWithApi).toHaveBeenCalledWith(
      { token: 'rider-auth-client' },
      'trip-rider-1',
      'CANCELLED',
    );
    expectText(renderer, 'Etat principal: Aucun flux actif');
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
    await pressByText(renderer, 'Actualiser le suivi');
    await pressByText(renderer, 'Signaler un incident');

    expect(mockedReportTripIncidentWithApi).toHaveBeenCalledWith(
      { token: 'rider-auth-client' },
      'trip-rider-1',
      expect.objectContaining({
        incidentType: 'SAFETY_ALERT',
        priority: 3,
      }),
    );
    expectText(renderer, 'Course active');
  });
});
