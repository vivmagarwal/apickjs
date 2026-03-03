/**
 * Data Transfer Service.
 *
 * Manages transfer tokens and provides export/import capabilities
 * for content, schemas, and media metadata.
 */

import { createHmac, randomBytes } from 'node:crypto';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TransferToken {
  id?: number;
  name: string;
  description: string;
  accessKey: string;
  permissions: TransferPermission[];
  lifespan: number | null; // milliseconds, null = never expires
  expiresAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type TransferPermission = 'push' | 'pull';

export interface ExportData {
  metadata: {
    createdAt: string;
    version: string;
    source: string;
  };
  schemas: Record<string, any>[];
  content: Record<string, Record<string, any>[]>;
  media: Record<string, any>[];
}

export interface ImportResult {
  imported: { schemas: number; content: number; media: number };
  skipped: { schemas: number; content: number; media: number };
  errors: string[];
}

export interface TransferService {
  // Token management
  findAllTokens(): TransferToken[];
  findOneToken(id: number): TransferToken | null;
  findTokenByAccessKey(accessKey: string): TransferToken | null;
  createToken(data: { name: string; description?: string; permissions: TransferPermission[]; lifespan?: number | null }): TransferToken;
  updateToken(id: number, data: Partial<{ name: string; description: string }>): TransferToken | null;
  deleteToken(id: number): boolean;
  regenerateToken(id: number): TransferToken | null;
  validateToken(accessKey: string, requiredPermission: TransferPermission): boolean;

  // Export/Import
  exportData(options?: { only?: ('schemas' | 'content' | 'media')[]; exclude?: string[] }): ExportData;
  importData(data: ExportData, options?: { force?: boolean; dryRun?: boolean }): ImportResult;
}

export interface TransferServiceConfig {
  rawDb: any;
  contentTables?: string[];
}

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

function ensureTables(db: any): void {
  db.exec(`CREATE TABLE IF NOT EXISTS "transfer_tokens" (
    "id" INTEGER PRIMARY KEY AUTOINCREMENT,
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "access_key" VARCHAR(512) NOT NULL UNIQUE,
    "permissions" TEXT NOT NULL DEFAULT '[]',
    "lifespan" INTEGER,
    "expires_at" TEXT,
    "last_used_at" TEXT,
    "created_at" TEXT NOT NULL,
    "updated_at" TEXT NOT NULL
  )`);
}

function rowToToken(row: any): TransferToken {
  return {
    id: row.id, name: row.name, description: row.description || '',
    accessKey: row.access_key,
    permissions: row.permissions ? JSON.parse(row.permissions) : [],
    lifespan: row.lifespan,
    expiresAt: row.expires_at,
    lastUsedAt: row.last_used_at,
    createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

function generateAccessKey(): string {
  return randomBytes(32).toString('hex');
}

function hashAccessKey(key: string): string {
  return createHmac('sha256', 'apick-transfer').update(key).digest('hex');
}

// ---------------------------------------------------------------------------
// Service factory
// ---------------------------------------------------------------------------

export function createTransferService(config: TransferServiceConfig): TransferService {
  const { rawDb, contentTables = [] } = config;
  ensureTables(rawDb);

  return {
    // -----------------------------------------------------------------------
    // Token management
    // -----------------------------------------------------------------------

    findAllTokens() {
      return rawDb.prepare(`SELECT * FROM "transfer_tokens" ORDER BY id ASC`).all().map(rowToToken);
    },

    findOneToken(id) {
      const row = rawDb.prepare(`SELECT * FROM "transfer_tokens" WHERE id = ?`).get(id);
      return row ? rowToToken(row) : null;
    },

    findTokenByAccessKey(accessKey) {
      const hashed = hashAccessKey(accessKey);
      const row = rawDb.prepare(`SELECT * FROM "transfer_tokens" WHERE access_key = ?`).get(hashed);
      return row ? rowToToken(row) : null;
    },

    createToken(data) {
      const now = new Date().toISOString();
      const rawKey = generateAccessKey();
      const hashedKey = hashAccessKey(rawKey);

      let expiresAt: string | null = null;
      if (data.lifespan) {
        expiresAt = new Date(Date.now() + data.lifespan).toISOString();
      }

      const result = rawDb.prepare(`
        INSERT INTO "transfer_tokens" (name, description, access_key, permissions, lifespan, expires_at, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        data.name, data.description || '', hashedKey,
        JSON.stringify(data.permissions),
        data.lifespan || null, expiresAt, now, now,
      );

      const token = this.findOneToken(result.lastInsertRowid as number)!;
      // Return the raw access key only on creation (not stored in plain text)
      return { ...token, accessKey: rawKey };
    },

    updateToken(id, data) {
      const existing = this.findOneToken(id);
      if (!existing) return null;

      const now = new Date().toISOString();
      const sets: string[] = ['updated_at = ?'];
      const values: any[] = [now];

      if (data.name !== undefined) { sets.push('name = ?'); values.push(data.name); }
      if (data.description !== undefined) { sets.push('description = ?'); values.push(data.description); }

      values.push(id);
      rawDb.prepare(`UPDATE "transfer_tokens" SET ${sets.join(', ')} WHERE id = ?`).run(...values);
      return this.findOneToken(id);
    },

    deleteToken(id) {
      const result = rawDb.prepare(`DELETE FROM "transfer_tokens" WHERE id = ?`).run(id);
      return result.changes > 0;
    },

    regenerateToken(id) {
      const existing = this.findOneToken(id);
      if (!existing) return null;

      const now = new Date().toISOString();
      const rawKey = generateAccessKey();
      const hashedKey = hashAccessKey(rawKey);

      let expiresAt: string | null = null;
      if (existing.lifespan) {
        expiresAt = new Date(Date.now() + existing.lifespan).toISOString();
      }

      rawDb.prepare(`UPDATE "transfer_tokens" SET access_key = ?, expires_at = ?, updated_at = ? WHERE id = ?`)
        .run(hashedKey, expiresAt, now, id);

      const token = this.findOneToken(id)!;
      return { ...token, accessKey: rawKey };
    },

    validateToken(accessKey, requiredPermission) {
      const token = this.findTokenByAccessKey(accessKey);
      if (!token) return false;

      // Check expiration
      if (token.expiresAt && new Date(token.expiresAt) < new Date()) return false;

      // Check permission
      if (!token.permissions.includes(requiredPermission)) return false;

      // Update last used
      rawDb.prepare(`UPDATE "transfer_tokens" SET last_used_at = ? WHERE id = ?`)
        .run(new Date().toISOString(), token.id);

      return true;
    },

    // -----------------------------------------------------------------------
    // Export / Import
    // -----------------------------------------------------------------------

    exportData(options = {}) {
      const only = options.only || ['schemas', 'content', 'media'];
      const exclude = new Set(options.exclude || []);

      const exportResult: ExportData = {
        metadata: {
          createdAt: new Date().toISOString(),
          version: '1.0.0',
          source: 'apick',
        },
        schemas: [],
        content: {},
        media: [],
      };

      if (only.includes('content')) {
        for (const table of contentTables) {
          if (exclude.has(table)) continue;
          try {
            const rows = rawDb.prepare(`SELECT * FROM "${table}"`).all();
            exportResult.content[table] = rows;
          } catch {
            // Table might not exist
          }
        }
      }

      if (only.includes('media')) {
        try {
          const rows = rawDb.prepare(`SELECT * FROM "upload_files"`).all();
          exportResult.media = rows;
        } catch {
          // Upload table might not exist
        }
      }

      return exportResult;
    },

    importData(data, options = {}) {
      const result: ImportResult = {
        imported: { schemas: 0, content: 0, media: 0 },
        skipped: { schemas: 0, content: 0, media: 0 },
        errors: [],
      };

      if (options.dryRun) {
        // Count what would be imported
        result.imported.schemas = data.schemas.length;
        for (const rows of Object.values(data.content)) {
          result.imported.content += rows.length;
        }
        result.imported.media = data.media.length;
        return result;
      }

      // Import content
      for (const [table, rows] of Object.entries(data.content)) {
        for (const row of rows) {
          try {
            if (!options.force) {
              // Check if row exists
              const existing = rawDb.prepare(`SELECT id FROM "${table}" WHERE id = ?`).get(row.id);
              if (existing) {
                result.skipped.content++;
                continue;
              }
            }

            const columns = Object.keys(row);
            const placeholders = columns.map(() => '?').join(', ');
            const values = columns.map(c => row[c]);

            if (options.force && row.id) {
              // Delete existing before insert
              rawDb.prepare(`DELETE FROM "${table}" WHERE id = ?`).run(row.id);
            }

            rawDb.prepare(`INSERT INTO "${table}" (${columns.map(c => `"${c}"`).join(', ')}) VALUES (${placeholders})`).run(...values);
            result.imported.content++;
          } catch (err: any) {
            result.errors.push(`Failed to import row in ${table}: ${err.message}`);
          }
        }
      }

      // Import media
      for (const row of data.media) {
        try {
          if (!options.force) {
            const existing = rawDb.prepare(`SELECT id FROM "upload_files" WHERE id = ?`).get(row.id);
            if (existing) {
              result.skipped.media++;
              continue;
            }
          }

          const columns = Object.keys(row);
          const placeholders = columns.map(() => '?').join(', ');
          const values = columns.map((c: string) => row[c]);

          if (options.force && row.id) {
            rawDb.prepare(`DELETE FROM "upload_files" WHERE id = ?`).run(row.id);
          }

          rawDb.prepare(`INSERT INTO "upload_files" (${columns.map((c: string) => `"${c}"`).join(', ')}) VALUES (${placeholders})`).run(...values);
          result.imported.media++;
        } catch (err: any) {
          result.errors.push(`Failed to import media: ${err.message}`);
        }
      }

      return result;
    },
  };
}
