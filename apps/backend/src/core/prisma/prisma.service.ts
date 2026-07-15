import {
  INestApplication,
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { Pool, type PoolConfig } from 'pg';
import { resolveConfigInteger } from '../../config/configuration';

export function resolvePrismaPoolConfig(env: NodeJS.ProcessEnv): PoolConfig {
  return {
    connectionString:
      env.DATABASE_URL ??
      'postgresql://postgres:postgres@localhost:5433/orbi?schema=public',
    max: resolveConfigInteger(env.DATABASE_POOL_MAX, 20),
    min: resolveConfigInteger(env.DATABASE_POOL_MIN, 2),
    idleTimeoutMillis: resolveConfigInteger(
      env.DATABASE_POOL_IDLE_TIMEOUT_MS,
      10000,
    ),
    connectionTimeoutMillis: resolveConfigInteger(
      env.DATABASE_POOL_CONNECTION_TIMEOUT_MS,
      5000,
    ),
  };
}

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    const poolConfig = resolvePrismaPoolConfig(process.env);
    const pool = new Pool(poolConfig);
    const adapter = new PrismaPg(pool);

    super({
      adapter,
    });
  }

  async onModuleInit() {
    if (
      process.env.NODE_ENV === 'test' ||
      process.env.SKIP_DB_CONNECT === 'true'
    ) {
      return;
    }

    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  enableShutdownHooks(app: INestApplication) {
    app.enableShutdownHooks();
  }
}
