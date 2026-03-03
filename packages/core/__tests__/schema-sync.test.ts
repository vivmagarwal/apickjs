import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { syncSchemas } from '../src/database/sync/index.js';
import { fieldToSqliteColumn, getSystemColumns } from '../src/database/schema/field-mappings.js';
import { createLogger } from '../src/logging/index.js';

const logger = createLogger({ level: 'silent' });

describe('Schema Sync', () => {
  let db: any;

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
  });

  afterEach(() => {
    db.close();
  });

  it('creates a table from content type definition', () => {
    const contentTypes = {
      'api::article.article': {
        collectionName: 'articles',
        attributes: {
          title: { type: 'string', required: true },
          content: { type: 'richtext' },
          slug: { type: 'uid' },
        },
      },
    };

    syncSchemas(db, contentTypes, logger);

    // Verify table exists
    const table = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='articles'`).get();
    expect(table).toBeDefined();
    expect(table.name).toBe('articles');

    // Verify columns
    const columns = db.prepare(`PRAGMA table_info("articles")`).all();
    const columnNames = columns.map((c: any) => c.name);

    expect(columnNames).toContain('id');
    expect(columnNames).toContain('document_id');
    expect(columnNames).toContain('title');
    expect(columnNames).toContain('content');
    expect(columnNames).toContain('slug');
    expect(columnNames).toContain('created_at');
    expect(columnNames).toContain('updated_at');
  });

  it('creates document_id index', () => {
    syncSchemas(db, {
      'api::post.post': {
        collectionName: 'posts',
        attributes: { title: { type: 'string' } },
      },
    }, logger);

    const indexes = db.prepare(`SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='posts'`).all();
    const indexNames = indexes.map((i: any) => i.name);
    expect(indexNames).toContain('idx_posts_document_id');
  });

  it('falls back to pluralName for table name', () => {
    syncSchemas(db, {
      'api::category.category': {
        info: { pluralName: 'categories' },
        attributes: { name: { type: 'string' } },
      },
    }, logger);

    const table = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='categories'`).get();
    expect(table).toBeDefined();
  });

  it('falls back to last UID segment for table name', () => {
    syncSchemas(db, {
      'api::tag.tag': {
        attributes: { name: { type: 'string' } },
      },
    }, logger);

    const table = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='tag'`).get();
    expect(table).toBeDefined();
  });

  it('adds missing columns to existing table', () => {
    // Create table with just system columns + title
    db.exec(`CREATE TABLE "articles" (
      "id" INTEGER PRIMARY KEY AUTOINCREMENT,
      "document_id" VARCHAR(255) NOT NULL,
      "title" VARCHAR(255),
      "created_at" TEXT NOT NULL,
      "updated_at" TEXT NOT NULL,
      "published_at" TEXT,
      "first_published_at" TEXT,
      "created_by" INTEGER,
      "updated_by" INTEGER,
      "locale" VARCHAR(10)
    )`);

    // Sync with additional fields
    syncSchemas(db, {
      'api::article.article': {
        collectionName: 'articles',
        attributes: {
          title: { type: 'string' },
          content: { type: 'richtext' },
          views: { type: 'integer' },
        },
      },
    }, logger);

    const columns = db.prepare(`PRAGMA table_info("articles")`).all();
    const columnNames = columns.map((c: any) => c.name);

    expect(columnNames).toContain('content');
    expect(columnNames).toContain('views');
  });

  it('does not error on columns that already exist', () => {
    syncSchemas(db, {
      'api::article.article': {
        collectionName: 'articles',
        attributes: { title: { type: 'string' } },
      },
    }, logger);

    // Re-sync with same schema — should not error
    expect(() => {
      syncSchemas(db, {
        'api::article.article': {
          collectionName: 'articles',
          attributes: { title: { type: 'string' } },
        },
      }, logger);
    }).not.toThrow();
  });

  it('handles multiple content types', () => {
    syncSchemas(db, {
      'api::article.article': {
        collectionName: 'articles',
        attributes: { title: { type: 'string' } },
      },
      'api::category.category': {
        collectionName: 'categories',
        attributes: { name: { type: 'string' } },
      },
    }, logger);

    const tables = db.prepare(`SELECT name FROM sqlite_master WHERE type='table'`).all();
    const tableNames = tables.map((t: any) => t.name);
    expect(tableNames).toContain('articles');
    expect(tableNames).toContain('categories');
  });

  it('skips relation/media/component fields', () => {
    syncSchemas(db, {
      'api::article.article': {
        collectionName: 'articles',
        attributes: {
          title: { type: 'string' },
          author: { type: 'relation' },
          cover: { type: 'media' },
          seo: { type: 'component' },
        },
      },
    }, logger);

    const columns = db.prepare(`PRAGMA table_info("articles")`).all();
    const columnNames = columns.map((c: any) => c.name);

    expect(columnNames).toContain('title');
    expect(columnNames).not.toContain('author');
    expect(columnNames).not.toContain('cover');
    expect(columnNames).not.toContain('seo');
  });
});

describe('Field Mappings', () => {
  it('maps string types to VARCHAR(255)', () => {
    const col = fieldToSqliteColumn('email', { type: 'email' });
    expect(col.sql).toContain('VARCHAR(255)');
  });

  it('maps text/richtext to TEXT', () => {
    expect(fieldToSqliteColumn('body', { type: 'text' }).sql).toContain('TEXT');
    expect(fieldToSqliteColumn('body', { type: 'richtext' }).sql).toContain('TEXT');
  });

  it('maps integer to INTEGER', () => {
    expect(fieldToSqliteColumn('count', { type: 'integer' }).sql).toContain('INTEGER');
  });

  it('maps boolean to INTEGER', () => {
    expect(fieldToSqliteColumn('active', { type: 'boolean' }).sql).toContain('INTEGER');
  });

  it('maps float/decimal to REAL', () => {
    expect(fieldToSqliteColumn('price', { type: 'float' }).sql).toContain('REAL');
    expect(fieldToSqliteColumn('price', { type: 'decimal' }).sql).toContain('REAL');
  });

  it('maps date/datetime/time to TEXT', () => {
    expect(fieldToSqliteColumn('date', { type: 'date' }).sql).toContain('TEXT');
    expect(fieldToSqliteColumn('ts', { type: 'datetime' }).sql).toContain('TEXT');
  });

  it('maps json/blocks to TEXT', () => {
    expect(fieldToSqliteColumn('data', { type: 'json' }).sql).toContain('TEXT');
    expect(fieldToSqliteColumn('blocks', { type: 'blocks' }).sql).toContain('TEXT');
  });

  it('adds NOT NULL for required fields', () => {
    const col = fieldToSqliteColumn('title', { type: 'string', required: true });
    expect(col.sql).toContain('NOT NULL');
    expect(col.nullable).toBe(false);
  });

  it('adds UNIQUE constraint', () => {
    const col = fieldToSqliteColumn('slug', { type: 'string', unique: true });
    expect(col.sql).toContain('UNIQUE');
  });

  it('adds DEFAULT for strings', () => {
    const col = fieldToSqliteColumn('status', { type: 'string', default: 'draft' });
    expect(col.sql).toContain("DEFAULT 'draft'");
  });

  it('adds DEFAULT for booleans (as 0/1)', () => {
    const col = fieldToSqliteColumn('active', { type: 'boolean', default: true });
    expect(col.sql).toContain('DEFAULT 1');
  });

  it('adds DEFAULT for numbers', () => {
    const col = fieldToSqliteColumn('views', { type: 'integer', default: 0 });
    expect(col.sql).toContain('DEFAULT 0');
  });

  it('returns empty sql for relation types', () => {
    expect(fieldToSqliteColumn('author', { type: 'relation' }).sql).toBe('');
    expect(fieldToSqliteColumn('cover', { type: 'media' }).sql).toBe('');
    expect(fieldToSqliteColumn('seo', { type: 'component' }).sql).toBe('');
    expect(fieldToSqliteColumn('blocks', { type: 'dynamiczone' }).sql).toBe('');
  });

  it('escapes single quotes in default values', () => {
    const col = fieldToSqliteColumn('desc', { type: 'string', default: "it's" });
    expect(col.sql).toContain("DEFAULT 'it''s'");
  });

  it('getSystemColumns returns expected columns', () => {
    const cols = getSystemColumns();
    expect(cols).toContain('"id" INTEGER PRIMARY KEY AUTOINCREMENT');
    expect(cols).toContain('"document_id" VARCHAR(255) NOT NULL');
    expect(cols).toContain('"created_at" TEXT NOT NULL');
    expect(cols).toContain('"updated_at" TEXT NOT NULL');
    expect(cols).toContain('"published_at" TEXT');
    expect(cols).toContain('"locale" VARCHAR(10)');
  });
});
