import type {
  AdminJobQueueResponse,
  AdminLiveOpsResponse,
  DriverOnboardingQueueResponse,
  HealthCheckResponse,
} from '@orbi/api';
import { formatOperationalStatus } from '@orbi/ui';

export const adminSyncHighlightDurationMs = 5000;

type AdminJobQueueEntry = AdminJobQueueResponse['jobs'][number];
type LiveOpsRouteMonitoring = AdminLiveOpsResponse['trips'][number]['routeMonitoring'];
type LiveOpsTrip = AdminLiveOpsResponse['trips'][number];
const liveOpsStaleGpsThresholdMs = 2 * 60 * 1000;
export type JobQueueKindFilter =
  | 'ALL'
  | 'PAYMENT_WEBHOOK'
  | 'PAYMENT_REFUND_VERIFICATION'
  | 'DRIVER_DOCUMENT'
  | 'NOTIFICATION'
  | 'DRIVER_RESERVATION_EXPIRY';

export function formatAdminDateTime(
  value: string | null | undefined,
  fallback = 'Date indisponible',
  options: Intl.DateTimeFormatOptions = {
    dateStyle: 'short',
    timeStyle: 'short',
  },
) {
  if (!value) {
    return fallback;
  }

  const date = new Date(value);

  if (!Number.isFinite(date.getTime())) {
    return fallback;
  }

  return new Intl.DateTimeFormat('fr-FR', options).format(date);
}

export function resolveLiveOpsRouteMonitoringCopy(
  routeMonitoring: LiveOpsRouteMonitoring,
  options: { now?: string | Date } = {},
) {
  const signalAge = resolveLiveOpsRouteSignalAge(routeMonitoring.lastPositionAt, options.now);
  const isStale = signalAge.isStale && routeMonitoring.state === 'clear';
  const statusLabel =
    isStale
      ? 'Signal GPS ancien'
      : routeMonitoring.state === 'unknown'
      ? 'En attente'
      : routeMonitoring.state === 'clear'
        ? 'Clair'
        : `${formatOperationalStatus(routeMonitoring.state)} (${routeMonitoring.alertCount})`;

  return {
    statusLabel,
    lastSignalLabel:
      routeMonitoring.lastAlertType
        ? formatOperationalStatus(routeMonitoring.lastAlertType)
        : signalAge.label,
  };
}

export function resolveLiveOpsTripTriage(
  trip: LiveOpsTrip,
  options: { now?: string | Date } = {},
) {
  if (trip.hasIncident) {
    return {
      level: 'critical' as const,
      label: 'Support prioritaire',
      owner: 'support',
      action:
        'Ouvrir le ticket support, appeler si besoin et garder la course en surveillance.',
    };
  }

  if (trip.routeMonitoring.state === 'critical') {
    return {
      level: 'critical' as const,
      label: 'Route critique',
      owner: 'ops',
      action:
        'Verifier deviation route, contacter chauffeur et preparer escalade securite.',
    };
  }

  if (trip.routeMonitoring.state === 'warning') {
    return {
      level: 'warning' as const,
      label: 'Route a surveiller',
      owner: 'ops',
      action:
        'Surveiller la prochaine position et confirmer que la mission progresse.',
    };
  }

  if (!trip.routeMonitoring.lastPositionAt) {
    return {
      level: 'watch' as const,
      label: 'Signal attendu',
      owner: 'dispatch',
      action:
        'Attendre le premier ping GPS ou verifier la presence chauffeur si la course stagne.',
    };
  }

  const routeSignalAge = resolveLiveOpsRouteSignalAge(
    trip.routeMonitoring.lastPositionAt,
    options.now,
  );

  if (routeSignalAge.isStale) {
    return {
      level: 'watch' as const,
      label: 'Signal GPS ancien',
      owner: 'dispatch',
      action:
        'Contacter le chauffeur si le prochain ping ne revient pas et garder le rider informe.',
    };
  }

  return {
    level: 'clear' as const,
    label: 'Stable',
    owner: 'ops',
    action: 'Aucune action immediate, garder le suivi live ouvert.',
  };
}

export function resolveLiveOpsRouteSignalAge(
  lastPositionAt: string | null,
  nowInput?: string | Date,
) {
  if (!lastPositionAt) {
    return {
      ageSeconds: null,
      isStale: false,
      label: null,
    };
  }

  const observedAt = new Date(lastPositionAt);
  const now = nowInput ? new Date(nowInput) : new Date();

  if (!Number.isFinite(observedAt.getTime()) || !Number.isFinite(now.getTime())) {
    return {
      ageSeconds: null,
      isStale: false,
      label: 'Horodatage GPS a verifier',
    };
  }

  const ageSeconds = Math.max(
    0,
    Math.round((now.getTime() - observedAt.getTime()) / 1000),
  );
  const ageMinutes = Math.max(1, Math.round(ageSeconds / 60));

  return {
    ageSeconds,
    isStale: ageSeconds * 1000 >= liveOpsStaleGpsThresholdMs,
    label:
      ageSeconds * 1000 >= liveOpsStaleGpsThresholdMs
        ? `Dernier GPS il y a ${ageMinutes} min`
        : `GPS il y a ${ageMinutes} min`,
  };
}

export function hasLiveOpsTripChanged(
  previousTrip: LiveOpsTrip,
  nextTrip: LiveOpsTrip,
) {
  return (
    previousTrip.status !== nextTrip.status ||
    previousTrip.lastEvent?.label !== nextTrip.lastEvent?.label ||
    previousTrip.lastEvent?.createdAt !== nextTrip.lastEvent?.createdAt ||
    previousTrip.incidentCount !== nextTrip.incidentCount ||
    previousTrip.routeMonitoring.state !== nextTrip.routeMonitoring.state ||
    previousTrip.routeMonitoring.alertCount !==
      nextTrip.routeMonitoring.alertCount ||
    previousTrip.routeMonitoring.lastAlertType !==
      nextTrip.routeMonitoring.lastAlertType ||
    previousTrip.routeMonitoring.lastAlertAt !==
      nextTrip.routeMonitoring.lastAlertAt ||
    previousTrip.routeMonitoring.lastPositionAt !==
      nextTrip.routeMonitoring.lastPositionAt
  );
}

export function resolveJobQueueFilterSummary(
  jobs: AdminJobQueueEntry[],
  kindFilter: JobQueueKindFilter,
) {
  const actionRequired = jobs.filter(
    (job) =>
      job.status === 'DEAD_LETTER' ||
      job.diagnostics.riskSignals.some(
        (signal) =>
          signal.includes('quarantined') ||
          signal.includes('ignored') ||
          signal.includes('provider'),
      ),
  ).length;
  const maxAttemptPressure = jobs.reduce(
    (max, job) => Math.max(max, job.diagnostics.attemptPressure),
    0,
  );
  const averageAttemptPressure = jobs.length
    ? Math.round(
        jobs.reduce((sum, job) => sum + job.diagnostics.attemptPressure, 0) /
          jobs.length,
      )
    : 0;
  const allSignals = jobs.flatMap((job) => job.diagnostics.riskSignals);
  const dominantSignal =
    allSignals.find((signal) => signal.includes('quarantined')) ??
    allSignals.find((signal) => signal.includes('ignored')) ??
    allSignals[0] ??
    null;
  let message = 'Aucun job charge pour ce filtre.';

  if (jobs.length > 0) {
    if (kindFilter === 'DRIVER_DOCUMENT') {
      message =
        actionRequired > 0
          ? `${actionRequired} document(s) demandent une revue KYC avant approbation chauffeur.`
          : 'Documents charges sans signal critique dans ce filtre.';
    } else if (kindFilter === 'PAYMENT_WEBHOOK') {
      message =
        actionRequired > 0
          ? `${actionRequired} webhook(s) paiement demandent investigation finance avant requeue.`
          : 'Webhooks paiement charges sans signal critique dans ce filtre.';
    } else if (kindFilter === 'PAYMENT_REFUND_VERIFICATION') {
      message =
        actionRequired > 0
          ? `${actionRequired} refund(s) paiement demandent verification provider avant requeue.`
          : 'Refunds paiement charges sans signal critique dans ce filtre.';
    } else if (kindFilter === 'NOTIFICATION') {
      message =
        actionRequired > 0
          ? `${actionRequired} notification(s) demandent verification provider avant requeue.`
          : 'Notifications chargees sans signal critique dans ce filtre.';
    } else if (kindFilter === 'DRIVER_RESERVATION_EXPIRY') {
      message =
        actionRequired > 0
          ? `${actionRequired} job(s) expiration reservation demandent verification dispatch avant requeue.`
          : 'Expirations reservation chargees sans signal critique dans ce filtre.';
    } else {
      message =
        actionRequired > 0
          ? `${actionRequired} job(s) demandent une action operations immediate.`
          : 'Aucun signal critique dans les jobs charges.';
    }
  }

  return {
    actionRequired,
    averageAttemptPressure,
    dominantSignal,
    jobsLoaded: jobs.length,
    maxAttemptPressure,
    message,
    requeueBlocked: jobs.filter(
      (job) =>
        job.status === 'DEAD_LETTER' && !job.diagnostics.canRequeueSafely,
    ).length,
  };
}

export function resolveJobQueueOwnerRows(jobs: AdminJobQueueEntry[]) {
  const owners = ['finance', 'trust-and-safety', 'ops', 'engineering'];

  return owners
    .map((owner) => {
      const ownerJobs = jobs.filter((job) => job.diagnostics.owner === owner);
      const critical = ownerJobs.filter(
        (job) =>
          job.diagnostics.severity === 'critical' ||
          job.diagnostics.severity === 'high',
      ).length;
      const blocked = ownerJobs.filter(
        (job) =>
          job.status === 'DEAD_LETTER' && !job.diagnostics.canRequeueSafely,
      ).length;
      const maxAttemptPressure = ownerJobs.reduce(
        (max, job) => Math.max(max, job.diagnostics.attemptPressure),
        0,
      );

      return {
        owner,
        total: ownerJobs.length,
        critical,
        blocked,
        maxAttemptPressure,
      };
    })
    .filter((row) => row.total > 0);
}

export function canAttemptJobRequeue(job: AdminJobQueueEntry) {
  return job.status === 'DEAD_LETTER' && job.diagnostics.canRequeueSafely;
}

export function resolveCollectionDelta<TItem, TId extends string>(
  previousItems: TItem[] | null,
  nextItems: TItem[],
  options: {
    getId: (item: TItem) => TId;
    hasChanged?: (previousItem: TItem, nextItem: TItem) => boolean;
  },
) {
  if (!previousItems) {
    return {
      freshIds: [] as TId[],
      updatedIds: [] as TId[],
      removedIds: [] as TId[],
    };
  }

  const previousById = new Map(
    previousItems.map((item) => [options.getId(item), item] as const),
  );
  const nextIds = new Set(nextItems.map((item) => options.getId(item)));

  const freshIds: TId[] = [];
  const updatedIds: TId[] = [];

  for (const item of nextItems) {
    const id = options.getId(item);
    const previousItem = previousById.get(id);

    if (!previousItem) {
      freshIds.push(id);
      continue;
    }

    if (options.hasChanged?.(previousItem, item)) {
      updatedIds.push(id);
    }
  }

  const removedIds = previousItems
    .map((item) => options.getId(item))
    .filter((id) => !nextIds.has(id));

  return {
    freshIds,
    updatedIds,
    removedIds,
  };
}

export function resolveStringFeedDelta(
  previousItems: string[] | null,
  nextItems: string[],
) {
  if (!previousItems) {
    return [];
  }

  return nextItems.filter((item) => !previousItems.includes(item));
}

type DriverOnboardingQueueItem = DriverOnboardingQueueResponse['drivers'][number];
export type DriverOnboardingGuidanceFilter =
  | 'all'
  | DriverOnboardingQueueItem['decisionGuidance']['level'];

export function normalizeAdminSearch(value: string) {
  return value.trim().toLowerCase();
}

export function resolveVisibleDriverOnboardingQueue(
  drivers: DriverOnboardingQueueItem[],
  options: {
    guidanceFilter: DriverOnboardingGuidanceFilter;
    searchQuery: string;
  },
) {
  const query = normalizeAdminSearch(options.searchQuery);

  return [...drivers]
    .filter(
      (driver) =>
        options.guidanceFilter === 'all' ||
        driver.decisionGuidance.level === options.guidanceFilter,
    )
    .filter((driver) => {
      if (!query) {
        return true;
      }

      const searchableText = [
        driver.driverName,
        driver.email,
        driver.phoneNumber ?? '',
        driver.verificationStatus,
        driver.reviewStatus,
        driver.decisionGuidance.label,
        driver.decisionGuidance.level,
        ...driver.decisionGuidance.blockers,
        ...driver.documents.flatMap((document) => [
          document.type,
          document.status,
          document.fileName,
          document.integrity.uploadSource ?? '',
        ]),
      ]
        .join(' ')
        .toLowerCase();

      return searchableText.includes(query);
    })
    .sort((left, right) => {
      const guidancePriority = {
        resubmit: 0,
        review: 1,
        approve: 2,
      } as const;
      const priorityDelta =
        guidancePriority[left.decisionGuidance.level] -
        guidancePriority[right.decisionGuidance.level];

      if (priorityDelta !== 0) {
        return priorityDelta;
      }

      return (
        right.documentSummary.integrityWarnings -
        left.documentSummary.integrityWarnings
      );
    });
}

export function resolveDriverOnboardingDelta(
  previousDrivers: DriverOnboardingQueueItem[] | null,
  nextDrivers: DriverOnboardingQueueItem[],
) {
  const driverDelta = resolveCollectionDelta(previousDrivers, nextDrivers, {
    getId: (driver) => driver.id,
    hasChanged: (previousDriver, nextDriver) =>
      previousDriver.reviewStatus !== nextDriver.reviewStatus ||
      previousDriver.verificationStatus !== nextDriver.verificationStatus ||
      previousDriver.documentSummary.pending !==
        nextDriver.documentSummary.pending,
  });
  const updatedDriver =
    nextDrivers.find((driver) => driverDelta.updatedIds.includes(driver.id)) ??
    null;
  const freshDocumentIds = nextDrivers.flatMap((driver) => {
    const previousDriver =
      previousDrivers?.find((candidate) => candidate.id === driver.id) ?? null;

    if (!previousDriver) {
      return [];
    }

    const documentDelta = resolveCollectionDelta(
      previousDriver.documents,
      driver.documents,
      {
        getId: (document) => document.id,
        hasChanged: (previousDocument, nextDocument) =>
          previousDocument.status !== nextDocument.status,
      },
    );

    return [...documentDelta.freshIds, ...documentDelta.updatedIds];
  });

  if (driverDelta.freshIds.length > 0) {
    return {
      highlightedDriverIds: driverDelta.freshIds,
      freshDocumentIds,
      transitionLabel:
        driverDelta.freshIds.length > 1
          ? `${driverDelta.freshIds.length} nouveaux dossiers viennent d entrer dans la revue ops.`
          : 'Un nouveau dossier vient d entrer dans la revue ops.',
    };
  }

  if (updatedDriver) {
    return {
      highlightedDriverIds: [updatedDriver.id],
      freshDocumentIds,
      transitionLabel: `Dossier resynchronise: ${updatedDriver.reviewStatus}.`,
    };
  }

  if (freshDocumentIds.length > 0) {
    return {
      highlightedDriverIds: [],
      freshDocumentIds,
      transitionLabel: 'Des justificatifs viennent de changer de statut.',
    };
  }

  if (driverDelta.removedIds.length > 0) {
    return {
      highlightedDriverIds: [],
      freshDocumentIds: [],
      transitionLabel:
        driverDelta.removedIds.length > 1
          ? `${driverDelta.removedIds.length} dossiers ont quitte la revue ops.`
          : 'Un dossier a quitte la revue ops.',
    };
  }

  return {
    highlightedDriverIds: [],
    freshDocumentIds: [],
    transitionLabel: null,
  };
}

export function resolveHealthTransitionLabel(
  previousHealth: HealthCheckResponse | null,
  nextHealth: HealthCheckResponse,
) {
  if (!previousHealth) {
    return null;
  }

  if (previousHealth.status !== nextHealth.status) {
    return nextHealth.status === 'ok'
      ? 'Le backend vient de revenir a un etat stable.'
      : 'Le backend vient de basculer en mode degrade.';
  }

  if (previousHealth.dependencies.realtime !== nextHealth.dependencies.realtime) {
    return "Le statut de l'infrastructure realtime vient de changer.";
  }

  if (
    previousHealth.dependencies.driverReservationExpiry !==
    nextHealth.dependencies.driverReservationExpiry
  ) {
    return 'Le watchdog des reservations vient de changer de niveau.';
  }

  if (
    previousHealth.infrastructure.realtime.degradeReason !==
    nextHealth.infrastructure.realtime.degradeReason
  ) {
    return 'La cause de degradation realtime vient d evoluer.';
  }

  if (
    previousHealth.operations.driverReservationExpiry.consecutiveFailures !==
    nextHealth.operations.driverReservationExpiry.consecutiveFailures
  ) {
    return 'Le compteur de fautes consecutives du sweeper vient de changer.';
  }

  return null;
}
