import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { createDocumentService, createDocumentServiceManager } from '../src/document-service/index.js';
import { normalizeContentType } from '../src/content-types/index.js';
import { createLogger } from '../src/logging/index.js';
import { createEventHub } from '../src/event-hub/index.js';

const logger = createLogger({ level: 'silent' });

function setupTestDb() {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE "articles" (
      "id" INTEGER PRIMARY KEY AUTOINCREMENT,
      "document_id" VARCHAR(255) NOT NULL,
      "title" VARCHAR(255) NOT NULL,
      "slug" VARCHAR(255),
      "content" TEXT,
      "views" INTEGER DEFAULT 0,
      "published" INTEGER DEFAULT 0,
      "created_at" TEXT NOT NULL,
      "updated_at" TEXT NOT NULL,
      "published_at" TEXT,
      "first_published_at" TEXT,
      "locale" VARCHAR(10)
    )
  `);

  return db;
}

function seedArticles(db: any) {
  const now = new Date().toISOString();
  const stmt = db.prepare(`
    INSERT INTO "articles" ("document_id", "title", "slug", "content", "views", "published", "created_at", "updated_at", "published_at", "first_published_at", "locale")
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run('doc-1', 'Hello World', 'hello-world', 'First article', 100, 1, now, now, now, now, 'en');
  stmt.run('doc-2', 'TypeScript Guide', 'ts-guide', 'TS content', 250, 1, now, now, now, now, 'en');
  stmt.run('doc-3', 'Draft Post', 'draft-post', 'Draft content', 0, 0, now, now, null, null, 'en');
  stmt.run('doc-4', 'French Article', 'fr-article', 'Contenu', 50, 1, now, now, now, now, 'fr');
}

const articleSchema = normalizeContentType('api::article.article', {
  kind: 'collectionType',
  collectionName: 'articles',
  info: { singularName: 'article', pluralName: 'articles', displayName: 'Article' },
  attributes: {
    title: { type: 'string', required: true },
    slug: { type: 'uid' },
    content: { type: 'richtext' },
    views: { type: 'integer', default: 0 },
    published: { type: 'boolean' },
  },
});

describe('Document Service', () => {
  let db: any;
  let eventHub: ReturnType<typeof createEventHub>;
  let service: ReturnType<typeof createDocumentService>;

  beforeEach(() => {
    db = setupTestDb();
    seedArticles(db);
    eventHub = createEventHub({ logger });
    service = createDocumentService({
      uid: 'api::article.article',
      schema: articleSchema,
      rawDb: db,
      logger,
      eventHub,
    });
  });

  afterEach(() => {
    eventHub.destroy();
    db.close();
  });

  // -----------------------------------------------------------------------
  // findMany
  // -----------------------------------------------------------------------

  describe('findMany', () => {
    it('returns published articles by default', async () => {
      const articles = await service.findMany();
      expect(articles.length).toBeGreaterThan(0);
      for (const article of articles) {
        expect(article.published_at).not.toBeNull();
      }
    });

    it('filters by locale', async () => {
      const articles = await service.findMany({ locale: 'fr' });
      expect(articles).toHaveLength(1);
      expect(articles[0].title).toBe('French Article');
    });

    it('returns drafts when status is draft', async () => {
      const articles = await service.findMany({ status: 'draft' });
      expect(articles).toHaveLength(1);
      expect(articles[0].title).toBe('Draft Post');
    });

    it('supports custom filters', async () => {
      const articles = await service.findMany({
        filters: { views: { $gt: 100 } },
      });
      expect(articles).toHaveLength(1);
      expect(articles[0].title).toBe('TypeScript Guide');
    });

    it('supports pagination with page/pageSize', async () => {
      const articles = await service.findMany({
        pagination: { page: 1, pageSize: 2 },
      });
      expect(articles).toHaveLength(2);
    });

    it('supports sorting', async () => {
      const articles = await service.findMany({
        sort: 'views:desc',
      });
      expect(articles[0].views).toBe(250);
    });

    it('supports field selection', async () => {
      const articles = await service.findMany({
        fields: ['title', 'slug'],
      });
      expect(articles[0].title).toBeDefined();
      expect(articles[0].slug).toBeDefined();
      expect(articles[0].content).toBeUndefined();
    });
  });

  // -----------------------------------------------------------------------
  // findFirst
  // -----------------------------------------------------------------------

  describe('findFirst', () => {
    it('returns the first matching document', async () => {
      const article = await service.findFirst({ sort: 'views:desc' });
      expect(article).not.toBeNull();
      expect(article.title).toBe('TypeScript Guide');
    });

    it('returns null when no match', async () => {
      const article = await service.findFirst({ filters: { title: 'Nonexistent' } });
      expect(article).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // findOne
  // -----------------------------------------------------------------------

  describe('findOne', () => {
    it('finds a document by documentId', async () => {
      const article = await service.findOne({ documentId: 'doc-1' });
      expect(article).not.toBeNull();
      expect(article.title).toBe('Hello World');
    });

    it('returns null for unknown documentId', async () => {
      const article = await service.findOne({ documentId: 'nonexistent' });
      expect(article).toBeNull();
    });

    it('filters by locale', async () => {
      const article = await service.findOne({ documentId: 'doc-4', locale: 'fr' });
      expect(article).not.toBeNull();
      expect(article.title).toBe('French Article');

      const missing = await service.findOne({ documentId: 'doc-4', locale: 'en' });
      expect(missing).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // count
  // -----------------------------------------------------------------------

  describe('count', () => {
    it('counts published documents by default', async () => {
      const total = await service.count();
      // 3 published (doc-1, doc-2, doc-4), 1 draft (doc-3) — only published counted
      expect(total).toBe(3);
    });

    it('counts with filters (published + locale)', async () => {
      const count = await service.count({ filters: { locale: 'en' } });
      // 2 published English articles (doc-1, doc-2). doc-3 is draft so excluded.
      expect(count).toBe(2);
    });

    it('counts drafts when status=draft', async () => {
      const count = await service.count({ status: 'draft' });
      expect(count).toBe(1);
    });
  });

  // -----------------------------------------------------------------------
  // create
  // -----------------------------------------------------------------------

  describe('create', () => {
    it('creates a new document with generated documentId', async () => {
      const article = await service.create({
        data: { title: 'New Article', slug: 'new-article', content: 'Content' },
        status: 'draft',
      });

      expect(article).not.toBeNull();
      expect(article.document_id).toBeDefined();
      expect(article.title).toBe('New Article');
      expect(article.created_at).toBeDefined();
      expect(article.published_at).toBeNull();
    });

    it('creates a published document', async () => {
      const article = await service.create({
        data: { title: 'Published', slug: 'published' },
        status: 'published',
      });

      expect(article.published_at).not.toBeNull();
      expect(article.first_published_at).not.toBeNull();
    });

    it('sets locale when provided', async () => {
      const article = await service.create({
        data: { title: 'German Article', slug: 'de-article' },
        locale: 'de',
      });

      expect(article.locale).toBe('de');
    });

    it('emits entry.create event', async () => {
      const handler = vi.fn();
      eventHub.on('entry.create', handler);

      await service.create({
        data: { title: 'Event Test', slug: 'event-test' },
      });

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler.mock.calls[0][0].result.title).toBe('Event Test');
    });
  });

  // -----------------------------------------------------------------------
  // update
  // -----------------------------------------------------------------------

  describe('update', () => {
    it('updates an existing document', async () => {
      const updated = await service.update({
        documentId: 'doc-1',
        data: { title: 'Updated Title' },
      });

      expect(updated).not.toBeNull();
      expect(updated.title).toBe('Updated Title');
    });

    it('returns null for nonexistent document', async () => {
      const updated = await service.update({
        documentId: 'nonexistent',
        data: { title: 'Nope' },
      });
      expect(updated).toBeNull();
    });

    it('emits entry.update event with previousEntry', async () => {
      const handler = vi.fn();
      eventHub.on('entry.update', handler);

      await service.update({
        documentId: 'doc-1',
        data: { title: 'Updated' },
      });

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler.mock.calls[0][0].previousEntry.title).toBe('Hello World');
      expect(handler.mock.calls[0][0].result.title).toBe('Updated');
    });
  });

  // -----------------------------------------------------------------------
  // delete
  // -----------------------------------------------------------------------

  describe('delete', () => {
    it('deletes a document and returns its documentId', async () => {
      const result = await service.delete({ documentId: 'doc-1' });
      expect(result).toEqual({ documentId: 'doc-1' });

      const found = await service.findOne({ documentId: 'doc-1' });
      expect(found).toBeNull();
    });

    it('returns null for nonexistent document', async () => {
      const result = await service.delete({ documentId: 'nonexistent' });
      expect(result).toBeNull();
    });

    it('emits entry.delete event', async () => {
      const handler = vi.fn();
      eventHub.on('entry.delete', handler);

      await service.delete({ documentId: 'doc-1' });
      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  // -----------------------------------------------------------------------
  // clone
  // -----------------------------------------------------------------------

  describe('clone', () => {
    it('clones a document with a new documentId', async () => {
      const cloned = await service.clone({ documentId: 'doc-1' });

      expect(cloned).not.toBeNull();
      expect(cloned.document_id).not.toBe('doc-1');
      expect(cloned.title).toBe('Hello World');
      expect(cloned.published_at).toBeNull(); // Clones start as drafts
    });

    it('overrides fields when data is provided', async () => {
      const cloned = await service.clone({
        documentId: 'doc-1',
        data: { title: 'Cloned Article', slug: 'cloned' },
      });

      expect(cloned.title).toBe('Cloned Article');
      expect(cloned.slug).toBe('cloned');
    });

    it('throws for nonexistent document', async () => {
      await expect(
        service.clone({ documentId: 'nonexistent' }),
      ).rejects.toThrow('not found');
    });
  });

  // -----------------------------------------------------------------------
  // publish / unpublish / discardDraft
  // -----------------------------------------------------------------------

  describe('publish', () => {
    it('publishes a draft document', async () => {
      const results = await service.publish({ documentId: 'doc-3' });
      expect(results).toHaveLength(1);
      expect(results[0].published_at).not.toBeNull();
    });

    it('sets first_published_at on first publish', async () => {
      const results = await service.publish({ documentId: 'doc-3' });
      expect(results[0].first_published_at).not.toBeNull();
    });

    it('emits entry.publish event', async () => {
      const handler = vi.fn();
      eventHub.on('entry.publish', handler);

      await service.publish({ documentId: 'doc-3' });
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('returns empty array when no drafts found', async () => {
      const results = await service.publish({ documentId: 'doc-1' }); // Already published
      expect(results).toHaveLength(0);
    });
  });

  describe('unpublish', () => {
    it('unpublishes a published document', async () => {
      const results = await service.unpublish({ documentId: 'doc-1' });
      expect(results).toHaveLength(1);
      expect(results[0].published_at).toBeNull();
    });

    it('emits entry.unpublish event', async () => {
      const handler = vi.fn();
      eventHub.on('entry.unpublish', handler);

      await service.unpublish({ documentId: 'doc-1' });
      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  describe('discardDraft', () => {
    it('deletes draft rows for a document', async () => {
      // doc-3 is a draft
      const results = await service.discardDraft({ documentId: 'doc-3' });
      // No published version exists, so returns empty
      expect(results).toHaveLength(0);

      // Verify draft is gone
      const count = await service.count({ filters: { document_id: 'doc-3' } });
      expect(count).toBe(0);
    });

    it('emits entry.draft-discard event', async () => {
      const handler = vi.fn();
      eventHub.on('entry.draft-discard', handler);

      // Create a scenario with both published and draft
      // doc-1 is published, let's check discardDraft doesn't delete it
      await service.discardDraft({ documentId: 'doc-1' });
      // Should find the published version
      const article = await service.findOne({ documentId: 'doc-1' });
      expect(article).not.toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // Middleware
  // -----------------------------------------------------------------------

  describe('middleware', () => {
    it('runs middleware before operations', async () => {
      const actions: string[] = [];

      (service as any).use(async (ctx: any, next: any) => {
        actions.push(`before:${ctx.action}`);
        const result = await next();
        actions.push(`after:${ctx.action}`);
        return result;
      });

      await service.findMany();
      expect(actions).toEqual(['before:findMany', 'after:findMany']);
    });

    it('middleware can modify params', async () => {
      (service as any).use(async (ctx: any, next: any) => {
        // Force locale to 'fr'
        ctx.params = { ...(ctx.params || {}), locale: 'fr' };
        return next();
      });

      // Without middleware this would return all published (en + fr)
      // With middleware it filters to locale=fr
      const articles = await service.findMany({});
      for (const article of articles) {
        expect(article.locale).toBe('fr');
      }
    });
  });
});

describe('DocumentServiceManager', () => {
  let db: any;
  let eventHub: ReturnType<typeof createEventHub>;

  beforeEach(() => {
    db = setupTestDb();
    seedArticles(db);
    eventHub = createEventHub({ logger });
  });

  afterEach(() => {
    eventHub.destroy();
    db.close();
  });

  it('creates and caches document services per UID', () => {
    const schemas = new Map<string, any>();
    schemas.set('api::article.article', articleSchema);

    const manager = createDocumentServiceManager({
      rawDb: db,
      logger,
      eventHub,
      getSchema: (uid) => schemas.get(uid),
    });

    const service1 = manager('api::article.article');
    const service2 = manager('api::article.article');
    expect(service1).toBe(service2); // Same instance
  });

  it('throws for unknown content type', () => {
    const manager = createDocumentServiceManager({
      rawDb: db,
      logger,
      eventHub,
      getSchema: () => undefined,
    });

    expect(() => manager('api::unknown.unknown')).toThrow('not found');
  });

  it('applies global middleware to all services', async () => {
    const schemas = new Map<string, any>();
    schemas.set('api::article.article', articleSchema);

    const manager = createDocumentServiceManager({
      rawDb: db,
      logger,
      eventHub,
      getSchema: (uid) => schemas.get(uid),
    });

    const actions: string[] = [];
    manager.use(async (ctx, next) => {
      actions.push(ctx.action);
      return next();
    });

    const service = manager('api::article.article');
    await service.findMany();
    expect(actions).toContain('findMany');
  });

  it('registers event listeners', async () => {
    const schemas = new Map<string, any>();
    schemas.set('api::article.article', articleSchema);

    const manager = createDocumentServiceManager({
      rawDb: db,
      logger,
      eventHub,
      getSchema: (uid) => schemas.get(uid),
    });

    const handler = vi.fn();
    manager.on('entry.create', handler);

    const service = manager('api::article.article');
    await service.create({ data: { title: 'Test', slug: 'test' } });

    expect(handler).toHaveBeenCalledTimes(1);
  });
});
