import type { CacheService } from '@apick/types';

/** Shape of an entry stored in the LRU map. */
interface CacheEntry {
  value: any;
  expiresAt: number;
}

/**
 * Creates an in-memory LRU cache that implements the CacheService interface.
 *
 * @param config.max  - Maximum number of entries before LRU eviction (default 500).
 * @param config.ttl  - Default time-to-live in seconds for cache entries (default 600).
 *
 * All methods return Promises to satisfy the CacheService interface, but the
 * actual work is performed synchronously since this is an in-memory store.
 */
export function createCache(config?: { max?: number; ttl?: number }): CacheService {
  const max = config?.max ?? 500;
  const defaultTtl = config?.ttl ?? 600;

  // Using a Map preserves insertion order, which we exploit for LRU semantics:
  // - Most-recently-used entries are at the *end* of the iteration order.
  // - When evicting, we remove from the *start* (oldest / least-recently-used).
  const store = new Map<string, CacheEntry>();

  /**
   * Returns true if an entry is still alive (not expired).
   */
  function isAlive(entry: CacheEntry): boolean {
    return entry.expiresAt > Date.now();
  }

  /**
   * Promotes a key to the end of the Map (most-recently-used position).
   * This is the standard "touch" operation for an LRU cache backed by a Map.
   */
  function touch(key: string, entry: CacheEntry): void {
    store.delete(key);
    store.set(key, entry);
  }

  /**
   * Evicts the least-recently-used entry (the first key in iteration order)
   * if the store exceeds the configured maximum size.
   */
  function evictIfNeeded(): void {
    while (store.size > max) {
      // Map.keys().next() gives the oldest (least-recently-used) key.
      const oldest = store.keys().next();
      if (oldest.done) break;
      store.delete(oldest.value);
    }
  }

  // ------------------------------------------------------------------
  // CacheService implementation
  // ------------------------------------------------------------------

  async function get<T = any>(key: string): Promise<T | undefined> {
    const entry = store.get(key);
    if (!entry) return undefined;

    // Expired entries are lazily cleaned up on access.
    if (!isAlive(entry)) {
      store.delete(key);
      return undefined;
    }

    // Promote to most-recently-used.
    touch(key, entry);
    return entry.value as T;
  }

  async function set<T = any>(key: string, value: T, opts?: { ttl?: number }): Promise<void> {
    // If the key already exists, delete it first so the new insertion lands at
    // the end of the Map (most-recently-used position).
    if (store.has(key)) {
      store.delete(key);
    }

    const ttlSeconds = opts?.ttl ?? defaultTtl;
    const entry: CacheEntry = {
      value,
      expiresAt: Date.now() + ttlSeconds * 1000,
    };

    store.set(key, entry);
    evictIfNeeded();
  }

  async function del(key: string): Promise<void> {
    store.delete(key);
  }

  async function delByPrefix(prefix: string): Promise<void> {
    for (const key of [...store.keys()]) {
      if (key.startsWith(prefix)) {
        store.delete(key);
      }
    }
  }

  async function has(key: string): Promise<boolean> {
    const entry = store.get(key);
    if (!entry) return false;

    if (!isAlive(entry)) {
      store.delete(key);
      return false;
    }

    return true;
  }

  async function clear(): Promise<void> {
    store.clear();
  }

  return { get, set, del, delByPrefix, has, clear };
}
