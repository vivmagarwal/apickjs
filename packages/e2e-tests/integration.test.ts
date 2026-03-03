/**
 * End-to-end integration tests.
 *
 * Tests full CMS scenarios across multiple packages, verifying
 * that all services work together correctly.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';

// Content Manager
import { createContentManagerService } from '../../packages/content-manager/src/services/content-manager.js';
import { createHistoryService } from '../../packages/content-manager/src/history/index.js';

// Admin
import { createAdminService } from '../../packages/admin/src/services/admin-user.js';
import { createAdminRoleService } from '../../packages/admin/src/services/admin-role.js';
import { createAdminAuthService } from '../../packages/admin/src/services/admin-auth.js';
import { createApiTokenService } from '../../packages/admin/src/services/api-token.js';
import { createAuditLogService } from '../../packages/admin/src/audit-logs/index.js';

// Users & Permissions
import { createUserService } from '../../packages/users-permissions/src/services/user.js';
import { createRoleService } from '../../packages/users-permissions/src/services/role.js';
import { createUserAuthService } from '../../packages/users-permissions/src/services/auth.js';

// i18n
import { createLocaleService } from '../../packages/i18n/src/services/locale.js';

// Content Releases
import { createReleaseService } from '../../packages/content-releases/src/services/release.js';

// Review Workflows
import { createWorkflowService } from '../../packages/review-workflows/src/services/workflow.js';

// Upload
import { createUploadService } from '../../packages/upload/src/services/upload.js';

// Email
import { createEmailService } from '../../packages/email/src/services/email.js';

// Data Transfer
import { createTransferService } from '../../packages/data-transfer/src/services/transfer.js';

// Webhooks & Cron
import { createWebhookService } from '../../packages/core/src/webhooks/index.js';
import { createCronService } from '../../packages/core/src/cron/index.js';

// Plugins & Providers
import { createPluginManager } from '../../packages/core/src/plugins/index.js';
import { createProviderRegistry } from '../../packages/core/src/providers/index.js';

function createDb() {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  return db;
}

describe('End-to-End Integration', () => {
  let db: ReturnType<typeof Database>;

  beforeEach(() => {
    db = createDb();
  });

  // ---------------------------------------------------------------------------
  // Full content lifecycle
  // ---------------------------------------------------------------------------

  describe('Content lifecycle: create → publish → update → unpublish → delete', () => {
    it('manages the full lifecycle of a content entry', () => {
      const contentManager = createContentManagerService({ rawDb: db });

      // Register a content type
      contentManager.registerContentType({
        uid: 'api::article.article',
        kind: 'collectionType',
        info: { singularName: 'article', pluralName: 'articles', displayName: 'Article' },
        attributes: {
          title: { type: 'string' },
          body: { type: 'text' },
          featured: { type: 'boolean' },
        },
        options: { draftAndPublish: true },
      });

      // Create a draft entry
      const entry = contentManager.create('api::article.article', {
        title: 'My First Article', body: 'Hello World', featured: false,
      });
      expect(entry.title).toBe('My First Article');

      // Publish the entry
      const published = contentManager.publish('api::article.article', entry.documentId);
      expect(published).not.toBeNull();

      // Update the draft
      const updated = contentManager.update('api::article.article', entry.documentId, {
        title: 'Updated Title', featured: true,
      });
      expect(updated!.title).toBe('Updated Title');

      // Unpublish
      const unpublished = contentManager.unpublish('api::article.article', entry.documentId);
      expect(unpublished).not.toBeNull();

      // Delete
      const deleted = contentManager.delete('api::article.article', entry.documentId);
      expect(deleted).toBe(true);
      expect(contentManager.count('api::article.article')).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Content with i18n
  // ---------------------------------------------------------------------------

  describe('Content with i18n: localized entries', () => {
    it('creates and queries content per locale', () => {
      const localeService = createLocaleService({
        rawDb: db,
        initialLocales: [{ code: 'en', name: 'English', isDefault: true }, { code: 'fr', name: 'French' }],
      });

      const contentManager = createContentManagerService({ rawDb: db });
      contentManager.registerContentType({
        uid: 'api::page.page',
        kind: 'collectionType',
        info: { singularName: 'page', pluralName: 'pages', displayName: 'Page' },
        attributes: { title: { type: 'string' }, slug: { type: 'string' } },
        options: { draftAndPublish: false },
      });

      // Create entries in different locales
      const en = contentManager.create('api::page.page', {
        title: 'Home', slug: 'home',
      }, { locale: 'en' });
      contentManager.create('api::page.page', {
        title: 'Accueil', slug: 'accueil',
      }, { locale: 'fr' });

      // Query by locale
      const enPages = contentManager.findMany('api::page.page', { locale: 'en' });
      expect(enPages.results).toHaveLength(1);
      expect(enPages.results[0].title).toBe('Home');

      const frPages = contentManager.findMany('api::page.page', { locale: 'fr' });
      expect(frPages.results).toHaveLength(1);
      expect(frPages.results[0].title).toBe('Accueil');

      // Verify locales
      expect(localeService.isValidLocale('en')).toBe(true);
      expect(localeService.isValidLocale('de')).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // Admin auth flow
  // ---------------------------------------------------------------------------

  describe('Admin auth flow: register → login → create role → assign permissions', () => {
    it('completes the full admin auth and RBAC flow', () => {
      const adminService = createAdminService({ rawDb: db });
      const roleService = createAdminRoleService({ rawDb: db });
      const authService = createAdminAuthService({
        userService: adminService, roleService,
        secret: 'e2e-secret',
      });

      // Register first admin
      const registered = authService.registerFirstAdmin({
        email: 'admin@test.com', password: 'Test123!',
        firstname: 'Admin', lastname: 'User',
      });
      expect(registered.user.email).toBe('admin@test.com');
      expect(registered.token).toBeDefined();

      // Login
      const loginResult = authService.login('admin@test.com', 'Test123!');
      expect(loginResult.token).toBeDefined();

      // Verify token
      const decoded = authService.verify(loginResult.token);
      expect(decoded).not.toBeNull();
      expect(decoded!.id).toBe(registered.user.id);

      // Create a role
      const role = roleService.create({
        name: 'Editor',
        description: 'Can edit content',
        permissions: [
          { action: 'plugin::content-manager.explorer.read', subject: '*' },
          { action: 'plugin::content-manager.explorer.create', subject: '*' },
        ],
      });
      expect(role.name).toBe('Editor');

      // Assign role to user
      adminService.updateById(registered.user.id!, { roles: [role.id!] });
      const user = adminService.findOne(registered.user.id!);
      expect(user!.roles).toContain(role.id);
    });
  });

  // ---------------------------------------------------------------------------
  // End-user auth flow
  // ---------------------------------------------------------------------------

  describe('End-user auth flow: register → login → verify', () => {
    it('registers and authenticates an end user', () => {
      const userService = createUserService({ rawDb: db });
      const roleService = createRoleService({ rawDb: db });
      roleService.ensureDefaultRoles();

      const authService = createUserAuthService({
        userService, roleService,
        secret: 'user-secret',
      });

      // Register
      const registered = authService.register({
        username: 'johndoe', email: 'john@example.com', password: 'Password123!',
      });
      expect(registered.user.username).toBe('johndoe');

      // Login
      const loginResult = authService.login('john@example.com', 'Password123!');
      expect(loginResult.jwt).toBeDefined();

      // Verify
      const decoded = authService.verify(loginResult.jwt);
      expect(decoded).not.toBeNull();
      expect(decoded!.id).toBe(registered.user.id);
    });
  });

  // ---------------------------------------------------------------------------
  // Content releases with batch publish
  // ---------------------------------------------------------------------------

  describe('Content releases: batch publish', () => {
    it('creates a release, adds actions, and publishes atomically', () => {
      const contentManager = createContentManagerService({ rawDb: db });
      contentManager.registerContentType({
        uid: 'api::article.article',
        kind: 'collectionType',
        info: { singularName: 'article', pluralName: 'articles', displayName: 'Article' },
        attributes: { title: { type: 'string' } },
        options: { draftAndPublish: true },
      });

      // Create draft content
      const a1 = contentManager.create('api::article.article', { title: 'Article 1' });
      const a2 = contentManager.create('api::article.article', { title: 'Article 2' });

      // Create a release
      const releaseService = createReleaseService({ rawDb: db });
      const release = releaseService.create({ name: 'Sprint 1' });

      releaseService.addAction(release.id!, {
        type: 'publish', contentType: 'api::article.article', documentId: a1.documentId,
      });
      releaseService.addAction(release.id!, {
        type: 'publish', contentType: 'api::article.article', documentId: a2.documentId,
      });

      // Publish the release — executor publishes content
      const publishedRelease = releaseService.publish(release.id!, (action) => {
        contentManager.publish(action.contentType, action.documentId);
        return true;
      });

      expect(publishedRelease!.status).toBe('done');
    });
  });

  // ---------------------------------------------------------------------------
  // Review workflows
  // ---------------------------------------------------------------------------

  describe('Review workflows: stage transitions', () => {
    it('moves content through workflow stages', () => {
      const workflowService = createWorkflowService({ rawDb: db });
      const wf = workflowService.create({
        name: 'Editorial',
        stages: [{ name: 'Draft' }, { name: 'In Review' }, { name: 'Approved' }],
      });
      const stages = workflowService.getStages(wf.id!);

      // Assign document to Draft stage
      workflowService.assignStage('api::article.article', 'doc-1', stages[0].id!);
      let stage = workflowService.getDocumentStage('api::article.article', 'doc-1');
      expect(stage!.name).toBe('Draft');

      // Move to In Review
      workflowService.assignStage('api::article.article', 'doc-1', stages[1].id!);
      stage = workflowService.getDocumentStage('api::article.article', 'doc-1');
      expect(stage!.name).toBe('In Review');

      // Move to Approved
      workflowService.assignStage('api::article.article', 'doc-1', stages[2].id!);
      stage = workflowService.getDocumentStage('api::article.article', 'doc-1');
      expect(stage!.name).toBe('Approved');
    });
  });

  // ---------------------------------------------------------------------------
  // Upload + email + webhooks integration
  // ---------------------------------------------------------------------------

  describe('Upload + Email + Webhooks integration', () => {
    it('uploads a file, sends email notification, and triggers webhook', async () => {
      // Upload
      const uploadService = createUploadService({ rawDb: db });
      const file = await uploadService.create({
        name: 'report.pdf', ext: '.pdf', mime: 'application/pdf', size: 50000,
      });
      expect(file.url).toBeDefined();

      // Email notification
      const sentEmails: any[] = [];
      const emailService = createEmailService({
        provider: { send: (opts) => { sentEmails.push(opts); } },
      });
      await emailService.send({
        to: 'admin@example.com',
        subject: `New file uploaded: ${file.name}`,
        text: `File ${file.name} (${file.size} bytes) was uploaded.`,
      });
      expect(sentEmails).toHaveLength(1);

      // Webhook
      const webhookRequests: any[] = [];
      const webhookService = createWebhookService({
        rawDb: db, secret: 'test',
        fetcher: async (url, init) => {
          webhookRequests.push({ url, body: JSON.parse(init.body) });
          return { status: 200 };
        },
      });
      webhookService.create({
        name: 'Upload Notifier', url: 'https://hooks.example.com/upload',
        events: ['media.create'],
      });
      await webhookService.trigger('media.create', { model: 'file', entry: file });
      expect(webhookRequests).toHaveLength(1);
      expect(webhookRequests[0].body.event).toBe('media.create');
    });
  });

  // ---------------------------------------------------------------------------
  // Content history + audit logs
  // ---------------------------------------------------------------------------

  describe('Content history and audit logs', () => {
    it('tracks content changes in history and audit logs', () => {
      const contentManager = createContentManagerService({ rawDb: db });
      contentManager.registerContentType({
        uid: 'api::post.post',
        kind: 'collectionType',
        info: { singularName: 'post', pluralName: 'posts', displayName: 'Post' },
        attributes: { title: { type: 'string' }, body: { type: 'text' } },
        options: { draftAndPublish: false },
      });

      const historyService = createHistoryService({ rawDb: db });
      const auditService = createAuditLogService({ rawDb: db });

      // Create content and log
      const entry = contentManager.create('api::post.post', {
        title: 'Original', body: 'Content',
      });

      historyService.createVersion({
        contentType: 'api::post.post',
        relatedDocumentId: entry.documentId,
        status: 'published',
        data: { title: 'Original', body: 'Content' },
        schema: { title: { type: 'string' }, body: { type: 'text' } },
        createdBy: 1,
      });
      auditService.log({
        action: 'content-manager.entry.create',
        userId: 1, userEmail: 'admin@test.com',
        payload: { contentType: 'api::post.post', documentId: entry.documentId },
      });

      // Update and log
      contentManager.update('api::post.post', entry.documentId, {
        title: 'Updated', body: 'New Content',
      });
      historyService.createVersion({
        contentType: 'api::post.post',
        relatedDocumentId: entry.documentId,
        status: 'published',
        data: { title: 'Updated', body: 'New Content' },
        schema: { title: { type: 'string' }, body: { type: 'text' } },
        createdBy: 1,
      });
      auditService.log({
        action: 'content-manager.entry.update',
        userId: 1, userEmail: 'admin@test.com',
        payload: { contentType: 'api::post.post', documentId: entry.documentId },
      });

      // Verify history
      const history = historyService.findVersionsPage({
        contentType: 'api::post.post',
        relatedDocumentId: entry.documentId,
      });
      expect(history.results).toHaveLength(2);

      // Verify audit logs
      const audits = auditService.findMany({ action: 'content-manager.entry.update' });
      expect(audits.results).toHaveLength(1);
    });
  });

  // ---------------------------------------------------------------------------
  // Data transfer round-trip
  // ---------------------------------------------------------------------------

  describe('Data transfer: export → import round-trip', () => {
    it('exports and re-imports content data', () => {
      // Create source data
      db.exec(`CREATE TABLE "articles" ("id" INTEGER PRIMARY KEY, "title" TEXT, "status" TEXT)`);
      db.prepare(`INSERT INTO "articles" (title, status) VALUES (?, ?)`).run('Article A', 'published');
      db.prepare(`INSERT INTO "articles" (title, status) VALUES (?, ?)`).run('Article B', 'draft');

      const sourceTransfer = createTransferService({ rawDb: db, contentTables: ['articles'] });

      // Export
      const exported = sourceTransfer.exportData();
      expect(exported.content.articles).toHaveLength(2);

      // Import into fresh database
      const targetDb = createDb();
      targetDb.exec(`CREATE TABLE "articles" ("id" INTEGER PRIMARY KEY, "title" TEXT, "status" TEXT)`);
      const targetTransfer = createTransferService({ rawDb: targetDb });
      const result = targetTransfer.importData(exported);
      expect(result.imported.content).toBe(2);

      // Verify data integrity
      const rows = targetDb.prepare(`SELECT * FROM "articles" ORDER BY id`).all() as any[];
      expect(rows).toHaveLength(2);
      expect(rows[0].title).toBe('Article A');
      expect(rows[1].title).toBe('Article B');
    });
  });

  // ---------------------------------------------------------------------------
  // API tokens
  // ---------------------------------------------------------------------------

  describe('API token management', () => {
    it('creates and validates API tokens', () => {
      const tokenService = createApiTokenService({ rawDb: db, salt: 'e2e-test-salt' });
      const token = tokenService.create({
        name: 'CI Token',
        type: 'full-access',
        description: 'For CI/CD pipeline',
      });
      expect(token.accessKey).toBeDefined();

      // Validate the token by hashing and looking up
      const validated = tokenService.findByHash(tokenService.hashToken(token.accessKey));
      expect(validated).not.toBeNull();
      expect(validated!.name).toBe('CI Token');
    });
  });

  // ---------------------------------------------------------------------------
  // Plugin system
  // ---------------------------------------------------------------------------

  describe('Plugin system integration', () => {
    it('loads plugins with services and runs lifecycle', async () => {
      const lifecycleCalls: string[] = [];
      const apick = {
        plugin: () => undefined,
        config: {},
        contentTypes: { add() {}, get() {}, has() { return false; }, getAll() { return {}; } },
        services: { add() {}, get() {}, has() { return false; }, getAll() { return {}; } },
        controllers: { add() {}, get() {}, has() { return false; }, getAll() { return {}; } },
        hooks: { get() { return { register() {}, async call() {} }; } },
        customFields: { register() {}, get() {}, getAll() { return {}; }, has() { return false; } },
      };

      const manager = createPluginManager({ apick });
      manager.register('test-plugin', {
        name: 'test-plugin',
        services: {
          greeting: () => ({ hello: () => 'world' }),
        },
        register: () => { lifecycleCalls.push('register'); },
        bootstrap: () => { lifecycleCalls.push('bootstrap'); },
        destroy: () => { lifecycleCalls.push('destroy'); },
      });

      manager.loadAll();
      await manager.runRegister();
      await manager.runBootstrap();

      const plugin = manager.get('test-plugin');
      expect(plugin!.service('greeting').hello()).toBe('world');
      expect(lifecycleCalls).toEqual(['register', 'bootstrap']);

      await manager.runDestroy();
      expect(lifecycleCalls).toEqual(['register', 'bootstrap', 'destroy']);
    });
  });

  // ---------------------------------------------------------------------------
  // Provider system
  // ---------------------------------------------------------------------------

  describe('Provider system integration', () => {
    it('initializes upload and email providers', async () => {
      const registry = createProviderRegistry();

      // Register domains
      registry.registerDomain('upload', { required: ['upload', 'delete'] });
      registry.registerDomain('email', { required: ['send'] });

      // Set providers
      const uploadedFiles: string[] = [];
      registry.setProvider('upload', {
        init: () => ({
          upload: (file: any) => { uploadedFiles.push(file.name); file.url = `/uploads/${file.hash}`; },
          delete: () => {},
        }),
      });

      const sentEmails: string[] = [];
      registry.setProvider('email', {
        init: () => ({
          send: (opts: any) => { sentEmails.push(opts.subject); },
        }),
      });

      await registry.initAll();

      // Use providers
      const uploadProvider = registry.getProvider('upload');
      const file = { name: 'test.jpg', hash: 'abc', ext: '.jpg', mime: 'image/jpeg', size: 100, url: '' };
      uploadProvider.upload(file);
      expect(uploadedFiles).toEqual(['test.jpg']);

      const emailProvider = registry.getProvider('email');
      emailProvider.send({ to: 'test@example.com', subject: 'Test' });
      expect(sentEmails).toEqual(['Test']);

      await registry.destroyAll();
    });
  });

  // ---------------------------------------------------------------------------
  // Full CMS scenario
  // ---------------------------------------------------------------------------

  describe('Full CMS scenario', () => {
    it('boots all services, creates content, manages users, and queries data', async () => {
      // Initialize all services
      const adminService = createAdminService({ rawDb: db });
      const adminRoleService = createAdminRoleService({ rawDb: db });
      const adminAuthService = createAdminAuthService({
        userService: adminService, roleService: adminRoleService,
        secret: 'admin-secret',
      });
      const userService = createUserService({ rawDb: db });
      const roleService = createRoleService({ rawDb: db });
      roleService.ensureDefaultRoles();
      const userAuthService = createUserAuthService({
        userService, roleService,
        secret: 'user-secret',
      });
      const contentManager = createContentManagerService({ rawDb: db });
      const localeService = createLocaleService({
        rawDb: db,
        initialLocales: [{ code: 'en', name: 'English', isDefault: true }],
      });
      const uploadService = createUploadService({ rawDb: db });
      const auditService = createAuditLogService({ rawDb: db });

      // 1. Register first admin
      const admin = adminAuthService.registerFirstAdmin({
        email: 'super@admin.com', password: 'Admin123!',
        firstname: 'Super', lastname: 'Admin',
      });
      expect(admin.token).toBeDefined();

      // 2. Register content types
      contentManager.registerContentType({
        uid: 'api::blog.blog',
        kind: 'collectionType',
        info: { singularName: 'blog', pluralName: 'blogs', displayName: 'Blog' },
        attributes: {
          title: { type: 'string' },
          content: { type: 'text' },
          category: { type: 'string' },
        },
        options: { draftAndPublish: true },
      });

      // 3. Create content entries
      const post1 = contentManager.create('api::blog.blog', {
        title: 'Getting Started', content: 'Welcome to APICK', category: 'tutorial',
      }, { createdBy: admin.user.id });
      const post2 = contentManager.create('api::blog.blog', {
        title: 'Advanced Features', content: 'Deep dive into APICK', category: 'advanced',
      }, { createdBy: admin.user.id });

      // 4. Publish content
      contentManager.publish('api::blog.blog', post1.documentId);
      contentManager.publish('api::blog.blog', post2.documentId);

      // 5. Query content
      const allBlogs = contentManager.findMany('api::blog.blog');
      expect(allBlogs.pagination.total).toBe(2);

      // 6. Upload a file
      const image = await uploadService.create({
        name: 'hero.jpg', ext: '.jpg', mime: 'image/jpeg', size: 200000,
        width: 1920, height: 1080,
      });
      expect(image.url).toBeDefined();

      // 7. Register end user
      const endUser = userAuthService.register({
        username: 'reader', email: 'reader@example.com', password: 'Reader123!',
      });
      expect(endUser.jwt).toBeDefined();

      // 8. Log audit events
      auditService.log({
        action: 'content-manager.entry.create',
        userId: admin.user.id, userEmail: 'super@admin.com',
        payload: { contentType: 'api::blog.blog', title: 'Getting Started' },
      });

      // 9. Verify audit trail
      const audits = auditService.findMany();
      expect(audits.results.length).toBeGreaterThanOrEqual(1);

      // 10. Verify counts (draft+publish creates 2 draft + 2 published rows)
      expect(contentManager.count('api::blog.blog', { status: 'published' })).toBe(2);
      expect(uploadService.count()).toBe(1);
      expect(userService.count()).toBe(1);
      expect(localeService.findAll()).toHaveLength(1);
    });
  });
});
