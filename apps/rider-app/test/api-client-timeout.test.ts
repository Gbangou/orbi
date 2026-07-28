import { createOrbiApiClient, updateTripStatusWithApi } from '@orbi/api';

/**
 * OWASP MASVS-NETWORK-1 / NIST SSDF SA.15 — Invariants de timeout des requêtes.
 *
 * L'OrbiApiClient ne doit pas laisser les requêtes en attente indéfiniment.
 * Un timeout configurable basé sur AbortController garantit :
 * 1. Les réponses serveur bloquées sont annulées après requestTimeoutMs.
 * 2. Une requête rapide normale se termine sans annulation.
 * 3. Le signal est transmis à l'appel fetch sous-jacent.
 * 4. AbortError n'est PAS intercepté par withNetworkRetry (pas de boucle infinie au timeout).
 */
describe('OrbiApiClient — timeout des requêtes', () => {
  function buildHangingFetcher() {
    let capturedSignal: AbortSignal | undefined;

    // Simule un vrai fetch : rejette avec AbortError quand le signal se déclenche, ne résout jamais sinon
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

  it('annule la requête après le requestTimeoutMs configuré', async () => {
    const { fetcher } = buildHangingFetcher();

    const client = createOrbiApiClient('http://localhost:3000', {
      requestTimeoutMs: 50,
      fetcher: fetcher as never,
    });

    // Le faux fetcher rejette avec AbortError quand le signal se déclenche après 50 ms
    await expect(client.request('/test')).rejects.toMatchObject({
      name: 'AbortError',
    });

    // Vérifie que le signal transmis au fetcher est bien annulé
    const call = fetcher.mock.calls[0] as [string, RequestInit];
    expect(call[1]?.signal?.aborted).toBe(true);
  });

  it('transmet un AbortSignal à chaque appel fetch', async () => {
    const respondImmediately = jest.fn(
      (_url: string, init?: RequestInit): Promise<Response> => {
        // Vérifie que le signal est fourni avant de résoudre
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

  it('efface le timeout après une réponse réussie (pas de timers en suspens)', async () => {
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

    // Aucun timer en attente ne doit subsister après la fin de la requête
    expect(jest.getTimerCount()).toBe(0);

    jest.useRealTimers();
  });

  it('ne réessaie pas sur AbortError (le timeout ne doit pas déclencher une boucle de retry)', async () => {
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

    // AbortError n'est pas une TypeError / erreur réseau — NE DOIT PAS être réessayé
    expect(callCount).toBe(1);
  });

  it("utilise 30 secondes comme timeout par défaut quand requestTimeoutMs n'est pas spécifié", async () => {
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
    // Le signal ne doit pas être annulé immédiatement (le timeout de 30s n'a pas expiré)
    expect(capturedSignal!.aborted).toBe(false);
  });

  it('réessaie une mutation critique de statut trajet après une erreur réseau courte', async () => {
    const fetchSpy = jest
      .fn()
      .mockRejectedValueOnce(new TypeError('Network request failed'))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          trip: {
            id: 'trip-field-retry',
            rideRequestId: 'request-field-retry',
            status: 'COMPLETED',
            actualFare: 2100,
            currency: 'XOF',
            completedAt: '2026-07-28T11:05:00.000Z',
          },
        }),
      } as Response);

    const client = createOrbiApiClient('https://orbi-field-api.example', {
      fetcher: fetchSpy as never,
    });

    const result = await updateTripStatusWithApi(
      client,
      'trip-field-retry',
      'COMPLETED',
      'Arret demande par le passager',
    );

    expect(result.trip.status).toBe('COMPLETED');
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});
