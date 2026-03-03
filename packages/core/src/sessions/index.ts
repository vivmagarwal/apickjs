/**
 * Session Management.
 *
 * Database-backed sessions for token rotation. Supports:
 *   - Session creation on login
 *   - Refresh token rotation (old token invalidated)
 *   - Token reuse detection (revokes entire session)
 *   - Session expiry and cleanup
 *   - Per-user session revocation
 */

import { createHmac, randomUUID } from 'node:crypto';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Session {
  id?: number;
  sessionId: string;
  userId: number | string;
  refreshTokenHash: string;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
  userAgent?: string;
  ip?: string;
}

export interface SessionServiceConfig {
  /** The raw database handle (better-sqlite3) */
  rawDb: any;
  /** Secret for hashing refresh tokens */
  secret: string;
  /** Table name for sessions. Default: 'apick_sessions' */
  tableName?: string;
}

// ---------------------------------------------------------------------------
// Session table setup
// ---------------------------------------------------------------------------

function ensureSessionTable(db: any, tableName: string): void {
  db.exec(`CREATE TABLE IF NOT EXISTS "${tableName}" (
    "id" INTEGER PRIMARY KEY AUTOINCREMENT,
    "session_id" VARCHAR(255) NOT NULL UNIQUE,
    "user_id" VARCHAR(255) NOT NULL,
    "refresh_token_hash" VARCHAR(512) NOT NULL,
    "expires_at" TEXT NOT NULL,
    "created_at" TEXT NOT NULL,
    "updated_at" TEXT NOT NULL,
    "user_agent" TEXT,
    "ip" VARCHAR(45)
  )`);

  // Index on user_id for fast lookups
  db.exec(`CREATE INDEX IF NOT EXISTS "idx_${tableName}_user_id" ON "${tableName}" ("user_id")`);
  db.exec(`CREATE INDEX IF NOT EXISTS "idx_${tableName}_session_id" ON "${tableName}" ("session_id")`);
}

// ---------------------------------------------------------------------------
// Session service factory
// ---------------------------------------------------------------------------

export interface SessionService {
  create(data: Omit<Session, 'id' | 'createdAt' | 'updatedAt'>): Session;
  findBySessionId(sessionId: string): Session | null;
  updateBySessionId(sessionId: string, data: Partial<Pick<Session, 'refreshTokenHash' | 'expiresAt'>>): Session | null;
  deleteBySessionId(sessionId: string): boolean;
  deleteExpired(): number;
  deleteByUserId(userId: number | string): number;
  deleteAll(): number;
  hashToken(token: string): string;
  generateSessionId(): string;
}

/**
 * Creates a session service bound to the given database.
 */
export function createSessionService(config: SessionServiceConfig): SessionService {
  const { rawDb, secret } = config;
  const tableName = config.tableName || 'apick_sessions';

  ensureSessionTable(rawDb, tableName);

  function hashToken(token: string): string {
    return createHmac('sha512', secret).update(token).digest('hex');
  }

  function generateSessionId(): string {
    return randomUUID();
  }

  function rowToSession(row: any): Session {
    return {
      id: row.id,
      sessionId: row.session_id,
      userId: row.user_id,
      refreshTokenHash: row.refresh_token_hash,
      expiresAt: row.expires_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      userAgent: row.user_agent,
      ip: row.ip,
    };
  }

  return {
    create(data) {
      const now = new Date().toISOString();
      const stmt = rawDb.prepare(`
        INSERT INTO "${tableName}" (session_id, user_id, refresh_token_hash, expires_at, created_at, updated_at, user_agent, ip)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const result = stmt.run(
        data.sessionId,
        String(data.userId),
        data.refreshTokenHash,
        data.expiresAt,
        now,
        now,
        data.userAgent || null,
        data.ip || null,
      );

      return {
        id: result.lastInsertRowid as number,
        sessionId: data.sessionId,
        userId: data.userId,
        refreshTokenHash: data.refreshTokenHash,
        expiresAt: data.expiresAt,
        createdAt: now,
        updatedAt: now,
        userAgent: data.userAgent,
        ip: data.ip,
      };
    },

    findBySessionId(sessionId) {
      const row = rawDb.prepare(
        `SELECT * FROM "${tableName}" WHERE session_id = ?`,
      ).get(sessionId);
      return row ? rowToSession(row) : null;
    },

    updateBySessionId(sessionId, data) {
      const now = new Date().toISOString();
      const sets: string[] = ['updated_at = ?'];
      const values: any[] = [now];

      if (data.refreshTokenHash !== undefined) {
        sets.push('refresh_token_hash = ?');
        values.push(data.refreshTokenHash);
      }
      if (data.expiresAt !== undefined) {
        sets.push('expires_at = ?');
        values.push(data.expiresAt);
      }

      values.push(sessionId);

      rawDb.prepare(
        `UPDATE "${tableName}" SET ${sets.join(', ')} WHERE session_id = ?`,
      ).run(...values);

      return this.findBySessionId(sessionId);
    },

    deleteBySessionId(sessionId) {
      const result = rawDb.prepare(
        `DELETE FROM "${tableName}" WHERE session_id = ?`,
      ).run(sessionId);
      return result.changes > 0;
    },

    deleteExpired() {
      const now = new Date().toISOString();
      const result = rawDb.prepare(
        `DELETE FROM "${tableName}" WHERE expires_at < ?`,
      ).run(now);
      return result.changes;
    },

    deleteByUserId(userId) {
      const result = rawDb.prepare(
        `DELETE FROM "${tableName}" WHERE user_id = ?`,
      ).run(String(userId));
      return result.changes;
    },

    deleteAll() {
      const result = rawDb.prepare(`DELETE FROM "${tableName}"`).run();
      return result.changes;
    },

    hashToken,
    generateSessionId,
  };
}
