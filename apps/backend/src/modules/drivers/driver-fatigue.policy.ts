export const driverFatigueWindowHours = 8;
export const driverFatigueMaxCompletedTrips = 8;
export const driverFatigueMaxDrivingMinutes = 300;
export const driverFatigueRestMinutes = 30;

export type DriverFatigueTrip = {
  id: string;
  startedAt: Date | null;
  completedAt: Date | null;
};

export function evaluateDriverFatigue(input: {
  now: Date;
  trips: DriverFatigueTrip[];
}) {
  const completedTrips = input.trips.filter((trip) => trip.completedAt);
  const drivingMinutes = completedTrips.reduce((total, trip) => {
    if (!trip.startedAt || !trip.completedAt) {
      return total;
    }

    return (
      total +
      Math.max(
        0,
        Math.round(
          (trip.completedAt.getTime() - trip.startedAt.getTime()) / 60000,
        ),
      )
    );
  }, 0);
  const completedTripCount = completedTrips.length;
  const latestCompletedAt =
    completedTrips
      .map((trip) => trip.completedAt)
      .filter((date): date is Date => Boolean(date))
      .sort((left, right) => right.getTime() - left.getTime())[0] ?? null;
  const restUntil = latestCompletedAt
    ? new Date(latestCompletedAt.getTime() + driverFatigueRestMinutes * 60000)
    : null;
  const hardLimitReached =
    completedTripCount >= driverFatigueMaxCompletedTrips ||
    drivingMinutes >= driverFatigueMaxDrivingMinutes;
  const blocked = Boolean(
    hardLimitReached && restUntil && restUntil.getTime() > input.now.getTime(),
  );
  const warning =
    !blocked &&
    (completedTripCount >= driverFatigueMaxCompletedTrips - 1 ||
      drivingMinutes >= driverFatigueMaxDrivingMinutes - 45);

  return {
    state: blocked
      ? ('blocked' as const)
      : warning
        ? ('warning' as const)
        : ('clear' as const),
    completedTrips: completedTripCount,
    drivingMinutes,
    windowHours: driverFatigueWindowHours,
    maxCompletedTrips: driverFatigueMaxCompletedTrips,
    maxDrivingMinutes: driverFatigueMaxDrivingMinutes,
    restMinutes: driverFatigueRestMinutes,
    restUntil: blocked && restUntil ? restUntil : null,
    reason: blocked
      ? 'Pause obligatoire apres une sequence de conduite elevee.'
      : warning
        ? 'Approche du seuil fatigue; pause conseillee avant nouvelle mission.'
        : 'Aucun signal fatigue bloquant sur la fenetre recente.',
  };
}
