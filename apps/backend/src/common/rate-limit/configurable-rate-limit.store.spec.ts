import { ConfigurableRateLimitStore } from './configurable-rate-limit.store';
import { InMemoryRateLimitStore } from './in-memory-rate-limit.store';

describe('ConfigurableRateLimitStore', () => {
  it('stays healthy when the in-memory adapter is configured intentionally', () => {
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

    expect(store.snapshot()).toEqual({
      adapter: 'in-memory',
      sharedBackplane: false,
      degraded: false,
      degradeReason: null,
      trackedKeys: 0,
    });
  });

  it('reports degradation when redis is configured but not yet wired', () => {
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

    expect(store.snapshot()).toEqual(
      expect.objectContaining({
        adapter: 'in-memory',
        sharedBackplane: false,
        degraded: true,
        trackedKeys: 0,
      }),
    );
  });
});
