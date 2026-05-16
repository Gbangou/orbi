import { buildRealtimeStreamUrl, createOrbiApiClient } from '@orbi/api';
import {
  orbiRuntimeConfig,
  resolveOrbiApiBaseUrlForRuntime,
} from '@orbi/config';
import {
  useRealtimeEventStream,
  type RealtimeStatusCallbacks,
} from '@orbi/ui/src/use-realtime-event-stream';

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

export function useDriverRealtimeStream(
  sessionToken: string | null,
  onRealtimeUpdate: (eventType: string) => void,
  callbacks?: RealtimeStatusCallbacks,
) {
  useRealtimeEventStream(sessionToken, {
    eventTypes: DRIVER_REALTIME_EVENTS,
    onRealtimeUpdate,
    callbacks,
    coalesceWindowMs: 350,
    buildStreamUrl: (token) => {
      const client = createOrbiApiClient(
        resolveOrbiApiBaseUrlForRuntime(),
        {
          version: orbiRuntimeConfig.apiVersion,
        },
      );

      return buildRealtimeStreamUrl(client, token);
    },
  });
}
