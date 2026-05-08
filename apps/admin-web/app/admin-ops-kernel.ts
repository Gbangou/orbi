import type {
  DriverOnboardingQueueResponse,
  HealthCheckResponse,
} from '@mobilis/api';

export const adminSyncHighlightDurationMs = 5000;

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

const csvFormulaPrefixPattern = /^[=+\-@\t\r]/;

export function normalizeAdminSearch(value: string) {
  return value.trim().toLowerCase();
}

function sanitizeCsvValue(value: string | number | null | undefined) {
  const normalized = String(value ?? '')
    .replace(/\r?\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (csvFormulaPrefixPattern.test(normalized)) {
    return `'${normalized}`;
  }

  return normalized;
}

function csvCell(value: string | number | null | undefined) {
  return `"${sanitizeCsvValue(value).replace(/"/g, '""')}"`;
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

export function buildDriverOnboardingCsv(
  drivers: DriverOnboardingQueueItem[],
) {
  const headers = [
    'driver_id',
    'driver_name',
    'email',
    'phone',
    'verification_status',
    'review_status',
    'guidance',
    'recommended_status',
    'approved_documents',
    'total_documents',
    'pending_documents',
    'rejected_documents',
    'missing_required',
    'integrity_warnings',
    'average_integrity_score',
    'active_vehicle_count',
    'service_radius_km',
    'blockers',
    'latest_decision_reason',
  ];
  const rows = drivers.map((driver) => [
    driver.id,
    driver.driverName,
    driver.email,
    driver.phoneNumber,
    driver.verificationStatus,
    driver.reviewStatus,
    driver.decisionGuidance.level,
    driver.decisionGuidance.recommendedStatus,
    driver.documentSummary.approved,
    driver.documentSummary.total,
    driver.documentSummary.pending,
    driver.documentSummary.rejected,
    driver.documentSummary.missingRequired,
    driver.documentSummary.integrityWarnings,
    driver.documentSummary.averageIntegrityScore,
    driver.activeVehicleCount,
    driver.serviceRadiusKm,
    driver.decisionGuidance.blockers.join(' | '),
    driver.latestDecisionReason,
  ]);

  return [headers, ...rows]
    .map((row) => row.map((value) => csvCell(value)).join(','))
    .join('\n');
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
