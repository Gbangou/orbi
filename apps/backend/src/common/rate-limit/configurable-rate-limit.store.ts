import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InMemoryRateLimitStore } from './in-memory-rate-limit.store';
import { PostgresRateLimitStore } from './postgres-rate-limit.store';
import type {
  RateLimitDecision,
  RateLimitSnapshot,
  RateLimitStore,
} from './rate-limit.types';

@Injectable()
export class ConfigurableRateLimitStore implements RateLimitStore {
  private readonly logger = new Logger(ConfigurableRateLimitStore.name);
  private runtimeDegradeReason: string | null = null;
  private fallbackActivated = false;

  constructor(
    private readonly configService: ConfigService,
    private readonly inMemoryStore: InMemoryRateLimitStore,
    @Optional()
    private readonly postgresStore?: PostgresRateLimitStore,
  ) {}

  consume(
    key: string,
    limit: number,
    windowMs: number,
  ): RateLimitDecision | Promise<RateLimitDecision> {
    const delegate = this.resolveDelegate();

    try {
      const result = delegate.consume(key, limit, windowMs);

      if (result instanceof Promise) {
        return result.catch((error) => {
          this.activateFallback('consume', error);

          return this.inMemoryStore.consume(key, limit, windowMs);
        });
      }

      return result;
    } catch (error) {
      this.activateFallback('consume', error);

      return this.inMemoryStore.consume(key, limit, windowMs);
    }
  }

  async snapshot() {
    const configuredAdapter =
      this.configService.get<string>('infrastructure.rateLimit.adapter') ??
      'in-memory';

    try {
      const delegateSnapshot = await this.resolveActiveStore().snapshot();

      return this.decorateSnapshot(delegateSnapshot, configuredAdapter);
    } catch (error) {
      this.activateFallback('snapshot', error);

      return this.decorateSnapshot(
        await this.inMemoryStore.snapshot(),
        configuredAdapter,
      );
    }
  }

  private resolveDelegate() {
    const configuredAdapter =
      this.configService.get<string>('infrastructure.rateLimit.adapter') ??
      'in-memory';

    if (configuredAdapter === 'postgres' || configuredAdapter === 'postgresql') {
      return this.postgresStore ?? this.inMemoryStore;
    }

    return this.inMemoryStore;
  }

  private resolveActiveStore() {
    return this.fallbackActivated ? this.inMemoryStore : this.resolveDelegate();
  }

  private decorateSnapshot(
    snapshot: RateLimitSnapshot,
    configuredAdapter: string,
  ): RateLimitSnapshot {
    const configuredReason =
      configuredAdapter === 'redis'
        ? 'RATE_LIMIT_ADAPTER=redis est configure, mais le store Redis n est pas encore branche. Utiliser RATE_LIMIT_ADAPTER=postgres pour un backplane partage sans nouvelle dependance.'
        : configuredAdapter.startsWith('postgres') && !this.postgresStore
          ? 'RATE_LIMIT_ADAPTER=postgres est configure, mais le store PostgreSQL n est pas disponible.'
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

  private activateFallback(
    operation: 'consume' | 'snapshot',
    error: unknown,
  ) {
    const message =
      error instanceof Error ? error.message : 'Unknown rate-limit failure';
    const degradeReason = `Rate-limit store ${operation} failed: ${message}`;

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
