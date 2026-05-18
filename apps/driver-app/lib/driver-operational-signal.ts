import { type DriverFatigueStatus, type TripDetailResponse } from '@orbi/api';
import { formatOperationalStatus } from '@orbi/ui';

type RouteTone = 'teal' | 'amber' | 'sky' | 'rose';

type DriverRouteMonitoring = TripDetailResponse['trip']['routeMonitoring'];

function formatOperationalCount(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? String(Math.floor(value))
    : 'ND';
}

export function buildDriverFatigueMessage(fatigue: DriverFatigueStatus) {
  return `${fatigue.reason} ${formatOperationalCount(fatigue.drivingMinutes)}/${formatOperationalCount(fatigue.maxDrivingMinutes)} min sur ${formatOperationalCount(fatigue.windowHours)}h.`;
}

export function buildDriverRouteMonitoringLines(
  routeMonitoring: DriverRouteMonitoring | null | undefined,
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

export function buildDriverRouteSafetyBrief(input: {
  routeMonitoring: DriverRouteMonitoring | null | undefined;
  now: number;
}) {
  const routeMonitoring = input.routeMonitoring;

  if (!routeMonitoring) {
    return {
      eyebrow: 'Ride Check',
      title: 'Signal route indisponible',
      description:
        'La mission reste visible, mais la finalisation attend un detail route synchronise.',
      tone: 'rose' as RouteTone,
      actionLabel:
        'Actualisez le direct, gardez le telephone ouvert et contactez le support si le signal ne revient pas.',
      blocksCompletion: true,
      insights: [
        { label: 'GPS', value: 'Indisponible', tone: 'rose' as RouteTone },
        { label: 'Etat', value: 'Bloquant', tone: 'rose' as RouteTone },
      ],
    };
  }

  const latestPosition = routeMonitoring.latestPosition;

  if (!latestPosition || routeMonitoring.state === 'unknown') {
    return {
      eyebrow: 'Ride Check',
      title: 'Premier signal GPS attendu',
      description:
        'Le cockpit attend une position chauffeur recente avant toute action de fin de course.',
      tone: 'rose' as RouteTone,
      actionLabel:
        'Restez dans l app, activez la localisation et attendez un signal avant finalisation.',
      blocksCompletion: true,
      insights: [
        { label: 'GPS', value: 'En attente', tone: 'rose' as RouteTone },
        {
          label: 'Alertes',
          value: formatOperationalCount(routeMonitoring.alertCount),
          tone: 'sky' as RouteTone,
        },
      ],
    };
  }

  const ageSeconds = resolveSignalAgeSeconds(
    latestPosition.observedAt,
    input.now,
  );
  const accuracyMeters = latestPosition.accuracyMeters;
  const speedKph = latestPosition.speedKph;
  const isVeryStale = typeof ageSeconds === 'number' && ageSeconds > 600;
  const isStale = typeof ageSeconds === 'number' && ageSeconds > 180;
  const isVeryImprecise =
    typeof accuracyMeters === 'number' && accuracyMeters > 250;
  const isImprecise = typeof accuracyMeters === 'number' && accuracyMeters > 100;
  const isImpossibleSpeed = typeof speedKph === 'number' && speedKph > 110;
  const isSuspiciousSpeed = typeof speedKph === 'number' && speedKph > 80;
  const isCritical =
    routeMonitoring.state === 'critical' ||
    isVeryStale ||
    isVeryImprecise ||
    isImpossibleSpeed;
  const isWarning =
    routeMonitoring.state === 'warning' ||
    isStale ||
    isImprecise ||
    isSuspiciousSpeed;

  if (isCritical) {
    return {
      eyebrow: 'Ride Check critique',
      title: 'Mission a verifier avant action sensible',
      description:
        'Un signal route critique peut indiquer une perte GPS, une position manipulee ou un trajet incoherent.',
      tone: 'rose' as RouteTone,
      actionLabel:
        'Arretez les actions non urgentes, contactez le support ou utilisez SOS si necessaire.',
      blocksCompletion: true,
      insights: buildRouteSafetyInsights({
        routeMonitoring,
        ageSeconds,
        accuracyMeters,
        speedKph,
        tone: 'rose',
      }),
    };
  }

  if (isWarning) {
    return {
      eyebrow: 'Ride Check attention',
      title: 'Signal route a surveiller',
      description:
        'La course peut continuer, mais le dernier signal merite une verification terrain.',
      tone: 'amber' as RouteTone,
      actionLabel:
        'Confirmez la route, gardez le GPS actif et signalez un incident si le probleme persiste.',
      blocksCompletion: false,
      insights: buildRouteSafetyInsights({
        routeMonitoring,
        ageSeconds,
        accuracyMeters,
        speedKph,
        tone: 'amber',
      }),
    };
  }

  return {
    eyebrow: 'Ride Check',
    title: 'Route coherente',
    description:
      'Le dernier signal GPS est exploitable et ne montre pas d anomalie operationnelle.',
    tone: 'teal' as RouteTone,
    actionLabel: 'Continuez la mission normalement.',
    blocksCompletion: false,
    insights: buildRouteSafetyInsights({
      routeMonitoring,
      ageSeconds,
      accuracyMeters,
      speedKph,
      tone: 'teal',
    }),
  };
}

function buildRouteSafetyInsights(input: {
  routeMonitoring: DriverRouteMonitoring;
  ageSeconds: number | null;
  accuracyMeters: number | null;
  speedKph: number | null;
  tone: RouteTone;
}) {
  return [
    {
      label: 'Fraicheur',
      value:
        typeof input.ageSeconds === 'number'
          ? formatSignalAge(input.ageSeconds)
          : 'ND',
      tone: input.tone,
    },
    {
      label: 'Precision',
      value:
        typeof input.accuracyMeters === 'number'
          ? `${Math.round(input.accuracyMeters)} m`
          : 'ND',
      tone:
        typeof input.accuracyMeters === 'number' && input.accuracyMeters > 100
          ? 'amber'
          : input.tone,
    },
    {
      label: 'Vitesse',
      value:
        typeof input.speedKph === 'number'
          ? `${Math.round(input.speedKph)} km/h`
          : 'ND',
      tone:
        typeof input.speedKph === 'number' && input.speedKph > 80
          ? 'rose'
          : input.tone,
    },
    {
      label: 'Alertes',
      value: formatOperationalCount(input.routeMonitoring.alertCount),
      tone:
        input.routeMonitoring.alertCount > 0 ? 'amber' : ('sky' as RouteTone),
    },
  ];
}

function resolveSignalAgeSeconds(observedAt: string, now: number) {
  const observedAtMs = new Date(observedAt).getTime();

  if (!Number.isFinite(observedAtMs) || !Number.isFinite(now)) {
    return null;
  }

  return Math.max(0, Math.round((now - observedAtMs) / 1000));
}

function formatSignalAge(ageSeconds: number) {
  if (ageSeconds < 60) {
    return `${ageSeconds}s`;
  }

  return `${Math.round(ageSeconds / 60)} min`;
}
