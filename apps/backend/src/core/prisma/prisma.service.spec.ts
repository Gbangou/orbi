import { resolvePrismaPoolConfig } from './prisma.service';

describe('PrismaService pool config', () => {
  it('resolves pool integers strictly without partial parsing', () => {
    const config = resolvePrismaPoolConfig({
      DATABASE_URL: 'postgresql://db.example/orbi',
      DATABASE_POOL_MAX: '20abc',
      DATABASE_POOL_MIN: '1e1',
      DATABASE_POOL_IDLE_TIMEOUT_MS: '15000',
      DATABASE_POOL_CONNECTION_TIMEOUT_MS: '5000ms',
    });

    expect(config.connectionString).toBe('postgresql://db.example/orbi');
    expect(config.max).toBe(20);
    expect(config.min).toBe(2);
    expect(config.idleTimeoutMillis).toBe(15000);
    expect(config.connectionTimeoutMillis).toBe(5000);
  });
});
