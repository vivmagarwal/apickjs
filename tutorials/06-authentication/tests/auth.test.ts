import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestEnv, signJWT, verifyJWT } from '../../test-helpers.js';

const JWT_SECRET = 'tutorial-jwt-secret';

const ARTICLE_SCHEMA = {
  kind: 'collectionType' as const,
  info: { singularName: 'article', pluralName: 'articles', displayName: 'Article' },
  options: { draftAndPublish: false },
  attributes: {
    title: { type: 'string', required: true },
  },
};

function addAuthMiddleware(server: any) {
  server.use(async (ctx: any, next: any) => {
    // Skip auth for non-API routes
    if (!ctx.request.url.startsWith('/api/')) {
      await next();
      return;
    }

    const authHeader = ctx.request.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      ctx.status = 401;
      ctx.body = {
        data: null,
        error: { status: 401, name: 'UnauthorizedError', message: 'Missing authorization header' },
      };
      return;
    }

    try {
      const token = authHeader.slice(7);
      const payload = verifyJWT(token, JWT_SECRET);
      ctx.state.user = payload;
      ctx.state.isAuthenticated = true;
      await next();
    } catch {
      ctx.status = 401;
      ctx.body = {
        data: null,
        error: { status: 401, name: 'UnauthorizedError', message: 'Invalid or expired token' },
      };
    }
  });
}

describe('Tutorial 06: Authentication with JWT', () => {
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

  it('rejects request without Authorization header', async () => {
    addAuthMiddleware(env.server);

    const res = await env.server.inject({ method: 'GET', url: '/api/articles' });
    expect(res.statusCode).toBe(401);
    expect(res.body.error.name).toBe('UnauthorizedError');
    expect(res.body.error.message).toBe('Missing authorization header');
  });

  it('rejects request with invalid token', async () => {
    addAuthMiddleware(env.server);

    const res = await env.server.inject({
      method: 'GET', url: '/api/articles',
      headers: { Authorization: 'Bearer invalid-token-here' },
    });
    expect(res.statusCode).toBe(401);
    expect(res.body.error.message).toBe('Invalid or expired token');
  });

  it('accepts request with valid JWT', async () => {
    addAuthMiddleware(env.server);

    const token = signJWT({ id: 1, email: 'user@example.com' }, JWT_SECRET, { expiresIn: 3600 });
    const res = await env.server.inject({
      method: 'GET', url: '/api/articles',
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.body.data).toBeDefined();
  });

  it('rejects expired JWT', async () => {
    addAuthMiddleware(env.server);

    const token = signJWT({ id: 1 }, JWT_SECRET, { expiresIn: -1 });
    const res = await env.server.inject({
      method: 'GET', url: '/api/articles',
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(401);
  });

  it('authenticated user can perform full CRUD', async () => {
    addAuthMiddleware(env.server);
    const token = signJWT({ id: 42, role: 'editor' }, JWT_SECRET, { expiresIn: 3600 });
    const headers = { Authorization: `Bearer ${token}` };

    // Create
    const create = await env.server.inject({
      method: 'POST', url: '/api/articles', headers,
      body: { data: { title: 'Protected Article' } },
    });
    expect(create.statusCode).toBe(201);
    const docId = create.body.data.document_id;

    // Read
    const read = await env.server.inject({
      method: 'GET', url: `/api/articles/${docId}`, headers,
    });
    expect(read.statusCode).toBe(200);
    expect(read.body.data.title).toBe('Protected Article');

    // Update
    const update = await env.server.inject({
      method: 'PUT', url: `/api/articles/${docId}`, headers,
      body: { data: { title: 'Updated Protected' } },
    });
    expect(update.statusCode).toBe(200);

    // Delete
    const del = await env.server.inject({
      method: 'DELETE', url: `/api/articles/${docId}`, headers,
    });
    expect(del.statusCode).toBe(200);
  });

  it('health check bypasses auth', async () => {
    addAuthMiddleware(env.server);

    const res = await env.server.inject({ method: 'GET', url: '/_health' });
    expect(res.statusCode).toBe(204);
  });

  it('signJWT and verifyJWT round-trip', () => {
    const payload = { id: 1, email: 'test@example.com', role: 'admin' };
    const token = signJWT(payload, JWT_SECRET, { expiresIn: 3600 });

    expect(typeof token).toBe('string');
    expect(token.split('.')).toHaveLength(3); // JWT has 3 parts

    const decoded = verifyJWT(token, JWT_SECRET) as any;
    expect(decoded.id).toBe(1);
    expect(decoded.email).toBe('test@example.com');
    expect(decoded.role).toBe('admin');
  });
});
