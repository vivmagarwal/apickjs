/**
 * Audit Logs Service.
 *
 * Tracks admin actions with user info and payload snapshots.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AuditLogEntry {
  id?: number;
  action: string;
  date: string;
  userId: number | null;
  user: { id: number; displayName: string; email: string } | null;
  payload: Record<string, any>;
}

export interface AuditLogService {
  log(data: { action: string; userId?: number; userEmail?: string; userName?: string; payload?: Record<string, any> }): AuditLogEntry;
  findMany(params?: {
    page?: number;
    pageSize?: number;
    action?: string;
    userId?: number;
    dateFrom?: string;
    dateTo?: string;
    sort?: 'date:asc' | 'date:desc';
  }): { results: AuditLogEntry[]; pagination: { page: number; pageSize: number; pageCount: number; total: number } };
  findOne(id: number): AuditLogEntry | null;
  deleteExpiredEvents(cutoffDate: string): number;
  count(): number;
}

export interface AuditLogServiceConfig {
  rawDb: any;
  retentionDays?: number;
}

// ---------------------------------------------------------------------------
// Tracked actions
// ---------------------------------------------------------------------------

export const TRACKED_ACTIONS = [
  'content-manager.entry.create',
  'content-manager.entry.update',
  'content-manager.entry.delete',
  'content-manager.entry.publish',
  'content-manager.entry.unpublish',
  'content-type-builder.contentType.create',
  'content-type-builder.contentType.update',
  'content-type-builder.contentType.delete',
  'content-type-builder.component.create',
  'content-type-builder.component.update',
  'content-type-builder.component.delete',
  'admin.user.create',
  'admin.user.update',
  'admin.user.delete',
  'admin.role.create',
  'admin.role.update',
  'admin.role.delete',
  'admin.api-token.create',
  'admin.api-token.update',
  'admin.api-token.delete',
  'admin.api-token.regenerate',
  'admin.auth.success',
  'admin.media.create',
  'admin.media.update',
  'admin.media.delete',
  'review-workflows.stage.transition',
] as const;

export type TrackedAction = typeof TRACKED_ACTIONS[number];

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

function ensureTables(db: any): void {
  db.exec(`CREATE TABLE IF NOT EXISTS "audit_logs" (
    "id" INTEGER PRIMARY KEY AUTOINCREMENT,
    "action" VARCHAR(255) NOT NULL,
    "date" TEXT NOT NULL,
    "user_id" INTEGER,
    "user_display_name" VARCHAR(255) NOT NULL DEFAULT 'Unknown',
    "user_email" VARCHAR(255) NOT NULL DEFAULT '',
    "payload" TEXT NOT NULL DEFAULT '{}',
    "created_at" TEXT NOT NULL
  )`);

  // Index for common queries
  db.exec(`CREATE INDEX IF NOT EXISTS "idx_audit_logs_action" ON "audit_logs" ("action")`);
  db.exec(`CREATE INDEX IF NOT EXISTS "idx_audit_logs_date" ON "audit_logs" ("date")`);
  db.exec(`CREATE INDEX IF NOT EXISTS "idx_audit_logs_user_id" ON "audit_logs" ("user_id")`);
}

function resolveDisplayName(data: { userId?: number; userEmail?: string; userName?: string }): string {
  if (data.userName) return data.userName;
  if (data.userEmail) {
    const local = data.userEmail.split('@')[0];
    return local || 'Unknown';
  }
  return 'Unknown';
}

function rowToEntry(row: any): AuditLogEntry {
  return {
    id: row.id,
    action: row.action,
    date: row.date,
    userId: row.user_id,
    user: row.user_id ? {
      id: row.user_id,
      displayName: row.user_display_name || 'Unknown',
      email: row.user_email || '',
    } : null,
    payload: row.payload ? JSON.parse(row.payload) : {},
  };
}

// ---------------------------------------------------------------------------
// Service factory
// ---------------------------------------------------------------------------

export function createAuditLogService(config: AuditLogServiceConfig): AuditLogService {
  const { rawDb } = config;
  ensureTables(rawDb);

  return {
    log(data) {
      const now = new Date().toISOString();
      const displayName = resolveDisplayName(data);

      const result = rawDb.prepare(`
        INSERT INTO "audit_logs" (action, date, user_id, user_display_name, user_email, payload, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        data.action, now, data.userId || null,
        displayName, data.userEmail || '',
        JSON.stringify(data.payload || {}), now,
      );

      return this.findOne(result.lastInsertRowid as number)!;
    },

    findMany(params = {}) {
      const page = params.page || 1;
      const pageSize = params.pageSize || 10;
      const offset = (page - 1) * pageSize;

      const conditions: string[] = [];
      const values: any[] = [];

      if (params.action) {
        conditions.push('action = ?');
        values.push(params.action);
      }
      if (params.userId !== undefined) {
        conditions.push('user_id = ?');
        values.push(params.userId);
      }
      if (params.dateFrom) {
        conditions.push('date >= ?');
        values.push(params.dateFrom);
      }
      if (params.dateTo) {
        conditions.push('date <= ?');
        values.push(params.dateTo);
      }

      const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      const order = params.sort === 'date:asc' ? 'ASC' : 'DESC';

      const total = rawDb.prepare(`SELECT COUNT(*) as cnt FROM "audit_logs" ${where}`).get(...values).cnt;
      const pageCount = Math.ceil(total / pageSize);

      const rows = rawDb.prepare(`SELECT * FROM "audit_logs" ${where} ORDER BY date ${order} LIMIT ? OFFSET ?`).all(...values, pageSize, offset);

      return { results: rows.map(rowToEntry), pagination: { page, pageSize, pageCount, total } };
    },

    findOne(id) {
      const row = rawDb.prepare(`SELECT * FROM "audit_logs" WHERE id = ?`).get(id);
      return row ? rowToEntry(row) : null;
    },

    deleteExpiredEvents(cutoffDate) {
      const result = rawDb.prepare(`DELETE FROM "audit_logs" WHERE date < ?`).run(cutoffDate);
      return result.changes;
    },

    count() {
      return rawDb.prepare(`SELECT COUNT(*) as cnt FROM "audit_logs"`).get().cnt;
    },
  };
}
