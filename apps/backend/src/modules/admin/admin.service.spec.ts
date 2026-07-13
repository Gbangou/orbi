import { Prisma } from '@prisma/client';
import type { RequestAuthContext } from '../auth/auth.types';
import { AdminService } from './admin.service';

describe('AdminService', () => {
  function authContext(
    overrides: Partial<{
      id: string;
      role: RequestAuthContext['user']['role'];
      fullName: string;
      email: string;
    }> = {},
  ): RequestAuthContext {
    const id = overrides.id ?? 'ops-1';
    const now = new Date('2026-05-01T08:00:00.000Z');

    return {
      user: {
        id,
        email: overrides.email ?? `${id}@orbi.test`,
        phoneNumber: null,
        passwordHash: null,
        fullName: overrides.fullName ?? 'Ops Orbi',
        role: overrides.role ?? 'OPS',
        provider: 'EMAIL',
        isActive: true,
        isPhoneVerified: true,
        lastLoginAt: now,
        createdAt: now,
        updatedAt: now,
        pushToken: null,
        failedLoginCount: 0,
        lockedUntil: null,
        riderProfile: null,
        driverProfile: null,
      },
      session: {
        id: `session-${id}`,
        userId: id,
        createdAt: now,
        lastSeenAt: now,
        expiresAt: new Date('2026-05-01T12:00:00.000Z'),
        revokedAt: null,
        userAgent: 'jest',
        ipAddress: '127.0.0.1',
      },
      token: `test-token-${id}`,
    };
  }

  function prismaUniqueConstraintError() {
    return new Prisma.PrismaClientKnownRequestError(
      'Unique constraint failed',
      {
        code: 'P2002',
        clientVersion: 'test',
      },
    );
  }

  function confirmedObjectVerification(
    overrides: Record<string, unknown> = {},
  ) {
    return {
      state: 'confirmed',
      provider: 'orbi-object-store',
      verifiedAt: '2026-04-18T08:00:02.000Z',
      sizeBytes: 120000,
      sha256:
        'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      ...overrides,
    };
  }

  function clearSafetyScan(overrides: Record<string, unknown> = {}) {
    return {
      state: 'clear',
      engine: 'local-policy',
      scannedAt: '2026-04-18T08:00:03.000Z',
      findings: [],
      quarantineReason: null,
      ...overrides,
    };
  }

  function createService() {
    const prisma = {
      user: {
        count: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      riderProfile: { count: jest.fn() },
      userSession: { count: jest.fn().mockResolvedValue(0) },
      driverProfile: {
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      vehicle: { count: jest.fn() },
      rideRequest: { count: jest.fn(), findMany: jest.fn() },
      paymentAttempt: {
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
        aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 0 } }),
      },
      paymentWebhookEvent: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        findUnique: jest.fn().mockResolvedValue(null),
      },
      wallet: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        aggregate: jest.fn().mockResolvedValue({ _sum: { balance: 0 } }),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      walletTransaction: {
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn(),
      },
      driverPayout: {
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      trip: { count: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
      supportTicket: {
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        create: jest.fn(),
      },
      auditLog: {
        create: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
      },
      driverDocument: {
        count: jest.fn().mockResolvedValue(0),
        update: jest.fn(),
        findFirst: jest.fn(),
      },
      driverOnboardingReview: { create: jest.fn() },
      $transaction: jest.fn(async (callback: unknown) => {
        if (typeof callback !== 'function') {
          throw new Error('Expected transaction callback');
        }

        return (callback as (tx: typeof prisma) => unknown)(prisma);
      }),
    };
    const realtimeService = {
      publish: jest.fn(),
      snapshot: jest.fn().mockReturnValue({
        adapter: 'in-memory',
        sharedBackplane: false,
        degraded: false,
        degradeReason: null,
        activeStreams: 0,
        publishedEvents: 0,
        featureFlagMode: 'on',
        featureFlagEnabled: true,
      }),
    };
    const documentLinksService = {
      createViewLink: jest.fn(),
    };
    const documentObjectStorageService = {
      verifyStoredDocument: jest.fn(),
    };
    const jobQueueService = {
      enqueue: jest.fn().mockResolvedValue({
        id: 'job-1',
      }),
      list: jest.fn().mockResolvedValue({
        jobs: [
          {
            id: 'job-dead-1',
            kind: 'PAYMENT_WEBHOOK',
            status: 'DEAD_LETTER',
            dedupeKey: 'payment-webhook:event-1',
            entityType: 'payment_webhook_event',
            entityId: 'event-1',
            attempts: 5,
            maxAttempts: 5,
            nextRunAt: new Date('2026-05-08T10:00:00.000Z'),
            lockedAt: null,
            completedAt: null,
            failedAt: new Date('2026-05-08T10:05:00.000Z'),
            lastError: 'provider unavailable',
            deadLetterReason: 'provider unavailable',
            payload: {
              provider: 'FLUTTERWAVE',
              action: 'ignored_unknown_reference',
            },
            createdAt: new Date('2026-05-08T09:55:00.000Z'),
            updatedAt: new Date('2026-05-08T10:05:00.000Z'),
          },
        ],
        meta: {
          page: 1,
          pageSize: 10,
          total: 1,
          pageCount: 1,
        },
      }),
      snapshot: jest.fn().mockResolvedValue({
        durable: true,
        families: [
          'PAYMENT_WEBHOOK',
          'PAYMENT_REFUND_VERIFICATION',
          'DRIVER_DOCUMENT',
          'NOTIFICATION',
          'DRIVER_RESERVATION_EXPIRY',
        ],
        counts: [
          {
            kind: 'PAYMENT_WEBHOOK',
            status: 'DEAD_LETTER',
            count: 1,
          },
        ],
      }),
      requeueDeadLetter: jest.fn().mockResolvedValue({
        id: 'job-dead-1',
        kind: 'PAYMENT_WEBHOOK',
        status: 'PENDING',
        attempts: 5,
        nextRunAt: new Date('2026-05-08T10:10:00.000Z'),
        entityType: 'payment_webhook_event',
        entityId: 'event-1',
      }),
    };
    const featureFlagsService = {
      snapshot: jest.fn().mockReturnValue([
        { flag: 'payments', mode: 'on', allowlist: [] },
        { flag: 'pricing', mode: 'on', allowlist: [] },
        { flag: 'realtime', mode: 'on', allowlist: [] },
        { flag: 'driverOnboarding', mode: 'on', allowlist: [] },
        { flag: 'voice', mode: 'on', allowlist: [] },
      ]),
    };
    const healthIncidentJournalService = {
      acknowledge: jest.fn(),
      mute: jest.fn(),
    };
    const healthService = {
      check: jest.fn().mockResolvedValue({
        infrastructure: {
          realtime: {
            degraded: false,
            degradeReason: null,
            activeStreams: 1,
            publishedEvents: 4,
          },
        },
        operations: {
          productionReadiness: {
            environment: 'production',
            riskLevel: 'low',
            failedChecks: 0,
            warningChecks: 0,
            checks: [],
          },
        },
      }),
    };
    const driversService = {
      getDispatchLearningSettings: jest.fn().mockResolvedValue({
        lookbackHours: 72,
        halfLifeHours: 18,
        declineCooldownMinutes: 20,
        historyLimit: 48,
        source: 'DEFAULT',
        updatedAt: null,
        updatedBy: null,
      }),
      updateDispatchLearningSettings: jest.fn().mockResolvedValue({
        lookbackHours: 96,
        halfLifeHours: 24,
        declineCooldownMinutes: 30,
        historyLimit: 60,
        source: 'DATABASE_OVERRIDE',
        updatedAt: '2026-04-23T18:00:00.000Z',
        updatedBy: {
          id: 'admin-1',
          name: 'Admin Orbi',
          role: 'ADMIN',
        },
      }),
    };
    const paymentsService = {
      replayStoredWebhookEvent: jest.fn().mockResolvedValue({
        replayed: true,
        sourceEventId: 'webhook-event-1',
        result: {
          received: true,
          event: 'payment.completed',
          transactionRef: 'orbi_123_ride-request-1',
          provider: 'flutterwave',
          providerReference: 'fw_ref_123',
          reconciledAttemptCount: 1,
          nextAction: 'persisted_idempotent_replay',
        },
      }),
      verifyPaymentAttemptWithProvider: jest.fn().mockResolvedValue({
        verified: true,
        paymentAttemptId: 'payment-1',
        provider: 'flutterwave',
        transactionRef: 'orbi_123_ride-request-1',
        result: {
          received: true,
          event: 'payment.completed',
          transactionRef: 'orbi_123_ride-request-1',
          provider: 'flutterwave',
          providerReference: 'fw_ref_123',
          reconciledAttemptCount: 1,
          nextAction: 'persisted_and_reconciled',
        },
      }),
      refundPaymentAttempt: jest.fn().mockResolvedValue({
        action: 'refunded',
        providerRefundReference: 'flutterwave_refund_payment-1',
        paymentAttempt: {
          id: 'payment-1',
          provider: 'FLUTTERWAVE',
          status: 'REFUNDED',
          amount: 2400,
          currency: 'XOF',
          transactionRef: 'orbi_123_ride-request-1',
          providerReference: 'fw_ref_123',
          updatedAt: '2026-05-01T08:05:00.000Z',
        },
        walletReversal: {
          applied: true,
          walletId: 'wallet-driver-1',
          amount: 1968,
          currency: 'XOF',
        },
      }),
    };

    return {
      prisma,
      realtimeService,
      documentLinksService,
      documentObjectStorageService,
      jobQueueService,
      featureFlagsService,
      healthIncidentJournalService,
      healthService,
      driversService,
      paymentsService,
      service: new AdminService(
        prisma as never,
        realtimeService as never,
        documentLinksService as never,
        documentObjectStorageService as never,
        featureFlagsService as never,
        healthIncidentJournalService as never,
        healthService as never,
        driversService as never,
        paymentsService as never,
        jobQueueService as never,
        { enqueue: jest.fn() } as never,
        {
          getOrSet: jest.fn((_key: string, factory: () => unknown) => factory()),
          invalidate: jest.fn(),
          invalidatePattern: jest.fn(),
        } as never,
      ),
    };
  }

  it('builds a finance dashboard with reconciliation, refund, recovery and payout risks', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-05-01T12:00:00.000Z'));
    const { prisma, service } = createService();

    prisma.paymentAttempt.findMany.mockResolvedValueOnce([
      {
        status: 'SUCCEEDED',
        providerReference: 'provider-1',
        createdAt: new Date('2026-05-01T11:50:00.000Z'),
      },
      {
        status: 'REFUND_PENDING',
        providerReference: null,
        createdAt: new Date('2026-05-01T09:30:00.000Z'),
      },
      {
        status: 'FAILED',
        providerReference: null,
        createdAt: new Date('2026-05-01T11:00:00.000Z'),
      },
    ]);
    prisma.paymentWebhookEvent.findMany.mockResolvedValueOnce([
      { action: 'ignored_unknown_reference' },
      { action: 'ignored_conflicting_provider_reference' },
      { action: 'payment_reconciled' },
    ]);
    prisma.wallet.findMany.mockResolvedValueOnce([
      { balance: new Prisma.Decimal(-3500), currency: 'XOF' },
    ]);
    prisma.driverPayout.findMany.mockResolvedValueOnce([
      { amount: new Prisma.Decimal(12000), currency: 'XOF' },
      { amount: new Prisma.Decimal(8000), currency: 'XOF' },
    ]);

    const result = await service.financeDashboard();

    expect(result.summary).toMatchObject({
      paymentAttempts: 3,
      succeededPayments: 1,
      failedPayments: 1,
      refundPending: 1,
      reconciledPayments: 1,
      reconciliationRate: 33.3,
      oldestUnreconciledAgeMinutes: 150,
      ignoredWebhooks: 2,
      webhookConflicts: 1,
      webhookUnknownReferences: 1,
      walletRecoveryDue: 3500,
      walletsInRecovery: 1,
      payoutBacklog: 20000,
      preparedPayouts: 2,
      currency: 'XOF',
    });
    expect(result.risks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'reconciliation-age',
          severity: 'critical',
          value: 150,
        }),
        expect.objectContaining({
          id: 'wallet-recovery',
          severity: 'watch',
          value: 3500,
        }),
        expect.objectContaining({
          id: 'payout-backlog',
          severity: 'watch',
          value: 2,
        }),
      ]),
    );

    jest.useRealTimers();
  });

  it('builds a live ops payload from active trips and events', async () => {
    const { prisma, service } = createService();

    prisma.trip.findMany.mockResolvedValueOnce([
      {
        id: 'trip-1',
        status: 'DRIVER_ARRIVING',
        pickupAddress: 'Universite Joseph Ki-Zerbo',
        destinationAddress: 'Ouaga 2000',
        actualFare: 1600,
        currency: 'XOF',
        rider: { user: { fullName: 'Awa Rider' } },
        driver: { user: { fullName: 'Issa Driver' } },
        vehicle: { make: 'Yamaha', model: 'Crypton' },
        rideRequest: {
          pickupLatitude: 12.3783,
          pickupLongitude: -1.4994,
          destinationLatitude: 12.3032,
          destinationLongitude: -1.5241,
        },
        events: [
          {
            id: 'event-1',
            eventType: 'TRIP_ACCEPTED',
            createdAt: new Date('2026-04-17T08:01:00.000Z'),
          },
          {
            id: 'event-2',
            eventType: 'PICKUP_CODE_ISSUED',
            createdAt: new Date('2026-04-17T08:02:00.000Z'),
          },
          {
            id: 'event-3',
            eventType: 'INCIDENT_REPORTED',
            createdAt: new Date('2026-04-17T08:03:00.000Z'),
          },
          {
            id: 'event-4',
            eventType: 'ROUTE_POSITION_RECORDED',
            payload: {
              latitude: 12.3776,
              longitude: -1.501,
              accuracyMeters: 12,
              speedKph: 18,
              observedAt: '2026-04-17T08:04:00.000Z',
              sourceRole: 'DRIVER',
            },
            createdAt: new Date('2026-04-17T08:04:00.000Z'),
          },
          {
            id: 'event-5',
            eventType: 'ROUTE_POSITION_RECORDED',
            payload: {
              latitude: 12.3783,
              longitude: -1.4994,
              accuracyMeters: 8,
              speedKph: 0,
              observedAt: '2026-04-17T08:05:00.000Z',
              sourceRole: 'RIDER',
            },
            createdAt: new Date('2026-04-17T08:05:00.000Z'),
          },
        ],
      },
    ]);
    prisma.supportTicket.count.mockResolvedValue(1);
    prisma.rideRequest.count.mockResolvedValue(3);
    prisma.paymentAttempt.findMany.mockResolvedValue([
      {
        status: 'SUCCEEDED',
        provider: 'FLUTTERWAVE',
        providerReference: 'fw_ref_1',
        failureReason: null,
      },
      {
        status: 'REFUNDED',
        provider: 'FLUTTERWAVE',
        providerReference: 'fw_ref_2',
        failureReason: 'Refunded: rider cancellation',
      },
      {
        status: 'REFUND_PENDING',
        provider: 'FLUTTERWAVE',
        providerReference: 'fw_ref_3',
        failureReason: 'Refund requested with provider.',
      },
    ]);

    const result = await service.liveOps();

    expect(result.summary.activeTrips).toBe(1);
    expect(result.summary.openRequests).toBe(3);
    expect(result.trips[0]).toEqual(
      expect.objectContaining({
        riderName: 'Awa Rider',
        driverName: 'Issa Driver',
        pickupCodeIssued: true,
        hasIncident: true,
        incidentCount: 1,
        routeMonitoring: expect.objectContaining({
          state: 'clear',
          alertCount: 0,
          latestPosition: expect.objectContaining({
            latitude: 12.3776,
            longitude: -1.501,
            distanceToPickupKm: expect.any(Number),
            distanceToDestinationKm: expect.any(Number),
            sourceRole: 'DRIVER',
          }),
        }),
        completionGate: expect.objectContaining({
          state: 'not_applicable',
          canOpsOverride: false,
        }),
      }),
    );
    expect(result.trips[0].lastEvent?.label).toBe('Position route recue');
    expect(result.summary.payments.refunded).toBe(1);
    expect(result.summary.payments.refundPending).toBe(1);
    expect(result.summary.payments.reconciled).toBe(3);
    expect(result.alerts).toContain(
      '1 remboursement(s) provider attendent confirmation.',
    );
    expect(result.alerts[0]).toContain('1 trajets actifs');
  });

  it('flags active trips waiting for the first driver route position', async () => {
    const { prisma, service } = createService();

    prisma.trip.findMany.mockResolvedValueOnce([
      {
        id: 'trip-1',
        status: 'DRIVER_ARRIVING',
        pickupAddress: 'Universite Joseph Ki-Zerbo',
        destinationAddress: 'Ouaga 2000',
        actualFare: 1600,
        currency: 'XOF',
        rider: { user: { fullName: 'Awa Rider' } },
        driver: { user: { fullName: 'Issa Driver' } },
        vehicle: { make: 'Yamaha', model: 'Crypton' },
        rideRequest: {
          pickupLatitude: 12.3783,
          pickupLongitude: -1.4994,
          destinationLatitude: 12.3032,
          destinationLongitude: -1.5241,
        },
        events: [
          {
            id: 'event-1',
            eventType: 'TRIP_ACCEPTED',
            createdAt: new Date('2026-04-17T08:01:00.000Z'),
          },
          {
            id: 'event-2',
            eventType: 'ROUTE_POSITION_RECORDED',
            payload: {
              latitude: 12.3783,
              longitude: -1.4994,
              accuracyMeters: 8,
              speedKph: 0,
              observedAt: '2026-04-17T08:05:00.000Z',
              sourceRole: 'RIDER',
            },
            createdAt: new Date('2026-04-17T08:05:00.000Z'),
          },
        ],
      },
    ]);
    prisma.supportTicket.count.mockResolvedValue(0);
    prisma.rideRequest.count.mockResolvedValue(0);

    const result = await service.liveOps();

    expect(result.trips[0].routeMonitoring).toEqual(
      expect.objectContaining({
        state: 'unknown',
        lastPositionAt: null,
        latestPosition: null,
      }),
    );
    expect(result.alerts).toContain(
      '1 trajet(s) actif(s) attendent le premier signal GPS chauffeur.',
    );
  });

  it('flags active trips with stale driver route position in liveOps', async () => {
    const { prisma, service } = createService();
    const stalePositionAt = new Date(Date.now() - 12 * 60 * 1000);

    prisma.trip.findMany.mockResolvedValueOnce([
      {
        id: 'trip-stale-gps-1',
        status: 'DRIVER_ARRIVING',
        pickupAddress: 'Universite Joseph Ki-Zerbo',
        destinationAddress: 'Ouaga 2000',
        actualFare: 1600,
        currency: 'XOF',
        rider: { user: { fullName: 'Awa Rider' } },
        driver: { user: { fullName: 'Issa Driver' } },
        vehicle: { make: 'Yamaha', model: 'Crypton' },
        rideRequest: {
          pickupLatitude: 12.3783,
          pickupLongitude: -1.4994,
          destinationLatitude: 12.3032,
          destinationLongitude: -1.5241,
        },
        events: [
          {
            id: 'event-1',
            eventType: 'TRIP_ACCEPTED',
            createdAt: new Date(Date.now() - 20 * 60 * 1000),
          },
          {
            id: 'event-2',
            eventType: 'ROUTE_POSITION_RECORDED',
            payload: {
              latitude: 12.3776,
              longitude: -1.501,
              accuracyMeters: 8,
              speedKph: 0,
              observedAt: stalePositionAt.toISOString(),
              sourceRole: 'DRIVER',
            },
            createdAt: stalePositionAt,
          },
        ],
      },
    ]);
    prisma.supportTicket.count.mockResolvedValue(0);
    prisma.rideRequest.count.mockResolvedValue(0);

    const result = await service.liveOps();

    expect(result.summary.staleDriverSignals).toBe(1);
    expect(result.trips[0].routeMonitoring.signalState).toEqual(
      expect.objectContaining({
        state: 'stale',
        ageMinutes: expect.any(Number),
      }),
    );
    expect(result.alerts).toContain(
      '1 trajet(s) actif(s) ont un signal GPS chauffeur ancien.',
    );
  });

  it('exposes completion gate blockers for active in-progress trips', async () => {
    const { prisma, service } = createService();

    prisma.trip.findMany.mockResolvedValueOnce([
      {
        id: 'trip-1',
        status: 'IN_PROGRESS',
        pickupAddress: 'Universite Joseph Ki-Zerbo',
        destinationAddress: 'Ouaga 2000',
        actualFare: 1600,
        currency: 'XOF',
        rider: { user: { fullName: 'Awa Rider' } },
        driver: { user: { fullName: 'Issa Driver' } },
        vehicle: { make: 'Yamaha', model: 'Crypton' },
        rideRequest: {
          pickupLatitude: 12.3783,
          pickupLongitude: -1.4994,
          destinationLatitude: 12.3032,
          destinationLongitude: -1.5241,
        },
        events: [
          {
            id: 'event-1',
            eventType: 'TRIP_STARTED',
            createdAt: new Date(),
          },
          {
            id: 'event-2',
            eventType: 'ROUTE_POSITION_RECORDED',
            payload: {
              latitude: 12.3776,
              longitude: -1.501,
              accuracyMeters: 420,
              speedKph: 126,
              observedAt: new Date().toISOString(),
              sourceRole: 'DRIVER',
            },
            createdAt: new Date(),
          },
        ],
      },
    ]);
    prisma.rideRequest.count.mockResolvedValue(0);

    const result = await service.liveOps();

    expect(result.trips[0].completionGate).toEqual(
      expect.objectContaining({
        state: 'blocked',
        label: 'Finalisation bloquee',
        canOpsOverride: true,
      }),
    );
    expect(result.trips[0].completionGate.reason).toContain('Precision GPS');
  });

  it('stalledMatchedTrips is 0 when a MATCHED trip was just created', async () => {
    const { prisma, service } = createService();

    prisma.trip.findMany.mockResolvedValueOnce([
      {
        id: 'trip-fresh',
        status: 'MATCHED',
        createdAt: new Date(),
        pickupAddress: 'Gounghin',
        destinationAddress: 'Patte d Oie',
        actualFare: 1200,
        currency: 'XOF',
        rider: { user: { fullName: 'Rider A' } },
        driver: { user: { fullName: 'Driver B' } },
        vehicle: { make: 'Honda', model: 'Wave' },
        rideRequest: {
          pickupLatitude: 12.362,
          pickupLongitude: -1.533,
          destinationLatitude: 12.344,
          destinationLongitude: -1.528,
        },
        events: [],
      },
    ]);
    prisma.rideRequest.count.mockResolvedValue(0);

    const result = await service.liveOps();

    expect(result.summary.stalledMatchedTrips).toBe(0);
    expect(result.alerts).toContain('Aucun trajet MATCHED en dépassement SLA.');
  });

  it('reports SLA breach when a MATCHED trip has no DRIVER_ARRIVING within 10 minutes', async () => {
    const { prisma, service } = createService();

    const stalledCreatedAt = new Date(Date.now() - 12 * 60 * 1000);

    prisma.trip.findMany.mockResolvedValueOnce([
      {
        id: 'trip-stalled',
        status: 'MATCHED',
        createdAt: stalledCreatedAt,
        pickupAddress: 'Gounghin',
        destinationAddress: 'Patte d Oie',
        actualFare: 1200,
        currency: 'XOF',
        rider: { user: { fullName: 'Rider A' } },
        driver: { user: { fullName: 'Driver B' } },
        vehicle: { make: 'Honda', model: 'Wave' },
        rideRequest: {
          pickupLatitude: 12.362,
          pickupLongitude: -1.533,
          destinationLatitude: 12.344,
          destinationLongitude: -1.528,
        },
        events: [
          {
            id: 'event-1',
            eventType: 'TRIP_ACCEPTED',
            createdAt: stalledCreatedAt,
          },
        ],
      },
    ]);
    prisma.rideRequest.count.mockResolvedValue(0);

    const result = await service.liveOps();

    expect(result.summary.stalledMatchedTrips).toBe(1);
    expect(result.alerts).toContain(
      '1 trajet(s) MATCHED depuis plus de 10 min sans signal DRIVER_ARRIVING — vérifier disponibilité chauffeur.',
    );
  });

  it('does not count a MATCHED trip as stalled when a DRIVER_ARRIVING event is present', async () => {
    const { prisma, service } = createService();

    const oldCreatedAt = new Date(Date.now() - 15 * 60 * 1000);

    prisma.trip.findMany.mockResolvedValueOnce([
      {
        id: 'trip-progressing',
        status: 'MATCHED',
        createdAt: oldCreatedAt,
        pickupAddress: 'Gounghin',
        destinationAddress: 'Patte d Oie',
        actualFare: 1200,
        currency: 'XOF',
        rider: { user: { fullName: 'Rider A' } },
        driver: { user: { fullName: 'Driver B' } },
        vehicle: { make: 'Honda', model: 'Wave' },
        rideRequest: {
          pickupLatitude: 12.362,
          pickupLongitude: -1.533,
          destinationLatitude: 12.344,
          destinationLongitude: -1.528,
        },
        events: [
          {
            id: 'event-1',
            eventType: 'TRIP_ACCEPTED',
            createdAt: oldCreatedAt,
          },
          {
            id: 'event-2',
            eventType: 'DRIVER_ARRIVING',
            createdAt: new Date(Date.now() - 5 * 60 * 1000),
          },
        ],
      },
    ]);
    prisma.rideRequest.count.mockResolvedValue(0);

    const result = await service.liveOps();

    expect(result.summary.stalledMatchedTrips).toBe(0);
    expect(result.alerts).toContain('Aucun trajet MATCHED en dépassement SLA.');
  });

  it('surfaces recent cancellations with declared reason in liveOps', async () => {
    const { prisma, service } = createService();

    const cancelledAt = new Date(Date.now() - 30 * 60 * 1000);

    // first findMany: active trips (empty)
    // second findMany: recently cancelled trips
    prisma.trip.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([
      {
        id: 'trip-cancelled-1',
        pickupAddress: 'Gounghin',
        destinationAddress: 'Patte d Oie',
        updatedAt: cancelledAt,
        rider: { user: { fullName: 'Awa Rider' } },
        driver: { user: { fullName: 'Issa Driver' } },
        events: [
          {
            id: 'event-cancel-1',
            eventType: 'TRIP_CANCELLED',
            createdAt: cancelledAt,
            payload: {
              status: 'CANCELLED',
              actorRole: 'RIDER',
              cancellationReason: 'Chauffeur en retard',
            },
          },
        ],
      },
    ]);
    prisma.rideRequest.count.mockResolvedValue(0);

    const result = await service.liveOps();

    expect(result.recentCancellations).toHaveLength(1);
    expect(result.recentCancellations[0]).toEqual(
      expect.objectContaining({
        id: 'trip-cancelled-1',
        riderName: 'Awa Rider',
        driverName: 'Issa Driver',
        route: 'Gounghin → Patte d Oie',
        cancelledBy: 'RIDER',
        cancellationReason: 'Chauffeur en retard',
        cancelledAt: cancelledAt.toISOString(),
      }),
    );
  });

  it('returns an empty recentCancellations list when no trips were cancelled in the last 2h', async () => {
    const { prisma, service } = createService();

    prisma.trip.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    prisma.rideRequest.count.mockResolvedValue(0);

    const result = await service.liveOps();

    expect(result.recentCancellations).toEqual([]);
  });

  // ── lowConfidenceDrivers extraction ───────────────────────────────────────

  it('surfaces low-confidence drivers (acceptanceRate < 50%, >= 5 offers) in liveOps', async () => {
    const { prisma, service } = createService();

    prisma.trip.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    prisma.rideRequest.count.mockResolvedValue(0);

    const buildLogs = (
      userId: string,
      accepted: number,
      declined: number,
      expired: number,
      fullName: string,
    ) => {
      const logs: Array<{
        userId: string;
        action: string;
        user: { fullName: string };
      }> = [];
      for (let i = 0; i < accepted; i++) {
        logs.push({
          userId,
          action: 'DISPATCH_RESERVATION_ACCEPTED',
          user: { fullName },
        });
      }
      for (let i = 0; i < declined; i++) {
        logs.push({
          userId,
          action: 'DISPATCH_RESERVATION_DECLINED',
          user: { fullName },
        });
      }
      for (let i = 0; i < expired; i++) {
        logs.push({
          userId,
          action: 'DISPATCH_RESERVATION_EXPIRED',
          user: { fullName },
        });
      }
      return logs;
    };

    // Driver A: 2/10 accepted = 20% — low confidence, >= 5 offers → should appear
    // Driver B: 8/10 accepted = 80% — high acceptance → should NOT appear
    // Driver C: 1/3 accepted = 33% — low but < 5 offers → should NOT appear (insufficient data)
    prisma.auditLog.findMany.mockResolvedValue([
      ...buildLogs('user-driver-a', 2, 3, 5, 'Driver A'), // 2/10 = 20%
      ...buildLogs('user-driver-b', 8, 1, 1, 'Driver B'), // 8/10 = 80%
      ...buildLogs('user-driver-c', 1, 1, 1, 'Driver C'), // 1/3 = 33%, but only 3 total
    ]);

    const result = await service.liveOps();

    expect(result.lowConfidenceDrivers).toHaveLength(1);
    expect(result.lowConfidenceDrivers[0]).toMatchObject({
      driverId: 'user-driver-a',
      driverName: 'Driver A',
      total: 10,
      accepted: 2,
      acceptanceRate: 20,
    });
  });

  it('sorts low-confidence drivers by acceptanceRate ascending (worst first)', async () => {
    const { prisma, service } = createService();

    prisma.trip.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    prisma.rideRequest.count.mockResolvedValue(0);

    const buildLogs = (
      userId: string,
      accepted: number,
      total: number,
      fullName: string,
    ) => {
      const expired = total - accepted;
      const logs: Array<{
        userId: string;
        action: string;
        user: { fullName: string };
      }> = [];
      for (let i = 0; i < accepted; i++) {
        logs.push({
          userId,
          action: 'DISPATCH_RESERVATION_ACCEPTED',
          user: { fullName },
        });
      }
      for (let i = 0; i < expired; i++) {
        logs.push({
          userId,
          action: 'DISPATCH_RESERVATION_EXPIRED',
          user: { fullName },
        });
      }
      return logs;
    };

    prisma.auditLog.findMany.mockResolvedValue([
      ...buildLogs('user-b', 2, 10, 'Driver B'), // 20%
      ...buildLogs('user-a', 1, 10, 'Driver A'), // 10%
      ...buildLogs('user-c', 4, 10, 'Driver C'), // 40%
    ]);

    const result = await service.liveOps();

    expect(result.lowConfidenceDrivers.map((d) => d.acceptanceRate)).toEqual([
      10, 20, 40,
    ]);
  });

  it('returns empty lowConfidenceDrivers when all drivers have high acceptance rates', async () => {
    const { prisma, service } = createService();

    prisma.trip.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    prisma.rideRequest.count.mockResolvedValue(0);

    const goodLogs: Array<{
      userId: string;
      action: string;
      user: { fullName: string };
    }> = [];
    for (let i = 0; i < 8; i++) {
      goodLogs.push({
        userId: 'user-good',
        action: 'DISPATCH_RESERVATION_ACCEPTED',
        user: { fullName: 'Good Driver' },
      });
    }
    for (let i = 0; i < 2; i++) {
      goodLogs.push({
        userId: 'user-good',
        action: 'DISPATCH_RESERVATION_EXPIRED',
        user: { fullName: 'Good Driver' },
      });
    }
    prisma.auditLog.findMany.mockResolvedValue(goodLogs);

    const result = await service.liveOps();

    expect(result.lowConfidenceDrivers).toEqual([]);
  });

  it('lists job queue entries for operations triage', async () => {
    const { jobQueueService, service } = createService();

    const result = await service.jobQueue({
      page: 1,
      pageSize: 10,
      kind: 'PAYMENT_WEBHOOK',
      status: 'DEAD_LETTER',
    });

    expect(jobQueueService.list).toHaveBeenCalledWith({
      page: 1,
      pageSize: 10,
      kind: 'PAYMENT_WEBHOOK',
      status: 'DEAD_LETTER',
    });
    expect(result.jobs[0]).toEqual(
      expect.objectContaining({
        id: 'job-dead-1',
        status: 'DEAD_LETTER',
        failedAt: '2026-05-08T10:05:00.000Z',
        diagnostics: expect.objectContaining({
          owner: 'finance',
          severity: 'critical',
          canRequeueSafely: false,
          riskSignals: expect.arrayContaining(['provider:FLUTTERWAVE']),
        }),
      }),
    );
    expect(result.snapshot.counts[0].count).toBe(1);
  });

  it('requeues dead-letter jobs with audit and realtime signals', async () => {
    const { jobQueueService, prisma, realtimeService, service } =
      createService();

    const result = await service.requeueJob('job-dead-1', authContext());

    expect(jobQueueService.requeueDeadLetter).toHaveBeenCalledWith(
      'job-dead-1',
    );
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'ops-1',
        action: 'JOB_QUEUE_DEAD_LETTER_REQUEUED',
        entityType: 'JOB_QUEUE_ENTRY',
        entityId: 'job-dead-1',
      }),
    });
    expect(realtimeService.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: 'admin',
        type: 'job-queue.requeued',
        entityId: 'job-dead-1',
      }),
    );
    expect(result.job.status).toBe('PENDING');
  });

  it('keeps launch readiness limited until OWASP/NIST assurance gates are covered', async () => {
    const { service } = createService();

    const result = await service.launchReadiness();

    expect(result.decision).toMatchObject({
      state: 'limited',
      label: 'pilote limite seulement',
    });
    expect(result.summary).toMatchObject({
      failedChecks: 0,
      warningChecks: 1,
      totalChecks: 13,
    });
    expect(result.nextActions).toEqual([
      expect.objectContaining({
        checkId: 'security-assurance',
        severity: 'warning',
        owner: 'engineering',
      }),
    ]);
    expect(result.actionSummary).toMatchObject({
      totalActions: 1,
      acknowledgedActions: 0,
      remainingActions: 1,
      completionRate: 0,
    });
    expect(result.safetyBenchmark.summary).toMatchObject({
      totalCapabilities: 8,
      activeCapabilities: 8,
      partialCapabilities: 0,
      criticalGaps: 0,
      competitorParityRate: 100,
    });
    expect(result.securityAssurance.summary).toMatchObject({
      totalGates: 6,
      coveredGates: 4,
      partialGates: 2,
      missingGates: 0,
      criticalOpenGates: 1,
      coverageRate: 83.3,
      launchPosture: 'limited',
    });
    expect(result.securityAssurance.gates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'api-bola-rbac',
          status: 'covered',
          frameworks: expect.arrayContaining(['OWASP API Top 10']),
        }),
        expect.objectContaining({
          id: 'mobile-masvs',
          status: 'partial',
          frameworks: expect.arrayContaining(['OWASP MASVS']),
        }),
      ]),
    );
    expect(result.fieldQuality).toMatchObject({
      state: 'excellent',
      score: expect.any(Number),
      blockedSignals: 0,
    });
    expect(result.fieldQuality.signals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'money-reliability',
          state: 'excellent',
        }),
        expect.objectContaining({
          id: 'safety-trust',
          score: 100,
        }),
      ]),
    );
    expect(result.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'runtime-production-readiness',
          state: 'pass',
        }),
        expect.objectContaining({
          id: 'admin-realtime',
          state: 'pass',
        }),
        expect.objectContaining({
          id: 'safety-benchmark',
          state: 'pass',
        }),
        expect.objectContaining({
          id: 'mobile-observability-gate',
          state: 'pass',
        }),
        expect.objectContaining({
          id: 'security-assurance',
          state: 'warn',
        }),
      ]),
    );
  });

  it('blocks launch readiness when runtime production risk is high', async () => {
    const { healthService, service } = createService();

    healthService.check.mockResolvedValue({
      infrastructure: {
        realtime: {
          degraded: false,
          degradeReason: null,
          activeStreams: 1,
          publishedEvents: 4,
        },
      },
      operations: {
        productionReadiness: {
          environment: 'production',
          riskLevel: 'high',
          failedChecks: 2,
          warningChecks: 0,
          checks: [],
        },
      },
    });

    const result = await service.launchReadiness();

    expect(result.decision.state).toBe('blocked');
    expect(result.summary.failedChecks).toBe(1);
    expect(result.fieldQuality.state).toBe('blocked');
    expect(result.fieldQuality.signals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'runtime-mobile-stability',
          state: 'blocked',
        }),
      ]),
    );
    expect(result.nextActions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          checkId: 'runtime-production-readiness',
          severity: 'blocking',
          owner: 'engineering',
        }),
      ]),
    );
    expect(result.actionSummary).toMatchObject({
      totalActions: 2,
      acknowledgedActions: 0,
      remainingActions: 2,
      blockingActions: 1,
      remainingBlockingActions: 1,
    });
    expect(result.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'runtime-production-readiness',
          state: 'fail',
        }),
        expect.objectContaining({
          id: 'security-assurance',
          state: 'warn',
        }),
      ]),
    );
  });

  it('returns persistent acknowledgements for active launch readiness actions', async () => {
    const { healthService, prisma, service } = createService();

    healthService.check.mockResolvedValue({
      infrastructure: {
        realtime: {
          degraded: false,
          degradeReason: null,
          activeStreams: 1,
          publishedEvents: 4,
        },
      },
      operations: {
        productionReadiness: {
          environment: 'production',
          riskLevel: 'high',
          failedChecks: 1,
          warningChecks: 0,
          checks: [],
        },
      },
    });
    prisma.auditLog.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          entityId: 'runtime-production-readiness',
          createdAt: new Date('2026-05-01T12:10:00.000Z'),
          metadata: {
            owner: 'engineering',
            severity: 'blocking',
            notes: 'Redis backplane assigne.',
          },
          user: {
            id: 'ops-1',
            fullName: 'Ops Orbi',
            role: 'OPS',
          },
        },
      ]);

    const result = await service.launchReadiness();

    expect(result.acknowledgements).toEqual([
      {
        checkId: 'runtime-production-readiness',
        owner: 'engineering',
        severity: 'blocking',
        acknowledgedAt: '2026-05-01T12:10:00.000Z',
        actor: {
          id: 'ops-1',
          name: 'Ops Orbi',
          role: 'OPS',
        },
        notes: 'Redis backplane assigne.',
      },
    ]);
    expect(result.actionSummary).toMatchObject({
      totalActions: 2,
      acknowledgedActions: 1,
      remainingActions: 1,
      blockingActions: 1,
      acknowledgedBlockingActions: 1,
      remainingBlockingActions: 0,
      completionRate: 50,
    });
  });

  it('keeps launch readiness limited when ops signals need stabilization', async () => {
    const { prisma, service } = createService();

    prisma.supportTicket.count
      .mockResolvedValueOnce(7)
      .mockResolvedValueOnce(1);
    prisma.driverProfile.count.mockResolvedValue(4);
    prisma.driverDocument.count.mockResolvedValue(2);
    prisma.paymentAttempt.count.mockResolvedValue(1);
    prisma.paymentWebhookEvent.count.mockResolvedValue(1);
    prisma.wallet.count.mockResolvedValue(1);
    prisma.driverPayout.count.mockResolvedValue(2);

    const result = await service.launchReadiness();

    expect(result.decision.state).toBe('limited');
    expect(result.summary.warningChecks).toBeGreaterThanOrEqual(1);
    expect(result.nextActions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          checkId: 'support-load',
          severity: 'warning',
          owner: 'support',
        }),
        expect.objectContaining({
          checkId: 'payment-webhooks',
          owner: 'finance',
        }),
        expect.objectContaining({
          checkId: 'payment-production-gate',
          owner: 'finance',
        }),
      ]),
    );
    expect(result.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'support-load',
          state: 'warn',
        }),
        expect.objectContaining({
          id: 'payment-webhooks',
          state: 'warn',
        }),
        expect.objectContaining({
          id: 'payment-production-gate',
          state: 'warn',
        }),
      ]),
    );
  });

  it('blocks launch readiness when critical mobile crashes are recurrent', async () => {
    const { prisma, service } = createService();

    prisma.userSession.count.mockResolvedValue(10);
    prisma.auditLog.findMany.mockResolvedValueOnce([
      {
        metadata: {
          sessionId: 'session-1',
          classification: { severity: 'critical' },
        },
      },
      {
        metadata: {
          sessionId: 'session-2',
          classification: { severity: 'critical' },
        },
      },
      {
        metadata: {
          sessionId: 'session-2',
          classification: { severity: 'critical' },
        },
      },
    ]);

    const result = await service.launchReadiness();

    expect(result.decision.state).toBe('blocked');
    expect(result.summary.failedChecks).toBe(1);
    expect(result.nextActions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          checkId: 'mobile-observability-gate',
          severity: 'blocking',
          owner: 'engineering',
        }),
      ]),
    );
    expect(result.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'mobile-observability-gate',
          state: 'fail',
          detail: expect.stringContaining('3 erreur(s) critique(s)'),
        }),
      ]),
    );
  });

  it('audits launch readiness action acknowledgements', async () => {
    const { healthService, prisma, realtimeService, service } = createService();

    healthService.check.mockResolvedValue({
      infrastructure: {
        realtime: {
          degraded: false,
          degradeReason: null,
          activeStreams: 1,
          publishedEvents: 4,
        },
      },
      operations: {
        productionReadiness: {
          environment: 'production',
          riskLevel: 'high',
          failedChecks: 1,
          warningChecks: 0,
          checks: [],
        },
      },
    });

    const result = await service.acknowledgeLaunchReadinessAction(
      'runtime-production-readiness',
      {
        owner: 'engineering',
        notes: 'Redis backplane assigne a engineering.',
        idempotencyKey: 'launch-runtime-1',
      },
      authContext(),
    );

    expect(result.acknowledgement).toMatchObject({
      checkId: 'runtime-production-readiness',
      owner: 'engineering',
      severity: 'blocking',
    });
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'ops-1',
        action: 'LAUNCH_READINESS_ACTION_ACKNOWLEDGED',
        entityType: 'LAUNCH_READINESS_ACTION',
        entityId: 'runtime-production-readiness',
        metadata: expect.objectContaining({
          owner: 'engineering',
          severity: 'blocking',
          notes: 'Redis backplane assigne a engineering.',
          idempotencyKey: 'launch-runtime-1',
        }),
      }),
    });
    expect(realtimeService.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: 'admin',
        type: 'system.launch-readiness-action-acknowledged',
        entityId: 'runtime-production-readiness',
      }),
    );
  });

  it('rejects acknowledgement for inactive launch readiness actions', async () => {
    const { service } = createService();

    await expect(
      service.acknowledgeLaunchReadinessAction(
        'runtime-production-readiness',
        {
          owner: 'engineering',
          notes: 'No active blocker.',
        },
        authContext(),
      ),
    ).rejects.toThrow('Launch readiness action is not currently active.');
  });

  it('returns a privacy-minimized support queue with extracted trip ids', async () => {
    const { prisma, service } = createService();

    prisma.supportTicket.findMany.mockResolvedValue([
      {
        id: 'ticket-1',
        subject: 'Incident trajet tripabc123 pour awa@orbi.test',
        description:
          'Type: SAFETY_ALERT phone +226 70 00 00 00 token=secret-session-token',
        status: 'OPEN',
        priority: 3,
        createdAt: new Date('2026-04-17T09:00:00.000Z'),
        updatedAt: new Date('2026-04-17T09:05:00.000Z'),
        user: {
          fullName: 'Awa Rider',
          role: 'RIDER',
        },
      },
    ]);

    prisma.supportTicket.count.mockResolvedValue(1);

    const result = await service.supportTickets({
      page: 1,
      pageSize: 10,
    });

    expect(result.tickets[0]).toEqual(
      expect.objectContaining({
        id: 'ticket-1',
        subject: 'Incident trajet tripabc123 pour [email masque]',
        description:
          'Type: SAFETY_ALERT phone [telephone masque] token=[masque]',
        requesterName: 'Awa R.',
        tripId: 'tripabc123',
      }),
    );
    expect(prisma.supportTicket.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: {
          user: {
            select: {
              fullName: true,
              role: true,
            },
          },
        },
      }),
    );
    expect(result.meta).toEqual({
      page: 1,
      pageSize: 10,
      total: 1,
      pageCount: 1,
    });
  });

  it('returns the current dispatch learning settings snapshot', async () => {
    const { driversService, prisma, service } = createService();

    prisma.auditLog.findMany.mockResolvedValue([
      {
        id: 'audit-dispatch-1',
        createdAt: new Date('2026-04-23T18:00:00.000Z'),
        metadata: {
          resetToDefaults: false,
          source: 'DATABASE_OVERRIDE',
          previous: {
            lookbackHours: 72,
            halfLifeHours: 18,
            declineCooldownMinutes: 20,
            historyLimit: 48,
          },
          next: {
            lookbackHours: 96,
            halfLifeHours: 24,
            declineCooldownMinutes: 30,
            historyLimit: 60,
          },
        },
        user: {
          id: 'admin-1',
          fullName: 'Admin Orbi',
          role: 'ADMIN',
        },
      },
    ]);

    const result = await service.dispatchSettings();

    expect(driversService.getDispatchLearningSettings).toHaveBeenCalled();
    expect(result.settings.source).toBe('DEFAULT');
    expect(result.history[0]).toEqual(
      expect.objectContaining({
        id: 'audit-dispatch-1',
        source: 'DATABASE_OVERRIDE',
        resetToDefaults: false,
        actor: expect.objectContaining({
          id: 'admin-1',
        }),
        before: expect.objectContaining({
          lookbackHours: 72,
        }),
        after: expect.objectContaining({
          lookbackHours: 96,
        }),
      }),
    );
  });

  it('builds pricing calibration metrics from recent requests and trips', async () => {
    const { prisma, service } = createService();

    prisma.rideRequest.findMany.mockResolvedValue([
      {
        id: 'request-1',
        status: 'MATCHED',
        requestedVehicleType: 'MOTORCYCLE',
        requestedServiceTier: 'MOTO_STANDARD',
        pricingCity: 'OUAGADOUGOU',
        districtProfile: 'UNIVERSITY',
        estimatedFare: 1500,
        estimatedDistanceKm: 5,
        createdAt: new Date('2026-04-25T08:00:00.000Z'),
        trip: {
          status: 'COMPLETED',
          actualFare: 1600,
          distanceKm: 5,
          createdAt: new Date('2026-04-25T08:04:00.000Z'),
        },
      },
      {
        id: 'request-2',
        status: 'CANCELLED',
        requestedVehicleType: 'CAR',
        requestedServiceTier: 'CAR_STANDARD',
        pricingCity: 'OUAGADOUGOU',
        districtProfile: 'UNIVERSITY',
        estimatedFare: 3200,
        estimatedDistanceKm: 7,
        createdAt: new Date('2026-04-25T08:10:00.000Z'),
        trip: null,
      },
      {
        id: 'request-3',
        status: 'EXPIRED',
        requestedVehicleType: 'MOTORCYCLE',
        requestedServiceTier: 'MOTO_STANDARD',
        pricingCity: 'OUAGADOUGOU',
        districtProfile: 'UNIVERSITY',
        estimatedFare: 1400,
        estimatedDistanceKm: 4,
        createdAt: new Date('2026-04-25T08:20:00.000Z'),
        trip: null,
      },
    ]);
    prisma.paymentAttempt.findMany.mockResolvedValue([
      {
        rideRequestId: 'request-1',
        status: 'SUCCEEDED',
        amount: 1600,
      },
      {
        rideRequestId: 'request-2',
        status: 'FAILED',
        amount: 3200,
      },
    ]);

    const result = await service.pricingCalibration();

    expect(prisma.rideRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: {
          trip: true,
        },
      }),
    );
    expect(result.summary).toEqual(
      expect.objectContaining({
        totalRequests: 3,
        matchedRequests: 1,
        completedTrips: 1,
        cancelledRequests: 1,
        expiredRequests: 1,
        paidRequests: 1,
        acceptanceRate: 33.3,
        completionRate: 33.3,
        cancellationRate: 66.7,
        averageFare: 1600,
        averageDriverPayout: 1312,
        averagePickupWaitMinutes: 4,
      }),
    );
    expect(result.segments[0]).toEqual(
      expect.objectContaining({
        vehicleType: 'MOTORCYCLE',
        serviceTier: 'MOTO_STANDARD',
        requests: 2,
      }),
    );
    expect(result.timeWindows[0]).toEqual(
      expect.objectContaining({
        key: 'MORNING_PEAK',
        label: 'Pic matin',
        requests: 3,
        targetAcceptanceRate: 70,
      }),
    );
    expect(result.geographySegments[0]).toEqual(
      expect.objectContaining({
        city: 'OUAGADOUGOU',
        districtProfile: 'UNIVERSITY',
        requests: 3,
      }),
    );
    expect(result.recommendations[0]).toEqual(
      expect.objectContaining({
        scope: 'Global',
        priority: 'HIGH',
      }),
    );
    expect(result.alerts[0]).toContain('Acceptation sous le seuil cible');
  });

  it('updates dispatch learning settings and writes an audit event', async () => {
    const { prisma, driversService, service } = createService();

    prisma.auditLog.create.mockResolvedValue(undefined);
    prisma.auditLog.findMany.mockResolvedValue([]);
    driversService.getDispatchLearningSettings
      .mockResolvedValueOnce({
        lookbackHours: 72,
        halfLifeHours: 18,
        declineCooldownMinutes: 20,
        historyLimit: 48,
        source: 'DEFAULT',
        updatedAt: null,
        updatedBy: null,
      })
      .mockResolvedValueOnce({
        lookbackHours: 96,
        halfLifeHours: 24,
        declineCooldownMinutes: 30,
        historyLimit: 60,
        source: 'DATABASE_OVERRIDE',
        updatedAt: '2026-04-23T18:00:00.000Z',
        updatedBy: {
          id: 'admin-1',
          name: 'Admin Orbi',
          role: 'ADMIN',
        },
      });

    const result = await service.updateDispatchSettings(
      {
        lookbackHours: 96,
        halfLifeHours: 24,
      },
      {
        user: {
          id: 'admin-1',
          role: 'ADMIN',
          fullName: 'Admin Orbi',
        },
      } as never,
    );

    expect(driversService.updateDispatchLearningSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        lookbackHours: 96,
        halfLifeHours: 24,
        actor: {
          id: 'admin-1',
          name: 'Admin Orbi',
          role: 'ADMIN',
        },
      }),
    );
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'admin-1',
        action: 'DISPATCH_SETTINGS_UPDATED',
        entityType: 'SYSTEM_CONFIGURATION',
        entityId: 'dispatch-learning',
        metadata: expect.objectContaining({
          previous: expect.objectContaining({
            lookbackHours: 72,
          }),
          next: expect.objectContaining({
            lookbackHours: 96,
          }),
        }),
      }),
    });
    expect(result.settings.source).toBe('DATABASE_OVERRIDE');
    expect(result.history).toEqual([]);
  });

  it('returns a paginated payment webhook event journal', async () => {
    const { prisma, service } = createService();

    prisma.paymentWebhookEvent.findMany.mockResolvedValue([
      {
        id: 'webhook-event-1',
        provider: 'FLUTTERWAVE',
        eventType: 'payment.completed',
        transactionRef: 'orbi_123_ride-request-1',
        providerReference: 'fw_ref_123',
        action: 'persisted_and_reconciled',
        reconciledAttemptCount: 1,
        signatureVerified: true,
        rawBodyHash: 'raw_hash_123',
        paymentAttemptId: 'payment-1',
        userId: 'user-1',
        paymentAttempt: {
          status: 'SUCCEEDED',
          amount: 2400,
          currency: 'XOF',
          rideRequestId: 'ride-request-1',
          failureReason: null,
          updatedAt: new Date('2026-04-27T09:31:00.000Z'),
        },
        payload: {
          event: 'payment.completed',
          customerPhoneNumber: '+22670000000',
          transactionRef: 'orbi_123_ride-request-1',
        },
        createdAt: new Date('2026-04-27T09:30:00.000Z'),
      },
    ]);
    prisma.paymentWebhookEvent.count.mockResolvedValue(1);

    const result = await service.paymentWebhookEvents({
      page: 1,
      pageSize: 10,
      provider: 'FLUTTERWAVE',
      action: 'persisted_and_reconciled',
    });

    expect(prisma.paymentWebhookEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          provider: 'FLUTTERWAVE',
          action: 'persisted_and_reconciled',
        }),
      }),
    );
    expect(result.events[0]).toEqual(
      expect.objectContaining({
        id: 'webhook-event-1',
        signatureVerified: true,
        payloadPreview: {
          event: 'payment.completed',
          transactionRef: 'orbi_123_ride-request-1',
        },
        paymentAttempt: expect.objectContaining({
          status: 'SUCCEEDED',
          amount: 2400,
          updatedAt: '2026-04-27T09:31:00.000Z',
        }),
        createdAt: '2026-04-27T09:30:00.000Z',
      }),
    );
    expect(result.meta.total).toBe(1);
    expect(result.summary).toEqual({
      paymentEvents: 1,
      refundEvents: 0,
      ignoredEvents: 0,
    });
  });

  it('filters payment webhook events by refund kind', async () => {
    const { prisma, service } = createService();

    prisma.paymentWebhookEvent.findMany.mockResolvedValue([
      {
        id: 'webhook-event-refund-1',
        provider: 'FLUTTERWAVE',
        eventType: 'refund.completed',
        transactionRef: 'orbi_123_ride-request-1',
        providerReference: 'fw_refund_123',
        action: 'refund_processed',
        reconciledAttemptCount: 1,
        signatureVerified: true,
        rawBodyHash: 'raw_hash_123',
        paymentAttemptId: 'payment-1',
        userId: 'user-1',
        paymentAttempt: {
          status: 'REFUNDED',
          amount: 2400,
          currency: 'XOF',
          rideRequestId: 'ride-request-1',
          failureReason: 'Refunded by provider.',
          updatedAt: new Date('2026-05-01T09:31:00.000Z'),
        },
        payload: {
          event: 'refund.completed',
          data: {
            id: 'fw_refund_123',
            status: 'completed',
          },
        },
        createdAt: new Date('2026-05-01T09:30:00.000Z'),
      },
    ]);
    prisma.paymentWebhookEvent.count.mockResolvedValue(1);

    const result = await service.paymentWebhookEvents({
      page: 1,
      pageSize: 10,
      kind: 'refund',
    });

    expect(prisma.paymentWebhookEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          action: {
            in: ['refund_processed', 'refund_still_pending'],
          },
        }),
      }),
    );
    expect(result.summary).toEqual({
      paymentEvents: 0,
      refundEvents: 1,
      ignoredEvents: 0,
    });
    expect(result.events[0].action).toBe('refund_processed');
  });

  it('returns a redacted payment webhook event detail', async () => {
    const { prisma, service } = createService();

    prisma.paymentWebhookEvent.findUnique.mockResolvedValue({
      id: 'webhook-event-1',
      provider: 'CINETPAY',
      eventType: 'transaction.successful',
      transactionRef: 'orbi_123_ride-request-1',
      providerReference: 'cinetpay_ref_123',
      action: 'persisted_and_reconciled',
      reconciledAttemptCount: 1,
      signatureVerified: true,
      rawBodyHash: 'raw_hash_123',
      payload: {
        cpm_trans_id: 'orbi_123_ride-request-1',
        cel_phone_num: '+22670000000',
        signature: 'provider-signature',
        cpm_amount: '2400',
      },
      paymentAttemptId: 'payment-1',
      userId: 'user-1',
      createdAt: new Date('2026-04-27T09:30:00.000Z'),
      paymentAttempt: {
        status: 'SUCCEEDED',
        amount: 2400,
        currency: 'XOF',
        rideRequestId: 'ride-request-1',
        failureReason: null,
        updatedAt: new Date('2026-04-27T09:31:00.000Z'),
      },
    });

    const result = await service.paymentWebhookEventDetail('webhook-event-1');

    expect(result.event.payload).toEqual(
      expect.objectContaining({
        cel_phone_num: '[redacted]',
        signature: '[redacted]',
        cpm_amount: '2400',
      }),
    );
    expect(result.event.paymentAttempt).toEqual(
      expect.objectContaining({
        status: 'SUCCEEDED',
        amount: 2400,
        updatedAt: '2026-04-27T09:31:00.000Z',
      }),
    );
  });

  it('starts a payment webhook investigation and creates a support ticket when a user is known', async () => {
    const { prisma, realtimeService, service } = createService();

    prisma.paymentWebhookEvent.findUnique.mockResolvedValue({
      id: 'webhook-event-1',
      provider: 'FLUTTERWAVE',
      eventType: 'payment.completed',
      transactionRef: 'orbi_123_ride-request-1',
      providerReference: 'fw_ref_123',
      action: 'ignored_conflicting_provider_reference',
      userId: 'user-1',
      paymentAttemptId: 'payment-1',
      paymentAttempt: {
        userId: 'user-1',
        rideRequestId: 'ride-request-1',
        status: 'SUCCEEDED',
        failureReason: null,
      },
    });
    prisma.supportTicket.findFirst.mockResolvedValue(null);
    prisma.supportTicket.create.mockResolvedValue({
      id: 'ticket-1',
      status: 'OPEN',
      priority: 3,
    });
    prisma.auditLog.create.mockResolvedValue(undefined);

    const result = await service.startPaymentWebhookInvestigation(
      'webhook-event-1',
      {
        user: {
          id: 'ops-1',
          role: 'OPS',
        },
      } as never,
    );

    expect(prisma.supportTicket.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'user-1',
        subject: 'Investigation paiement webhook webhook-event-1',
        priority: 3,
        status: 'OPEN',
      }),
      select: {
        id: true,
        status: true,
        priority: true,
      },
    });
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'ops-1',
        action: 'PAYMENT_WEBHOOK_INVESTIGATION_STARTED',
        entityType: 'PAYMENT_WEBHOOK_EVENT',
        entityId: 'webhook-event-1',
      }),
    });
    expect(realtimeService.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'payment-webhook.investigation-started',
        entityId: 'webhook-event-1',
      }),
    );
    expect(result.investigation.supportTicket?.id).toBe('ticket-1');
  });

  it('starts a payment webhook investigation without a ticket for orphan events', async () => {
    const { prisma, service } = createService();

    prisma.paymentWebhookEvent.findUnique.mockResolvedValue({
      id: 'webhook-event-2',
      provider: 'CINETPAY',
      eventType: 'transaction.failed',
      transactionRef: 'orbi_unknown',
      providerReference: 'cinetpay_ref_404',
      action: 'ignored_unknown_reference',
      userId: null,
      paymentAttemptId: null,
      paymentAttempt: null,
    });
    prisma.auditLog.create.mockResolvedValue(undefined);

    const result = await service.startPaymentWebhookInvestigation(
      'webhook-event-2',
      {
        user: {
          id: 'support-1',
          role: 'SUPPORT',
        },
      } as never,
    );

    expect(prisma.supportTicket.create).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).toHaveBeenCalled();
    expect(result.investigation.supportTicket).toBeNull();
  });

  it('replays a stored payment webhook event and writes an audit event', async () => {
    const { paymentsService, prisma, realtimeService, service } =
      createService();

    prisma.auditLog.create.mockResolvedValue(undefined);

    const result = await service.replayPaymentWebhookEvent('webhook-event-1', {
      user: {
        id: 'ops-1',
        role: 'OPS',
      },
    } as never);

    expect(paymentsService.replayStoredWebhookEvent).toHaveBeenCalledWith(
      'webhook-event-1',
    );
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'ops-1',
        action: 'PAYMENT_WEBHOOK_REPLAYED',
        entityType: 'PAYMENT_WEBHOOK_EVENT',
        entityId: 'webhook-event-1',
      }),
    });
    expect(realtimeService.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'payment-webhook.replayed',
        entityId: 'webhook-event-1',
      }),
    );
    expect(result.replay.result.nextAction).toBe('persisted_idempotent_replay');
  });

  it('verifies a payment attempt with the provider and writes an audit event', async () => {
    const { paymentsService, prisma, realtimeService, service } =
      createService();

    const result = await service.verifyPaymentAttemptWithProvider('payment-1', {
      user: {
        id: 'ops-1',
        role: 'OPS',
      },
    } as never);

    expect(
      paymentsService.verifyPaymentAttemptWithProvider,
    ).toHaveBeenCalledWith('payment-1');
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'ops-1',
        action: 'PAYMENT_ATTEMPT_PROVIDER_VERIFIED',
        entityType: 'PAYMENT_ATTEMPT',
        entityId: 'payment-1',
      }),
    });
    expect(realtimeService.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'payment-attempt.provider-verified',
        entityId: 'payment-1',
      }),
    );
    expect(result.verification.result.nextAction).toBe(
      'persisted_and_reconciled',
    );
  });

  it('refunds a payment attempt and writes an audit event', async () => {
    const { paymentsService, prisma, realtimeService, service } =
      createService();

    const result = await service.refundPaymentAttempt(
      'payment-1',
      {
        reason: 'Course annulee apres debit.',
        idempotencyKey: 'refund-key-001',
      },
      {
        user: {
          id: 'ops-1',
          role: 'OPS',
          fullName: 'Ops Orbi',
        },
      } as never,
    );

    expect(paymentsService.refundPaymentAttempt).toHaveBeenCalledWith(
      'payment-1',
      {
        actorUserId: 'ops-1',
        actorName: 'Ops Orbi',
        reason: 'Course annulee apres debit.',
        idempotencyKey: 'refund-key-001',
      },
    );
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'ops-1',
        action: 'PAYMENT_ATTEMPT_REFUNDED',
        entityType: 'PAYMENT_ATTEMPT',
        entityId: 'payment-1',
      }),
    });
    expect(realtimeService.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'payment-attempt.refunded',
        entityId: 'payment-1',
      }),
    );
    expect(result.refund.action).toBe('refunded');
  });

  it('records pending provider refunds without claiming they are complete', async () => {
    const { paymentsService, prisma, realtimeService, service } =
      createService();
    paymentsService.refundPaymentAttempt.mockResolvedValueOnce({
      action: 'refund_pending',
      providerRefundReference: 'fw_refund_123',
      paymentAttempt: {
        id: 'payment-1',
        provider: 'FLUTTERWAVE',
        status: 'REFUND_PENDING',
        amount: 2400,
        currency: 'XOF',
        transactionRef: 'orbi_123_ride-request-1',
        providerReference: 'fw_ref_123',
        updatedAt: '2026-05-01T08:05:00.000Z',
      },
      walletReversal: {
        applied: false,
        reason: 'refund_pending',
      },
    });

    const result = await service.refundPaymentAttempt(
      'payment-1',
      {
        reason: 'Course annulee apres debit.',
      },
      {
        user: {
          id: 'ops-1',
          role: 'OPS',
          fullName: 'Ops Orbi',
        },
      } as never,
    );

    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'PAYMENT_ATTEMPT_REFUND_REQUESTED',
      }),
    });
    expect(realtimeService.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'payment-attempt.refund-requested',
        payload: expect.objectContaining({
          action: 'refund_pending',
          status: 'REFUND_PENDING',
        }),
      }),
    );
    expect(result.refund.action).toBe('refund_pending');
  });

  it('updates a support ticket and writes an audit log', async () => {
    const { prisma, realtimeService, service } = createService();

    prisma.supportTicket.findUnique.mockResolvedValue({
      id: 'ticket-1',
      status: 'OPEN',
      priority: 3,
    });
    prisma.supportTicket.update.mockResolvedValue({
      id: 'ticket-1',
      status: 'IN_REVIEW',
      priority: 2,
      updatedAt: new Date('2026-04-17T09:10:00.000Z'),
    });
    prisma.auditLog.create.mockResolvedValue(undefined);

    const result = await service.updateSupportTicket(
      'ticket-1',
      { status: 'IN_REVIEW', priority: 2 },
      authContext({ id: 'admin-1', role: 'ADMIN' }),
    );

    expect(prisma.supportTicket.update).toHaveBeenCalledWith({
      where: { id: 'ticket-1' },
      data: { status: 'IN_REVIEW', priority: 2 },
    });
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'admin-1',
        action: 'SUPPORT_TICKET_UPDATED',
        entityType: 'SUPPORT_TICKET',
        entityId: 'ticket-1',
      }),
    });
    expect(realtimeService.publish).toHaveBeenCalledWith({
      channel: 'admin',
      type: 'support-ticket.updated',
      entityId: 'ticket-1',
      actorRole: 'ADMIN',
      payload: {
        status: 'IN_REVIEW',
        priority: 2,
      },
    });
    expect(result.ticket.status).toBe('IN_REVIEW');
  });

  it('returns a driver onboarding queue for pending review', async () => {
    const { prisma, service } = createService();

    prisma.driverProfile.findMany.mockResolvedValue([
      {
        id: 'driver-1',
        verificationStatus: 'PENDING',
        serviceRadiusKm: 8,
        user: {
          fullName: 'Issa Driver',
          email: 'driver@orbi.app',
          phoneNumber: '+22670000000',
        },
        vehicles: [{ id: 'vehicle-1' }],
        onboardingDocuments: [
          {
            id: 'doc-1',
            type: 'IDENTITY_DOCUMENT',
            status: 'PENDING',
            fileName: 'id-card.pdf',
            uploadedAt: new Date('2026-04-18T08:00:00.000Z'),
            expiresAt: null,
            rejectionReason: null,
            metadata: {
              integrity: {
                sizeBytes: 120000,
                sha256:
                  'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
                uploadSource: 'driver-app',
                capturedAt: '2026-04-18T08:00:01.000Z',
              },
              objectVerification: confirmedObjectVerification(),
              safetyScan: clearSafetyScan(),
            },
          },
        ],
        onboardingReviews: [
          {
            id: 'review-1',
            status: 'SUBMITTED',
            decisionReason: null,
            createdAt: new Date('2026-04-18T08:10:00.000Z'),
            metadata: {
              decisionGuidance: {
                level: 'review',
                recommendedStatus: 'UNDER_REVIEW',
                label: 'Revue prudente',
                detail: 'Verification ops requise.',
                blockers: ['IDENTITY_DOCUMENT: verification ops requise'],
              },
              documentSummary: {
                total: 1,
                approved: 0,
                pending: 1,
                rejected: 0,
                missingRequired: 4,
                integrityWarnings: 0,
              },
            },
            actor: {
              fullName: 'Issa Driver',
            },
          },
        ],
      },
    ]);
    prisma.driverProfile.count.mockResolvedValue(1);

    const result = await service.driverOnboardingQueue({
      page: 1,
      pageSize: 10,
    });

    expect(result.drivers[0]).toEqual(
      expect.objectContaining({
        id: 'driver-1',
        driverName: 'Issa Driver',
        reviewStatus: 'SUBMITTED',
      }),
    );
    expect(result.drivers[0].documentSummary.pending).toBe(1);
    expect(result.drivers[0].documentSummary.missingRequired).toBe(4);
    expect(result.drivers[0].documentSummary.averageIntegrityScore).toBe(100);
    expect(result.drivers[0].documentSummary.integrityWarnings).toBe(0);
    expect(result.drivers[0].decisionGuidance).toEqual(
      expect.objectContaining({
        level: 'resubmit',
        recommendedStatus: 'CHANGES_REQUESTED',
        label: 'Redemande recommandee',
      }),
    );
    expect(result.drivers[0].reviewHistory[0]).toEqual(
      expect.objectContaining({
        id: 'review-1',
        status: 'SUBMITTED',
        actorName: 'Issa Driver',
        decisionGuidance: expect.objectContaining({
          level: 'review',
          recommendedStatus: 'UNDER_REVIEW',
        }),
        documentSummary: expect.objectContaining({
          total: 1,
          pending: 1,
          missingRequired: 4,
        }),
      }),
    );
    expect(result.drivers[0].documents[0].integrity).toEqual(
      expect.objectContaining({
        state: 'complete',
        score: 100,
        sizeBytes: 120000,
        uploadSource: 'driver-app',
        guidance: expect.objectContaining({
          level: 'clear',
          label: 'Preuves completes',
        }),
      }),
    );
    expect(result.meta.total).toBe(1);
  });

  it('minimizes driver onboarding identities for support readers', async () => {
    const { prisma, service } = createService();

    prisma.driverProfile.findMany.mockResolvedValue([
      {
        id: 'driver-1',
        verificationStatus: 'PENDING',
        serviceRadiusKm: 8,
        user: {
          fullName: 'Issa Driver',
          email: 'driver@orbi.app',
          phoneNumber: '+22670000000',
        },
        vehicles: [{ id: 'vehicle-1' }],
        onboardingDocuments: [],
        onboardingReviews: [
          {
            id: 'review-1',
            status: 'UNDER_REVIEW',
            decisionReason: 'Verification documentaire.',
            createdAt: new Date('2026-04-18T08:10:00.000Z'),
            metadata: {},
            actor: {
              fullName: 'Admin Orbi',
            },
          },
        ],
      },
    ]);
    prisma.driverProfile.count.mockResolvedValue(1);

    const result = await service.driverOnboardingQueue(
      {
        page: 1,
        pageSize: 10,
      },
      authContext({ id: 'support-1', role: 'SUPPORT' }),
    );

    expect(result.drivers[0]).toEqual(
      expect.objectContaining({
        driverName: 'Issa D.',
        email: 'd***@orbi.app',
        phoneNumber: '***0000',
        latestReviewActor: 'Admin O.',
      }),
    );
    expect(result.drivers[0].reviewHistory[0].actorName).toBe('Admin O.');
  });

  it('flags incomplete driver document integrity in the onboarding queue', async () => {
    const { prisma, service } = createService();

    prisma.driverProfile.findMany.mockResolvedValue([
      {
        id: 'driver-1',
        verificationStatus: 'PENDING',
        serviceRadiusKm: 8,
        user: {
          fullName: 'Issa Driver',
          email: 'driver@orbi.app',
          phoneNumber: '+22670000000',
        },
        vehicles: [{ id: 'vehicle-1' }],
        onboardingDocuments: [
          {
            id: 'doc-1',
            type: 'IDENTITY_DOCUMENT',
            status: 'PENDING',
            fileName: 'id-card.pdf',
            uploadedAt: new Date('2026-04-18T08:00:00.000Z'),
            expiresAt: null,
            rejectionReason: null,
            metadata: {
              integrity: {
                sizeBytes: 120000,
                uploadSource: 'driver-app',
              },
            },
          },
        ],
        onboardingReviews: [],
      },
    ]);
    prisma.driverProfile.count.mockResolvedValue(1);

    const result = await service.driverOnboardingQueue({
      page: 1,
      pageSize: 10,
    });

    expect(result.drivers[0].documentSummary.averageIntegrityScore).toBe(33);
    expect(result.drivers[0].documentSummary.integrityWarnings).toBe(1);
    expect(result.drivers[0].decisionGuidance.blockers).toEqual(
      expect.arrayContaining(['DRIVER_LICENSE: piece absente']),
    );
    expect(result.drivers[0].documents[0].integrity).toEqual(
      expect.objectContaining({
        state: 'partial',
        score: 33,
        sha256: null,
        capturedAt: null,
        safetyScan: expect.objectContaining({
          state: 'pending',
        }),
        guidance: expect.objectContaining({
          level: 'review',
          label: 'Verifier avant decision',
        }),
      }),
    );
  });

  it('marks complete approved onboarding dossiers as ready for approval', async () => {
    const { prisma, service } = createService();
    const documentTypes = [
      'IDENTITY_DOCUMENT',
      'DRIVER_LICENSE',
      'VEHICLE_REGISTRATION',
      'INSURANCE_PROOF',
      'SELFIE_VERIFICATION',
    ];

    prisma.driverProfile.findMany.mockResolvedValue([
      {
        id: 'driver-1',
        verificationStatus: 'PENDING',
        serviceRadiusKm: 8,
        user: {
          fullName: 'Issa Driver',
          email: 'driver@orbi.app',
          phoneNumber: '+22670000000',
        },
        vehicles: [{ id: 'vehicle-1' }],
        onboardingDocuments: documentTypes.map((type, index) => ({
          id: `doc-${index + 1}`,
          type,
          status: 'APPROVED',
          fileName: `${type.toLowerCase()}.pdf`,
          uploadedAt: new Date(`2026-04-18T08:0${index}:00.000Z`),
          expiresAt: null,
          rejectionReason: null,
          metadata: {
            integrity: {
              sizeBytes: 120000 + index,
              sha256:
                'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
              uploadSource: 'driver-app',
              capturedAt: '2026-04-18T08:00:01.000Z',
            },
            objectVerification: confirmedObjectVerification({
              sizeBytes: 120000 + index,
              sha256:
                'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
            }),
            safetyScan: clearSafetyScan(),
          },
        })),
        onboardingReviews: [],
      },
    ]);
    prisma.driverProfile.count.mockResolvedValue(1);

    const result = await service.driverOnboardingQueue({
      page: 1,
      pageSize: 10,
    });

    expect(result.drivers[0].documentSummary).toEqual(
      expect.objectContaining({
        approved: 5,
        pending: 0,
        rejected: 0,
        missingRequired: 0,
        integrityWarnings: 0,
        averageIntegrityScore: 100,
      }),
    );
    expect(result.drivers[0].decisionGuidance).toEqual({
      level: 'approve',
      recommendedStatus: 'APPROVED',
      label: 'Pret pour approbation',
      detail:
        'Toutes les pieces requises sont approuvees et les preuves d integrite sont completes.',
      blockers: [],
    });
  });

  it('surfaces expired driver documents in the onboarding queue', async () => {
    const { prisma, service } = createService();

    prisma.driverProfile.findMany.mockResolvedValue([
      {
        id: 'driver-1',
        verificationStatus: 'PENDING',
        serviceRadiusKm: 8,
        user: {
          fullName: 'Issa Driver',
          email: 'driver@orbi.app',
          phoneNumber: '+22670000000',
        },
        vehicles: [{ id: 'vehicle-1' }],
        onboardingDocuments: [
          {
            id: 'doc-1',
            type: 'DRIVER_LICENSE',
            status: 'APPROVED',
            fileName: 'license.pdf',
            uploadedAt: new Date('2026-04-18T08:00:00.000Z'),
            expiresAt: new Date('2026-04-01T00:00:00.000Z'),
            rejectionReason: null,
            metadata: null,
          },
        ],
        onboardingReviews: [],
      },
    ]);
    prisma.driverProfile.count.mockResolvedValue(1);

    const result = await service.driverOnboardingQueue({
      page: 1,
      pageSize: 10,
    });

    expect(result.drivers[0].documents[0].status).toBe('EXPIRED');
    expect(result.drivers[0].decisionGuidance).toEqual(
      expect.objectContaining({
        level: 'resubmit',
        recommendedStatus: 'CHANGES_REQUESTED',
      }),
    );
    expect(result.drivers[0].documents[0].integrity.guidance).toEqual(
      expect.objectContaining({
        level: 'resubmit',
        label: 'Redemander la piece',
      }),
    );
    expect(result.drivers[0].documentSummary.rejected).toBe(1);
  });

  it('exports the filtered onboarding queue as audited safe CSV', async () => {
    const { prisma, service } = createService();

    prisma.driverProfile.findMany.mockResolvedValue([
      {
        id: 'driver-1',
        verificationStatus: 'PENDING',
        serviceRadiusKm: 8,
        user: {
          fullName: '=IMPORTXML("https://example.test")',
          email: 'driver@orbi.app',
          phoneNumber: '+22670000000',
        },
        vehicles: [{ id: 'vehicle-1' }],
        onboardingDocuments: [
          {
            id: 'doc-1',
            type: 'INSURANCE_PROOF',
            status: 'PENDING',
            fileName: 'insurance.pdf',
            uploadedAt: new Date('2026-04-18T08:00:00.000Z'),
            expiresAt: null,
            rejectionReason: null,
            metadata: {
              integrity: {
                sizeBytes: 120000,
                uploadSource: 'driver-app',
              },
            },
          },
        ],
        onboardingReviews: [
          {
            id: 'review-1',
            status: 'CHANGES_REQUESTED',
            decisionReason: 'ligne 1\nligne 2 "quote"',
            createdAt: new Date('2026-04-18T08:10:00.000Z'),
            metadata: null,
            actor: {
              fullName: 'Ops Orbi',
            },
          },
        ],
      },
    ]);
    prisma.driverProfile.count.mockResolvedValue(1);

    const csv = await service.driverOnboardingExportCsv(
      {
        guidanceFilter: 'resubmit',
        searchQuery: 'insurance',
        limit: 25,
      },
      {
        user: {
          id: 'ops-1',
          role: 'OPS',
          fullName: 'Ops Orbi',
          email: 'ops@orbi.app',
        },
      } as never,
    );

    expect(csv).toContain(
      '"driver-1","\'=IMPORTXML(""https://example.test"")"',
    );
    expect(csv).toContain('"ligne 1 ligne 2 ""quote"""');
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'ops-1',
        action: 'DRIVER_ONBOARDING_QUEUE_EXPORTED',
        entityType: 'DRIVER_PROFILE',
        entityId: 'resubmit',
        metadata: expect.objectContaining({
          format: 'csv',
          guidanceFilter: 'resubmit',
          searchQuery: 'insurance',
          exportedCount: 1,
          scannedCount: 1,
          limit: 25,
        }),
      }),
    });
  });

  it('returns a normalized driver onboarding export audit history', async () => {
    const { prisma, service } = createService();

    prisma.auditLog.findMany.mockResolvedValue([
      {
        id: 'audit-export-1',
        entityId: 'resubmit',
        createdAt: new Date('2026-05-02T09:00:00.000Z'),
        metadata: {
          format: 'csv',
          guidanceFilter: 'resubmit',
          searchQuery: 'insurance',
          exportedCount: 3,
          scannedCount: 24,
          limit: 50,
        },
        user: {
          id: 'ops-1',
          fullName: 'Ops Orbi',
          role: 'OPS',
        },
      },
      {
        id: 'audit-export-2',
        entityId: 'review',
        createdAt: new Date('2026-05-01T08:00:00.000Z'),
        metadata: {
          format: 'xlsx',
          guidanceFilter: '<script>',
          exportedCount: -1,
          scannedCount: 'all',
        },
        user: {
          id: 'admin-1',
          fullName: 'Admin Orbi',
          role: 'ADMIN',
        },
      },
    ]);
    prisma.auditLog.count.mockResolvedValue(2);

    const result = await service.driverOnboardingExportHistory({
      page: 1,
      pageSize: 8,
    });

    expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          action: 'DRIVER_ONBOARDING_QUEUE_EXPORTED',
          entityType: 'DRIVER_PROFILE',
        },
        take: 8,
      }),
    );
    expect(result.exports).toEqual([
      {
        id: 'audit-export-1',
        createdAt: '2026-05-02T09:00:00.000Z',
        actor: {
          id: 'ops-1',
          name: 'Ops Orbi',
          role: 'OPS',
        },
        guidanceFilter: 'resubmit',
        searchQuery: 'insurance',
        exportedCount: 3,
        scannedCount: 24,
        limit: 50,
        format: 'csv',
      },
      {
        id: 'audit-export-2',
        createdAt: '2026-05-01T08:00:00.000Z',
        actor: {
          id: 'admin-1',
          name: 'Admin Orbi',
          role: 'ADMIN',
        },
        guidanceFilter: 'all',
        searchQuery: null,
        exportedCount: 0,
        scannedCount: 0,
        limit: null,
        format: 'unknown',
      },
    ]);
    expect(result.meta).toEqual({
      page: 1,
      pageSize: 8,
      total: 2,
      pageCount: 1,
    });
  });

  it('returns driver wallet balances and recent payout ledger entries', async () => {
    const { prisma, service } = createService();

    prisma.wallet.findMany.mockResolvedValue([
      {
        id: 'wallet-1',
        userId: 'driver-user-1',
        currency: 'XOF',
        balance: 1968,
        isLocked: false,
        updatedAt: new Date('2026-05-01T08:00:00.000Z'),
        user: {
          fullName: 'Issa Driver',
          driverProfile: {
            status: 'ONLINE',
            verificationStatus: 'APPROVED',
          },
        },
        transactions: [
          {
            id: 'wallet-transaction-1',
            type: 'CREDIT',
            amount: 1968,
            reference: 'payment:payment-1:driver-payout',
            description: 'Payout chauffeur paiement orbi_123',
            metadata: {
              paymentAttemptId: 'payment-1',
              provider: 'FLUTTERWAVE',
              commissionAmount: 432,
            },
            createdAt: new Date('2026-05-01T08:05:00.000Z'),
          },
        ],
        driverPayouts: [
          {
            id: 'driver-payout-1',
            amount: 1968,
            currency: 'XOF',
            status: 'PREPARED',
            reference: 'driver-payout:wallet-1:prepared',
            preparedAt: new Date('2026-05-01T08:10:00.000Z'),
            paidAt: null,
          },
        ],
      },
      {
        id: 'wallet-2',
        userId: 'driver-user-2',
        currency: 'XOF',
        balance: -1968,
        isLocked: false,
        updatedAt: new Date('2026-05-01T08:20:00.000Z'),
        user: {
          fullName: 'Recovery Driver',
          driverProfile: {
            status: 'OFFLINE',
            verificationStatus: 'APPROVED',
          },
        },
        transactions: [
          {
            id: 'wallet-transaction-2',
            type: 'REFUND',
            amount: 1968,
            reference: 'payment:payment-1:driver-payout-refund',
            description: 'Reversal payout chauffeur remboursement',
            metadata: {
              paymentAttemptId: 'payment-1',
              provider: 'FLUTTERWAVE',
              commissionAmount: 0,
            },
            createdAt: new Date('2026-05-01T08:20:00.000Z'),
          },
        ],
        driverPayouts: [],
      },
    ]);
    prisma.wallet.count.mockResolvedValue(2);
    prisma.wallet.aggregate.mockResolvedValue({
      _sum: {
        balance: 1000,
      },
    });
    prisma.walletTransaction.findMany.mockResolvedValue([
      {
        walletId: 'wallet-1',
        type: 'CREDIT',
        amount: 1968,
        metadata: {
          commissionAmount: 432,
        },
      },
      {
        walletId: 'wallet-1',
        type: 'CREDIT',
        amount: 1000,
        metadata: {
          commissionAmount: 220,
        },
      },
    ]);

    const result = await service.driverWallets({
      page: 1,
      pageSize: 10,
    });

    expect(prisma.wallet.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          user: {
            role: 'DRIVER',
          },
        },
        include: expect.objectContaining({
          transactions: expect.objectContaining({
            take: 5,
          }),
          driverPayouts: expect.objectContaining({
            take: 5,
          }),
        }),
      }),
    );
    expect(result.summary).toEqual({
      walletCount: 2,
      totalBalance: 1000,
      totalPayouts: 2968,
      totalCommission: 652,
      recoveryWalletCount: 1,
      totalRecoveryDue: 1968,
    });
    expect(result.wallets[0]).toEqual(
      expect.objectContaining({
        driverName: 'Issa Driver',
        balance: 1968,
        recoveryDue: 0,
        payoutTotal: 2968,
        commissionTotal: 652,
        preparedPayout: expect.objectContaining({
          id: 'driver-payout-1',
          amount: 1968,
        }),
      }),
    );
    expect(result.wallets[1]).toEqual(
      expect.objectContaining({
        driverName: 'Recovery Driver',
        balance: -1968,
        recoveryDue: 1968,
      }),
    );
    expect(result.wallets[0].recentTransactions[0]).toEqual(
      expect.objectContaining({
        paymentAttemptId: 'payment-1',
        provider: 'FLUTTERWAVE',
      }),
    );
  });

  it('prepares a driver payout from a positive wallet balance', async () => {
    const { prisma, realtimeService, service } = createService();

    prisma.wallet.findUnique.mockResolvedValue({
      id: 'wallet-1',
      userId: 'driver-user-1',
      currency: 'XOF',
      balance: 1968,
      isLocked: false,
      user: {
        role: 'DRIVER',
        fullName: 'Issa Driver',
        driverProfile: {
          status: 'ONLINE',
        },
      },
      driverPayouts: [],
    });
    prisma.driverPayout.create.mockResolvedValue({
      id: 'driver-payout-1',
      walletId: 'wallet-1',
      amount: 1968,
      currency: 'XOF',
      status: 'PREPARED',
      reference: 'driver-payout:wallet-1:123',
      preparedAt: new Date('2026-05-01T08:10:00.000Z'),
      paidAt: null,
    });

    const result = await service.prepareDriverWalletPayout(
      'wallet-1',
      {
        notes: 'Paiement terrain valide par ops.',
      },
      authContext({ id: 'admin-1' }),
    );

    expect(prisma.driverPayout.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          walletId: 'wallet-1',
          amount: 1968,
          preparedLockKey: 'wallet-1',
          preparedByUserId: 'admin-1',
        }),
      }),
    );
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'DRIVER_PAYOUT_PREPARED',
        }),
      }),
    );
    expect(realtimeService.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'driver-wallet.payout-prepared',
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        action: 'prepared',
        payout: expect.objectContaining({ id: 'driver-payout-1' }),
      }),
    );
  });

  it('audits reused prepared driver payouts without creating a duplicate payout', async () => {
    const { prisma, service } = createService();

    prisma.wallet.findUnique.mockResolvedValue({
      id: 'wallet-1',
      userId: 'driver-user-1',
      currency: 'XOF',
      balance: 1968,
      isLocked: false,
      user: {
        role: 'DRIVER',
        fullName: 'Issa Driver',
        driverProfile: {
          status: 'ONLINE',
        },
      },
      driverPayouts: [
        {
          id: 'driver-payout-existing',
          walletId: 'wallet-1',
          amount: 1968,
          currency: 'XOF',
          status: 'PREPARED',
          reference: 'driver-payout:wallet-1:existing',
          preparedAt: new Date('2026-05-01T08:10:00.000Z'),
          paidAt: null,
        },
      ],
    });

    const result = await service.prepareDriverWalletPayout(
      'wallet-1',
      {
        notes: 'Deuxieme tentative controlee.',
      },
      authContext({ id: 'ops-1' }),
    );

    expect(prisma.driverPayout.create).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: {
        userId: 'ops-1',
        action: 'DRIVER_PAYOUT_PREPARE_REUSED',
        entityType: 'DRIVER_PAYOUT',
        entityId: 'driver-payout-existing',
        metadata: {
          walletId: 'wallet-1',
          driverUserId: 'driver-user-1',
          amount: 1968,
          currency: 'XOF',
          reference: 'driver-payout:wallet-1:existing',
          result: 'existing_prepared_payout',
          notes: 'Deuxieme tentative controlee.',
        },
      },
    });
    expect(result).toEqual(
      expect.objectContaining({
        action: 'existing_prepared_payout',
        payout: expect.objectContaining({ id: 'driver-payout-existing' }),
      }),
    );
  });

  it('records an idempotent recovery adjustment for a negative driver wallet', async () => {
    const { prisma, realtimeService, service } = createService();

    prisma.wallet.findUnique.mockResolvedValue({
      id: 'wallet-1',
      userId: 'driver-user-1',
      currency: 'XOF',
      balance: -1968,
      isLocked: false,
      user: {
        role: 'DRIVER',
        fullName: 'Issa Driver',
      },
    });
    prisma.walletTransaction.findUnique.mockResolvedValue(null);
    prisma.walletTransaction.create.mockResolvedValue({
      id: 'wallet-transaction-recovery-1',
      walletId: 'wallet-1',
      type: 'ADJUSTMENT',
      amount: 1000,
      reference: 'driver-wallet-recovery:wallet-1:ops-key-1',
      description: 'Recouvrement wallet chauffeur Issa Driver',
      createdAt: new Date('2026-05-01T09:00:00.000Z'),
    });
    prisma.wallet.update.mockResolvedValue({
      id: 'wallet-1',
      currency: 'XOF',
      balance: -968,
      user: {
        role: 'DRIVER',
        fullName: 'Issa Driver',
      },
    });

    const result = await service.recordDriverWalletRecoveryAdjustment(
      'wallet-1',
      {
        amount: 1000,
        notes: 'Paiement terrain recu.',
        idempotencyKey: 'ops-key-1',
      },
      {
        user: {
          id: 'ops-1',
          fullName: 'Ops Orbi',
          role: 'OPS',
        },
      } as never,
    );

    expect(prisma.walletTransaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          walletId: 'wallet-1',
          type: 'ADJUSTMENT',
          amount: expect.any(Prisma.Decimal),
          reference: 'driver-wallet-recovery:wallet-1:ops-key-1',
          metadata: expect.objectContaining({
            recovery: true,
            recoveryDueBefore: 1968,
            requestedAmount: 1000,
            appliedAmount: 1000,
          }),
        }),
      }),
    );
    expect(prisma.wallet.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'wallet-1',
        },
        data: {
          balance: {
            increment: expect.any(Prisma.Decimal),
          },
        },
      }),
    );
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'DRIVER_WALLET_RECOVERY_ADJUSTMENT_RECORDED',
          entityType: 'WALLET',
          entityId: 'wallet-1',
        }),
      }),
    );
    expect(realtimeService.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'driver-wallet.recovery-adjusted',
        entityId: 'wallet-1',
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        action: 'recorded',
        wallet: expect.objectContaining({
          balance: -968,
          recoveryDue: 968,
        }),
      }),
    );
  });

  it('rejects unsafe recovery idempotency keys before touching wallet ledgers', async () => {
    const { prisma, service } = createService();

    await expect(
      service.recordDriverWalletRecoveryAdjustment(
        'wallet-1',
        {
          amount: 1000,
          notes: 'Paiement terrain recu.',
          idempotencyKey: 'ops key unsafe',
        },
        {
          user: {
            id: 'ops-1',
            fullName: 'Ops Orbi',
            role: 'OPS',
          },
        } as never,
      ),
    ).rejects.toThrow('Idempotency key must be 8 to 128 URL-safe characters.');
    expect(prisma.walletTransaction.create).not.toHaveBeenCalled();
    expect(prisma.wallet.update).not.toHaveBeenCalled();
  });

  it('marks a prepared driver payout as paid with an idempotent wallet transaction', async () => {
    const { prisma, realtimeService, service } = createService();

    prisma.driverPayout.findUnique.mockResolvedValue({
      id: 'driver-payout-1',
      walletId: 'wallet-1',
      amount: 1968,
      currency: 'XOF',
      status: 'PREPARED',
      reference: 'driver-payout:wallet-1:123',
      preparedAt: new Date('2026-05-01T08:10:00.000Z'),
      paidAt: null,
      wallet: {
        id: 'wallet-1',
        balance: 1968,
        isLocked: false,
      },
    });
    prisma.walletTransaction.findUnique.mockResolvedValue(null);
    prisma.driverPayout.update.mockResolvedValue({
      id: 'driver-payout-1',
      walletId: 'wallet-1',
      amount: 1968,
      currency: 'XOF',
      status: 'PAID',
      reference: 'driver-payout:wallet-1:123',
      preparedAt: new Date('2026-05-01T08:10:00.000Z'),
      paidAt: new Date('2026-05-01T08:12:00.000Z'),
    });

    const result = await service.markDriverPayoutPaid(
      'driver-payout-1',
      {
        notes: 'Remis en mobile money.',
      },
      authContext({ id: 'admin-1' }),
    );

    expect(prisma.walletTransaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          walletId: 'wallet-1',
          type: 'PAYOUT',
          amount: 1968,
          reference: 'driver-payout:driver-payout-1:paid',
        }),
      }),
    );
    expect(prisma.wallet.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          balance: {
            decrement: 1968,
          },
        },
      }),
    );
    expect(prisma.driverPayout.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'PAID',
          paidByUserId: 'admin-1',
          preparedLockKey: null,
        }),
      }),
    );
    expect(realtimeService.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'driver-wallet.payout-paid',
      }),
    );
    expect(result.action).toBe('paid');
  });

  it('treats a concurrent driver payout ledger create as already paid', async () => {
    const { prisma, service } = createService();

    prisma.driverPayout.findUnique.mockResolvedValue({
      id: 'driver-payout-1',
      walletId: 'wallet-1',
      amount: 1968,
      currency: 'XOF',
      status: 'PREPARED',
      reference: 'driver-payout:wallet-1:123',
      preparedAt: new Date('2026-05-01T08:10:00.000Z'),
      paidAt: null,
      wallet: {
        id: 'wallet-1',
        balance: 1968,
        isLocked: false,
      },
    });
    prisma.walletTransaction.findUnique.mockResolvedValue(null);
    prisma.walletTransaction.create.mockRejectedValue(
      prismaUniqueConstraintError(),
    );
    prisma.driverPayout.update.mockResolvedValue({
      id: 'driver-payout-1',
      walletId: 'wallet-1',
      amount: 1968,
      currency: 'XOF',
      status: 'PAID',
      reference: 'driver-payout:wallet-1:123',
      preparedAt: new Date('2026-05-01T08:10:00.000Z'),
      paidAt: new Date('2026-05-01T08:12:00.000Z'),
    });

    const result = await service.markDriverPayoutPaid(
      'driver-payout-1',
      {},
      authContext({ id: 'admin-1' }),
    );

    expect(prisma.wallet.update).not.toHaveBeenCalled();
    expect(result.action).toBe('already_paid');
  });

  it('exports prepared driver payouts as a signed CSV settlement', async () => {
    const { prisma, service } = createService();

    prisma.driverPayout.findMany.mockResolvedValue([
      {
        id: 'driver-payout-1',
        walletId: 'wallet-1',
        amount: 1968,
        currency: 'XOF',
        status: 'PREPARED',
        reference: 'driver-payout:wallet-1:123',
        notes: 'Paiement terrain valide.',
        preparedByUserId: 'ops-1',
        paidByUserId: null,
        preparedAt: new Date('2026-05-01T08:10:00.000Z'),
        paidAt: null,
        wallet: {
          userId: 'driver-user-1',
          user: {
            fullName: 'Issa Driver',
          },
        },
        preparedBy: {
          fullName: 'Ops Orbi',
        },
        paidBy: null,
      },
    ]);

    const csv = await service.driverPayoutSettlementCsv(
      { status: 'PREPARED' as never },
      authContext({ fullName: 'Ops Orbi' }),
    );

    expect(csv).toContain('"driver-payout-1"');
    expect(csv).toContain('"settlement-prepared-');
    expect(csv).toContain('"Paiement terrain valide."');
    expect(csv).toContain('"prepared:Ops Orbi:ops-1; paid:pending"');
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'DRIVER_PAYOUT_SETTLEMENT_EXPORTED',
          metadata: expect.objectContaining({
            format: 'csv',
            payoutCount: 1,
            totalAmount: 1968,
            settlementBatchId: expect.stringMatching(
              /^settlement-prepared-[a-f0-9]{12}$/,
            ),
          }),
        }),
      }),
    );
  });

  it('exports prepared driver payouts as a PDF settlement buffer', async () => {
    const { prisma, service } = createService();

    prisma.driverPayout.findMany.mockResolvedValue([
      {
        id: 'driver-payout-1',
        walletId: 'wallet-1',
        amount: 1968,
        currency: 'XOF',
        status: 'PREPARED',
        reference: 'driver-payout:wallet-1:123',
        notes: null,
        preparedByUserId: 'ops-1',
        paidByUserId: null,
        preparedAt: new Date('2026-05-01T08:10:00.000Z'),
        paidAt: null,
        wallet: {
          userId: 'driver-user-1',
          user: {
            fullName: 'Issa Driver',
          },
        },
        preparedBy: {
          fullName: 'Ops Orbi',
        },
        paidBy: null,
      },
    ]);

    const pdf = await service.driverPayoutSettlementPdf(
      { status: 'PREPARED' as never },
      authContext({ fullName: 'Ops Orbi' }),
    );

    expect(Buffer.isBuffer(pdf)).toBe(true);
    expect(pdf.toString('utf8', 0, 8)).toBe('%PDF-1.4');
    expect(pdf.toString('utf8')).toContain('Settlement batch: settlement-prepared-');
  });

  it('records an onboarding review decision and updates documents', async () => {
    const { prisma, realtimeService, service } = createService();

    prisma.driverProfile.findUnique.mockResolvedValue({
      id: 'driver-1',
      userId: 'user-driver-1',
      licenseNumber: 'BF-12345',
      status: 'OFFLINE',
      user: {
        fullName: 'Issa Driver',
        isPhoneVerified: true,
      },
      vehicles: [{ id: 'vehicle-1' }],
      onboardingDocuments: [
        {
          id: 'doc-1',
          type: 'IDENTITY_DOCUMENT',
          status: 'PENDING',
          expiresAt: null,
          metadata: {
            integrity: {
              sizeBytes: 120000,
              sha256:
                'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
              uploadSource: 'driver-app',
              capturedAt: '2026-04-18T08:00:00.000Z',
            },
            objectVerification: confirmedObjectVerification({
              sha256:
                'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
            }),
            safetyScan: clearSafetyScan(),
          },
        },
        {
          id: 'doc-2',
          type: 'DRIVER_LICENSE',
          status: 'APPROVED',
          expiresAt: new Date('2027-04-18T00:00:00.000Z'),
          metadata: {
            integrity: {
              sizeBytes: 120000,
              sha256:
                'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
              uploadSource: 'driver-app',
              capturedAt: '2026-04-18T08:00:00.000Z',
            },
            objectVerification: confirmedObjectVerification({
              sha256:
                'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
            }),
            safetyScan: clearSafetyScan(),
          },
        },
        {
          id: 'doc-3',
          type: 'VEHICLE_REGISTRATION',
          status: 'APPROVED',
          expiresAt: new Date('2027-04-18T00:00:00.000Z'),
          metadata: {
            integrity: {
              sizeBytes: 120000,
              sha256:
                'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
              uploadSource: 'driver-app',
              capturedAt: '2026-04-18T08:00:00.000Z',
            },
            objectVerification: confirmedObjectVerification({
              sha256:
                'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
            }),
            safetyScan: clearSafetyScan(),
          },
        },
        {
          id: 'doc-4',
          type: 'INSURANCE_PROOF',
          status: 'APPROVED',
          expiresAt: new Date('2027-04-18T00:00:00.000Z'),
          metadata: {
            integrity: {
              sizeBytes: 120000,
              sha256:
                'dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
              uploadSource: 'driver-app',
              capturedAt: '2026-04-18T08:00:00.000Z',
            },
            objectVerification: confirmedObjectVerification({
              sha256:
                'dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
            }),
            safetyScan: clearSafetyScan(),
          },
        },
        {
          id: 'doc-5',
          type: 'SELFIE_VERIFICATION',
          status: 'APPROVED',
          expiresAt: null,
          metadata: {
            integrity: {
              sizeBytes: 120000,
              sha256:
                'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
              uploadSource: 'driver-app',
              capturedAt: '2026-04-18T08:00:00.000Z',
            },
            objectVerification: confirmedObjectVerification({
              sha256:
                'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
            }),
            safetyScan: clearSafetyScan(),
          },
        },
      ],
    });
    prisma.driverDocument.update.mockResolvedValue(undefined);
    prisma.driverProfile.update.mockResolvedValue(undefined);
    prisma.supportTicket.findFirst.mockResolvedValue(null);
    prisma.driverOnboardingReview.create.mockResolvedValue({
      id: 'review-2',
      status: 'APPROVED',
      decisionReason: 'Dossier conforme.',
      createdAt: new Date('2026-04-18T09:00:00.000Z'),
    });
    prisma.auditLog.create.mockResolvedValue(undefined);

    const result = await service.updateDriverOnboardingReview(
      'driver-1',
      {
        status: 'APPROVED',
        decisionReason: 'Dossier conforme.',
        documentDecisions: [
          {
            documentId: 'doc-1',
            status: 'APPROVED',
            expiresAt: '2027-04-18T00:00:00.000Z',
          },
        ],
      },
      authContext(),
    );

    expect(prisma.driverDocument.update).toHaveBeenCalledWith({
      where: { id: 'doc-1' },
      data: expect.objectContaining({
        status: 'APPROVED',
        reviewedByUserId: 'ops-1',
      }),
    });
    expect(prisma.driverProfile.update).toHaveBeenCalledWith({
      where: { id: 'driver-1' },
      data: {
        verificationStatus: 'APPROVED',
        status: 'OFFLINE',
      },
    });
    expect(prisma.driverOnboardingReview.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        metadata: expect.objectContaining({
          decisionGuidance: expect.objectContaining({
            level: 'approve',
            recommendedStatus: 'APPROVED',
          }),
          documentSummary: expect.objectContaining({
            approved: 5,
            pending: 0,
            missingRequired: 0,
            integrityWarnings: 0,
          }),
        }),
      }),
    });
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'ops-1',
        action: 'DRIVER_ONBOARDING_REVIEW_UPDATED',
        entityId: 'driver-1',
        metadata: expect.objectContaining({
          decisionGuidance: expect.objectContaining({
            level: 'approve',
          }),
        }),
      }),
    });
    expect(realtimeService.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'driver-onboarding.review-updated',
        entityId: 'driver-1',
      }),
    );
    expect(result.review.status).toBe('APPROVED');
  });

  it('creates an ops support ticket when onboarding changes are requested with priority', async () => {
    const { prisma, realtimeService, service } = createService();

    prisma.driverProfile.findUnique.mockResolvedValue({
      id: 'driver-1',
      userId: 'user-driver-1',
      licenseNumber: 'BF-12345',
      status: 'OFFLINE',
      user: {
        fullName: 'Issa Driver',
        isPhoneVerified: true,
      },
      vehicles: [{ id: 'vehicle-1' }],
      onboardingDocuments: [],
    });
    prisma.driverProfile.update.mockResolvedValue(undefined);
    prisma.driverOnboardingReview.create.mockResolvedValue({
      id: 'review-3',
      status: 'CHANGES_REQUESTED',
      decisionReason: 'Justificatifs a completer.',
      createdAt: new Date('2026-04-18T09:30:00.000Z'),
    });
    prisma.auditLog.create.mockResolvedValue(undefined);
    prisma.supportTicket.findFirst.mockResolvedValue(null);
    prisma.supportTicket.create.mockResolvedValue({
      id: 'ticket-new-1',
    });

    const result = await service.updateDriverOnboardingReview(
      'driver-1',
      {
        status: 'CHANGES_REQUESTED',
        decisionReason: 'Justificatifs a completer.',
        supportPriority: 2,
      },
      authContext(),
    );

    expect(prisma.supportTicket.create).toHaveBeenCalledWith({
      data: {
        userId: 'user-driver-1',
        subject: 'Revue onboarding chauffeur driver-1',
        description: 'Justificatifs a completer.',
        priority: 2,
        status: 'OPEN',
      },
    });
    expect(realtimeService.publish).toHaveBeenCalledWith({
      channel: 'admin',
      type: 'driver-onboarding.review-updated',
      entityId: 'driver-1',
      actorRole: 'OPS',
      payload: {
        status: 'CHANGES_REQUESTED',
        decisionReason: 'Justificatifs a completer.',
      },
    });
    expect(result.review.status).toBe('CHANGES_REQUESTED');
  });

  it('does not create a duplicate support ticket for repeated onboarding escalation', async () => {
    const { prisma, service } = createService();

    prisma.driverProfile.findUnique.mockResolvedValue({
      id: 'driver-1',
      userId: 'user-driver-1',
      licenseNumber: 'BF-12345',
      status: 'OFFLINE',
      user: {
        fullName: 'Issa Driver',
        isPhoneVerified: true,
      },
      vehicles: [{ id: 'vehicle-1' }],
      onboardingDocuments: [],
    });
    prisma.driverProfile.update.mockResolvedValue(undefined);
    prisma.driverOnboardingReview.create.mockResolvedValue({
      id: 'review-3',
      status: 'CHANGES_REQUESTED',
      decisionReason: 'Justificatifs a completer.',
      createdAt: new Date('2026-04-18T09:30:00.000Z'),
    });
    prisma.auditLog.create.mockResolvedValue(undefined);
    prisma.supportTicket.findFirst.mockResolvedValue({
      id: 'ticket-existing-1',
    });

    await service.updateDriverOnboardingReview(
      'driver-1',
      {
        status: 'CHANGES_REQUESTED',
        decisionReason: 'Justificatifs a completer.',
        supportPriority: 2,
      },
      authContext(),
    );

    expect(prisma.supportTicket.findFirst).toHaveBeenCalledWith({
      where: {
        userId: 'user-driver-1',
        subject: 'Revue onboarding chauffeur driver-1',
        status: {
          in: ['OPEN', 'IN_REVIEW'],
        },
      },
      select: {
        id: true,
      },
    });
    expect(prisma.supportTicket.create).not.toHaveBeenCalled();
  });

  it('rejects approval when required readiness checks are not met', async () => {
    const { prisma, service } = createService();

    prisma.driverProfile.findUnique.mockResolvedValue({
      id: 'driver-1',
      userId: 'user-driver-1',
      licenseNumber: null,
      status: 'OFFLINE',
      user: {
        fullName: 'Issa Driver',
        isPhoneVerified: false,
      },
      vehicles: [],
      onboardingDocuments: [
        {
          id: 'doc-1',
          type: 'IDENTITY_DOCUMENT',
          status: 'APPROVED',
          expiresAt: null,
        },
      ],
    });

    await expect(
      service.updateDriverOnboardingReview(
        'driver-1',
        {
          status: 'APPROVED',
          decisionReason: 'Tentative prematuree.',
        },
        authContext({ id: 'support-1', role: 'SUPPORT' }),
      ),
    ).rejects.toThrow(
      'Only admin or ops can approve, reject, or request onboarding changes.',
    );
  });

  it('requires a decision reason when changes are requested', async () => {
    const { prisma, service } = createService();

    prisma.driverProfile.findUnique.mockResolvedValue({
      id: 'driver-1',
      userId: 'user-driver-1',
      licenseNumber: 'BF-12345',
      status: 'OFFLINE',
      user: {
        fullName: 'Issa Driver',
        isPhoneVerified: true,
      },
      vehicles: [{ id: 'vehicle-1' }],
      onboardingDocuments: [],
    });

    await expect(
      service.updateDriverOnboardingReview(
        'driver-1',
        {
          status: 'CHANGES_REQUESTED',
        },
        authContext(),
      ),
    ).rejects.toThrow(
      'A decision reason is required for rejected or changes requested reviews.',
    );
  });

  it('exposes feature flags with realtime infrastructure health', () => {
    const { featureFlagsService, realtimeService, service } = createService();

    featureFlagsService.snapshot.mockReturnValue([
      { flag: 'payments', mode: 'allowlist', allowlist: ['ops-1'] },
      { flag: 'pricing', mode: 'off', allowlist: [] },
      { flag: 'voice', mode: 'off', allowlist: [] },
    ]);
    realtimeService.snapshot.mockReturnValue({
      adapter: 'redis',
      sharedBackplane: true,
      degraded: true,
      degradeReason: 'redis unavailable',
      activeStreams: 4,
      publishedEvents: 19,
      featureFlagMode: 'allowlist',
      featureFlagEnabled: false,
    });

    const result = service.featureFlags();

    expect(result.flags).toEqual([
      {
        flag: 'payments',
        mode: 'allowlist',
        allowlist: ['ops-1'],
        effectiveForAnonymous: false,
      },
      {
        flag: 'pricing',
        mode: 'off',
        allowlist: [],
        effectiveForAnonymous: true,
      },
      {
        flag: 'voice',
        mode: 'off',
        allowlist: [],
        effectiveForAnonymous: true,
      },
    ]);
    expect(result.infrastructure.realtime).toEqual({
      adapter: 'redis',
      sharedBackplane: true,
      degraded: true,
      degradeReason: 'redis unavailable',
      activeStreams: 4,
      publishedEvents: 19,
      featureFlagMode: 'allowlist',
      featureFlagEnabled: false,
    });
  });

  it('creates a signed view link for an onboarding document', async () => {
    const { prisma, documentLinksService, service } = createService();

    prisma.driverDocument.findFirst.mockResolvedValue({
      id: 'doc-1',
      driverProfileId: 'driver-1',
      type: 'IDENTITY_DOCUMENT',
      storageKey: 'driver-1/identity/doc-1.pdf',
    });
    documentLinksService.createViewLink.mockReturnValue({
      expiresAt: '2026-04-18T10:00:00.000Z',
      signedUrl: 'https://storage.orbi.local/view/doc-1',
    });

    const result = await service.getDriverDocumentViewLink(
      'driver-1',
      'doc-1',
      authContext(),
    );

    expect(documentLinksService.createViewLink).toHaveBeenCalledWith({
      documentId: 'doc-1',
      driverProfileId: 'driver-1',
      storageKey: 'driver-1/identity/doc-1.pdf',
      actorRole: 'OPS',
    });
    expect(result.documentId).toBe('doc-1');
    expect(result.signedUrl).toContain('storage.orbi.local/view');
  });

  it('records provider object verification for a driver document', async () => {
    const { prisma, service, jobQueueService } = createService();

    prisma.driverDocument.findFirst.mockResolvedValue({
      id: 'doc-1',
      driverProfileId: 'driver-1',
      type: 'IDENTITY_DOCUMENT',
      storageKey: 'driver-1/identity_document/doc-1.pdf',
      metadata: {
        integrity: {
          sizeBytes: 120000,
          sha256:
            'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
          uploadSource: 'driver-app',
          capturedAt: '2026-04-18T08:00:00.000Z',
        },
      },
    });
    prisma.driverDocument.update.mockResolvedValue({
      id: 'doc-1',
      type: 'IDENTITY_DOCUMENT',
    });
    prisma.auditLog.create.mockResolvedValue(undefined);

    const result = await service.updateDriverDocumentObjectVerification(
      'driver-1',
      'doc-1',
      {
        state: 'confirmed',
        provider: 'orbi-object-store',
        objectId: 'drivers/driver-1/doc-1.pdf',
        sizeBytes: 120000,
        sha256:
          'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      },
      authContext(),
    );

    expect(prisma.driverDocument.update).toHaveBeenCalledWith({
      where: { id: 'doc-1' },
      data: {
        metadata: expect.objectContaining({
          integrity: expect.objectContaining({
            uploadSource: 'driver-app',
          }),
          objectVerification: expect.objectContaining({
            state: 'confirmed',
            provider: 'orbi-object-store',
            objectId: 'drivers/driver-1/doc-1.pdf',
            sizeBytes: 120000,
            sha256:
              'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
            actor: {
              id: 'ops-1',
              role: 'OPS',
            },
          }),
          safetyScan: expect.objectContaining({
            state: 'clear',
            engine: 'local-policy',
            findings: [],
            quarantineReason: null,
          }),
        }),
      },
    });
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'ops-1',
        action: 'DRIVER_DOCUMENT_OBJECT_VERIFICATION_UPDATED',
        entityType: 'DRIVER_DOCUMENT',
        entityId: 'doc-1',
      }),
    });
    expect(jobQueueService.enqueue).toHaveBeenCalledWith({
      kind: 'DRIVER_DOCUMENT',
      dedupeKey: 'driver-document:doc-1:object-verification',
      entityType: 'driver_document',
      entityId: 'doc-1',
      payload: expect.objectContaining({
        driverProfileId: 'driver-1',
        documentId: 'doc-1',
        documentType: 'IDENTITY_DOCUMENT',
        storageKey: 'driver-1/identity_document/doc-1.pdf',
        objectVerificationState: 'confirmed',
        safetyScanState: 'clear',
      }),
    });
    expect(result.document.objectVerification.state).toBe('confirmed');
    expect(result.document.safetyScan.state).toBe('clear');
  });

  it('rejects incomplete provider object verification confirmations', async () => {
    const { prisma, service } = createService();

    prisma.driverDocument.findFirst.mockResolvedValue({
      id: 'doc-1',
      driverProfileId: 'driver-1',
      type: 'IDENTITY_DOCUMENT',
      storageKey: 'driver-1/identity_document/doc-1.pdf',
      metadata: null,
    });

    await expect(
      service.updateDriverDocumentObjectVerification(
        'driver-1',
        'doc-1',
        {
          state: 'confirmed',
          provider: 'orbi-object-store',
        },
        authContext(),
      ),
    ).rejects.toThrow(
      'Confirmed driver document object verification requires provider size and SHA-256.',
    );
    expect(prisma.driverDocument.update).not.toHaveBeenCalled();
  });

  it('verifies a driver document object through the configured provider', async () => {
    const { documentObjectStorageService, prisma, service } = createService();

    prisma.driverDocument.findFirst.mockResolvedValue({
      id: 'doc-1',
      driverProfileId: 'driver-1',
      type: 'IDENTITY_DOCUMENT',
      storageKey: 'driver-1/identity_document/doc-1.pdf',
      metadata: {
        integrity: {
          sizeBytes: 120000,
          sha256:
            'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        },
      },
    });
    documentObjectStorageService.verifyStoredDocument.mockResolvedValue({
      state: 'confirmed',
      provider: 'local-provider',
      objectId: 'driver-1/identity_document/doc-1.pdf',
      verifiedAt: '2026-04-18T08:02:00.000Z',
      sizeBytes: 120000,
      sha256:
        'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      failureReason: null,
    });
    prisma.driverDocument.update.mockResolvedValue({
      id: 'doc-1',
      type: 'IDENTITY_DOCUMENT',
    });
    prisma.auditLog.create.mockResolvedValue(undefined);

    const result = await service.verifyDriverDocumentObjectFromProvider(
      'driver-1',
      'doc-1',
      authContext(),
    );

    expect(
      documentObjectStorageService.verifyStoredDocument,
    ).toHaveBeenCalledWith({
      storageKey: 'driver-1/identity_document/doc-1.pdf',
      expectedSizeBytes: 120000,
      expectedSha256:
        'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    });
    expect(prisma.driverDocument.update).toHaveBeenCalledWith({
      where: { id: 'doc-1' },
      data: {
        metadata: expect.objectContaining({
          objectVerification: expect.objectContaining({
            state: 'confirmed',
            provider: 'local-provider',
            actor: {
              id: 'ops-1',
              role: 'OPS',
            },
          }),
          safetyScan: expect.objectContaining({
            state: 'clear',
            engine: 'local-policy',
          }),
        }),
      },
    });
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'DRIVER_DOCUMENT_OBJECT_VERIFICATION_UPDATED',
        entityType: 'DRIVER_DOCUMENT',
        entityId: 'doc-1',
      }),
    });
    expect(result.document.objectVerification.state).toBe('confirmed');
    expect(result.document.safetyScan.state).toBe('clear');
  });

  it('quarantines a driver document when provider object verification fails', async () => {
    const { documentObjectStorageService, prisma, service } = createService();

    prisma.driverDocument.findFirst.mockResolvedValue({
      id: 'doc-1',
      driverProfileId: 'driver-1',
      type: 'IDENTITY_DOCUMENT',
      storageKey: 'driver-1/identity_document/doc-1.pdf',
      metadata: {
        integrity: {
          sizeBytes: 120000,
          sha256:
            'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        },
      },
    });
    documentObjectStorageService.verifyStoredDocument.mockResolvedValue({
      state: 'failed',
      provider: 'local-provider',
      objectId: 'driver-1/identity_document/doc-1.pdf',
      verifiedAt: '2026-04-18T08:02:00.000Z',
      sizeBytes: null,
      sha256: null,
      failureReason:
        'Document object SHA-256 does not match captured upload integrity.',
    });
    prisma.driverDocument.update.mockResolvedValue({
      id: 'doc-1',
      type: 'IDENTITY_DOCUMENT',
    });
    prisma.auditLog.create.mockResolvedValue(undefined);

    const result = await service.verifyDriverDocumentObjectFromProvider(
      'driver-1',
      'doc-1',
      authContext(),
    );

    expect(prisma.driverDocument.update).toHaveBeenCalledWith({
      where: { id: 'doc-1' },
      data: {
        metadata: expect.objectContaining({
          objectVerification: expect.objectContaining({
            state: 'failed',
            failureReason:
              'Document object SHA-256 does not match captured upload integrity.',
          }),
          safetyScan: expect.objectContaining({
            state: 'quarantined',
            engine: 'local-policy',
            findings: ['object-verification-failed'],
          }),
        }),
      },
    });
    expect(result.document.safetyScan).toEqual(
      expect.objectContaining({
        state: 'quarantined',
        quarantineReason:
          'Document object SHA-256 does not match captured upload integrity.',
      }),
    );
  });

  it('acknowledges a health incident and publishes a realtime resync event', async () => {
    const { healthIncidentJournalService, realtimeService, service } =
      createService();

    healthIncidentJournalService.acknowledge.mockReturnValue({
      id: 'health:alert:degraded:2026-04-19T03:00:00.000Z:0',
      tone: 'alert',
      status: 'degraded',
      createdAt: '2026-04-19T03:00:00.000Z',
      title: 'Alerte systeme publiee',
      detail: 'redis unavailable',
      acknowledgedAt: '2026-04-19T03:05:00.000Z',
      acknowledgedBy: {
        id: 'ops-1',
        fullName: 'Ops Orbi',
        role: 'OPS',
      },
      mutedAt: null,
      mutedBy: null,
    });

    const result = service.acknowledgeHealthIncident(
      'health:alert:degraded:2026-04-19T03:00:00.000Z:0',
      authContext({ fullName: 'Ops Orbi' }),
    );

    expect(healthIncidentJournalService.acknowledge).toHaveBeenCalledWith(
      'health:alert:degraded:2026-04-19T03:00:00.000Z:0',
      {
        id: 'ops-1',
        fullName: 'Ops Orbi',
        role: 'OPS',
      },
    );
    expect(realtimeService.publish).toHaveBeenCalledWith({
      channel: 'admin',
      type: 'system.health-incident-acknowledged',
      entityId: 'health:alert:degraded:2026-04-19T03:00:00.000Z:0',
      actorRole: 'OPS',
      payload: {
        acknowledgedAt: '2026-04-19T03:05:00.000Z',
        acknowledgedBy: {
          id: 'ops-1',
          fullName: 'Ops Orbi',
          role: 'OPS',
        },
      },
    });
    expect(result.incident.acknowledgedBy?.id).toBe('ops-1');
  });

  it('mutes a health incident and publishes a realtime resync event', async () => {
    const { healthIncidentJournalService, realtimeService, service } =
      createService();

    healthIncidentJournalService.mute.mockReturnValue({
      id: 'health:alert:degraded:2026-04-19T03:00:00.000Z:0',
      tone: 'alert',
      status: 'degraded',
      createdAt: '2026-04-19T03:00:00.000Z',
      title: 'Alerte systeme publiee',
      detail: 'redis unavailable',
      acknowledgedAt: null,
      acknowledgedBy: null,
      mutedAt: '2026-04-19T03:06:00.000Z',
      mutedBy: {
        id: 'admin-1',
        fullName: 'Admin Orbi',
        role: 'ADMIN',
      },
    });

    const result = service.muteHealthIncident(
      'health:alert:degraded:2026-04-19T03:00:00.000Z:0',
      authContext({
        id: 'admin-1',
        fullName: 'Admin Orbi',
        role: 'ADMIN',
      }),
    );

    expect(healthIncidentJournalService.mute).toHaveBeenCalledWith(
      'health:alert:degraded:2026-04-19T03:00:00.000Z:0',
      {
        id: 'admin-1',
        fullName: 'Admin Orbi',
        role: 'ADMIN',
      },
    );
    expect(realtimeService.publish).toHaveBeenCalledWith({
      channel: 'admin',
      type: 'system.health-incident-muted',
      entityId: 'health:alert:degraded:2026-04-19T03:00:00.000Z:0',
      actorRole: 'ADMIN',
      payload: {
        mutedAt: '2026-04-19T03:06:00.000Z',
        mutedBy: {
          id: 'admin-1',
          fullName: 'Admin Orbi',
          role: 'ADMIN',
        },
      },
    });
    expect(result.incident.mutedBy?.id).toBe('admin-1');
  });

  it('clamps lookback hours to 1-168 and queries trips within the window', async () => {
    const { prisma, service } = createService();

    prisma.trip.findMany.mockResolvedValue([]);

    await service.tripsAudit({ lookbackHours: 9999 });

    expect(prisma.trip.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          createdAt: expect.objectContaining({
            gte: expect.any(Date),
          }),
        }),
        take: 300,
      }),
    );

    const call = prisma.trip.findMany.mock.calls[0][0] as {
      where: { createdAt: { gte: Date } };
    };
    const ageMs = Date.now() - call.where.createdAt.gte.getTime();
    const ageHours = ageMs / (60 * 60 * 1000);

    expect(ageHours).toBeCloseTo(168, 0);
  });

  it('uses 24-hour default lookback when no query is provided', async () => {
    const { prisma, service } = createService();

    prisma.trip.findMany.mockResolvedValue([]);

    await service.tripsAudit();

    const call = prisma.trip.findMany.mock.calls[0][0] as {
      where: { createdAt: { gte: Date } };
    };
    const ageMs = Date.now() - call.where.createdAt.gte.getTime();
    const ageHours = ageMs / (60 * 60 * 1000);

    expect(ageHours).toBeCloseTo(24, 0);
  });

  describe('overview', () => {
    it('computes real 24h revenue, completion rate and pickup time instead of placeholders', async () => {
      const { prisma, service } = createService();

      prisma.trip.count
        .mockResolvedValueOnce(1) // activeTrips
        .mockResolvedValueOnce(3) // completedTrips24h
        .mockResolvedValueOnce(1); // cancelledTrips24h
      prisma.paymentAttempt.aggregate.mockResolvedValueOnce({
        _sum: { amount: 12000 },
      });
      prisma.trip.findMany.mockResolvedValueOnce([
        {
          createdAt: new Date('2026-05-01T08:00:00.000Z'),
          startedAt: new Date('2026-05-01T08:05:00.000Z'),
        },
        {
          createdAt: new Date('2026-05-01T09:00:00.000Z'),
          startedAt: new Date('2026-05-01T09:03:00.000Z'),
        },
      ]);

      const overview = await service.overview();

      expect(overview.revenueXof24h).toBe(12000);
      expect(overview.completionRate24h).toBe(75);
      expect(overview.avgPickupMinutes24h).toBe(4);
    });

    it('reports a null pickup average when no trip has started in the window', async () => {
      const { prisma, service } = createService();

      prisma.trip.count.mockResolvedValue(0);
      prisma.trip.findMany.mockResolvedValueOnce([]);

      const overview = await service.overview();

      expect(overview.avgPickupMinutes24h).toBeNull();
      expect(overview.completionRate24h).toBe(0);
    });
  });

  describe('operationalKpis', () => {
    it('derives crash-free sessions, conversion, offer acceptance and support response from audit history', async () => {
      const { prisma, service } = createService();

      prisma.userSession.count.mockResolvedValueOnce(10);
      prisma.auditLog.findMany
        .mockResolvedValueOnce([
          {
            metadata: {
              sessionId: 'session-1',
              classification: { severity: 'critical' },
            },
          },
          {
            metadata: {
              sessionId: 'session-1',
              classification: { severity: 'critical' },
            },
          },
        ])
        .mockResolvedValueOnce([
          {
            userId: 'driver-1',
            metadata: { status: 'ONLINE' },
            createdAt: new Date('2026-05-01T08:00:00.000Z'),
          },
          {
            userId: 'driver-1',
            metadata: { status: 'OFFLINE' },
            createdAt: new Date('2026-05-01T09:00:00.000Z'),
          },
          {
            userId: 'driver-2',
            metadata: { status: 'ONLINE' },
            createdAt: new Date('2026-05-01T10:00:00.000Z'),
          },
          {
            userId: 'driver-2',
            metadata: { status: 'OFFLINE' },
            createdAt: new Date('2026-05-01T10:30:00.000Z'),
          },
        ])
        .mockResolvedValueOnce([
          { entityId: 'ticket-1', createdAt: new Date('2026-05-01T08:30:00.000Z') },
        ]);
      prisma.riderProfile.count
        .mockResolvedValueOnce(5)
        .mockResolvedValueOnce(2);
      prisma.auditLog.count
        .mockResolvedValueOnce(6)
        .mockResolvedValueOnce(3)
        .mockResolvedValueOnce(1);
      prisma.supportTicket.findMany.mockResolvedValueOnce([
        { id: 'ticket-1', createdAt: new Date('2026-05-01T08:00:00.000Z') },
        { id: 'ticket-2', createdAt: new Date('2026-05-01T08:00:00.000Z') },
      ]);

      const kpis = await service.operationalKpis();

      expect(kpis.crashFreeSessionRate7d).toBe(90);
      expect(kpis.criticalMobileErrors7d).toBe(2);
      expect(kpis.affectedMobileSessions7d).toBe(1);
      expect(kpis.mobileObservabilityPosture).toBe('bad');
      expect(kpis.mobileObservabilityAction).toContain('Bloquer le pilote large');
      expect(kpis.firstBookingConversionRate30d).toBe(40);
      expect(kpis.offerAcceptanceRate7d).toBe(60);
      expect(kpis.avgDriverOnlineMinutes7d).toBe(45);
      expect(kpis.avgSupportFirstResponseMinutes7d).toBe(30);
    });

    it('caps a still-open driver online stint at the current time instead of dropping it', async () => {
      const { prisma, service } = createService();
      const startedAt = new Date(Date.now() - 10 * 60 * 1000);

      prisma.auditLog.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          {
            userId: 'driver-1',
            metadata: { status: 'ONLINE' },
            createdAt: startedAt,
          },
        ])
        .mockResolvedValueOnce([]);

      const kpis = await service.operationalKpis();

      expect(kpis.avgDriverOnlineMinutes7d).toBeGreaterThanOrEqual(9);
      expect(kpis.avgDriverOnlineMinutes7d).toBeLessThanOrEqual(11);
    });

    it('reports zero crash-free rate denominator and null averages when there is no data', async () => {
      const { prisma, service } = createService();

      prisma.userSession.count.mockResolvedValueOnce(0);
      prisma.supportTicket.findMany.mockResolvedValueOnce([]);

      const kpis = await service.operationalKpis();

      expect(kpis.crashFreeSessionRate7d).toBe(0);
      expect(kpis.criticalMobileErrors7d).toBe(0);
      expect(kpis.affectedMobileSessions7d).toBe(0);
      expect(kpis.mobileObservabilityPosture).toBe('good');
      expect(kpis.avgDriverOnlineMinutes7d).toBeNull();
      expect(kpis.avgSupportFirstResponseMinutes7d).toBeNull();
    });

    it('warns when a single critical mobile crash is present but crash-free rate remains high', async () => {
      const { prisma, service } = createService();

      prisma.userSession.count.mockResolvedValueOnce(100);
      prisma.auditLog.findMany
        .mockResolvedValueOnce([
          {
            metadata: {
              sessionId: 'session-critical',
              classification: { severity: 'critical' },
            },
          },
        ])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);
      prisma.supportTicket.findMany.mockResolvedValueOnce([]);

      const kpis = await service.operationalKpis();

      expect(kpis.crashFreeSessionRate7d).toBe(99);
      expect(kpis.criticalMobileErrors7d).toBe(1);
      expect(kpis.affectedMobileSessions7d).toBe(1);
      expect(kpis.mobileObservabilityPosture).toBe('warn');
      expect(kpis.mobileObservabilityAction).toContain('pilote limite');
    });
  });
});
