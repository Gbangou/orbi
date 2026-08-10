import { SetMetadata } from '@nestjs/common';

export const RATE_LIMIT_KEY = 'rate-limit';

export type RateLimitOptions = {
  limit: number;
  windowMs: number;
  scope?: 'ip' | 'user' | 'body' | 'device';
  scopes?: Array<'ip' | 'user' | 'body' | 'device'>;
  bodyField?: string;
};

export const RateLimit = (options: RateLimitOptions) =>
  SetMetadata(RATE_LIMIT_KEY, options);
