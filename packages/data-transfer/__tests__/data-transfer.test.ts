import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { createTransferService } from '../src/services/transfer.js';
import type { TransferService } from '../src/services/transfer.js';

function createDb() {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  return db;
}

describe('@apick/data-transfer', () => {
  let db: ReturnType<typeof Database>;
  let service: TransferService;

  beforeEach(() => {
    db = createDb();
    service = createTransferService({ rawDb: db });
  });

  // ---------------------------------------------------------------------------
  // Transfer Token CRUD
  // ---------------------------------------------------------------------------

  describe('Transfer Token CRUD', () => {
    it('creates a transfer token', () => {
      const token = service.createToken({ name: 'Deploy Token', permissions: ['push', 'pull'] });
      expect(token.id).toBeDefined();
      expect(token.name).toBe('Deploy Token');
      expect(token.permissions).toEqual(['push', 'pull']);
      expect(token.accessKey).toBeDefined();
      expect(token.accessKey.length).toBeGreaterThan(0);
    });

    it('lists all tokens', () => {
      service.createToken({ name: 'T1', permissions: ['push'] });
      service.createToken({ name: 'T2', permissions: ['pull'] });
      const all = service.findAllTokens();
      expect(all).toHaveLength(2);
    });

    it('finds a token by id', () => {
      const created = service.createToken({ name: 'Findable', permissions: ['pull'] });
      const found = service.findOneToken(created.id!);
      expect(found).not.toBeNull();
      expect(found!.name).toBe('Findable');
    });

    it('returns null for non-existent token', () => {
      expect(service.findOneToken(999)).toBeNull();
    });

    it('updates a token', () => {
      const token = service.createToken({ name: 'Old', permissions: ['push'] });
      const updated = service.updateToken(token.id!, { name: 'Updated', description: 'New desc' });
      expect(updated).not.toBeNull();
      expect(updated!.name).toBe('Updated');
      expect(updated!.description).toBe('New desc');
    });

    it('deletes a token', () => {
      const token = service.createToken({ name: 'Delete', permissions: ['push'] });
      expect(service.deleteToken(token.id!)).toBe(true);
      expect(service.findOneToken(token.id!)).toBeNull();
    });

    it('returns false when deleting non-existent token', () => {
      expect(service.deleteToken(999)).toBe(false);
    });

    it('creates a token with lifespan and expiration', () => {
      const token = service.createToken({ name: 'Expiring', permissions: ['push'], lifespan: 3600000 });
      expect(token.lifespan).toBe(3600000);
      expect(token.expiresAt).toBeDefined();
    });

    it('creates a token with description', () => {
      const token = service.createToken({ name: 'Described', permissions: ['pull'], description: 'For CI' } as any);
      expect(token.name).toBe('Described');
    });
  });

  // ---------------------------------------------------------------------------
  // Token Regeneration
  // ---------------------------------------------------------------------------

  describe('Token Regeneration', () => {
    it('regenerates a token access key', () => {
      const original = service.createToken({ name: 'Regen', permissions: ['push'] });
      const regenerated = service.regenerateToken(original.id!);
      expect(regenerated).not.toBeNull();
      expect(regenerated!.accessKey).not.toBe(original.accessKey);
    });

    it('returns null when regenerating non-existent token', () => {
      expect(service.regenerateToken(999)).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // Token Validation
  // ---------------------------------------------------------------------------

  describe('Token Validation', () => {
    it('validates a valid token with correct permission', () => {
      const token = service.createToken({ name: 'Valid', permissions: ['push', 'pull'] });
      expect(service.validateToken(token.accessKey, 'push')).toBe(true);
      expect(service.validateToken(token.accessKey, 'pull')).toBe(true);
    });

    it('rejects token with wrong permission', () => {
      const token = service.createToken({ name: 'Push Only', permissions: ['push'] });
      expect(service.validateToken(token.accessKey, 'pull')).toBe(false);
    });

    it('rejects invalid access key', () => {
      expect(service.validateToken('bogus-key', 'push')).toBe(false);
    });

    it('rejects expired token', () => {
      const token = service.createToken({ name: 'Expired', permissions: ['push'], lifespan: 1 });
      // Token should be expired almost immediately
      // Force expiration by updating the DB
      db.prepare(`UPDATE "transfer_tokens" SET expires_at = '2000-01-01T00:00:00.000Z' WHERE id = ?`).run(token.id);
      expect(service.validateToken(token.accessKey, 'push')).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // Export
  // ---------------------------------------------------------------------------

  describe('Export', () => {
    it('exports empty data', () => {
      const data = service.exportData();
      expect(data.metadata.version).toBe('1.0.0');
      expect(data.metadata.source).toBe('apick');
      expect(data.content).toEqual({});
      expect(data.media).toEqual([]);
    });

    it('exports content from specified tables', () => {
      // Create a test table and insert data
      db.exec(`CREATE TABLE "test_articles" ("id" INTEGER PRIMARY KEY, "title" TEXT)`);
      db.prepare(`INSERT INTO "test_articles" (title) VALUES (?)`).run('Hello World');

      const svc = createTransferService({ rawDb: db, contentTables: ['test_articles'] });
      const data = svc.exportData();
      expect(data.content['test_articles']).toHaveLength(1);
      expect(data.content['test_articles'][0].title).toBe('Hello World');
    });

    it('respects only option', () => {
      db.exec(`CREATE TABLE "test_articles" ("id" INTEGER PRIMARY KEY, "title" TEXT)`);
      db.prepare(`INSERT INTO "test_articles" (title) VALUES (?)`).run('Article');

      const svc = createTransferService({ rawDb: db, contentTables: ['test_articles'] });
      const data = svc.exportData({ only: ['schemas'] });
      expect(data.content).toEqual({});
    });

    it('respects exclude option', () => {
      db.exec(`CREATE TABLE "articles" ("id" INTEGER PRIMARY KEY, "title" TEXT)`);
      db.exec(`CREATE TABLE "pages" ("id" INTEGER PRIMARY KEY, "title" TEXT)`);
      db.prepare(`INSERT INTO "articles" (title) VALUES (?)`).run('Article');
      db.prepare(`INSERT INTO "pages" (title) VALUES (?)`).run('Page');

      const svc = createTransferService({ rawDb: db, contentTables: ['articles', 'pages'] });
      const data = svc.exportData({ exclude: ['pages'] });
      expect(data.content['articles']).toHaveLength(1);
      expect(data.content['pages']).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // Import
  // ---------------------------------------------------------------------------

  describe('Import', () => {
    it('imports content data', () => {
      db.exec(`CREATE TABLE "test_articles" ("id" INTEGER PRIMARY KEY, "title" TEXT)`);

      const importData = {
        metadata: { createdAt: new Date().toISOString(), version: '1.0.0', source: 'apick' },
        schemas: [],
        content: {
          test_articles: [{ id: 1, title: 'Imported Article' }],
        },
        media: [],
      };

      const result = service.importData(importData);
      expect(result.imported.content).toBe(1);
      expect(result.errors).toHaveLength(0);

      const rows = db.prepare(`SELECT * FROM "test_articles"`).all() as any[];
      expect(rows).toHaveLength(1);
      expect(rows[0].title).toBe('Imported Article');
    });

    it('skips existing rows by default', () => {
      db.exec(`CREATE TABLE "test_articles" ("id" INTEGER PRIMARY KEY, "title" TEXT)`);
      db.prepare(`INSERT INTO "test_articles" (id, title) VALUES (1, 'Existing')`).run();

      const importData = {
        metadata: { createdAt: new Date().toISOString(), version: '1.0.0', source: 'apick' },
        schemas: [], content: { test_articles: [{ id: 1, title: 'New Version' }] }, media: [],
      };

      const result = service.importData(importData);
      expect(result.skipped.content).toBe(1);
      expect(result.imported.content).toBe(0);

      const row = db.prepare(`SELECT * FROM "test_articles" WHERE id = 1`).get() as any;
      expect(row.title).toBe('Existing');
    });

    it('overwrites with force option', () => {
      db.exec(`CREATE TABLE "test_articles" ("id" INTEGER PRIMARY KEY, "title" TEXT)`);
      db.prepare(`INSERT INTO "test_articles" (id, title) VALUES (1, 'Existing')`).run();

      const importData = {
        metadata: { createdAt: new Date().toISOString(), version: '1.0.0', source: 'apick' },
        schemas: [], content: { test_articles: [{ id: 1, title: 'Overwritten' }] }, media: [],
      };

      const result = service.importData(importData, { force: true });
      expect(result.imported.content).toBe(1);

      const row = db.prepare(`SELECT * FROM "test_articles" WHERE id = 1`).get() as any;
      expect(row.title).toBe('Overwritten');
    });

    it('performs dry run without modifying data', () => {
      db.exec(`CREATE TABLE "test_articles" ("id" INTEGER PRIMARY KEY, "title" TEXT)`);

      const importData = {
        metadata: { createdAt: new Date().toISOString(), version: '1.0.0', source: 'apick' },
        schemas: [], content: { test_articles: [{ id: 1, title: 'Dry' }] }, media: [],
      };

      const result = service.importData(importData, { dryRun: true });
      expect(result.imported.content).toBe(1);

      const rows = db.prepare(`SELECT * FROM "test_articles"`).all();
      expect(rows).toHaveLength(0);
    });

    it('records errors for failed imports', () => {
      // No table created — insert should fail
      const importData = {
        metadata: { createdAt: new Date().toISOString(), version: '1.0.0', source: 'apick' },
        schemas: [],
        content: { nonexistent_table: [{ id: 1, title: 'Fail' }] },
        media: [],
      };

      const result = service.importData(importData);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });
});
