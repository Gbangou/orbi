import React from 'react';
import { router } from 'expo-router';
import {
  createTripShareLinkWithApi,
  fetchMyTrips,
  fetchRiderProfile,
} from '@orbi/api';
import RiderHomeScreen from '../app/(tabs)/home';
import { restoreRiderSession } from '../lib/auth';
import { resolveRiderAppError } from '../lib/session-feedback';
import { useRiderPosition } from '../lib/use-rider-position';
import {
  collectText,
  expectText,
  flushMicrotasks,
  pressByLabel,
  pressByText,
  renderScreen,
} from '../../../scripts/testing/mobile/test-utils';

jest.mock('../lib/home-map-view', () => ({
  HomeMapView: 'HomeMapView',
}));

jest.mock('../lib/use-live-refresh', () => ({
  useLiveRefresh: jest.fn(),
}));

jest.mock('../lib/use-rider-realtime-stream', () => ({
  useRiderRealtimeStream: jest.fn(),
}));

jest.mock('../lib/use-rider-position', () => ({
  useRiderPosition: jest.fn(),
}));

jest.mock('../lib/auth', () => ({
  restoreRiderSession: jest.fn(),
}));

jest.mock('../lib/session-feedback', () => ({
  resolveRiderAppError: jest.fn(),
}));

jest.mock('@orbi/api', () => {
  const actual = jest.requireActual('@orbi/api');

  return {
    ...actual,
    createTripShareLinkWithApi: jest.fn(),
    fetchMyTrips: jest.fn(),
    fetchRiderProfile: jest.fn(),
  };
});

const mockedRestoreRiderSession = jest.mocked(restoreRiderSession);
const mockedFetchMyTrips = jest.mocked(fetchMyTrips);
const mockedFetchRiderProfile = jest.mocked(fetchRiderProfile);
const mockedCreateTripShareLinkWithApi = jest.mocked(createTripShareLinkWithApi);
const mockedResolveRiderAppError = jest.mocked(resolveRiderAppError);
const mockedUseRiderPosition = jest.mocked(useRiderPosition);

function buildSession() {
  return {
    authClient: { token: 'rider-auth-client' },
    session: { sessionToken: 'rider-session-token' },
  };
}

function buildProfile() {
  return {
    profile: {
      id: 'rider-1',
      fullName: 'Awa Ouedraogo',
      email: 'awa@orbi.app',
      phoneNumber: '+22670000000',
      preferredTier: 'MOTO_STANDARD',
      emergencyPhone: null,
      trustedContact: null,
      trustedContacts: [],
      savedPlaces: [
        {
          id: 'saved-home',
          label: 'Maison',
          address: 'Patte d Oie, Ouagadougou',
          latitude: 12.3412,
          longitude: -1.5601,
        },
        {
          id: 'saved-work',
          label: 'Travail',
          address: 'Koulouba, Ouagadougou',
          latitude: 12.3716,
          longitude: -1.5235,
        },
      ],
      stats: {
        totalRideRequests: 4,
        totalTrips: 3,
        completedTrips: 3,
        savedPlaces: 2,
      },
    },
  };
}

function buildTrips(overrides: Partial<ReturnType<typeof baseTrips>> = {}) {
  return {
    ...baseTrips(),
    ...overrides,
  };
}

function baseTrips() {
  return {
    role: 'RIDER' as const,
    stats: {
      activeTrips: 0,
      completedTrips: 0,
      cancelledTrips: 0,
      totalAmount: 0,
      currency: 'XOF',
    },
    pendingRequests: [],
    recentTrips: [],
  };
}

function setPosition(overrides: Partial<ReturnType<typeof defaultPosition>>) {
  mockedUseRiderPosition.mockReturnValue({
    ...defaultPosition(),
    ...overrides,
  });
}

function defaultPosition() {
  return {
    latestPosition: null,
    positionNote: 'Position passager en attente.',
    positionStatus: 'idle' as const,
  };
}

async function renderHome() {
  const renderer = await renderScreen(<RiderHomeScreen />);
  await flushMicrotasks();
  return renderer;
}

beforeEach(() => {
  mockedRestoreRiderSession.mockResolvedValue(buildSession() as never);
  mockedFetchMyTrips.mockResolvedValue(buildTrips() as never);
  mockedFetchRiderProfile.mockResolvedValue(buildProfile() as never);
  mockedCreateTripShareLinkWithApi.mockResolvedValue({
    share: {
      path: '/trips/shared/share-token',
    },
  } as never);
  mockedResolveRiderAppError.mockResolvedValue({
    message: "L'accueil n'a pas pu etre actualise.",
    actionLabel: 'Reessayer',
    shouldClearSessionToken: false,
    code: 'MOB-GENERIC-API',
  });
  setPosition({});
});

describe('RiderHomeScreen', () => {
  it('shows understandable location, destination, favorites and empty recents', async () => {
    setPosition({
      latestPosition: {
        latitude: 12.34,
        longitude: -1.53,
        accuracyMeters: 24,
      },
      positionStatus: 'live',
    });

    const renderer = await renderHome();
    const text = collectText(renderer.root);

    expectText(renderer, 'Position actuelle');
    expectText(renderer, 'Autour de votre position');
    expectText(renderer, 'Où allez-vous ?');
    expectText(renderer, 'Domicile');
    expectText(renderer, 'Travail');
    expectText(renderer, 'Aucune destination récente');
    expect(text).not.toMatch(/12\.34|-1\.53|\bsocket\b|\bbackend\b|\bjson\b|\bapi\b|\benum\b/i);
  });

  it('handles refused location without blocking destination choice', async () => {
    setPosition({ positionStatus: 'permission-denied' });

    const renderer = await renderHome();

    expectText(renderer, 'Localisation non autorisée');
    expectText(renderer, 'Vous pouvez saisir votre point de départ manuellement.');

    await pressByLabel(renderer, 'Choisir une destination');
    expect(router.push).toHaveBeenCalledWith('/book');
  });

  it('shows GPS unavailable and imprecise address states in plain French', async () => {
    setPosition({ positionStatus: 'unavailable' });
    const unavailableRenderer = await renderHome();
    expectText(unavailableRenderer, 'GPS indisponible');

    setPosition({
      latestPosition: {
        latitude: 12.34,
        longitude: -1.53,
        accuracyMeters: 140,
      },
      positionStatus: 'live',
    });
    const impreciseRenderer = await renderHome();
    expectText(impreciseRenderer, 'Adresse approximative');
    expectText(impreciseRenderer, 'Vérifiez le point de départ avant de confirmer.');
  });

  it('lists recent destinations from real trip history', async () => {
    mockedFetchMyTrips.mockResolvedValue(
      buildTrips({
        recentTrips: [
          {
            id: 'trip-1',
            pickupAddress: 'Gounghin',
            destinationAddress: 'Ouaga 2000',
            status: 'COMPLETED',
            amount: 2500,
            currency: 'XOF',
            createdAt: '2026-08-10T08:00:00.000Z',
            completedAt: '2026-08-10T08:20:00.000Z',
          },
        ],
      }) as never,
    );

    const renderer = await renderHome();

    expectText(renderer, 'Destinations récentes');
    expectText(renderer, 'Ouaga 2000');
    expect(collectText(renderer.root)).not.toContain('Aucune destination récente');
  });

  it('lets the rider resume an active trip immediately', async () => {
    mockedFetchMyTrips.mockResolvedValue(
      buildTrips({
        recentTrips: [
          {
            id: 'trip-active-1',
            pickupAddress: 'Université Joseph Ki-Zerbo',
            destinationAddress: 'Ouaga 2000',
            status: 'IN_PROGRESS',
            amount: 2500,
            currency: 'XOF',
            counterpartyName: 'Issa Driver',
            createdAt: '2026-08-10T08:00:00.000Z',
            completedAt: null,
          },
        ],
      }) as never,
    );

    const renderer = await renderHome();

    expectText(renderer, 'Trajet actif');
    expectText(renderer, 'Reprendre');
    await pressByText(renderer, 'Reprendre');
    expect(router.push).toHaveBeenCalledWith('/activity');
  });

  it('shows a useful offline/backend error without raw technical content', async () => {
    mockedRestoreRiderSession.mockRejectedValue(new TypeError('Network request failed'));
    mockedResolveRiderAppError.mockResolvedValue({
      message: 'Connexion lente. Reessayez dans un instant.',
      actionLabel: 'Reessayer',
      shouldClearSessionToken: false,
      code: 'MOB-NETWORK-OFFLINE',
    });

    const renderer = await renderHome();
    const text = collectText(renderer.root);

    expectText(
      renderer,
      'Connexion absente. Vous pouvez choisir une destination, Orbi reprendra ensuite.',
    );
    expect(text).not.toMatch(/Network request failed|MOB-NETWORK|backend|stack|json/i);
  });
});
