/**
 * Content History Service.
 *
 * Tracks versions of content documents as full snapshots,
 * enabling point-in-time restore with schema-aware diffing.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface HistoryVersion {
  id?: number;
  contentType: string;
  relatedDocumentId: string;
  locale: string | null;
  status: string;
  data: Record<string, any>;
  schema: Record<string, any>;
  createdBy: number | null;
  createdAt: string;
}

export interface RestoreResult {
  entry: Record<string, any>;
  unknowns: {
    added: string[];
    removed: string[];
    changed: string[];
  };
}

export interface HistoryService {
  /** Create a version snapshot */
  createVersion(params: {
    contentType: string;
    relatedDocumentId: string;
    locale?: string | null;
    status: string;
    data: Record<string, any>;
    schema: Record<string, any>;
    createdBy?: number | null;
  }): HistoryVersion;

  /** List versions for a document with pagination */
  findVersionsPage(params: {
    contentType: string;
    relatedDocumentId: string;
    locale?: string | null;
    page?: number;
    pageSize?: number;
  }): { results: HistoryVersion[]; pagination: { page: number; pageSize: number; pageCount: number; total: number } };

  /** Get a single version by ID */
  findOne(id: number): HistoryVersion | null;

  /** Restore a version, returning the restored data and schema differences */
  restoreVersion(versionId: number, currentSchema: Record<string, any>): RestoreResult | null;

  /** Delete versions older than the given date */
  deleteExpired(beforeDate: string): number;

  /** Count versions for a document */
  countVersions(contentType: string, relatedDocumentId: string): number;
}

export interface HistoryServiceConfig {
  rawDb: any;
}

// ---------------------------------------------------------------------------
// Table setup
// ---------------------------------------------------------------------------

function ensureTables(db: any): void {
  db.exec(`CREATE TABLE IF NOT EXISTS "content_history_versions" (
    "id" INTEGER PRIMARY KEY AUTOINCREMENT,
    "content_type" VARCHAR(255) NOT NULL,
    "related_document_id" VARCHAR(255) NOT NULL,
    "locale" VARCHAR(10),
    "status" VARCHAR(20) NOT NULL DEFAULT 'draft',
    "data" TEXT NOT NULL DEFAULT '{}',
    "schema" TEXT NOT NULL DEFAULT '{}',
    "created_by" INTEGER,
    "created_at" TEXT NOT NULL
  )`);

  db.exec(`CREATE INDEX IF NOT EXISTS "idx_history_document" ON "content_history_versions" ("content_type", "related_document_id")`);
  db.exec(`CREATE INDEX IF NOT EXISTS "idx_history_created" ON "content_history_versions" ("created_at")`);
}

// ---------------------------------------------------------------------------
// Row mapping
// ---------------------------------------------------------------------------

function rowToVersion(row: any): HistoryVersion {
  return {
    id: row.id,
    contentType: row.content_type,
    relatedDocumentId: row.related_document_id,
    locale: row.locale || null,
    status: row.status,
    data: typeof row.data === 'string' ? JSON.parse(row.data) : row.data,
    schema: typeof row.schema === 'string' ? JSON.parse(row.schema) : row.schema,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

// ---------------------------------------------------------------------------
// Schema diffing
// ---------------------------------------------------------------------------

function diffSchemas(
  versionSchema: Record<string, any>,
  currentSchema: Record<string, any>,
): { added: string[]; removed: string[]; changed: string[] } {
  const versionAttrs = versionSchema.attributes || {};
  const currentAttrs = currentSchema.attributes || {};

  const added: string[] = [];
  const removed: string[] = [];
  const changed: string[] = [];

  // Fields in current but not in version = added since snapshot
  for (const key of Object.keys(currentAttrs)) {
    if (!(key in versionAttrs)) {
      added.push(key);
    } else if (currentAttrs[key].type !== versionAttrs[key].type) {
      changed.push(key);
    }
  }

  // Fields in version but not in current = removed since snapshot
  for (const key of Object.keys(versionAttrs)) {
    if (!(key in currentAttrs)) {
      removed.push(key);
    }
  }

  return { added, removed, changed };
}

// ---------------------------------------------------------------------------
// Service factory
// ---------------------------------------------------------------------------

export function createHistoryService(config: HistoryServiceConfig): HistoryService {
  const { rawDb } = config;
  ensureTables(rawDb);

  return {
    createVersion(params) {
      const now = new Date().toISOString();

      const result = rawDb.prepare(`
        INSERT INTO "content_history_versions"
        (content_type, related_document_id, locale, status, data, schema, created_by, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        params.contentType,
        params.relatedDocumentId,
        params.locale || null,
        params.status,
        JSON.stringify(params.data),
        JSON.stringify(params.schema),
        params.createdBy || null,
        now,
      );

      return this.findOne(result.lastInsertRowid as number)!;
    },

    findVersionsPage(params) {
      const page = params.page || 1;
      const pageSize = params.pageSize || 20;
      const offset = (page - 1) * pageSize;

      const conditions: string[] = ['content_type = ?', 'related_document_id = ?'];
      const values: any[] = [params.contentType, params.relatedDocumentId];

      if (params.locale) {
        conditions.push('locale = ?');
        values.push(params.locale);
      }

      const where = `WHERE ${conditions.join(' AND ')}`;

      const countResult = rawDb.prepare(
        `SELECT COUNT(*) as cnt FROM "content_history_versions" ${where}`,
      ).get(...values);
      const total = countResult.cnt;
      const pageCount = Math.ceil(total / pageSize);

      const rows = rawDb.prepare(
        `SELECT * FROM "content_history_versions" ${where} ORDER BY id DESC LIMIT ? OFFSET ?`,
      ).all(...values, pageSize, offset);

      return {
        results: rows.map(rowToVersion),
        pagination: { page, pageSize, pageCount, total },
      };
    },

    findOne(id) {
      const row = rawDb.prepare(
        `SELECT * FROM "content_history_versions" WHERE id = ?`,
      ).get(id);
      return row ? rowToVersion(row) : null;
    },

    restoreVersion(versionId, currentSchema) {
      const version = this.findOne(versionId);
      if (!version) return null;

      const unknowns = diffSchemas(version.schema, currentSchema);

      // Build restored data: start with version data
      const restoredData: Record<string, any> = {};
      const currentAttrs = currentSchema.attributes || {};

      for (const [key, val] of Object.entries(version.data)) {
        // Only include if the field still exists in current schema and hasn't changed type
        if (key in currentAttrs && !unknowns.changed.includes(key)) {
          restoredData[key] = val;
        }
      }

      // For added fields, set null (caller must handle defaults)
      for (const key of unknowns.added) {
        restoredData[key] = null;
      }

      return { entry: restoredData, unknowns };
    },

    deleteExpired(beforeDate) {
      const result = rawDb.prepare(
        `DELETE FROM "content_history_versions" WHERE created_at < ?`,
      ).run(beforeDate);
      return result.changes;
    },

    countVersions(contentType, relatedDocumentId) {
      const result = rawDb.prepare(
        `SELECT COUNT(*) as cnt FROM "content_history_versions" WHERE content_type = ? AND related_document_id = ?`,
      ).get(contentType, relatedDocumentId);
      return result.cnt;
    },
  };
}
