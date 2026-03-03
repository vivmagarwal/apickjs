/**
 * End-User Role Service.
 *
 * Manages end-user roles (Authenticated, Public, custom) and
 * per-role permission configuration for Content API access.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EndUserRole {
  id?: number;
  name: string;
  description: string;
  type: string;
  permissions: Record<string, boolean>;
  createdAt: string;
  updatedAt: string;
}

export interface RoleService {
  findAll(): EndUserRole[];
  findOne(id: number): EndUserRole | null;
  findOneByType(type: string): EndUserRole | null;
  create(data: { name: string; description?: string; type: string }): EndUserRole;
  updateById(id: number, data: Partial<{ name: string; description: string; permissions: Record<string, boolean> }>): EndUserRole | null;
  deleteById(id: number): boolean;
  ensureDefaultRoles(): void;
  getPublicRole(): EndUserRole;
  getAuthenticatedRole(): EndUserRole;
  setPermissions(roleId: number, permissions: Record<string, boolean>): Record<string, boolean>;
  getPermissions(roleId: number): Record<string, boolean>;
  checkPermission(roleId: number, action: string): boolean;
}

export interface RoleServiceConfig {
  rawDb: any;
}

// ---------------------------------------------------------------------------
// Table setup
// ---------------------------------------------------------------------------

function ensureTables(db: any): void {
  db.exec(`CREATE TABLE IF NOT EXISTS "up_roles" (
    "id" INTEGER PRIMARY KEY AUTOINCREMENT,
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "type" VARCHAR(50) NOT NULL UNIQUE,
    "permissions" TEXT NOT NULL DEFAULT '{}',
    "created_at" TEXT NOT NULL,
    "updated_at" TEXT NOT NULL
  )`);
}

// ---------------------------------------------------------------------------
// Row mapping
// ---------------------------------------------------------------------------

function rowToRole(row: any): EndUserRole {
  return {
    id: row.id,
    name: row.name,
    description: row.description || '',
    type: row.type,
    permissions: row.permissions ? JSON.parse(row.permissions) : {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ---------------------------------------------------------------------------
// Default roles
// ---------------------------------------------------------------------------

const DEFAULT_ROLES = [
  { name: 'Authenticated', type: 'authenticated', description: 'Default role given to authenticated end-users' },
  { name: 'Public', type: 'public', description: 'Default role given to unauthenticated requests' },
];

// ---------------------------------------------------------------------------
// Service factory
// ---------------------------------------------------------------------------

export function createRoleService(config: RoleServiceConfig): RoleService {
  const { rawDb } = config;
  ensureTables(rawDb);

  return {
    findAll() {
      return rawDb.prepare(`SELECT * FROM "up_roles" ORDER BY id ASC`).all().map(rowToRole);
    },

    findOne(id) {
      const row = rawDb.prepare(`SELECT * FROM "up_roles" WHERE id = ?`).get(id);
      return row ? rowToRole(row) : null;
    },

    findOneByType(type) {
      const row = rawDb.prepare(`SELECT * FROM "up_roles" WHERE type = ?`).get(type);
      return row ? rowToRole(row) : null;
    },

    create(data) {
      const now = new Date().toISOString();
      const result = rawDb.prepare(`
        INSERT INTO "up_roles" (name, description, type, permissions, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        data.name,
        data.description || '',
        data.type,
        '{}',
        now,
        now,
      );

      return this.findOne(result.lastInsertRowid as number)!;
    },

    updateById(id, data) {
      const existing = rawDb.prepare(`SELECT * FROM "up_roles" WHERE id = ?`).get(id);
      if (!existing) return null;

      const now = new Date().toISOString();
      const sets: string[] = ['updated_at = ?'];
      const values: any[] = [now];

      if (data.name !== undefined) { sets.push('name = ?'); values.push(data.name); }
      if (data.description !== undefined) { sets.push('description = ?'); values.push(data.description); }
      if (data.permissions !== undefined) { sets.push('permissions = ?'); values.push(JSON.stringify(data.permissions)); }

      values.push(id);
      rawDb.prepare(`UPDATE "up_roles" SET ${sets.join(', ')} WHERE id = ?`).run(...values);

      return this.findOne(id);
    },

    deleteById(id) {
      const role = this.findOne(id);
      if (!role) return false;

      // Cannot delete built-in roles
      if (role.type === 'authenticated' || role.type === 'public') return false;

      const result = rawDb.prepare(`DELETE FROM "up_roles" WHERE id = ?`).run(id);
      return result.changes > 0;
    },

    ensureDefaultRoles() {
      for (const role of DEFAULT_ROLES) {
        const existing = this.findOneByType(role.type);
        if (!existing) {
          this.create(role);
        }
      }
    },

    getPublicRole() {
      this.ensureDefaultRoles();
      return this.findOneByType('public')!;
    },

    getAuthenticatedRole() {
      this.ensureDefaultRoles();
      return this.findOneByType('authenticated')!;
    },

    setPermissions(roleId, permissions) {
      const now = new Date().toISOString();
      rawDb.prepare(`UPDATE "up_roles" SET permissions = ?, updated_at = ? WHERE id = ?`).run(
        JSON.stringify(permissions),
        now,
        roleId,
      );
      return permissions;
    },

    getPermissions(roleId) {
      const role = this.findOne(roleId);
      return role?.permissions || {};
    },

    checkPermission(roleId, action) {
      const permissions = this.getPermissions(roleId);
      return permissions[action] === true;
    },
  };
}
