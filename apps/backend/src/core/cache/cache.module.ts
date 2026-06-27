/**
 * CacheModule — Module de cache global
 * Expose RedisCacheService à tous les modules via Global.
 */
import { Global, Module } from '@nestjs/common';
import { RedisCacheService } from './redis-cache.service';

@Global()
@Module({
  providers: [RedisCacheService],
  exports: [RedisCacheService],
})
export class CacheModule {}
