import { resolveOrbiApiBaseUrlForRuntime } from '@orbi/config';
import { type RealtimeStatusCallbacks } from '@orbi/ui/src/use-realtime-event-stream';
import { useWebSocketRealtimeStream } from '@orbi/ui/src/use-websocket-realtime-stream';

const DRIVER_REALTIME_EVENTS = [
  'trip.created',
  'trip.updated',
  'trip.pickup-code-verified',
  'trip.incident-reported',
  'trip.route-monitor-alert',
  'ride-request.created',
  'ride-request.cancelled',
  'ride-request.reservation-assigned',
  'ride-request.reservation-released',
  'ride-request.reservation-expired',
] as const;

function buildWsUrl(baseUrl: string, sessionToken: string): string {
  const wsBase = baseUrl.replace(/^https?/, (s) => (s === 'https' ? 'wss' : 'ws'));
  return `${wsBase}/api/v1/realtime/ws?token=${encodeURIComponent(sessionToken)}`;
}

export function useDriverRealtimeStream(
  sessionToken: string | null,
  onRealtimeUpdate: (eventType: string) => void,
  callbacks?: RealtimeStatusCallbacks,
) {
  const baseUrl = resolveOrbiApiBaseUrlForRuntime();
  const wsUrl = sessionToken ? buildWsUrl(baseUrl, sessionToken) : null;

  useWebSocketRealtimeStream(
    wsUrl,
    sessionToken,
    { role: 'driver' },
    {
      eventTypes: DRIVER_REALTIME_EVENTS,
      onRealtimeUpdate,
      callbacks,
      coalesceWindowMs: 350,
    },
  );
}
