import {
  INestApplication,
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { Pool, type PoolConfig } from 'pg';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    const connectionString =
      process.env.DATABASE_URL ??
      'postgresql://postgres:postgres@localhost:5433/mobilis?schema=public';
    const poolConfig: PoolConfig = {
      connectionString,
      max: Number.parseInt(process.env.DATABASE_POOL_MAX ?? '20', 10),
      min: Number.parseInt(process.env.DATABASE_POOL_MIN ?? '2', 10),
      idleTimeoutMillis: Number.parseInt(
        process.env.DATABASE_POOL_IDLE_TIMEOUT_MS ?? '10000',
        10,
      ),
      connectionTimeoutMillis: Number.parseInt(
        process.env.DATABASE_POOL_CONNECTION_TIMEOUT_MS ?? '5000',
        10,
      ),
    };
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
