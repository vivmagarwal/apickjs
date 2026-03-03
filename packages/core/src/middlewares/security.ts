/**
 * Security Headers Middleware.
 *
 * Sets a suite of HTTP security headers on every response to protect
 * against common web vulnerabilities (clickjacking, XSS, MIME sniffing,
 * referrer leakage, etc.).
 *
 * Default headers:
 *   - X-Content-Type-Options: nosniff
 *   - X-Frame-Options: DENY
 *   - X-XSS-Protection: 1; mode=block
 *   - Referrer-Policy: strict-origin-when-cross-origin
 *   - Content-Security-Policy: default-src 'self'
 *   - Strict-Transport-Security: max-age=31536000; includeSubDomains
 *
 * All headers can be overridden or disabled via configuration.
 * Set a header value to `false` or `null` to omit it entirely.
 */

import type { ApickContext, MiddlewareHandler } from '@apick/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SecurityConfig {
  /** X-Content-Type-Options header. Set to false to disable. */
  contentTypeOptions?: string | false | null;
  /** X-Frame-Options header. Set to false to disable. */
  frameOptions?: string | false | null;
  /** X-XSS-Protection header. Set to false to disable. */
  xssProtection?: string | false | null;
  /** Referrer-Policy header. Set to false to disable. */
  referrerPolicy?: string | false | null;
  /** Content-Security-Policy header. Set to false to disable. */
  contentSecurityPolicy?: string | false | null;
  /** Strict-Transport-Security (HSTS) header. Set to false to disable. */
  hsts?: string | false | null;
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Content-Security-Policy': "default-src 'self'",
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
};

/**
 * Maps config keys to their corresponding HTTP header names.
 */
const CONFIG_TO_HEADER: Record<keyof SecurityConfig, string> = {
  contentTypeOptions: 'X-Content-Type-Options',
  frameOptions: 'X-Frame-Options',
  xssProtection: 'X-XSS-Protection',
  referrerPolicy: 'Referrer-Policy',
  contentSecurityPolicy: 'Content-Security-Policy',
  hsts: 'Strict-Transport-Security',
};

// ---------------------------------------------------------------------------
// Middleware factory
// ---------------------------------------------------------------------------

/**
 * Creates a security headers middleware.
 *
 * @example
 *   import { createSecurityMiddleware } from './middlewares/security.js';
 *
 *   // Use all defaults
 *   apick.server.use(createSecurityMiddleware());
 *
 *   // Override specific headers
 *   apick.server.use(createSecurityMiddleware({
 *     frameOptions: 'SAMEORIGIN',
 *     contentSecurityPolicy: "default-src 'self'; script-src 'self' cdn.example.com",
 *   }));
 *
 *   // Disable a header
 *   apick.server.use(createSecurityMiddleware({
 *     xssProtection: false,
 *   }));
 */
export function createSecurityMiddleware(config?: SecurityConfig): MiddlewareHandler {
  // Build the final set of headers to apply.
  // Start with defaults, then apply any overrides from config.
  const headers: Array<[string, string]> = [];

  for (const [headerName, defaultValue] of Object.entries(DEFAULT_HEADERS)) {
    // Find the config key for this header (if any)
    const configKey = Object.entries(CONFIG_TO_HEADER).find(
      ([, name]) => name === headerName,
    )?.[0] as keyof SecurityConfig | undefined;

    if (configKey && config && configKey in config) {
      const override = config[configKey];
      // false / null means "don't set this header"
      if (override === false || override === null) {
        continue;
      }
      // string means "use this value instead of the default"
      if (typeof override === 'string') {
        headers.push([headerName, override]);
        continue;
      }
    }

    // Use default value
    headers.push([headerName, defaultValue]);
  }

  const middleware: MiddlewareHandler = async (ctx: ApickContext, next: () => Promise<void>): Promise<void> => {
    // Set security headers before calling downstream handlers
    for (const [name, value] of headers) {
      ctx.set(name, value);
    }

    await next();
  };

  return middleware;
}
