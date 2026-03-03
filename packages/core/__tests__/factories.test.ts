import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { createCoreController } from '../src/factories/core-controller.js';
import { createCoreService } from '../src/factories/core-service.js';
import { createCoreRouter } from '../src/factories/core-router.js';
import { createDocumentServiceManager } from '../src/document-service/index.js';
import { normalizeContentType } from '../src/content-types/index.js';
import { createLogger } from '../src/logging/index.js';
import { createEventHub } from '../src/event-hub/index.js';
import { createRegistry } from '../src/registries/index.js';

const logger = createLogger({ level: 'silent' });

// --- Test setup helpers ---

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
    "password_hash" VARCHAR(255),
    "views" INTEGER DEFAULT 0,
    "created_at" TEXT NOT NULL,
    "updated_at" TEXT NOT NULL,
    "published_at" TEXT,
    "first_published_at" TEXT,
    "locale" VARCHAR(10)
  )`);

  const now = new Date().toISOString();
  db.prepare(`INSERT INTO "articles" (document_id, title, slug, content, views, created_at, updated_at, published_at, first_published_at, locale) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run('doc-1', 'Hello World', 'hello-world', 'Content 1', 100, now, now, now, now, 'en');
  db.prepare(`INSERT INTO "articles" (document_id, title, slug, content, password_hash, views, created_at, updated_at, published_at, first_published_at, locale) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run('doc-2', 'Secret Post', 'secret', 'Content 2', 'hashed_password', 50, now, now, now, now, 'en');

  const eventHub = createEventHub({ logger });
  const schema = normalizeContentType('api::article.article', {
    kind: 'collectionType',
    collectionName: 'articles',
    info: { singularName: 'article', pluralName: 'articles', displayName: 'Article' },
    attributes: {
      title: { type: 'string', required: true },
      slug: { type: 'uid' },
      content: { type: 'richtext' },
      password_hash: { type: 'string', private: true },
      views: { type: 'integer', default: 0 },
    },
  });

  const contentTypes = createRegistry();
  contentTypes.add('api::article.article', schema);

  const documents = createDocumentServiceManager({
    rawDb: db,
    logger,
    eventHub,
    getSchema: (uid) => contentTypes.get(uid) as any,
  });

  // Create a minimal apick-like object
  const apick: any = {
    log: logger,
    contentTypes,
    documents: (uid: string) => documents(uid),
    config: { get: (key: string, def: any) => def },
    service: (_uid: string) => null as any,
    controller: (_uid: string) => null as any,
  };

  return { db, eventHub, apick, schema };
}

// ==========================================================================
// createCoreRouter
// ==========================================================================

describe('createCoreRouter', () => {
  it('generates 5 routes for collection type', () => {
    const router = createCoreRouter('api::article.article');
    expect(router.uid).toBe('api::article.article');
    expect(router.type).toBe('collectionType');
    expect(router.routes).toHaveLength(5);

    const methods = router.routes.map((r) => r.method);
    expect(methods).toContain('GET');
    expect(methods).toContain('POST');
    expect(methods).toContain('PUT');
    expect(methods).toContain('DELETE');
  });

  it('generates correct paths with /api prefix', () => {
    const router = createCoreRouter('api::article.article');
    const paths = router.routes.map((r) => r.path);
    expect(paths).toContain('/api/articles');
    expect(paths).toContain('/api/articles/:id');
  });

  it('generates correct handler strings', () => {
    const router = createCoreRouter('api::article.article');
    const handlers = router.routes.map((r) => r.handler);
    expect(handlers).toContain('api::article.article.find');
    expect(handlers).toContain('api::article.article.findOne');
    expect(handlers).toContain('api::article.article.create');
    expect(handlers).toContain('api::article.article.update');
    expect(handlers).toContain('api::article.article.delete');
  });

  it('generates 3 routes for single type', () => {
    const router = createCoreRouter('api::homepage.homepage', {
      type: 'singleType',
    });
    expect(router.routes).toHaveLength(3);
    expect(router.routes.map((r) => r.method)).not.toContain('POST');
    expect(router.routes[0].path).toBe('/api/homepage');
  });

  it('applies per-action config', () => {
    const router = createCoreRouter('api::article.article', {
      config: {
        find: { auth: false },
        create: { policies: ['global::is-admin'] },
      },
    });

    const findRoute = router.routes.find((r) => r.handler.endsWith('.find'))!;
    expect(findRoute.config.auth).toBe(false);

    const createRoute = router.routes.find((r) => r.handler.endsWith('.create'))!;
    expect(createRoute.config.policies).toEqual(['global::is-admin']);
  });

  it('supports custom prefix', () => {
    const router = createCoreRouter('api::article.article', {
      prefix: '/v1',
    });
    expect(router.routes[0].path).toContain('/v1/');
  });

  it('supports only filter', () => {
    const router = createCoreRouter('api::article.article', {
      only: ['find', 'findOne'],
    });
    expect(router.routes).toHaveLength(2);
  });
});

// ==========================================================================
// createCoreService
// ==========================================================================

describe('createCoreService', () => {
  let env: ReturnType<typeof setupTestEnvironment>;

  beforeEach(() => {
    env = setupTestEnvironment();
  });

  afterEach(() => {
    env.eventHub.destroy();
    env.db.close();
  });

  it('creates a service with default CRUD methods', () => {
    const factory = createCoreService('api::article.article');
    const service = factory({ apick: env.apick });

    expect(service.find).toBeInstanceOf(Function);
    expect(service.findOne).toBeInstanceOf(Function);
    expect(service.create).toBeInstanceOf(Function);
    expect(service.update).toBeInstanceOf(Function);
    expect(service.delete).toBeInstanceOf(Function);
  });

  it('find returns published results by default', async () => {
    const factory = createCoreService('api::article.article');
    const service = factory({ apick: env.apick });
    env.apick.service = () => service;

    const { results } = await service.find();
    expect(results.length).toBeGreaterThan(0);
    for (const r of results) {
      expect(r.published_at).not.toBeNull();
    }
  });

  it('findOne returns a single document', async () => {
    const factory = createCoreService('api::article.article');
    const service = factory({ apick: env.apick });

    const article = await service.findOne('doc-1');
    expect(article).not.toBeNull();
    expect(article.title).toBe('Hello World');
  });

  it('create creates a new document', async () => {
    const factory = createCoreService('api::article.article');
    const service = factory({ apick: env.apick });

    const article = await service.create({
      data: { title: 'New Article', slug: 'new-article' },
    });
    expect(article).not.toBeNull();
    expect(article.title).toBe('New Article');
  });

  it('update updates an existing document', async () => {
    const factory = createCoreService('api::article.article');
    const service = factory({ apick: env.apick });

    const updated = await service.update('doc-1', {
      data: { title: 'Updated Title' },
    });
    expect(updated).not.toBeNull();
    expect(updated.title).toBe('Updated Title');
  });

  it('delete deletes a document', async () => {
    const factory = createCoreService('api::article.article');
    const service = factory({ apick: env.apick });

    const result = await service.delete('doc-1');
    expect(result).not.toBeNull();
    expect(result.document_id).toBe('doc-1');
  });

  it('accepts customizer overrides', async () => {
    const factory = createCoreService('api::article.article', ({ apick }) => ({
      async find(params: any) {
        // Custom: always add views filter
        return Object.getPrototypeOf(this).find.call(this, {
          ...params,
          filters: { ...params?.filters, views: { $gt: 60 } },
        });
      },
      customMethod() {
        return 'custom';
      },
    }));

    const service = factory({ apick: env.apick });
    expect(service.customMethod()).toBe('custom');
  });
});

// ==========================================================================
// createCoreController
// ==========================================================================

describe('createCoreController', () => {
  let env: ReturnType<typeof setupTestEnvironment>;

  beforeEach(() => {
    env = setupTestEnvironment();
    // Wire up the service
    const serviceFactory = createCoreService('api::article.article');
    const service = serviceFactory({ apick: env.apick });
    env.apick.service = () => service;
  });

  afterEach(() => {
    env.eventHub.destroy();
    env.db.close();
  });

  it('creates a controller with default CRUD actions', () => {
    const factory = createCoreController('api::article.article');
    const controller = factory({ apick: env.apick });

    expect(controller.find).toBeInstanceOf(Function);
    expect(controller.findOne).toBeInstanceOf(Function);
    expect(controller.create).toBeInstanceOf(Function);
    expect(controller.update).toBeInstanceOf(Function);
    expect(controller.delete).toBeInstanceOf(Function);
  });

  it('provides utility methods', () => {
    const factory = createCoreController('api::article.article');
    const controller = factory({ apick: env.apick });

    expect(controller.sanitizeQuery).toBeInstanceOf(Function);
    expect(controller.validateQuery).toBeInstanceOf(Function);
    expect(controller.sanitizeInput).toBeInstanceOf(Function);
    expect(controller.sanitizeOutput).toBeInstanceOf(Function);
    expect(controller.transformResponse).toBeInstanceOf(Function);
  });

  it('transformResponse wraps data in envelope', () => {
    const factory = createCoreController('api::article.article');
    const controller = factory({ apick: env.apick });

    const response = controller.transformResponse({ title: 'Test' }, { page: 1 });
    expect(response).toEqual({
      data: { title: 'Test' },
      meta: { page: 1 },
    });
  });

  it('transformResponse defaults meta to empty object', () => {
    const factory = createCoreController('api::article.article');
    const controller = factory({ apick: env.apick });

    const response = controller.transformResponse([]);
    expect(response).toEqual({ data: [], meta: {} });
  });

  it('sanitizeOutput strips private fields', () => {
    const factory = createCoreController('api::article.article');
    const controller = factory({ apick: env.apick });

    const data = { title: 'Test', password_hash: 'secret123' };
    const sanitized = controller.sanitizeOutput(data);
    expect(sanitized.title).toBe('Test');
    expect(sanitized.password_hash).toBeUndefined();
  });

  it('sanitizeOutput strips private fields from arrays', () => {
    const factory = createCoreController('api::article.article');
    const controller = factory({ apick: env.apick });

    const data = [
      { title: 'A', password_hash: 'secret1' },
      { title: 'B', password_hash: 'secret2' },
    ];
    const sanitized = controller.sanitizeOutput(data);
    expect(sanitized[0].title).toBe('A');
    expect(sanitized[0].password_hash).toBeUndefined();
    expect(sanitized[1].password_hash).toBeUndefined();
  });

  it('sanitizeQuery strips dangerous keys', () => {
    const factory = createCoreController('api::article.article');
    const controller = factory({ apick: env.apick });

    const query = { filters: {}, _internal: 'secret', __proto__: {} };
    const sanitized = controller.sanitizeQuery(query);
    expect(sanitized.filters).toEqual({});
    expect(sanitized._internal).toBeUndefined();
  });

  it('accepts customizer overrides', () => {
    const factory = createCoreController('api::article.article', ({ apick }) => ({
      customAction(ctx: any) {
        return { custom: true };
      },
    }));

    const controller = factory({ apick: env.apick });
    expect(controller.customAction({})).toEqual({ custom: true });
    // Base actions still accessible
    expect(controller.find).toBeInstanceOf(Function);
  });
});
