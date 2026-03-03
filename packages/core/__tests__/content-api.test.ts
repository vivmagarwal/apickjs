import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { registerContentApi } from '../src/content-api/index.js';
import { createCoreService } from '../src/factories/core-service.js';
import { createCoreController } from '../src/factories/core-controller.js';
import { createDocumentServiceManager } from '../src/document-service/index.js';
import { normalizeContentType } from '../src/content-types/index.js';
import { createLogger } from '../src/logging/index.js';
import { createEventHub } from '../src/event-hub/index.js';
import { createRegistry } from '../src/registries/index.js';

const logger = createLogger({ level: 'silent' });

// --- Test setup ---

function setupTestEnvironment() {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(`CREATE TABLE "articles" (
    "id" INTEGER PRIMARY KEY AUTOINCREMENT,
    "document_id" VARCHAR(255) NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "slug" VARCHAR(255),
    "content" TEXT,
    "views" INTEGER DEFAULT 0,
    "created_at" TEXT NOT NULL,
    "updated_at" TEXT NOT NULL,
    "published_at" TEXT,
    "first_published_at" TEXT,
    "locale" VARCHAR(10)
  )`);

  db.exec(`CREATE TABLE "homepages" (
    "id" INTEGER PRIMARY KEY AUTOINCREMENT,
    "document_id" VARCHAR(255) NOT NULL,
    "hero_title" VARCHAR(255),
    "created_at" TEXT NOT NULL,
    "updated_at" TEXT NOT NULL,
    "published_at" TEXT,
    "first_published_at" TEXT,
    "locale" VARCHAR(10)
  )`);

  const now = new Date().toISOString();
  db.prepare(`INSERT INTO "articles" (document_id, title, slug, content, views, created_at, updated_at, published_at, first_published_at, locale) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run('doc-1', 'Hello World', 'hello-world', 'Content 1', 100, now, now, now, now, 'en');
  db.prepare(`INSERT INTO "articles" (document_id, title, slug, content, views, created_at, updated_at, published_at, first_published_at, locale) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run('doc-2', 'Second Post', 'second', 'Content 2', 50, now, now, now, now, 'en');

  const eventHub = createEventHub({ logger });

  const articleSchema = normalizeContentType('api::article.article', {
    kind: 'collectionType',
    collectionName: 'articles',
    info: { singularName: 'article', pluralName: 'articles', displayName: 'Article' },
    attributes: {
      title: { type: 'string', required: true },
      slug: { type: 'uid' },
      content: { type: 'richtext' },
      views: { type: 'integer', default: 0 },
    },
  });

  const homepageSchema = normalizeContentType('api::homepage.homepage', {
    kind: 'singleType',
    collectionName: 'homepages',
    info: { singularName: 'homepage', pluralName: 'homepages', displayName: 'Homepage' },
    attributes: {
      hero_title: { type: 'string' },
    },
  });

  const contentTypes = createRegistry();
  contentTypes.add('api::article.article', articleSchema);
  contentTypes.add('api::homepage.homepage', homepageSchema);

  const documents = createDocumentServiceManager({
    rawDb: db,
    logger,
    eventHub,
    getSchema: (uid) => contentTypes.get(uid) as any,
  });

  // Routes captured by mock server
  const routes: Array<{ method: string; path: string; handler: Function }> = [];

  const apick: any = {
    log: logger,
    contentTypes,
    documents: (uid: string) => documents(uid),
    config: { get: (key: string, def: any) => def },
    service: (_uid: string) => null as any,
    controller: (_uid: string) => null as any,
    server: {
      route: (r: any) => routes.push(r),
    },
  };

  return { db, eventHub, apick, routes, articleSchema, homepageSchema };
}

// --- Helper to create a mock context ---

function createMockContext(overrides: any = {}): any {
  return {
    params: overrides.params || {},
    query: overrides.query || {},
    request: {
      body: overrides.body || null,
      headers: overrides.headers || {},
      method: overrides.method || 'GET',
      url: overrides.url || '/',
    },
    state: {},
    status: 200,
    body: null,
    set: vi.fn(),
    ip: '127.0.0.1',
    ...overrides,
  };
}

// ==========================================================================
// registerContentApi
// ==========================================================================

describe('registerContentApi', () => {
  let env: ReturnType<typeof setupTestEnvironment>;

  beforeEach(() => {
    env = setupTestEnvironment();
  });

  afterEach(() => {
    env.eventHub.destroy();
    env.db.close();
  });

  it('registers 7 routes for collection type (CRUD + publish + unpublish)', () => {
    registerContentApi(env.apick);

    const articleRoutes = env.routes.filter((r) => r.path.includes('article'));
    expect(articleRoutes).toHaveLength(7);
  });

  it('registers 3 routes for single type', () => {
    registerContentApi(env.apick);

    const homepageRoutes = env.routes.filter((r) => r.path.includes('homepage'));
    expect(homepageRoutes).toHaveLength(3);
  });

  it('uses /api prefix by default', () => {
    registerContentApi(env.apick);

    for (const route of env.routes) {
      expect(route.path).toMatch(/^\/api\//);
    }
  });

  it('uses custom prefix from config', () => {
    env.apick.config.get = (key: string, def: any) => {
      if (key === 'api.rest.prefix') return '/v1';
      return def;
    };
    registerContentApi(env.apick);

    for (const route of env.routes) {
      expect(route.path).toMatch(/^\/v1\//);
    }
  });

  it('registers correct HTTP methods for collection routes', () => {
    registerContentApi(env.apick);

    const articleRoutes = env.routes.filter((r) => r.path.includes('article'));
    const methods = articleRoutes.map((r) => r.method);
    expect(methods).toContain('GET');
    expect(methods).toContain('POST');
    expect(methods).toContain('PUT');
    expect(methods).toContain('DELETE');
  });

  it('registers correct HTTP methods for single type routes', () => {
    registerContentApi(env.apick);

    const homepageRoutes = env.routes.filter((r) => r.path.includes('homepage'));
    const methods = homepageRoutes.map((r) => r.method);
    expect(methods).toContain('GET');
    expect(methods).toContain('PUT');
    expect(methods).toContain('DELETE');
    expect(methods).not.toContain('POST');
  });

  it('collection find handler returns data with pagination', async () => {
    registerContentApi(env.apick);

    const findRoute = env.routes.find((r) => r.method === 'GET' && r.path === '/api/articles');
    const ctx = createMockContext({ query: {} });
    await findRoute!.handler(ctx);

    expect(ctx.body).toBeDefined();
    expect(ctx.body.data).toBeDefined();
    expect(ctx.body.meta).toBeDefined();
    expect(ctx.body.meta.pagination).toBeDefined();
    expect(ctx.body.meta.pagination.total).toBe(2);
  });

  it('collection findOne handler returns single entry', async () => {
    registerContentApi(env.apick);

    const findOneRoute = env.routes.find((r) => r.method === 'GET' && r.path === '/api/articles/:id');
    const ctx = createMockContext({ params: { id: 'doc-1' }, query: {} });
    await findOneRoute!.handler(ctx);

    expect(ctx.body).toBeDefined();
    expect(ctx.body.data).toBeDefined();
    expect(ctx.body.data.title).toBe('Hello World');
  });

  it('collection findOne returns 404 for missing entry', async () => {
    registerContentApi(env.apick);

    const findOneRoute = env.routes.find((r) => r.method === 'GET' && r.path === '/api/articles/:id');
    const ctx = createMockContext({ params: { id: 'nonexistent' }, query: {} });
    await findOneRoute!.handler(ctx);

    expect(ctx.status).toBe(404);
    expect(ctx.body.error.name).toBe('NotFoundError');
  });

  it('collection create handler creates entry', async () => {
    registerContentApi(env.apick);

    const createRoute = env.routes.find((r) => r.method === 'POST' && r.path === '/api/articles');
    const ctx = createMockContext({
      body: { data: { title: 'New Article', slug: 'new-article' } },
      method: 'POST',
    });
    // Set request.body too
    ctx.request.body = ctx.body;
    // Override body since we need to use request.body for input
    ctx.body = null;
    ctx.request.body = { data: { title: 'New Article', slug: 'new-article' } };

    await createRoute!.handler(ctx);

    expect(ctx.status).toBe(201);
    expect(ctx.body.data).toBeDefined();
    expect(ctx.body.data.title).toBe('New Article');
  });

  it('collection create returns 400 when data is missing', async () => {
    registerContentApi(env.apick);

    const createRoute = env.routes.find((r) => r.method === 'POST' && r.path === '/api/articles');
    const ctx = createMockContext({ method: 'POST' });
    ctx.request.body = {};
    await createRoute!.handler(ctx);

    expect(ctx.status).toBe(400);
    expect(ctx.body.error.name).toBe('ValidationError');
  });

  it('collection update handler updates entry', async () => {
    registerContentApi(env.apick);

    const updateRoute = env.routes.find((r) => r.method === 'PUT' && r.path === '/api/articles/:id');
    const ctx = createMockContext({
      params: { id: 'doc-1' },
    });
    ctx.request.body = { data: { title: 'Updated Title' } };
    await updateRoute!.handler(ctx);

    expect(ctx.body.data).toBeDefined();
    expect(ctx.body.data.title).toBe('Updated Title');
  });

  it('collection delete handler deletes entry', async () => {
    registerContentApi(env.apick);

    const deleteRoute = env.routes.find((r) => r.method === 'DELETE' && r.path === '/api/articles/:id');
    const ctx = createMockContext({ params: { id: 'doc-1' } });
    await deleteRoute!.handler(ctx);

    expect(ctx.body.data).toBeDefined();
  });

  it('uses controller action when available', async () => {
    const controllerFactory = createCoreController('api::article.article');
    const serviceFactory = createCoreService('api::article.article');
    const service = serviceFactory({ apick: env.apick });
    env.apick.service = () => service;
    const controller = controllerFactory({ apick: env.apick });
    env.apick.controller = () => controller;

    registerContentApi(env.apick);

    const findRoute = env.routes.find((r) => r.method === 'GET' && r.path === '/api/articles');
    const ctx = createMockContext({ query: {} });
    await findRoute!.handler(ctx);

    // Should still produce a valid response
    expect(ctx.body).toBeDefined();
    expect(ctx.body.data).toBeDefined();
  });

  it('handles errors gracefully in route handlers', async () => {
    // Make documents throw
    env.apick.documents = () => ({
      findMany: () => { throw new Error('Database error'); },
      count: () => { throw new Error('Database error'); },
    });

    registerContentApi(env.apick);

    const findRoute = env.routes.find((r) => r.method === 'GET' && r.path === '/api/articles');
    const ctx = createMockContext({ query: {} });
    await findRoute!.handler(ctx);

    expect(ctx.status).toBe(500);
    expect(ctx.body.error.message).toBe('Database error');
  });

  it('skips content types without info', () => {
    env.apick.contentTypes.add('api::broken.broken', { kind: 'collectionType' });
    const routeCountBefore = env.routes.length;
    registerContentApi(env.apick);
    // Should still register routes for article and homepage but skip broken
    expect(env.routes.length).toBe(10); // 7 collection + 3 single
  });
});
