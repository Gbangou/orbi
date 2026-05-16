import { type DriverFatigueStatus, type TripDetailResponse } from '@mobilis/api';
import { formatOperationalStatus } from '@mobilis/ui';

function formatOperationalCount(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? String(Math.floor(value))
    : 'ND';
}

export function buildDriverFatigueMessage(fatigue: DriverFatigueStatus) {
  return `${fatigue.reason} ${formatOperationalCount(fatigue.drivingMinutes)}/${formatOperationalCount(fatigue.maxDrivingMinutes)} min sur ${formatOperationalCount(fatigue.windowHours)}h.`;
}

export function buildDriverRouteMonitoringLines(
  routeMonitoring: TripDetailResponse['trip']['routeMonitoring'] | null | undefined,
) {
  if (!routeMonitoring) {
    return [];
  }

  if (routeMonitoring.state === 'unknown') {
    return ['Ride Check: en attente du premier signal route.'];
  }

  if (routeMonitoring.state === 'clear') {
    return ['Ride Check: trajet coherent sur le dernier signal route.'];
  }

  return [
    `Ride Check: ${formatOperationalStatus(routeMonitoring.state)} (${formatOperationalCount(routeMonitoring.alertCount)})`,
    routeMonitoring.lastAlertType
      ? `Dernier signal: ${formatOperationalStatus(routeMonitoring.lastAlertType)}`
      : 'Dernier signal: anomalie route',
  ];
}
