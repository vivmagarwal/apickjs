/**
 * Rate Limiting Middleware.
 *
 * Uses an in-memory store with automatic expiry to track request counts
 * per client. When a client exceeds the configured maximum within the
 * time window, the middleware responds with HTTP 429 Too Many Requests.
 *
 * Response headers:
 *   - X-RateLimit-Limit     — maximum requests allowed in the window
 *   - X-RateLimit-Remaining — requests remaining in the current window
 *   - X-RateLimit-Reset     — Unix timestamp (seconds) when the window resets
 *   - Retry-After            — seconds until the client can retry (only on 429)
 */

import type { ApickContext, MiddlewareHandler } from '@apick/types';
import { RateLimitError } from '@apick/utils/errors';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RateLimitConfig {
  /** Maximum number of requests per window. Default: 100 */
  max?: number;
  /** Time window in milliseconds. Default: 60000 (1 minute) */
  window?: number;
  /** Function to derive the rate limit key from the context. Default: ctx.ip */
  keyGenerator?: (ctx: ApickContext) => string;
  /** Error message when rate limit is exceeded */
  message?: string;
  /** Whether to set rate limit response headers. Default: true */
  headers?: boolean;
}

interface RateLimitEntry {
  /** Number of requests made in the current window */
  count: number;
  /** Timestamp (ms) when the current window resets */
  resetTime: number;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

/**
 * Creates an in-memory rate limit store with automatic cleanup.
 *
 * Expired entries are lazily pruned on access and periodically swept
 * to prevent unbounded growth.
 */
function createStore(windowMs: number) {
  const entries = new Map<string, RateLimitEntry>();

  // Periodic sweep every 5 minutes (or the window size, whichever is larger)
  const sweepInterval = Math.max(windowMs, 5 * 60 * 1000);
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of entries) {
      if (now >= entry.resetTime) {
        entries.delete(key);
      }
    }
  }, sweepInterval);

  // Allow the process to exit even if the timer is still running
  if (timer.unref) {
    timer.unref();
  }

  return {
    /**
     * Increments the counter for a key and returns the current state.
     */
    increment(key: string): { count: number; resetTime: number } {
      const now = Date.now();
      let entry = entries.get(key);

      // If the entry has expired (or doesn't exist), create a new window
      if (!entry || now >= entry.resetTime) {
        entry = {
          count: 1,
          resetTime: now + windowMs,
        };
        entries.set(key, entry);
        return { count: entry.count, resetTime: entry.resetTime };
      }

      // Increment within the current window
      entry.count += 1;
      return { count: entry.count, resetTime: entry.resetTime };
    },

    /**
     * Clears all entries (useful for testing).
     */
    clear(): void {
      entries.clear();
    },

    /**
     * Stops the periodic sweep timer.
     */
    destroy(): void {
      clearInterval(timer);
      entries.clear();
    },
  };
}

// ---------------------------------------------------------------------------
// Middleware factory
// ---------------------------------------------------------------------------

/**
 * Creates a rate limiting middleware.
 *
 * @example
 *   import { createRateLimitMiddleware } from './middlewares/rate-limit.js';
 *
 *   apick.server.use(createRateLimitMiddleware({
 *     max: 100,
 *     window: 60_000,
 *   }));
 */
export function createRateLimitMiddleware(config?: RateLimitConfig): MiddlewareHandler {
  const max = config?.max ?? 100;
  const windowMs = config?.window ?? 60_000;
  const keyGenerator = config?.keyGenerator ?? ((ctx: ApickContext) => ctx.ip);
  const message = config?.message ?? 'Too Many Requests';
  const showHeaders = config?.headers !== false;

  const store = createStore(windowMs);

  const middleware: MiddlewareHandler = async (ctx: ApickContext, next: () => Promise<void>): Promise<void> => {
    const key = keyGenerator(ctx);
    const { count, resetTime } = store.increment(key);
    const remaining = Math.max(0, max - count);
    const resetSeconds = Math.ceil(resetTime / 1000);

    // Set rate limit headers
    if (showHeaders) {
      ctx.set('X-RateLimit-Limit', String(max));
      ctx.set('X-RateLimit-Remaining', String(remaining));
      ctx.set('X-RateLimit-Reset', String(resetSeconds));
    }

    // If limit exceeded, respond with 429
    if (count > max) {
      const retryAfterSeconds = Math.ceil((resetTime - Date.now()) / 1000);

      if (showHeaders) {
        ctx.set('Retry-After', String(Math.max(1, retryAfterSeconds)));
      }

      throw new RateLimitError(message);
    }

    await next();
  };

  return middleware;
}
