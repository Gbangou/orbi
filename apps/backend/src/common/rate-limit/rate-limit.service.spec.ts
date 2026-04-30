import { InMemoryRateLimitStore } from './in-memory-rate-limit.store';
import { RateLimitService } from './rate-limit.service';

describe('RateLimitService', () => {
  it('blocks requests that exceed the configured limit inside the window', () => {
    const service = new RateLimitService(new InMemoryRateLimitStore());

    const first = service.consume('key', 2, 60_000);
    const second = service.consume('key', 2, 60_000);
    const third = service.consume('key', 2, 60_000);

    expect(first.allowed).toBe(true);
    expect(second.allowed).toBe(true);
    expect(third.allowed).toBe(false);
    expect(third.remaining).toBe(0);
  });

  it('exposes the infrastructure snapshot of the active store', () => {
    const service = new RateLimitService(new InMemoryRateLimitStore());

    expect(service.snapshot()).toEqual({
      adapter: 'in-memory',
      sharedBackplane: false,
      degraded: false,
      degradeReason: null,
      trackedKeys: 0,
    });
  });
});
