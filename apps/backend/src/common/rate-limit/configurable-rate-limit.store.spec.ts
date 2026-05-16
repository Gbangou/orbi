import { ConfigurableRateLimitStore } from './configurable-rate-limit.store';
import { InMemoryRateLimitStore } from './in-memory-rate-limit.store';

describe('ConfigurableRateLimitStore', () => {
  it('stays healthy when the in-memory adapter is configured intentionally', async () => {
    const configService = {
      get: jest.fn((key: string) => {
        const values: Record<string, string> = {
          'infrastructure.rateLimit.adapter': 'in-memory',
        };

        return values[key];
      }),
    };

    const store = new ConfigurableRateLimitStore(
      configService as never,
      new InMemoryRateLimitStore(),
    );

    await expect(store.snapshot()).resolves.toEqual({
      adapter: 'in-memory',
      sharedBackplane: false,
      degraded: false,
      degradeReason: null,
      trackedKeys: 0,
    });
  });

  it('reports degradation when redis is configured but not yet wired', async () => {
    const configService = {
      get: jest.fn((key: string) => {
        const values: Record<string, string> = {
          'infrastructure.rateLimit.adapter': 'redis',
        };

        return values[key];
      }),
    };

    const store = new ConfigurableRateLimitStore(
      configService as never,
      new InMemoryRateLimitStore(),
    );

    await expect(store.snapshot()).resolves.toEqual(
      expect.objectContaining({
        adapter: 'in-memory',
        sharedBackplane: false,
        degraded: true,
        trackedKeys: 0,
      }),
    );
  });

  it('uses the postgres store as a shared backplane when configured', async () => {
    const configService = {
      get: jest.fn((key: string) => {
        const values: Record<string, string> = {
          'infrastructure.rateLimit.adapter': 'postgres',
        };

        return values[key];
      }),
    };
    const postgresStore = {
      consume: jest.fn(),
      snapshot: jest.fn().mockResolvedValue({
        adapter: 'postgres',
        sharedBackplane: true,
        degraded: false,
        degradeReason: null,
        trackedKeys: 4,
      }),
    };
    const store = new ConfigurableRateLimitStore(
      configService as never,
      new InMemoryRateLimitStore(),
      postgresStore as never,
    );

    await expect(store.snapshot()).resolves.toEqual({
      adapter: 'postgres',
      sharedBackplane: true,
      degraded: false,
      degradeReason: null,
      trackedKeys: 4,
    });
  });

  it('normalizes configured adapter casing and whitespace before resolving postgres', async () => {
    const configService = {
      get: jest.fn((key: string) => {
        const values: Record<string, string> = {
          'infrastructure.rateLimit.adapter': ' PostgreSQL ',
        };

        return values[key];
      }),
    };
    const postgresStore = {
      consume: jest.fn(),
      snapshot: jest.fn().mockResolvedValue({
        adapter: 'postgres',
        sharedBackplane: true,
        degraded: false,
        degradeReason: null,
        trackedKeys: 2,
      }),
    };
    const store = new ConfigurableRateLimitStore(
      configService as never,
      new InMemoryRateLimitStore(),
      postgresStore as never,
    );

    await expect(store.snapshot()).resolves.toEqual({
      adapter: 'postgres',
      sharedBackplane: true,
      degraded: false,
      degradeReason: null,
      trackedKeys: 2,
    });
  });

  it('reports degradation when an unsupported adapter is configured', async () => {
    const configService = {
      get: jest.fn((key: string) => {
        const values: Record<string, string> = {
          'infrastructure.rateLimit.adapter': 'memcached',
        };

        return values[key];
      }),
    };
    const store = new ConfigurableRateLimitStore(
      configService as never,
      new InMemoryRateLimitStore(),
    );

    await expect(store.snapshot()).resolves.toEqual(
      expect.objectContaining({
        adapter: 'in-memory',
        sharedBackplane: false,
        degraded: true,
        trackedKeys: 0,
      }),
    );
    await expect(store.snapshot()).resolves.toEqual(
      expect.objectContaining({
        degradeReason: expect.stringContaining(
          'RATE_LIMIT_ADAPTER=memcached n est pas supporte',
        ),
      }),
    );
  });
});
