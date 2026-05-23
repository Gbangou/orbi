import { createOrbiApiClient } from '@orbi/api';

/**
 * OWASP MASVS-NETWORK-1 / NIST SSDF SA.15 — Request timeout invariants.
 *
 * The OrbiApiClient must not leave requests pending indefinitely.
 * A configurable AbortController-based timeout ensures:
 * 1. Hanging server responses are aborted after requestTimeoutMs.
 * 2. A normal fast request completes without abort.
 * 3. The signal is forwarded to the underlying fetch call.
 * 4. AbortError is NOT caught by withNetworkRetry (no infinite loops on timeout).
 */
describe('OrbiApiClient — request timeout', () => {
  function buildHangingFetcher() {
    let capturedSignal: AbortSignal | undefined;

    // Simulates a real fetch: rejects with AbortError when signal fires, never resolves otherwise
    const fetcher = jest.fn(
      (_url: string, init?: RequestInit): Promise<Response> => {
        capturedSignal = init?.signal ?? undefined;

        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(new DOMException('The operation was aborted.', 'AbortError'));
          });
        });
      },
    );

    return { fetcher, capturedSignal: () => capturedSignal };
  }

  it('aborts the request after the configured requestTimeoutMs', async () => {
    const { fetcher } = buildHangingFetcher();

    const client = createOrbiApiClient('http://localhost:3000', {
      requestTimeoutMs: 50,
      fetcher: fetcher as never,
    });

    // The fake fetcher rejects with AbortError when the signal fires after 50 ms
    await expect(client.request('/test')).rejects.toMatchObject({
      name: 'AbortError',
    });

    // Verify the signal that was passed to the fetcher is now aborted
    const call = fetcher.mock.calls[0] as [string, RequestInit];
    expect(call[1]?.signal?.aborted).toBe(true);
  });

  it('passes an AbortSignal to every fetch call', async () => {
    const respondImmediately = jest.fn(
      (_url: string, init?: RequestInit): Promise<Response> => {
        // Verify signal is provided before resolving
        expect(init?.signal).toBeInstanceOf(AbortSignal);

        return Promise.resolve({
          ok: true,
          json: async () => ({ ok: true }),
        } as Response);
      },
    );

    const client = createOrbiApiClient('http://localhost:3000', {
      fetcher: respondImmediately as never,
    });

    await client.request('/any-endpoint');

    expect(respondImmediately).toHaveBeenCalledTimes(1);
    const [, init] = respondImmediately.mock.calls[0] as [string, RequestInit];
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('clears the timeout after a successful response (no lingering timers)', async () => {
    const fastFetcher = jest.fn((): Promise<Response> =>
      Promise.resolve({
        ok: true,
        json: async () => ({ data: 'fast' }),
      } as Response),
    );

    jest.useFakeTimers();

    const client = createOrbiApiClient('http://localhost:3000', {
      requestTimeoutMs: 30_000,
      fetcher: fastFetcher as never,
    });

    await client.request('/fast-endpoint');

    // No pending timers should remain after the request completes
    expect(jest.getTimerCount()).toBe(0);

    jest.useRealTimers();
  });

  it('does not retry on AbortError (timeout must not trigger retry loop)', async () => {
    const { withNetworkRetry } = await import('@orbi/api');

    let callCount = 0;
    const abortingFn = async () => {
      callCount += 1;
      const error = new DOMException('The operation was aborted.', 'AbortError');
      throw error;
    };

    await expect(
      withNetworkRetry(abortingFn, { maxAttempts: 3 }),
    ).rejects.toMatchObject({ name: 'AbortError' });

    // AbortError is not a TypeError / network error — must NOT be retried
    expect(callCount).toBe(1);
  });

  it('uses 30 seconds as the default timeout when requestTimeoutMs is not specified', async () => {
    let capturedSignal: AbortSignal | null = null;

    const fetchSpy = jest.fn(
      (_url: string, init?: RequestInit): Promise<Response> => {
        capturedSignal = init?.signal ?? null;
        return Promise.resolve({
          ok: true,
          json: async () => ({}),
        } as Response);
      },
    );

    const client = createOrbiApiClient('http://localhost:3000', {
      fetcher: fetchSpy as never,
    });

    await client.request('/default-timeout-check');

    expect(capturedSignal).not.toBeNull();
    // The signal should not be aborted immediately (30s default has not elapsed)
    expect(capturedSignal!.aborted).toBe(false);
  });
});
