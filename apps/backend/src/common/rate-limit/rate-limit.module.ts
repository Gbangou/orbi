import { Global, Module } from '@nestjs/common';
import { ConfigurableRateLimitStore } from './configurable-rate-limit.store';
import { InMemoryRateLimitStore } from './in-memory-rate-limit.store';
import { RateLimitGuard } from './rate-limit.guard';
import { RateLimitService } from './rate-limit.service';
import { RATE_LIMIT_STORE } from './rate-limit.types';

@Global()
@Module({
  providers: [
    InMemoryRateLimitStore,
    ConfigurableRateLimitStore,
    {
      provide: RATE_LIMIT_STORE,
      useExisting: ConfigurableRateLimitStore,
    },
    RateLimitService,
    RateLimitGuard,
  ],
  exports: [RateLimitService, RateLimitGuard],
})
export class RateLimitModule {}
