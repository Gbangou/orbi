/**
 * Lightweight TTL cache — no external dependencies.
 * Suitable for hot read paths (pricing rules, feature flags) that rarely change.
 *
 * Usage:
 *   const cache = new TtlCache<string, PricingRule[]>(60_000); // 60s TTL
 *   const rules = await cache.getOrSet('active', () => prisma.pricingRule.findMany());
 */
export class TtlCache<K, V> {
  private readonly store = new Map<K, { value: V; expiresAt: number }>();

  constructor(private readonly ttlMs: number) {}

  get(key: K): V | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: K, value: V): void {
    this.store.set(key, { value, expiresAt: Date.now() + this.ttlMs });
  }

  async getOrSet(key: K, factory: () => Promise<V>): Promise<V> {
    const cached = this.get(key);
    if (cached !== undefined) return cached;
    const value = await factory();
    this.set(key, value);
    return value;
  }

  invalidate(key: K): void {
    this.store.delete(key);
  }

  invalidateAll(): void {
    this.store.clear();
  }
}
