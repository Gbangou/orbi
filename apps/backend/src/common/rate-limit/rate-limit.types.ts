export type RateLimitDecision = {
  allowed: boolean;
  remaining: number;
  resetAt: number;
};

export type RateLimitStore = {
  consume(
    key: string,
    limit: number,
    windowMs: number,
  ): RateLimitDecision | Promise<RateLimitDecision>;
  snapshot(): {
    adapter: string;
    sharedBackplane: boolean;
    degraded: boolean;
    degradeReason: string | null;
    trackedKeys: number;
  };
};

export const RATE_LIMIT_STORE = Symbol('RATE_LIMIT_STORE');
