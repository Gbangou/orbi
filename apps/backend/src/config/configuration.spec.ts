import configuration, { resolveConfigInteger } from './configuration';

describe('backend configuration', () => {
  const originalEnv = process.env;

  afterEach(() => {
    process.env = originalEnv;
  });

  it('resolves integer environment values strictly', () => {
    expect(resolveConfigInteger('8080', 3000)).toBe(8080);
    expect(resolveConfigInteger(' 42 ', 1)).toBe(42);
    expect(resolveConfigInteger('3000abc', 3000)).toBe(3000);
    expect(resolveConfigInteger('1e3', 3000)).toBe(3000);
    expect(resolveConfigInteger(undefined, 3000)).toBe(3000);
    expect(resolveConfigInteger(String(Number.MAX_SAFE_INTEGER + 1), 3000)).toBe(
      3000,
    );
  });

  it('does not partially parse dirty runtime environment integers', () => {
    process.env = {
      ...originalEnv,
      PORT: '3001abc',
      HTTP_KEEP_ALIVE_TIMEOUT_MS: '65000ms',
      JOB_QUEUE_WORKER_BATCH_SIZE: '5e1',
      DOCUMENT_LINK_TTL_SECONDS: '900s',
    };

    const config = configuration();

    expect(config.app.port).toBe(3000);
    expect(config.http.keepAliveTimeoutMs).toBe(65000);
    expect(config.operations.jobQueueWorkerBatchSize).toBe(10);
    expect(config.documents.ttlSeconds).toBe(900);
  });
});
