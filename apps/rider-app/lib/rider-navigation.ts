import type { MyTripsResponse } from '@orbi/api';
import { resolveRiderActiveFlow } from './rider-active-flow';

export type RiderNavigationZone =
  | 'splash'
  | 'auth'
  | 'onboarding'
  | 'main'
  | 'active-trip'
  | 'modal'
  | 'support'
  | 'not-found';

export type RiderNavigationBackendState =
  | {
      status: 'unknown' | 'unavailable';
    }
  | {
      status: 'no-active-flow';
    }
  | {
      status: 'active-flow';
      flowKind: 'trip' | 'request';
      flowId: string;
    }
  | {
      status: 'completed-trip';
      tripId: string;
    };

export type RiderNavigationDecision = {
  action: 'allow' | 'replace';
  targetPath: string | null;
  reason:
    | 'pending'
    | 'public-route'
    | 'session-required'
    | 'session-restored'
    | 'invalid-deep-link'
    | 'active-flow-restored'
    | 'incompatible-active-flow-route'
    | 'completed-trip-receipt'
    | 'missing-required-param'
    | 'safe-main-route';
};

export type RiderNavigationInput = {
  pathname: string | null | undefined;
  hasSession: boolean;
  backendState: RiderNavigationBackendState;
  params?: Record<string, string | string[] | undefined>;
};

const routeZones: Record<string, RiderNavigationZone> = {
  '/': 'splash',
  '/auth': 'auth',
  '/home': 'main',
  '/book': 'main',
  '/activity': 'active-trip',
  '/trips': 'main',
  '/account': 'support',
  '/receipt': 'modal',
  '/rating': 'modal',
  '/(tabs)/home': 'main',
  '/(tabs)/activity': 'active-trip',
  '/(tabs)/trips': 'main',
  '/(tabs)/account': 'support',
};

const activeFlowAllowedPaths = new Set([
  '/activity',
  '/(tabs)/activity',
  '/account',
  '/(tabs)/account',
]);

export function inventoryRiderNavigators() {
  return [
    {
      name: 'root-stack',
      file: 'apps/rider-app/app/_layout.tsx',
      purpose: 'Auth, crash boundary, notifications, deep-link guard, active-flow restore.',
    },
    {
      name: 'tabs',
      file: 'apps/rider-app/app/(tabs)/_layout.tsx',
      purpose: 'Main authenticated rider surfaces: home, activity, trips, account/support.',
    },
    {
      name: 'modal-stack-screens',
      file: 'apps/rider-app/app/receipt.tsx, apps/rider-app/app/rating.tsx',
      purpose: 'Post-trip receipt and rating, guarded by tripId.',
    },
  ];
}

export function resolveRiderBackendNavigationState(
  history: MyTripsResponse | null | undefined,
): RiderNavigationBackendState {
  const flow = resolveRiderActiveFlow(history);

  if (flow.activeTrip) {
    return {
      status: 'active-flow',
      flowKind: 'trip',
      flowId: flow.activeTrip.id,
    };
  }

  if (flow.activeRequest) {
    return {
      status: 'active-flow',
      flowKind: 'request',
      flowId: flow.activeRequest.id,
    };
  }

  const justCompleted = history?.recentTrips?.find(
    (trip) => trip.status === 'COMPLETED',
  );

  if (justCompleted) {
    return {
      status: 'completed-trip',
      tripId: justCompleted.id,
    };
  }

  return { status: 'no-active-flow' };
}

export function resolveRiderNavigationDecision(
  input: RiderNavigationInput,
): RiderNavigationDecision {
  const pathname = normalizeRiderPathname(input.pathname);
  const zone = routeZones[pathname] ?? 'not-found';

  if (zone === 'not-found') {
    return replace(
      input.hasSession ? '/home' : '/auth',
      'invalid-deep-link',
    );
  }

  if (!input.hasSession) {
    if (zone === 'auth' || zone === 'splash') {
      return allow('public-route');
    }

    return replace('/auth', 'session-required');
  }

  if (zone === 'auth' || zone === 'splash') {
    return replace(resolveAuthenticatedLanding(input.backendState), 'session-restored');
  }

  if (input.backendState.status === 'active-flow') {
    if (!activeFlowAllowedPaths.has(pathname)) {
      return replace('/activity', 'incompatible-active-flow-route');
    }

    return allow('active-flow-restored');
  }

  if (zone === 'modal') {
    if (!hasRequiredTripId(input.params)) {
      return replace('/home', 'missing-required-param');
    }

    return allow('safe-main-route');
  }

  if (input.backendState.status === 'completed-trip' && pathname === '/activity') {
    return replace(
      `/receipt?tripId=${encodeURIComponent(input.backendState.tripId)}`,
      'completed-trip-receipt',
    );
  }

  return allow('safe-main-route');
}

export function resolveRiderNotificationTarget(input: {
  type?: string | null;
  tripId?: string | null;
  hasSession: boolean;
}) {
  if (!input.hasSession) {
    return '/auth';
  }

  if (input.type === 'trip_matched' || input.type === 'driver_arriving') {
    return '/activity';
  }

  if (input.type === 'trip_completed' && input.tripId && isSafeRouteParam(input.tripId)) {
    return `/receipt?tripId=${encodeURIComponent(input.tripId)}`;
  }

  return '/home';
}

export function normalizeRiderPathname(pathname: string | null | undefined) {
  if (!pathname) {
    return '/';
  }

  const path = pathname.split('?')[0]?.replace(/\/+$/, '') || '/';
  return path === '/index' ? '/' : path;
}

function resolveAuthenticatedLanding(state: RiderNavigationBackendState) {
  if (state.status === 'active-flow') {
    return '/activity';
  }

  if (state.status === 'completed-trip') {
    return `/receipt?tripId=${encodeURIComponent(state.tripId)}`;
  }

  return '/home';
}

function hasRequiredTripId(params: RiderNavigationInput['params']) {
  const value = params?.tripId;
  const tripId = Array.isArray(value) ? value[0] : value;
  return Boolean(tripId && isSafeRouteParam(tripId));
}

function isSafeRouteParam(value: string) {
  return /^[a-z0-9._:-]{1,96}$/i.test(value);
}

function allow(reason: RiderNavigationDecision['reason']): RiderNavigationDecision {
  return {
    action: 'allow',
    targetPath: null,
    reason,
  };
}

function replace(
  targetPath: string,
  reason: RiderNavigationDecision['reason'],
): RiderNavigationDecision {
  return {
    action: 'replace',
    targetPath,
    reason,
  };
}
