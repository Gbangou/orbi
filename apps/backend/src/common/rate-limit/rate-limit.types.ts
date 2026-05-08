export type RateLimitDecision = {
  allowed: boolean;
  remaining: number;
  resetAt: number;
};

export type RateLimitSnapshot = {
  adapter: string;
  sharedBackplane: boolean;
  degraded: boolean;
  degradeReason: string | null;
  trackedKeys: number;
};

export type RateLimitStore = {
  consume(
    key: string,
    limit: number,
    windowMs: number,
  ): RateLimitDecision | Promise<RateLimitDecision>;
  snapshot(): RateLimitSnapshot | Promise<RateLimitSnapshot>;
};

export const RATE_LIMIT_STORE = Symbol('RATE_LIMIT_STORE');
