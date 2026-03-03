/**
 * Content Manager Service.
 *
 * High-level service for admin-side content CRUD operations.
 * Handles collection types and single types, with draft/publish support.
 */

import { randomBytes } from 'node:crypto';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ContentEntry {
  id?: number;
  documentId: string;
  locale?: string | null;
  status: 'draft' | 'published';
  publishedAt: string | null;
  firstPublishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy?: number | null;
  updatedBy?: number | null;
  [key: string]: any;
}

export interface ContentType {
  uid: string;
  kind: 'collectionType' | 'singleType';
  info: {
    singularName: string;
    pluralName: string;
    displayName: string;
    description?: string;
  };
  options?: {
    draftAndPublish?: boolean;
  };
  attributes: Record<string, AttributeDefinition>;
}

export interface AttributeDefinition {
  type: string;
  required?: boolean;
  unique?: boolean;
  default?: any;
  private?: boolean;
  [key: string]: any;
}

export interface FindManyParams {
  page?: number;
  pageSize?: number;
  sort?: string;
  filters?: Record<string, any>;
  status?: 'draft' | 'published';
  locale?: string;
}

export interface ContentManagerService {
  /** Register a content type */
  registerContentType(contentType: ContentType): void;
  /** Get a registered content type */
  getContentType(uid: string): ContentType | null;
  /** Get all registered content types */
  getAllContentTypes(): ContentType[];

  // Collection type operations
  findMany(uid: string, params?: FindManyParams): { results: ContentEntry[]; pagination: { page: number; pageSize: number; pageCount: number; total: number } };
  findOne(uid: string, documentId: string, params?: { status?: 'draft' | 'published'; locale?: string }): ContentEntry | null;
  create(uid: string, data: Record<string, any>, params?: { locale?: string; createdBy?: number }): ContentEntry;
  update(uid: string, documentId: string, data: Record<string, any>, params?: { locale?: string; updatedBy?: number }): ContentEntry | null;
  delete(uid: string, documentId: string, params?: { locale?: string }): boolean;
  count(uid: string, params?: { status?: 'draft' | 'published'; locale?: string }): number;

  // Draft/Publish operations
  publish(uid: string, documentId: string, params?: { locale?: string; publishedBy?: number }): ContentEntry | null;
  unpublish(uid: string, documentId: string, params?: { locale?: string }): ContentEntry | null;
  discardDraft(uid: string, documentId: string, params?: { locale?: string }): ContentEntry | null;

  // Single type operations
  findSingle(uid: string, params?: { status?: 'draft' | 'published'; locale?: string }): ContentEntry | null;
  createOrUpdateSingle(uid: string, data: Record<string, any>, params?: { locale?: string; updatedBy?: number }): ContentEntry;
  deleteSingle(uid: string, params?: { locale?: string }): boolean;
}

export interface ContentManagerServiceConfig {
  rawDb: any;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateDocumentId(): string {
  return randomBytes(16).toString('hex');
}

function buildColumnDefs(attributes: Record<string, AttributeDefinition>): string {
  const cols: string[] = [];
  for (const [name, attr] of Object.entries(attributes)) {
    switch (attr.type) {
      case 'string':
      case 'text':
      case 'richtext':
      case 'email':
      case 'uid':
      case 'enumeration':
        cols.push(`"${name}" TEXT`);
        break;
      case 'integer':
        cols.push(`"${name}" INTEGER`);
        break;
      case 'biginteger':
      case 'float':
      case 'decimal':
        cols.push(`"${name}" REAL`);
        break;
      case 'boolean':
        cols.push(`"${name}" INTEGER`);
        break;
      case 'date':
      case 'time':
      case 'datetime':
        cols.push(`"${name}" TEXT`);
        break;
      case 'json':
      case 'blocks':
        cols.push(`"${name}" TEXT`);
        break;
      case 'password':
        cols.push(`"${name}" TEXT`);
        break;
      default:
        cols.push(`"${name}" TEXT`);
        break;
    }
  }
  return cols.join(',\n    ');
}

// ---------------------------------------------------------------------------
// Service factory
// ---------------------------------------------------------------------------

export function createContentManagerService(config: ContentManagerServiceConfig): ContentManagerService {
  const { rawDb } = config;
  const contentTypes = new Map<string, ContentType>();
  const ensuredTables = new Set<string>();

  function tableName(uid: string): string {
    const ct = contentTypes.get(uid);
    if (!ct) throw new Error(`Content type '${uid}' not registered`);
    return ct.info.pluralName.replace(/-/g, '_');
  }

  function hasDraftAndPublish(uid: string): boolean {
    const ct = contentTypes.get(uid);
    return ct?.options?.draftAndPublish !== false;
  }

  function ensureTable(uid: string): void {
    if (ensuredTables.has(uid)) return;
    const ct = contentTypes.get(uid);
    if (!ct) throw new Error(`Content type '${uid}' not registered`);

    const tbl = tableName(uid);
    const customCols = buildColumnDefs(ct.attributes);

    rawDb.exec(`CREATE TABLE IF NOT EXISTS "${tbl}" (
    "id" INTEGER PRIMARY KEY AUTOINCREMENT,
    "document_id" VARCHAR(255) NOT NULL,
    "locale" VARCHAR(10),
    "status" VARCHAR(20) NOT NULL DEFAULT 'draft',
    "published_at" TEXT,
    "first_published_at" TEXT,
    "created_at" TEXT NOT NULL,
    "updated_at" TEXT NOT NULL,
    "created_by" INTEGER,
    "updated_by" INTEGER${customCols ? ',\n    ' + customCols : ''}
  )`);

    rawDb.exec(`CREATE INDEX IF NOT EXISTS "idx_${tbl}_document_id" ON "${tbl}" ("document_id")`);
    rawDb.exec(`CREATE INDEX IF NOT EXISTS "idx_${tbl}_status" ON "${tbl}" ("status")`);
    rawDb.exec(`CREATE INDEX IF NOT EXISTS "idx_${tbl}_locale" ON "${tbl}" ("locale")`);

    ensuredTables.add(uid);
  }

  function rowToEntry(row: any, ct: ContentType): ContentEntry {
    const entry: ContentEntry = {
      id: row.id,
      documentId: row.document_id,
      locale: row.locale || null,
      status: row.status,
      publishedAt: row.published_at,
      firstPublishedAt: row.first_published_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      createdBy: row.created_by,
      updatedBy: row.updated_by,
    };

    for (const [name, attr] of Object.entries(ct.attributes)) {
      if (attr.private) continue; // skip private fields
      let val = row[name];
      if (attr.type === 'boolean' && val !== null && val !== undefined) {
        val = val === 1 || val === true;
      }
      if ((attr.type === 'json' || attr.type === 'blocks') && typeof val === 'string') {
        try { val = JSON.parse(val); } catch { /* keep as string */ }
      }
      entry[name] = val ?? null;
    }

    return entry;
  }

  function extractUserColumns(data: Record<string, any>, ct: ContentType): { cols: string[]; placeholders: string[]; values: any[] } {
    const cols: string[] = [];
    const placeholders: string[] = [];
    const values: any[] = [];

    for (const [name, attr] of Object.entries(ct.attributes)) {
      if (data[name] !== undefined) {
        cols.push(`"${name}"`);
        placeholders.push('?');
        let val = data[name];
        if (attr.type === 'boolean') val = val ? 1 : 0;
        if ((attr.type === 'json' || attr.type === 'blocks') && typeof val === 'object') val = JSON.stringify(val);
        values.push(val);
      }
    }

    return { cols, placeholders, values };
  }

  return {
    registerContentType(contentType) {
      contentTypes.set(contentType.uid, contentType);
      ensureTable(contentType.uid);
    },

    getContentType(uid) {
      return contentTypes.get(uid) || null;
    },

    getAllContentTypes() {
      return Array.from(contentTypes.values());
    },

    findMany(uid, params = {}) {
      ensureTable(uid);
      const ct = contentTypes.get(uid)!;
      const tbl = tableName(uid);
      const page = params.page || 1;
      const pageSize = params.pageSize || 10;
      const offset = (page - 1) * pageSize;

      // Default: admin API shows drafts, but allow override
      const status = params.status || 'draft';

      const conditions: string[] = [];
      const values: any[] = [];

      if (hasDraftAndPublish(uid)) {
        conditions.push('status = ?');
        values.push(status);
      }

      if (params.locale) {
        conditions.push('locale = ?');
        values.push(params.locale);
      }

      if (params.filters) {
        for (const [key, val] of Object.entries(params.filters)) {
          if (ct.attributes[key]) {
            conditions.push(`"${key}" = ?`);
            values.push(val);
          }
        }
      }

      const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      let orderBy = 'ORDER BY id DESC';
      if (params.sort) {
        const parts = params.sort.split(':');
        const col = parts[0];
        const dir = (parts[1] || 'asc').toUpperCase();
        if (col === 'createdAt') orderBy = `ORDER BY created_at ${dir}`;
        else if (col === 'updatedAt') orderBy = `ORDER BY updated_at ${dir}`;
        else if (ct.attributes[col]) orderBy = `ORDER BY "${col}" ${dir}`;
      }

      const countResult = rawDb.prepare(`SELECT COUNT(*) as cnt FROM "${tbl}" ${where}`).get(...values);
      const total = countResult.cnt;
      const pageCount = Math.ceil(total / pageSize);

      const rows = rawDb.prepare(
        `SELECT * FROM "${tbl}" ${where} ${orderBy} LIMIT ? OFFSET ?`,
      ).all(...values, pageSize, offset);

      return {
        results: rows.map((r: any) => rowToEntry(r, ct)),
        pagination: { page, pageSize, pageCount, total },
      };
    },

    findOne(uid, documentId, params = {}) {
      ensureTable(uid);
      const ct = contentTypes.get(uid)!;
      const tbl = tableName(uid);

      const conditions: string[] = ['document_id = ?'];
      const values: any[] = [documentId];

      if (hasDraftAndPublish(uid)) {
        conditions.push('status = ?');
        values.push(params.status || 'draft');
      }

      if (params.locale) {
        conditions.push('locale = ?');
        values.push(params.locale);
      }

      const row = rawDb.prepare(
        `SELECT * FROM "${tbl}" WHERE ${conditions.join(' AND ')} LIMIT 1`,
      ).get(...values);

      return row ? rowToEntry(row, ct) : null;
    },

    create(uid, data, params = {}) {
      ensureTable(uid);
      const ct = contentTypes.get(uid)!;
      const tbl = tableName(uid);
      const now = new Date().toISOString();
      const documentId = generateDocumentId();

      const { cols, placeholders, values } = extractUserColumns(data, ct);

      cols.push('"document_id"', '"status"', '"created_at"', '"updated_at"');
      placeholders.push('?', '?', '?', '?');
      values.push(documentId, 'draft', now, now);

      if (params.locale) {
        cols.push('"locale"');
        placeholders.push('?');
        values.push(params.locale);
      }

      if (params.createdBy) {
        cols.push('"created_by"', '"updated_by"');
        placeholders.push('?', '?');
        values.push(params.createdBy, params.createdBy);
      }

      const result = rawDb.prepare(
        `INSERT INTO "${tbl}" (${cols.join(', ')}) VALUES (${placeholders.join(', ')})`,
      ).run(...values);

      const row = rawDb.prepare(`SELECT * FROM "${tbl}" WHERE id = ?`).get(result.lastInsertRowid);
      return rowToEntry(row, ct);
    },

    update(uid, documentId, data, params = {}) {
      ensureTable(uid);
      const ct = contentTypes.get(uid)!;
      const tbl = tableName(uid);
      const now = new Date().toISOString();

      // Find the draft row
      const conditions: string[] = ['document_id = ?', 'status = ?'];
      const findValues: any[] = [documentId, 'draft'];

      if (params.locale) {
        conditions.push('locale = ?');
        findValues.push(params.locale);
      }

      const existing = rawDb.prepare(
        `SELECT id FROM "${tbl}" WHERE ${conditions.join(' AND ')} LIMIT 1`,
      ).get(...findValues);

      if (!existing) return null;

      const sets: string[] = ['"updated_at" = ?'];
      const values: any[] = [now];

      if (params.updatedBy) {
        sets.push('"updated_by" = ?');
        values.push(params.updatedBy);
      }

      for (const [name, attr] of Object.entries(ct.attributes)) {
        if (data[name] !== undefined) {
          sets.push(`"${name}" = ?`);
          let val = data[name];
          if (attr.type === 'boolean') val = val ? 1 : 0;
          if ((attr.type === 'json' || attr.type === 'blocks') && typeof val === 'object') val = JSON.stringify(val);
          values.push(val);
        }
      }

      values.push(existing.id);
      rawDb.prepare(`UPDATE "${tbl}" SET ${sets.join(', ')} WHERE id = ?`).run(...values);

      const row = rawDb.prepare(`SELECT * FROM "${tbl}" WHERE id = ?`).get(existing.id);
      return rowToEntry(row, ct);
    },

    delete(uid, documentId, params = {}) {
      ensureTable(uid);
      const tbl = tableName(uid);

      const conditions: string[] = ['document_id = ?'];
      const values: any[] = [documentId];

      if (params.locale) {
        conditions.push('locale = ?');
        values.push(params.locale);
      }

      // Delete both draft and published rows
      const result = rawDb.prepare(
        `DELETE FROM "${tbl}" WHERE ${conditions.join(' AND ')}`,
      ).run(...values);

      return result.changes > 0;
    },

    count(uid, params = {}) {
      ensureTable(uid);
      const tbl = tableName(uid);

      const conditions: string[] = [];
      const values: any[] = [];

      if (hasDraftAndPublish(uid) && params.status) {
        conditions.push('status = ?');
        values.push(params.status);
      }

      if (params.locale) {
        conditions.push('locale = ?');
        values.push(params.locale);
      }

      const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      const result = rawDb.prepare(`SELECT COUNT(*) as cnt FROM "${tbl}" ${where}`).get(...values);
      return result.cnt;
    },

    publish(uid, documentId, params = {}) {
      ensureTable(uid);
      const ct = contentTypes.get(uid)!;
      if (!hasDraftAndPublish(uid)) return null;

      const tbl = tableName(uid);
      const now = new Date().toISOString();

      // Find the draft entry
      const draftConditions: string[] = ['document_id = ?', 'status = ?'];
      const draftValues: any[] = [documentId, 'draft'];

      if (params.locale) {
        draftConditions.push('locale = ?');
        draftValues.push(params.locale);
      }

      const draft = rawDb.prepare(
        `SELECT * FROM "${tbl}" WHERE ${draftConditions.join(' AND ')} LIMIT 1`,
      ).get(...draftValues);

      if (!draft) return null;

      // Check if a published row already exists
      const pubConditions: string[] = ['document_id = ?', 'status = ?'];
      const pubValues: any[] = [documentId, 'published'];

      if (params.locale) {
        pubConditions.push('locale = ?');
        pubValues.push(params.locale);
      }

      const existingPub = rawDb.prepare(
        `SELECT id FROM "${tbl}" WHERE ${pubConditions.join(' AND ')} LIMIT 1`,
      ).get(...pubValues);

      // Build column values from draft
      const userCols: string[] = [];
      const userVals: any[] = [];
      for (const name of Object.keys(ct.attributes)) {
        if (draft[name] !== undefined) {
          userCols.push(name);
          userVals.push(draft[name]);
        }
      }

      if (existingPub) {
        // Update existing published row with draft data
        const sets = userCols.map(c => `"${c}" = ?`);
        sets.push('"published_at" = ?', '"updated_at" = ?', '"updated_by" = ?');
        const vals = [...userVals, now, now, params.publishedBy || draft.updated_by];
        vals.push(existingPub.id);
        rawDb.prepare(`UPDATE "${tbl}" SET ${sets.join(', ')} WHERE id = ?`).run(...vals);

        const row = rawDb.prepare(`SELECT * FROM "${tbl}" WHERE id = ?`).get(existingPub.id);
        return rowToEntry(row, ct);
      } else {
        // Create new published row
        const cols = [
          ...userCols.map(c => `"${c}"`),
          '"document_id"', '"locale"', '"status"', '"published_at"', '"first_published_at"',
          '"created_at"', '"updated_at"', '"created_by"', '"updated_by"',
        ];
        const placeholders = cols.map(() => '?');
        const vals = [
          ...userVals,
          documentId, draft.locale, 'published', now, now,
          now, now, draft.created_by, params.publishedBy || draft.updated_by,
        ];

        const result = rawDb.prepare(
          `INSERT INTO "${tbl}" (${cols.join(', ')}) VALUES (${placeholders.join(', ')})`,
        ).run(...vals);

        // Also update first_published_at on the draft if not set
        if (!draft.first_published_at) {
          rawDb.prepare(
            `UPDATE "${tbl}" SET first_published_at = ? WHERE id = ?`,
          ).run(now, draft.id);
        }

        const row = rawDb.prepare(`SELECT * FROM "${tbl}" WHERE id = ?`).get(result.lastInsertRowid);
        return rowToEntry(row, ct);
      }
    },

    unpublish(uid, documentId, params = {}) {
      ensureTable(uid);
      const ct = contentTypes.get(uid)!;
      if (!hasDraftAndPublish(uid)) return null;

      const tbl = tableName(uid);

      const conditions: string[] = ['document_id = ?', 'status = ?'];
      const values: any[] = [documentId, 'published'];

      if (params.locale) {
        conditions.push('locale = ?');
        values.push(params.locale);
      }

      // Get the draft so we can return it
      const draftConditions: string[] = ['document_id = ?', 'status = ?'];
      const draftValues: any[] = [documentId, 'draft'];
      if (params.locale) {
        draftConditions.push('locale = ?');
        draftValues.push(params.locale);
      }
      const draft = rawDb.prepare(
        `SELECT * FROM "${tbl}" WHERE ${draftConditions.join(' AND ')} LIMIT 1`,
      ).get(...draftValues);

      // Delete the published row
      const result = rawDb.prepare(
        `DELETE FROM "${tbl}" WHERE ${conditions.join(' AND ')}`,
      ).run(...values);

      if (result.changes === 0) return null;

      return draft ? rowToEntry(draft, ct) : null;
    },

    discardDraft(uid, documentId, params = {}) {
      ensureTable(uid);
      const ct = contentTypes.get(uid)!;
      if (!hasDraftAndPublish(uid)) return null;

      const tbl = tableName(uid);
      const now = new Date().toISOString();

      // Find published version
      const pubConditions: string[] = ['document_id = ?', 'status = ?'];
      const pubValues: any[] = [documentId, 'published'];
      if (params.locale) {
        pubConditions.push('locale = ?');
        pubValues.push(params.locale);
      }

      const published = rawDb.prepare(
        `SELECT * FROM "${tbl}" WHERE ${pubConditions.join(' AND ')} LIMIT 1`,
      ).get(...pubValues);

      if (!published) return null; // No published version to reset to

      // Find draft version
      const draftConditions: string[] = ['document_id = ?', 'status = ?'];
      const draftValues: any[] = [documentId, 'draft'];
      if (params.locale) {
        draftConditions.push('locale = ?');
        draftValues.push(params.locale);
      }

      const draft = rawDb.prepare(
        `SELECT * FROM "${tbl}" WHERE ${draftConditions.join(' AND ')} LIMIT 1`,
      ).get(...draftValues);

      if (!draft) return null;

      // Reset draft data to published data
      const sets: string[] = ['"updated_at" = ?'];
      const vals: any[] = [now];

      for (const name of Object.keys(ct.attributes)) {
        sets.push(`"${name}" = ?`);
        vals.push(published[name] ?? null);
      }

      vals.push(draft.id);
      rawDb.prepare(`UPDATE "${tbl}" SET ${sets.join(', ')} WHERE id = ?`).run(...vals);

      const row = rawDb.prepare(`SELECT * FROM "${tbl}" WHERE id = ?`).get(draft.id);
      return rowToEntry(row, ct);
    },

    // Single type operations
    findSingle(uid, params = {}) {
      ensureTable(uid);
      const ct = contentTypes.get(uid)!;
      const tbl = tableName(uid);

      const conditions: string[] = [];
      const values: any[] = [];

      if (hasDraftAndPublish(uid)) {
        conditions.push('status = ?');
        values.push(params.status || 'draft');
      }

      if (params.locale) {
        conditions.push('locale = ?');
        values.push(params.locale);
      }

      const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      const row = rawDb.prepare(`SELECT * FROM "${tbl}" ${where} LIMIT 1`).get(...values);
      return row ? rowToEntry(row, ct) : null;
    },

    createOrUpdateSingle(uid, data, params = {}) {
      ensureTable(uid);
      const ct = contentTypes.get(uid)!;
      const tbl = tableName(uid);

      const conditions: string[] = ['status = ?'];
      const findValues: any[] = ['draft'];

      if (params.locale) {
        conditions.push('locale = ?');
        findValues.push(params.locale);
      }

      const existing = rawDb.prepare(
        `SELECT * FROM "${tbl}" WHERE ${conditions.join(' AND ')} LIMIT 1`,
      ).get(...findValues);

      if (existing) {
        // Update
        const now = new Date().toISOString();
        const sets: string[] = ['"updated_at" = ?'];
        const vals: any[] = [now];

        if (params.updatedBy) {
          sets.push('"updated_by" = ?');
          vals.push(params.updatedBy);
        }

        for (const [name, attr] of Object.entries(ct.attributes)) {
          if (data[name] !== undefined) {
            sets.push(`"${name}" = ?`);
            let val = data[name];
            if (attr.type === 'boolean') val = val ? 1 : 0;
            if ((attr.type === 'json' || attr.type === 'blocks') && typeof val === 'object') val = JSON.stringify(val);
            vals.push(val);
          }
        }

        vals.push(existing.id);
        rawDb.prepare(`UPDATE "${tbl}" SET ${sets.join(', ')} WHERE id = ?`).run(...vals);

        const row = rawDb.prepare(`SELECT * FROM "${tbl}" WHERE id = ?`).get(existing.id);
        return rowToEntry(row, ct);
      } else {
        // Create
        return this.create(uid, data, params);
      }
    },

    deleteSingle(uid, params = {}) {
      ensureTable(uid);
      const tbl = tableName(uid);

      const conditions: string[] = [];
      const values: any[] = [];

      if (params.locale) {
        conditions.push('locale = ?');
        values.push(params.locale);
      }

      const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      const result = rawDb.prepare(`DELETE FROM "${tbl}" ${where}`).run(...values);
      return result.changes > 0;
    },
  };
}
