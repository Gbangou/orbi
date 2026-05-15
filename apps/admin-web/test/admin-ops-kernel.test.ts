/// <reference path="../../backend/node_modules/@types/jest/index.d.ts" />

import type {
  AdminJobQueueResponse,
  DriverOnboardingQueueResponse,
  HealthCheckResponse,
} from '@mobilis/api';

import {
  canAttemptJobRequeue,
  resolveCollectionDelta,
  resolveDriverOnboardingDelta,
  resolveHealthTransitionLabel,
  resolveJobQueueFilterSummary,
  resolveJobQueueOwnerRows,
  resolveVisibleDriverOnboardingQueue,
} from '../app/admin-ops-kernel';

function createJob(
  overrides: Partial<AdminJobQueueResponse['jobs'][number]> = {},
): AdminJobQueueResponse['jobs'][number] {
  return {
    id: 'job-1',
    kind: 'PAYMENT_WEBHOOK',
    status: 'DEAD_LETTER',
    dedupeKey: 'payment-webhook:event-1',
    entityType: 'payment_webhook_event',
    entityId: 'event-1',
    attempts: 5,
    maxAttempts: 5,
    nextRunAt: '2026-05-15T08:00:00.000Z',
    lockedAt: null,
    completedAt: null,
    failedAt: '2026-05-15T08:05:00.000Z',
    lastError: 'provider unavailable',
    deadLetterReason: 'provider unavailable',
    diagnostics: {
      attemptPressure: 100,
      canRequeueSafely: false,
      owner: 'finance',
      riskSignals: ['provider:FLUTTERWAVE', 'action:ignored_unknown_reference'],
      recommendedAction: 'Verifier le webhook paiement.',
      severity: 'critical',
    },
    createdAt: '2026-05-15T07:55:00.000Z',
    updatedAt: '2026-05-15T08:05:00.000Z',
    ...overrides,
  };
}

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
  it('summarizes job queue filters without reading raw payloads', () => {
    const summary = resolveJobQueueFilterSummary(
      [
        createJob(),
        createJob({
          id: 'job-2',
          kind: 'DRIVER_DOCUMENT',
          diagnostics: {
            attemptPressure: 60,
            canRequeueSafely: false,
            owner: 'trust-and-safety',
            riskSignals: ['scan:quarantined'],
            recommendedAction: 'Verifier la quarantaine KYC.',
            severity: 'critical',
          },
        }),
      ],
      'DRIVER_DOCUMENT',
    );

    expect(summary).toEqual({
      actionRequired: 2,
      averageAttemptPressure: 80,
      dominantSignal: 'scan:quarantined',
      jobsLoaded: 2,
      maxAttemptPressure: 100,
      message:
        '2 document(s) demandent une revue KYC avant approbation chauffeur.',
      requeueBlocked: 2,
    });
  });

  it('groups job queue entries by accountable owner', () => {
    const rows = resolveJobQueueOwnerRows([
      createJob(),
      createJob({
        id: 'job-2',
        status: 'PENDING',
        diagnostics: {
          attemptPressure: 25,
          canRequeueSafely: false,
          owner: 'engineering',
          riskSignals: [],
          recommendedAction: 'Surveiller.',
          severity: 'medium',
        },
      }),
      createJob({
        id: 'job-3',
        diagnostics: {
          attemptPressure: 40,
          canRequeueSafely: true,
          owner: 'finance',
          riskSignals: ['provider:CINETPAY'],
          recommendedAction: 'Verifier puis requeue.',
          severity: 'high',
        },
      }),
    ]);

    expect(rows).toEqual([
      {
        owner: 'finance',
        total: 2,
        critical: 2,
        blocked: 1,
        maxAttemptPressure: 100,
      },
      {
        owner: 'engineering',
        total: 1,
        critical: 0,
        blocked: 0,
        maxAttemptPressure: 25,
      },
    ]);
  });

  it('allows requeue only when backend diagnostics say it is safe', () => {
    expect(canAttemptJobRequeue(createJob())).toBe(false);
    expect(
      canAttemptJobRequeue(
        createJob({
          diagnostics: {
            attemptPressure: 100,
            canRequeueSafely: true,
            owner: 'finance',
            riskSignals: ['provider:CINETPAY'],
            recommendedAction: 'Verifier puis requeue.',
            severity: 'high',
          },
        }),
      ),
    ).toBe(true);
    expect(
      canAttemptJobRequeue(
        createJob({
          status: 'RUNNING',
          diagnostics: {
            attemptPressure: 20,
            canRequeueSafely: true,
            owner: 'ops',
            riskSignals: [],
            recommendedAction: 'Surveiller.',
            severity: 'medium',
          },
        }),
      ),
    ).toBe(false);
  });

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
