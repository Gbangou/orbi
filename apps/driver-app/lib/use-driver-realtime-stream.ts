import { resolveOrbiApiBaseUrlForRuntime } from '@orbi/config';
import {
  type RealtimeStatusCallbacks,
  useWebSocketRealtimeStream,
} from '@orbi/ui/native';

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
  let wsBase: string;
  if (baseUrl.startsWith('https://')) {
    wsBase = 'wss://' + baseUrl.slice('https://'.length);
  } else if (baseUrl.startsWith('http://')) {
    wsBase = 'ws://' + baseUrl.slice('http://'.length);
  } else {
    wsBase = baseUrl;
  }
  return `${wsBase}/api/v1/realtime/ws?token=${encodeURIComponent(sessionToken)}`;
}

export function useDriverRealtimeStream(
  sessionToken: string | null,
  driverProfileId: string | null,
  onRealtimeUpdate: (eventType: string) => void,
  callbacks?: RealtimeStatusCallbacks,
) {
  const baseUrl = resolveOrbiApiBaseUrlForRuntime();
  const wsUrl = sessionToken ? buildWsUrl(baseUrl, sessionToken) : null;

  useWebSocketRealtimeStream(
    wsUrl,
    sessionToken,
    { role: 'driver', driverId: driverProfileId },
    {
      eventTypes: DRIVER_REALTIME_EVENTS,
      onRealtimeUpdate,
      callbacks,
      coalesceWindowMs: 350,
    },
  );
}
