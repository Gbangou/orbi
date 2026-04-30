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
