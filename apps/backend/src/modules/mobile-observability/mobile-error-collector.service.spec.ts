import { Logger } from '@nestjs/common';
import { MobileErrorCollectorService } from './mobile-error-collector.service';

describe('MobileErrorCollectorService', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  function createService(config: Record<string, unknown>) {
    return new MobileErrorCollectorService({
      get: jest.fn(
        (key: string, fallback?: unknown) => config[key] ?? fallback,
      ),
    } as never);
  }

  function auth() {
    return {
      user: {
        id: 'rider-user-1',
        role: 'RIDER',
      },
    } as never;
  }

  function report() {
    return {
      id: 'moberr-1',
      appRole: 'rider',
      occurredAt: '2026-05-17T10:00:00.000Z',
      fingerprint: 'booking-timeout',
      errorName: 'Error',
      errorMessage: 'Booking timeout',
      classification: {
        code: 'MOB-BOOKING-DISPATCH',
        surface: 'booking',
        severity: 'critical',
        owner: 'ops',
        retryPolicy: 'idempotent-retry-with-visible-status',
        userMessage: 'Reservation interrompue.',
        reportable: true,
      },
      context: {
        screen: 'booking',
      },
    } as const;
  }

  it('keeps local provider reports inside backend audit only', async () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock as never;
    const service = createService({
      'observability.mobileErrorCollector.provider': 'local',
    });

    const result = await service.dispatchReports(auth(), [report()]);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result).toEqual({
      provider: 'local',
      reportCount: 1,
      attempted: false,
      delivered: true,
    });
  });

  it('posts sanitized reports to the configured webhook collector', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 202,
    });
    global.fetch = fetchMock as never;
    const service = createService({
      'observability.mobileErrorCollector.provider': 'webhook',
      'observability.mobileErrorCollector.webhookUrl':
        'https://observability.orbi.app/mobile-errors',
      'observability.mobileErrorCollector.timeoutMs': 1500,
    });

    const result = await service.dispatchReports(auth(), [report()]);

    expect(fetchMock).toHaveBeenCalledWith(
      'https://observability.orbi.app/mobile-errors',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'content-type': 'application/json',
          'x-orbi-source': 'backend-mobile-observability',
        }),
        body: JSON.stringify({
          userId: 'rider-user-1',
          actorRole: 'RIDER',
          reportCount: 1,
          reports: [report()],
        }),
      }),
    );
    expect(result).toEqual({
      provider: 'webhook',
      reportCount: 1,
      attempted: true,
      delivered: true,
      statusCode: 202,
      failureReason: undefined,
    });
  });

  it('returns a degraded result when the webhook collector returns an error', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 503,
    }) as never;
    const service = createService({
      'observability.mobileErrorCollector.provider': 'webhook',
      'observability.mobileErrorCollector.webhookUrl':
        'https://observability.orbi.app/mobile-errors',
      'observability.mobileErrorCollector.timeoutMs': 1500,
    });

    const result = await service.dispatchReports(auth(), [report()]);

    expect(result).toEqual({
      provider: 'webhook',
      reportCount: 1,
      attempted: true,
      delivered: false,
      statusCode: 503,
      failureReason: 'http_503',
    });
  });

  it('does not throw when the webhook collector fails', async () => {
    global.fetch = jest
      .fn()
      .mockRejectedValue(new Error('collector down')) as never;
    const service = createService({
      'observability.mobileErrorCollector.provider': 'webhook',
      'observability.mobileErrorCollector.webhookUrl':
        'https://observability.orbi.app/mobile-errors',
      'observability.mobileErrorCollector.timeoutMs': 1500,
    });

    await expect(service.dispatchReports(auth(), [report()])).resolves.toEqual({
      provider: 'webhook',
      reportCount: 1,
      attempted: true,
      delivered: false,
      failureReason: 'collector down',
    });
  });
});
