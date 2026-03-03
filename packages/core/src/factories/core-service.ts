/**
 * Core Service Factory.
 *
 * `createCoreService(uid, customizer?)` generates a standard CRUD service
 * for a given content type UID. The service layer sits between the controller
 * and the Document Service, applying business-level defaults (e.g. defaulting
 * the `status` filter to `'published'`).
 *
 * The returned factory is called by the lazy registry with `{ apick }` to
 * produce the actual service instance.
 *
 * Default methods: find, findOne, create, update, delete.
 */

import type { Apick as ApickInterface } from '@apick/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Configuration passed into the service factory closure. */
interface ServiceFactoryOptions {
  apick: ApickInterface;
}

/** The shape of a fully-built service instance. */
interface ServiceInstance {
  find: (params?: Record<string, any>) => Promise<any>;
  findOne: (documentId: string, params?: Record<string, any>) => Promise<any>;
  create: (params: Record<string, any>) => Promise<any>;
  update: (documentId: string, params: Record<string, any>) => Promise<any>;
  delete: (documentId: string, params?: Record<string, any>) => Promise<any>;
  [key: string]: any;
}

/** Optional customizer — receives `{ apick }` and returns methods that override defaults. */
type ServiceCustomizer = (opts: ServiceFactoryOptions) => Record<string, any>;

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Creates a core service factory for the given content type UID.
 *
 * @param uid - Content type UID, e.g. `'api::article.article'`
 * @param customizer - Optional function returning methods that override defaults.
 * @returns A factory function `(opts: { apick }) => ServiceInstance`
 *
 * @example
 * ```ts
 * // Basic — use all defaults
 * export default createCoreService('api::article.article');
 *
 * // With overrides
 * export default createCoreService('api::article.article', ({ apick }) => ({
 *   async find(params) {
 *     // Add custom filtering before delegating to the document service
 *     const results = await super.find({ ...params, filters: { featured: true } });
 *     return results;
 *   },
 * }));
 * ```
 */
export function createCoreService(
  uid: string,
  customizer?: ServiceCustomizer,
): (opts: ServiceFactoryOptions) => ServiceInstance {
  return (opts: ServiceFactoryOptions): ServiceInstance => {
    const { apick } = opts;

    // ------------------------------------------------------------------
    // Default CRUD methods
    //
    // Each method delegates to `apick.documents(uid)` which returns
    // a per-UID DocumentService instance (see document-service/index.ts).
    // ------------------------------------------------------------------

    const baseService: ServiceInstance = {
      /**
       * Find multiple entries.
       *
       * Defaults `status` to `'published'` so API consumers only see
       * published content unless they explicitly ask for drafts.
       */
      async find(params?: Record<string, any>) {
        const status = params?.status ?? 'published';

        const results = await apick.documents(uid).findMany({
          ...params,
          status,
        });

        // Build pagination metadata if the caller provided pagination params
        const pagination = params?.pagination
          ? buildPaginationMeta(params.pagination, results)
          : undefined;

        return { results, pagination };
      },

      /**
       * Find a single entry by its documentId.
       */
      async findOne(documentId: string, params?: Record<string, any>) {
        return apick.documents(uid).findOne({
          documentId,
          ...params,
        });
      },

      /**
       * Create a new entry.
       *
       * @param params - Must include `data` with the field values.
       */
      async create(params: Record<string, any>) {
        return apick.documents(uid).create(params);
      },

      /**
       * Update an existing entry.
       *
       * @param documentId - The documentId of the entry to update.
       * @param params - Must include `data` with the field values to change.
       */
      async update(documentId: string, params: Record<string, any>) {
        return apick.documents(uid).update({
          documentId,
          ...params,
        });
      },

      /**
       * Delete an entry by its documentId.
       */
      async delete(documentId: string, params?: Record<string, any>) {
        return apick.documents(uid).delete({
          documentId,
          ...params,
        });
      },
    };

    // ------------------------------------------------------------------
    // Merge customizer overrides (if any)
    // ------------------------------------------------------------------

    if (!customizer) {
      return baseService;
    }

    // Call the customizer to get override methods
    const overrides = customizer({ apick });

    // Build the final service: base methods serve as the prototype so
    // customizer methods can access defaults via the prototype chain.
    const service: ServiceInstance = Object.create(baseService);
    Object.assign(service, overrides);

    return service;
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Build a simple pagination metadata object from the request params and results.
 */
function buildPaginationMeta(
  pagination: Record<string, any>,
  results: any[],
): Record<string, any> {
  if ('page' in pagination) {
    const page = pagination.page ?? 1;
    const pageSize = pagination.pageSize ?? 25;
    return {
      page,
      pageSize,
      pageCount: Math.ceil(results.length / pageSize) || 1,
      total: results.length,
    };
  }

  if ('start' in pagination) {
    const start = pagination.start ?? 0;
    const limit = pagination.limit ?? 25;
    return { start, limit, total: results.length };
  }

  return {};
}
