import type { TripStatus, UserRole } from '@prisma/client';
import {
  activeRideRequestLifecycleStatuses,
  activeTripLifecycleStatuses,
  allowedTripLifecycleTransitions,
  pickupCodeVisibleTripLifecycleStatuses,
} from '@mobilis/domain';

export const ACTIVE_TRIP_STATUSES: TripStatus[] = [
  ...activeTripLifecycleStatuses,
] satisfies TripStatus[];
export const PICKUP_CODE_VISIBLE_STATUSES: TripStatus[] = [
  ...pickupCodeVisibleTripLifecycleStatuses,
] satisfies TripStatus[];
export const ACTIVE_RIDE_REQUEST_STATUSES = activeRideRequestLifecycleStatuses;

export const TRIP_EVENT_LABELS: Record<string, string> = {
  PICKUP_CODE_ISSUED: 'Code de prise en charge genere',
  PICKUP_CODE_VERIFIED: 'Code de prise en charge verifie',
  TRIP_ACCEPTED: 'Course acceptee par le chauffeur',
  DRIVER_ARRIVING: 'Chauffeur arrive au point de prise en charge',
  TRIP_STARTED: 'Course demarree',
  TRIP_COMPLETED: 'Course terminee',
  TRIP_CANCELLED: 'Course annulee',
  INCIDENT_REPORTED: 'Incident signale a l equipe support',
  INCIDENT_EVIDENCE_DECLARED: 'Preuve incident volontaire declaree',
  SOS_TRIGGERED: 'SOS declenche pendant la course',
  SHARE_LINK_CREATED: 'Lien de partage trajet cree',
  ROUTE_POSITION_RECORDED: 'Position trajet recue',
  ROUTE_MONITORING_ALERT: 'Alerte monitoring trajet',
};

export const ALLOWED_TRIP_TRANSITIONS = allowedTripLifecycleTransitions;

export const TRIP_EVENT_BY_STATUS: Record<
  'DRIVER_ARRIVING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED',
  string
> = {
  DRIVER_ARRIVING: 'DRIVER_ARRIVING',
  IN_PROGRESS: 'TRIP_STARTED',
  COMPLETED: 'TRIP_COMPLETED',
  CANCELLED: 'TRIP_CANCELLED',
};

export function resolveCancellationActor(role: UserRole) {
  if (role === 'DRIVER') {
    return 'DRIVER' as const;
  }

  if (role === 'RIDER') {
    return 'RIDER' as const;
  }

  return 'ADMIN' as const;
}
