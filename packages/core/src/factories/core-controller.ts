/**
 * Core Controller Factory.
 *
 * `createCoreController(uid, customizer?)` generates a standard CRUD controller
 * for a given content type UID. The returned factory is called by the lazy
 * registry with `{ apick }` to produce the actual controller instance.
 *
 * Default actions: find, findOne, create, update, delete.
 *
 * Utility helpers exposed on each controller instance:
 *   - sanitizeQuery(query)   — strips non-schema fields (basic impl)
 *   - validateQuery(query)   — validates query params (basic impl)
 *   - sanitizeInput(data)    — validates input data (basic impl)
 *   - sanitizeOutput(data)   — removes `private: true` fields
 *   - transformResponse(data, meta?) — wraps result in `{ data, meta }`
 */

import type { Apick as ApickInterface } from '@apick/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Configuration passed into the controller factory closure. */
interface ControllerFactoryOptions {
  apick: ApickInterface;
}

/** A single controller action — receives the request context. */
type ControllerAction = (ctx: any) => any | Promise<any>;

/** The shape of a fully-built controller instance. */
interface ControllerInstance {
  find: ControllerAction;
  findOne: ControllerAction;
  create: ControllerAction;
  update: ControllerAction;
  delete: ControllerAction;
  sanitizeQuery: (query: Record<string, any>) => Record<string, any>;
  validateQuery: (query: Record<string, any>) => Record<string, any>;
  sanitizeInput: (data: Record<string, any>) => Record<string, any>;
  sanitizeOutput: (data: any, ctx?: any) => any;
  transformResponse: (data: any, meta?: Record<string, any>) => { data: any; meta: Record<string, any> };
  [key: string]: any;
}

/** Optional customizer — receives `{ apick }` and returns methods that override defaults. */
type ControllerCustomizer = (opts: ControllerFactoryOptions) => Record<string, any>;

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Creates a core controller factory for the given content type UID.
 *
 * @param uid - Content type UID, e.g. `'api::article.article'`
 * @param customizer - Optional function returning methods that override defaults.
 * @returns A factory function `(opts: { apick }) => ControllerInstance`
 *
 * @example
 * ```ts
 * // Basic — use all defaults
 * export default createCoreController('api::article.article');
 *
 * // With overrides
 * export default createCoreController('api::article.article', ({ apick }) => ({
 *   async find(ctx) {
 *     // custom logic before the default
 *     ctx.query = { ...ctx.query, filters: { published: true } };
 *     // call the base find (available because defaults are mixed in first)
 *     const { data, meta } = await super.find(ctx);
 *     // post-process
 *     return { data, meta };
 *   },
 * }));
 * ```
 */
export function createCoreController(
  uid: string,
  customizer?: ControllerCustomizer,
): (opts: ControllerFactoryOptions) => ControllerInstance {
  return (opts: ControllerFactoryOptions): ControllerInstance => {
    const { apick } = opts;

    // ------------------------------------------------------------------
    // Utility helpers
    // ------------------------------------------------------------------

    /**
     * Strip query parameters that do not belong to the content type schema.
     * Basic implementation: returns the query as-is for now. A full
     * implementation would validate against the schema's attribute keys.
     */
    function sanitizeQuery(query: Record<string, any>): Record<string, any> {
      // Shallow clone to avoid mutating the caller's object
      const cleaned = { ...query };

      // Remove internal / dangerous keys that should never arrive from the client
      delete cleaned._internal;
      delete cleaned.__proto__;

      return cleaned;
    }

    /**
     * Validate that the query parameters are well-formed.
     * Basic implementation: returns the query unchanged.
     */
    function validateQuery(query: Record<string, any>): Record<string, any> {
      return query;
    }

    /**
     * Validate and sanitize incoming body data.
     * Basic implementation: returns data unchanged.
     */
    function sanitizeInput(data: Record<string, any>): Record<string, any> {
      if (!data || typeof data !== 'object') return {};
      return { ...data };
    }

    /**
     * Remove attributes marked `private: true` from the content type schema
     * so they are never leaked in API responses (e.g. password hashes).
     */
    function sanitizeOutput(data: any, _ctx?: any): any {
      if (!data) return data;

      const schema = apick.contentTypes.get?.(uid) ?? apick.contentTypes[uid];
      if (!schema?.attributes) return data;

      // Collect the names of private attributes
      const privateFields = new Set<string>();
      for (const [name, attr] of Object.entries<any>(schema.attributes)) {
        if (attr.private) {
          privateFields.add(name);
        }
      }

      if (privateFields.size === 0) return data;

      // Handle arrays (e.g. find results)
      if (Array.isArray(data)) {
        return data.map((item) => stripPrivateFields(item, privateFields));
      }

      return stripPrivateFields(data, privateFields);
    }

    /**
     * Wrap data in the standard Apick response envelope.
     */
    function transformResponse(
      data: any,
      meta?: Record<string, any>,
    ): { data: any; meta: Record<string, any> } {
      return {
        data: data ?? null,
        meta: meta ?? {},
      };
    }

    // ------------------------------------------------------------------
    // Default CRUD actions
    // ------------------------------------------------------------------

    const baseController: ControllerInstance = {
      // Utilities
      sanitizeQuery,
      validateQuery,
      sanitizeInput,
      sanitizeOutput,
      transformResponse,

      /**
       * GET / — List entries.
       */
      async find(ctx: any) {
        const sanitizedQuery = sanitizeQuery(ctx.query);
        validateQuery(sanitizedQuery);

        const { results, pagination } = await apick.service(uid).find(sanitizedQuery);
        const sanitizedResults = sanitizeOutput(results, ctx);

        ctx.body = transformResponse(sanitizedResults, { pagination });
      },

      /**
       * GET /:id — Fetch a single entry by documentId.
       */
      async findOne(ctx: any) {
        const documentId: string = ctx.params.id;
        const sanitizedQuery = sanitizeQuery(ctx.query);
        validateQuery(sanitizedQuery);

        const entity = await apick.service(uid).findOne(documentId, sanitizedQuery);

        if (!entity) {
          return ctx.notFound(`Entry not found: ${documentId}`);
        }

        const sanitizedEntity = sanitizeOutput(entity, ctx);
        ctx.body = transformResponse(sanitizedEntity);
      },

      /**
       * POST / — Create a new entry.
       */
      async create(ctx: any) {
        const sanitizedQuery = sanitizeQuery(ctx.query);
        validateQuery(sanitizedQuery);

        const data = sanitizeInput(ctx.request.body?.data ?? {});

        const entity = await apick.service(uid).create({
          ...sanitizedQuery,
          data,
        });

        const sanitizedEntity = sanitizeOutput(entity, ctx);
        ctx.created(transformResponse(sanitizedEntity));
      },

      /**
       * PUT /:id — Update an existing entry.
       */
      async update(ctx: any) {
        const documentId: string = ctx.params.id;
        const sanitizedQuery = sanitizeQuery(ctx.query);
        validateQuery(sanitizedQuery);

        const data = sanitizeInput(ctx.request.body?.data ?? {});

        const entity = await apick.service(uid).update(documentId, {
          ...sanitizedQuery,
          data,
        });

        if (!entity) {
          return ctx.notFound(`Entry not found: ${documentId}`);
        }

        const sanitizedEntity = sanitizeOutput(entity, ctx);
        ctx.body = transformResponse(sanitizedEntity);
      },

      /**
       * DELETE /:id — Delete an entry by documentId.
       */
      async delete(ctx: any) {
        const documentId: string = ctx.params.id;
        const sanitizedQuery = sanitizeQuery(ctx.query);

        const entity = await apick.service(uid).delete(documentId, sanitizedQuery);

        if (!entity) {
          return ctx.notFound(`Entry not found: ${documentId}`);
        }

        const sanitizedEntity = sanitizeOutput(entity, ctx);
        ctx.body = transformResponse(sanitizedEntity);
      },
    };

    // ------------------------------------------------------------------
    // Merge customizer overrides (if any)
    // ------------------------------------------------------------------

    if (!customizer) {
      return baseController;
    }

    // Call the customizer to get the override methods
    const overrides = customizer({ apick });

    // Build the final controller: base methods + overrides.
    // The customizer's methods can call base methods via the returned object
    // because we assign overrides onto the same object.
    const controller: ControllerInstance = Object.create(baseController);
    Object.assign(controller, overrides);

    return controller;
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Remove keys from an object that are in the `privateFields` set.
 */
function stripPrivateFields(
  obj: Record<string, any>,
  privateFields: Set<string>,
): Record<string, any> {
  if (!obj || typeof obj !== 'object') return obj;

  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (!privateFields.has(key)) {
      result[key] = value;
    }
  }
  return result;
}
