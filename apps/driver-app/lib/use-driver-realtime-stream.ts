import { buildRealtimeStreamUrl, createMobilisApiClient } from '@mobilis/api';
import {
  mobilisRuntimeConfig,
  resolveMobilisApiBaseUrlForRuntime,
} from '@mobilis/config';
import {
  useRealtimeEventStream,
  type RealtimeStatusCallbacks,
} from '@mobilis/ui/src/use-realtime-event-stream';

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
      const client = createMobilisApiClient(
        resolveMobilisApiBaseUrlForRuntime(),
        {
          version: mobilisRuntimeConfig.apiVersion,
        },
      );

      return buildRealtimeStreamUrl(client, token);
    },
  });
}
