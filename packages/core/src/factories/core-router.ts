/**
 * Core Router Factory.
 *
 * `createCoreRouter(uid, config?)` generates the standard REST route
 * definitions for a content type. These definitions are consumed by the
 * Apick server during the bootstrap phase to register HTTP routes.
 *
 * Collection types (default) get 5 routes:
 *   GET    /api/{pluralName}        → find
 *   GET    /api/{pluralName}/:id    → findOne
 *   POST   /api/{pluralName}        → create
 *   PUT    /api/{pluralName}/:id    → update
 *   DELETE /api/{pluralName}/:id    → delete
 *
 * Single types get 3 routes:
 *   GET    /api/{singularName}      → find
 *   PUT    /api/{singularName}      → update
 *   DELETE /api/{singularName}      → delete
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Per-action configuration (auth, policies, middlewares). */
interface RouteActionConfig {
  auth?: boolean | { scope: string[] };
  policies?: any[];
  middlewares?: any[];
}

/** Options accepted by `createCoreRouter`. */
interface CoreRouterConfig {
  /** Override the base path prefix (default: `/api`). */
  prefix?: string;

  /** Set the content type kind. Defaults to `'collectionType'`. */
  type?: 'collectionType' | 'singleType';

  /** Per-action config keyed by action name (find, findOne, create, update, delete). */
  config?: Record<string, RouteActionConfig>;

  /** Completely replace the generated routes with custom ones. */
  only?: Array<'find' | 'findOne' | 'create' | 'update' | 'delete'>;
}

/** A single route definition produced by the factory. */
interface RouteDefinition {
  method: string;
  path: string;
  handler: string;
  config: RouteActionConfig;
}

/** The object returned by `createCoreRouter`. */
interface RouterDefinition {
  /** The content type UID this router was created for. */
  uid: string;

  /** Type of content type: collection or single. */
  type: 'collectionType' | 'singleType';

  /** The generated route definitions. */
  routes: RouteDefinition[];
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Creates a route definition object for the given content type UID.
 *
 * @param uid - Content type UID, e.g. `'api::article.article'`
 * @param config - Optional configuration for prefix, per-action config, etc.
 * @returns A `RouterDefinition` object with the generated routes.
 *
 * @example
 * ```ts
 * // Basic — generates all 5 collection routes
 * export default createCoreRouter('api::article.article');
 *
 * // With per-action config
 * export default createCoreRouter('api::article.article', {
 *   config: {
 *     find: { auth: false },
 *     create: { policies: ['admin::isAdmin'] },
 *   },
 * });
 *
 * // Single type — generates 3 routes
 * export default createCoreRouter('api::homepage.homepage', {
 *   type: 'singleType',
 * });
 * ```
 */
export function createCoreRouter(
  uid: string,
  config?: CoreRouterConfig,
): RouterDefinition {
  const prefix = config?.prefix ?? '/api';
  const type = config?.type ?? 'collectionType';
  const actionConfig = config?.config ?? {};
  const only = config?.only;

  // Derive the resource name and handler prefix from the UID.
  //
  // UID format: `api::article.article` or `api::blog-post.blog-post`
  // We need:
  //   - `handlerPrefix` → `'api::article.article'` (the full UID for handler strings)
  //   - `resourceName`  → pluralName for collections, singularName for singles
  //
  // For the resource name we parse the UID. The convention is:
  //   api::{singularName}.{singularName}
  // The plural is derived by appending 's' (a simple heuristic; content type
  // schemas carry the real plural/singular, but the router factory only has
  // the UID at this point).
  const { singularName, pluralName } = parseUid(uid);

  const basePath = type === 'singleType'
    ? `${prefix}/${singularName}`
    : `${prefix}/${pluralName}`;

  // The handler string format: `'{uid}.{action}'`
  // e.g. `'api::article.article.find'`
  const handlerPrefix = uid;

  // ------------------------------------------------------------------
  // Generate routes
  // ------------------------------------------------------------------

  const allRoutes: RouteDefinition[] = [];

  if (type === 'collectionType') {
    // --- Collection Type: 5 routes ---
    allRoutes.push(
      {
        method: 'GET',
        path: basePath,
        handler: `${handlerPrefix}.find`,
        config: actionConfig.find ?? {},
      },
      {
        method: 'GET',
        path: `${basePath}/:id`,
        handler: `${handlerPrefix}.findOne`,
        config: actionConfig.findOne ?? {},
      },
      {
        method: 'POST',
        path: basePath,
        handler: `${handlerPrefix}.create`,
        config: actionConfig.create ?? {},
      },
      {
        method: 'PUT',
        path: `${basePath}/:id`,
        handler: `${handlerPrefix}.update`,
        config: actionConfig.update ?? {},
      },
      {
        method: 'DELETE',
        path: `${basePath}/:id`,
        handler: `${handlerPrefix}.delete`,
        config: actionConfig.delete ?? {},
      },
    );
  } else {
    // --- Single Type: 3 routes (no :id param, no create) ---
    allRoutes.push(
      {
        method: 'GET',
        path: basePath,
        handler: `${handlerPrefix}.find`,
        config: actionConfig.find ?? {},
      },
      {
        method: 'PUT',
        path: basePath,
        handler: `${handlerPrefix}.update`,
        config: actionConfig.update ?? {},
      },
      {
        method: 'DELETE',
        path: basePath,
        handler: `${handlerPrefix}.delete`,
        config: actionConfig.delete ?? {},
      },
    );
  }

  // Filter to only requested actions (if specified)
  const routes = only
    ? allRoutes.filter((r) => {
        const action = r.handler.split('.').pop() as string;
        return only.includes(action as any);
      })
    : allRoutes;

  return {
    uid,
    type,
    routes,
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Parse a content type UID into singular and plural resource names.
 *
 * UID formats:
 *   - `api::article.article`  → singular: `article`,  plural: `articles`
 *   - `api::blog-post.blog-post` → singular: `blog-post`, plural: `blog-posts`
 *   - `plugin::myplugin.thing` → singular: `thing`, plural: `things`
 *
 * The plural is a simple heuristic (append 's'). When the Apick server
 * registers routes, it can look up the actual content type schema for the
 * real plural name. This is just a sensible default.
 */
function parseUid(uid: string): { singularName: string; pluralName: string } {
  // Split on '.' to get the last segment as the model name
  const parts = uid.split('.');
  const modelName = parts[parts.length - 1] ?? uid;

  // Simple pluralization: append 's'
  const singularName = modelName;
  const pluralName = modelName.endsWith('s') ? modelName : `${modelName}s`;

  return { singularName, pluralName };
}
