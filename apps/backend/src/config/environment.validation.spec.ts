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
  };

  it('keeps development defaults available outside production', () => {
    const env = validateEnvironment({
      NODE_ENV: 'development',
      DATABASE_URL: 'postgresql://postgres:postgres@localhost:5433/mobilis',
    });

    expect(env.PAYMENTS_WEBHOOK_SECRET).toBe('mobilis_dev_webhook_secret');
    expect(env.DOCUMENT_SIGNING_SECRET).toBe('mobilis_dev_document_secret');
  });

  it('accepts a production configuration with explicit external secrets and URLs', () => {
    const env = validateEnvironment(productionBase);

    expect(env.NODE_ENV).toBe('production');
    expect(env.PAYMENTS_WEBHOOK_SECRET).toBe('prod_webhook_secret');
  });

  it.each([
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
      { FRONTEND_ALLOWED_ORIGINS: 'https://admin.mobilis.app,http://localhost:3001' },
      'FRONTEND_ALLOWED_ORIGINS must not include localhost in production.',
    ],
    [
      'localhost redirect URL',
      { PAYMENTS_DEFAULT_REDIRECT_URL: 'http://localhost:8081/book' },
      'PAYMENTS_DEFAULT_REDIRECT_URL must not use localhost in production.',
    ],
    [
      'localhost webhook URL',
      { PAYMENTS_DEFAULT_WEBHOOK_URL: 'http://localhost:3000/api/v1/payments/webhooks' },
      'PAYMENTS_DEFAULT_WEBHOOK_URL must not use localhost in production.',
    ],
    [
      'missing rate limit Redis URL',
      { RATE_LIMIT_STRICT: 'true' },
      'RATE_LIMIT_REDIS_URL is required when RATE_LIMIT_STRICT=true.',
    ],
    [
      'missing realtime Redis URL',
      { REALTIME_STRICT: 'true' },
      'REALTIME_REDIS_URL is required when REALTIME_STRICT=true.',
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
        ...override,
      }),
    ).toThrow(message);
  });
});
