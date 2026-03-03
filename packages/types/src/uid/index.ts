/**
 * UID types for the namespace system.
 *
 * Namespaces:
 * - api::     — user-defined content types/services/controllers
 * - plugin::  — plugin content types/services/controllers
 * - admin::   — admin-internal types
 * - apick::   — framework internals
 * - global::  — global policies/middlewares
 */

export namespace UID {
  /** Content type UID: e.g., 'api::article.article' */
  export type ContentType = `api::${string}.${string}` | `plugin::${string}.${string}` | `admin::${string}` | `apick::${string}`;

  /** Service UID */
  export type Service = `api::${string}.${string}` | `plugin::${string}.${string}` | `admin::${string}`;

  /** Controller UID */
  export type Controller = `api::${string}.${string}` | `plugin::${string}.${string}` | `admin::${string}`;

  /** Policy UID */
  export type Policy = `global::${string}` | `api::${string}.${string}` | `plugin::${string}.${string}` | `admin::${string}`;

  /** Middleware UID */
  export type Middleware = `apick::${string}` | `global::${string}` | `plugin::${string}.${string}`;

  /** Content type UID → schema mapping (augmented by generated types) */
  export interface ContentTypes {
    [uid: string]: any;
  }
}
