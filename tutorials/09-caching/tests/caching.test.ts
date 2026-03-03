import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestEnv } from '../../test-helpers.js';

const ARTICLE_SCHEMA = {
  kind: 'collectionType' as const,
  info: { singularName: 'article', pluralName: 'articles', displayName: 'Article' },
  options: { draftAndPublish: false },
  attributes: {
    title: { type: 'string', required: true },
  },
};

describe('Tutorial 09: Caching', () => {
  let env: ReturnType<typeof createTestEnv>;

  beforeEach(() => {
    env = createTestEnv({
      contentTypes: [{ uid: 'api::article.article', schema: ARTICLE_SCHEMA }],
    });
  });

  afterEach(async () => {
    env.eventHub.destroy();
    await env.cache.clear();
    env.db.close();
  });

  it('cache.set and cache.get round-trip', async () => {
    await env.cache.set('test-key', { hello: 'world' });
    const value = await env.cache.get('test-key');
    expect(value).toEqual({ hello: 'world' });
  });

  it('cache.has returns true for existing keys', async () => {
    await env.cache.set('exists', 'yes');
    expect(await env.cache.has('exists')).toBe(true);
    expect(await env.cache.has('nope')).toBe(false);
  });

  it('cache.del removes a key', async () => {
    await env.cache.set('to-delete', 'value');
    expect(await env.cache.has('to-delete')).toBe(true);
    await env.cache.del('to-delete');
    expect(await env.cache.has('to-delete')).toBe(false);
  });

  it('cache-aside middleware caches GET responses', async () => {
    let dbHitCount = 0;

    // Cache-aside middleware for GET /api/articles
    env.server.use(async (ctx, next) => {
      if (ctx.request.method === 'GET' && ctx.request.url === '/api/articles') {
        const cacheKey = 'api:articles:list';
        const cached = await env.cache.get(cacheKey);
        if (cached) {
          ctx.status = 200;
          ctx.body = cached;
          ctx.set('X-Cache', 'HIT');
          return;
        }
        await next();
        dbHitCount++;
        if (ctx.status === 200) {
          await env.cache.set(cacheKey, ctx.body);
        }
        ctx.set('X-Cache', 'MISS');
        return;
      }
      await next();
    });

    // Seed an article
    await env.server.inject({
      method: 'POST', url: '/api/articles',
      body: { data: { title: 'Cached Article' } },
    });

    // First request: MISS (hits database)
    const res1 = await env.server.inject({ method: 'GET', url: '/api/articles' });
    expect(res1.statusCode).toBe(200);
    expect(res1.headers['x-cache']).toBe('MISS');
    expect(res1.body.data).toHaveLength(1);
    expect(dbHitCount).toBe(1);

    // Second request: HIT (from cache)
    const res2 = await env.server.inject({ method: 'GET', url: '/api/articles' });
    expect(res2.statusCode).toBe(200);
    expect(res2.headers['x-cache']).toBe('HIT');
    expect(res2.body.data).toHaveLength(1);
    expect(dbHitCount).toBe(1); // No additional DB hit
  });

  it('write operations invalidate the cache', async () => {
    // Cache-aside + invalidation middleware
    env.server.use(async (ctx, next) => {
      if (ctx.request.method === 'GET' && ctx.request.url === '/api/articles') {
        const cacheKey = 'api:articles:list';
        const cached = await env.cache.get(cacheKey);
        if (cached) {
          ctx.status = 200;
          ctx.body = cached;
          ctx.set('X-Cache', 'HIT');
          return;
        }
        await next();
        if (ctx.status === 200) {
          await env.cache.set(cacheKey, ctx.body);
        }
        ctx.set('X-Cache', 'MISS');
        return;
      }

      await next();

      // Invalidate cache on write operations
      if (['POST', 'PUT', 'DELETE'].includes(ctx.request.method) &&
          ctx.request.url.startsWith('/api/articles')) {
        await env.cache.del('api:articles:list');
      }
    });

    // Create article
    await env.server.inject({
      method: 'POST', url: '/api/articles',
      body: { data: { title: 'Article 1' } },
    });

    // First GET → MISS, populates cache
    const res1 = await env.server.inject({ method: 'GET', url: '/api/articles' });
    expect(res1.headers['x-cache']).toBe('MISS');
    expect(res1.body.data).toHaveLength(1);

    // Second GET → HIT
    const res2 = await env.server.inject({ method: 'GET', url: '/api/articles' });
    expect(res2.headers['x-cache']).toBe('HIT');

    // Create another article → invalidates cache
    await env.server.inject({
      method: 'POST', url: '/api/articles',
      body: { data: { title: 'Article 2' } },
    });

    // Third GET → MISS (cache was invalidated), now returns 2 articles
    const res3 = await env.server.inject({ method: 'GET', url: '/api/articles' });
    expect(res3.headers['x-cache']).toBe('MISS');
    expect(res3.body.data).toHaveLength(2);
  });

  it('cache.clear removes all entries', async () => {
    await env.cache.set('key1', 'value1');
    await env.cache.set('key2', 'value2');
    await env.cache.set('key3', 'value3');

    await env.cache.clear();

    expect(await env.cache.has('key1')).toBe(false);
    expect(await env.cache.has('key2')).toBe(false);
    expect(await env.cache.has('key3')).toBe(false);
  });
});
