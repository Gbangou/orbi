import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InMemoryRateLimitStore } from './in-memory-rate-limit.store';
import type { RateLimitDecision, RateLimitStore } from './rate-limit.types';

@Injectable()
export class ConfigurableRateLimitStore implements RateLimitStore {
  constructor(
    private readonly configService: ConfigService,
    private readonly inMemoryStore: InMemoryRateLimitStore,
  ) {}

  consume(
    key: string,
    limit: number,
    windowMs: number,
  ): RateLimitDecision | Promise<RateLimitDecision> {
    return this.resolveDelegate().consume(key, limit, windowMs);
  }

  snapshot() {
    const configuredAdapter =
      this.configService.get<string>('infrastructure.rateLimit.adapter') ??
      'in-memory';
    const delegateSnapshot = this.resolveDelegate().snapshot();

    if (configuredAdapter === 'redis') {
      return {
        ...delegateSnapshot,
        degraded: true,
        degradeReason:
          'RATE_LIMIT_ADAPTER=redis est configure, mais le store partage Redis n est pas encore branche. Fallback in-memory reserve au dev local.',
      };
    }

    return delegateSnapshot;
  }

  private resolveDelegate() {
    return this.inMemoryStore;
  }
}
