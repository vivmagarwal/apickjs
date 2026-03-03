/**
 * Content Releases Service.
 *
 * Groups content actions (publish/unpublish) for batch execution.
 * Supports scheduling and atomic publish operations.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Release {
  id?: number;
  name: string;
  status: 'pending' | 'publishing' | 'done' | 'failed';
  scheduledAt: string | null;
  releasedAt: string | null;
  createdBy: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface ReleaseAction {
  id?: number;
  releaseId: number;
  type: 'publish' | 'unpublish';
  contentType: string;
  documentId: string;
  locale: string | null;
}

export interface ReleaseService {
  findAll(): Release[];
  findOne(id: number): Release | null;
  create(data: { name: string; scheduledAt?: string; createdBy?: number }): Release;
  updateById(id: number, data: Partial<{ name: string; scheduledAt: string | null }>): Release | null;
  deleteById(id: number): boolean;
  addAction(releaseId: number, action: { type: 'publish' | 'unpublish'; contentType: string; documentId: string; locale?: string }): ReleaseAction;
  removeAction(actionId: number): boolean;
  getActions(releaseId: number): ReleaseAction[];
  publish(releaseId: number, executor: (action: ReleaseAction) => boolean): Release | null;
}

export interface ReleaseServiceConfig {
  rawDb: any;
}

// ---------------------------------------------------------------------------
// Table setup
// ---------------------------------------------------------------------------

function ensureTables(db: any): void {
  db.exec(`CREATE TABLE IF NOT EXISTS "content_releases" (
    "id" INTEGER PRIMARY KEY AUTOINCREMENT,
    "name" VARCHAR(255) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "scheduled_at" TEXT,
    "released_at" TEXT,
    "created_by" INTEGER,
    "created_at" TEXT NOT NULL,
    "updated_at" TEXT NOT NULL
  )`);

  db.exec(`CREATE TABLE IF NOT EXISTS "content_release_actions" (
    "id" INTEGER PRIMARY KEY AUTOINCREMENT,
    "release_id" INTEGER NOT NULL,
    "type" VARCHAR(20) NOT NULL,
    "content_type" VARCHAR(255) NOT NULL,
    "document_id" VARCHAR(255) NOT NULL,
    "locale" VARCHAR(10),
    FOREIGN KEY ("release_id") REFERENCES "content_releases"("id") ON DELETE CASCADE
  )`);
}

function rowToRelease(row: any): Release {
  return {
    id: row.id, name: row.name, status: row.status,
    scheduledAt: row.scheduled_at, releasedAt: row.released_at,
    createdBy: row.created_by, createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

function rowToAction(row: any): ReleaseAction {
  return {
    id: row.id, releaseId: row.release_id, type: row.type,
    contentType: row.content_type, documentId: row.document_id, locale: row.locale,
  };
}

// ---------------------------------------------------------------------------
// Service factory
// ---------------------------------------------------------------------------

export function createReleaseService(config: ReleaseServiceConfig): ReleaseService {
  const { rawDb } = config;
  ensureTables(rawDb);

  return {
    findAll() {
      return rawDb.prepare(`SELECT * FROM "content_releases" ORDER BY id DESC`).all().map(rowToRelease);
    },

    findOne(id) {
      const row = rawDb.prepare(`SELECT * FROM "content_releases" WHERE id = ?`).get(id);
      return row ? rowToRelease(row) : null;
    },

    create(data) {
      const now = new Date().toISOString();
      const result = rawDb.prepare(`
        INSERT INTO "content_releases" (name, status, scheduled_at, created_by, created_at, updated_at)
        VALUES (?, 'pending', ?, ?, ?, ?)
      `).run(data.name, data.scheduledAt || null, data.createdBy || null, now, now);
      return this.findOne(result.lastInsertRowid as number)!;
    },

    updateById(id, data) {
      const existing = this.findOne(id);
      if (!existing || existing.status !== 'pending') return null;

      const now = new Date().toISOString();
      const sets: string[] = ['updated_at = ?'];
      const values: any[] = [now];
      if (data.name !== undefined) { sets.push('name = ?'); values.push(data.name); }
      if (data.scheduledAt !== undefined) { sets.push('scheduled_at = ?'); values.push(data.scheduledAt); }
      values.push(id);
      rawDb.prepare(`UPDATE "content_releases" SET ${sets.join(', ')} WHERE id = ?`).run(...values);
      return this.findOne(id);
    },

    deleteById(id) {
      const result = rawDb.prepare(`DELETE FROM "content_releases" WHERE id = ?`).run(id);
      return result.changes > 0;
    },

    addAction(releaseId, action) {
      const result = rawDb.prepare(`
        INSERT INTO "content_release_actions" (release_id, type, content_type, document_id, locale)
        VALUES (?, ?, ?, ?, ?)
      `).run(releaseId, action.type, action.contentType, action.documentId, action.locale || null);
      const row = rawDb.prepare(`SELECT * FROM "content_release_actions" WHERE id = ?`).get(result.lastInsertRowid);
      return rowToAction(row);
    },

    removeAction(actionId) {
      const result = rawDb.prepare(`DELETE FROM "content_release_actions" WHERE id = ?`).run(actionId);
      return result.changes > 0;
    },

    getActions(releaseId) {
      return rawDb.prepare(`SELECT * FROM "content_release_actions" WHERE release_id = ? ORDER BY id ASC`).all(releaseId).map(rowToAction);
    },

    publish(releaseId, executor) {
      const release = this.findOne(releaseId);
      if (!release || release.status !== 'pending') return null;

      const now = new Date().toISOString();
      rawDb.prepare(`UPDATE "content_releases" SET status = 'publishing', updated_at = ? WHERE id = ?`).run(now, releaseId);

      const actions = this.getActions(releaseId);
      let allSucceeded = true;

      for (const action of actions) {
        if (!executor(action)) {
          allSucceeded = false;
          break;
        }
      }

      const finalStatus = allSucceeded ? 'done' : 'failed';
      const finalNow = new Date().toISOString();
      rawDb.prepare(`UPDATE "content_releases" SET status = ?, released_at = ?, updated_at = ? WHERE id = ?`)
        .run(finalStatus, allSucceeded ? finalNow : null, finalNow, releaseId);

      return this.findOne(releaseId);
    },
  };
}
