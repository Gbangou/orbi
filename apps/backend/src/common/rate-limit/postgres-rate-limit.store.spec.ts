import { PostgresRateLimitStore } from './postgres-rate-limit.store';

const mockPoolQuery = jest.fn();
const mockPoolEnd = jest.fn();

jest.mock('pg', () => ({
  Pool: jest.fn().mockImplementation(() => ({
    query: mockPoolQuery,
    end: mockPoolEnd,
  })),
}));

describe('PostgresRateLimitStore', () => {
  const configService = {
    get: jest.fn((key: string) => {
      const values: Record<string, string> = {
        'database.url': 'postgresql://mobilis:secret@db.internal:5432/mobilis',
      };

      return values[key];
    }),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('consumes counters through the shared PostgreSQL table', async () => {
    mockPoolQuery.mockResolvedValueOnce({
      rows: [{ count: 2, reset_at_ms: '1770000000123.456' }],
    });
    const store = new PostgresRateLimitStore(configService as never);

    await expect(store.consume('ip:203.0.113.10', 5, 60_000)).resolves.toEqual({
      allowed: true,
      remaining: 3,
      resetAt: 1770000000123,
    });
    expect(mockPoolQuery).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO mobilis_rate_limit_counters'),
      ['ip:203.0.113.10', 60_000],
    );
    expect(mockPoolQuery).not.toHaveBeenCalledWith(
      expect.stringContaining('CREATE TABLE'),
    );
  });

  it('denies the request when the shared counter exceeds the limit', async () => {
    mockPoolQuery.mockResolvedValueOnce({
      rows: [{ count: 6, reset_at_ms: '1770000000123' }],
    });
    const store = new PostgresRateLimitStore(configService as never);

    await expect(store.consume('user:user-1', 5, 60_000)).resolves.toEqual({
      allowed: false,
      remaining: 0,
      resetAt: 1770000000123,
    });
  });

  it('reports tracked shared keys from the migrated table', async () => {
    mockPoolQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ tracked_keys: '4' }] });
    const store = new PostgresRateLimitStore(configService as never);

    await expect(store.snapshot()).resolves.toEqual({
      adapter: 'postgres',
      sharedBackplane: true,
      degraded: false,
      degradeReason: null,
      trackedKeys: 4,
    });
    expect(mockPoolQuery).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('DELETE FROM mobilis_rate_limit_counters'),
    );
    expect(mockPoolQuery).toHaveBeenNthCalledWith(
      2,
      'SELECT COUNT(*) AS tracked_keys FROM mobilis_rate_limit_counters',
    );
  });

  it('closes the PostgreSQL pool on module destroy', async () => {
    mockPoolEnd.mockResolvedValueOnce(undefined);
    const store = new PostgresRateLimitStore(configService as never);

    await store.onModuleDestroy();

    expect(mockPoolEnd).toHaveBeenCalledTimes(1);
  });
});
