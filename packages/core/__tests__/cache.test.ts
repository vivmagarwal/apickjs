import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createCache } from '../src/cache/index.js';

describe('Cache', () => {
  it('stores and retrieves values', async () => {
    const cache = createCache();
    await cache.set('key1', { hello: 'world' });

    const result = await cache.get('key1');
    expect(result).toEqual({ hello: 'world' });
  });

  it('returns undefined for missing keys', async () => {
    const cache = createCache();
    expect(await cache.get('missing')).toBeUndefined();
  });

  it('deletes individual keys', async () => {
    const cache = createCache();
    await cache.set('key1', 'value');
    await cache.del('key1');
    expect(await cache.get('key1')).toBeUndefined();
  });

  it('deletes by prefix', async () => {
    const cache = createCache();
    await cache.set('article:1', 'a');
    await cache.set('article:2', 'b');
    await cache.set('user:1', 'c');

    await cache.delByPrefix('article:');

    expect(await cache.get('article:1')).toBeUndefined();
    expect(await cache.get('article:2')).toBeUndefined();
    expect(await cache.get('user:1')).toBe('c');
  });

  it('has() returns true for existing keys', async () => {
    const cache = createCache();
    await cache.set('key', 'value');
    expect(await cache.has('key')).toBe(true);
    expect(await cache.has('missing')).toBe(false);
  });

  it('clear() removes all entries', async () => {
    const cache = createCache();
    await cache.set('a', 1);
    await cache.set('b', 2);
    await cache.clear();

    expect(await cache.has('a')).toBe(false);
    expect(await cache.has('b')).toBe(false);
  });

  it('respects TTL expiration', async () => {
    const cache = createCache({ ttl: 0 }); // 0 seconds = expire immediately
    await cache.set('key', 'value');

    // Wait a tiny bit for Date.now() to advance
    await new Promise((r) => setTimeout(r, 5));

    expect(await cache.get('key')).toBeUndefined();
    expect(await cache.has('key')).toBe(false);
  });

  it('supports per-entry TTL override', async () => {
    const cache = createCache({ ttl: 600 }); // default: long TTL
    await cache.set('quick', 'value', { ttl: 0 }); // override: expire immediately

    await new Promise((r) => setTimeout(r, 5));
    expect(await cache.get('quick')).toBeUndefined();
  });

  it('evicts LRU entries when max is exceeded', async () => {
    const cache = createCache({ max: 3, ttl: 600 });
    await cache.set('a', 1);
    await cache.set('b', 2);
    await cache.set('c', 3);
    await cache.set('d', 4); // should evict 'a'

    expect(await cache.get('a')).toBeUndefined();
    expect(await cache.get('b')).toBe(2);
    expect(await cache.get('c')).toBe(3);
    expect(await cache.get('d')).toBe(4);
  });

  it('accessing a key promotes it (LRU)', async () => {
    const cache = createCache({ max: 3, ttl: 600 });
    await cache.set('a', 1);
    await cache.set('b', 2);
    await cache.set('c', 3);

    // Access 'a' to promote it
    await cache.get('a');

    // Add 'd' — should evict 'b' (oldest unreads) not 'a'
    await cache.set('d', 4);

    expect(await cache.get('a')).toBe(1); // promoted, not evicted
    expect(await cache.get('b')).toBeUndefined(); // evicted
  });
});
