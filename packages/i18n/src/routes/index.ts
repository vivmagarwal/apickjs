/**
 * i18n Routes.
 *
 * Registers admin API endpoints for locale management.
 */

import type { LocaleService } from '../services/locale.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface I18nRouteConfig {
  server: any;
  localeService: LocaleService;
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

export function registerI18nRoutes(config: I18nRouteConfig): void {
  const { server, localeService } = config;
  const prefix = config.prefix || '/admin/i18n';

  // GET /admin/i18n/locales
  server.route({
    method: 'GET',
    path: `${prefix}/locales`,
    handler: async (ctx: any) => {
      ok(ctx, localeService.findAll());
    },
  });

  // GET /admin/i18n/locales/:id
  server.route({
    method: 'GET',
    path: `${prefix}/locales/:id`,
    handler: async (ctx: any) => {
      const id = parseInt(ctx.params.id, 10);
      const locale = localeService.findOne(id);
      if (!locale) return error(ctx, 404, 'NotFoundError', 'Locale not found');
      ok(ctx, locale);
    },
  });

  // POST /admin/i18n/locales
  server.route({
    method: 'POST',
    path: `${prefix}/locales`,
    handler: async (ctx: any) => {
      try {
        const body = ctx.request.body;
        if (!body?.code || !body?.name) {
          return error(ctx, 400, 'ValidationError', 'Missing code or name');
        }

        // Check for duplicate
        if (localeService.findByCode(body.code)) {
          return error(ctx, 409, 'ConflictError', `Locale '${body.code}' already exists`);
        }

        const locale = localeService.create(body);
        created(ctx, locale);
      } catch (err: any) {
        error(ctx, 400, 'ApplicationError', err.message);
      }
    },
  });

  // PUT /admin/i18n/locales/:id
  server.route({
    method: 'PUT',
    path: `${prefix}/locales/:id`,
    handler: async (ctx: any) => {
      const id = parseInt(ctx.params.id, 10);
      const body = ctx.request.body;
      const updated = localeService.updateById(id, body || {});
      if (!updated) return error(ctx, 404, 'NotFoundError', 'Locale not found');
      ok(ctx, updated);
    },
  });

  // DELETE /admin/i18n/locales/:id
  server.route({
    method: 'DELETE',
    path: `${prefix}/locales/:id`,
    handler: async (ctx: any) => {
      const id = parseInt(ctx.params.id, 10);
      const locale = localeService.findOne(id);
      if (!locale) return error(ctx, 404, 'NotFoundError', 'Locale not found');

      if (locale.isDefault) {
        return error(ctx, 400, 'ApplicationError', 'Cannot delete the default locale');
      }

      localeService.deleteById(id);
      ok(ctx, { id });
    },
  });

  // PUT /admin/i18n/locales/default
  server.route({
    method: 'PUT',
    path: `${prefix}/locales/default`,
    handler: async (ctx: any) => {
      const body = ctx.request.body;
      if (!body?.code) {
        return error(ctx, 400, 'ValidationError', 'Missing locale code');
      }

      const locale = localeService.setDefaultLocale(body.code);
      if (!locale) return error(ctx, 404, 'NotFoundError', 'Locale not found');
      ok(ctx, locale);
    },
  });
}
