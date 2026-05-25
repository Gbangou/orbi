import { InMemoryRateLimitStore } from './in-memory-rate-limit.store';

describe('InMemoryRateLimitStore', () => {
  it('allows the first request within the window', () => {
    const store = new InMemoryRateLimitStore();
    const result = store.consume('key-1', 5, 60_000);

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(4);
  });

  it('decrements remaining on each request', () => {
    const store = new InMemoryRateLimitStore();

    store.consume('key-1', 5, 60_000);
    const result = store.consume('key-1', 5, 60_000);

    expect(result.remaining).toBe(3);
  });

  it('blocks once the limit is exceeded', () => {
    const store = new InMemoryRateLimitStore();

    for (let i = 0; i < 5; i++) {
      store.consume('key-1', 5, 60_000);
    }

    const blocked = store.consume('key-1', 5, 60_000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
  });

  it('resets the counter after the window expires', () => {
    const store = new InMemoryRateLimitStore();

    store.consume('key-1', 2, 1);
    store.consume('key-1', 2, 1);

    return new Promise<void>((resolve) => {
      setTimeout(() => {
        const result = store.consume('key-1', 2, 60_000);
        expect(result.allowed).toBe(true);
        expect(result.remaining).toBe(1);
        resolve();
      }, 10);
    });
  });

  it('tracks separate counters per key', () => {
    const store = new InMemoryRateLimitStore();

    for (let i = 0; i < 5; i++) {
      store.consume('key-exhausted', 5, 60_000);
    }

    const blocked = store.consume('key-exhausted', 5, 60_000);
    const fresh = store.consume('key-fresh', 5, 60_000);

    expect(blocked.allowed).toBe(false);
    expect(fresh.allowed).toBe(true);
  });

  it('snapshot reports in-memory adapter without shared backplane', () => {
    const store = new InMemoryRateLimitStore();
    store.consume('key-1', 5, 60_000);
    store.consume('key-2', 5, 60_000);

    const snap = store.snapshot();

    expect(snap.adapter).toBe('in-memory');
    expect(snap.sharedBackplane).toBe(false);
    expect(snap.degraded).toBe(false);
    expect(snap.trackedKeys).toBe(2);
  });

  it('resetAt is a future timestamp', () => {
    const store = new InMemoryRateLimitStore();
    const before = Date.now();
    const result = store.consume('key-1', 5, 60_000);

    expect(result.resetAt).toBeGreaterThan(before);
  });
});
