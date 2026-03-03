/**
 * Tutorial 10: Testing Your APIck App
 *
 * This test file IS the tutorial — it demonstrates every testing pattern
 * you need to build a comprehensive test suite for your APIck application.
 *
 * Patterns covered:
 *   1. Basic CRUD testing with server.inject()
 *   2. Draft/publish workflow testing
 *   3. Middleware testing (headers, auth, short-circuit)
 *   4. Error response format validation
 *   5. Pagination and sorting verification
 *   6. Test isolation (each test gets a fresh database)
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestEnv, signJWT, verifyJWT } from '../../test-helpers.js';

const ARTICLE_SCHEMA = {
  kind: 'collectionType' as const,
  info: { singularName: 'article', pluralName: 'articles', displayName: 'Article' },
  options: { draftAndPublish: true },
  attributes: {
    title: { type: 'string', required: true },
    slug: { type: 'uid' },
    views: { type: 'integer', default: 0 },
  },
};

// =========================================================================
// Pattern 1: Basic CRUD
// =========================================================================

describe('Pattern 1: Basic CRUD Testing', () => {
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

  it('create → read → update → delete lifecycle', async () => {
    // CREATE
    const create = await env.server.inject({
      method: 'POST', url: '/api/articles',
      body: { data: { title: 'Test Article', slug: 'test-article' } },
    });
    expect(create.statusCode).toBe(201);
    expect(create.body.data.title).toBe('Test Article');
    const docId = create.body.data.document_id;
    expect(docId).toBeDefined();

    // READ
    const read = await env.server.inject({
      method: 'GET', url: `/api/articles/${docId}`,
      query: { status: 'draft' },
    });
    expect(read.statusCode).toBe(200);
    expect(read.body.data.title).toBe('Test Article');

    // UPDATE
    const update = await env.server.inject({
      method: 'PUT', url: `/api/articles/${docId}`,
      body: { data: { title: 'Updated Article' } },
    });
    expect(update.statusCode).toBe(200);
    expect(update.body.data.title).toBe('Updated Article');

    // DELETE
    const del = await env.server.inject({
      method: 'DELETE', url: `/api/articles/${docId}`,
    });
    expect(del.statusCode).toBe(200);

    // VERIFY GONE
    const gone = await env.server.inject({
      method: 'GET', url: `/api/articles/${docId}`,
      query: { status: 'draft' },
    });
    expect(gone.statusCode).toBe(404);
  });
});

// =========================================================================
// Pattern 2: Draft/Publish Workflow
// =========================================================================

describe('Pattern 2: Draft/Publish Workflow', () => {
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

  it('draft → publish → unpublish lifecycle', async () => {
    // Create draft
    const create = await env.server.inject({
      method: 'POST', url: '/api/articles',
      body: { data: { title: 'Draft First' } },
    });
    const docId = create.body.data.document_id;
    expect(create.body.data.published_at).toBeNull();

    // Not in default listing
    const hidden = await env.server.inject({ method: 'GET', url: '/api/articles' });
    expect(hidden.body.data).toHaveLength(0);

    // Visible with status=draft
    const drafts = await env.server.inject({
      method: 'GET', url: '/api/articles',
      query: { status: 'draft' },
    });
    expect(drafts.body.data).toHaveLength(1);

    // Publish
    const pub = await env.server.inject({
      method: 'POST', url: `/api/articles/${docId}/publish`,
    });
    expect(pub.statusCode).toBe(200);
    expect(pub.body.data.published_at).not.toBeNull();

    // Now visible in default listing
    const visible = await env.server.inject({ method: 'GET', url: '/api/articles' });
    expect(visible.body.data).toHaveLength(1);

    // Unpublish
    const unpub = await env.server.inject({
      method: 'POST', url: `/api/articles/${docId}/unpublish`,
    });
    expect(unpub.statusCode).toBe(200);

    // Hidden again
    const hiddenAgain = await env.server.inject({ method: 'GET', url: '/api/articles' });
    expect(hiddenAgain.body.data).toHaveLength(0);
  });
});

// =========================================================================
// Pattern 3: Middleware Testing
// =========================================================================

describe('Pattern 3: Middleware Testing', () => {
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

  it('test custom headers via middleware', async () => {
    env.server.use(async (ctx, next) => {
      const start = Date.now();
      await next();
      ctx.set('X-Response-Time', `${Date.now() - start}ms`);
    });

    const res = await env.server.inject({ method: 'GET', url: '/api/articles' });
    expect(res.headers['x-response-time']).toMatch(/\d+ms/);
  });

  it('test auth middleware with JWT', async () => {
    const SECRET = 'test-secret';

    env.server.use(async (ctx, next) => {
      if (!ctx.request.url.startsWith('/api/')) {
        await next();
        return;
      }
      const auth = ctx.request.headers['authorization'];
      if (!auth?.startsWith('Bearer ')) {
        ctx.status = 401;
        ctx.body = { data: null, error: { status: 401, name: 'UnauthorizedError', message: 'Missing token' } };
        return;
      }
      try {
        ctx.state.user = verifyJWT(auth.slice(7), SECRET);
        await next();
      } catch {
        ctx.status = 401;
        ctx.body = { data: null, error: { status: 401, name: 'UnauthorizedError', message: 'Invalid token' } };
      }
    });

    // Without token → 401
    const noAuth = await env.server.inject({ method: 'GET', url: '/api/articles' });
    expect(noAuth.statusCode).toBe(401);

    // With valid token → 200
    const token = signJWT({ id: 1 }, SECRET, { expiresIn: 3600 });
    const authed = await env.server.inject({
      method: 'GET', url: '/api/articles',
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(authed.statusCode).toBe(200);
  });

  it('test middleware execution order', async () => {
    const order: number[] = [];

    env.server.use(async (_ctx, next) => { order.push(1); await next(); order.push(4); });
    env.server.use(async (_ctx, next) => { order.push(2); await next(); order.push(3); });

    await env.server.inject({ method: 'GET', url: '/api/articles' });
    expect(order).toEqual([1, 2, 3, 4]);
  });
});

// =========================================================================
// Pattern 4: Error Response Format
// =========================================================================

describe('Pattern 4: Error Response Validation', () => {
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

  it('404 has standard error format', async () => {
    const res = await env.server.inject({ method: 'GET', url: '/api/articles/nonexistent' });

    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({
      data: null,
      error: expect.objectContaining({
        status: 404,
        name: expect.any(String),
        message: expect.any(String),
      }),
    });
  });

  it('400 for missing request body data', async () => {
    const res = await env.server.inject({
      method: 'POST', url: '/api/articles',
      body: { wrong: 'field' },
    });

    expect(res.statusCode).toBe(400);
    expect(res.body.error.name).toBe('ValidationError');
  });

  it('unknown route returns 404', async () => {
    const res = await env.server.inject({ method: 'GET', url: '/api/nonexistent' });

    expect(res.statusCode).toBe(404);
    expect(res.body.data).toBeNull();
    expect(res.body.error).toBeDefined();
  });
});

// =========================================================================
// Pattern 5: Pagination and Sorting
// =========================================================================

describe('Pattern 5: Pagination and Sorting', () => {
  let env: ReturnType<typeof createTestEnv>;

  beforeEach(async () => {
    env = createTestEnv({
      contentTypes: [{ uid: 'api::article.article', schema: ARTICLE_SCHEMA }],
    });

    // Seed with status=published so they appear in default GET
    for (const [title, views] of [['Alpha', 10], ['Beta', 50], ['Gamma', 30], ['Delta', 40], ['Epsilon', 20]] as const) {
      await env.server.inject({
        method: 'POST', url: '/api/articles',
        body: { data: { title, views }, status: 'published' },
      });
    }
  });

  afterEach(() => {
    env.eventHub.destroy();
    env.db.close();
  });

  it('sort ascending', async () => {
    const res = await env.server.inject({
      method: 'GET', url: '/api/articles',
      query: { sort: 'title:asc' },
    });

    const titles = res.body.data.map((d: any) => d.title);
    expect(titles[0]).toBe('Alpha');
    expect(titles[4]).toBe('Gamma');
  });

  it('sort descending', async () => {
    const res = await env.server.inject({
      method: 'GET', url: '/api/articles',
      query: { sort: 'views:desc' },
    });

    const views = res.body.data.map((d: any) => d.views);
    expect(views[0]).toBe(50); // Beta
  });

  it('page-based pagination', async () => {
    const res = await env.server.inject({
      method: 'GET', url: '/api/articles',
      query: { page: '1', pageSize: '2' },
    });

    expect(res.body.data).toHaveLength(2);
    expect(res.body.meta.pagination).toMatchObject({
      page: 1,
      pageSize: 2,
      pageCount: 3,
      total: 5,
    });
  });

  it('offset-based pagination', async () => {
    const res = await env.server.inject({
      method: 'GET', url: '/api/articles',
      query: { start: '2', limit: '2' },
    });

    expect(res.body.data).toHaveLength(2);
    expect(res.body.meta.pagination.total).toBe(5);
  });
});

// =========================================================================
// Pattern 6: Test Isolation
// =========================================================================

describe('Pattern 6: Test Isolation', () => {
  it('each test gets a fresh database — test A', async () => {
    const env = createTestEnv({
      contentTypes: [{ uid: 'api::article.article', schema: ARTICLE_SCHEMA }],
    });

    await env.server.inject({
      method: 'POST', url: '/api/articles',
      body: { data: { title: 'Only In Test A' }, status: 'published' },
    });

    const res = await env.server.inject({ method: 'GET', url: '/api/articles' });
    expect(res.body.data).toHaveLength(1);

    env.eventHub.destroy();
    env.db.close();
  });

  it('each test gets a fresh database — test B', async () => {
    const env = createTestEnv({
      contentTypes: [{ uid: 'api::article.article', schema: ARTICLE_SCHEMA }],
    });

    // This env starts empty — data from test A doesn't leak
    const res = await env.server.inject({
      method: 'GET', url: '/api/articles',
      query: { status: 'draft' },
    });
    expect(res.body.data).toHaveLength(0);

    env.eventHub.destroy();
    env.db.close();
  });
});
