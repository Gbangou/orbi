import { activeRideRequestLifecycleStatuses } from '@mobilis/domain';

export const RIDE_REQUEST_ACTIVE_STATUSES =
  activeRideRequestLifecycleStatuses;
export const RIDE_REQUEST_DIRECT_CANCELLATION_STATUS = 'REQUESTED' as const;
