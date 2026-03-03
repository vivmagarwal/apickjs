/**
 * Admin API Routes.
 *
 * Registers all admin endpoints on the server:
 *   - /admin/init, /admin/register-admin, /admin/login
 *   - /admin/users CRUD
 *   - /admin/roles CRUD with permissions
 *   - /admin/api-tokens CRUD
 *   - /admin/information, /admin/project-settings
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AdminApiConfig {
  /** The server to register routes on */
  server: any;
  /** Admin auth service */
  authService: any;
  /** Admin user service */
  userService: any;
  /** Admin role service */
  roleService: any;
  /** API token service */
  apiTokenService: any;
  /** Optional: base prefix (default: '/admin') */
  prefix?: string;
}

// ---------------------------------------------------------------------------
// Response helpers
// ---------------------------------------------------------------------------

function ok(ctx: any, data: any): void {
  ctx.status = 200;
  ctx.body = { data };
}

function created(ctx: any, data: any): void {
  ctx.status = 201;
  ctx.body = { data };
}

function error(ctx: any, status: number, name: string, message: string): void {
  ctx.status = status;
  ctx.body = { data: null, error: { status, name, message } };
}

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

export function registerAdminApi(config: AdminApiConfig): void {
  const { server, authService, userService, roleService, apiTokenService } = config;
  const prefix = config.prefix || '/admin';

  // ========================================================================
  // Public routes (no auth required)
  // ========================================================================

  // GET /admin/init — server initialization info
  server.route({
    method: 'GET',
    path: `${prefix}/init`,
    handler: async (ctx: any) => {
      ok(ctx, { hasAdmin: authService.hasAdmin() });
    },
  });

  // POST /admin/register-admin — first admin registration
  server.route({
    method: 'POST',
    path: `${prefix}/register-admin`,
    handler: async (ctx: any) => {
      try {
        const body = ctx.request.body;
        if (!body?.firstname || !body?.lastname || !body?.email || !body?.password) {
          return error(ctx, 400, 'ValidationError', 'Missing required fields: firstname, lastname, email, password');
        }

        const result = authService.registerFirstAdmin(body);
        ok(ctx, result);
      } catch (err: any) {
        if (err.message?.includes('forbidden')) {
          return error(ctx, 403, 'ForbiddenError', err.message);
        }
        error(ctx, 400, 'ApplicationError', err.message);
      }
    },
  });

  // POST /admin/login
  server.route({
    method: 'POST',
    path: `${prefix}/login`,
    handler: async (ctx: any) => {
      try {
        const body = ctx.request.body;
        if (!body?.email || !body?.password) {
          return error(ctx, 400, 'ValidationError', 'Missing email or password');
        }

        const result = authService.login(body.email, body.password);
        ok(ctx, result);
      } catch (err: any) {
        error(ctx, 401, 'UnauthorizedError', err.message);
      }
    },
  });

  // POST /admin/forgot-password
  server.route({
    method: 'POST',
    path: `${prefix}/forgot-password`,
    handler: async (ctx: any) => {
      const body = ctx.request.body;
      if (!body?.email) {
        return error(ctx, 400, 'ValidationError', 'Missing email');
      }

      // Always return 200 to prevent email enumeration
      authService.generateResetToken(body.email);
      ok(ctx, { ok: true });
    },
  });

  // POST /admin/reset-password
  server.route({
    method: 'POST',
    path: `${prefix}/reset-password`,
    handler: async (ctx: any) => {
      const body = ctx.request.body;
      if (!body?.resetPasswordToken || !body?.password) {
        return error(ctx, 400, 'ValidationError', 'Missing resetPasswordToken or password');
      }

      const success = authService.resetPassword(body.resetPasswordToken, body.password);
      if (!success) {
        return error(ctx, 400, 'ApplicationError', 'Invalid or expired reset token');
      }
      ok(ctx, { ok: true });
    },
  });

  // ========================================================================
  // Protected routes (auth required — middleware checks externally)
  // ========================================================================

  // POST /admin/renew-token
  server.route({
    method: 'POST',
    path: `${prefix}/renew-token`,
    handler: async (ctx: any) => {
      try {
        const body = ctx.request.body;
        if (!body?.token) {
          return error(ctx, 400, 'ValidationError', 'Missing token');
        }
        const result = authService.renewToken(body.token);
        ok(ctx, result);
      } catch (err: any) {
        error(ctx, 401, 'UnauthorizedError', err.message);
      }
    },
  });

  // --- Admin Users ---

  // GET /admin/users
  server.route({
    method: 'GET',
    path: `${prefix}/users`,
    handler: async (ctx: any) => {
      const page = parseInt(ctx.query?.page || '1', 10);
      const pageSize = parseInt(ctx.query?.pageSize || '10', 10);
      const result = userService.findPage({ page, pageSize });
      ok(ctx, result);
    },
  });

  // GET /admin/users/me
  server.route({
    method: 'GET',
    path: `${prefix}/users/me`,
    handler: async (ctx: any) => {
      const userId = ctx.state?.auth?.credentials?.id;
      if (!userId) return error(ctx, 401, 'UnauthorizedError', 'Not authenticated');

      const user = userService.findOne(userId);
      if (!user) return error(ctx, 404, 'NotFoundError', 'User not found');
      ok(ctx, user);
    },
  });

  // GET /admin/users/:id
  server.route({
    method: 'GET',
    path: `${prefix}/users/:id`,
    handler: async (ctx: any) => {
      const id = parseInt(ctx.params.id, 10);
      const user = userService.findOne(id);
      if (!user) return error(ctx, 404, 'NotFoundError', 'User not found');
      ok(ctx, user);
    },
  });

  // POST /admin/users
  server.route({
    method: 'POST',
    path: `${prefix}/users`,
    handler: async (ctx: any) => {
      try {
        const body = ctx.request.body;
        if (!body?.email || !body?.firstname || !body?.lastname || !body?.password) {
          return error(ctx, 400, 'ValidationError', 'Missing required fields');
        }
        const user = userService.create(body);
        created(ctx, user);
      } catch (err: any) {
        error(ctx, 400, 'ApplicationError', err.message);
      }
    },
  });

  // PUT /admin/users/:id
  server.route({
    method: 'PUT',
    path: `${prefix}/users/:id`,
    handler: async (ctx: any) => {
      const id = parseInt(ctx.params.id, 10);
      const body = ctx.request.body;
      const updated = userService.updateById(id, body || {});
      if (!updated) return error(ctx, 404, 'NotFoundError', 'User not found');
      ok(ctx, updated);
    },
  });

  // DELETE /admin/users/:id
  server.route({
    method: 'DELETE',
    path: `${prefix}/users/:id`,
    handler: async (ctx: any) => {
      const id = parseInt(ctx.params.id, 10);

      // Cannot delete yourself
      if (ctx.state?.auth?.credentials?.id === id) {
        return error(ctx, 400, 'ApplicationError', 'Cannot delete your own account');
      }

      const deleted = userService.deleteById(id);
      if (!deleted) return error(ctx, 404, 'NotFoundError', 'User not found');
      ok(ctx, { id });
    },
  });

  // --- Admin Roles ---

  // GET /admin/roles
  server.route({
    method: 'GET',
    path: `${prefix}/roles`,
    handler: async (ctx: any) => {
      ok(ctx, roleService.findAll());
    },
  });

  // GET /admin/roles/:id
  server.route({
    method: 'GET',
    path: `${prefix}/roles/:id`,
    handler: async (ctx: any) => {
      const id = parseInt(ctx.params.id, 10);
      const role = roleService.findOne(id);
      if (!role) return error(ctx, 404, 'NotFoundError', 'Role not found');
      ok(ctx, role);
    },
  });

  // POST /admin/roles
  server.route({
    method: 'POST',
    path: `${prefix}/roles`,
    handler: async (ctx: any) => {
      try {
        const body = ctx.request.body;
        if (!body?.name) return error(ctx, 400, 'ValidationError', 'Missing role name');
        const role = roleService.create(body);
        created(ctx, role);
      } catch (err: any) {
        error(ctx, 400, 'ApplicationError', err.message);
      }
    },
  });

  // PUT /admin/roles/:id
  server.route({
    method: 'PUT',
    path: `${prefix}/roles/:id`,
    handler: async (ctx: any) => {
      const id = parseInt(ctx.params.id, 10);
      const body = ctx.request.body;
      const updated = roleService.updateById(id, body || {});
      if (!updated) return error(ctx, 404, 'NotFoundError', 'Role not found');
      ok(ctx, updated);
    },
  });

  // DELETE /admin/roles/:id
  server.route({
    method: 'DELETE',
    path: `${prefix}/roles/:id`,
    handler: async (ctx: any) => {
      const id = parseInt(ctx.params.id, 10);
      const deleted = roleService.deleteById(id);
      if (!deleted) return error(ctx, 400, 'ApplicationError', 'Cannot delete built-in role or role not found');
      ok(ctx, { id });
    },
  });

  // GET /admin/roles/:id/permissions
  server.route({
    method: 'GET',
    path: `${prefix}/roles/:id/permissions`,
    handler: async (ctx: any) => {
      const id = parseInt(ctx.params.id, 10);
      const role = roleService.findOne(id);
      if (!role) return error(ctx, 404, 'NotFoundError', 'Role not found');
      ok(ctx, roleService.getPermissions(id));
    },
  });

  // PUT /admin/roles/:id/permissions
  server.route({
    method: 'PUT',
    path: `${prefix}/roles/:id/permissions`,
    handler: async (ctx: any) => {
      const id = parseInt(ctx.params.id, 10);
      const body = ctx.request.body;
      if (!body?.permissions || !Array.isArray(body.permissions)) {
        return error(ctx, 400, 'ValidationError', 'Missing permissions array');
      }
      const role = roleService.findOne(id);
      if (!role) return error(ctx, 404, 'NotFoundError', 'Role not found');

      const perms = roleService.setPermissions(id, body.permissions);
      ok(ctx, perms);
    },
  });

  // --- API Tokens ---

  // GET /admin/api-tokens
  server.route({
    method: 'GET',
    path: `${prefix}/api-tokens`,
    handler: async (ctx: any) => {
      ok(ctx, apiTokenService.findAll());
    },
  });

  // GET /admin/api-tokens/:id
  server.route({
    method: 'GET',
    path: `${prefix}/api-tokens/:id`,
    handler: async (ctx: any) => {
      const id = parseInt(ctx.params.id, 10);
      const token = apiTokenService.findOne(id);
      if (!token) return error(ctx, 404, 'NotFoundError', 'API token not found');
      ok(ctx, token);
    },
  });

  // POST /admin/api-tokens
  server.route({
    method: 'POST',
    path: `${prefix}/api-tokens`,
    handler: async (ctx: any) => {
      try {
        const body = ctx.request.body;
        if (!body?.name || !body?.type) {
          return error(ctx, 400, 'ValidationError', 'Missing name or type');
        }
        const token = apiTokenService.create(body);
        created(ctx, token);
      } catch (err: any) {
        error(ctx, 400, 'ApplicationError', err.message);
      }
    },
  });

  // PUT /admin/api-tokens/:id
  server.route({
    method: 'PUT',
    path: `${prefix}/api-tokens/:id`,
    handler: async (ctx: any) => {
      const id = parseInt(ctx.params.id, 10);
      const body = ctx.request.body;
      const updated = apiTokenService.updateById(id, body || {});
      if (!updated) return error(ctx, 404, 'NotFoundError', 'API token not found');
      ok(ctx, updated);
    },
  });

  // DELETE /admin/api-tokens/:id
  server.route({
    method: 'DELETE',
    path: `${prefix}/api-tokens/:id`,
    handler: async (ctx: any) => {
      const id = parseInt(ctx.params.id, 10);
      const deleted = apiTokenService.deleteById(id);
      if (!deleted) return error(ctx, 404, 'NotFoundError', 'API token not found');
      ok(ctx, { id });
    },
  });

  // POST /admin/api-tokens/:id/regenerate
  server.route({
    method: 'POST',
    path: `${prefix}/api-tokens/:id/regenerate`,
    handler: async (ctx: any) => {
      const id = parseInt(ctx.params.id, 10);
      const result = apiTokenService.regenerate(id);
      if (!result) return error(ctx, 404, 'NotFoundError', 'API token not found');
      ok(ctx, result);
    },
  });
}
