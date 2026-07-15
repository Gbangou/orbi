const strictIntegerPattern = /^-?\d+$/;

export function resolveConfigInteger(value: string | undefined, fallback: number) {
  const normalized = value?.trim();

  if (!normalized || !strictIntegerPattern.test(normalized)) {
    return fallback;
  }

  const parsed = Number(normalized);

  return Number.isSafeInteger(parsed) ? parsed : fallback;
}

export default () => ({
  app: {
    name: 'Orbi',
    port: resolveConfigInteger(process.env.PORT, 3000),
    host: process.env.HOST ?? '0.0.0.0',
    environment: process.env.NODE_ENV ?? 'development',
    frontendOrigins: process.env.FRONTEND_ALLOWED_ORIGINS?.split(',')
      .map((origin) => origin.trim())
      .filter(Boolean) ?? [
      'http://localhost:3001',
      'http://localhost:8081',
      'http://localhost:8082',
    ],
  },
  database: {
    url: process.env.DATABASE_URL,
  },
  security: {
    trustedProxy: process.env.TRUST_PROXY === 'true',
    enableDocs:
      process.env.NODE_ENV === 'production'
        ? process.env.ENABLE_SWAGGER === 'true'
        : process.env.ENABLE_SWAGGER !== 'false',
  },
  http: {
    requestBodyLimit: process.env.REQUEST_BODY_LIMIT ?? '256kb',
    keepAliveTimeoutMs: resolveConfigInteger(
      process.env.HTTP_KEEP_ALIVE_TIMEOUT_MS,
      65000,
    ),
    headersTimeoutMs: resolveConfigInteger(
      process.env.HTTP_HEADERS_TIMEOUT_MS,
      66000,
    ),
  },
  infrastructure: {
    rateLimitAdapter: process.env.RATE_LIMIT_ADAPTER ?? 'in-memory',
    rateLimit: {
      adapter: process.env.RATE_LIMIT_ADAPTER ?? 'in-memory',
      redisUrl: process.env.RATE_LIMIT_REDIS_URL,
      postgresUrl: process.env.DATABASE_URL,
      strict: process.env.RATE_LIMIT_STRICT === 'true',
    },
    realtimeAdapter: process.env.REALTIME_ADAPTER ?? 'in-memory',
    realtime: {
      adapter: process.env.REALTIME_ADAPTER ?? 'in-memory',
      redisUrl: process.env.REALTIME_REDIS_URL,
      postgresUrl: process.env.DATABASE_URL,
      strict: process.env.REALTIME_STRICT === 'true',
    },
  },
  operations: {
    gracefulShutdownTimeoutMs: resolveConfigInteger(
      process.env.GRACEFUL_SHUTDOWN_TIMEOUT_MS,
      15000,
    ),
    driverReservationExpirySweepIntervalMs: resolveConfigInteger(
      process.env.DRIVER_RESERVATION_EXPIRY_SWEEP_INTERVAL_MS,
      5000,
    ),
    driverReservationExpiryMaxSilenceMs: resolveConfigInteger(
      process.env.DRIVER_RESERVATION_EXPIRY_MAX_SILENCE_MS,
      30000,
    ),
    paymentAttemptReconciliationSweepIntervalMs: resolveConfigInteger(
      process.env.PAYMENT_ATTEMPT_RECONCILIATION_SWEEP_INTERVAL_MS,
      120000,
    ),
    paymentAttemptReconciliationStaleAfterMs: resolveConfigInteger(
      process.env.PAYMENT_ATTEMPT_RECONCILIATION_STALE_AFTER_MS,
      600000,
    ),
    paymentAttemptReconciliationBatchSize: resolveConfigInteger(
      process.env.PAYMENT_ATTEMPT_RECONCILIATION_BATCH_SIZE,
      25,
    ),
    backupRestoreDrillAt: process.env.OPERATIONS_BACKUP_RESTORE_DRILL_AT ?? '',
    canaryReleaseDrillAt:
      process.env.OPERATIONS_CANARY_RELEASE_DRILL_AT ?? '',
    chaosDrainDrillAt: process.env.OPERATIONS_CHAOS_DRAIN_DRILL_AT ?? '',
    pilotReviewAt: process.env.OPERATIONS_PILOT_REVIEW_AT ?? '',
    termsVersion: process.env.OPERATIONS_TERMS_VERSION ?? '',
    privacyVersion: process.env.OPERATIONS_PRIVACY_VERSION ?? '',
    insurancePolicyRef: process.env.OPERATIONS_INSURANCE_POLICY_REF ?? '',
    pilotMaxConcurrentTrips: resolveConfigInteger(
      process.env.OPERATIONS_PILOT_MAX_CONCURRENT_TRIPS,
      0,
    ),
    healthWatchdogIntervalMs: resolveConfigInteger(
      process.env.HEALTH_WATCHDOG_INTERVAL_MS,
      15000,
    ),
    healthWatchdogAlertCooldownMs: resolveConfigInteger(
      process.env.HEALTH_WATCHDOG_ALERT_COOLDOWN_MS,
      60000,
    ),
    healthIncidentHistoryLimit: resolveConfigInteger(
      process.env.HEALTH_INCIDENT_HISTORY_LIMIT,
      12,
    ),
    jobQueueWorkerEnabled: process.env.JOB_QUEUE_WORKER_ENABLED !== 'false',
    jobQueueWorkerIntervalMs: resolveConfigInteger(
      process.env.JOB_QUEUE_WORKER_INTERVAL_MS,
      5000,
    ),
    jobQueueWorkerBatchSize: resolveConfigInteger(
      process.env.JOB_QUEUE_WORKER_BATCH_SIZE,
      10,
    ),
    jobQueueWorkerRetryDelayMs: resolveConfigInteger(
      process.env.JOB_QUEUE_WORKER_RETRY_DELAY_MS,
      30000,
    ),
    jobQueueWorkerStaleAfterMs: resolveConfigInteger(
      process.env.JOB_QUEUE_WORKER_STALE_AFTER_MS,
      300000,
    ),
    dispatchSignalLookbackHours: resolveConfigInteger(
      process.env.DISPATCH_SIGNAL_LOOKBACK_HOURS,
      72,
    ),
    dispatchSignalHalfLifeHours: resolveConfigInteger(
      process.env.DISPATCH_SIGNAL_HALF_LIFE_HOURS,
      18,
    ),
    dispatchDeclineCooldownMinutes: resolveConfigInteger(
      process.env.DISPATCH_DECLINE_COOLDOWN_MINUTES,
      20,
    ),
    dispatchSignalHistoryLimit: resolveConfigInteger(
      process.env.DISPATCH_SIGNAL_HISTORY_LIMIT,
      48,
    ),
  },
  featureFlags: {
    payments: process.env.FEATURE_FLAG_PAYMENTS ?? 'on',
    paymentsAllowlist:
      process.env.FEATURE_FLAG_PAYMENTS_ALLOWLIST?.split(',')
        .map((value) => value.trim())
        .filter(Boolean) ?? [],
    pricing: process.env.FEATURE_FLAG_PRICING ?? 'on',
    pricingAllowlist:
      process.env.FEATURE_FLAG_PRICING_ALLOWLIST?.split(',')
        .map((value) => value.trim())
        .filter(Boolean) ?? [],
    realtime: process.env.FEATURE_FLAG_REALTIME ?? 'on',
    realtimeAllowlist:
      process.env.FEATURE_FLAG_REALTIME_ALLOWLIST?.split(',')
        .map((value) => value.trim())
        .filter(Boolean) ?? [],
    driverOnboarding: process.env.FEATURE_FLAG_DRIVER_ONBOARDING ?? 'on',
    driverOnboardingAllowlist:
      process.env.FEATURE_FLAG_DRIVER_ONBOARDING_ALLOWLIST?.split(',')
        .map((value) => value.trim())
        .filter(Boolean) ?? [],
    voice: process.env.FEATURE_FLAG_VOICE ?? 'on',
    voiceAllowlist:
      process.env.FEATURE_FLAG_VOICE_ALLOWLIST?.split(',')
        .map((value) => value.trim())
        .filter(Boolean) ?? [],
    driverAutoOnboard: process.env.FEATURE_FLAG_DRIVER_AUTO_ONBOARD ?? 'off',
  },
  payments: {
    provider: process.env.PAYMENTS_PROVIDER ?? 'pawapay',
    currency: process.env.PAYMENTS_CURRENCY ?? 'XOF',
    webhookSecret: process.env.PAYMENTS_WEBHOOK_SECRET,
    defaultRedirectUrl: process.env.PAYMENTS_DEFAULT_REDIRECT_URL,
    defaultWebhookUrl: process.env.PAYMENTS_DEFAULT_WEBHOOK_URL,
    refunds: {
      mode: process.env.PAYMENTS_REFUND_MODE ?? 'manual',
    },
    flutterwave: {
      publicKey: process.env.FLUTTERWAVE_PUBLIC_KEY,
      secretKey: process.env.FLUTTERWAVE_SECRET_KEY,
      webhookSecretHash: process.env.FLUTTERWAVE_WEBHOOK_SECRET_HASH,
    },
    cinetpay: {
      siteId: process.env.CINETPAY_SITE_ID,
      apiKey: process.env.CINETPAY_API_KEY,
      secretKey:
        process.env.CINETPAY_SECRET_KEY ?? process.env.CINETPAY_API_KEY,
    },
    pawapay: {
      apiToken: process.env.PAWAPAY_API_TOKEN,
      webhookSecret: process.env.PAWAPAY_WEBHOOK_SECRET,
      environment: process.env.PAWAPAY_ENVIRONMENT ?? 'sandbox',
    },
  },
  notifications: {
    provider: process.env.NOTIFICATIONS_PROVIDER ?? 'local',
    providerTimeoutMs: resolveConfigInteger(
      process.env.NOTIFICATIONS_PROVIDER_TIMEOUT_MS,
      5000,
    ),
  },
  observability: {
    mobileErrorCollector: {
      provider: process.env.MOBILE_ERROR_COLLECTOR_PROVIDER ?? 'local',
      webhookUrl: process.env.MOBILE_ERROR_COLLECTOR_WEBHOOK_URL ?? '',
      timeoutMs: resolveConfigInteger(
        process.env.MOBILE_ERROR_COLLECTOR_TIMEOUT_MS,
        1500,
      ),
    },
  },
  documents: {
    signingSecret:
      process.env.DOCUMENT_SIGNING_SECRET ?? 'orbi_dev_document_secret',
    safetyScannerProvider:
      process.env.DOCUMENT_SAFETY_SCANNER_PROVIDER ?? 'local-policy',
    uploadBaseUrl:
      process.env.DOCUMENT_UPLOAD_BASE_URL ??
      'https://storage.orbi.local/upload',
    viewBaseUrl:
      process.env.DOCUMENT_VIEW_BASE_URL ?? 'https://storage.orbi.local/view',
    objectProvider: process.env.DOCUMENT_OBJECT_PROVIDER ?? 'local-provider',
    localProviderRoot:
      process.env.DOCUMENT_LOCAL_PROVIDER_ROOT ?? '.orbi-document-store',
    ttlSeconds: resolveConfigInteger(process.env.DOCUMENT_LINK_TTL_SECONDS, 900),
  },
});
