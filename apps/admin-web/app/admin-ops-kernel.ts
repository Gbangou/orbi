import type {
  AdminJobQueueResponse,
  AdminLiveOpsResponse,
  DriverOnboardingQueueResponse,
  HealthCheckResponse,
} from '@mobilis/api';
import { formatOperationalStatus } from '@mobilis/ui';

export const adminSyncHighlightDurationMs = 5000;

type AdminJobQueueEntry = AdminJobQueueResponse['jobs'][number];
type LiveOpsRouteMonitoring = AdminLiveOpsResponse['trips'][number]['routeMonitoring'];
export type JobQueueKindFilter =
  | 'ALL'
  | 'PAYMENT_WEBHOOK'
  | 'DRIVER_DOCUMENT'
  | 'NOTIFICATION';

export function resolveLiveOpsRouteMonitoringCopy(
  routeMonitoring: LiveOpsRouteMonitoring,
) {
  const statusLabel =
    routeMonitoring.state === 'unknown'
      ? 'En attente'
      : routeMonitoring.state === 'clear'
        ? 'Clair'
        : `${formatOperationalStatus(routeMonitoring.state)} (${routeMonitoring.alertCount})`;

  return {
    statusLabel,
    lastSignalLabel: routeMonitoring.lastAlertType
      ? formatOperationalStatus(routeMonitoring.lastAlertType)
      : null,
  };
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
    } else if (kindFilter === 'NOTIFICATION') {
      message =
        actionRequired > 0
          ? `${actionRequired} notification(s) demandent verification provider avant requeue.`
          : 'Notifications chargees sans signal critique dans ce filtre.';
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
