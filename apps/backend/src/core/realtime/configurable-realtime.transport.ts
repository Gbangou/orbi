import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { MessageEvent } from '@nestjs/common';
import type { Observable } from 'rxjs';
import { InMemoryRealtimeTransport } from './in-memory-realtime.transport';
import { PostgresRealtimeTransport } from './postgres-realtime.transport';
import type {
  RealtimeEvent,
  RealtimeEventFilter,
  RealtimeTransport,
} from './realtime.types';

@Injectable()
export class ConfigurableRealtimeTransport implements RealtimeTransport {
  private readonly logger = new Logger(ConfigurableRealtimeTransport.name);
  private runtimeDegradeReason: string | null = null;
  private fallbackActivated = false;

  constructor(
    private readonly configService: ConfigService,
    private readonly inMemoryTransport: InMemoryRealtimeTransport,
    @Optional()
    private readonly postgresTransport?: PostgresRealtimeTransport,
  ) {}

  publish(event: RealtimeEvent) {
    const delegate = this.resolveDelegate();

    try {
      delegate.publish(event);
    } catch (error) {
      this.activateFallback('publish', error);

      if (delegate !== this.resolveFallbackTransport()) {
        this.resolveFallbackTransport().publish(event);
      }
    }
  }

  stream(filterOptions: RealtimeEventFilter): Observable<MessageEvent> {
    const delegate = this.resolveDelegate();

    try {
      return delegate.stream(filterOptions);
    } catch (error) {
      this.activateFallback('stream', error);
      const fallback = this.resolveFallbackTransport();

      if (delegate !== fallback) {
        return fallback.stream(filterOptions);
      }

      throw error;
    }
  }

  snapshot() {
    const configuredAdapter = this.getConfiguredAdapter();

    try {
      const delegateSnapshot = this.resolveActiveTransport().snapshot();
      return this.decorateSnapshot(delegateSnapshot, configuredAdapter);
    } catch (error) {
      this.activateFallback('snapshot', error);

      try {
        return this.decorateSnapshot(
          this.resolveFallbackTransport().snapshot(),
          configuredAdapter,
        );
      } catch {
        return this.decorateSnapshot(
          {
            adapter: 'in-memory',
            sharedBackplane: false,
            degraded: true,
            degradeReason: null,
            activeStreams: 0,
            publishedEvents: 0,
          },
          configuredAdapter,
        );
      }
    }
  }

  protected resolveDelegate(): RealtimeTransport {
    const configuredAdapter = this.getConfiguredAdapter();

    if (
      configuredAdapter === 'postgres' ||
      configuredAdapter === 'postgresql'
    ) {
      return this.postgresTransport ?? this.inMemoryTransport;
    }

    return this.inMemoryTransport;
  }

  protected resolveFallbackTransport(): RealtimeTransport {
    return this.inMemoryTransport;
  }

  private resolveActiveTransport(): RealtimeTransport {
    return this.fallbackActivated
      ? this.resolveFallbackTransport()
      : this.resolveDelegate();
  }

  private decorateSnapshot(
    snapshot: ReturnType<RealtimeTransport['snapshot']>,
    configuredAdapter: string,
  ) {
    const configuredReason =
      configuredAdapter === 'redis'
        ? 'REALTIME_ADAPTER=redis est configure, mais le transport Redis n est pas encore branche. Utiliser REALTIME_ADAPTER=postgres pour un backplane partage sans nouvelle dependance.'
        : configuredAdapter.startsWith('postgres') && !this.postgresTransport
          ? 'REALTIME_ADAPTER=postgres est configure, mais le transport PostgreSQL n est pas disponible.'
          : !this.isSupportedAdapter(configuredAdapter)
            ? `REALTIME_ADAPTER=${configuredAdapter} n est pas supporte. Utiliser in-memory ou postgres.`
            : null;

    const degradeReason = this.combineReasons(
      snapshot.degradeReason,
      this.runtimeDegradeReason,
      configuredReason,
    );

    return {
      ...snapshot,
      degraded:
        snapshot.degraded ||
        this.runtimeDegradeReason !== null ||
        configuredReason !== null,
      degradeReason,
    };
  }

  private combineReasons(...reasons: Array<string | null>) {
    const uniqueReasons = reasons.filter(
      (reason, index, collection): reason is string =>
        Boolean(reason) && collection.indexOf(reason) === index,
    );

    return uniqueReasons.length > 0 ? uniqueReasons.join(' | ') : null;
  }

  private getConfiguredAdapter() {
    return (
      this.configService
        .get<string>('infrastructure.realtime.adapter')
        ?.trim()
        .toLowerCase() || 'in-memory'
    );
  }

  private isSupportedAdapter(configuredAdapter: string) {
    return (
      configuredAdapter === 'in-memory' ||
      configuredAdapter === 'redis' ||
      configuredAdapter === 'postgres' ||
      configuredAdapter === 'postgresql'
    );
  }

  private activateFallback(
    operation: 'publish' | 'stream' | 'snapshot',
    error: unknown,
  ) {
    const message =
      error instanceof Error ? error.message : 'Unknown realtime failure';
    const degradeReason = `Realtime transport ${operation} failed: ${message}`;

    if (!(this.runtimeDegradeReason ?? '').includes(degradeReason)) {
      this.logger.error(degradeReason);
    }

    this.runtimeDegradeReason = this.combineReasons(
      this.runtimeDegradeReason,
      degradeReason,
    );
    this.fallbackActivated = true;
  }
}
