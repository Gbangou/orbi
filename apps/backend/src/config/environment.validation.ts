type EnvironmentVariables = {
  PORT?: string;
  HOST?: string;
  NODE_ENV?: string;
  DATABASE_URL?: string;
  FRONTEND_ALLOWED_ORIGINS?: string;
  TRUST_PROXY?: string;
  ENABLE_SWAGGER?: string;
  REQUEST_BODY_LIMIT?: string;
  HTTP_KEEP_ALIVE_TIMEOUT_MS?: string;
  HTTP_HEADERS_TIMEOUT_MS?: string;
  RATE_LIMIT_ADAPTER?: string;
  RATE_LIMIT_REDIS_URL?: string;
  RATE_LIMIT_STRICT?: string;
  REALTIME_ADAPTER?: string;
  REALTIME_REDIS_URL?: string;
  REALTIME_STRICT?: string;
  GRACEFUL_SHUTDOWN_TIMEOUT_MS?: string;
  DRIVER_RESERVATION_EXPIRY_SWEEP_INTERVAL_MS?: string;
  DRIVER_RESERVATION_EXPIRY_MAX_SILENCE_MS?: string;
  HEALTH_WATCHDOG_INTERVAL_MS?: string;
  HEALTH_WATCHDOG_ALERT_COOLDOWN_MS?: string;
  HEALTH_INCIDENT_HISTORY_LIMIT?: string;
  JOB_QUEUE_WORKER_ENABLED?: string;
  JOB_QUEUE_WORKER_INTERVAL_MS?: string;
  JOB_QUEUE_WORKER_BATCH_SIZE?: string;
  JOB_QUEUE_WORKER_RETRY_DELAY_MS?: string;
  JOB_QUEUE_WORKER_STALE_AFTER_MS?: string;
  DISPATCH_SIGNAL_LOOKBACK_HOURS?: string;
  DISPATCH_SIGNAL_HALF_LIFE_HOURS?: string;
  DISPATCH_DECLINE_COOLDOWN_MINUTES?: string;
  DISPATCH_SIGNAL_HISTORY_LIMIT?: string;
  FEATURE_FLAG_PAYMENTS?: string;
  FEATURE_FLAG_PAYMENTS_ALLOWLIST?: string;
  FEATURE_FLAG_PRICING?: string;
  FEATURE_FLAG_PRICING_ALLOWLIST?: string;
  FEATURE_FLAG_REALTIME?: string;
  FEATURE_FLAG_REALTIME_ALLOWLIST?: string;
  FEATURE_FLAG_DRIVER_ONBOARDING?: string;
  FEATURE_FLAG_DRIVER_ONBOARDING_ALLOWLIST?: string;
  FEATURE_FLAG_VOICE?: string;
  FEATURE_FLAG_VOICE_ALLOWLIST?: string;
  PAYMENTS_PROVIDER?: string;
  PAYMENTS_CURRENCY?: string;
  PAYMENTS_WEBHOOK_SECRET?: string;
  PAYMENTS_DEFAULT_REDIRECT_URL?: string;
  PAYMENTS_DEFAULT_WEBHOOK_URL?: string;
  PAYMENTS_REFUND_MODE?: string;
  FLUTTERWAVE_PUBLIC_KEY?: string;
  FLUTTERWAVE_SECRET_KEY?: string;
  FLUTTERWAVE_WEBHOOK_SECRET_HASH?: string;
  CINETPAY_SITE_ID?: string;
  CINETPAY_API_KEY?: string;
  CINETPAY_SECRET_KEY?: string;
  NOTIFICATIONS_PROVIDER?: string;
  NOTIFICATIONS_PROVIDER_TIMEOUT_MS?: string;
  MOBILE_ERROR_COLLECTOR_PROVIDER?: string;
  MOBILE_ERROR_COLLECTOR_WEBHOOK_URL?: string;
  MOBILE_ERROR_COLLECTOR_TIMEOUT_MS?: string;
  DOCUMENT_SIGNING_SECRET?: string;
  DOCUMENT_SAFETY_SCANNER_PROVIDER?: string;
  DOCUMENT_UPLOAD_BASE_URL?: string;
  DOCUMENT_VIEW_BASE_URL?: string;
  DOCUMENT_OBJECT_PROVIDER?: string;
  DOCUMENT_LOCAL_PROVIDER_ROOT?: string;
  DOCUMENT_LINK_TTL_SECONDS?: string;
};

export function validateEnvironment(config: EnvironmentVariables) {
  const isTestEnvironment = config.NODE_ENV === 'test';
  const isProductionEnvironment = config.NODE_ENV === 'production';

  if (!config.DATABASE_URL && !isTestEnvironment) {
    throw new Error('DATABASE_URL is required to start the Orbi backend.');
  }

  if (isProductionEnvironment) {
    assertProductionEnvironment(config);
  }

  return {
    PORT: config.PORT ?? '3000',
    HOST: config.HOST ?? '0.0.0.0',
    NODE_ENV: config.NODE_ENV ?? 'development',
    DATABASE_URL:
      config.DATABASE_URL ??
      'postgresql://postgres:postgres@localhost:5433/orbi?schema=public',
    FRONTEND_ALLOWED_ORIGINS:
      config.FRONTEND_ALLOWED_ORIGINS ??
      'http://localhost:3001,http://localhost:8081',
    TRUST_PROXY: config.TRUST_PROXY ?? 'false',
    ENABLE_SWAGGER: config.ENABLE_SWAGGER ?? 'true',
    REQUEST_BODY_LIMIT: config.REQUEST_BODY_LIMIT ?? '256kb',
    HTTP_KEEP_ALIVE_TIMEOUT_MS: config.HTTP_KEEP_ALIVE_TIMEOUT_MS ?? '65000',
    HTTP_HEADERS_TIMEOUT_MS: config.HTTP_HEADERS_TIMEOUT_MS ?? '66000',
    RATE_LIMIT_ADAPTER: config.RATE_LIMIT_ADAPTER ?? 'in-memory',
    RATE_LIMIT_REDIS_URL: config.RATE_LIMIT_REDIS_URL ?? '',
    RATE_LIMIT_STRICT: config.RATE_LIMIT_STRICT ?? 'false',
    REALTIME_ADAPTER: config.REALTIME_ADAPTER ?? 'in-memory',
    REALTIME_REDIS_URL: config.REALTIME_REDIS_URL ?? '',
    REALTIME_STRICT: config.REALTIME_STRICT ?? 'false',
    GRACEFUL_SHUTDOWN_TIMEOUT_MS:
      config.GRACEFUL_SHUTDOWN_TIMEOUT_MS ?? '15000',
    DRIVER_RESERVATION_EXPIRY_SWEEP_INTERVAL_MS:
      config.DRIVER_RESERVATION_EXPIRY_SWEEP_INTERVAL_MS ?? '5000',
    DRIVER_RESERVATION_EXPIRY_MAX_SILENCE_MS:
      config.DRIVER_RESERVATION_EXPIRY_MAX_SILENCE_MS ?? '30000',
    HEALTH_WATCHDOG_INTERVAL_MS: config.HEALTH_WATCHDOG_INTERVAL_MS ?? '15000',
    HEALTH_WATCHDOG_ALERT_COOLDOWN_MS:
      config.HEALTH_WATCHDOG_ALERT_COOLDOWN_MS ?? '60000',
    HEALTH_INCIDENT_HISTORY_LIMIT: config.HEALTH_INCIDENT_HISTORY_LIMIT ?? '12',
    JOB_QUEUE_WORKER_ENABLED: config.JOB_QUEUE_WORKER_ENABLED ?? 'true',
    JOB_QUEUE_WORKER_INTERVAL_MS: config.JOB_QUEUE_WORKER_INTERVAL_MS ?? '5000',
    JOB_QUEUE_WORKER_BATCH_SIZE: config.JOB_QUEUE_WORKER_BATCH_SIZE ?? '10',
    JOB_QUEUE_WORKER_RETRY_DELAY_MS:
      config.JOB_QUEUE_WORKER_RETRY_DELAY_MS ?? '30000',
    JOB_QUEUE_WORKER_STALE_AFTER_MS:
      config.JOB_QUEUE_WORKER_STALE_AFTER_MS ?? '300000',
    DISPATCH_SIGNAL_LOOKBACK_HOURS:
      config.DISPATCH_SIGNAL_LOOKBACK_HOURS ?? '72',
    DISPATCH_SIGNAL_HALF_LIFE_HOURS:
      config.DISPATCH_SIGNAL_HALF_LIFE_HOURS ?? '18',
    DISPATCH_DECLINE_COOLDOWN_MINUTES:
      config.DISPATCH_DECLINE_COOLDOWN_MINUTES ?? '20',
    DISPATCH_SIGNAL_HISTORY_LIMIT: config.DISPATCH_SIGNAL_HISTORY_LIMIT ?? '48',
    FEATURE_FLAG_PAYMENTS: config.FEATURE_FLAG_PAYMENTS ?? 'on',
    FEATURE_FLAG_PAYMENTS_ALLOWLIST:
      config.FEATURE_FLAG_PAYMENTS_ALLOWLIST ?? '',
    FEATURE_FLAG_PRICING: config.FEATURE_FLAG_PRICING ?? 'on',
    FEATURE_FLAG_PRICING_ALLOWLIST: config.FEATURE_FLAG_PRICING_ALLOWLIST ?? '',
    FEATURE_FLAG_REALTIME: config.FEATURE_FLAG_REALTIME ?? 'on',
    FEATURE_FLAG_REALTIME_ALLOWLIST:
      config.FEATURE_FLAG_REALTIME_ALLOWLIST ?? '',
    FEATURE_FLAG_DRIVER_ONBOARDING:
      config.FEATURE_FLAG_DRIVER_ONBOARDING ?? 'on',
    FEATURE_FLAG_DRIVER_ONBOARDING_ALLOWLIST:
      config.FEATURE_FLAG_DRIVER_ONBOARDING_ALLOWLIST ?? '',
    FEATURE_FLAG_VOICE: config.FEATURE_FLAG_VOICE ?? 'on',
    FEATURE_FLAG_VOICE_ALLOWLIST: config.FEATURE_FLAG_VOICE_ALLOWLIST ?? '',
    PAYMENTS_PROVIDER: config.PAYMENTS_PROVIDER ?? 'flutterwave',
    PAYMENTS_CURRENCY: config.PAYMENTS_CURRENCY ?? 'XOF',
    PAYMENTS_WEBHOOK_SECRET:
      config.PAYMENTS_WEBHOOK_SECRET ?? 'orbi_dev_webhook_secret',
    PAYMENTS_DEFAULT_REDIRECT_URL:
      config.PAYMENTS_DEFAULT_REDIRECT_URL ?? 'http://localhost:8081/book',
    PAYMENTS_DEFAULT_WEBHOOK_URL:
      config.PAYMENTS_DEFAULT_WEBHOOK_URL ??
      'http://localhost:3000/api/v1/payments/webhooks',
    PAYMENTS_REFUND_MODE: config.PAYMENTS_REFUND_MODE ?? 'manual',
    FLUTTERWAVE_PUBLIC_KEY: config.FLUTTERWAVE_PUBLIC_KEY ?? '',
    FLUTTERWAVE_SECRET_KEY: config.FLUTTERWAVE_SECRET_KEY ?? '',
    FLUTTERWAVE_WEBHOOK_SECRET_HASH:
      config.FLUTTERWAVE_WEBHOOK_SECRET_HASH ?? '',
    CINETPAY_SITE_ID: config.CINETPAY_SITE_ID ?? '',
    CINETPAY_API_KEY: config.CINETPAY_API_KEY ?? '',
    CINETPAY_SECRET_KEY: config.CINETPAY_SECRET_KEY ?? '',
    NOTIFICATIONS_PROVIDER: config.NOTIFICATIONS_PROVIDER ?? 'local',
    NOTIFICATIONS_PROVIDER_TIMEOUT_MS:
      config.NOTIFICATIONS_PROVIDER_TIMEOUT_MS ?? '5000',
    MOBILE_ERROR_COLLECTOR_PROVIDER:
      config.MOBILE_ERROR_COLLECTOR_PROVIDER ?? 'local',
    MOBILE_ERROR_COLLECTOR_WEBHOOK_URL:
      config.MOBILE_ERROR_COLLECTOR_WEBHOOK_URL ?? '',
    MOBILE_ERROR_COLLECTOR_TIMEOUT_MS:
      config.MOBILE_ERROR_COLLECTOR_TIMEOUT_MS ?? '1500',
    DOCUMENT_SIGNING_SECRET:
      config.DOCUMENT_SIGNING_SECRET ?? 'orbi_dev_document_secret',
    DOCUMENT_SAFETY_SCANNER_PROVIDER:
      config.DOCUMENT_SAFETY_SCANNER_PROVIDER ?? 'local-policy',
    DOCUMENT_UPLOAD_BASE_URL:
      config.DOCUMENT_UPLOAD_BASE_URL ?? 'https://storage.orbi.local/upload',
    DOCUMENT_VIEW_BASE_URL:
      config.DOCUMENT_VIEW_BASE_URL ?? 'https://storage.orbi.local/view',
    DOCUMENT_OBJECT_PROVIDER:
      config.DOCUMENT_OBJECT_PROVIDER ?? 'local-provider',
    DOCUMENT_LOCAL_PROVIDER_ROOT:
      config.DOCUMENT_LOCAL_PROVIDER_ROOT ?? '.orbi-document-store',
    DOCUMENT_LINK_TTL_SECONDS: config.DOCUMENT_LINK_TTL_SECONDS ?? '900',
  };
}

function assertProductionEnvironment(config: EnvironmentVariables) {
  const paymentsWebhookSecret = config.PAYMENTS_WEBHOOK_SECRET ?? '';
  const documentSigningSecret = config.DOCUMENT_SIGNING_SECRET ?? '';
  const frontendAllowedOrigins = config.FRONTEND_ALLOWED_ORIGINS ?? '';
  const defaultRedirectUrl = config.PAYMENTS_DEFAULT_REDIRECT_URL ?? '';
  const defaultWebhookUrl = config.PAYMENTS_DEFAULT_WEBHOOK_URL ?? '';
  const documentUploadBaseUrl = config.DOCUMENT_UPLOAD_BASE_URL ?? '';
  const documentViewBaseUrl = config.DOCUMENT_VIEW_BASE_URL ?? '';
  const mobileErrorCollectorProvider =
    config.MOBILE_ERROR_COLLECTOR_PROVIDER ?? '';
  const mobileErrorCollectorWebhookUrl =
    config.MOBILE_ERROR_COLLECTOR_WEBHOOK_URL ?? '';
  const databaseUrl = config.DATABASE_URL ?? '';

  if (config.ENABLE_SWAGGER !== 'false') {
    throw new Error('ENABLE_SWAGGER must be false in production.');
  }

  if (!paymentsWebhookSecret) {
    throw new Error('PAYMENTS_WEBHOOK_SECRET is required in production.');
  }

  if (paymentsWebhookSecret === 'orbi_dev_webhook_secret') {
    throw new Error(
      'PAYMENTS_WEBHOOK_SECRET must not use the dev default in production.',
    );
  }

  if (!documentSigningSecret) {
    throw new Error('DOCUMENT_SIGNING_SECRET is required in production.');
  }

  if (documentSigningSecret === 'orbi_dev_document_secret') {
    throw new Error(
      'DOCUMENT_SIGNING_SECRET must not use the dev default in production.',
    );
  }

  if (containsLocalhost(frontendAllowedOrigins)) {
    throw new Error(
      'FRONTEND_ALLOWED_ORIGINS must not include localhost in production.',
    );
  }

  if (containsWildcardOrigin(frontendAllowedOrigins)) {
    throw new Error(
      'FRONTEND_ALLOWED_ORIGINS must not include wildcard origins in production.',
    );
  }

  if (containsLocalhost(databaseUrl)) {
    throw new Error('DATABASE_URL must not use localhost in production.');
  }

  if (containsLocalhost(defaultRedirectUrl)) {
    throw new Error(
      'PAYMENTS_DEFAULT_REDIRECT_URL must not use localhost in production.',
    );
  }

  if (containsLocalhost(defaultWebhookUrl)) {
    throw new Error(
      'PAYMENTS_DEFAULT_WEBHOOK_URL must not use localhost in production.',
    );
  }

  if (!isHttpsUrl(documentUploadBaseUrl)) {
    throw new Error('DOCUMENT_UPLOAD_BASE_URL must be HTTPS in production.');
  }

  if (containsLocalhost(documentUploadBaseUrl)) {
    throw new Error(
      'DOCUMENT_UPLOAD_BASE_URL must not use localhost in production.',
    );
  }

  if (!isHttpsUrl(documentViewBaseUrl)) {
    throw new Error('DOCUMENT_VIEW_BASE_URL must be HTTPS in production.');
  }

  if (containsLocalhost(documentViewBaseUrl)) {
    throw new Error(
      'DOCUMENT_VIEW_BASE_URL must not use localhost in production.',
    );
  }

  if (!isSharedPostgresAdapter(config.RATE_LIMIT_ADAPTER)) {
    throw new Error(
      'RATE_LIMIT_ADAPTER must be postgres in production until another shared store is implemented.',
    );
  }

  if (config.RATE_LIMIT_STRICT !== 'true') {
    throw new Error('RATE_LIMIT_STRICT must be true in production.');
  }

  if (!isSharedPostgresAdapter(config.REALTIME_ADAPTER)) {
    throw new Error(
      'REALTIME_ADAPTER must be postgres in production until another shared transport is implemented.',
    );
  }

  if (config.REALTIME_STRICT !== 'true') {
    throw new Error('REALTIME_STRICT must be true in production.');
  }

  if (mobileErrorCollectorProvider !== 'webhook') {
    throw new Error(
      'MOBILE_ERROR_COLLECTOR_PROVIDER must be webhook in production until another external collector is implemented.',
    );
  }

  if (!isHttpsUrl(mobileErrorCollectorWebhookUrl)) {
    throw new Error(
      'MOBILE_ERROR_COLLECTOR_WEBHOOK_URL must be HTTPS in production.',
    );
  }

  if (containsLocalhost(mobileErrorCollectorWebhookUrl)) {
    throw new Error(
      'MOBILE_ERROR_COLLECTOR_WEBHOOK_URL must not use localhost in production.',
    );
  }

  if (
    config.PAYMENTS_REFUND_MODE === 'provider' &&
    config.PAYMENTS_PROVIDER === 'flutterwave' &&
    !config.FLUTTERWAVE_SECRET_KEY
  ) {
    throw new Error(
      'FLUTTERWAVE_SECRET_KEY is required for provider refunds in production.',
    );
  }
}

function containsLocalhost(value: string) {
  return /localhost|127\.0\.0\.1|\[::1\]/i.test(value);
}

function containsWildcardOrigin(value: string) {
  return value
    .split(',')
    .map((origin) => origin.trim())
    .some((origin) => origin === '*' || origin.endsWith('://*'));
}

function isHttpsUrl(value: string) {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

function isSharedPostgresAdapter(value: string | undefined) {
  return value === 'postgres' || value === 'postgresql';
}
