/**
 * End-User Service.
 *
 * Manages end-users (content API consumers) separately from admin users.
 * Handles user CRUD, password hashing (SHA-512 with salt), and role assignment.
 */

import { createHmac, randomBytes } from 'node:crypto';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EndUser {
  id?: number;
  documentId: string;
  username: string;
  email: string;
  password?: string;
  confirmed: boolean;
  blocked: boolean;
  roleId: number | null;
  roleName?: string;
  roleType?: string;
  provider: string;
  createdAt: string;
  updatedAt: string;
}

export interface UserService {
  findOne(id: number): EndUser | null;
  findOneByEmail(email: string): EndUser | null;
  findOneByUsername(username: string): EndUser | null;
  findAll(): EndUser[];
  findPage(params: { page?: number; pageSize?: number }): { results: EndUser[]; pagination: { page: number; pageSize: number; pageCount: number; total: number } };
  create(data: {
    username: string;
    email: string;
    password: string;
    confirmed?: boolean;
    blocked?: boolean;
    roleId?: number;
    provider?: string;
  }): EndUser;
  updateById(id: number, data: Partial<{
    username: string;
    email: string;
    password: string;
    confirmed: boolean;
    blocked: boolean;
    roleId: number;
  }>): EndUser | null;
  deleteById(id: number): boolean;
  count(): number;
  hashPassword(password: string): string;
  verifyPassword(password: string, hash: string): boolean;
}

export interface UserServiceConfig {
  rawDb: any;
}

// ---------------------------------------------------------------------------
// Table setup
// ---------------------------------------------------------------------------

function ensureTables(db: any): void {
  db.exec(`CREATE TABLE IF NOT EXISTS "up_users" (
    "id" INTEGER PRIMARY KEY AUTOINCREMENT,
    "document_id" VARCHAR(255) NOT NULL,
    "username" VARCHAR(255) NOT NULL UNIQUE,
    "email" VARCHAR(255) NOT NULL UNIQUE,
    "password" VARCHAR(512),
    "confirmed" INTEGER NOT NULL DEFAULT 0,
    "blocked" INTEGER NOT NULL DEFAULT 0,
    "role_id" INTEGER,
    "provider" VARCHAR(50) NOT NULL DEFAULT 'local',
    "reset_password_token" VARCHAR(512),
    "confirmation_token" VARCHAR(512),
    "created_at" TEXT NOT NULL,
    "updated_at" TEXT NOT NULL,
    FOREIGN KEY ("role_id") REFERENCES "up_roles"("id") ON DELETE SET NULL
  )`);

  db.exec(`CREATE INDEX IF NOT EXISTS "idx_up_users_email" ON "up_users" ("email")`);
  db.exec(`CREATE INDEX IF NOT EXISTS "idx_up_users_username" ON "up_users" ("username")`);
}

// ---------------------------------------------------------------------------
// Row mapping
// ---------------------------------------------------------------------------

function rowToUser(row: any, includePassword = false): EndUser {
  const user: EndUser = {
    id: row.id,
    documentId: row.document_id,
    username: row.username,
    email: row.email,
    confirmed: row.confirmed === 1,
    blocked: row.blocked === 1,
    roleId: row.role_id,
    roleName: row.role_name,
    roleType: row.role_type,
    provider: row.provider || 'local',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };

  if (includePassword) {
    user.password = row.password;
  }

  return user;
}

// ---------------------------------------------------------------------------
// Service factory
// ---------------------------------------------------------------------------

export function createUserService(config: UserServiceConfig): UserService {
  const { rawDb } = config;
  ensureTables(rawDb);

  const SELECT_WITH_ROLE = `
    SELECT u.*, r.name as role_name, r.type as role_type
    FROM "up_users" u
    LEFT JOIN "up_roles" r ON u.role_id = r.id
  `;

  return {
    findOne(id) {
      const row = rawDb.prepare(`${SELECT_WITH_ROLE} WHERE u.id = ?`).get(id);
      return row ? rowToUser(row) : null;
    },

    findOneByEmail(email) {
      const row = rawDb.prepare(`${SELECT_WITH_ROLE} WHERE u.email = ?`).get(email);
      return row ? rowToUser(row, true) : null;
    },

    findOneByUsername(username) {
      const row = rawDb.prepare(`${SELECT_WITH_ROLE} WHERE u.username = ?`).get(username);
      return row ? rowToUser(row) : null;
    },

    findAll() {
      return rawDb.prepare(`${SELECT_WITH_ROLE} ORDER BY u.id ASC`).all().map((r: any) => rowToUser(r));
    },

    findPage(params) {
      const page = params.page || 1;
      const pageSize = params.pageSize || 10;
      const offset = (page - 1) * pageSize;

      const countResult = rawDb.prepare(`SELECT COUNT(*) as cnt FROM "up_users"`).get();
      const total = countResult.cnt;
      const pageCount = Math.ceil(total / pageSize);

      const rows = rawDb.prepare(`${SELECT_WITH_ROLE} ORDER BY u.id ASC LIMIT ? OFFSET ?`).all(pageSize, offset);

      return {
        results: rows.map((r: any) => rowToUser(r)),
        pagination: { page, pageSize, pageCount, total },
      };
    },

    create(data) {
      const now = new Date().toISOString();
      const documentId = randomBytes(16).toString('hex');
      const hashedPassword = this.hashPassword(data.password);

      const result = rawDb.prepare(`
        INSERT INTO "up_users" (document_id, username, email, password, confirmed, blocked, role_id, provider, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        documentId,
        data.username,
        data.email,
        hashedPassword,
        data.confirmed ? 1 : 0,
        data.blocked ? 1 : 0,
        data.roleId || null,
        data.provider || 'local',
        now,
        now,
      );

      return this.findOne(result.lastInsertRowid as number)!;
    },

    updateById(id, data) {
      const existing = rawDb.prepare(`SELECT * FROM "up_users" WHERE id = ?`).get(id);
      if (!existing) return null;

      const now = new Date().toISOString();
      const sets: string[] = ['updated_at = ?'];
      const values: any[] = [now];

      if (data.username !== undefined) { sets.push('username = ?'); values.push(data.username); }
      if (data.email !== undefined) { sets.push('email = ?'); values.push(data.email); }
      if (data.confirmed !== undefined) { sets.push('confirmed = ?'); values.push(data.confirmed ? 1 : 0); }
      if (data.blocked !== undefined) { sets.push('blocked = ?'); values.push(data.blocked ? 1 : 0); }
      if (data.roleId !== undefined) { sets.push('role_id = ?'); values.push(data.roleId); }
      if (data.password !== undefined) {
        sets.push('password = ?');
        values.push(this.hashPassword(data.password));
      }

      values.push(id);
      rawDb.prepare(`UPDATE "up_users" SET ${sets.join(', ')} WHERE id = ?`).run(...values);

      return this.findOne(id);
    },

    deleteById(id) {
      const result = rawDb.prepare(`DELETE FROM "up_users" WHERE id = ?`).run(id);
      return result.changes > 0;
    },

    count() {
      return rawDb.prepare(`SELECT COUNT(*) as cnt FROM "up_users"`).get().cnt;
    },

    hashPassword(password) {
      const salt = randomBytes(32).toString('hex');
      const hash = createHmac('sha512', salt).update(password).digest('hex');
      return `${salt}:${hash}`;
    },

    verifyPassword(password, storedHash) {
      const [salt, hash] = storedHash.split(':');
      if (!salt || !hash) return false;
      const computed = createHmac('sha512', salt).update(password).digest('hex');
      return computed === hash;
    },
  };
}
