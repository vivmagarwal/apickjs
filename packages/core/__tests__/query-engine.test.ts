import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { createQueryEngine } from '../src/query-engine/index.js';
import { createLogger } from '../src/logging/index.js';

const logger = createLogger({ level: 'silent' });

function createTestDb() {
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
      "rating" REAL,
      "published" INTEGER DEFAULT 0,
      "created_at" TEXT NOT NULL,
      "updated_at" TEXT NOT NULL,
      "published_at" TEXT,
      "locale" VARCHAR(10)
    )
  `);

  return db;
}

function seedArticles(db: any) {
  const now = new Date().toISOString();
  const stmt = db.prepare(`
    INSERT INTO "articles" ("document_id", "title", "slug", "content", "views", "rating", "published", "created_at", "updated_at", "published_at", "locale")
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run('doc-1', 'Hello World', 'hello-world', 'First article content', 100, 4.5, 1, now, now, now, 'en');
  stmt.run('doc-2', 'TypeScript Guide', 'typescript-guide', 'TS content', 250, 4.8, 1, now, now, now, 'en');
  stmt.run('doc-3', 'Draft Post', 'draft-post', 'Draft content', 0, null, 0, now, now, null, 'en');
  stmt.run('doc-4', 'French Article', 'french-article', 'Contenu français', 50, 3.2, 1, now, now, now, 'fr');
  stmt.run('doc-5', 'Another Draft', 'another-draft', 'More draft stuff', 10, null, 0, now, now, null, 'en');
}

describe('Query Engine', () => {
  let db: any;
  let qe: ReturnType<typeof createQueryEngine>;

  beforeEach(() => {
    db = createTestDb();
    seedArticles(db);
    qe = createQueryEngine(db, 'articles', logger);
  });

  afterEach(() => {
    db.close();
  });

  // -----------------------------------------------------------------------
  // CRUD Operations
  // -----------------------------------------------------------------------

  describe('findOne', () => {
    it('returns a single row matching the where clause', async () => {
      const row = await qe.findOne({ where: { title: 'Hello World' } });
      expect(row).not.toBeNull();
      expect(row.title).toBe('Hello World');
      expect(row.slug).toBe('hello-world');
    });

    it('returns null when no match', async () => {
      const row = await qe.findOne({ where: { title: 'Nonexistent' } });
      expect(row).toBeNull();
    });

    it('returns first row when no where clause', async () => {
      const row = await qe.findOne();
      expect(row).not.toBeNull();
      expect(row.id).toBe(1);
    });

    it('respects field selection', async () => {
      const row = await qe.findOne({ where: { id: 1 }, select: ['title', 'slug'] });
      expect(row.title).toBe('Hello World');
      expect(row.slug).toBe('hello-world');
      expect(row.content).toBeUndefined();
    });
  });

  describe('findMany', () => {
    it('returns all rows when no params', async () => {
      const rows = await qe.findMany();
      expect(rows).toHaveLength(5);
    });

    it('filters by where clause', async () => {
      const rows = await qe.findMany({ where: { published: 1 } });
      expect(rows).toHaveLength(3);
    });

    it('respects limit', async () => {
      const rows = await qe.findMany({ limit: 2 });
      expect(rows).toHaveLength(2);
    });

    it('respects offset', async () => {
      const rows = await qe.findMany({ limit: 2, offset: 3 });
      expect(rows).toHaveLength(2);
      expect(rows[0].id).toBe(4);
    });

    it('supports sorting by string', async () => {
      const rows = await qe.findMany({ orderBy: 'views:desc' });
      expect(rows[0].title).toBe('TypeScript Guide');
      expect(rows[0].views).toBe(250);
    });

    it('supports sorting by object', async () => {
      const rows = await qe.findMany({ orderBy: { views: 'asc' } });
      expect(rows[0].views).toBe(0);
    });

    it('supports multi-field sorting', async () => {
      const rows = await qe.findMany({ orderBy: [{ published: 'desc' }, { views: 'desc' }] });
      expect(rows[0].published).toBe(1);
      expect(rows[0].views).toBe(250);
    });
  });

  describe('findWithCount', () => {
    it('returns rows and total count', async () => {
      const [rows, count] = await qe.findWithCount({ where: { published: 1 } });
      expect(rows).toHaveLength(3);
      expect(count).toBe(3);
    });

    it('count is unaffected by limit', async () => {
      const [rows, count] = await qe.findWithCount({ where: { published: 1 }, limit: 1 });
      expect(rows).toHaveLength(1);
      expect(count).toBe(3);
    });
  });

  describe('findPage', () => {
    it('returns paginated results', async () => {
      const result = await qe.findPage({ pageSize: 2, page: 1 });
      expect(result.results).toHaveLength(2);
      expect(result.pagination.page).toBe(1);
      expect(result.pagination.pageSize).toBe(2);
      expect(result.pagination.total).toBe(5);
      expect(result.pagination.pageCount).toBe(3);
    });

    it('returns correct page 2', async () => {
      const result = await qe.findPage({ pageSize: 2, page: 2 });
      expect(result.results).toHaveLength(2);
      expect(result.results[0].id).toBe(3);
    });

    it('returns partial last page', async () => {
      const result = await qe.findPage({ pageSize: 2, page: 3 });
      expect(result.results).toHaveLength(1);
    });

    it('defaults to page=1, pageSize=25', async () => {
      const result = await qe.findPage();
      expect(result.pagination.page).toBe(1);
      expect(result.pagination.pageSize).toBe(25);
      expect(result.results).toHaveLength(5);
    });
  });

  describe('count', () => {
    it('counts all rows', async () => {
      expect(await qe.count()).toBe(5);
    });

    it('counts with filter', async () => {
      expect(await qe.count({ where: { published: 1 } })).toBe(3);
    });
  });

  describe('create', () => {
    it('inserts a new row and returns it', async () => {
      const now = new Date().toISOString();
      const row = await qe.create({
        data: {
          document_id: 'doc-6',
          title: 'New Article',
          slug: 'new-article',
          content: 'Fresh content',
          views: 0,
          published: 0,
          created_at: now,
          updated_at: now,
        },
      });

      expect(row.id).toBe(6);
      expect(row.title).toBe('New Article');
      expect(await qe.count()).toBe(6);
    });

    it('throws on empty data', async () => {
      await expect(qe.create({ data: {} })).rejects.toThrow('Cannot create with empty data');
    });
  });

  describe('createMany', () => {
    it('inserts multiple rows', async () => {
      const now = new Date().toISOString();
      const result = await qe.createMany({
        data: [
          { document_id: 'doc-6', title: 'Batch 1', slug: 'batch-1', created_at: now, updated_at: now },
          { document_id: 'doc-7', title: 'Batch 2', slug: 'batch-2', created_at: now, updated_at: now },
        ],
      });

      expect(result.count).toBe(2);
      expect(await qe.count()).toBe(7);
    });

    it('returns count 0 for empty array', async () => {
      const result = await qe.createMany({ data: [] });
      expect(result.count).toBe(0);
    });
  });

  describe('update', () => {
    it('updates a single row and returns it', async () => {
      const updated = await qe.update({
        where: { id: 1 },
        data: { title: 'Updated Title', views: 999 },
      });

      expect(updated).not.toBeNull();
      expect(updated.title).toBe('Updated Title');
      expect(updated.views).toBe(999);
    });

    it('returns null when no match', async () => {
      const updated = await qe.update({
        where: { id: 999 },
        data: { title: 'Nope' },
      });
      expect(updated).toBeNull();
    });
  });

  describe('updateMany', () => {
    it('updates multiple rows and returns count', async () => {
      const result = await qe.updateMany({
        where: { published: 0 },
        data: { published: 1, published_at: new Date().toISOString() },
      });

      expect(result.count).toBe(2);
      expect(await qe.count({ where: { published: 1 } })).toBe(5);
    });
  });

  describe('delete', () => {
    it('deletes a single row and returns it', async () => {
      const deleted = await qe.delete({ where: { id: 3 } });
      expect(deleted).not.toBeNull();
      expect(deleted.title).toBe('Draft Post');
      expect(await qe.count()).toBe(4);
    });

    it('returns null when no match', async () => {
      const deleted = await qe.delete({ where: { id: 999 } });
      expect(deleted).toBeNull();
    });
  });

  describe('deleteMany', () => {
    it('deletes multiple rows and returns count', async () => {
      const result = await qe.deleteMany({ where: { published: 0 } });
      expect(result.count).toBe(2);
      expect(await qe.count()).toBe(3);
    });
  });

  // -----------------------------------------------------------------------
  // Filter operators
  // -----------------------------------------------------------------------

  describe('filter operators', () => {
    it('$eq — equality', async () => {
      const rows = await qe.findMany({ where: { title: { $eq: 'Hello World' } } });
      expect(rows).toHaveLength(1);
    });

    it('$ne — not equal', async () => {
      const rows = await qe.findMany({ where: { locale: { $ne: 'en' } } });
      expect(rows).toHaveLength(1);
      expect(rows[0].locale).toBe('fr');
    });

    it('$gt — greater than', async () => {
      const rows = await qe.findMany({ where: { views: { $gt: 100 } } });
      expect(rows).toHaveLength(1);
      expect(rows[0].title).toBe('TypeScript Guide');
    });

    it('$gte — greater than or equal', async () => {
      const rows = await qe.findMany({ where: { views: { $gte: 100 } } });
      expect(rows).toHaveLength(2);
    });

    it('$lt — less than', async () => {
      const rows = await qe.findMany({ where: { views: { $lt: 50 } } });
      expect(rows).toHaveLength(2);
    });

    it('$lte — less than or equal', async () => {
      const rows = await qe.findMany({ where: { views: { $lte: 50 } } });
      expect(rows).toHaveLength(3);
    });

    it('$in — value in array', async () => {
      const rows = await qe.findMany({ where: { id: { $in: [1, 3, 5] } } });
      expect(rows).toHaveLength(3);
    });

    it('$in — empty array returns no results', async () => {
      const rows = await qe.findMany({ where: { id: { $in: [] } } });
      expect(rows).toHaveLength(0);
    });

    it('$notIn — value not in array', async () => {
      const rows = await qe.findMany({ where: { id: { $notIn: [1, 2] } } });
      expect(rows).toHaveLength(3);
    });

    it('$contains — LIKE %value%', async () => {
      const rows = await qe.findMany({ where: { title: { $contains: 'Guide' } } });
      expect(rows).toHaveLength(1);
      expect(rows[0].title).toBe('TypeScript Guide');
    });

    it('$containsi — case-insensitive LIKE', async () => {
      const rows = await qe.findMany({ where: { title: { $containsi: 'guide' } } });
      expect(rows).toHaveLength(1);
    });

    it('$notContains — NOT LIKE', async () => {
      const rows = await qe.findMany({ where: { title: { $notContains: 'Draft' } } });
      expect(rows).toHaveLength(3);
    });

    it('$startsWith — LIKE value%', async () => {
      const rows = await qe.findMany({ where: { title: { $startsWith: 'Hello' } } });
      expect(rows).toHaveLength(1);
    });

    it('$endsWith — LIKE %value', async () => {
      const rows = await qe.findMany({ where: { title: { $endsWith: 'Guide' } } });
      expect(rows).toHaveLength(1);
    });

    it('$null — IS NULL / IS NOT NULL', async () => {
      const nullRows = await qe.findMany({ where: { rating: { $null: true } } });
      expect(nullRows).toHaveLength(2);

      const nonNullRows = await qe.findMany({ where: { rating: { $null: false } } });
      expect(nonNullRows).toHaveLength(3);
    });

    it('$notNull — IS NOT NULL / IS NULL', async () => {
      const rows = await qe.findMany({ where: { published_at: { $notNull: true } } });
      expect(rows).toHaveLength(3);
    });

    it('$between — BETWEEN x AND y', async () => {
      const rows = await qe.findMany({ where: { views: { $between: [50, 150] } } });
      expect(rows).toHaveLength(2); // views=100, views=50
    });

    it('direct null equality', async () => {
      const rows = await qe.findMany({ where: { rating: null } });
      expect(rows).toHaveLength(2);
    });
  });

  // -----------------------------------------------------------------------
  // Logical operators
  // -----------------------------------------------------------------------

  describe('logical operators', () => {
    it('$and — all conditions must match', async () => {
      const rows = await qe.findMany({
        where: {
          $and: [
            { published: 1 },
            { locale: 'en' },
          ],
        },
      });
      expect(rows).toHaveLength(2);
    });

    it('$or — any condition can match', async () => {
      const rows = await qe.findMany({
        where: {
          $or: [
            { title: 'Hello World' },
            { title: 'Draft Post' },
          ],
        },
      });
      expect(rows).toHaveLength(2);
    });

    it('$not — negation', async () => {
      const rows = await qe.findMany({
        where: {
          $not: { published: 1 },
        },
      });
      expect(rows).toHaveLength(2);
    });

    it('nested logical operators', async () => {
      const rows = await qe.findMany({
        where: {
          $and: [
            {
              $or: [
                { locale: 'en' },
                { locale: 'fr' },
              ],
            },
            { published: 1 },
          ],
        },
      });
      expect(rows).toHaveLength(3);
    });
  });
});
