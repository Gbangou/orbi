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

const adminRealtimeRoles = new Set(['ADMIN', 'OPS', 'SUPPORT']);
const realtimeEventChannels: ReadonlySet<string> = new Set([
  'trip',
  'ride-request',
  'admin',
]);
const maxRealtimeIdLength = 512;
const maxRealtimeTypeLength = 128;
const maxRealtimeEntityIdLength = 256;
const maxRealtimeActorRoleLength = 64;
const maxRealtimePrincipalIdLength = 256;

export function parseRealtimeEvent(value: unknown): RealtimeEvent | null {
  if (!isRecord(value)) {
    return null;
  }

  if (
    !isBoundedString(value.id, maxRealtimeIdLength) ||
    !isRealtimeEventChannel(value.channel) ||
    !isBoundedString(value.type, maxRealtimeTypeLength) ||
    !isBoundedString(value.entityId, maxRealtimeEntityIdLength) ||
    !isValidIsoDate(value.createdAt)
  ) {
    return null;
  }

  if (
    !isOptionalBoundedString(value.actorRole, maxRealtimeActorRoleLength) ||
    !isOptionalBoundedString(value.riderId, maxRealtimePrincipalIdLength) ||
    !isOptionalBoundedString(value.driverId, maxRealtimePrincipalIdLength) ||
    !isOptionalRecord(value.payload)
  ) {
    return null;
  }

  return {
    id: value.id,
    channel: value.channel,
    type: value.type,
    entityId: value.entityId,
    actorRole: value.actorRole,
    riderId: value.riderId,
    driverId: value.driverId,
    payload: value.payload,
    createdAt: value.createdAt,
  };
}

export function canReceiveRealtimeEvent(
  event: RealtimeEvent,
  filterOptions: RealtimeEventFilter,
) {
  const role = filterOptions.role.toUpperCase();

  if (adminRealtimeRoles.has(role)) {
    return true;
  }

  if (event.channel === 'admin') {
    return false;
  }

  if (role === 'RIDER') {
    return Boolean(
      filterOptions.riderId && event.riderId === filterOptions.riderId,
    );
  }

  if (role === 'DRIVER') {
    if (event.driverId) {
      return event.driverId === filterOptions.driverId;
    }

    return event.channel === 'ride-request';
  }

  return false;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isRealtimeEventChannel(value: unknown): value is RealtimeEventChannel {
  return typeof value === 'string' && realtimeEventChannels.has(value);
}

function isBoundedString(value: unknown, maxLength: number): value is string {
  return (
    typeof value === 'string' && value.length > 0 && value.length <= maxLength
  );
}

function isOptionalBoundedString(
  value: unknown,
  maxLength: number,
): value is string | undefined {
  return value === undefined || isBoundedString(value, maxLength);
}

function isOptionalRecord(
  value: unknown,
): value is Record<string, unknown> | undefined {
  return value === undefined || isRecord(value);
}

function isValidIsoDate(value: unknown): value is string {
  return (
    isBoundedString(value, 64) &&
    /^\d{4}-\d{2}-\d{2}T/.test(value) &&
    !Number.isNaN(Date.parse(value))
  );
}
