/**
 * Admin Role Service.
 *
 * CRUD operations for admin roles with permission management.
 * Includes built-in roles: Super Admin, Editor, Author.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AdminRole {
  id?: number;
  name: string;
  code: string;
  description: string;
  createdAt: string;
  updatedAt: string;
}

export interface AdminPermission {
  id?: number;
  action: string;
  subject: string | null;
  fields: string[] | null;
  conditions: string[];
  roleId: number;
}

export interface AdminRoleService {
  findAll(): AdminRole[];
  findOne(id: number): AdminRole | null;
  findOneByCode(code: string): AdminRole | null;
  create(data: { name: string; description?: string; code?: string }): AdminRole;
  updateById(id: number, data: Partial<{ name: string; description: string }>): AdminRole | null;
  deleteById(id: number): boolean;
  getPermissions(roleId: number): AdminPermission[];
  setPermissions(roleId: number, permissions: Array<{ action: string; subject?: string | null; fields?: string[] | null; conditions?: string[] }>): AdminPermission[];
  ensureDefaultRoles(): void;
  getSuperAdminRole(): AdminRole;
}

export interface AdminRoleServiceConfig {
  rawDb: any;
}

// ---------------------------------------------------------------------------
// Built-in roles
// ---------------------------------------------------------------------------

const BUILTIN_ROLES = [
  { name: 'Super Admin', code: 'apick-super-admin', description: 'Full access to all features' },
  { name: 'Editor', code: 'apick-editor', description: 'Can manage and publish all content types' },
  { name: 'Author', code: 'apick-author', description: 'Can create and manage own content only' },
];

// ---------------------------------------------------------------------------
// Table setup
// ---------------------------------------------------------------------------

function ensureTables(db: any): void {
  db.exec(`CREATE TABLE IF NOT EXISTS "admin_roles" (
    "id" INTEGER PRIMARY KEY AUTOINCREMENT,
    "name" VARCHAR(255) NOT NULL,
    "code" VARCHAR(255) NOT NULL UNIQUE,
    "description" TEXT NOT NULL DEFAULT '',
    "created_at" TEXT NOT NULL,
    "updated_at" TEXT NOT NULL
  )`);

  db.exec(`CREATE TABLE IF NOT EXISTS "admin_permissions" (
    "id" INTEGER PRIMARY KEY AUTOINCREMENT,
    "action" VARCHAR(255) NOT NULL,
    "subject" VARCHAR(255),
    "fields" TEXT,
    "conditions" TEXT NOT NULL DEFAULT '[]',
    "role_id" INTEGER NOT NULL,
    FOREIGN KEY ("role_id") REFERENCES "admin_roles"("id") ON DELETE CASCADE
  )`);
}

// ---------------------------------------------------------------------------
// Row mapping
// ---------------------------------------------------------------------------

function rowToRole(row: any): AdminRole {
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    description: row.description || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToPermission(row: any): AdminPermission {
  return {
    id: row.id,
    action: row.action,
    subject: row.subject || null,
    fields: row.fields ? JSON.parse(row.fields) : null,
    conditions: row.conditions ? JSON.parse(row.conditions) : [],
    roleId: row.role_id,
  };
}

// ---------------------------------------------------------------------------
// Service factory
// ---------------------------------------------------------------------------

export function createAdminRoleService(config: AdminRoleServiceConfig): AdminRoleService {
  const { rawDb } = config;
  ensureTables(rawDb);

  return {
    findAll() {
      const rows = rawDb.prepare(`SELECT * FROM "admin_roles" ORDER BY id ASC`).all();
      return rows.map(rowToRole);
    },

    findOne(id) {
      const row = rawDb.prepare(`SELECT * FROM "admin_roles" WHERE id = ?`).get(id);
      return row ? rowToRole(row) : null;
    },

    findOneByCode(code) {
      const row = rawDb.prepare(`SELECT * FROM "admin_roles" WHERE code = ?`).get(code);
      return row ? rowToRole(row) : null;
    },

    create(data) {
      const now = new Date().toISOString();
      const code = data.code || `custom-${data.name.toLowerCase().replace(/\s+/g, '-')}`;

      const result = rawDb.prepare(`
        INSERT INTO "admin_roles" (name, code, description, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(data.name, code, data.description || '', now, now);

      return this.findOne(result.lastInsertRowid as number)!;
    },

    updateById(id, data) {
      const existing = rawDb.prepare(`SELECT * FROM "admin_roles" WHERE id = ?`).get(id);
      if (!existing) return null;

      // Cannot modify built-in roles' code
      const isBuiltin = BUILTIN_ROLES.some((r) => r.code === existing.code);

      const now = new Date().toISOString();
      const sets: string[] = ['updated_at = ?'];
      const values: any[] = [now];

      if (data.name !== undefined && !isBuiltin) { sets.push('name = ?'); values.push(data.name); }
      if (data.name !== undefined && isBuiltin) { sets.push('name = ?'); values.push(data.name); }
      if (data.description !== undefined) { sets.push('description = ?'); values.push(data.description); }

      values.push(id);
      rawDb.prepare(`UPDATE "admin_roles" SET ${sets.join(', ')} WHERE id = ?`).run(...values);

      return this.findOne(id);
    },

    deleteById(id) {
      const existing = rawDb.prepare(`SELECT * FROM "admin_roles" WHERE id = ?`).get(id);
      if (!existing) return false;

      // Cannot delete built-in roles
      if (BUILTIN_ROLES.some((r) => r.code === existing.code)) {
        return false;
      }

      rawDb.prepare(`DELETE FROM "admin_permissions" WHERE role_id = ?`).run(id);
      rawDb.prepare(`DELETE FROM "admin_users_roles_links" WHERE role_id = ?`).run(id);
      const result = rawDb.prepare(`DELETE FROM "admin_roles" WHERE id = ?`).run(id);
      return result.changes > 0;
    },

    getPermissions(roleId) {
      const rows = rawDb.prepare(
        `SELECT * FROM "admin_permissions" WHERE role_id = ?`,
      ).all(roleId);
      return rows.map(rowToPermission);
    },

    setPermissions(roleId, permissions) {
      // Remove existing permissions
      rawDb.prepare(`DELETE FROM "admin_permissions" WHERE role_id = ?`).run(roleId);

      // Insert new permissions
      const stmt = rawDb.prepare(`
        INSERT INTO "admin_permissions" (action, subject, fields, conditions, role_id)
        VALUES (?, ?, ?, ?, ?)
      `);

      for (const perm of permissions) {
        stmt.run(
          perm.action,
          perm.subject || null,
          perm.fields ? JSON.stringify(perm.fields) : null,
          JSON.stringify(perm.conditions || []),
          roleId,
        );
      }

      return this.getPermissions(roleId);
    },

    ensureDefaultRoles() {
      for (const role of BUILTIN_ROLES) {
        const existing = rawDb.prepare(
          `SELECT id FROM "admin_roles" WHERE code = ?`,
        ).get(role.code);

        if (!existing) {
          const now = new Date().toISOString();
          rawDb.prepare(`
            INSERT INTO "admin_roles" (name, code, description, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?)
          `).run(role.name, role.code, role.description, now, now);
        }
      }
    },

    getSuperAdminRole() {
      this.ensureDefaultRoles();
      return this.findOneByCode('apick-super-admin')!;
    },
  };
}
