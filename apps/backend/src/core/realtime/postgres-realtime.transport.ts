import type { MessageEvent } from '@nestjs/common';
import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client, Pool, type PoolConfig } from 'pg';
import {
  Observable,
  Subject,
  defer,
  filter,
  finalize,
  interval,
  map,
  merge,
} from 'rxjs';
import {
  canReceiveRealtimeEvent,
  parseRealtimeEvent,
  type RealtimeEvent,
  type RealtimeEventFilter,
  type RealtimeTransport,
} from './realtime.types';

const realtimeChannel = 'orbi_realtime_events';
const maxNotifyPayloadBytes = 7_500;

@Injectable()
export class PostgresRealtimeTransport
  implements RealtimeTransport, OnModuleDestroy
{
  private readonly connectionString: string;
  private readonly events$ = new Subject<RealtimeEvent>();
  private readonly pool: Pool;
  private listenerClient: Client | null = null;
  private listenerPromise: Promise<void> | null = null;
  private activeStreams = 0;
  private publishedEvents = 0;
  private degradeReason: string | null = null;

  constructor(private readonly configService: ConfigService) {
    this.connectionString =
      this.configService.get<string>('database.url') ??
      process.env.DATABASE_URL ??
      'postgresql://postgres:postgres@localhost:5433/orbi?schema=public';
    const poolConfig: PoolConfig = {
      connectionString: this.connectionString,
      max: 4,
      min: 0,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 5_000,
    };

    this.pool = new Pool(poolConfig);
  }

  publish(event: RealtimeEvent) {
    const payload = JSON.stringify(event);
    const payloadSize = Buffer.byteLength(payload, 'utf8');

    if (payloadSize > maxNotifyPayloadBytes) {
      this.markDegraded(
        new Error(
          `payload exceeds ${maxNotifyPayloadBytes} bytes (${payloadSize} bytes)`,
        ),
        'publish',
      );
      return;
    }

    this.publishedEvents += 1;

    void this.pool
      .query('SELECT pg_notify($1, $2)', [realtimeChannel, payload])
      .catch((error) => {
        this.markDegraded(error, 'publish');
      });
  }

  stream(filterOptions: RealtimeEventFilter): Observable<MessageEvent> {
    return defer(() => {
      this.activeStreams += 1;
      void this.ensureListening();

      const eventStream = this.events$.pipe(
        filter((event) => canReceiveRealtimeEvent(event, filterOptions)),
        map((event) => ({
          data: event,
          type: event.type,
        })),
      );
      const heartbeatStream = interval(15_000).pipe(
        map(() => ({
          data: {
            type: 'heartbeat',
            createdAt: new Date().toISOString(),
          },
          type: 'heartbeat',
        })),
      );

      return merge(eventStream, heartbeatStream).pipe(
        finalize(() => {
          this.activeStreams = Math.max(0, this.activeStreams - 1);
        }),
      );
    });
  }

  snapshot() {
    void this.ensureListening();

    return {
      adapter: 'postgres',
      sharedBackplane: true,
      degraded: this.degradeReason !== null,
      degradeReason: this.degradeReason,
      activeStreams: this.activeStreams,
      publishedEvents: this.publishedEvents,
    };
  }

  async onModuleDestroy() {
    await this.listenerClient?.end().catch(() => undefined);
    await this.pool.end();
  }

  private ensureListening() {
    this.listenerPromise ??= this.connectListener().catch((error) => {
      this.markDegraded(error, 'listen');
      this.listenerClient = null;
      this.listenerPromise = null;
    });

    return this.listenerPromise;
  }

  private async connectListener() {
    const client = new Client({
      connectionString: this.connectionString,
    });

    client.on('notification', (message) => {
      if (message.channel !== realtimeChannel || !message.payload) {
        return;
      }

      try {
        const event = parseRealtimeEvent(JSON.parse(message.payload));

        if (!event) {
          throw new Error('invalid realtime event payload');
        }

        this.events$.next(event);
      } catch (error) {
        this.markDegraded(error, 'parse');
      }
    });
    client.on('error', (error) => {
      this.markDegraded(error, 'listen');
      this.listenerClient = null;
      this.listenerPromise = null;
    });

    await client.connect();
    await client.query(`LISTEN ${realtimeChannel}`);
    this.listenerClient = client;
  }

  private markDegraded(error: unknown, operation: string) {
    const message =
      error instanceof Error ? error.message : 'Unknown realtime failure';
    const nextReason = `Postgres realtime ${operation} failed: ${message}`;

    if (this.degradeReason?.split(' | ').includes(nextReason)) {
      return;
    }

    this.degradeReason = this.degradeReason
      ? `${this.degradeReason} | ${nextReason}`
      : nextReason;
  }
}
