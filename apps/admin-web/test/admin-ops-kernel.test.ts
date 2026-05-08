/// <reference path="../../backend/node_modules/@types/jest/index.d.ts" />

import type {
  DriverOnboardingQueueResponse,
  HealthCheckResponse,
} from '@mobilis/api';

import {
  resolveCollectionDelta,
  resolveDriverOnboardingDelta,
  resolveHealthTransitionLabel,
  resolveVisibleDriverOnboardingQueue,
} from '../app/admin-ops-kernel';

function createDriver(
  overrides: Partial<DriverOnboardingQueueResponse['drivers'][number]> = {},
): DriverOnboardingQueueResponse['drivers'][number] {
  return {
    id: 'driver-1',
    driverName: 'Issa Driver',
    email: 'issa@example.com',
    phoneNumber: '+22670000000',
    verificationStatus: 'PENDING',
    reviewStatus: 'SUBMITTED',
    latestReviewAt: null,
    latestReviewActor: null,
    latestDecisionReason: null,
    serviceRadiusKm: 8,
    activeVehicleCount: 1,
    documentSummary: {
      total: 1,
      approved: 0,
      pending: 1,
      rejected: 0,
      integrityWarnings: 0,
      averageIntegrityScore: 100,
      missingRequired: 4,
    },
    decisionGuidance: {
      level: 'review',
      recommendedStatus: 'UNDER_REVIEW',
      label: 'Revue prudente',
      detail: 'Verification ops requise.',
      blockers: ['DRIVER_LICENSE: verification ops requise'],
    },
    reviewHistory: [],
    documents: [
      {
        id: 'document-1',
        type: 'DRIVER_LICENSE',
        status: 'PENDING',
        fileName: 'permis.pdf',
        uploadedAt: '2026-04-25T08:00:00.000Z',
        expiresAt: null,
        rejectionReason: null,
        integrity: {
          state: 'complete',
          score: 100,
          sizeBytes: 120000,
          sha256: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
          uploadSource: 'driver-app',
          capturedAt: '2026-04-25T08:00:01.000Z',
          guidance: {
            level: 'clear',
            label: 'Preuves completes',
            detail: 'Preuves presentes.',
          },
          checks: [],
        },
      },
    ],
    ...overrides,
  };
}

function createHealth(
  overrides: Partial<HealthCheckResponse> = {},
): HealthCheckResponse {
  return {
    status: 'ok',
    service: 'mobilis-backend',
    timestamp: '2026-04-25T08:00:00.000Z',
    uptimeSeconds: 120,
    runtime: {
      nodeVersion: 'v22.0.0',
      pid: 42,
      memory: {
        rss: 1,
        heapUsed: 1,
        heapTotal: 1,
      },
    },
    dependencies: {
      database: 'up',
      rateLimit: 'up',
      realtime: 'up',
      driverReservationExpiry: 'up',
    },
    lifecycle: {
      state: 'ready',
      drainReason: null,
      lastTransitionAt: null,
    },
    infrastructure: {
      rateLimit: {
        configuredAdapter: 'memory',
        strict: false,
        adapter: 'memory',
        sharedBackplane: false,
        degraded: false,
        degradeReason: null,
        trackedKeys: 0,
      },
      realtime: {
        configuredAdapter: 'memory',
        strict: false,
        adapter: 'memory',
        sharedBackplane: false,
        degraded: false,
        degradeReason: null,
        activeStreams: 0,
        publishedEvents: 0,
        featureFlagMode: 'on',
        featureFlagEnabled: true,
      },
    },
    operations: {
      driverReservationExpiry: {
        enabled: true,
        intervalMs: 5000,
        inFlight: false,
        totalSweeps: 0,
        consecutiveFailures: 0,
        lastExpiredReservations: 0,
        lastStartedAt: null,
        lastCompletedAt: null,
        lastSucceededAt: null,
        lastFailedAt: null,
        lastFailureMessage: null,
        lastDurationMs: null,
      },
      healthHistory: [],
    },
    ...overrides,
  };
}

describe('admin-ops-kernel', () => {
  it('resolves fresh, updated and removed ids for a generic collection', () => {
    const delta = resolveCollectionDelta(
      [
        { id: 'trip-1', status: 'MATCHED' },
        { id: 'trip-2', status: 'IN_PROGRESS' },
      ],
      [
        { id: 'trip-1', status: 'DRIVER_ARRIVING' },
        { id: 'trip-3', status: 'MATCHED' },
      ],
      {
        getId: (trip) => trip.id,
        hasChanged: (previousTrip, nextTrip) => previousTrip.status !== nextTrip.status,
      },
    );

    expect(delta).toEqual({
      freshIds: ['trip-3'],
      updatedIds: ['trip-1'],
      removedIds: ['trip-2'],
    });
  });

  it('detects a new onboarding dossier and highlights it', () => {
    const delta = resolveDriverOnboardingDelta(
      [createDriver()],
      [createDriver(), createDriver({ id: 'driver-2', email: 'awa@example.com' })],
    );

    expect(delta.highlightedDriverIds).toEqual(['driver-2']);
    expect(delta.freshDocumentIds).toEqual([]);
    expect(delta.transitionLabel).toBe(
      'Un nouveau dossier vient d entrer dans la revue ops.',
    );
  });

  it('detects a document status change without forcing a dossier status change', () => {
    const previousDrivers = [createDriver()];
    const nextDrivers = [
      createDriver({
        documents: [
          {
            id: 'document-1',
            type: 'DRIVER_LICENSE',
            status: 'APPROVED',
            fileName: 'permis.pdf',
            uploadedAt: '2026-04-25T08:00:00.000Z',
            expiresAt: null,
            rejectionReason: null,
            integrity: {
              state: 'complete',
              score: 100,
              sizeBytes: 120000,
              sha256:
                'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
              uploadSource: 'driver-app',
              capturedAt: '2026-04-25T08:00:01.000Z',
              guidance: {
                level: 'clear',
                label: 'Preuves completes',
                detail: 'Preuves presentes.',
              },
              checks: [],
            },
          },
        ],
      }),
    ];

    const delta = resolveDriverOnboardingDelta(previousDrivers, nextDrivers);

    expect(delta.highlightedDriverIds).toEqual([]);
    expect(delta.freshDocumentIds).toEqual(['document-1']);
    expect(delta.transitionLabel).toBe(
      'Des justificatifs viennent de changer de statut.',
    );
  });

  it('detects a dossier review transition and highlights the driver', () => {
    const delta = resolveDriverOnboardingDelta(
      [createDriver()],
      [
        createDriver({
          reviewStatus: 'UNDER_REVIEW',
          latestReviewAt: '2026-04-25T09:00:00.000Z',
          latestReviewActor: 'ops@mobilis',
        }),
      ],
    );

    expect(delta.highlightedDriverIds).toEqual(['driver-1']);
    expect(delta.transitionLabel).toBe(
      'Dossier resynchronise: UNDER_REVIEW.',
    );
  });

  it('filters and sorts the onboarding queue for ops review', () => {
    const readyDriver = createDriver({
      id: 'driver-ready',
      driverName: 'Awa Ready',
      decisionGuidance: {
        level: 'approve',
        recommendedStatus: 'APPROVED',
        label: 'Pret approbation',
        detail: 'Dossier clair.',
        blockers: [],
      },
    });
    const resubmitDriver = createDriver({
      id: 'driver-resubmit',
      driverName: 'Issouf Redemande',
      documentSummary: {
        ...createDriver().documentSummary,
        integrityWarnings: 3,
      },
      decisionGuidance: {
        level: 'resubmit',
        recommendedStatus: 'CHANGES_REQUESTED',
        label: 'Redemande',
        detail: 'Piece illisible.',
        blockers: ['INSURANCE: piece illisible'],
      },
    });

    expect(
      resolveVisibleDriverOnboardingQueue([readyDriver, resubmitDriver], {
        guidanceFilter: 'all',
        searchQuery: 'insurance',
      }).map((driver) => driver.id),
    ).toEqual(['driver-resubmit']);

    expect(
      resolveVisibleDriverOnboardingQueue([readyDriver, resubmitDriver], {
        guidanceFilter: 'all',
        searchQuery: '',
      }).map((driver) => driver.id),
    ).toEqual(['driver-resubmit', 'driver-ready']);
  });

  it('describes health transitions from status degradation and recovery signals', () => {
    expect(
      resolveHealthTransitionLabel(
        createHealth(),
        createHealth({ status: 'degraded' }),
      ),
    ).toBe('Le backend vient de basculer en mode degrade.');

    expect(
      resolveHealthTransitionLabel(
        createHealth(),
        createHealth({
          infrastructure: {
            rateLimit: {
              configuredAdapter: 'memory',
              strict: false,
              adapter: 'memory',
              sharedBackplane: false,
              degraded: false,
              degradeReason: null,
              trackedKeys: 0,
            },
            realtime: {
              configuredAdapter: 'memory',
              strict: false,
              adapter: 'memory',
              sharedBackplane: false,
              degraded: true,
              degradeReason: 'stream lag',
              activeStreams: 3,
              publishedEvents: 18,
              featureFlagMode: 'on',
              featureFlagEnabled: true,
            },
          },
        }),
      ),
    ).toBe('La cause de degradation realtime vient d evoluer.');
  });
});
