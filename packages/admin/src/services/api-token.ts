/**
 * API Token Service.
 *
 * Manages Content API tokens: creation, lookup by hash,
 * regeneration, and deletion.
 */

import { createHmac, randomBytes } from 'node:crypto';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ApiToken {
  id?: number;
  name: string;
  description: string;
  type: 'read-only' | 'full-access' | 'custom';
  accessKey?: string;
  tokenHash: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
  permissions: Array<{ action: string; subject?: string }>;
  createdAt: string;
  updatedAt: string;
}

export interface ApiTokenService {
  findAll(): ApiToken[];
  findOne(id: number): ApiToken | null;
  findByHash(hash: string): ApiToken | null;
  create(data: { name: string; description?: string; type: 'read-only' | 'full-access' | 'custom'; lifespan?: number | null; permissions?: Array<{ action: string; subject?: string }> }): ApiToken & { accessKey: string };
  updateById(id: number, data: Partial<{ name: string; description: string; type: string; permissions: Array<{ action: string; subject?: string }> }>): ApiToken | null;
  deleteById(id: number): boolean;
  regenerate(id: number): (ApiToken & { accessKey: string }) | null;
  updateLastUsed(id: number): void;
  hashToken(token: string): string;
}

export interface ApiTokenServiceConfig {
  rawDb: any;
  salt: string;
}

// ---------------------------------------------------------------------------
// Table setup
// ---------------------------------------------------------------------------

function ensureTables(db: any): void {
  db.exec(`CREATE TABLE IF NOT EXISTS "api_tokens" (
    "id" INTEGER PRIMARY KEY AUTOINCREMENT,
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "type" VARCHAR(20) NOT NULL DEFAULT 'read-only',
    "token_hash" VARCHAR(512) NOT NULL,
    "expires_at" TEXT,
    "last_used_at" TEXT,
    "permissions" TEXT NOT NULL DEFAULT '[]',
    "created_at" TEXT NOT NULL,
    "updated_at" TEXT NOT NULL
  )`);

  db.exec(`CREATE INDEX IF NOT EXISTS "idx_api_tokens_hash" ON "api_tokens" ("token_hash")`);
}

// ---------------------------------------------------------------------------
// Row mapping
// ---------------------------------------------------------------------------

function rowToToken(row: any): ApiToken {
  return {
    id: row.id,
    name: row.name,
    description: row.description || '',
    type: row.type,
    tokenHash: row.token_hash,
    expiresAt: row.expires_at,
    lastUsedAt: row.last_used_at,
    permissions: row.permissions ? JSON.parse(row.permissions) : [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ---------------------------------------------------------------------------
// Service factory
// ---------------------------------------------------------------------------

export function createApiTokenService(config: ApiTokenServiceConfig): ApiTokenService {
  const { rawDb, salt } = config;
  ensureTables(rawDb);

  function hashToken(token: string): string {
    return createHmac('sha512', salt).update(token).digest('hex');
  }

  function generateToken(): string {
    return randomBytes(48).toString('hex');
  }

  return {
    findAll() {
      return rawDb.prepare(`SELECT * FROM "api_tokens" ORDER BY id ASC`).all().map(rowToToken);
    },

    findOne(id) {
      const row = rawDb.prepare(`SELECT * FROM "api_tokens" WHERE id = ?`).get(id);
      return row ? rowToToken(row) : null;
    },

    findByHash(hash) {
      const row = rawDb.prepare(`SELECT * FROM "api_tokens" WHERE token_hash = ?`).get(hash);
      return row ? rowToToken(row) : null;
    },

    create(data) {
      const now = new Date().toISOString();
      const accessKey = generateToken();
      const tokenHash = hashToken(accessKey);

      let expiresAt: string | null = null;
      if (data.lifespan) {
        expiresAt = new Date(Date.now() + data.lifespan).toISOString();
      }

      const result = rawDb.prepare(`
        INSERT INTO "api_tokens" (name, description, type, token_hash, expires_at, permissions, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        data.name,
        data.description || '',
        data.type,
        tokenHash,
        expiresAt,
        JSON.stringify(data.permissions || []),
        now,
        now,
      );

      const token = this.findOne(result.lastInsertRowid as number)!;
      return { ...token, accessKey };
    },

    updateById(id, data) {
      const existing = rawDb.prepare(`SELECT * FROM "api_tokens" WHERE id = ?`).get(id);
      if (!existing) return null;

      const now = new Date().toISOString();
      const sets: string[] = ['updated_at = ?'];
      const values: any[] = [now];

      if (data.name !== undefined) { sets.push('name = ?'); values.push(data.name); }
      if (data.description !== undefined) { sets.push('description = ?'); values.push(data.description); }
      if (data.type !== undefined) { sets.push('type = ?'); values.push(data.type); }
      if (data.permissions !== undefined) { sets.push('permissions = ?'); values.push(JSON.stringify(data.permissions)); }

      values.push(id);
      rawDb.prepare(`UPDATE "api_tokens" SET ${sets.join(', ')} WHERE id = ?`).run(...values);

      return this.findOne(id);
    },

    deleteById(id) {
      const result = rawDb.prepare(`DELETE FROM "api_tokens" WHERE id = ?`).run(id);
      return result.changes > 0;
    },

    regenerate(id) {
      const existing = this.findOne(id);
      if (!existing) return null;

      const accessKey = generateToken();
      const tokenHash = hashToken(accessKey);
      const now = new Date().toISOString();

      rawDb.prepare(
        `UPDATE "api_tokens" SET token_hash = ?, updated_at = ? WHERE id = ?`,
      ).run(tokenHash, now, id);

      const updated = this.findOne(id)!;
      return { ...updated, accessKey };
    },

    updateLastUsed(id) {
      const now = new Date().toISOString();
      rawDb.prepare(
        `UPDATE "api_tokens" SET last_used_at = ? WHERE id = ?`,
      ).run(now, id);
    },

    hashToken,
  };
}
