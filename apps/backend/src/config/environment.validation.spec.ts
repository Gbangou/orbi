import { validateEnvironment } from './environment.validation';

describe('validateEnvironment', () => {
  const productionBase = {
    NODE_ENV: 'production',
    DATABASE_URL: 'postgresql://mobilis:secret@db.internal:5432/mobilis',
    FRONTEND_ALLOWED_ORIGINS: 'https://admin.mobilis.app,https://mobilis.app',
    PAYMENTS_WEBHOOK_SECRET: 'prod_webhook_secret',
    PAYMENTS_DEFAULT_REDIRECT_URL: 'https://mobilis.app/payments/return',
    PAYMENTS_DEFAULT_WEBHOOK_URL:
      'https://api.mobilis.app/api/v1/payments/webhooks',
    DOCUMENT_SIGNING_SECRET: 'prod_document_secret',
    DOCUMENT_UPLOAD_BASE_URL: 'https://storage.mobilis.app/upload',
    DOCUMENT_VIEW_BASE_URL: 'https://storage.mobilis.app/view',
    ENABLE_SWAGGER: 'false',
  };

  it('keeps development defaults available outside production', () => {
    const env = validateEnvironment({
      NODE_ENV: 'development',
      DATABASE_URL: 'postgresql://postgres:postgres@localhost:5433/mobilis',
    });

    expect(env.PAYMENTS_WEBHOOK_SECRET).toBe('mobilis_dev_webhook_secret');
    expect(env.DOCUMENT_SIGNING_SECRET).toBe('mobilis_dev_document_secret');
  });

  const productionSharedBackplanes = {
    RATE_LIMIT_ADAPTER: 'postgres',
    RATE_LIMIT_STRICT: 'true',
    REALTIME_ADAPTER: 'postgres',
    REALTIME_STRICT: 'true',
  };

  it('accepts a production configuration with postgres shared backplanes', () => {
    const env = validateEnvironment({
      ...productionBase,
      ...productionSharedBackplanes,
    });

    expect(env.NODE_ENV).toBe('production');
    expect(env.PAYMENTS_WEBHOOK_SECRET).toBe('prod_webhook_secret');
  });

  it('rejects a production configuration that relies on local adapter defaults', () => {
    expect(() => validateEnvironment(productionBase)).toThrow(
      'RATE_LIMIT_ADAPTER must be postgres in production until another shared store is implemented.',
    );
  });

  it.each([
    [
      'Swagger enabled',
      { ENABLE_SWAGGER: 'true' },
      'ENABLE_SWAGGER must be false in production.',
    ],
    [
      'dev payment webhook secret',
      { PAYMENTS_WEBHOOK_SECRET: 'mobilis_dev_webhook_secret' },
      'PAYMENTS_WEBHOOK_SECRET must not use the dev default in production.',
    ],
    [
      'missing payment webhook secret',
      { PAYMENTS_WEBHOOK_SECRET: undefined },
      'PAYMENTS_WEBHOOK_SECRET is required in production.',
    ],
    [
      'dev document signing secret',
      { DOCUMENT_SIGNING_SECRET: 'mobilis_dev_document_secret' },
      'DOCUMENT_SIGNING_SECRET must not use the dev default in production.',
    ],
    [
      'localhost frontend origin',
      {
        FRONTEND_ALLOWED_ORIGINS:
          'https://admin.mobilis.app,http://localhost:3001',
      },
      'FRONTEND_ALLOWED_ORIGINS must not include localhost in production.',
    ],
    [
      'wildcard frontend origin',
      { FRONTEND_ALLOWED_ORIGINS: 'https://admin.mobilis.app,*' },
      'FRONTEND_ALLOWED_ORIGINS must not include wildcard origins in production.',
    ],
    [
      'localhost database URL',
      { DATABASE_URL: 'postgresql://mobilis:secret@localhost:5432/mobilis' },
      'DATABASE_URL must not use localhost in production.',
    ],
    [
      'localhost redirect URL',
      { PAYMENTS_DEFAULT_REDIRECT_URL: 'http://localhost:8081/book' },
      'PAYMENTS_DEFAULT_REDIRECT_URL must not use localhost in production.',
    ],
    [
      'localhost webhook URL',
      {
        PAYMENTS_DEFAULT_WEBHOOK_URL:
          'http://localhost:3000/api/v1/payments/webhooks',
      },
      'PAYMENTS_DEFAULT_WEBHOOK_URL must not use localhost in production.',
    ],
    [
      'non-HTTPS document upload URL',
      { DOCUMENT_UPLOAD_BASE_URL: 'http://storage.mobilis.app/upload' },
      'DOCUMENT_UPLOAD_BASE_URL must be HTTPS in production.',
    ],
    [
      'localhost document upload URL',
      { DOCUMENT_UPLOAD_BASE_URL: 'https://localhost:9000/upload' },
      'DOCUMENT_UPLOAD_BASE_URL must not use localhost in production.',
    ],
    [
      'non-HTTPS document view URL',
      { DOCUMENT_VIEW_BASE_URL: 'http://storage.mobilis.app/view' },
      'DOCUMENT_VIEW_BASE_URL must be HTTPS in production.',
    ],
    [
      'localhost document view URL',
      { DOCUMENT_VIEW_BASE_URL: 'https://127.0.0.1:9000/view' },
      'DOCUMENT_VIEW_BASE_URL must not use localhost in production.',
    ],
    [
      'default local rate limit adapter',
      { RATE_LIMIT_ADAPTER: 'in-memory' },
      'RATE_LIMIT_ADAPTER must be postgres in production until another shared store is implemented.',
    ],
    [
      'non-strict rate limit',
      { RATE_LIMIT_STRICT: 'false' },
      'RATE_LIMIT_STRICT must be true in production.',
    ],
    [
      'redis rate limit adapter before implementation',
      { RATE_LIMIT_ADAPTER: 'redis' },
      'RATE_LIMIT_ADAPTER must be postgres in production until another shared store is implemented.',
    ],
    [
      'default local realtime adapter',
      { REALTIME_ADAPTER: 'in-memory' },
      'REALTIME_ADAPTER must be postgres in production until another shared transport is implemented.',
    ],
    [
      'non-strict realtime',
      {
        RATE_LIMIT_ADAPTER: 'postgres',
        RATE_LIMIT_STRICT: 'true',
        REALTIME_ADAPTER: 'postgres',
        REALTIME_STRICT: 'false',
      },
      'REALTIME_STRICT must be true in production.',
    ],
    [
      'redis realtime adapter before implementation',
      {
        RATE_LIMIT_ADAPTER: 'postgres',
        RATE_LIMIT_STRICT: 'true',
        REALTIME_ADAPTER: 'redis',
      },
      'REALTIME_ADAPTER must be postgres in production until another shared transport is implemented.',
    ],
    [
      'missing Flutterwave secret for provider refunds',
      {
        PAYMENTS_PROVIDER: 'flutterwave',
        PAYMENTS_REFUND_MODE: 'provider',
      },
      'FLUTTERWAVE_SECRET_KEY is required for provider refunds in production.',
    ],
  ])('rejects production config with %s', (_label, override, message) => {
    expect(() =>
      validateEnvironment({
        ...productionBase,
        ...productionSharedBackplanes,
        ...override,
      }),
    ).toThrow(message);
  });
});
