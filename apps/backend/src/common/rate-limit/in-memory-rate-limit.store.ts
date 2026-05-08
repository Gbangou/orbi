import { Injectable } from '@nestjs/common';
import type {
  RateLimitDecision,
  RateLimitSnapshot,
  RateLimitStore,
} from './rate-limit.types';

type CounterEntry = {
  count: number;
  resetAt: number;
};

@Injectable()
export class InMemoryRateLimitStore implements RateLimitStore {
  private readonly counters = new Map<string, CounterEntry>();

  consume(key: string, limit: number, windowMs: number): RateLimitDecision {
    const now = Date.now();
    const existing = this.counters.get(key);

    if (!existing || existing.resetAt <= now) {
      const nextEntry = {
        count: 1,
        resetAt: now + windowMs,
      };
      this.counters.set(key, nextEntry);

      return {
        allowed: true,
        remaining: Math.max(0, limit - nextEntry.count),
        resetAt: nextEntry.resetAt,
      };
    }

    existing.count += 1;
    this.counters.set(key, existing);

    return {
      allowed: existing.count <= limit,
      remaining: Math.max(0, limit - existing.count),
      resetAt: existing.resetAt,
    };
  }

  snapshot(): RateLimitSnapshot {
    return {
      adapter: 'in-memory',
      sharedBackplane: false,
      degraded: false,
      degradeReason: null,
      trackedKeys: this.counters.size,
    };
  }
}
