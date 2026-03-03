import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { createContentManagerService } from '../src/services/content-manager.js';
import { createHistoryService } from '../src/history/index.js';
import { createPreviewService } from '../src/preview/index.js';
import { registerContentManagerRoutes } from '../src/routes/index.js';
import type { ContentManagerService } from '../src/services/content-manager.js';
import type { HistoryService } from '../src/history/index.js';
import type { PreviewService } from '../src/preview/index.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ARTICLE_TYPE = {
  uid: 'api::article.article',
  kind: 'collectionType' as const,
  info: {
    singularName: 'article',
    pluralName: 'articles',
    displayName: 'Article',
  },
  options: { draftAndPublish: true },
  attributes: {
    title: { type: 'string', required: true },
    content: { type: 'text' },
    slug: { type: 'uid' },
    views: { type: 'integer' },
    featured: { type: 'boolean' },
    metadata: { type: 'json' },
  },
};

const PAGE_TYPE = {
  uid: 'api::page.page',
  kind: 'collectionType' as const,
  info: {
    singularName: 'page',
    pluralName: 'pages',
    displayName: 'Page',
  },
  options: { draftAndPublish: false },
  attributes: {
    title: { type: 'string' },
    body: { type: 'text' },
  },
};

const HOMEPAGE_TYPE = {
  uid: 'api::homepage.homepage',
  kind: 'singleType' as const,
  info: {
    singularName: 'homepage',
    pluralName: 'homepages',
    displayName: 'Homepage',
  },
  options: { draftAndPublish: true },
  attributes: {
    heading: { type: 'string' },
    heroText: { type: 'text' },
  },
};

function setupTestEnvironment() {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  const cms = createContentManagerService({ rawDb: db });
  const historyService = createHistoryService({ rawDb: db });
  const previewService = createPreviewService({ enabled: false });

  cms.registerContentType(ARTICLE_TYPE);
  cms.registerContentType(PAGE_TYPE);
  cms.registerContentType(HOMEPAGE_TYPE);

  const routes: Array<{ method: string; path: string; handler: Function }> = [];
  const server = { route: (r: any) => routes.push(r) };

  return { db, cms, historyService, previewService, server, routes };
}

// ==========================================================================
// Content Manager Service — Collection Types
// ==========================================================================

describe('ContentManagerService — Collection Types', () => {
  let db: InstanceType<typeof Database>;
  let cms: ContentManagerService;

  beforeEach(() => {
    const env = setupTestEnvironment();
    db = env.db;
    cms = env.cms;
  });

  afterEach(() => db.close());

  it('creates an entry as draft', () => {
    const entry = cms.create('api::article.article', {
      title: 'Hello World',
      content: 'First article',
      slug: 'hello-world',
    });

    expect(entry.id).toBeDefined();
    expect(entry.documentId).toBeDefined();
    expect(entry.status).toBe('draft');
    expect(entry.publishedAt).toBeNull();
    expect(entry.title).toBe('Hello World');
    expect(entry.content).toBe('First article');
    expect(entry.slug).toBe('hello-world');
  });

  it('finds entry by documentId', () => {
    const created = cms.create('api::article.article', { title: 'Lookup Test' });
    const found = cms.findOne('api::article.article', created.documentId);

    expect(found).not.toBeNull();
    expect(found!.title).toBe('Lookup Test');
  });

  it('returns null for non-existent entry', () => {
    expect(cms.findOne('api::article.article', 'non-existent')).toBeNull();
  });

  it('lists entries with pagination', () => {
    for (let i = 0; i < 15; i++) {
      cms.create('api::article.article', { title: `Article ${i}` });
    }

    const page1 = cms.findMany('api::article.article', { page: 1, pageSize: 10 });
    expect(page1.results).toHaveLength(10);
    expect(page1.pagination.total).toBe(15);
    expect(page1.pagination.pageCount).toBe(2);

    const page2 = cms.findMany('api::article.article', { page: 2, pageSize: 10 });
    expect(page2.results).toHaveLength(5);
  });

  it('filters by status', () => {
    const entry = cms.create('api::article.article', { title: 'Draft Only' });
    cms.publish('api::article.article', entry.documentId);

    const drafts = cms.findMany('api::article.article', { status: 'draft' });
    expect(drafts.pagination.total).toBe(1);

    const published = cms.findMany('api::article.article', { status: 'published' });
    expect(published.pagination.total).toBe(1);
  });

  it('updates an entry', () => {
    const entry = cms.create('api::article.article', { title: 'Original' });
    const updated = cms.update('api::article.article', entry.documentId, {
      title: 'Updated Title',
      views: 42,
    });

    expect(updated).not.toBeNull();
    expect(updated!.title).toBe('Updated Title');
    expect(updated!.views).toBe(42);
  });

  it('deletes an entry (both draft and published)', () => {
    const entry = cms.create('api::article.article', { title: 'Delete Me' });
    cms.publish('api::article.article', entry.documentId);

    expect(cms.delete('api::article.article', entry.documentId)).toBe(true);
    expect(cms.findOne('api::article.article', entry.documentId)).toBeNull();
    expect(cms.findOne('api::article.article', entry.documentId, { status: 'published' })).toBeNull();
  });

  it('counts entries', () => {
    expect(cms.count('api::article.article')).toBe(0);
    cms.create('api::article.article', { title: 'A' });
    cms.create('api::article.article', { title: 'B' });
    expect(cms.count('api::article.article', { status: 'draft' })).toBe(2);
  });

  it('handles boolean and JSON fields', () => {
    const entry = cms.create('api::article.article', {
      title: 'Rich Entry',
      featured: true,
      metadata: { tags: ['tech', 'news'], priority: 1 },
    });

    expect(entry.featured).toBe(true);
    expect(entry.metadata).toEqual({ tags: ['tech', 'news'], priority: 1 });

    const found = cms.findOne('api::article.article', entry.documentId);
    expect(found!.featured).toBe(true);
    expect(found!.metadata).toEqual({ tags: ['tech', 'news'], priority: 1 });
  });

  it('sorts entries', () => {
    cms.create('api::article.article', { title: 'Banana' });
    cms.create('api::article.article', { title: 'Apple' });
    cms.create('api::article.article', { title: 'Cherry' });

    const asc = cms.findMany('api::article.article', { sort: 'title:asc' });
    expect(asc.results[0].title).toBe('Apple');
    expect(asc.results[2].title).toBe('Cherry');

    const desc = cms.findMany('api::article.article', { sort: 'title:desc' });
    expect(desc.results[0].title).toBe('Cherry');
  });

  it('handles locale-scoped entries', () => {
    const entry = cms.create('api::article.article', { title: 'English' }, { locale: 'en' });
    cms.create('api::article.article', { title: 'French' }, { locale: 'fr' });

    const enResults = cms.findMany('api::article.article', { locale: 'en' });
    expect(enResults.pagination.total).toBe(1);
    expect(enResults.results[0].title).toBe('English');

    const frResults = cms.findMany('api::article.article', { locale: 'fr' });
    expect(frResults.pagination.total).toBe(1);
    expect(frResults.results[0].title).toBe('French');
  });

  it('tracks createdBy and updatedBy', () => {
    const entry = cms.create('api::article.article', { title: 'By User' }, { createdBy: 5 });
    expect(entry.createdBy).toBe(5);
    expect(entry.updatedBy).toBe(5);

    const updated = cms.update('api::article.article', entry.documentId, { title: 'Updated' }, { updatedBy: 7 });
    expect(updated!.updatedBy).toBe(7);
  });

  it('throws for unregistered content type', () => {
    expect(() => cms.create('api::unknown.unknown', { title: 'test' })).toThrow('not registered');
  });

  it('returns registered content types', () => {
    const types = cms.getAllContentTypes();
    expect(types).toHaveLength(3);
    const uids = types.map(t => t.uid);
    expect(uids).toContain('api::article.article');
    expect(uids).toContain('api::page.page');
    expect(uids).toContain('api::homepage.homepage');
  });

  it('works without draft/publish (pages)', () => {
    const entry = cms.create('api::page.page', { title: 'About Us', body: 'Content' });
    expect(entry.title).toBe('About Us');

    const found = cms.findMany('api::page.page');
    expect(found.pagination.total).toBe(1);
  });
});

// ==========================================================================
// Draft / Publish
// ==========================================================================

describe('ContentManagerService — Draft/Publish', () => {
  let db: InstanceType<typeof Database>;
  let cms: ContentManagerService;

  beforeEach(() => {
    const env = setupTestEnvironment();
    db = env.db;
    cms = env.cms;
  });

  afterEach(() => db.close());

  it('publishes a draft entry', () => {
    const draft = cms.create('api::article.article', { title: 'To Publish' });
    const published = cms.publish('api::article.article', draft.documentId);

    expect(published).not.toBeNull();
    expect(published!.status).toBe('published');
    expect(published!.publishedAt).not.toBeNull();
  });

  it('draft still exists after publish', () => {
    const draft = cms.create('api::article.article', { title: 'Dual State' });
    cms.publish('api::article.article', draft.documentId);

    const foundDraft = cms.findOne('api::article.article', draft.documentId, { status: 'draft' });
    const foundPub = cms.findOne('api::article.article', draft.documentId, { status: 'published' });

    expect(foundDraft).not.toBeNull();
    expect(foundPub).not.toBeNull();
    expect(foundDraft!.title).toBe('Dual State');
    expect(foundPub!.title).toBe('Dual State');
  });

  it('re-publish updates the published row', () => {
    const draft = cms.create('api::article.article', { title: 'V1' });
    cms.publish('api::article.article', draft.documentId);

    cms.update('api::article.article', draft.documentId, { title: 'V2' });
    const repub = cms.publish('api::article.article', draft.documentId);

    expect(repub!.title).toBe('V2');

    // Should still have only one published row
    const published = cms.findMany('api::article.article', { status: 'published' });
    expect(published.pagination.total).toBe(1);
  });

  it('unpublishes an entry', () => {
    const draft = cms.create('api::article.article', { title: 'Unpublish Me' });
    cms.publish('api::article.article', draft.documentId);

    const result = cms.unpublish('api::article.article', draft.documentId);
    expect(result).not.toBeNull();

    const pub = cms.findOne('api::article.article', draft.documentId, { status: 'published' });
    expect(pub).toBeNull();

    // Draft should still exist
    const draftStill = cms.findOne('api::article.article', draft.documentId, { status: 'draft' });
    expect(draftStill).not.toBeNull();
  });

  it('discards draft (resets to published version)', () => {
    const draft = cms.create('api::article.article', { title: 'Original' });
    cms.publish('api::article.article', draft.documentId);

    // Modify draft
    cms.update('api::article.article', draft.documentId, { title: 'Modified Draft' });
    const modified = cms.findOne('api::article.article', draft.documentId, { status: 'draft' });
    expect(modified!.title).toBe('Modified Draft');

    // Discard draft
    const discarded = cms.discardDraft('api::article.article', draft.documentId);
    expect(discarded).not.toBeNull();
    expect(discarded!.title).toBe('Original');
  });

  it('discard draft returns null if no published version', () => {
    const draft = cms.create('api::article.article', { title: 'No Published' });
    expect(cms.discardDraft('api::article.article', draft.documentId)).toBeNull();
  });

  it('publish returns null for non-existent document', () => {
    expect(cms.publish('api::article.article', 'nonexistent')).toBeNull();
  });

  it('unpublish returns null for non-published document', () => {
    const draft = cms.create('api::article.article', { title: 'Never Published' });
    expect(cms.unpublish('api::article.article', draft.documentId)).toBeNull();
  });

  it('returns null for content types without draft/publish', () => {
    const page = cms.create('api::page.page', { title: 'Page' });
    expect(cms.publish('api::page.page', page.documentId)).toBeNull();
    expect(cms.unpublish('api::page.page', page.documentId)).toBeNull();
    expect(cms.discardDraft('api::page.page', page.documentId)).toBeNull();
  });
});

// ==========================================================================
// Single Types
// ==========================================================================

describe('ContentManagerService — Single Types', () => {
  let db: InstanceType<typeof Database>;
  let cms: ContentManagerService;

  beforeEach(() => {
    const env = setupTestEnvironment();
    db = env.db;
    cms = env.cms;
  });

  afterEach(() => db.close());

  it('creates a single type entry', () => {
    const entry = cms.createOrUpdateSingle('api::homepage.homepage', {
      heading: 'Welcome',
      heroText: 'Hello World',
    });

    expect(entry.heading).toBe('Welcome');
    expect(entry.heroText).toBe('Hello World');
    expect(entry.status).toBe('draft');
  });

  it('updates existing single type on second call', () => {
    cms.createOrUpdateSingle('api::homepage.homepage', { heading: 'V1' });
    const updated = cms.createOrUpdateSingle('api::homepage.homepage', { heading: 'V2' });

    expect(updated.heading).toBe('V2');

    // Should still be only one draft
    expect(cms.count('api::homepage.homepage', { status: 'draft' })).toBe(1);
  });

  it('finds single type entry', () => {
    cms.createOrUpdateSingle('api::homepage.homepage', { heading: 'Find Me' });
    const found = cms.findSingle('api::homepage.homepage');

    expect(found).not.toBeNull();
    expect(found!.heading).toBe('Find Me');
  });

  it('returns null for empty single type', () => {
    expect(cms.findSingle('api::homepage.homepage')).toBeNull();
  });

  it('deletes single type', () => {
    cms.createOrUpdateSingle('api::homepage.homepage', { heading: 'Delete' });
    expect(cms.deleteSingle('api::homepage.homepage')).toBe(true);
    expect(cms.findSingle('api::homepage.homepage')).toBeNull();
  });

  it('publishes and unpublishes single type', () => {
    const entry = cms.createOrUpdateSingle('api::homepage.homepage', { heading: 'Pub Test' });
    const published = cms.publish('api::homepage.homepage', entry.documentId);

    expect(published).not.toBeNull();
    expect(published!.status).toBe('published');

    const foundPub = cms.findSingle('api::homepage.homepage', { status: 'published' });
    expect(foundPub).not.toBeNull();

    cms.unpublish('api::homepage.homepage', entry.documentId);
    expect(cms.findSingle('api::homepage.homepage', { status: 'published' })).toBeNull();
  });
});

// ==========================================================================
// Content History Service
// ==========================================================================

describe('HistoryService', () => {
  let db: InstanceType<typeof Database>;
  let historyService: HistoryService;

  beforeEach(() => {
    const env = setupTestEnvironment();
    db = env.db;
    historyService = env.historyService;
  });

  afterEach(() => db.close());

  it('creates a version snapshot', () => {
    const version = historyService.createVersion({
      contentType: 'api::article.article',
      relatedDocumentId: 'doc-123',
      status: 'draft',
      data: { title: 'Hello', content: 'World' },
      schema: { attributes: { title: { type: 'string' }, content: { type: 'text' } } },
      createdBy: 1,
    });

    expect(version.id).toBeDefined();
    expect(version.contentType).toBe('api::article.article');
    expect(version.data.title).toBe('Hello');
  });

  it('lists versions with pagination', () => {
    for (let i = 0; i < 5; i++) {
      historyService.createVersion({
        contentType: 'api::article.article',
        relatedDocumentId: 'doc-123',
        status: 'draft',
        data: { title: `Version ${i}` },
        schema: {},
      });
    }

    const result = historyService.findVersionsPage({
      contentType: 'api::article.article',
      relatedDocumentId: 'doc-123',
      page: 1,
      pageSize: 3,
    });

    expect(result.results).toHaveLength(3);
    expect(result.pagination.total).toBe(5);
    expect(result.pagination.pageCount).toBe(2);
  });

  it('orders versions by newest first', () => {
    historyService.createVersion({
      contentType: 'api::article.article',
      relatedDocumentId: 'doc-1',
      status: 'draft',
      data: { title: 'First' },
      schema: {},
    });
    historyService.createVersion({
      contentType: 'api::article.article',
      relatedDocumentId: 'doc-1',
      status: 'draft',
      data: { title: 'Second' },
      schema: {},
    });

    const result = historyService.findVersionsPage({
      contentType: 'api::article.article',
      relatedDocumentId: 'doc-1',
    });

    expect(result.results[0].data.title).toBe('Second');
    expect(result.results[1].data.title).toBe('First');
  });

  it('finds a single version by ID', () => {
    const created = historyService.createVersion({
      contentType: 'api::article.article',
      relatedDocumentId: 'doc-1',
      status: 'draft',
      data: { title: 'Find Me' },
      schema: {},
    });

    const found = historyService.findOne(created.id!);
    expect(found).not.toBeNull();
    expect(found!.data.title).toBe('Find Me');
  });

  it('returns null for non-existent version', () => {
    expect(historyService.findOne(999)).toBeNull();
  });

  it('restores a version with matching schema', () => {
    const version = historyService.createVersion({
      contentType: 'api::article.article',
      relatedDocumentId: 'doc-1',
      status: 'draft',
      data: { title: 'Old Title', content: 'Old Content' },
      schema: { attributes: { title: { type: 'string' }, content: { type: 'text' } } },
    });

    const result = historyService.restoreVersion(version.id!, {
      attributes: { title: { type: 'string' }, content: { type: 'text' } },
    });

    expect(result).not.toBeNull();
    expect(result!.entry.title).toBe('Old Title');
    expect(result!.unknowns.added).toHaveLength(0);
    expect(result!.unknowns.removed).toHaveLength(0);
  });

  it('detects added fields during restore', () => {
    const version = historyService.createVersion({
      contentType: 'api::article.article',
      relatedDocumentId: 'doc-1',
      status: 'draft',
      data: { title: 'Old' },
      schema: { attributes: { title: { type: 'string' } } },
    });

    const result = historyService.restoreVersion(version.id!, {
      attributes: { title: { type: 'string' }, newField: { type: 'text' } },
    });

    expect(result!.unknowns.added).toContain('newField');
    expect(result!.entry.newField).toBeNull();
  });

  it('detects removed fields during restore', () => {
    const version = historyService.createVersion({
      contentType: 'api::article.article',
      relatedDocumentId: 'doc-1',
      status: 'draft',
      data: { title: 'Old', deletedField: 'value' },
      schema: { attributes: { title: { type: 'string' }, deletedField: { type: 'text' } } },
    });

    const result = historyService.restoreVersion(version.id!, {
      attributes: { title: { type: 'string' } },
    });

    expect(result!.unknowns.removed).toContain('deletedField');
    expect(result!.entry.deletedField).toBeUndefined();
  });

  it('detects changed field types during restore', () => {
    const version = historyService.createVersion({
      contentType: 'api::article.article',
      relatedDocumentId: 'doc-1',
      status: 'draft',
      data: { title: 'Old', count: 'was-string' },
      schema: { attributes: { title: { type: 'string' }, count: { type: 'string' } } },
    });

    const result = historyService.restoreVersion(version.id!, {
      attributes: { title: { type: 'string' }, count: { type: 'integer' } },
    });

    expect(result!.unknowns.changed).toContain('count');
    expect(result!.entry.count).toBeUndefined(); // excluded due to type change
  });

  it('counts versions for a document', () => {
    historyService.createVersion({
      contentType: 'api::article.article',
      relatedDocumentId: 'doc-1',
      status: 'draft',
      data: {},
      schema: {},
    });
    historyService.createVersion({
      contentType: 'api::article.article',
      relatedDocumentId: 'doc-1',
      status: 'draft',
      data: {},
      schema: {},
    });

    expect(historyService.countVersions('api::article.article', 'doc-1')).toBe(2);
    expect(historyService.countVersions('api::article.article', 'doc-other')).toBe(0);
  });

  it('deletes expired versions', () => {
    historyService.createVersion({
      contentType: 'api::article.article',
      relatedDocumentId: 'doc-1',
      status: 'draft',
      data: {},
      schema: {},
    });

    // Delete everything before far future — should delete all
    const deleted = historyService.deleteExpired('2099-01-01T00:00:00.000Z');
    expect(deleted).toBe(1);
  });
});

// ==========================================================================
// Preview Service
// ==========================================================================

describe('PreviewService', () => {
  it('returns null when disabled', async () => {
    const service = createPreviewService({ enabled: false });
    const url = await service.getPreviewUrl({
      contentType: 'api::article.article',
      documentId: 'doc-1',
    });
    expect(url).toBeNull();
  });

  it('calls handler when enabled', async () => {
    const service = createPreviewService({
      enabled: true,
      handler: (uid, ctx) => `https://preview.example.com/${uid}/${ctx.documentId}`,
    });

    const url = await service.getPreviewUrl({
      contentType: 'api::article.article',
      documentId: 'doc-1',
    });
    expect(url).toBe('https://preview.example.com/api::article.article/doc-1');
  });

  it('supports async handler', async () => {
    const service = createPreviewService({
      enabled: true,
      handler: async (_uid, ctx) => {
        return `https://async-preview.example.com/${ctx.documentId}?locale=${ctx.locale || 'en'}`;
      },
    });

    const url = await service.getPreviewUrl({
      contentType: 'api::article.article',
      documentId: 'doc-1',
      locale: 'fr',
    });
    expect(url).toBe('https://async-preview.example.com/doc-1?locale=fr');
  });

  it('returns null when handler returns null', async () => {
    const service = createPreviewService({
      enabled: true,
      handler: () => null,
    });

    const url = await service.getPreviewUrl({
      contentType: 'api::unknown.unknown',
      documentId: 'doc-1',
    });
    expect(url).toBeNull();
  });

  it('can be reconfigured', async () => {
    const service = createPreviewService({ enabled: false });
    expect(service.isEnabled()).toBe(false);

    service.configure({
      enabled: true,
      handler: () => 'https://example.com/preview',
    });

    expect(service.isEnabled()).toBe(true);
    const url = await service.getPreviewUrl({
      contentType: 'api::article.article',
      documentId: 'doc-1',
    });
    expect(url).toBe('https://example.com/preview');
  });
});

// ==========================================================================
// Content Manager Routes
// ==========================================================================

describe('Content Manager Routes', () => {
  let env: ReturnType<typeof setupTestEnvironment>;

  beforeEach(() => {
    env = setupTestEnvironment();
    registerContentManagerRoutes({
      server: env.server,
      contentManagerService: env.cms,
      historyService: env.historyService,
      previewService: env.previewService,
    });
  });

  afterEach(() => env.db.close());

  function findRoute(method: string, path: string) {
    return env.routes.find((r) => r.method === method && r.path === path);
  }

  function mockCtx(overrides: any = {}): any {
    return {
      status: 200,
      body: null,
      params: overrides.params || {},
      query: overrides.query || {},
      request: { body: overrides.body || null },
      state: overrides.state || {},
    };
  }

  it('registers all expected routes', () => {
    expect(findRoute('GET', '/admin/content-manager/content-types')).toBeDefined();
    expect(findRoute('GET', '/admin/content-manager/collection-types/:uid')).toBeDefined();
    expect(findRoute('POST', '/admin/content-manager/collection-types/:uid')).toBeDefined();
    expect(findRoute('PUT', '/admin/content-manager/collection-types/:uid/:documentId')).toBeDefined();
    expect(findRoute('DELETE', '/admin/content-manager/collection-types/:uid/:documentId')).toBeDefined();
    expect(findRoute('POST', '/admin/content-manager/collection-types/:uid/:documentId/actions/publish')).toBeDefined();
    expect(findRoute('POST', '/admin/content-manager/collection-types/:uid/:documentId/actions/unpublish')).toBeDefined();
    expect(findRoute('POST', '/admin/content-manager/collection-types/:uid/:documentId/actions/discard-draft')).toBeDefined();
    expect(findRoute('GET', '/admin/content-manager/single-types/:uid')).toBeDefined();
    expect(findRoute('PUT', '/admin/content-manager/single-types/:uid')).toBeDefined();
    expect(findRoute('DELETE', '/admin/content-manager/single-types/:uid')).toBeDefined();
    expect(findRoute('GET', '/admin/content-manager/history-versions/:contentType/:documentId')).toBeDefined();
    expect(findRoute('POST', '/admin/content-manager/history-versions/:versionId/restore')).toBeDefined();
    expect(findRoute('GET', '/admin/content-manager/preview/url')).toBeDefined();
  });

  it('GET /admin/content-manager/content-types lists types', async () => {
    const route = findRoute('GET', '/admin/content-manager/content-types')!;
    const ctx = mockCtx();
    await route.handler(ctx);

    expect(ctx.body.data).toHaveLength(3);
  });

  it('POST collection-type creates entry', async () => {
    const route = findRoute('POST', '/admin/content-manager/collection-types/:uid')!;
    const ctx = mockCtx({
      params: { uid: 'api::article.article' },
      body: { title: 'Test Article', slug: 'test-article' },
    });
    await route.handler(ctx);

    expect(ctx.status).toBe(201);
    expect(ctx.body.data.title).toBe('Test Article');
    expect(ctx.body.data.documentId).toBeDefined();
  });

  it('GET collection-type lists entries', async () => {
    // Create some entries
    const createRoute = findRoute('POST', '/admin/content-manager/collection-types/:uid')!;
    for (let i = 0; i < 3; i++) {
      await createRoute.handler(mockCtx({
        params: { uid: 'api::article.article' },
        body: { title: `Article ${i}` },
      }));
    }

    const listRoute = findRoute('GET', '/admin/content-manager/collection-types/:uid')!;
    const ctx = mockCtx({ params: { uid: 'api::article.article' } });
    await listRoute.handler(ctx);

    expect(ctx.body.data).toHaveLength(3);
    expect(ctx.body.meta.pagination.total).toBe(3);
  });

  it('PUT collection-type updates entry', async () => {
    const createRoute = findRoute('POST', '/admin/content-manager/collection-types/:uid')!;
    const createCtx = mockCtx({
      params: { uid: 'api::article.article' },
      body: { title: 'Original' },
    });
    await createRoute.handler(createCtx);
    const docId = createCtx.body.data.documentId;

    const updateRoute = findRoute('PUT', '/admin/content-manager/collection-types/:uid/:documentId')!;
    const ctx = mockCtx({
      params: { uid: 'api::article.article', documentId: docId },
      body: { title: 'Updated' },
    });
    await updateRoute.handler(ctx);

    expect(ctx.status).toBe(200);
    expect(ctx.body.data.title).toBe('Updated');
  });

  it('DELETE collection-type deletes entry', async () => {
    const createRoute = findRoute('POST', '/admin/content-manager/collection-types/:uid')!;
    const createCtx = mockCtx({
      params: { uid: 'api::article.article' },
      body: { title: 'Delete Me' },
    });
    await createRoute.handler(createCtx);
    const docId = createCtx.body.data.documentId;

    const deleteRoute = findRoute('DELETE', '/admin/content-manager/collection-types/:uid/:documentId')!;
    const ctx = mockCtx({ params: { uid: 'api::article.article', documentId: docId } });
    await deleteRoute.handler(ctx);

    expect(ctx.status).toBe(200);
  });

  it('publish/unpublish actions work', async () => {
    const createRoute = findRoute('POST', '/admin/content-manager/collection-types/:uid')!;
    const createCtx = mockCtx({
      params: { uid: 'api::article.article' },
      body: { title: 'Publish Test' },
    });
    await createRoute.handler(createCtx);
    const docId = createCtx.body.data.documentId;

    // Publish
    const publishRoute = findRoute('POST', '/admin/content-manager/collection-types/:uid/:documentId/actions/publish')!;
    const pubCtx = mockCtx({ params: { uid: 'api::article.article', documentId: docId } });
    await publishRoute.handler(pubCtx);

    expect(pubCtx.status).toBe(200);
    expect(pubCtx.body.data.status).toBe('published');

    // Unpublish
    const unpubRoute = findRoute('POST', '/admin/content-manager/collection-types/:uid/:documentId/actions/unpublish')!;
    const unpubCtx = mockCtx({ params: { uid: 'api::article.article', documentId: docId } });
    await unpubRoute.handler(unpubCtx);

    expect(unpubCtx.status).toBe(200);
  });

  it('discard-draft action works', async () => {
    const createRoute = findRoute('POST', '/admin/content-manager/collection-types/:uid')!;
    const createCtx = mockCtx({
      params: { uid: 'api::article.article' },
      body: { title: 'Original Title' },
    });
    await createRoute.handler(createCtx);
    const docId = createCtx.body.data.documentId;

    // Publish
    const publishRoute = findRoute('POST', '/admin/content-manager/collection-types/:uid/:documentId/actions/publish')!;
    await publishRoute.handler(mockCtx({ params: { uid: 'api::article.article', documentId: docId } }));

    // Update draft
    const updateRoute = findRoute('PUT', '/admin/content-manager/collection-types/:uid/:documentId')!;
    await updateRoute.handler(mockCtx({
      params: { uid: 'api::article.article', documentId: docId },
      body: { title: 'Modified' },
    }));

    // Discard draft
    const discardRoute = findRoute('POST', '/admin/content-manager/collection-types/:uid/:documentId/actions/discard-draft')!;
    const ctx = mockCtx({ params: { uid: 'api::article.article', documentId: docId } });
    await discardRoute.handler(ctx);

    expect(ctx.status).toBe(200);
    expect(ctx.body.data.title).toBe('Original Title');
  });

  it('single-type PUT creates or updates', async () => {
    const putRoute = findRoute('PUT', '/admin/content-manager/single-types/:uid')!;

    // Create
    const ctx1 = mockCtx({
      params: { uid: 'api::homepage.homepage' },
      body: { heading: 'Welcome' },
    });
    await putRoute.handler(ctx1);
    expect(ctx1.status).toBe(200);
    expect(ctx1.body.data.heading).toBe('Welcome');

    // Update
    const ctx2 = mockCtx({
      params: { uid: 'api::homepage.homepage' },
      body: { heading: 'Updated Welcome' },
    });
    await putRoute.handler(ctx2);
    expect(ctx2.body.data.heading).toBe('Updated Welcome');
  });

  it('history is captured on create', async () => {
    const createRoute = findRoute('POST', '/admin/content-manager/collection-types/:uid')!;
    const createCtx = mockCtx({
      params: { uid: 'api::article.article' },
      body: { title: 'History Entry' },
    });
    await createRoute.handler(createCtx);
    const docId = createCtx.body.data.documentId;

    const histRoute = findRoute('GET', '/admin/content-manager/history-versions/:contentType/:documentId')!;
    const ctx = mockCtx({
      params: { contentType: 'api::article.article', documentId: docId },
    });
    await histRoute.handler(ctx);

    expect(ctx.body.data).toHaveLength(1);
    expect(ctx.body.data[0].data.title).toBe('History Entry');
  });

  it('history restore works', async () => {
    const createRoute = findRoute('POST', '/admin/content-manager/collection-types/:uid')!;
    const createCtx = mockCtx({
      params: { uid: 'api::article.article' },
      body: { title: 'V1' },
    });
    await createRoute.handler(createCtx);
    const docId = createCtx.body.data.documentId;

    // Update
    const updateRoute = findRoute('PUT', '/admin/content-manager/collection-types/:uid/:documentId')!;
    await updateRoute.handler(mockCtx({
      params: { uid: 'api::article.article', documentId: docId },
      body: { title: 'V2' },
    }));

    // Get first version ID
    const histRoute = findRoute('GET', '/admin/content-manager/history-versions/:contentType/:documentId')!;
    const histCtx = mockCtx({
      params: { contentType: 'api::article.article', documentId: docId },
    });
    await histRoute.handler(histCtx);

    // Newest first, so last is V1
    const v1Id = histCtx.body.data[histCtx.body.data.length - 1].id;

    // Restore
    const restoreRoute = findRoute('POST', '/admin/content-manager/history-versions/:versionId/restore')!;
    const restoreCtx = mockCtx({ params: { versionId: String(v1Id) } });
    await restoreRoute.handler(restoreCtx);

    expect(restoreCtx.status).toBe(200);
    expect(restoreCtx.body.data.entry.title).toBe('V1');
  });

  it('preview returns 204 when disabled', async () => {
    const route = findRoute('GET', '/admin/content-manager/preview/url')!;
    const ctx = mockCtx({
      query: { contentType: 'api::article.article', documentId: 'doc-1' },
    });
    await route.handler(ctx);

    expect(ctx.status).toBe(204);
  });

  it('preview returns URL when enabled', async () => {
    env.previewService.configure({
      enabled: true,
      handler: (_uid, ctx) => `https://preview.test/${ctx.documentId}`,
    });

    const route = findRoute('GET', '/admin/content-manager/preview/url')!;
    const ctx = mockCtx({
      query: { contentType: 'api::article.article', documentId: 'doc-1' },
    });
    await route.handler(ctx);

    expect(ctx.status).toBe(200);
    expect(ctx.body.data.url).toBe('https://preview.test/doc-1');
  });

  it('returns 404 for non-existent content type', async () => {
    const route = findRoute('GET', '/admin/content-manager/collection-types/:uid')!;
    const ctx = mockCtx({ params: { uid: 'api::nonexistent.nonexistent' } });
    await route.handler(ctx);

    expect(ctx.status).toBe(404);
  });

  it('returns 400 for publish on non-draft-enabled type', async () => {
    // Create a page entry first
    env.cms.create('api::page.page', { title: 'Page' });
    const pages = env.cms.findMany('api::page.page');
    const docId = pages.results[0].documentId;

    const route = findRoute('POST', '/admin/content-manager/collection-types/:uid/:documentId/actions/publish')!;
    const ctx = mockCtx({ params: { uid: 'api::page.page', documentId: docId } });
    await route.handler(ctx);

    expect(ctx.status).toBe(400);
  });
});
