'use client';

export const adminRealtimeEventTypes = [
  'trip.created',
  'trip.updated',
  'trip.pickup-code-verified',
  'trip.incident-reported',
  'support-ticket.updated',
  'driver-onboarding.review-updated',
  'ride-request.created',
  'ride-request.cancelled',
  'system.health-alert',
  'system.health-recovered',
  'system.health-incident-acknowledged',
  'system.health-incident-muted',
  'heartbeat',
] as const;

export function subscribeToAdminRealtime(
  handlers: Partial<Record<(typeof adminRealtimeEventTypes)[number], () => void>>,
) {
  const stream = new EventSource('/api/admin/live');

  for (const eventType of adminRealtimeEventTypes) {
    const handler = handlers[eventType];

    if (handler) {
      stream.addEventListener(eventType, handler);
    }
  }

  return stream;
}
