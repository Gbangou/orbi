export default () => ({
  app: {
    name: 'Mobilis',
    port: Number.parseInt(process.env.PORT ?? '3000', 10),
    environment: process.env.NODE_ENV ?? 'development',
    frontendOrigins: process.env.FRONTEND_ALLOWED_ORIGINS?.split(',')
      .map((origin) => origin.trim())
      .filter(Boolean) ?? ['http://localhost:3001', 'http://localhost:8081'],
  },
  database: {
    url: process.env.DATABASE_URL,
  },
  security: {
    trustedProxy: process.env.TRUST_PROXY === 'true',
    enableDocs: process.env.ENABLE_SWAGGER !== 'false',
  },
  http: {
    requestBodyLimit: process.env.REQUEST_BODY_LIMIT ?? '256kb',
    keepAliveTimeoutMs: Number.parseInt(
      process.env.HTTP_KEEP_ALIVE_TIMEOUT_MS ?? '65000',
      10,
    ),
    headersTimeoutMs: Number.parseInt(
      process.env.HTTP_HEADERS_TIMEOUT_MS ?? '66000',
      10,
    ),
  },
  infrastructure: {
    rateLimitAdapter: process.env.RATE_LIMIT_ADAPTER ?? 'in-memory',
    rateLimit: {
      adapter: process.env.RATE_LIMIT_ADAPTER ?? 'in-memory',
      redisUrl: process.env.RATE_LIMIT_REDIS_URL,
      strict: process.env.RATE_LIMIT_STRICT === 'true',
    },
    realtimeAdapter: process.env.REALTIME_ADAPTER ?? 'in-memory',
    realtime: {
      adapter: process.env.REALTIME_ADAPTER ?? 'in-memory',
      redisUrl: process.env.REALTIME_REDIS_URL,
      strict: process.env.REALTIME_STRICT === 'true',
    },
  },
  operations: {
    gracefulShutdownTimeoutMs: Number.parseInt(
      process.env.GRACEFUL_SHUTDOWN_TIMEOUT_MS ?? '15000',
      10,
    ),
    driverReservationExpirySweepIntervalMs: Number.parseInt(
      process.env.DRIVER_RESERVATION_EXPIRY_SWEEP_INTERVAL_MS ?? '5000',
      10,
    ),
    driverReservationExpiryMaxSilenceMs: Number.parseInt(
      process.env.DRIVER_RESERVATION_EXPIRY_MAX_SILENCE_MS ?? '30000',
      10,
    ),
    healthWatchdogIntervalMs: Number.parseInt(
      process.env.HEALTH_WATCHDOG_INTERVAL_MS ?? '15000',
      10,
    ),
    healthWatchdogAlertCooldownMs: Number.parseInt(
      process.env.HEALTH_WATCHDOG_ALERT_COOLDOWN_MS ?? '60000',
      10,
    ),
    healthIncidentHistoryLimit: Number.parseInt(
      process.env.HEALTH_INCIDENT_HISTORY_LIMIT ?? '12',
      10,
    ),
    dispatchSignalLookbackHours: Number.parseInt(
      process.env.DISPATCH_SIGNAL_LOOKBACK_HOURS ?? '72',
      10,
    ),
    dispatchSignalHalfLifeHours: Number.parseInt(
      process.env.DISPATCH_SIGNAL_HALF_LIFE_HOURS ?? '18',
      10,
    ),
    dispatchDeclineCooldownMinutes: Number.parseInt(
      process.env.DISPATCH_DECLINE_COOLDOWN_MINUTES ?? '20',
      10,
    ),
    dispatchSignalHistoryLimit: Number.parseInt(
      process.env.DISPATCH_SIGNAL_HISTORY_LIMIT ?? '48',
      10,
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
  },
  payments: {
    provider: process.env.PAYMENTS_PROVIDER ?? 'flutterwave',
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
  },
  documents: {
    signingSecret:
      process.env.DOCUMENT_SIGNING_SECRET ?? 'mobilis_dev_document_secret',
    uploadBaseUrl:
      process.env.DOCUMENT_UPLOAD_BASE_URL ??
      'https://storage.mobilis.local/upload',
    viewBaseUrl:
      process.env.DOCUMENT_VIEW_BASE_URL ??
      'https://storage.mobilis.local/view',
    ttlSeconds: Number.parseInt(
      process.env.DOCUMENT_LINK_TTL_SECONDS ?? '900',
      10,
    ),
  },
});
