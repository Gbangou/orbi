// ── Admin types and API functions ─────────────────────────────────────────────

import type { OrbiApiClient } from "./client";
import type { PaymentProviderCode, PaymentProviderKey } from "./payments";
import { apiRoutes } from "./routes";

// ── Shared sub-types referenced across admin responses ────────────────────────

export type AdminJobQueueKind =
  | "PAYMENT_WEBHOOK"
  | "PAYMENT_REFUND_VERIFICATION"
  | "DRIVER_DOCUMENT"
  | "NOTIFICATION"
  | "DRIVER_RESERVATION_EXPIRY";

export type HealthCheckResponse = {
  status: "ok" | "degraded";
  service: string;
  timestamp: string;
  uptimeSeconds: number;
  runtime: {
    nodeVersion: string;
    pid: number;
    memory: {
      rss: number;
      heapUsed: number;
      heapTotal: number;
    };
  };
  dependencies: {
    database: "up" | "down";
    rateLimit: "up" | "degraded";
    realtime: "up" | "degraded";
    driverReservationExpiry: "up" | "degraded" | "disabled";
  };
  lifecycle: {
    state: string;
    drainReason: string | null;
    lastTransitionAt: string | null;
  };
  infrastructure: {
    rateLimit: {
      configuredAdapter: string;
      strict: boolean;
      adapter: string;
      sharedBackplane: boolean;
      degraded: boolean;
      degradeReason: string | null;
      trackedKeys: number;
    };
    realtime: {
      configuredAdapter: string;
      strict: boolean;
      adapter: string;
      sharedBackplane: boolean;
      degraded: boolean;
      degradeReason: string | null;
      activeStreams: number;
      publishedEvents: number;
      featureFlagMode?: string;
      featureFlagEnabled?: boolean;
    };
    jobQueue?: {
      durable: boolean;
      families: AdminJobQueueKind[];
      counts: Array<{
        kind: AdminJobQueueKind;
        status: "PENDING" | "RUNNING" | "SUCCEEDED" | "DEAD_LETTER";
        count: number;
      }>;
    };
  };
  operations: {
    productionReadiness?: {
      environment: string;
      riskLevel: "low" | "medium" | "high";
      failedChecks: number;
      warningChecks: number;
      checks: Array<{
        id: string;
        label: string;
        state: "pass" | "warn" | "fail";
        detail: string;
      }>;
    };
    serviceLevelObjectives?: {
      posture: "healthy" | "watch" | "breached";
      failingObjectives: number;
      warningObjectives: number;
      objectives: Array<{
        id: string;
        label: string;
        target: string;
        window: string;
        owner: "engineering" | "ops" | "support" | "finance";
        state: "pass" | "warn" | "fail";
        currentSignal: string;
        burnRate: "normal" | "elevated" | "critical";
      }>;
      mobileErrorTaxonomy: Array<{
        code: string;
        surface: string;
        severity: "medium" | "high" | "critical";
        owner: "engineering" | "ops" | "support" | "finance";
        retryPolicy: string;
        userMessage: string;
      }>;
    };
    driverReservationExpiry: {
      enabled: boolean;
      intervalMs: number;
      inFlight: boolean;
      totalSweeps: number;
      consecutiveFailures: number;
      lastExpiredReservations: number;
      lastStartedAt: string | null;
      lastCompletedAt: string | null;
      lastSucceededAt: string | null;
      lastFailedAt: string | null;
      lastFailureMessage: string | null;
      lastDurationMs: number | null;
    };
    healthHistory: Array<{
      id: string;
      tone: "alert" | "recovered";
      status: "ok" | "degraded";
      createdAt: string;
      title: string;
      detail: string;
      acknowledgedAt: string | null;
      acknowledgedBy: {
        id: string;
        fullName: string;
        role: string;
      } | null;
      mutedAt: string | null;
      mutedBy: {
        id: string;
        fullName: string;
        role: string;
      } | null;
    }>;
  };
};

// ── Admin response types ───────────────────────────────────────────────────────

export type AdminPreviewResponse = {
  metrics: import("@orbi/domain").AdminMetric[];
  operations: Array<{
    title: string;
    value: string;
    note: string;
  }>;
  incidents: string[];
};

export type AdminOverviewResponse = {
  users: number;
  riders: number;
  drivers: number;
  vehicles: number;
  openRequests: number;
  activeTrips: number;
  revenueXof24h: number;
  completionRate24h: number;
  avgPickupMinutes24h: number | null;
};

export type AdminOperationalKpisResponse = {
  windowDays: number;
  crashFreeSessionRate7d: number;
  firstBookingConversionRate30d: number;
  offerAcceptanceRate7d: number;
  avgDriverOnlineMinutes7d: number | null;
  avgSupportFirstResponseMinutes7d: number | null;
};

export type AdminLiveOpsResponse = {
  summary: {
    activeTrips: number;
    openRequests: number;
    urgentSupportTickets: number;
    tripsByStatus: {
      matched: number;
      arriving: number;
      inProgress: number;
    };
    stalledMatchedTrips: number;
    staleDriverSignals: number;
    payments: {
      lookbackHours: number;
      attempts: number;
      succeeded: number;
      failed: number;
      refundPending: number;
      refunded: number;
      reconciled: number;
      webhookEvents: number;
      webhookConflicts: number;
      webhookUnknownReferences: number;
      successRate: number;
      reconciliationRate: number;
    };
  };
  trips: Array<{
    id: string;
    status: string;
    riderName: string;
    driverName: string;
    route: string;
    fare: number;
    currency: string;
    vehicleLabel: string;
    pickupCodeIssued: boolean;
    hasIncident: boolean;
    incidentCount: number;
    routeMonitoring: {
      state: "clear" | "warning" | "critical" | "unknown";
      alertCount: number;
      lastAlertType: string | null;
      lastAlertAt: string | null;
      lastPositionAt: string | null;
      signalState: {
        state: "fresh" | "stale" | "missing";
        ageMinutes: number | null;
        label: string;
      };
      latestPosition: {
        latitude: number;
        longitude: number;
        accuracyMeters: number | null;
        speedKph: number | null;
        distanceToPickupKm: number | null;
        distanceToDestinationKm: number | null;
        observedAt: string;
        sourceRole: string | null;
      } | null;
    };
    completionGate: {
      state: "ready" | "blocked" | "not_applicable";
      label: string;
      reason: string;
      action: string;
      canOpsOverride: boolean;
    };
    lastEvent: {
      label: string;
      createdAt: string;
    } | null;
    timeline: Array<{
      id: string;
      label: string;
      createdAt: string;
    }>;
  }>;
  alerts: string[];
  recentCancellations: Array<{
    id: string;
    riderName: string;
    driverName: string;
    route: string;
    cancelledBy: string | null;
    cancellationReason: string | null;
    cancelledAt: string;
  }>;
  driverAcceptanceLeaderboard: Array<{
    driverId: string;
    driverName: string;
    total: number;
    accepted: number;
    declined: number;
    expired: number;
    acceptanceRate: number;
    declineRate: number;
    expirationRate: number;
  }>;
  lowConfidenceDrivers: Array<{
    driverId: string;
    driverName: string;
    total: number;
    accepted: number;
    declined: number;
    expired: number;
    acceptanceRate: number;
    expirationRate: number;
  }>;
};

export type AdminTripsAuditResponse = {
  window: {
    lookbackHours: number;
    since: string;
    generatedAt: string;
  };
  summary: {
    totalTrips: number;
    completedTrips: number;
    cancelledTrips: number;
    completionRate: number;
    cancellationRate: number;
    mobileMoneyTrips: number;
    mobileMoneyReconciledTrips: number;
    mobileMoneyReconciliationRate: number;
    refundPendingTrips: number;
    riskTripCount: number;
    criticalRiskTripCount: number;
    moneyAtRisk: number;
    currency: string;
    byStatus: {
      matched: number;
      arriving: number;
      inProgress: number;
      completed: number;
      cancelled: number;
    };
  };
  ownerQueue: Array<{
    owner: "finance" | "ops" | "support" | "engineering";
    count: number;
    critical: number;
    moneyAtRisk: number;
  }>;
  riskTrips: Array<{
    id: string;
    status: string;
    route: string;
    riderName: string;
    driverName: string;
    fare: number;
    currency: string;
    paymentMethod: string;
    paymentStatus: string;
    severity: "low" | "medium" | "high" | "critical";
    owner: "ops" | "finance" | "support" | "engineering";
    reasons: string[];
    createdAt: string;
  }>;
  recommendations: string[];
};

export type AdminLaunchReadinessResponse = {
  generatedAt: string;
  environment: string;
  decision: {
    state: "approved" | "limited" | "blocked";
    label: string;
    detail: string;
  };
  summary: {
    failedChecks: number;
    warningChecks: number;
    passedChecks: number;
    totalChecks: number;
  };
  checks: Array<{
    id: string;
    label: string;
    state: "pass" | "warn" | "fail";
    detail: string;
  }>;
  nextActions?: Array<{
    checkId: string;
    severity: "warning" | "blocking";
    owner: "ops" | "engineering" | "support" | "finance";
    action: string;
    runbookAnchor: string;
  }>;
  acknowledgements?: Array<{
    checkId: string;
    owner: "ops" | "engineering" | "support" | "finance";
    severity: "warning" | "blocking";
    acknowledgedAt: string;
    actor: {
      id: string;
      name: string | null;
      role: string | null;
    };
    notes: string | null;
  }>;
  actionSummary?: {
    totalActions: number;
    acknowledgedActions: number;
    remainingActions: number;
    blockingActions: number;
    acknowledgedBlockingActions: number;
    remainingBlockingActions: number;
    completionRate: number;
  };
  safetyBenchmark?: {
    summary: {
      totalCapabilities: number;
      activeCapabilities: number;
      partialCapabilities: number;
      plannedCapabilities: number;
      criticalGaps: number;
      competitorParityRate: number;
    };
    capabilities: Array<{
      id: string;
      label: string;
      status: "active" | "partial" | "planned";
      priority: "critical" | "high" | "medium";
      orbiSignal: string;
      competitorSignal: string;
      nextStep: string;
    }>;
  };
  securityAssurance?: {
    summary: {
      totalGates: number;
      coveredGates: number;
      partialGates: number;
      missingGates: number;
      criticalOpenGates: number;
      coverageRate: number;
      launchPosture: "ready" | "limited";
    };
    gates: Array<{
      id: string;
      label: string;
      status: "covered" | "partial" | "missing";
      priority: "critical" | "high" | "medium";
      owner: "ops" | "engineering" | "support" | "finance";
      frameworks: string[];
      currentSignal: string;
      nextStep: string;
    }>;
  };
  fieldQuality?: {
    score: number;
    state: "excellent" | "watch" | "blocked";
    blockedSignals: number;
    watchSignals: number;
    signals: Array<{
      id: string;
      label: string;
      score: number;
      state: "excellent" | "watch" | "blocked";
      owner: "ops" | "engineering" | "support" | "finance";
      competitorReference: string;
      orbiSignal: string;
      nextStep: string;
    }>;
  };
  productionReadiness: NonNullable<
    HealthCheckResponse["operations"]["productionReadiness"]
  >;
};

export type AdminLaunchReadinessActionAcknowledgementResponse = {
  acknowledgement: {
    checkId: string;
    owner: "ops" | "engineering" | "support" | "finance";
    severity: "warning" | "blocking";
    acknowledgedAt: string;
  };
};

export type SupportTicketQueueResponse = {
  tickets: Array<{
    id: string;
    subject: string;
    description: string;
    status: "OPEN" | "IN_REVIEW" | "RESOLVED" | "CLOSED";
    priority: number;
    adminNote: string | null;
    requesterName: string;
    requesterRole: string;
    tripId: string | null;
    createdAt: string;
    updatedAt: string;
    sla: {
      tier: "critical" | "standard" | "normal";
      targetMinutes: number;
      dueAt: string;
      respondedAt: string | null;
      state: "on_track" | "due_soon" | "breached" | "responded" | "closed";
      remainingMinutes: number | null;
      breachedMinutes: number | null;
      owner: "support" | "ops";
    };
  }>;
};

export type SupportTicketUpdateResponse = {
  ticket: {
    id: string;
    status: "OPEN" | "IN_REVIEW" | "RESOLVED" | "CLOSED";
    priority: number;
    adminNote: string | null;
    updatedAt: string;
  };
};

export type AdminRidersResponse = {
  riders: Array<{
    id: string;
    fullName: string;
    email: string;
    phoneNumber: string | null;
    isActive: boolean;
    createdAt: string;
    riderId: string | null;
    completedTripsCount: number;
    rideRequestsCount: number;
  }>;
  total: number;
  page: number;
  pageSize: number;
};

export type AdminRiderStatusResponse = {
  riderId: string;
  isActive: boolean;
};

export type AdminDriversResponse = {
  drivers: Array<{
    id: string;
    userId: string;
    fullName: string;
    email: string;
    phoneNumber: string | null;
    isActive: boolean;
    status: string;
    verificationStatus: string;
    createdAt: string;
    completedTripsCount: number;
    vehicle: {
      make: string;
      model: string;
      plateNumber: string;
      vehicleType: string;
    } | null;
  }>;
  total: number;
  page: number;
  pageSize: number;
};

export type AdminDriverWalletsResponse = {
  summary: {
    walletCount: number;
    totalBalance: number;
    totalPayouts: number;
    totalCommission: number;
    recoveryWalletCount: number;
    totalRecoveryDue: number;
  };
  wallets: Array<{
    id: string;
    driverUserId: string;
    driverName: string;
    driverStatus: string | null;
    verificationStatus: string | null;
    currency: string;
    balance: number;
    recoveryDue: number;
    isLocked: boolean;
    payoutTotal: number;
    commissionTotal: number;
    lastActivityAt: string;
    preparedPayout: {
      id: string;
      amount: number;
      currency: string;
      status: "PREPARED" | "PAID" | "CANCELLED";
      reference: string;
      notes: string | null;
      preparedAt: string;
    } | null;
    recentPayouts: Array<{
      id: string;
      amount: number;
      currency: string;
      status: "PREPARED" | "PAID" | "CANCELLED";
      reference: string;
      notes: string | null;
      preparedAt: string;
      paidAt: string | null;
    }>;
    recentTransactions: Array<{
      id: string;
      type: "CREDIT" | "DEBIT" | "ADJUSTMENT" | "PAYOUT" | "REFUND";
      amount: number;
      reference: string | null;
      description: string | null;
      createdAt: string;
      paymentAttemptId: string | null;
      provider: string | null;
      commissionAmount: number;
    }>;
  }>;
  meta: {
    page: number;
    pageSize: number;
    total: number;
    pageCount: number;
  };
};

export type AdminDriverPayoutResponse = {
  action:
    | "prepared"
    | "existing_prepared_payout"
    | "paid"
    | "already_paid"
    | "already_finalized";
  payout: {
    id: string;
    walletId: string;
    amount: number;
    currency: string;
    status: "PREPARED" | "PAID" | "CANCELLED";
    reference: string;
    notes: string | null;
    preparedAt: string;
    paidAt: string | null;
  };
};

export type AdminDriverWalletRecoveryAdjustmentResponse = {
  action: "recorded" | "already_recorded";
  wallet: {
    id: string;
    balance: number;
    currency: string;
    recoveryDue: number;
  };
  transaction: {
    id: string;
    type: "ADJUSTMENT";
    amount: number;
    reference: string | null;
    description: string | null;
    createdAt: string;
  };
};

export type AdminPaymentWebhookEventsResponse = {
  events: Array<{
    id: string;
    provider: PaymentProviderCode;
    eventType: string;
    transactionRef: string | null;
    providerReference: string | null;
    action: string;
    reconciledAttemptCount: number;
    signatureVerified: boolean;
    rawBodyHash: string | null;
    payloadPreview: Record<string, unknown>;
    paymentAttemptId: string | null;
    paymentAttempt: {
      status:
        | "INITIATED"
        | "PENDING"
        | "SUCCEEDED"
        | "FAILED"
        | "CANCELLED"
        | "REFUND_PENDING"
        | "REFUNDED";
      amount: number;
      currency: string;
      rideRequestId: string;
      failureReason: string | null;
      updatedAt: string;
    } | null;
    userId: string | null;
    createdAt: string;
  }>;
  meta: {
    page: number;
    pageSize: number;
    total: number;
    pageCount: number;
  };
  summary: {
    paymentEvents: number;
    refundEvents: number;
    ignoredEvents: number;
  };
};

export type AdminPaymentWebhookEventDetailResponse = {
  event: AdminPaymentWebhookEventsResponse["events"][number] & {
    payload: unknown;
    paymentAttempt: {
      status: string;
      amount: number;
      currency: string;
      rideRequestId: string;
      failureReason: string | null;
      updatedAt: string;
    } | null;
  };
};

export type AdminPaymentWebhookInvestigationResponse = {
  investigation: {
    eventId: string;
    status: "STARTED";
    supportTicket: {
      id: string;
      status: "OPEN" | "IN_REVIEW" | "RESOLVED" | "CLOSED";
      priority: number;
    } | null;
  };
};

export type AdminPaymentWebhookReplayResponse = {
  replay: {
    replayed: true;
    sourceEventId: string;
    result: {
      received: true;
      event: string;
      transactionRef: string | null;
      provider: PaymentProviderKey;
      providerReference?: string;
      reconciledAttemptCount: number;
      nextAction: string;
    };
  };
};

export type AdminPaymentAttemptProviderVerificationResponse = {
  verification: {
    verified: true;
    paymentAttemptId: string;
    provider: PaymentProviderKey;
    transactionRef: string;
    result: {
      received: true;
      event: string;
      transactionRef: string | null;
      provider: PaymentProviderKey;
      providerReference?: string;
      reconciledAttemptCount: number;
      nextAction: string;
    };
  };
};

export type AdminPaymentAttemptRefundResponse = {
  refund: {
    action: "refunded" | "refund_pending" | "already_refunded";
    providerRefundReference: string;
    paymentAttempt: {
      id: string;
      provider: PaymentProviderCode;
      status: "REFUND_PENDING" | "REFUNDED";
      amount: number;
      currency: string;
      transactionRef: string;
      providerReference: string | null;
      updatedAt: string;
    };
    walletReversal: {
      applied: boolean;
      reason?: string;
      walletId?: string;
      amount?: number;
      currency?: string;
    };
  };
};

export type DriverOnboardingQueueResponse = {
  drivers: Array<{
    id: string;
    driverName: string;
    email: string;
    phoneNumber: string | null;
    driverStatus: "ONLINE" | "OFFLINE" | "SUSPENDED";
    verificationStatus: "PENDING" | "APPROVED" | "REJECTED";
    reviewStatus:
      | "SUBMITTED"
      | "UNDER_REVIEW"
      | "APPROVED"
      | "REJECTED"
      | "CHANGES_REQUESTED";
    latestReviewAt: string | null;
    latestReviewActor: string | null;
    latestDecisionReason: string | null;
    serviceRadiusKm: number;
    activeVehicleCount: number;
    documentSummary: {
      total: number;
      approved: number;
      pending: number;
      rejected: number;
      integrityWarnings: number;
      averageIntegrityScore: number;
      missingRequired: number;
    };
    decisionGuidance: {
      level: "approve" | "review" | "resubmit";
      recommendedStatus: "APPROVED" | "UNDER_REVIEW" | "CHANGES_REQUESTED";
      label: string;
      detail: string;
      blockers: string[];
    };
    reviewHistory: Array<{
      id: string;
      status:
        | "SUBMITTED"
        | "UNDER_REVIEW"
        | "APPROVED"
        | "REJECTED"
        | "CHANGES_REQUESTED";
      actorName: string;
      decisionReason: string | null;
      createdAt: string;
      decisionGuidance: {
        level: "approve" | "review" | "resubmit";
        recommendedStatus: "APPROVED" | "UNDER_REVIEW" | "CHANGES_REQUESTED";
        label: string;
        detail: string;
        blockers: string[];
      } | null;
      documentSummary: {
        total: number;
        approved: number;
        pending: number;
        rejected: number;
        missingRequired: number;
        integrityWarnings: number;
      } | null;
    }>;
    documents: Array<{
      id: string;
      type:
        | "IDENTITY_DOCUMENT"
        | "DRIVER_LICENSE"
        | "VEHICLE_REGISTRATION"
        | "INSURANCE_PROOF"
        | "SELFIE_VERIFICATION";
      status: "PENDING" | "APPROVED" | "REJECTED" | "EXPIRED";
      fileName: string;
      uploadedAt: string;
      expiresAt: string | null;
      rejectionReason: string | null;
      integrity: {
        state: "complete" | "partial" | "missing";
        score: number;
        sizeBytes: number | null;
        sha256: string | null;
        uploadSource: string | null;
        capturedAt: string | null;
        objectVerification: {
          state: "confirmed" | "pending" | "failed" | "missing";
          provider: string | null;
          objectId: string | null;
          verifiedAt: string | null;
          sizeBytes: number | null;
          sha256: string | null;
          failureReason: string | null;
        };
        safetyScan: {
          state: "clear" | "pending" | "quarantined";
          engine: string | null;
          scannedAt: string | null;
          findings: string[];
          quarantineReason: string | null;
        };
        guidance: {
          level: "clear" | "review" | "resubmit";
          label: string;
          detail: string;
        };
        checks: Array<{
          id: string;
          label: string;
          state: "pass" | "warn";
        }>;
      };
    }>;
  }>;
  meta: {
    page: number;
    pageSize: number;
    total: number;
    pageCount: number;
  };
};

export type DriverOnboardingExportHistoryResponse = {
  exports: Array<{
    id: string;
    createdAt: string;
    actor: {
      id: string;
      name: string;
      role: "ADMIN" | "OPS" | "SUPPORT" | "RIDER" | "DRIVER";
    };
    guidanceFilter: "all" | "approve" | "review" | "resubmit";
    searchQuery: string | null;
    exportedCount: number;
    scannedCount: number;
    limit: number | null;
    format: "csv" | "unknown";
  }>;
  meta: {
    page: number;
    pageSize: number;
    total: number;
    pageCount: number;
  };
};

export type DriverOnboardingReviewUpdateResponse = {
  review: {
    id: string;
    driverId: string;
    verificationStatus: "PENDING" | "APPROVED" | "REJECTED";
    status: "UNDER_REVIEW" | "APPROVED" | "REJECTED" | "CHANGES_REQUESTED";
    decisionReason: string | null;
    createdAt: string;
  };
};

export type AdminFeatureFlagsResponse = {
  flags: Array<{
    flag: "payments" | "pricing" | "realtime" | "driverOnboarding" | "voice";
    mode: string;
    allowlist: string[];
    effectiveForAnonymous: boolean;
  }>;
  infrastructure: {
    realtime: {
      adapter: string;
      sharedBackplane: boolean;
      degraded: boolean;
      degradeReason: string | null;
      activeStreams: number;
      publishedEvents: number;
      featureFlagMode: string;
      featureFlagEnabled: boolean;
    };
  };
};

export type AdminDispatchSettingsResponse = {
  settings: {
    lookbackHours: number;
    halfLifeHours: number;
    declineCooldownMinutes: number;
    historyLimit: number;
    source: "DEFAULT" | "DATABASE_OVERRIDE";
    updatedAt: string | null;
    updatedBy: {
      id: string;
      name: string | null;
      role: string | null;
    } | null;
  };
  history: Array<{
    id: string;
    createdAt: string;
    resetToDefaults: boolean;
    source: "DEFAULT" | "DATABASE_OVERRIDE";
    actor: {
      id: string;
      name: string | null;
      role: string | null;
    };
    before: {
      lookbackHours: number;
      halfLifeHours: number;
      declineCooldownMinutes: number;
      historyLimit: number;
    } | null;
    after: {
      lookbackHours: number;
      halfLifeHours: number;
      declineCooldownMinutes: number;
      historyLimit: number;
    } | null;
  }>;
};

export type AdminPricingCalibrationResponse = {
  window: {
    lookbackDays: number;
    since: string;
  };
  summary: {
    totalRequests: number;
    matchedRequests: number;
    completedTrips: number;
    cancelledRequests: number;
    expiredRequests: number;
    paidRequests: number;
    acceptanceRate: number;
    completionRate: number;
    cancellationRate: number;
    paymentConversionRate: number;
    paymentAttemptCount: number;
    failedPaymentAttemptCount: number;
    reconciledPaymentAttemptCount: number;
    paymentSuccessRate: number;
    paymentReconciliationRate: number;
    averageFare: number;
    averageDriverPayout: number;
    averageFarePerKm: number;
    averagePickupWaitMinutes: number;
  };
  paymentSignals: {
    attempts: number;
    succeeded: number;
    failed: number;
    reconciled: number;
    unresolved: number;
    webhookEvents: number;
    webhookIgnored: number;
    webhookSignatureVerified: number;
    failureReasons: Array<{
      reason: string;
      count: number;
    }>;
  };
  segments: Array<{
    vehicleType: string;
    serviceTier: string;
    requests: number;
    completionRate: number;
    cancellationRate: number;
    averageFare: number;
  }>;
  timeWindows: Array<{
    key: string;
    label: string;
    requests: number;
    matchedRequests: number;
    completedTrips: number;
    acceptanceRate: number;
    completionRate: number;
    cancellationRate: number;
    averageFare: number;
    averageFarePerKm: number;
    averagePickupWaitMinutes: number;
    targetAcceptanceRate: number;
    targetCancellationRate: number;
  }>;
  geographySegments: Array<{
    city: string;
    districtProfile: string;
    requests: number;
    matchedRequests: number;
    completedTrips: number;
    acceptanceRate: number;
    completionRate: number;
    cancellationRate: number;
    averageFare: number;
    averageFarePerKm: number;
  }>;
  recommendations: Array<{
    scope: string;
    priority: "LOW" | "MEDIUM" | "HIGH";
    action: string;
    rationale: string;
  }>;
  alerts: string[];
};

export type AdminJobQueueResponse = {
  jobs: Array<{
    id: string;
    kind: AdminJobQueueKind;
    status: "PENDING" | "RUNNING" | "SUCCEEDED" | "DEAD_LETTER";
    dedupeKey: string | null;
    entityType: string | null;
    entityId: string | null;
    attempts: number;
    maxAttempts: number;
    nextRunAt: string;
    lockedAt: string | null;
    completedAt: string | null;
    failedAt: string | null;
    lastError: string | null;
    deadLetterReason: string | null;
    diagnostics: {
      attemptPressure: number;
      canRequeueSafely: boolean;
      owner: "ops" | "engineering" | "finance" | "trust-and-safety";
      riskSignals: string[];
      recommendedAction: string;
      severity: "low" | "medium" | "high" | "critical";
    };
    createdAt: string;
    updatedAt: string;
  }>;
  meta: {
    page: number;
    pageSize: number;
    total: number;
    pageCount: number;
  };
  snapshot: NonNullable<HealthCheckResponse["infrastructure"]["jobQueue"]>;
};

export type AdminJobQueueRequeueResponse = {
  job: {
    id: string;
    kind: AdminJobQueueKind;
    status: "PENDING" | "RUNNING" | "SUCCEEDED" | "DEAD_LETTER";
    attempts: number;
    nextRunAt: string;
  };
};

export type DriverDocumentUploadLinksResponse = {
  links: Array<{
    storageKey: string;
    expiresAt: string;
    uploadUrl: string;
    method: "PUT";
    headers: {
      "content-type": string;
    };
    constraints: {
      allowedMimeTypes: string[];
      allowedExtensions: string[];
      maxBytes: number;
    };
  }>;
};

export type DriverDocumentViewLinkResponse = {
  documentId: string;
  type:
    | "IDENTITY_DOCUMENT"
    | "DRIVER_LICENSE"
    | "VEHICLE_REGISTRATION"
    | "INSURANCE_PROOF"
    | "SELFIE_VERIFICATION";
  expiresAt: string;
  signedUrl: string;
};

export type DriverDocumentObjectVerificationResponse = {
  document: {
    id: string;
    driverId: string;
    type:
      | "IDENTITY_DOCUMENT"
      | "DRIVER_LICENSE"
      | "VEHICLE_REGISTRATION"
      | "INSURANCE_PROOF"
      | "SELFIE_VERIFICATION";
    objectVerification: {
      state: "confirmed" | "failed";
      provider: string;
      objectId: string | null;
      verifiedAt: string;
      sizeBytes: number | null;
      sha256: string | null;
      failureReason: string | null;
      actor: {
        id: string;
        role: string;
      };
    };
    safetyScan: {
      state: "clear" | "pending" | "quarantined";
      engine: string | null;
      scannedAt: string | null;
      findings: string[];
      quarantineReason: string | null;
    };
  };
};

export type PromoCodeItem = {
  id: string;
  code: string;
  description: string | null;
  discountBps: number;
  maxUses: number | null;
  usedCount: number;
  validFrom: string;
  validTo: string;
  firstTripOnly: boolean;
  active: boolean;
  createdAt: string;
};

export type ListAdminPromoCodesResponse = {
  promoCodes: PromoCodeItem[];
};

export type CreateAdminPromoCodePayload = {
  code: string;
  description?: string;
  discountBps: number;
  maxUses?: number;
  validFrom: string;
  validTo: string;
  firstTripOnly?: boolean;
};

// ── Admin API functions ───────────────────────────────────────────────────────

export async function fetchAdminPreview(client: OrbiApiClient) {
  return client.request<AdminPreviewResponse>(apiRoutes.admin.preview);
}

export async function fetchAdminOverview(client: OrbiApiClient) {
  return client.request<AdminOverviewResponse>(apiRoutes.admin.overview);
}

export async function fetchAdminOperationalKpis(client: OrbiApiClient) {
  return client.request<AdminOperationalKpisResponse>(
    apiRoutes.admin.operationalKpis,
  );
}

export async function fetchAdminLiveOps(client: OrbiApiClient) {
  return client.request<AdminLiveOpsResponse>(apiRoutes.admin.liveOps);
}

export async function fetchAdminTripsAudit(
  client: OrbiApiClient,
  query?: { lookbackHours?: number },
) {
  return client.request<AdminTripsAuditResponse>(apiRoutes.admin.tripsAudit, {
    query,
  });
}

export async function fetchAdminJobQueue(
  client: OrbiApiClient,
  query?: {
    page?: number;
    pageSize?: number;
    kind?: AdminJobQueueKind;
    status?: "PENDING" | "RUNNING" | "SUCCEEDED" | "DEAD_LETTER";
  },
) {
  return client.request<AdminJobQueueResponse>(apiRoutes.admin.jobQueue, {
    query,
  });
}

export async function requeueAdminJobQueueEntry(
  client: OrbiApiClient,
  jobId: string,
) {
  return client.request<AdminJobQueueRequeueResponse>(
    `${apiRoutes.admin.jobQueue}/${jobId}/requeue`,
    {
      method: "POST",
    },
  );
}

export async function fetchAdminLaunchReadiness(client: OrbiApiClient) {
  return client.request<AdminLaunchReadinessResponse>(
    apiRoutes.admin.launchReadiness,
  );
}

export async function acknowledgeAdminLaunchReadinessAction(
  client: OrbiApiClient,
  checkId: string,
  payload: {
    owner: "ops" | "engineering" | "support" | "finance";
    notes: string;
    idempotencyKey?: string;
  },
) {
  return client.request<AdminLaunchReadinessActionAcknowledgementResponse>(
    `${apiRoutes.admin.launchReadiness}/actions/${checkId}/acknowledge`,
    {
      method: "POST",
      body: payload,
    },
  );
}

export async function fetchAdminSupportTickets(client: OrbiApiClient) {
  return client.request<SupportTicketQueueResponse>(
    apiRoutes.admin.supportTickets,
  );
}

export async function fetchAdminDrivers(
  client: OrbiApiClient,
  query: {
    page?: number;
    pageSize?: number;
    search?: string;
    status?: string;
  } = {},
) {
  return client.request<AdminDriversResponse>(apiRoutes.admin.drivers, {
    query,
  });
}

export async function fetchAdminRiders(
  client: OrbiApiClient,
  query: {
    page?: number;
    pageSize?: number;
    search?: string;
    activeOnly?: boolean;
  } = {},
) {
  return client.request<AdminRidersResponse>(apiRoutes.admin.riders, { query });
}

export async function updateAdminRiderStatus(
  client: OrbiApiClient,
  userId: string,
  payload: { isActive: boolean; reason?: string },
) {
  return client.request<AdminRiderStatusResponse>(
    `${apiRoutes.admin.riders}/${userId}/status`,
    {
      method: "PATCH",
      body: payload,
    },
  );
}

export async function fetchAdminDriverWallets(client: OrbiApiClient) {
  return client.request<AdminDriverWalletsResponse>(
    apiRoutes.admin.driverWallets,
  );
}

export async function prepareAdminDriverWalletPayout(
  client: OrbiApiClient,
  walletId: string,
  payload: { notes?: string } = {},
) {
  return client.request<AdminDriverPayoutResponse>(
    `${apiRoutes.admin.driverWallets}/${walletId}/payouts/prepare`,
    {
      method: "POST",
      body: payload,
    },
  );
}

export async function recordAdminDriverWalletRecoveryAdjustment(
  client: OrbiApiClient,
  walletId: string,
  payload: { amount: number; notes: string; idempotencyKey: string },
) {
  return client.request<AdminDriverWalletRecoveryAdjustmentResponse>(
    `${apiRoutes.admin.driverWallets}/${walletId}/recovery-adjustments`,
    {
      method: "POST",
      body: payload,
    },
  );
}

export async function markAdminDriverPayoutPaid(
  client: OrbiApiClient,
  payoutId: string,
  payload: { notes?: string } = {},
) {
  return client.request<AdminDriverPayoutResponse>(
    `${apiRoutes.admin.driverPayouts}/${payoutId}/paid`,
    {
      method: "POST",
      body: payload,
    },
  );
}

export function buildAdminDriverPayoutSettlementCsvUrl(
  status: "PREPARED" | "PAID" | "CANCELLED" = "PREPARED",
) {
  return `${apiRoutes.admin.driverPayoutSettlementCsv}?status=${status}`;
}

export function buildAdminDriverPayoutSettlementPdfUrl(
  status: "PREPARED" | "PAID" | "CANCELLED" = "PREPARED",
) {
  return `${apiRoutes.admin.driverPayoutSettlementPdf}?status=${status}`;
}

export async function updateAdminSupportTicket(
  client: OrbiApiClient,
  ticketId: string,
  payload: {
    status?: "OPEN" | "IN_REVIEW" | "RESOLVED" | "CLOSED";
    priority?: number;
    adminNote?: string;
  },
) {
  return client.request<SupportTicketUpdateResponse>(
    `${apiRoutes.admin.supportTickets}/${ticketId}`,
    {
      method: "PATCH",
      body: payload,
    },
  );
}

export async function fetchAdminDriverOnboardingQueue(
  client: OrbiApiClient,
  query?: {
    page?: number;
    pageSize?: number;
  },
) {
  return client.request<DriverOnboardingQueueResponse>(
    apiRoutes.admin.driverOnboardingQueue,
    {
      query,
    },
  );
}

export async function fetchAdminDriverOnboardingExportCsv(
  client: OrbiApiClient,
  query?: {
    guidanceFilter?: "all" | "approve" | "review" | "resubmit";
    searchQuery?: string;
    limit?: number;
  },
) {
  return client.requestText(apiRoutes.admin.driverOnboardingExportCsv, {
    query,
  });
}

export async function fetchAdminDriverOnboardingExportHistory(
  client: OrbiApiClient,
  query?: {
    page?: number;
    pageSize?: number;
  },
) {
  return client.request<DriverOnboardingExportHistoryResponse>(
    apiRoutes.admin.driverOnboardingExportHistory,
    {
      query,
    },
  );
}

export async function fetchAdminTripsExportCsv(
  client: OrbiApiClient,
  query?: {
    status?:
      | "MATCHED"
      | "DRIVER_ARRIVING"
      | "IN_PROGRESS"
      | "COMPLETED"
      | "CANCELLED";
    limit?: number;
  },
) {
  return client.requestText(apiRoutes.admin.tripsExportCsv, {
    query,
  });
}

export async function fetchAdminFeatureFlags(client: OrbiApiClient) {
  return client.request<AdminFeatureFlagsResponse>(
    apiRoutes.admin.featureFlags,
  );
}

export async function fetchAdminDispatchSettings(client: OrbiApiClient) {
  return client.request<AdminDispatchSettingsResponse>(
    apiRoutes.admin.dispatchSettings,
  );
}

export async function fetchAdminPricingCalibration(client: OrbiApiClient) {
  return client.request<AdminPricingCalibrationResponse>(
    apiRoutes.admin.pricingCalibration,
  );
}

export async function fetchAdminPaymentWebhookEvents(
  client: OrbiApiClient,
  query?: {
    page?: number;
    pageSize?: number;
    provider?: PaymentProviderCode;
    action?: string;
    kind?: "payment" | "refund" | "ignored";
    transactionRef?: string;
    providerReference?: string;
  },
) {
  return client.request<AdminPaymentWebhookEventsResponse>(
    apiRoutes.admin.paymentWebhookEvents,
    {
      query,
    },
  );
}

export async function fetchAdminPaymentWebhookEventDetail(
  client: OrbiApiClient,
  eventId: string,
) {
  return client.request<AdminPaymentWebhookEventDetailResponse>(
    `${apiRoutes.admin.paymentWebhookEvents}/${eventId}`,
  );
}

export async function startAdminPaymentWebhookInvestigation(
  client: OrbiApiClient,
  eventId: string,
) {
  return client.request<AdminPaymentWebhookInvestigationResponse>(
    `${apiRoutes.admin.paymentWebhookEvents}/${eventId}/investigation`,
    {
      method: "POST",
    },
  );
}

export async function replayAdminPaymentWebhookEvent(
  client: OrbiApiClient,
  eventId: string,
) {
  return client.request<AdminPaymentWebhookReplayResponse>(
    `${apiRoutes.admin.paymentWebhookEvents}/${eventId}/replay`,
    {
      method: "POST",
    },
  );
}

export async function verifyAdminPaymentAttemptWithProvider(
  client: OrbiApiClient,
  paymentAttemptId: string,
) {
  return client.request<AdminPaymentAttemptProviderVerificationResponse>(
    `${apiRoutes.admin.paymentAttempts}/${paymentAttemptId}/verify-provider`,
    {
      method: "POST",
    },
  );
}

export async function refundAdminPaymentAttempt(
  client: OrbiApiClient,
  paymentAttemptId: string,
  payload: { reason?: string } = {},
) {
  return client.request<AdminPaymentAttemptRefundResponse>(
    `${apiRoutes.admin.paymentAttempts}/${paymentAttemptId}/refund`,
    {
      method: "POST",
      body: payload,
    },
  );
}

export async function updateAdminDispatchSettings(
  client: OrbiApiClient,
  payload: {
    lookbackHours?: number;
    halfLifeHours?: number;
    declineCooldownMinutes?: number;
    historyLimit?: number;
    resetToDefaults?: boolean;
  },
) {
  return client.request<AdminDispatchSettingsResponse>(
    apiRoutes.admin.dispatchSettings,
    {
      method: "PATCH",
      body: payload,
    },
  );
}

export async function fetchHealthCheck(client: OrbiApiClient) {
  return client.request<HealthCheckResponse>(apiRoutes.health);
}

export async function acknowledgeAdminHealthIncident(
  client: OrbiApiClient,
  incidentId: string,
) {
  return client.request<{
    incident: HealthCheckResponse["operations"]["healthHistory"][number];
  }>(`${apiRoutes.admin.healthIncidents}/${incidentId}/acknowledge`, {
    method: "PATCH",
  });
}

export async function muteAdminHealthIncident(
  client: OrbiApiClient,
  incidentId: string,
) {
  return client.request<{
    incident: HealthCheckResponse["operations"]["healthHistory"][number];
  }>(`${apiRoutes.admin.healthIncidents}/${incidentId}/mute`, {
    method: "PATCH",
  });
}

export async function updateAdminDriverOnboardingReview(
  client: OrbiApiClient,
  driverId: string,
  payload: {
    status: "UNDER_REVIEW" | "APPROVED" | "REJECTED" | "CHANGES_REQUESTED";
    notesInternal?: string;
    decisionReason?: string;
    supportPriority?: number;
    documentDecisions?: Array<{
      documentId: string;
      status: "PENDING" | "APPROVED" | "REJECTED" | "EXPIRED";
      rejectionReason?: string;
      expiresAt?: string;
    }>;
  },
) {
  return client.request<DriverOnboardingReviewUpdateResponse>(
    `${apiRoutes.admin.driverOnboarding}/${driverId}/review`,
    {
      method: "PATCH",
      body: payload,
    },
  );
}

export async function suspendAdminDriver(
  client: OrbiApiClient,
  driverId: string,
  reason: string,
) {
  return client.request<{ driverId: string; status: "SUSPENDED" }>(
    `/admin/drivers/${driverId}/suspend`,
    { method: "POST", body: { reason } },
  );
}

export async function reactivateAdminDriver(
  client: OrbiApiClient,
  driverId: string,
) {
  return client.request<{ driverId: string; status: "OFFLINE" }>(
    `/admin/drivers/${driverId}/reactivate`,
    { method: "POST" },
  );
}

export async function fetchAdminDriverDocumentViewLink(
  client: OrbiApiClient,
  driverId: string,
  documentId: string,
) {
  return client.request<DriverDocumentViewLinkResponse>(
    `${apiRoutes.admin.driverOnboarding}/${driverId}/documents/${documentId}/view-link`,
  );
}

export async function updateAdminDriverDocumentObjectVerification(
  client: OrbiApiClient,
  driverId: string,
  documentId: string,
  payload: {
    state: "confirmed" | "failed";
    provider: string;
    objectId?: string;
    sizeBytes?: number;
    sha256?: string;
    failureReason?: string;
  },
) {
  return client.request<DriverDocumentObjectVerificationResponse>(
    `${apiRoutes.admin.driverOnboarding}/${driverId}/documents/${documentId}/object-verification`,
    {
      method: "PATCH",
      body: payload,
    },
  );
}

export async function verifyAdminDriverDocumentObjectWithProvider(
  client: OrbiApiClient,
  driverId: string,
  documentId: string,
) {
  return client.request<DriverDocumentObjectVerificationResponse>(
    `${apiRoutes.admin.driverOnboarding}/${driverId}/documents/${documentId}/object-verification/verify-provider`,
    {
      method: "POST",
    },
  );
}

export async function listAdminPromoCodes(
  client: OrbiApiClient,
): Promise<ListAdminPromoCodesResponse> {
  return client.request<ListAdminPromoCodesResponse>("/admin/promo-codes");
}

export async function createAdminPromoCode(
  client: OrbiApiClient,
  payload: CreateAdminPromoCodePayload,
): Promise<PromoCodeItem> {
  return client.request<PromoCodeItem>("/admin/promo-codes", {
    method: "POST",
    body: payload,
  });
}

export async function deactivateAdminPromoCode(
  client: OrbiApiClient,
  promoCodeId: string,
): Promise<{ promoCodeId: string; active: false }> {
  return client.request<{ promoCodeId: string; active: false }>(
    `/admin/promo-codes/${promoCodeId}`,
    { method: "DELETE" },
  );
}
