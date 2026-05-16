import type { MessageEvent } from '@nestjs/common';
import type { Observable } from 'rxjs';

export type RealtimeEventChannel = 'trip' | 'ride-request' | 'admin';

export type RealtimeEvent = {
  id: string;
  channel: RealtimeEventChannel;
  type: string;
  entityId: string;
  actorRole?: string;
  riderId?: string;
  driverId?: string;
  payload?: Record<string, unknown>;
  createdAt: string;
};

export type RealtimeEventFilter = {
  role: string;
  actorId?: string | null;
  riderId?: string | null;
  driverId?: string | null;
  sessionExpiresAt?: Date | null;
};

export type RealtimeTransport = {
  publish(event: RealtimeEvent): void;
  stream(filterOptions: RealtimeEventFilter): Observable<MessageEvent>;
  snapshot(): {
    adapter: string;
    sharedBackplane: boolean;
    degraded: boolean;
    degradeReason: string | null;
    activeStreams: number;
    publishedEvents: number;
    featureFlagMode?: string;
    featureFlagEnabled?: boolean;
  };
};

export const REALTIME_TRANSPORT = Symbol('REALTIME_TRANSPORT');
