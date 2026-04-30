import { Inject, Injectable } from '@nestjs/common';
import { RATE_LIMIT_STORE, type RateLimitStore } from './rate-limit.types';

@Injectable()
export class RateLimitService {
  constructor(
    @Inject(RATE_LIMIT_STORE)
    private readonly store: RateLimitStore,
  ) {}

  consume(key: string, limit: number, windowMs: number) {
    return this.store.consume(key, limit, windowMs);
  }

  snapshot() {
    return this.store.snapshot();
  }
}
