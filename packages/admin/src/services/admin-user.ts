/**
 * Admin User Service.
 *
 * CRUD operations for admin users with password hashing,
 * role assignment, and pagination support.
 */

import { createHash, randomBytes, randomUUID } from 'node:crypto';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AdminUser {
  id?: number;
  documentId: string;
  firstname: string;
  lastname: string;
  email: string;
  password?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  roles?: number[];
}

export interface AdminUserService {
  findOne(id: number): AdminUser | null;
  findOneByEmail(email: string): (AdminUser & { password: string }) | null;
  findPage(params: { page?: number; pageSize?: number }): {
    results: AdminUser[];
    pagination: { page: number; pageSize: number; pageCount: number; total: number };
  };
  create(data: { firstname: string; lastname: string; email: string; password: string; isActive?: boolean; roles?: number[] }): AdminUser;
  updateById(id: number, data: Partial<{ firstname: string; lastname: string; email: string; password: string; isActive: boolean; roles: number[] }>): AdminUser | null;
  deleteById(id: number): boolean;
  count(): number;
  hashPassword(password: string): string;
  verifyPassword(password: string, hash: string): boolean;
}

export interface AdminUserServiceConfig {
  rawDb: any;
}

// ---------------------------------------------------------------------------
// Password hashing (SHA-512 with salt)
// ---------------------------------------------------------------------------

function hashPassword(password: string): string {
  const salt = randomBytes(32).toString('hex');
  const hash = createHash('sha512').update(password + salt).digest('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const computed = createHash('sha512').update(password + salt).digest('hex');
  return computed === hash;
}

// ---------------------------------------------------------------------------
// Table setup
// ---------------------------------------------------------------------------

function ensureTables(db: any): void {
  db.exec(`CREATE TABLE IF NOT EXISTS "admin_users" (
    "id" INTEGER PRIMARY KEY AUTOINCREMENT,
    "document_id" VARCHAR(255) NOT NULL UNIQUE,
    "firstname" VARCHAR(255) NOT NULL,
    "lastname" VARCHAR(255) NOT NULL,
    "email" VARCHAR(255) NOT NULL UNIQUE,
    "password" VARCHAR(512) NOT NULL,
    "is_active" INTEGER NOT NULL DEFAULT 1,
    "created_at" TEXT NOT NULL,
    "updated_at" TEXT NOT NULL
  )`);

  db.exec(`CREATE TABLE IF NOT EXISTS "admin_users_roles_links" (
    "user_id" INTEGER NOT NULL,
    "role_id" INTEGER NOT NULL,
    PRIMARY KEY ("user_id", "role_id")
  )`);
}

// ---------------------------------------------------------------------------
// Row mapping
// ---------------------------------------------------------------------------

function rowToUser(row: any, db: any): AdminUser {
  const roles = db.prepare(
    `SELECT role_id FROM "admin_users_roles_links" WHERE user_id = ?`,
  ).all(row.id).map((r: any) => r.role_id);

  return {
    id: row.id,
    documentId: row.document_id,
    firstname: row.firstname,
    lastname: row.lastname,
    email: row.email,
    isActive: row.is_active === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    roles,
  };
}

// ---------------------------------------------------------------------------
// Service factory
// ---------------------------------------------------------------------------

export function createAdminService(config: AdminUserServiceConfig): AdminUserService {
  const { rawDb } = config;
  ensureTables(rawDb);

  function setRoles(userId: number, roleIds: number[]): void {
    rawDb.prepare(`DELETE FROM "admin_users_roles_links" WHERE user_id = ?`).run(userId);
    const stmt = rawDb.prepare(`INSERT INTO "admin_users_roles_links" (user_id, role_id) VALUES (?, ?)`);
    for (const roleId of roleIds) {
      stmt.run(userId, roleId);
    }
  }

  return {
    findOne(id) {
      const row = rawDb.prepare(`SELECT * FROM "admin_users" WHERE id = ?`).get(id);
      return row ? rowToUser(row, rawDb) : null;
    },

    findOneByEmail(email) {
      const row = rawDb.prepare(`SELECT * FROM "admin_users" WHERE email = ?`).get(email);
      if (!row) return null;
      const user = rowToUser(row, rawDb);
      return { ...user, password: row.password };
    },

    findPage(params) {
      const page = params.page || 1;
      const pageSize = params.pageSize || 10;
      const offset = (page - 1) * pageSize;

      const total = rawDb.prepare(`SELECT COUNT(*) as count FROM "admin_users"`).get().count;
      const rows = rawDb.prepare(
        `SELECT * FROM "admin_users" ORDER BY id ASC LIMIT ? OFFSET ?`,
      ).all(pageSize, offset);

      return {
        results: rows.map((r: any) => rowToUser(r, rawDb)),
        pagination: {
          page,
          pageSize,
          pageCount: Math.ceil(total / pageSize),
          total,
        },
      };
    },

    create(data) {
      const now = new Date().toISOString();
      const docId = `admin_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
      const passwordHash = hashPassword(data.password);

      const result = rawDb.prepare(`
        INSERT INTO "admin_users" (document_id, firstname, lastname, email, password, is_active, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        docId,
        data.firstname,
        data.lastname,
        data.email,
        passwordHash,
        data.isActive !== false ? 1 : 0,
        now,
        now,
      );

      const userId = result.lastInsertRowid as number;
      if (data.roles && data.roles.length > 0) {
        setRoles(userId, data.roles);
      }

      return this.findOne(userId)!;
    },

    updateById(id, data) {
      const existing = rawDb.prepare(`SELECT * FROM "admin_users" WHERE id = ?`).get(id);
      if (!existing) return null;

      const now = new Date().toISOString();
      const sets: string[] = ['updated_at = ?'];
      const values: any[] = [now];

      if (data.firstname !== undefined) { sets.push('firstname = ?'); values.push(data.firstname); }
      if (data.lastname !== undefined) { sets.push('lastname = ?'); values.push(data.lastname); }
      if (data.email !== undefined) { sets.push('email = ?'); values.push(data.email); }
      if (data.isActive !== undefined) { sets.push('is_active = ?'); values.push(data.isActive ? 1 : 0); }
      if (data.password !== undefined) { sets.push('password = ?'); values.push(hashPassword(data.password)); }

      values.push(id);
      rawDb.prepare(`UPDATE "admin_users" SET ${sets.join(', ')} WHERE id = ?`).run(...values);

      if (data.roles !== undefined) {
        setRoles(id, data.roles);
      }

      return this.findOne(id);
    },

    deleteById(id) {
      rawDb.prepare(`DELETE FROM "admin_users_roles_links" WHERE user_id = ?`).run(id);
      const result = rawDb.prepare(`DELETE FROM "admin_users" WHERE id = ?`).run(id);
      return result.changes > 0;
    },

    count() {
      return rawDb.prepare(`SELECT COUNT(*) as count FROM "admin_users"`).get().count;
    },

    hashPassword,
    verifyPassword,
  };
}
