/**
 * Users-Permissions Routes.
 *
 * Registers public auth endpoints (/api/auth/*) and admin
 * role management endpoints (/admin/users-permissions/*).
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface UsersPermissionsRouteConfig {
  server: any;
  authService: any;
  userService: any;
  roleService: any;
  prefix?: string;
  adminPrefix?: string;
}

// ---------------------------------------------------------------------------
// Response helpers
// ---------------------------------------------------------------------------

function ok(ctx: any, data: any): void {
  ctx.status = 200;
  ctx.body = data;
}

function error(ctx: any, status: number, name: string, message: string): void {
  ctx.status = status;
  ctx.body = { data: null, error: { status, name, message } };
}

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

export function registerUsersPermissionsRoutes(config: UsersPermissionsRouteConfig): void {
  const { server, authService, userService, roleService } = config;
  const prefix = config.prefix || '/api/auth';
  const adminPrefix = config.adminPrefix || '/admin/users-permissions';

  // ========================================================================
  // Public Auth Routes
  // ========================================================================

  // POST /api/auth/local — Login
  server.route({
    method: 'POST',
    path: `${prefix}/local`,
    handler: async (ctx: any) => {
      try {
        const body = ctx.request.body;
        if (!body?.identifier && !body?.email) {
          return error(ctx, 400, 'ValidationError', 'Missing identifier (email) or password');
        }
        if (!body?.password) {
          return error(ctx, 400, 'ValidationError', 'Missing password');
        }

        const email = body.identifier || body.email;
        const result = authService.login(email, body.password);
        ok(ctx, result);
      } catch (err: any) {
        error(ctx, 400, 'ApplicationError', err.message);
      }
    },
  });

  // POST /api/auth/local/register — Register
  server.route({
    method: 'POST',
    path: `${prefix}/local/register`,
    handler: async (ctx: any) => {
      try {
        const body = ctx.request.body;
        if (!body?.username || !body?.email || !body?.password) {
          return error(ctx, 400, 'ValidationError', 'Missing username, email, or password');
        }

        const result = authService.register(body);
        ok(ctx, result);
      } catch (err: any) {
        error(ctx, 400, 'ApplicationError', err.message);
      }
    },
  });

  // POST /api/auth/forgot-password
  server.route({
    method: 'POST',
    path: `${prefix}/forgot-password`,
    handler: async (ctx: any) => {
      const body = ctx.request.body;
      if (!body?.email) {
        return error(ctx, 400, 'ValidationError', 'Missing email');
      }

      // Always return 200 to prevent email enumeration
      authService.forgotPassword(body.email);
      ok(ctx, { ok: true });
    },
  });

  // POST /api/auth/reset-password
  server.route({
    method: 'POST',
    path: `${prefix}/reset-password`,
    handler: async (ctx: any) => {
      try {
        const body = ctx.request.body;
        if (!body?.code || !body?.password || !body?.passwordConfirmation) {
          return error(ctx, 400, 'ValidationError', 'Missing code, password, or passwordConfirmation');
        }

        const result = authService.resetPassword(body.code, body.password, body.passwordConfirmation);
        if (!result) {
          return error(ctx, 400, 'ApplicationError', 'Invalid or expired reset code');
        }
        ok(ctx, result);
      } catch (err: any) {
        error(ctx, 400, 'ApplicationError', err.message);
      }
    },
  });

  // POST /api/auth/change-password (authenticated)
  server.route({
    method: 'POST',
    path: `${prefix}/change-password`,
    handler: async (ctx: any) => {
      try {
        const userId = ctx.state?.auth?.credentials?.id;
        if (!userId) return error(ctx, 401, 'UnauthorizedError', 'Not authenticated');

        const body = ctx.request.body;
        if (!body?.currentPassword || !body?.password || !body?.passwordConfirmation) {
          return error(ctx, 400, 'ValidationError', 'Missing currentPassword, password, or passwordConfirmation');
        }

        if (body.password !== body.passwordConfirmation) {
          return error(ctx, 400, 'ValidationError', 'Passwords do not match');
        }

        authService.changePassword(userId, body.currentPassword, body.password);
        ok(ctx, { ok: true });
      } catch (err: any) {
        error(ctx, 400, 'ApplicationError', err.message);
      }
    },
  });

  // POST /api/auth/send-email-confirmation
  server.route({
    method: 'POST',
    path: `${prefix}/send-email-confirmation`,
    handler: async (ctx: any) => {
      const body = ctx.request.body;
      if (!body?.email) {
        return error(ctx, 400, 'ValidationError', 'Missing email');
      }

      authService.generateConfirmationToken(body.email);
      ok(ctx, { email: body.email, sent: true });
    },
  });

  // GET /api/auth/email-confirmation
  server.route({
    method: 'GET',
    path: `${prefix}/email-confirmation`,
    handler: async (ctx: any) => {
      const token = ctx.query?.confirmation;
      if (!token) {
        return error(ctx, 400, 'ValidationError', 'Missing confirmation token');
      }

      const result = authService.confirmEmail(token);
      if (!result) {
        return error(ctx, 400, 'ApplicationError', 'Invalid or expired confirmation token');
      }
      ok(ctx, result);
    },
  });

  // ========================================================================
  // Admin Role Management Routes
  // ========================================================================

  // GET /admin/users-permissions/roles
  server.route({
    method: 'GET',
    path: `${adminPrefix}/roles`,
    handler: async (ctx: any) => {
      ok(ctx, { roles: roleService.findAll() });
    },
  });

  // GET /admin/users-permissions/roles/:id
  server.route({
    method: 'GET',
    path: `${adminPrefix}/roles/:id`,
    handler: async (ctx: any) => {
      const id = parseInt(ctx.params.id, 10);
      const role = roleService.findOne(id);
      if (!role) return error(ctx, 404, 'NotFoundError', 'Role not found');
      ok(ctx, { role });
    },
  });

  // POST /admin/users-permissions/roles
  server.route({
    method: 'POST',
    path: `${adminPrefix}/roles`,
    handler: async (ctx: any) => {
      try {
        const body = ctx.request.body;
        if (!body?.name || !body?.type) {
          return error(ctx, 400, 'ValidationError', 'Missing role name or type');
        }
        const role = roleService.create(body);
        ok(ctx, { role });
      } catch (err: any) {
        error(ctx, 400, 'ApplicationError', err.message);
      }
    },
  });

  // PUT /admin/users-permissions/roles/:id
  server.route({
    method: 'PUT',
    path: `${adminPrefix}/roles/:id`,
    handler: async (ctx: any) => {
      const id = parseInt(ctx.params.id, 10);
      const body = ctx.request.body;
      const updated = roleService.updateById(id, body || {});
      if (!updated) return error(ctx, 404, 'NotFoundError', 'Role not found');
      ok(ctx, { role: updated });
    },
  });

  // PUT /admin/users-permissions/roles/:id/permissions
  server.route({
    method: 'PUT',
    path: `${adminPrefix}/roles/:id/permissions`,
    handler: async (ctx: any) => {
      const id = parseInt(ctx.params.id, 10);
      const body = ctx.request.body;
      if (!body?.permissions || typeof body.permissions !== 'object') {
        return error(ctx, 400, 'ValidationError', 'Missing permissions object');
      }

      const role = roleService.findOne(id);
      if (!role) return error(ctx, 404, 'NotFoundError', 'Role not found');

      const perms = roleService.setPermissions(id, body.permissions);
      ok(ctx, { permissions: perms });
    },
  });

  // DELETE /admin/users-permissions/roles/:id
  server.route({
    method: 'DELETE',
    path: `${adminPrefix}/roles/:id`,
    handler: async (ctx: any) => {
      const id = parseInt(ctx.params.id, 10);
      const deleted = roleService.deleteById(id);
      if (!deleted) {
        return error(ctx, 400, 'ApplicationError', 'Cannot delete built-in role or role not found');
      }
      ok(ctx, { id });
    },
  });

  // ========================================================================
  // Admin User Management Routes
  // ========================================================================

  // GET /admin/users-permissions/users
  server.route({
    method: 'GET',
    path: `${adminPrefix}/users`,
    handler: async (ctx: any) => {
      const page = parseInt(ctx.query?.page || '1', 10);
      const pageSize = parseInt(ctx.query?.pageSize || '10', 10);
      const result = userService.findPage({ page, pageSize });
      ok(ctx, result);
    },
  });

  // GET /admin/users-permissions/users/:id
  server.route({
    method: 'GET',
    path: `${adminPrefix}/users/:id`,
    handler: async (ctx: any) => {
      const id = parseInt(ctx.params.id, 10);
      const user = userService.findOne(id);
      if (!user) return error(ctx, 404, 'NotFoundError', 'User not found');
      ok(ctx, user);
    },
  });

  // PUT /admin/users-permissions/users/:id
  server.route({
    method: 'PUT',
    path: `${adminPrefix}/users/:id`,
    handler: async (ctx: any) => {
      const id = parseInt(ctx.params.id, 10);
      const body = ctx.request.body;
      const updated = userService.updateById(id, body || {});
      if (!updated) return error(ctx, 404, 'NotFoundError', 'User not found');
      ok(ctx, updated);
    },
  });

  // DELETE /admin/users-permissions/users/:id
  server.route({
    method: 'DELETE',
    path: `${adminPrefix}/users/:id`,
    handler: async (ctx: any) => {
      const id = parseInt(ctx.params.id, 10);
      const deleted = userService.deleteById(id);
      if (!deleted) return error(ctx, 404, 'NotFoundError', 'User not found');
      ok(ctx, { id });
    },
  });
}
