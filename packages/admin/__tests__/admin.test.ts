import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { createAdminService } from '../src/services/admin-user.js';
import { createAdminRoleService } from '../src/services/admin-role.js';
import { createAdminAuthService } from '../src/services/admin-auth.js';
import { createApiTokenService } from '../src/services/api-token.js';
import { registerAdminApi } from '../src/routes/index.js';
import type { AdminUserService } from '../src/services/admin-user.js';
import type { AdminRoleService } from '../src/services/admin-role.js';
import type { AdminAuthService } from '../src/services/admin-auth.js';
import type { ApiTokenService } from '../src/services/api-token.js';

const ADMIN_SECRET = 'test-admin-jwt-secret-for-testing';
const API_TOKEN_SALT = 'test-api-token-salt-for-testing';

function setupTestEnvironment() {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  const userService = createAdminService({ rawDb: db });
  const roleService = createAdminRoleService({ rawDb: db });
  const authService = createAdminAuthService({
    userService,
    roleService,
    secret: ADMIN_SECRET,
    expiresIn: '1h',
  });
  const apiTokenService = createApiTokenService({ rawDb: db, salt: API_TOKEN_SALT });

  const routes: Array<{ method: string; path: string; handler: Function }> = [];
  const server = { route: (r: any) => routes.push(r) };

  return { db, userService, roleService, authService, apiTokenService, server, routes };
}

// ==========================================================================
// Admin User Service
// ==========================================================================

describe('AdminUserService', () => {
  let db: InstanceType<typeof Database>;
  let service: AdminUserService;

  beforeEach(() => {
    const env = setupTestEnvironment();
    db = env.db;
    service = env.userService;
  });

  afterEach(() => db.close());

  it('creates an admin user', () => {
    const user = service.create({
      firstname: 'John',
      lastname: 'Doe',
      email: 'john@example.com',
      password: 'Password123!',
    });

    expect(user.id).toBeDefined();
    expect(user.documentId).toBeDefined();
    expect(user.firstname).toBe('John');
    expect(user.email).toBe('john@example.com');
    expect(user.isActive).toBe(true);
    expect(user.password).toBeUndefined(); // password not in returned object
  });

  it('finds user by id', () => {
    const created = service.create({
      firstname: 'Jane',
      lastname: 'Doe',
      email: 'jane@example.com',
      password: 'Password123!',
    });
    const found = service.findOne(created.id!);
    expect(found).not.toBeNull();
    expect(found!.email).toBe('jane@example.com');
  });

  it('finds user by email with password', () => {
    service.create({
      firstname: 'Test',
      lastname: 'User',
      email: 'test@example.com',
      password: 'Password123!',
    });
    const found = service.findOneByEmail('test@example.com');
    expect(found).not.toBeNull();
    expect(found!.password).toBeDefined();
  });

  it('returns null for non-existent user', () => {
    expect(service.findOne(999)).toBeNull();
    expect(service.findOneByEmail('nonexistent@example.com')).toBeNull();
  });

  it('lists users with pagination', () => {
    for (let i = 0; i < 15; i++) {
      service.create({
        firstname: `User${i}`,
        lastname: 'Test',
        email: `user${i}@example.com`,
        password: 'Password123!',
      });
    }

    const page1 = service.findPage({ page: 1, pageSize: 10 });
    expect(page1.results).toHaveLength(10);
    expect(page1.pagination.total).toBe(15);
    expect(page1.pagination.pageCount).toBe(2);

    const page2 = service.findPage({ page: 2, pageSize: 10 });
    expect(page2.results).toHaveLength(5);
  });

  it('updates a user', () => {
    const user = service.create({
      firstname: 'Original',
      lastname: 'Name',
      email: 'original@example.com',
      password: 'Password123!',
    });

    const updated = service.updateById(user.id!, { firstname: 'Updated', isActive: false });
    expect(updated).not.toBeNull();
    expect(updated!.firstname).toBe('Updated');
    expect(updated!.isActive).toBe(false);
  });

  it('deletes a user', () => {
    const user = service.create({
      firstname: 'Delete',
      lastname: 'Me',
      email: 'delete@example.com',
      password: 'Password123!',
    });

    expect(service.deleteById(user.id!)).toBe(true);
    expect(service.findOne(user.id!)).toBeNull();
  });

  it('hashes and verifies passwords', () => {
    const hash = service.hashPassword('MySecurePassword');
    expect(service.verifyPassword('MySecurePassword', hash)).toBe(true);
    expect(service.verifyPassword('WrongPassword', hash)).toBe(false);
  });

  it('assigns roles to users', () => {
    // First ensure roles exist
    const env = setupTestEnvironment();
    env.roleService.ensureDefaultRoles();
    const roles = env.roleService.findAll();
    const editorRole = roles.find((r: any) => r.code === 'apick-editor')!;

    const user = env.userService.create({
      firstname: 'Editor',
      lastname: 'User',
      email: 'editor@example.com',
      password: 'Password123!',
      roles: [editorRole.id!],
    });

    expect(user.roles).toContain(editorRole.id);
    env.db.close();
  });

  it('counts users', () => {
    expect(service.count()).toBe(0);
    service.create({ firstname: 'A', lastname: 'B', email: 'a@b.com', password: 'pass' });
    expect(service.count()).toBe(1);
  });
});

// ==========================================================================
// Admin Role Service
// ==========================================================================

describe('AdminRoleService', () => {
  let db: InstanceType<typeof Database>;
  let service: AdminRoleService;

  beforeEach(() => {
    const env = setupTestEnvironment();
    db = env.db;
    service = env.roleService;
  });

  afterEach(() => db.close());

  it('creates default roles', () => {
    service.ensureDefaultRoles();
    const roles = service.findAll();
    expect(roles.length).toBeGreaterThanOrEqual(3);

    const codes = roles.map((r) => r.code);
    expect(codes).toContain('apick-super-admin');
    expect(codes).toContain('apick-editor');
    expect(codes).toContain('apick-author');
  });

  it('getSuperAdminRole returns super admin', () => {
    const role = service.getSuperAdminRole();
    expect(role.code).toBe('apick-super-admin');
  });

  it('creates custom roles', () => {
    const role = service.create({ name: 'Reviewer', description: 'Content reviewer' });
    expect(role.id).toBeDefined();
    expect(role.name).toBe('Reviewer');
    expect(role.code).toBe('custom-reviewer');
  });

  it('cannot delete built-in roles', () => {
    service.ensureDefaultRoles();
    const superAdmin = service.findOneByCode('apick-super-admin')!;
    expect(service.deleteById(superAdmin.id!)).toBe(false);
  });

  it('can delete custom roles', () => {
    const role = service.create({ name: 'Temp', description: 'Temporary' });
    expect(service.deleteById(role.id!)).toBe(true);
    expect(service.findOne(role.id!)).toBeNull();
  });

  it('manages permissions for a role', () => {
    service.ensureDefaultRoles();
    const editor = service.findOneByCode('apick-editor')!;

    const perms = service.setPermissions(editor.id!, [
      { action: 'plugin::content-manager.explorer.read', subject: 'api::article.article' },
      { action: 'plugin::content-manager.explorer.create', subject: 'api::article.article', fields: ['title', 'content'] },
    ]);

    expect(perms).toHaveLength(2);
    expect(perms[0].action).toBe('plugin::content-manager.explorer.read');
    expect(perms[1].fields).toEqual(['title', 'content']);
  });

  it('replaces permissions on set', () => {
    const role = service.create({ name: 'Test' });
    service.setPermissions(role.id!, [
      { action: 'read', subject: null },
    ]);
    expect(service.getPermissions(role.id!)).toHaveLength(1);

    service.setPermissions(role.id!, [
      { action: 'read', subject: null },
      { action: 'write', subject: null },
    ]);
    expect(service.getPermissions(role.id!)).toHaveLength(2);
  });

  it('updates role metadata', () => {
    const role = service.create({ name: 'Old Name', description: 'Old' });
    const updated = service.updateById(role.id!, { description: 'New Description' });
    expect(updated!.description).toBe('New Description');
  });
});

// ==========================================================================
// Admin Auth Service
// ==========================================================================

describe('AdminAuthService', () => {
  let db: InstanceType<typeof Database>;
  let authService: AdminAuthService;
  let userService: AdminUserService;

  beforeEach(() => {
    const env = setupTestEnvironment();
    db = env.db;
    authService = env.authService;
    userService = env.userService;
  });

  afterEach(() => db.close());

  it('reports no admin initially', () => {
    expect(authService.hasAdmin()).toBe(false);
  });

  it('registers first admin', () => {
    const result = authService.registerFirstAdmin({
      firstname: 'Super',
      lastname: 'Admin',
      email: 'admin@example.com',
      password: 'AdminPassword123!',
    });

    expect(result.token).toBeDefined();
    expect(result.user.email).toBe('admin@example.com');
    expect(authService.hasAdmin()).toBe(true);
  });

  it('blocks second registration', () => {
    authService.registerFirstAdmin({
      firstname: 'First',
      lastname: 'Admin',
      email: 'first@example.com',
      password: 'Password123!',
    });

    expect(() => authService.registerFirstAdmin({
      firstname: 'Second',
      lastname: 'Admin',
      email: 'second@example.com',
      password: 'Password123!',
    })).toThrow('forbidden');
  });

  it('logs in with valid credentials', () => {
    authService.registerFirstAdmin({
      firstname: 'Admin',
      lastname: 'User',
      email: 'login@example.com',
      password: 'CorrectPassword!',
    });

    const result = authService.login('login@example.com', 'CorrectPassword!');
    expect(result.token).toBeDefined();
    expect(result.user.email).toBe('login@example.com');
  });

  it('rejects invalid credentials', () => {
    authService.registerFirstAdmin({
      firstname: 'Admin',
      lastname: 'User',
      email: 'test@example.com',
      password: 'CorrectPassword!',
    });

    expect(() => authService.login('test@example.com', 'WrongPassword')).toThrow('Invalid credentials');
    expect(() => authService.login('nonexistent@example.com', 'any')).toThrow('Invalid credentials');
  });

  it('issues and verifies tokens', () => {
    const token = authService.issue({ id: 1 });
    const decoded = authService.verify(token);
    expect(decoded.id).toBe(1);
    expect(decoded.isAdmin).toBe(true);
  });

  it('renews valid tokens', () => {
    const original = authService.issue({ id: 1 });
    const result = authService.renewToken(original);
    expect(result.token).toBeDefined();

    // Verify renewed token is valid and contains the same user
    const decoded = authService.verify(result.token);
    expect(decoded.id).toBe(1);
    expect(decoded.isAdmin).toBe(true);
    expect(decoded.iat).toBeDefined();
    expect(decoded.exp).toBeDefined();
  });

  it('generates and uses reset tokens', () => {
    authService.registerFirstAdmin({
      firstname: 'Admin',
      lastname: 'User',
      email: 'reset@example.com',
      password: 'OldPassword!',
    });

    const resetToken = authService.generateResetToken('reset@example.com');
    expect(resetToken).not.toBeNull();

    const success = authService.resetPassword(resetToken!, 'NewPassword!');
    expect(success).toBe(true);

    // Should be able to login with new password
    const result = authService.login('reset@example.com', 'NewPassword!');
    expect(result.token).toBeDefined();
  });

  it('returns null reset token for non-existent email', () => {
    expect(authService.generateResetToken('nonexistent@example.com')).toBeNull();
  });

  it('rejects invalid reset token', () => {
    expect(authService.resetPassword('invalid-token', 'NewPass')).toBe(false);
  });

  it('rejects login for inactive user', () => {
    authService.registerFirstAdmin({
      firstname: 'Admin',
      lastname: 'User',
      email: 'inactive@example.com',
      password: 'Password123!',
    });

    const user = userService.findOneByEmail('inactive@example.com')!;
    userService.updateById(user.id!, { isActive: false });

    expect(() => authService.login('inactive@example.com', 'Password123!')).toThrow('not active');
  });
});

// ==========================================================================
// API Token Service
// ==========================================================================

describe('ApiTokenService', () => {
  let db: InstanceType<typeof Database>;
  let service: ApiTokenService;

  beforeEach(() => {
    const env = setupTestEnvironment();
    db = env.db;
    service = env.apiTokenService;
  });

  afterEach(() => db.close());

  it('creates a read-only token', () => {
    const token = service.create({ name: 'Test Token', type: 'read-only' });
    expect(token.id).toBeDefined();
    expect(token.accessKey).toBeDefined();
    expect(token.name).toBe('Test Token');
    expect(token.type).toBe('read-only');
  });

  it('creates a full-access token', () => {
    const token = service.create({ name: 'Full Access', type: 'full-access' });
    expect(token.type).toBe('full-access');
  });

  it('creates a custom token with permissions', () => {
    const token = service.create({
      name: 'Custom',
      type: 'custom',
      permissions: [
        { action: 'find', subject: 'api::article.article' },
        { action: 'findOne', subject: 'api::article.article' },
      ],
    });
    expect(token.type).toBe('custom');
    expect(token.permissions).toHaveLength(2);
  });

  it('finds token by hash', () => {
    const created = service.create({ name: 'Lookup', type: 'read-only' });
    const hash = service.hashToken(created.accessKey);
    const found = service.findByHash(hash);
    expect(found).not.toBeNull();
    expect(found!.name).toBe('Lookup');
  });

  it('lists all tokens', () => {
    service.create({ name: 'Token 1', type: 'read-only' });
    service.create({ name: 'Token 2', type: 'full-access' });
    expect(service.findAll()).toHaveLength(2);
  });

  it('updates a token', () => {
    const token = service.create({ name: 'Original', type: 'read-only' });
    const updated = service.updateById(token.id!, { name: 'Updated' });
    expect(updated!.name).toBe('Updated');
  });

  it('deletes a token', () => {
    const token = service.create({ name: 'Delete Me', type: 'read-only' });
    expect(service.deleteById(token.id!)).toBe(true);
    expect(service.findOne(token.id!)).toBeNull();
  });

  it('regenerates a token', () => {
    const original = service.create({ name: 'Regen', type: 'read-only' });
    const regenerated = service.regenerate(original.id!)!;

    expect(regenerated.accessKey).toBeDefined();
    expect(regenerated.accessKey).not.toBe(original.accessKey);
  });

  it('creates token with lifespan', () => {
    const token = service.create({
      name: 'Expiring',
      type: 'read-only',
      lifespan: 86400000, // 1 day
    });
    expect(token.expiresAt).not.toBeNull();
  });

  it('updates last used timestamp', () => {
    const token = service.create({ name: 'Track', type: 'read-only' });
    expect(token.lastUsedAt).toBeNull();

    service.updateLastUsed(token.id!);
    const updated = service.findOne(token.id!)!;
    expect(updated.lastUsedAt).not.toBeNull();
  });
});

// ==========================================================================
// Admin Routes
// ==========================================================================

describe('registerAdminApi', () => {
  let env: ReturnType<typeof setupTestEnvironment>;

  beforeEach(() => {
    env = setupTestEnvironment();
    registerAdminApi({
      server: env.server,
      authService: env.authService,
      userService: env.userService,
      roleService: env.roleService,
      apiTokenService: env.apiTokenService,
    });
  });

  afterEach(() => env.db.close());

  function findRoute(method: string, path: string) {
    return env.routes.find((r) => r.method === method && r.path === path);
  }

  function mockCtx(overrides: any = {}): any {
    return {
      status: 200,
      body: null,
      params: overrides.params || {},
      query: overrides.query || {},
      request: { body: overrides.body || null },
      state: overrides.state || {},
    };
  }

  it('registers init route', () => {
    expect(findRoute('GET', '/admin/init')).toBeDefined();
  });

  it('registers all expected routes', () => {
    expect(findRoute('POST', '/admin/register-admin')).toBeDefined();
    expect(findRoute('POST', '/admin/login')).toBeDefined();
    expect(findRoute('GET', '/admin/users')).toBeDefined();
    expect(findRoute('POST', '/admin/users')).toBeDefined();
    expect(findRoute('GET', '/admin/roles')).toBeDefined();
    expect(findRoute('POST', '/admin/roles')).toBeDefined();
    expect(findRoute('GET', '/admin/api-tokens')).toBeDefined();
    expect(findRoute('POST', '/admin/api-tokens')).toBeDefined();
  });

  it('GET /admin/init returns hasAdmin false initially', async () => {
    const route = findRoute('GET', '/admin/init')!;
    const ctx = mockCtx();
    await route.handler(ctx);
    expect(ctx.body.data.hasAdmin).toBe(false);
  });

  it('POST /admin/register-admin creates first admin', async () => {
    const route = findRoute('POST', '/admin/register-admin')!;
    const ctx = mockCtx({
      body: { firstname: 'Admin', lastname: 'User', email: 'admin@test.com', password: 'Pass123!' },
    });
    await route.handler(ctx);

    expect(ctx.status).toBe(200);
    expect(ctx.body.data.token).toBeDefined();
    expect(ctx.body.data.user.email).toBe('admin@test.com');
  });

  it('POST /admin/login authenticates', async () => {
    // First register
    const regRoute = findRoute('POST', '/admin/register-admin')!;
    await regRoute.handler(mockCtx({
      body: { firstname: 'A', lastname: 'B', email: 'login@test.com', password: 'Pass123!' },
    }));

    // Then login
    const loginRoute = findRoute('POST', '/admin/login')!;
    const ctx = mockCtx({ body: { email: 'login@test.com', password: 'Pass123!' } });
    await loginRoute.handler(ctx);

    expect(ctx.status).toBe(200);
    expect(ctx.body.data.token).toBeDefined();
  });

  it('POST /admin/login rejects wrong password', async () => {
    const regRoute = findRoute('POST', '/admin/register-admin')!;
    await regRoute.handler(mockCtx({
      body: { firstname: 'A', lastname: 'B', email: 'auth@test.com', password: 'Pass123!' },
    }));

    const loginRoute = findRoute('POST', '/admin/login')!;
    const ctx = mockCtx({ body: { email: 'auth@test.com', password: 'WrongPass' } });
    await loginRoute.handler(ctx);

    expect(ctx.status).toBe(401);
  });

  it('DELETE /admin/users/:id prevents self-deletion', async () => {
    const regRoute = findRoute('POST', '/admin/register-admin')!;
    const regCtx = mockCtx({
      body: { firstname: 'A', lastname: 'B', email: 'self@test.com', password: 'Pass123!' },
    });
    await regRoute.handler(regCtx);
    const userId = regCtx.body.data.user.id;

    const deleteRoute = findRoute('DELETE', '/admin/users/:id')!;
    const ctx = mockCtx({
      params: { id: String(userId) },
      state: { auth: { credentials: { id: userId } } },
    });
    await deleteRoute.handler(ctx);

    expect(ctx.status).toBe(400);
    expect(ctx.body.error.message).toContain('own account');
  });
});
