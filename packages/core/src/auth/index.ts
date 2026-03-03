/**
 * Authentication System.
 *
 * Implements a strategy pattern for authentication with two domains:
 *   - Admin API (`/admin/*`): Admin JWT strategy with ADMIN_JWT_SECRET
 *   - Content API (`/api/*`): JWT strategy or API Token strategy with JWT_SECRET
 *
 * The auth middleware extracts credentials from the Authorization header,
 * resolves the appropriate strategy, authenticates the request, and sets
 * ctx.state.auth, ctx.state.user, and ctx.state.isAuthenticated.
 */

import { createHmac, randomBytes } from 'node:crypto';
import type { ApickContext, MiddlewareHandler } from '@apick/types';
import { UnauthorizedError, ForbiddenError } from '@apick/utils/errors';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AuthResult {
  authenticated: boolean;
  credentials: {
    id: number | string;
    type: 'user' | 'api-token';
  };
  ability?: any;
}

export interface AuthStrategy {
  name: string;
  authenticate(ctx: ApickContext): Promise<AuthResult | null>;
  verify?(auth: AuthResult, config: RouteAuthConfig): Promise<void>;
}

export interface RouteAuthConfig {
  scope?: string[];
}

export interface JWTConfig {
  secret: string;
  expiresIn?: string | number;
}

// ---------------------------------------------------------------------------
// JWT helpers (minimal, no external dependency)
// ---------------------------------------------------------------------------

/**
 * Base64url encode a buffer.
 */
function base64urlEncode(data: Buffer): string {
  return data.toString('base64url');
}

/**
 * Base64url decode a string.
 */
function base64urlDecode(str: string): Buffer {
  return Buffer.from(str, 'base64url');
}

/**
 * Parse a duration string like '1h', '30d', '7d', '60s' into seconds.
 */
function parseDuration(value: string | number): number {
  if (typeof value === 'number') return value;
  const match = value.match(/^(\d+)(s|m|h|d)$/);
  if (!match) return 3600; // default 1 hour
  const num = parseInt(match[1], 10);
  const unit = match[2];
  switch (unit) {
    case 's': return num;
    case 'm': return num * 60;
    case 'h': return num * 3600;
    case 'd': return num * 86400;
    default: return 3600;
  }
}

/**
 * Signs a JWT payload with HMAC-SHA256.
 */
export function signJWT(payload: Record<string, any>, secret: string, options?: { expiresIn?: string | number }): string {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);

  const fullPayload: Record<string, any> = {
    ...payload,
    iat: payload.iat ?? now,
  };

  if (options?.expiresIn) {
    fullPayload.exp = now + parseDuration(options.expiresIn);
  }

  const headerStr = base64urlEncode(Buffer.from(JSON.stringify(header)));
  const payloadStr = base64urlEncode(Buffer.from(JSON.stringify(fullPayload)));
  const signature = createHmac('sha256', secret)
    .update(`${headerStr}.${payloadStr}`)
    .digest();

  return `${headerStr}.${payloadStr}.${base64urlEncode(signature)}`;
}

/**
 * Verifies and decodes a JWT token.
 * Throws UnauthorizedError if token is invalid or expired.
 */
export function verifyJWT(token: string, secret: string): Record<string, any> {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new UnauthorizedError('Invalid token format');
  }

  const [headerStr, payloadStr, signatureStr] = parts;

  // Verify signature
  const expectedSig = createHmac('sha256', secret)
    .update(`${headerStr}.${payloadStr}`)
    .digest();
  const actualSig = base64urlDecode(signatureStr);

  if (!expectedSig.equals(actualSig)) {
    throw new UnauthorizedError('Invalid token signature');
  }

  // Decode payload
  const payload = JSON.parse(base64urlDecode(payloadStr).toString());

  // Check expiration
  if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
    throw new UnauthorizedError('Token expired');
  }

  return payload;
}

/**
 * Checks if a bearer token looks like a JWT (has 3 dot-separated segments).
 */
export function isJWTFormat(token: string): boolean {
  return token.split('.').length === 3;
}

/**
 * Hashes an API token using HMAC-SHA512.
 */
export function hashApiToken(token: string, salt: string): string {
  return createHmac('sha512', salt).update(token).digest('hex');
}

/**
 * Generates a random API token (48 bytes hex).
 */
export function generateApiToken(): string {
  return randomBytes(48).toString('hex');
}

// ---------------------------------------------------------------------------
// Auth middleware factory
// ---------------------------------------------------------------------------

export interface AuthMiddlewareConfig {
  /** The Apick instance */
  apick: any;
  /** Admin JWT secret */
  adminSecret?: string;
  /** Content API JWT secret */
  jwtSecret?: string;
  /** API token salt for hashing */
  apiTokenSalt?: string;
}

/**
 * Creates the authentication middleware.
 *
 * This middleware:
 * 1. Checks if the route requires auth (skips if auth: false)
 * 2. Extracts the Bearer token from Authorization header
 * 3. Determines the token type (JWT vs API token)
 * 4. Delegates to the appropriate strategy
 * 5. Sets ctx.state.auth, ctx.state.user, ctx.state.isAuthenticated
 * 6. Verifies scope permissions if configured
 */
export function createAuthMiddleware(config: AuthMiddlewareConfig): MiddlewareHandler {
  const { apick } = config;

  return async (ctx: ApickContext, next: () => Promise<void>): Promise<void> => {
    // Check if route requires auth
    const routeAuth = ctx.state?.route?.config?.auth;

    // If auth is explicitly false, skip authentication
    if (routeAuth === false) {
      ctx.state.isAuthenticated = false;
      await next();
      return;
    }

    // Extract token from Authorization header
    const authHeader = ctx.get('Authorization') || ctx.get('authorization');
    if (!authHeader) {
      // No auth header — if route doesn't require auth, proceed
      if (routeAuth === undefined) {
        ctx.state.isAuthenticated = false;
        await next();
        return;
      }
      throw new UnauthorizedError('Missing authorization header');
    }

    const [scheme, token] = authHeader.split(' ');
    if (scheme !== 'Bearer' || !token) {
      throw new UnauthorizedError('Invalid authorization format. Expected: Bearer <token>');
    }

    // Determine if this is an admin or content API request
    const isAdminRoute = ctx.request.url?.startsWith('/admin') ?? false;

    let authResult: AuthResult | null = null;

    if (isAdminRoute) {
      // Admin JWT authentication
      authResult = await authenticateAdminJWT(token, config, apick);
    } else if (isJWTFormat(token)) {
      // Content API JWT authentication
      authResult = await authenticateContentJWT(token, config, apick);
    } else {
      // API Token authentication
      authResult = await authenticateApiToken(token, config, apick);
    }

    if (!authResult || !authResult.authenticated) {
      throw new UnauthorizedError('Invalid credentials');
    }

    // Set auth state on context
    ctx.state.auth = authResult;
    ctx.state.isAuthenticated = true;

    // Load user data if credentials are user type
    if (authResult.credentials.type === 'user') {
      try {
        const userService = isAdminRoute
          ? apick.service('admin::user')
          : apick.service('plugin::users-permissions.user');
        if (userService) {
          ctx.state.user = await userService.findOne(authResult.credentials.id);
        }
      } catch {
        // User service may not be available yet — that's ok
      }
    }

    // Verify scope if configured
    if (routeAuth && typeof routeAuth === 'object' && routeAuth.scope) {
      const ability = authResult.ability;
      if (ability) {
        for (const scope of routeAuth.scope) {
          const subject = ctx.state?.route?.uid || null;
          if (!ability.can(scope, subject)) {
            throw new ForbiddenError(`Missing required scope: ${scope}`);
          }
        }
      }
    }

    await next();
  };
}

// ---------------------------------------------------------------------------
// Strategy implementations
// ---------------------------------------------------------------------------

async function authenticateAdminJWT(
  token: string,
  config: AuthMiddlewareConfig,
  apick: any,
): Promise<AuthResult | null> {
  const secret = config.adminSecret || apick.config.get('admin.auth.secret', '');
  if (!secret) {
    throw new UnauthorizedError('Admin JWT secret not configured');
  }

  try {
    const payload = verifyJWT(token, secret);
    const userId = payload.id;
    if (!userId) return null;

    // Build ability from admin role permissions
    let ability: any = null;
    try {
      const permissionService = apick.service('admin::permission');
      if (permissionService?.generateUserAbility) {
        ability = await permissionService.generateUserAbility({ id: userId });
      }
    } catch {
      // Permission service may not be available
    }

    return {
      authenticated: true,
      credentials: { id: userId, type: 'user' },
      ability,
    };
  } catch (error: any) {
    if (error.name === 'UnauthorizedError') throw error;
    throw new UnauthorizedError('Invalid admin token');
  }
}

async function authenticateContentJWT(
  token: string,
  config: AuthMiddlewareConfig,
  apick: any,
): Promise<AuthResult | null> {
  const secret = config.jwtSecret || apick.config.get('plugin.users-permissions.jwtSecret', '');
  if (!secret) {
    throw new UnauthorizedError('JWT secret not configured');
  }

  try {
    const payload = verifyJWT(token, secret);
    const userId = payload.id;
    if (!userId) return null;

    // Build ability from user role permissions
    let ability: any = null;
    try {
      const permissionService = apick.service('plugin::users-permissions.permission');
      if (permissionService?.generateUserAbility) {
        ability = await permissionService.generateUserAbility({ id: userId });
      }
    } catch {
      // Permission service may not be available
    }

    return {
      authenticated: true,
      credentials: { id: userId, type: 'user' },
      ability,
    };
  } catch (error: any) {
    if (error.name === 'UnauthorizedError') throw error;
    throw new UnauthorizedError('Invalid token');
  }
}

async function authenticateApiToken(
  token: string,
  config: AuthMiddlewareConfig,
  apick: any,
): Promise<AuthResult | null> {
  const salt = config.apiTokenSalt || apick.config.get('admin.apiToken.salt', '');
  if (!salt) {
    throw new UnauthorizedError('API token salt not configured');
  }

  const hash = hashApiToken(token, salt);

  // Look up token in database
  let tokenRecord: any = null;
  try {
    const tokenService = apick.service('admin::api-token');
    if (tokenService) {
      tokenRecord = await tokenService.findByHash(hash);
    }
  } catch {
    return null;
  }

  if (!tokenRecord) {
    throw new UnauthorizedError('Invalid API token');
  }

  // Check expiration
  if (tokenRecord.expiresAt && new Date(tokenRecord.expiresAt) < new Date()) {
    throw new UnauthorizedError('API token expired');
  }

  // Build ability from token permissions
  let ability: any = null;
  if (tokenRecord.type === 'read-only') {
    ability = buildApiTokenAbility(['find', 'findOne']);
  } else if (tokenRecord.type === 'full-access') {
    ability = buildApiTokenAbility(['find', 'findOne', 'create', 'update', 'delete']);
  } else if (tokenRecord.type === 'custom' && tokenRecord.permissions) {
    ability = buildCustomApiTokenAbility(tokenRecord.permissions);
  }

  return {
    authenticated: true,
    credentials: { id: tokenRecord.id, type: 'api-token' },
    ability,
  };
}

// ---------------------------------------------------------------------------
// API Token ability builders
// ---------------------------------------------------------------------------

function buildApiTokenAbility(allowedActions: string[]) {
  return {
    can(action: string, _subject?: string): boolean {
      return allowedActions.includes(action);
    },
  };
}

function buildCustomApiTokenAbility(permissions: Array<{ action: string; subject?: string }>) {
  return {
    can(action: string, subject?: string): boolean {
      return permissions.some((p) => {
        if (p.action !== action) return false;
        if (p.subject && subject && p.subject !== subject) return false;
        return true;
      });
    },
  };
}
