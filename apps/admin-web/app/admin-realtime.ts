'use client';

export const adminRealtimeEventTypes = [
  'trip.created',
  'trip.updated',
  'trip.pickup-code-verified',
  'trip.incident-reported',
  'trip.sos-triggered',
  'trip.share-link-created',
  'trip.route-monitor-alert',
  'trip.route-position',
  'mobile.error-reports-submitted',
  'support-ticket.updated',
  'driver-onboarding.review-updated',
  'payment-attempt.provider-verified',
  'payment-attempt.refund-requested',
  'payment-attempt.refunded',
  'ride-request.created',
  'ride-request.cancelled',
  'system.health-alert',
  'system.health-recovered',
  'system.health-incident-acknowledged',
  'system.health-incident-muted',
  'system.launch-readiness-action-acknowledged',
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
