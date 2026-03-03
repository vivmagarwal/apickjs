/**
 * Content API — auto-generates REST endpoints for all registered content types.
 *
 * For each content type in the registry, this module registers the appropriate
 * HTTP routes on the Apick server:
 *
 *   Collection types:
 *     GET    /{prefix}/{plural}              → find
 *     GET    /{prefix}/{plural}/:id          → findOne
 *     POST   /{prefix}/{plural}              → create
 *     PUT    /{prefix}/{plural}/:id          → update
 *     DELETE /{prefix}/{plural}/:id          → delete
 *     POST   /{prefix}/{plural}/:id/publish  → publish
 *     POST   /{prefix}/{plural}/:id/unpublish → unpublish
 *
 *   Single types:
 *     GET    /{prefix}/{singular}            → find
 *     PUT    /{prefix}/{singular}            → createOrUpdate
 *     DELETE /{prefix}/{singular}            → delete
 *
 * Query parameters:
 *   - status=draft|published   → filter by publication status (default: published)
 *   - filters[field]=value     → WHERE clause
 *   - sort=field:asc           → ORDER BY
 *   - fields=field1,field2     → SELECT
 *   - pagination[page]=1       → page-based pagination
 *   - pagination[start]=0      → offset-based pagination
 */

import type { Apick, ApickContext } from '@apick/types';

// ---------------------------------------------------------------------------
// Query parameter parsing
// ---------------------------------------------------------------------------

interface ParsedQuery {
  status?: 'published' | 'draft';
  filters?: Record<string, any>;
  sort?: string | string[];
  fields?: string[];
  populate?: any;
  pagination?: { page?: number; pageSize?: number } | { start?: number; limit?: number };
}

/**
 * Extracts structured query parameters from the raw request query string.
 */
function parseQueryParams(query: Record<string, any>): ParsedQuery {
  const result: ParsedQuery = {};

  // --- Status ---
  if (query.status === 'draft' || query.status === 'published') {
    result.status = query.status;
  }

  // --- Filters ---
  if (query.filters) {
    if (typeof query.filters === 'string') {
      try {
        result.filters = JSON.parse(query.filters);
      } catch {
        result.filters = {};
      }
    } else if (typeof query.filters === 'object') {
      result.filters = query.filters;
    }
  }

  // --- Sort ---
  if (query.sort) {
    if (typeof query.sort === 'string') {
      result.sort = query.sort.split(',').map((s: string) => s.trim());
    } else if (Array.isArray(query.sort)) {
      result.sort = query.sort;
    }
  }

  // --- Fields ---
  if (query.fields) {
    if (typeof query.fields === 'string') {
      result.fields = query.fields.split(',').map((f: string) => f.trim());
    } else if (Array.isArray(query.fields)) {
      result.fields = query.fields;
    }
  }

  // --- Populate ---
  if (query.populate) {
    if (typeof query.populate === 'string') {
      if (query.populate === '*') {
        result.populate = true;
      } else {
        result.populate = query.populate.split(',').map((p: string) => p.trim());
      }
    } else {
      result.populate = query.populate;
    }
  }

  // --- Pagination ---
  if (query.pagination) {
    if (typeof query.pagination === 'object') {
      const pg = query.pagination;
      if (pg.page !== undefined) {
        result.pagination = {
          page: Number(pg.page) || 1,
          pageSize: Number(pg.pageSize) || 25,
        };
      } else if (pg.start !== undefined) {
        result.pagination = {
          start: Number(pg.start) || 0,
          limit: Number(pg.limit) || 25,
        };
      }
    }
  } else {
    // Support flat pagination params: page, pageSize, start, limit
    if (query.page !== undefined) {
      result.pagination = {
        page: Number(query.page) || 1,
        pageSize: Number(query.pageSize) || 25,
      };
    } else if (query.start !== undefined) {
      result.pagination = {
        start: Number(query.start) || 0,
        limit: Number(query.limit) || 25,
      };
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Response helpers
// ---------------------------------------------------------------------------

/**
 * Wraps a value in the standard `{ data, meta }` envelope if not already wrapped.
 */
function wrapResponse(value: any, meta?: Record<string, any>): { data: any; meta: Record<string, any> } {
  if (value && typeof value === 'object' && 'data' in value && 'meta' in value) {
    return value;
  }
  return { data: value ?? null, meta: meta ?? {} };
}

/**
 * Builds a standard error response payload.
 */
function errorResponse(
  status: number,
  name: string,
  message: string,
  details?: any,
): { data: null; error: { status: number; name: string; message: string; details?: any } } {
  return {
    data: null,
    error: {
      status,
      name,
      message,
      ...(details !== undefined ? { details } : {}),
    },
  };
}

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

/**
 * Registers auto-generated REST API routes for every content type in the registry.
 *
 * Should be called during the Apick bootstrap phase, after all content types
 * have been registered and controllers/services are available.
 */
export function registerContentApi(apick: any): void {
  const prefix = apick.config.get('api.rest.prefix', '/api');

  // Iterate over all registered content types
  for (const [uid, schema] of apick.contentTypes) {
    if (!schema || !schema.info) {
      continue;
    }

    const kind: string = schema.kind;
    const singularName: string = schema.info.singularName;
    const pluralName: string = schema.info.pluralName;

    if (!singularName || !pluralName) {
      continue;
    }

    // Resolve the controller for this content type.
    let controller: any;
    try {
      controller = apick.controller(uid);
    } catch {
      // Controller doesn't exist — skip gracefully
    }

    if (kind === 'collectionType') {
      registerCollectionRoutes(apick, uid, prefix, pluralName, controller);
    } else if (kind === 'singleType') {
      registerSingleRoutes(apick, uid, prefix, singularName, controller);
    }
  }
}

// ---------------------------------------------------------------------------
// Collection type routes
// ---------------------------------------------------------------------------

function registerCollectionRoutes(
  apick: any,
  uid: string,
  prefix: string,
  pluralName: string,
  controller: any,
): void {
  const basePath = `${prefix}/${pluralName}`;

  // GET /{prefix}/{plural} — find all
  apick.server.route({
    method: 'GET',
    path: basePath,
    handler: createCollectionFindHandler(apick, uid, controller),
  });

  // GET /{prefix}/{plural}/:id — find one
  apick.server.route({
    method: 'GET',
    path: `${basePath}/:id`,
    handler: createCollectionFindOneHandler(apick, uid, controller),
  });

  // POST /{prefix}/{plural} — create
  apick.server.route({
    method: 'POST',
    path: basePath,
    handler: createCollectionCreateHandler(apick, uid, controller),
  });

  // PUT /{prefix}/{plural}/:id — update
  apick.server.route({
    method: 'PUT',
    path: `${basePath}/:id`,
    handler: createCollectionUpdateHandler(apick, uid, controller),
  });

  // DELETE /{prefix}/{plural}/:id — delete
  apick.server.route({
    method: 'DELETE',
    path: `${basePath}/:id`,
    handler: createCollectionDeleteHandler(apick, uid, controller),
  });

  // POST /{prefix}/{plural}/:id/publish — publish a draft
  apick.server.route({
    method: 'POST',
    path: `${basePath}/:id/publish`,
    handler: createCollectionPublishHandler(apick, uid),
  });

  // POST /{prefix}/{plural}/:id/unpublish — unpublish
  apick.server.route({
    method: 'POST',
    path: `${basePath}/:id/unpublish`,
    handler: createCollectionUnpublishHandler(apick, uid),
  });
}

// ---------------------------------------------------------------------------
// Single type routes
// ---------------------------------------------------------------------------

function registerSingleRoutes(
  apick: any,
  uid: string,
  prefix: string,
  singularName: string,
  controller: any,
): void {
  const basePath = `${prefix}/${singularName}`;

  // GET /{prefix}/{singular} — find
  apick.server.route({
    method: 'GET',
    path: basePath,
    handler: createSingleFindHandler(apick, uid, controller),
  });

  // PUT /{prefix}/{singular} — create or update
  apick.server.route({
    method: 'PUT',
    path: basePath,
    handler: createSingleUpdateHandler(apick, uid, controller),
  });

  // DELETE /{prefix}/{singular} — delete
  apick.server.route({
    method: 'DELETE',
    path: basePath,
    handler: createSingleDeleteHandler(apick, uid, controller),
  });
}

// ---------------------------------------------------------------------------
// Collection type handler factories
// ---------------------------------------------------------------------------

function createCollectionFindHandler(apick: any, uid: string, controller: any) {
  return async (ctx: ApickContext) => {
    try {
      if (controller?.find) {
        const result = await controller.find(ctx);
        ctx.body = wrapResponse(result);
        return;
      }

      const queryParams = parseQueryParams(ctx.query);
      const documents = apick.documents(uid);
      const entries = await documents.findMany({
        filters: queryParams.filters,
        sort: queryParams.sort,
        fields: queryParams.fields,
        populate: queryParams.populate,
        pagination: queryParams.pagination,
        status: queryParams.status,
      });
      const total = await documents.count({
        filters: queryParams.filters,
        status: queryParams.status,
      });

      const pagination = buildPaginationMeta(queryParams.pagination, total);
      ctx.body = wrapResponse(entries, { pagination });
    } catch (error: any) {
      handleRouteError(ctx, error);
    }
  };
}

function createCollectionFindOneHandler(apick: any, uid: string, controller: any) {
  return async (ctx: ApickContext) => {
    try {
      if (controller?.findOne) {
        const result = await controller.findOne(ctx);
        ctx.body = wrapResponse(result);
        return;
      }

      const { id } = ctx.params;
      const queryParams = parseQueryParams(ctx.query);
      const documents = apick.documents(uid);
      const entry = await documents.findOne({
        documentId: id,
        fields: queryParams.fields,
        populate: queryParams.populate,
        status: queryParams.status,
      });

      if (!entry) {
        ctx.status = 404;
        ctx.body = errorResponse(404, 'NotFoundError', 'Not Found');
        return;
      }

      ctx.body = wrapResponse(entry);
    } catch (error: any) {
      handleRouteError(ctx, error);
    }
  };
}

function createCollectionCreateHandler(apick: any, uid: string, controller: any) {
  return async (ctx: ApickContext) => {
    try {
      if (controller?.create) {
        const result = await controller.create(ctx);
        ctx.status = 201;
        ctx.body = wrapResponse(result);
        return;
      }

      const body = ctx.request.body;
      if (!body || !body.data) {
        ctx.status = 400;
        ctx.body = errorResponse(400, 'ValidationError', 'Missing "data" in request body');
        return;
      }

      const documents = apick.documents(uid);
      const entry = await documents.create({
        data: body.data,
        status: body.status || undefined,
      });

      ctx.status = 201;
      ctx.body = wrapResponse(entry);
    } catch (error: any) {
      handleRouteError(ctx, error);
    }
  };
}

function createCollectionUpdateHandler(apick: any, uid: string, controller: any) {
  return async (ctx: ApickContext) => {
    try {
      if (controller?.update) {
        const result = await controller.update(ctx);
        ctx.body = wrapResponse(result);
        return;
      }

      const { id } = ctx.params;
      const body = ctx.request.body;
      if (!body || !body.data) {
        ctx.status = 400;
        ctx.body = errorResponse(400, 'ValidationError', 'Missing "data" in request body');
        return;
      }

      const documents = apick.documents(uid);
      const entry = await documents.update({ documentId: id, data: body.data });

      if (!entry) {
        ctx.status = 404;
        ctx.body = errorResponse(404, 'NotFoundError', 'Not Found');
        return;
      }

      ctx.body = wrapResponse(entry);
    } catch (error: any) {
      handleRouteError(ctx, error);
    }
  };
}

function createCollectionDeleteHandler(apick: any, uid: string, controller: any) {
  return async (ctx: ApickContext) => {
    try {
      if (controller?.delete) {
        const result = await controller.delete(ctx);
        ctx.body = wrapResponse(result);
        return;
      }

      const { id } = ctx.params;
      const documents = apick.documents(uid);
      const result = await documents.delete({ documentId: id });

      if (!result) {
        ctx.status = 404;
        ctx.body = errorResponse(404, 'NotFoundError', 'Not Found');
        return;
      }

      ctx.body = wrapResponse(result);
    } catch (error: any) {
      handleRouteError(ctx, error);
    }
  };
}

function createCollectionPublishHandler(apick: any, uid: string) {
  return async (ctx: ApickContext) => {
    try {
      const { id } = ctx.params;
      const documents = apick.documents(uid);
      const results = await documents.publish({ documentId: id });

      if (results.length === 0) {
        ctx.status = 404;
        ctx.body = errorResponse(404, 'NotFoundError', 'No draft found to publish');
        return;
      }

      ctx.body = wrapResponse(results.length === 1 ? results[0] : results);
    } catch (error: any) {
      handleRouteError(ctx, error);
    }
  };
}

function createCollectionUnpublishHandler(apick: any, uid: string) {
  return async (ctx: ApickContext) => {
    try {
      const { id } = ctx.params;
      const documents = apick.documents(uid);
      const results = await documents.unpublish({ documentId: id });

      if (results.length === 0) {
        ctx.status = 404;
        ctx.body = errorResponse(404, 'NotFoundError', 'No published entry found to unpublish');
        return;
      }

      ctx.body = wrapResponse(results.length === 1 ? results[0] : results);
    } catch (error: any) {
      handleRouteError(ctx, error);
    }
  };
}

// ---------------------------------------------------------------------------
// Single type handler factories
// ---------------------------------------------------------------------------

function createSingleFindHandler(apick: any, uid: string, controller: any) {
  return async (ctx: ApickContext) => {
    try {
      if (controller?.find) {
        const result = await controller.find(ctx);
        ctx.body = wrapResponse(result);
        return;
      }

      const queryParams = parseQueryParams(ctx.query);
      const documents = apick.documents(uid);
      const entry = await documents.findFirst({
        fields: queryParams.fields,
        populate: queryParams.populate,
        status: queryParams.status,
      });

      if (!entry) {
        ctx.status = 404;
        ctx.body = errorResponse(404, 'NotFoundError', 'Not Found');
        return;
      }

      ctx.body = wrapResponse(entry);
    } catch (error: any) {
      handleRouteError(ctx, error);
    }
  };
}

function createSingleUpdateHandler(apick: any, uid: string, controller: any) {
  return async (ctx: ApickContext) => {
    try {
      if (controller?.update) {
        const result = await controller.update(ctx);
        ctx.body = wrapResponse(result);
        return;
      }

      const body = ctx.request.body;
      if (!body || !body.data) {
        ctx.status = 400;
        ctx.body = errorResponse(400, 'ValidationError', 'Missing "data" in request body');
        return;
      }

      // For single types, find the existing entry first (across all statuses)
      const documents = apick.documents(uid);
      const existing = await documents.findFirst({});

      if (!existing) {
        // Create if it doesn't exist yet
        const entry = await documents.create({
          data: body.data,
          status: body.status || undefined,
        });
        ctx.status = 201;
        ctx.body = wrapResponse(entry);
        return;
      }

      const entry = await documents.update({
        documentId: existing.document_id,
        data: body.data,
      });

      ctx.body = wrapResponse(entry);
    } catch (error: any) {
      handleRouteError(ctx, error);
    }
  };
}

function createSingleDeleteHandler(apick: any, uid: string, controller: any) {
  return async (ctx: ApickContext) => {
    try {
      if (controller?.delete) {
        const result = await controller.delete(ctx);
        ctx.body = wrapResponse(result);
        return;
      }

      const documents = apick.documents(uid);
      const existing = await documents.findFirst({});

      if (!existing) {
        ctx.status = 404;
        ctx.body = errorResponse(404, 'NotFoundError', 'Not Found');
        return;
      }

      const result = await documents.delete({ documentId: existing.document_id });
      ctx.body = wrapResponse(result);
    } catch (error: any) {
      handleRouteError(ctx, error);
    }
  };
}

// ---------------------------------------------------------------------------
// Pagination meta builder
// ---------------------------------------------------------------------------

function buildPaginationMeta(
  pagination: ParsedQuery['pagination'],
  total: number,
): Record<string, any> {
  if (!pagination) {
    return { page: 1, pageSize: 25, pageCount: Math.ceil(total / 25), total };
  }

  if ('page' in pagination && pagination.page !== undefined) {
    const page = pagination.page;
    const pageSize = pagination.pageSize ?? 25;
    const pageCount = Math.ceil(total / pageSize);
    return { page, pageSize, pageCount, total };
  }

  if ('start' in pagination && pagination.start !== undefined) {
    const start = pagination.start;
    const limit = pagination.limit ?? 25;
    return { start, limit, total };
  }

  return { page: 1, pageSize: 25, pageCount: Math.ceil(total / 25), total };
}

// ---------------------------------------------------------------------------
// Error handler
// ---------------------------------------------------------------------------

function handleRouteError(ctx: ApickContext, error: any): void {
  const status = error.statusCode || error.status || 500;
  const name = error.name || 'InternalServerError';
  const message = error.message || 'Internal Server Error';
  const details = error.details || undefined;

  ctx.status = status;
  ctx.body = errorResponse(status, name, message, details);
}
