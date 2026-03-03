/**
 * Request Context — per-request state via AsyncLocalStorage.
 *
 * Provides ambient access to the current request's user, auth, locale,
 * and other context without explicitly threading it through every function.
 *
 * Usage:
 *   // In middleware (early in pipeline):
 *   requestContext.run(store, async () => { await next(); });
 *
 *   // Anywhere in the call stack during that request:
 *   const ctx = requestContext.get();
 *   const userId = ctx?.state?.auth?.credentials?.id;
 */

import { AsyncLocalStorage } from 'node:async_hooks';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RequestContextStore {
  state: {
    auth?: {
      authenticated: boolean;
      credentials: {
        id: number | string;
        type: 'user' | 'api-token';
      };
      ability?: any;
    };
    user?: any;
    isAuthenticated?: boolean;
  };
  request: {
    ip: string;
    url: string;
    method: string;
    headers: Record<string, string | string[] | undefined>;
  };
}

// ---------------------------------------------------------------------------
// Storage instance
// ---------------------------------------------------------------------------

const storage = new AsyncLocalStorage<RequestContextStore>();

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Runs a function within a new request context scope.
 *
 * Everything invoked within `fn` — including async continuations —
 * will be able to access the store via `get()`.
 */
function run<T>(store: RequestContextStore, fn: () => T): T {
  return storage.run(store, fn);
}

/**
 * Returns the current request context store, or `undefined` if called
 * outside a request context (e.g., during bootstrap, cron, CLI).
 */
function get(): RequestContextStore | undefined {
  return storage.getStore();
}

export const requestContext = { run, get };

/**
 * Creates a request context middleware that wraps downstream handlers
 * in an AsyncLocalStorage scope populated from the request.
 */
export function createRequestContextMiddleware() {
  return async (ctx: any, next: () => Promise<void>): Promise<void> => {
    const store: RequestContextStore = {
      state: {
        auth: ctx.state?.auth,
        user: ctx.state?.user,
        isAuthenticated: ctx.state?.isAuthenticated,
      },
      request: {
        ip: ctx.ip || '0.0.0.0',
        url: ctx.request?.url || ctx.url || '/',
        method: ctx.request?.method || ctx.method || 'GET',
        headers: ctx.request?.headers || {},
      },
    };

    await requestContext.run(store, async () => {
      await next();
    });
  };
}
