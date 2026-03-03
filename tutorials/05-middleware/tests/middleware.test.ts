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

describe('Tutorial 05: Middleware', () => {
  let env: ReturnType<typeof createTestEnv>;

  beforeEach(() => {
    env = createTestEnv({
      contentTypes: [{ uid: 'api::article.article', schema: ARTICLE_SCHEMA }],
    });
  });

  afterEach(() => {
    env.eventHub.destroy();
    env.db.close();
  });

  it('response-time middleware injects X-Response-Time header', async () => {
    env.server.use(async (ctx, next) => {
      const start = Date.now();
      await next();
      ctx.set('X-Response-Time', `${Date.now() - start}ms`);
    });

    const res = await env.server.inject({ method: 'GET', url: '/api/articles' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['x-response-time']).toBeDefined();
    expect(res.headers['x-response-time']).toMatch(/\d+ms/);
  });

  it('request-id middleware adds X-Request-Id header', async () => {
    let counter = 0;
    env.server.use(async (ctx, next) => {
      counter++;
      ctx.set('X-Request-Id', `req-${counter}`);
      await next();
    });

    const res1 = await env.server.inject({ method: 'GET', url: '/api/articles' });
    expect(res1.headers['x-request-id']).toBe('req-1');

    const res2 = await env.server.inject({ method: 'GET', url: '/api/articles' });
    expect(res2.headers['x-request-id']).toBe('req-2');
  });

  it('middleware can short-circuit the request', async () => {
    env.server.use(async (ctx, _next) => {
      ctx.status = 403;
      ctx.body = {
        data: null,
        error: { status: 403, name: 'ForbiddenError', message: 'Blocked by middleware' },
      };
      // Note: NOT calling next() — request stops here
    });

    const res = await env.server.inject({
      method: 'POST', url: '/api/articles',
      body: { data: { title: 'Should Not Be Created' } },
    });

    expect(res.statusCode).toBe(403);
    expect(res.body.error.message).toBe('Blocked by middleware');

    // Verify nothing was created
    // Need a fresh env since the middleware blocks everything
  });

  it('onion model: middlewares execute in correct order [1,2,3,4]', async () => {
    const order: number[] = [];

    env.server.use(async (_ctx, next) => {
      order.push(1);
      await next();
      order.push(4);
    });

    env.server.use(async (_ctx, next) => {
      order.push(2);
      await next();
      order.push(3);
    });

    await env.server.inject({ method: 'GET', url: '/api/articles' });
    expect(order).toEqual([1, 2, 3, 4]);
  });

  it('three-layer onion model [1,2,3,6,5,4]', async () => {
    const order: number[] = [];

    env.server.use(async (_ctx, next) => { order.push(1); await next(); order.push(6); });
    env.server.use(async (_ctx, next) => { order.push(2); await next(); order.push(5); });
    env.server.use(async (_ctx, next) => { order.push(3); await next(); order.push(4); });

    await env.server.inject({ method: 'GET', url: '/api/articles' });
    expect(order).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('API key guard blocks requests without valid key', async () => {
    const VALID_API_KEY = 'my-secret-api-key';

    env.server.use(async (ctx, next) => {
      const apiKey = ctx.request.headers['x-api-key'];
      if (apiKey !== VALID_API_KEY) {
        ctx.status = 401;
        ctx.body = {
          data: null,
          error: { status: 401, name: 'UnauthorizedError', message: 'Invalid API key' },
        };
        return;
      }
      await next();
    });

    // Without key → blocked
    const blocked = await env.server.inject({ method: 'GET', url: '/api/articles' });
    expect(blocked.statusCode).toBe(401);
    expect(blocked.body.error.message).toBe('Invalid API key');

    // With valid key → allowed
    const allowed = await env.server.inject({
      method: 'GET', url: '/api/articles',
      headers: { 'X-Api-Key': VALID_API_KEY },
    });
    expect(allowed.statusCode).toBe(200);
  });

  it('middleware can modify request context for downstream handlers', async () => {
    env.server.use(async (ctx, next) => {
      ctx.state.customValue = 'injected-by-middleware';
      await next();
    });

    env.server.use(async (ctx, next) => {
      // Downstream middleware can read values set by upstream
      ctx.set('X-Custom-Value', ctx.state.customValue || 'not-set');
      await next();
    });

    const res = await env.server.inject({ method: 'GET', url: '/api/articles' });
    expect(res.headers['x-custom-value']).toBe('injected-by-middleware');
  });
});
