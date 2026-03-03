import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { createUserService } from '../src/services/user.js';
import { createRoleService } from '../src/services/role.js';
import { createUserAuthService } from '../src/services/auth.js';
import { registerUsersPermissionsRoutes } from '../src/routes/index.js';
import type { UserService } from '../src/services/user.js';
import type { RoleService } from '../src/services/role.js';
import type { UserAuthService } from '../src/services/auth.js';

const JWT_SECRET = 'test-user-jwt-secret-for-testing';

function setupTestEnvironment() {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  const roleService = createRoleService({ rawDb: db });
  const userService = createUserService({ rawDb: db });
  const authService = createUserAuthService({
    userService,
    roleService,
    secret: JWT_SECRET,
    expiresIn: '7d',
  });

  const routes: Array<{ method: string; path: string; handler: Function }> = [];
  const server = { route: (r: any) => routes.push(r) };

  return { db, roleService, userService, authService, server, routes };
}

// ==========================================================================
// End-User Role Service
// ==========================================================================

describe('RoleService (End-User)', () => {
  let db: InstanceType<typeof Database>;
  let roleService: RoleService;

  beforeEach(() => {
    const env = setupTestEnvironment();
    db = env.db;
    roleService = env.roleService;
  });

  afterEach(() => db.close());

  it('creates default roles', () => {
    roleService.ensureDefaultRoles();
    const roles = roleService.findAll();
    expect(roles).toHaveLength(2);

    const types = roles.map(r => r.type);
    expect(types).toContain('authenticated');
    expect(types).toContain('public');
  });

  it('getPublicRole returns public role', () => {
    const role = roleService.getPublicRole();
    expect(role.type).toBe('public');
    expect(role.name).toBe('Public');
  });

  it('getAuthenticatedRole returns authenticated role', () => {
    const role = roleService.getAuthenticatedRole();
    expect(role.type).toBe('authenticated');
    expect(role.name).toBe('Authenticated');
  });

  it('creates custom roles', () => {
    const role = roleService.create({ name: 'Premium', type: 'premium' });
    expect(role.id).toBeDefined();
    expect(role.name).toBe('Premium');
    expect(role.type).toBe('premium');
  });

  it('cannot delete built-in roles', () => {
    roleService.ensureDefaultRoles();
    const publicRole = roleService.findOneByType('public')!;
    expect(roleService.deleteById(publicRole.id!)).toBe(false);

    const authRole = roleService.findOneByType('authenticated')!;
    expect(roleService.deleteById(authRole.id!)).toBe(false);
  });

  it('can delete custom roles', () => {
    const role = roleService.create({ name: 'Temp', type: 'temp' });
    expect(roleService.deleteById(role.id!)).toBe(true);
    expect(roleService.findOne(role.id!)).toBeNull();
  });

  it('manages permissions', () => {
    roleService.ensureDefaultRoles();
    const publicRole = roleService.getPublicRole();

    roleService.setPermissions(publicRole.id!, {
      'api::article.article.find': true,
      'api::article.article.findOne': true,
      'api::article.article.create': false,
    });

    const perms = roleService.getPermissions(publicRole.id!);
    expect(perms['api::article.article.find']).toBe(true);
    expect(perms['api::article.article.findOne']).toBe(true);
    expect(perms['api::article.article.create']).toBe(false);
  });

  it('checks permissions', () => {
    roleService.ensureDefaultRoles();
    const publicRole = roleService.getPublicRole();

    roleService.setPermissions(publicRole.id!, {
      'api::article.article.find': true,
    });

    expect(roleService.checkPermission(publicRole.id!, 'api::article.article.find')).toBe(true);
    expect(roleService.checkPermission(publicRole.id!, 'api::article.article.create')).toBe(false);
  });

  it('updates role metadata', () => {
    const role = roleService.create({ name: 'Old', type: 'old', description: 'Old desc' });
    const updated = roleService.updateById(role.id!, { description: 'New desc' });
    expect(updated!.description).toBe('New desc');
  });
});

// ==========================================================================
// End-User Service
// ==========================================================================

describe('UserService (End-User)', () => {
  let db: InstanceType<typeof Database>;
  let userService: UserService;
  let roleService: RoleService;

  beforeEach(() => {
    const env = setupTestEnvironment();
    db = env.db;
    userService = env.userService;
    roleService = env.roleService;
    roleService.ensureDefaultRoles();
  });

  afterEach(() => db.close());

  it('creates an end-user', () => {
    const authRole = roleService.getAuthenticatedRole();
    const user = userService.create({
      username: 'johndoe',
      email: 'john@example.com',
      password: 'Password123!',
      confirmed: true,
      roleId: authRole.id!,
    });

    expect(user.id).toBeDefined();
    expect(user.username).toBe('johndoe');
    expect(user.email).toBe('john@example.com');
    expect(user.confirmed).toBe(true);
    expect(user.blocked).toBe(false);
    expect(user.password).toBeUndefined();
  });

  it('finds user by id', () => {
    const user = userService.create({
      username: 'jane',
      email: 'jane@example.com',
      password: 'Pass!',
    });
    const found = userService.findOne(user.id!);
    expect(found).not.toBeNull();
    expect(found!.username).toBe('jane');
  });

  it('finds user by email with password', () => {
    userService.create({
      username: 'test',
      email: 'test@example.com',
      password: 'Pass!',
    });
    const found = userService.findOneByEmail('test@example.com');
    expect(found).not.toBeNull();
    expect(found!.password).toBeDefined();
  });

  it('finds user by username', () => {
    userService.create({
      username: 'unique_user',
      email: 'unique@example.com',
      password: 'Pass!',
    });
    const found = userService.findOneByUsername('unique_user');
    expect(found).not.toBeNull();
    expect(found!.email).toBe('unique@example.com');
  });

  it('lists users with pagination', () => {
    for (let i = 0; i < 15; i++) {
      userService.create({
        username: `user${i}`,
        email: `user${i}@example.com`,
        password: 'Pass!',
      });
    }

    const page1 = userService.findPage({ page: 1, pageSize: 10 });
    expect(page1.results).toHaveLength(10);
    expect(page1.pagination.total).toBe(15);
  });

  it('updates a user', () => {
    const user = userService.create({
      username: 'update_me',
      email: 'update@example.com',
      password: 'Pass!',
    });

    const updated = userService.updateById(user.id!, { blocked: true });
    expect(updated).not.toBeNull();
    expect(updated!.blocked).toBe(true);
  });

  it('deletes a user', () => {
    const user = userService.create({
      username: 'delete_me',
      email: 'delete@example.com',
      password: 'Pass!',
    });

    expect(userService.deleteById(user.id!)).toBe(true);
    expect(userService.findOne(user.id!)).toBeNull();
  });

  it('hashes and verifies passwords', () => {
    const hash = userService.hashPassword('SecurePass!');
    expect(userService.verifyPassword('SecurePass!', hash)).toBe(true);
    expect(userService.verifyPassword('WrongPass', hash)).toBe(false);
  });

  it('counts users', () => {
    expect(userService.count()).toBe(0);
    userService.create({ username: 'a', email: 'a@b.com', password: 'x' });
    expect(userService.count()).toBe(1);
  });

  it('includes role info in user', () => {
    const authRole = roleService.getAuthenticatedRole();
    const user = userService.create({
      username: 'roleuser',
      email: 'role@example.com',
      password: 'Pass!',
      roleId: authRole.id!,
    });

    expect(user.roleId).toBe(authRole.id);
    expect(user.roleName).toBe('Authenticated');
    expect(user.roleType).toBe('authenticated');
  });
});

// ==========================================================================
// End-User Auth Service
// ==========================================================================

describe('UserAuthService', () => {
  let db: InstanceType<typeof Database>;
  let authService: UserAuthService;
  let userService: UserService;

  beforeEach(() => {
    const env = setupTestEnvironment();
    db = env.db;
    authService = env.authService;
    userService = env.userService;
  });

  afterEach(() => db.close());

  it('registers a new user', () => {
    const result = authService.register({
      username: 'newuser',
      email: 'new@example.com',
      password: 'Password123!',
    });

    expect(result.jwt).toBeDefined();
    expect(result.user.username).toBe('newuser');
    expect(result.user.email).toBe('new@example.com');
    expect(result.user.confirmed).toBe(true);
  });

  it('rejects duplicate email', () => {
    authService.register({
      username: 'first',
      email: 'dup@example.com',
      password: 'Pass!',
    });

    expect(() => authService.register({
      username: 'second',
      email: 'dup@example.com',
      password: 'Pass!',
    })).toThrow('Email already taken');
  });

  it('rejects duplicate username', () => {
    authService.register({
      username: 'dupuser',
      email: 'a@example.com',
      password: 'Pass!',
    });

    expect(() => authService.register({
      username: 'dupuser',
      email: 'b@example.com',
      password: 'Pass!',
    })).toThrow('Username already taken');
  });

  it('logs in with valid credentials', () => {
    authService.register({
      username: 'loginuser',
      email: 'login@example.com',
      password: 'CorrectPass!',
    });

    const result = authService.login('login@example.com', 'CorrectPass!');
    expect(result.jwt).toBeDefined();
    expect(result.user.email).toBe('login@example.com');
    expect(result.user.password).toBeUndefined();
  });

  it('rejects invalid password', () => {
    authService.register({
      username: 'badpass',
      email: 'bad@example.com',
      password: 'CorrectPass!',
    });

    expect(() => authService.login('bad@example.com', 'WrongPass'))
      .toThrow('Invalid identifier or password');
  });

  it('rejects non-existent email', () => {
    expect(() => authService.login('nobody@example.com', 'any'))
      .toThrow('Invalid identifier or password');
  });

  it('rejects blocked user', () => {
    const result = authService.register({
      username: 'blocked',
      email: 'blocked@example.com',
      password: 'Pass!',
    });
    userService.updateById(result.user.id!, { blocked: true });

    expect(() => authService.login('blocked@example.com', 'Pass!'))
      .toThrow('blocked');
  });

  it('rejects unconfirmed user', () => {
    const result = authService.register({
      username: 'unconfirmed',
      email: 'unconf@example.com',
      password: 'Pass!',
    });
    userService.updateById(result.user.id!, { confirmed: false });

    expect(() => authService.login('unconf@example.com', 'Pass!'))
      .toThrow('not confirmed');
  });

  it('issues and verifies tokens', () => {
    const token = authService.issue({ id: 42 });
    const decoded = authService.verify(token);
    expect(decoded.id).toBe(42);
  });

  it('generates and uses reset tokens', () => {
    authService.register({
      username: 'resetuser',
      email: 'reset@example.com',
      password: 'OldPass!',
    });

    const code = authService.forgotPassword('reset@example.com');
    expect(code).not.toBeNull();

    const result = authService.resetPassword(code!, 'NewPass!', 'NewPass!');
    expect(result).not.toBeNull();
    expect(result!.jwt).toBeDefined();

    // Can login with new password
    const login = authService.login('reset@example.com', 'NewPass!');
    expect(login.jwt).toBeDefined();
  });

  it('rejects mismatched password confirmation', () => {
    authService.register({
      username: 'mismatch',
      email: 'mismatch@example.com',
      password: 'Pass!',
    });

    const code = authService.forgotPassword('mismatch@example.com');
    expect(() => authService.resetPassword(code!, 'NewPass', 'DifferentPass'))
      .toThrow('Passwords do not match');
  });

  it('returns null reset for non-existent email', () => {
    expect(authService.forgotPassword('nobody@example.com')).toBeNull();
  });

  it('returns null for invalid reset code', () => {
    expect(authService.resetPassword('invalid-code', 'Pass', 'Pass')).toBeNull();
  });

  it('changes password', () => {
    const result = authService.register({
      username: 'changepass',
      email: 'change@example.com',
      password: 'OldPass!',
    });

    expect(authService.changePassword(result.user.id!, 'OldPass!', 'NewPass!')).toBe(true);

    // Can login with new password
    const login = authService.login('change@example.com', 'NewPass!');
    expect(login.jwt).toBeDefined();
  });

  it('rejects wrong current password on change', () => {
    const result = authService.register({
      username: 'wrongcurrent',
      email: 'wrong@example.com',
      password: 'Pass!',
    });

    expect(() => authService.changePassword(result.user.id!, 'WrongCurrent', 'New'))
      .toThrow('Current password is incorrect');
  });

  it('handles email confirmation flow', () => {
    // Create unconfirmed user directly
    const env = setupTestEnvironment();
    env.roleService.ensureDefaultRoles();
    const role = env.roleService.getAuthenticatedRole();
    const user = env.userService.create({
      username: 'unconf',
      email: 'unconf@test.com',
      password: 'Pass!',
      confirmed: false,
      roleId: role.id!,
    });

    const authSvc = createUserAuthService({
      userService: env.userService,
      roleService: env.roleService,
      secret: JWT_SECRET,
    });

    const token = authSvc.generateConfirmationToken('unconf@test.com');
    expect(token).not.toBeNull();

    const result = authSvc.confirmEmail(token!);
    expect(result).not.toBeNull();
    expect(result!.user.confirmed).toBe(true);

    env.db.close();
  });

  it('returns null confirmation for already confirmed user', () => {
    authService.register({
      username: 'confirmed',
      email: 'confirmed@example.com',
      password: 'Pass!',
    });

    expect(authService.generateConfirmationToken('confirmed@example.com')).toBeNull();
  });
});

// ==========================================================================
// Routes
// ==========================================================================

describe('Users-Permissions Routes', () => {
  let env: ReturnType<typeof setupTestEnvironment>;

  beforeEach(() => {
    env = setupTestEnvironment();
    registerUsersPermissionsRoutes({
      server: env.server,
      authService: env.authService,
      userService: env.userService,
      roleService: env.roleService,
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

  it('registers all expected auth routes', () => {
    expect(findRoute('POST', '/api/auth/local')).toBeDefined();
    expect(findRoute('POST', '/api/auth/local/register')).toBeDefined();
    expect(findRoute('POST', '/api/auth/forgot-password')).toBeDefined();
    expect(findRoute('POST', '/api/auth/reset-password')).toBeDefined();
    expect(findRoute('POST', '/api/auth/change-password')).toBeDefined();
    expect(findRoute('POST', '/api/auth/send-email-confirmation')).toBeDefined();
    expect(findRoute('GET', '/api/auth/email-confirmation')).toBeDefined();
  });

  it('registers all expected admin routes', () => {
    expect(findRoute('GET', '/admin/users-permissions/roles')).toBeDefined();
    expect(findRoute('POST', '/admin/users-permissions/roles')).toBeDefined();
    expect(findRoute('PUT', '/admin/users-permissions/roles/:id')).toBeDefined();
    expect(findRoute('PUT', '/admin/users-permissions/roles/:id/permissions')).toBeDefined();
    expect(findRoute('DELETE', '/admin/users-permissions/roles/:id')).toBeDefined();
    expect(findRoute('GET', '/admin/users-permissions/users')).toBeDefined();
  });

  it('POST /api/auth/local/register registers a user', async () => {
    const route = findRoute('POST', '/api/auth/local/register')!;
    const ctx = mockCtx({
      body: { username: 'newuser', email: 'new@test.com', password: 'Pass123!' },
    });
    await route.handler(ctx);

    expect(ctx.status).toBe(200);
    expect(ctx.body.jwt).toBeDefined();
    expect(ctx.body.user.username).toBe('newuser');
  });

  it('POST /api/auth/local logs in', async () => {
    // Register first
    const regRoute = findRoute('POST', '/api/auth/local/register')!;
    await regRoute.handler(mockCtx({
      body: { username: 'logintest', email: 'login@test.com', password: 'Pass123!' },
    }));

    // Login
    const loginRoute = findRoute('POST', '/api/auth/local')!;
    const ctx = mockCtx({
      body: { identifier: 'login@test.com', password: 'Pass123!' },
    });
    await loginRoute.handler(ctx);

    expect(ctx.status).toBe(200);
    expect(ctx.body.jwt).toBeDefined();
  });

  it('POST /api/auth/local rejects wrong password', async () => {
    const regRoute = findRoute('POST', '/api/auth/local/register')!;
    await regRoute.handler(mockCtx({
      body: { username: 'wrongtest', email: 'wrong@test.com', password: 'Pass123!' },
    }));

    const loginRoute = findRoute('POST', '/api/auth/local')!;
    const ctx = mockCtx({
      body: { identifier: 'wrong@test.com', password: 'WrongPass' },
    });
    await loginRoute.handler(ctx);

    expect(ctx.status).toBe(400);
  });

  it('GET /admin/users-permissions/roles lists roles', async () => {
    env.roleService.ensureDefaultRoles();

    const route = findRoute('GET', '/admin/users-permissions/roles')!;
    const ctx = mockCtx();
    await route.handler(ctx);

    expect(ctx.body.roles).toHaveLength(2);
  });

  it('PUT /admin/users-permissions/roles/:id/permissions sets permissions', async () => {
    env.roleService.ensureDefaultRoles();
    const publicRole = env.roleService.getPublicRole();

    const route = findRoute('PUT', '/admin/users-permissions/roles/:id/permissions')!;
    const ctx = mockCtx({
      params: { id: String(publicRole.id) },
      body: {
        permissions: {
          'api::article.article.find': true,
          'api::article.article.findOne': true,
        },
      },
    });
    await route.handler(ctx);

    expect(ctx.status).toBe(200);
    expect(ctx.body.permissions['api::article.article.find']).toBe(true);
  });

  it('POST /api/auth/forgot-password always returns 200', async () => {
    const route = findRoute('POST', '/api/auth/forgot-password')!;
    const ctx = mockCtx({ body: { email: 'nonexistent@test.com' } });
    await route.handler(ctx);

    expect(ctx.status).toBe(200);
    expect(ctx.body.ok).toBe(true);
  });
});
