import { type DriverFatigueStatus, type TripDetailResponse } from '@orbi/api';
import { formatOperationalStatus } from '@orbi/ui';
import { toDriverDateMs } from './driver-date-format';

type RouteTone = 'teal' | 'amber' | 'sky' | 'rose';

type DriverRouteMonitoring = TripDetailResponse['trip']['routeMonitoring'];

function formatOperationalCount(value: unknown) {
  const numeric = toFiniteOperationalNumber(value);
  return numeric !== null && numeric >= 0
    ? String(Math.floor(numeric))
    : 'ND';
}

function toFiniteOperationalNumber(value: unknown) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === 'string') {
    const parsed = Number(value.trim().replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
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
    return ['Position mission en cours de confirmation.'];
  }

  if (routeMonitoring.state === 'clear') {
    return ['Route mission cohérente.'];
  }

  return [
    `Route mission: ${formatOperationalStatus(routeMonitoring.state)} (${formatOperationalCount(routeMonitoring.alertCount)})`,
    routeMonitoring.lastAlertType
      ? `Dernière alerte: ${formatOperationalStatus(routeMonitoring.lastAlertType)}`
      : 'Dernière alerte: route à contrôler',
  ];
}

export function buildDriverRouteSafetyBrief(input: {
  routeMonitoring: DriverRouteMonitoring | null | undefined;
  now: number;
}) {
  const routeMonitoring = input.routeMonitoring;

  if (!routeMonitoring) {
    return {
      eyebrow: 'Sécurité trajet',
      title: 'Position en synchronisation',
      description:
        'La course reste disponible pendant la mise à jour de la position.',
      tone: 'amber' as RouteTone,
      actionLabel:
        'Gardez le telephone ouvert; la position sera vérifiée au moment de finaliser.',
      blocksCompletion: false,
      insights: [
        { label: 'Position', value: 'Synchronisation', tone: 'amber' as RouteTone },
        { label: 'Etat', value: 'Verification', tone: 'amber' as RouteTone },
      ],
    };
  }

  const latestPosition = routeMonitoring.latestPosition;

  if (!latestPosition || routeMonitoring.state === 'unknown') {
    return {
      eyebrow: 'Sécurité trajet',
      title: 'Premiere position attendue',
      description:
        'La carte attend encore la première position de mission.',
      tone: 'amber' as RouteTone,
      actionLabel:
        'Gardez la localisation active; la position recente sera verifiee avant de valider la fin.',
      blocksCompletion: false,
      insights: [
        { label: 'Position', value: 'En attente', tone: 'amber' as RouteTone },
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
  const accuracyMeters = toFiniteOperationalNumber(latestPosition.accuracyMeters);
  const speedKph = toFiniteOperationalNumber(latestPosition.speedKph);
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
      eyebrow: 'Sécurité trajet',
      title: 'Course à contrôler après finalisation',
      description:
        'La position indique une anomalie possible. Terminez uniquement si la course est réellement arrivée.',
      tone: 'rose' as RouteTone,
      actionLabel:
        'Terminez seulement si le client est arrive; contactez le support ou utilisez SOS si necessaire.',
      blocksCompletion: false,
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
      eyebrow: 'Sécurité trajet',
      title: 'Route à surveiller',
      description:
        'La course peut continuer, mais la position récente mérite une vérification.',
      tone: 'amber' as RouteTone,
      actionLabel:
        'Confirmez la route, gardez la localisation active et signalez un incident si le probleme persiste.',
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
    eyebrow: 'Sécurité trajet',
    title: 'Route cohérente',
    description:
      'La position est exploitable et ne montre pas d anomalie.',
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
      label: 'Signal',
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
        (toFiniteOperationalNumber(input.routeMonitoring.alertCount) ?? 0) > 0
          ? 'amber'
          : ('sky' as RouteTone),
    },
  ];
}

function resolveSignalAgeSeconds(observedAt: string, now: number) {
  const observedAtMs = toDriverDateMs(observedAt);

  if (observedAtMs === null || !Number.isFinite(now)) {
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
