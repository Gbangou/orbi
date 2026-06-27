/**
 * RedisCacheService — Cache distribué Redis
 *
 * Remplace TtlCache in-memory pour les déploiements multi-instances.
 * Design: Redis optionnel — fallback transparent vers in-memory si Redis
 * n'est pas configuré (dev local sans Docker).
 *
 * Usage:
 *   @Inject(RedisCacheService) private readonly cache: RedisCacheService
 *   const rules = await this.cache.getOrSet('pricing:rules', () => db.query(), 60);
 */
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { TtlCache } from './ttl-cache';

@Injectable()
export class RedisCacheService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisCacheService.name);
  private redis: Redis | null = null;
  /** Fallback in-memory quand Redis n'est pas configuré */
  private readonly memoryFallback = new TtlCache<string, string>(60_000);
  private connected = false;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    const redisUrl = this.config.get<string>('cache.redisUrl');
    if (!redisUrl) {
      this.logger.warn(
        'REDIS_URL not configured — falling back to in-memory cache (single instance only)',
      );
      return;
    }

    this.redis = new Redis(redisUrl, {
      lazyConnect: true,
      maxRetriesPerRequest: 2,
      connectTimeout: 5_000,
      enableOfflineQueue: false,
    });

    this.redis.on('connect', () => {
      this.connected = true;
      this.logger.log('Redis connected');
    });

    this.redis.on('error', (err: Error) => {
      this.connected = false;
      this.logger.warn(`Redis error — falling back to memory: ${err.message}`);
    });

    void this.redis.connect().catch((err: Error) => {
      this.logger.warn(`Redis initial connect failed: ${err.message}`);
    });
  }

  async onModuleDestroy() {
    if (this.redis) {
      await this.redis.quit().catch(() => void 0);
    }
  }

  /**
   * Récupère une valeur ou l'hydrate via factory.
   * TTL en secondes. Supporte JSON automatiquement.
   */
  async getOrSet<T>(key: string, factory: () => Promise<T>, ttlSeconds: number): Promise<T> {
    // Try Redis first
    if (this.redis && this.connected) {
      try {
        const cached = await this.redis.get(key);
        if (cached !== null) {
          return JSON.parse(cached) as T;
        }
        const value = await factory();
        await this.redis.setex(key, ttlSeconds, JSON.stringify(value));
        return value;
      } catch (err) {
        this.logger.debug(`Redis get/set error for ${key}: ${String(err)}`);
      }
    }

    // Fallback to memory cache
    return this.memoryFallback.getOrSet(key, async () => {
      const value = await factory();
      return JSON.stringify(value);
    }).then((json) => JSON.parse(json) as T);
  }

  async invalidate(key: string): Promise<void> {
    this.memoryFallback.invalidate(key);
    if (this.redis && this.connected) {
      await this.redis.del(key).catch(() => void 0);
    }
  }

  async invalidatePattern(pattern: string): Promise<void> {
    this.memoryFallback.invalidateAll();
    if (this.redis && this.connected) {
      try {
        const keys = await this.redis.keys(pattern);
        if (keys.length > 0) {
          await this.redis.del(...keys);
        }
      } catch { /* non-critical */ }
    }
  }

  get isRedisConnected(): boolean {
    return this.connected;
  }
}
