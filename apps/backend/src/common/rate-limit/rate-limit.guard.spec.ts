import { HttpException, type ExecutionContext } from '@nestjs/common';
import { RateLimitGuard } from './rate-limit.guard';

describe('RateLimitGuard', () => {
  function createGuard(options: { scope?: 'ip' | 'user' } = {}) {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue({
        limit: 2,
        windowMs: 60_000,
        ...options,
      }),
    };
    const rateLimitService = {
      consume: jest.fn().mockResolvedValue({
        allowed: true,
        remaining: 1,
        resetAt: 123456,
      }),
    };

    return {
      guard: new RateLimitGuard(reflector as never, rateLimitService as never),
      rateLimitService,
    };
  }

  function createExecutionContext(request: Record<string, unknown>) {
    const response = {
      setHeader: jest.fn(),
    };

    return {
      context: {
        getHandler: jest.fn(),
        getClass: jest.fn(),
        switchToHttp: () => ({
          getRequest: () => request,
          getResponse: () => response,
        }),
      } as unknown as ExecutionContext,
      response,
    };
  }

  it('keys unauthenticated rate limits by trusted request ip only', async () => {
    const { guard, rateLimitService } = createGuard();
    const { context } = createExecutionContext({
      method: 'POST',
      originalUrl: '/api/v1/auth/sign-in',
      ip: '10.0.0.10',
      headers: {
        'x-forwarded-for': '203.0.113.50, 10.0.0.1',
      },
    });

    await expect(guard.canActivate(context)).resolves.toBe(true);

    expect(rateLimitService.consume).toHaveBeenCalledWith(
      'POST:/api/v1/auth/sign-in:ip:10.0.0.10',
      2,
      60_000,
    );
  });

  it('keys user scoped rate limits by the authenticated user id', async () => {
    const { guard, rateLimitService } = createGuard({ scope: 'user' });
    const { context } = createExecutionContext({
      method: 'POST',
      url: '/api/v1/payments/checkout-intents',
      ip: '10.0.0.10',
      auth: {
        user: {
          id: 'user-123',
        },
      },
      headers: {},
    });

    await expect(guard.canActivate(context)).resolves.toBe(true);

    expect(rateLimitService.consume).toHaveBeenCalledWith(
      'POST:/api/v1/payments/checkout-intents:user:user-123',
      2,
      60_000,
    );
  });

  it('ignores query strings when building rate-limit route keys', async () => {
    const { guard, rateLimitService } = createGuard();
    const { context } = createExecutionContext({
      method: 'POST',
      originalUrl: '/api/v1/auth/sign-in?attempt=one',
      url: '/api/v1/auth/sign-in?attempt=one',
      ip: '10.0.0.10',
      headers: {},
    });

    await expect(guard.canActivate(context)).resolves.toBe(true);

    expect(rateLimitService.consume).toHaveBeenCalledWith(
      'POST:/api/v1/auth/sign-in:ip:10.0.0.10',
      2,
      60_000,
    );
  });

  it('throws when the configured limit is exceeded', async () => {
    const { guard, rateLimitService } = createGuard();
    rateLimitService.consume.mockResolvedValue({
      allowed: false,
      remaining: 0,
      resetAt: 123456,
    });
    const { context, response } = createExecutionContext({
      method: 'POST',
      url: '/api/v1/voice/location-intent',
      ip: '10.0.0.10',
      headers: {},
    });

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      HttpException,
    );

    expect(response.setHeader).toHaveBeenCalledWith(
      'X-RateLimit-Remaining',
      '0',
    );
  });
});
