import type { MyTripsResponse } from '@orbi/api';

export const fallbackRiderTrips: MyTripsResponse = {
  role: 'RIDER',
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

function objectOrNull(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : null;
}

function numberOrFallback(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function stringOrFallback(value: unknown, fallback: string) {
  return typeof value === 'string' ? value : fallback;
}

export function normalizeRiderTripsResponse(response: unknown): MyTripsResponse {
  const input = objectOrNull(response);
  const stats = objectOrNull(input?.stats);
  const fallbackStats = fallbackRiderTrips.stats;

  return {
    role: input?.role === 'RIDER' ? input.role : fallbackRiderTrips.role,
    stats: {
      activeTrips: numberOrFallback(stats?.activeTrips, fallbackStats.activeTrips),
      completedTrips: numberOrFallback(
        stats?.completedTrips,
        fallbackStats.completedTrips,
      ),
      cancelledTrips: numberOrFallback(
        stats?.cancelledTrips,
        fallbackStats.cancelledTrips,
      ),
      totalAmount: numberOrFallback(stats?.totalAmount, fallbackStats.totalAmount),
      currency: stringOrFallback(stats?.currency, fallbackStats.currency),
    },
    pendingRequests: Array.isArray(input?.pendingRequests)
      ? input.pendingRequests
      : fallbackRiderTrips.pendingRequests,
    recentTrips: Array.isArray(input?.recentTrips)
      ? input.recentTrips
      : fallbackRiderTrips.recentTrips,
  };
}
