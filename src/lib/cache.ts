// Lightweight in-memory cache for read-heavy API routes.
//
// Each entry stores the cached value plus an expiry timestamp (ms since epoch).
// `getCached` returns null on miss or stale entry (and lazily evicts it).
// `setCached` writes a fresh entry with a TTL (default 30s, matching the
// "read-heavy endpoint" budget called out in Task 5).
//
// This is intentionally process-local (no Redis/Memcached). The Next.js dev
// server keeps a single Node process, so a Map is sufficient and keeps the
// latency of repeat reads under 1ms.
//
// All routes that consume this MUST keep `export const dynamic = "force-dynamic"`
// so Next.js still hits the route handler on every request (otherwise the
// data-fetching layer would be short-circuited by the full-route cache).

type CacheEntry<T> = { data: T; expiry: number };

const cache = new Map<string, { data: unknown; expiry: number }>();

/**
 * Read a cached value. Returns null on miss, stale entry, or when the key
 * was never written. Stale entries are deleted lazily to keep the Map small.
 */
export function getCached<T>(key: string): T | null {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expiry) {
    cache.delete(key);
    return null;
  }
  return hit.data as T;
}

/**
 * Write a value to the cache with a TTL in milliseconds (default 30s).
 * Pass `ttlMs: 0` to opt out of caching for a particular call.
 */
export function setCached<T>(key: string, data: T, ttlMs: number = 30_000): void {
  if (ttlMs <= 0) return;
  cache.set(key, { data, expiry: Date.now() + ttlMs });
}

/**
 * Invalidate a single cache key. Call this from mutating endpoints (POST/PUT/
 * PATCH/DELETE) so the next GET refetches fresh data.
 */
export function invalidateCache(key: string): void {
  cache.delete(key);
}

/**
 * Invalidate every key that starts with the given prefix. Useful when a write
 * could affect multiple cached responses (e.g. creating a client invalidates
 * both "clients:list" and "activity-feed:recent").
 */
export function invalidateCachePrefix(prefix: string): void {
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) cache.delete(key);
  }
}

/**
 * Snapshot of cache size + live entries. Used by /api/ai-ops/health for the
 * "clear_cache" self-heal action and for debugging.
 */
export function cacheStats(): { size: number; keys: string[] } {
  const keys = [...cache.keys()];
  // Lazily purge stale entries while we're iterating.
  const now = Date.now();
  for (const key of keys) {
    const entry = cache.get(key);
    if (entry && now > entry.expiry) cache.delete(key);
  }
  return { size: cache.size, keys: [...cache.keys()] };
}

/**
 * Wipe the entire cache. Called by the AI Ops "clear_cache" self-heal action
 * and after major data imports.
 */
export function clearCache(): void {
  cache.clear();
}
