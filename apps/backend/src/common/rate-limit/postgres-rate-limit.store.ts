import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool, type PoolConfig } from 'pg';
import type { RateLimitDecision, RateLimitStore } from './rate-limit.types';

@Injectable()
export class PostgresRateLimitStore implements RateLimitStore, OnModuleDestroy {
  private readonly pool: Pool;

  constructor(private readonly configService: ConfigService) {
    const connectionString =
      this.configService.get<string>('database.url') ??
      process.env.DATABASE_URL ??
      'postgresql://postgres:postgres@localhost:5433/orbi?schema=public';
    const poolConfig: PoolConfig = {
      connectionString,
      max: 4,
      min: 0,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 5_000,
    };

    this.pool = new Pool(poolConfig);
  }

  async consume(
    key: string,
    limit: number,
    windowMs: number,
  ): Promise<RateLimitDecision> {
    const result = await this.pool.query<{
      count: number;
      reset_at_ms: string;
    }>(
      `
        INSERT INTO orbi_rate_limit_counters (key, count, reset_at)
        VALUES ($1, 1, NOW() + ($2::integer * INTERVAL '1 millisecond'))
        ON CONFLICT (key) DO UPDATE SET
          count = CASE
            WHEN orbi_rate_limit_counters.reset_at <= NOW() THEN 1
            ELSE orbi_rate_limit_counters.count + 1
          END,
          reset_at = CASE
            WHEN orbi_rate_limit_counters.reset_at <= NOW()
              THEN NOW() + ($2::integer * INTERVAL '1 millisecond')
            ELSE orbi_rate_limit_counters.reset_at
          END
        RETURNING count, EXTRACT(EPOCH FROM reset_at) * 1000 AS reset_at_ms
      `,
      [key, windowMs],
    );
    const entry = result.rows[0];
    const count = Number(entry.count);

    return {
      allowed: count <= limit,
      remaining: Math.max(0, limit - count),
      resetAt: Math.round(Number(entry.reset_at_ms)),
    };
  }

  async snapshot() {
    await this.pool.query(
      `
        DELETE FROM orbi_rate_limit_counters
        WHERE reset_at <= NOW()
      `,
    );
    const result = await this.pool.query<{ tracked_keys: string }>(
      'SELECT COUNT(*) AS tracked_keys FROM orbi_rate_limit_counters',
    );

    return {
      adapter: 'postgres',
      sharedBackplane: true,
      degraded: false,
      degradeReason: null,
      trackedKeys: Number(result.rows[0]?.tracked_keys ?? 0),
    };
  }

  async onModuleDestroy() {
    await this.pool.end();
  }
}
