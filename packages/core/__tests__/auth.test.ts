import { describe, it, expect, vi } from 'vitest';
import {
  signJWT,
  verifyJWT,
  isJWTFormat,
  hashApiToken,
  generateApiToken,
  createAuthMiddleware,
} from '../src/auth/index.js';

// ==========================================================================
// JWT helpers
// ==========================================================================

describe('signJWT / verifyJWT', () => {
  const secret = 'test-secret-key-for-jwt-testing';

  it('signs and verifies a JWT', () => {
    const payload = { id: 42, role: 'admin' };
    const token = signJWT(payload, secret, { expiresIn: '1h' });

    expect(typeof token).toBe('string');
    expect(token.split('.')).toHaveLength(3);

    const decoded = verifyJWT(token, secret);
    expect(decoded.id).toBe(42);
    expect(decoded.role).toBe('admin');
    expect(decoded.iat).toBeDefined();
    expect(decoded.exp).toBeDefined();
  });

  it('sets iat automatically', () => {
    const token = signJWT({ id: 1 }, secret);
    const decoded = verifyJWT(token, secret);
    expect(decoded.iat).toBeDefined();
    expect(decoded.iat).toBeGreaterThan(0);
  });

  it('respects expiresIn as seconds', () => {
    const token = signJWT({ id: 1 }, secret, { expiresIn: 3600 });
    const decoded = verifyJWT(token, secret);
    expect(decoded.exp - decoded.iat).toBe(3600);
  });

  it('respects expiresIn as duration string', () => {
    const token = signJWT({ id: 1 }, secret, { expiresIn: '30d' });
    const decoded = verifyJWT(token, secret);
    expect(decoded.exp - decoded.iat).toBe(30 * 86400);
  });

  it('supports minute duration', () => {
    const token = signJWT({ id: 1 }, secret, { expiresIn: '5m' });
    const decoded = verifyJWT(token, secret);
    expect(decoded.exp - decoded.iat).toBe(300);
  });

  it('supports second duration', () => {
    const token = signJWT({ id: 1 }, secret, { expiresIn: '60s' });
    const decoded = verifyJWT(token, secret);
    expect(decoded.exp - decoded.iat).toBe(60);
  });

  it('throws for invalid token format', () => {
    expect(() => verifyJWT('not-a-jwt', secret)).toThrow('Invalid token format');
  });

  it('throws for wrong secret', () => {
    const token = signJWT({ id: 1 }, secret);
    expect(() => verifyJWT(token, 'wrong-secret')).toThrow('Invalid token signature');
  });

  it('throws for expired tokens', () => {
    // Create a token that expired 1 hour ago
    const payload = {
      id: 1,
      iat: Math.floor(Date.now() / 1000) - 7200,
      exp: Math.floor(Date.now() / 1000) - 3600,
    };
    const token = signJWT(payload, secret);
    expect(() => verifyJWT(token, secret)).toThrow('Token expired');
  });

  it('works without expiresIn (no exp claim)', () => {
    const token = signJWT({ id: 1 }, secret);
    const decoded = verifyJWT(token, secret);
    expect(decoded.exp).toBeUndefined();
  });

  it('preserves all payload fields', () => {
    const payload = { id: 1, isAdmin: true, type: 'access', sessionId: 'sess-123' };
    const token = signJWT(payload, secret, { expiresIn: '1h' });
    const decoded = verifyJWT(token, secret);
    expect(decoded.id).toBe(1);
    expect(decoded.isAdmin).toBe(true);
    expect(decoded.type).toBe('access');
    expect(decoded.sessionId).toBe('sess-123');
  });
});

// ==========================================================================
// Token utilities
// ==========================================================================

describe('isJWTFormat', () => {
  it('returns true for JWT-like tokens', () => {
    expect(isJWTFormat('aaa.bbb.ccc')).toBe(true);
  });

  it('returns false for API tokens', () => {
    expect(isJWTFormat('abc123def456')).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(isJWTFormat('')).toBe(false);
  });

  it('returns false for two-segment token', () => {
    expect(isJWTFormat('aaa.bbb')).toBe(false);
  });
});

describe('hashApiToken', () => {
  it('produces a hex hash', () => {
    const hash = hashApiToken('my-token', 'my-salt');
    expect(typeof hash).toBe('string');
    expect(hash).toMatch(/^[a-f0-9]+$/);
  });

  it('produces consistent hashes', () => {
    const hash1 = hashApiToken('token', 'salt');
    const hash2 = hashApiToken('token', 'salt');
    expect(hash1).toBe(hash2);
  });

  it('produces different hashes for different tokens', () => {
    const hash1 = hashApiToken('token1', 'salt');
    const hash2 = hashApiToken('token2', 'salt');
    expect(hash1).not.toBe(hash2);
  });

  it('produces different hashes for different salts', () => {
    const hash1 = hashApiToken('token', 'salt1');
    const hash2 = hashApiToken('token', 'salt2');
    expect(hash1).not.toBe(hash2);
  });
});

describe('generateApiToken', () => {
  it('generates a hex string', () => {
    const token = generateApiToken();
    expect(typeof token).toBe('string');
    expect(token).toMatch(/^[a-f0-9]+$/);
  });

  it('generates 96-char tokens (48 bytes hex)', () => {
    const token = generateApiToken();
    expect(token.length).toBe(96);
  });

  it('generates unique tokens', () => {
    const tokens = new Set(Array.from({ length: 10 }, () => generateApiToken()));
    expect(tokens.size).toBe(10);
  });
});

// ==========================================================================
// Auth middleware
// ==========================================================================

describe('createAuthMiddleware', () => {
  const jwtSecret = 'test-jwt-secret-for-content-api';
  const adminSecret = 'test-admin-jwt-secret';
  const apiTokenSalt = 'test-api-token-salt';

  function createMockApick(overrides: any = {}): any {
    return {
      config: {
        get: (key: string, def: any) => {
          if (key === 'admin.auth.secret') return adminSecret;
          if (key === 'plugin.users-permissions.jwtSecret') return jwtSecret;
          if (key === 'admin.apiToken.salt') return apiTokenSalt;
          return def;
        },
      },
      service: (_uid: string) => null,
      ...overrides,
    };
  }

  function createMockCtx(overrides: any = {}): any {
    return {
      state: overrides.state || {},
      request: {
        url: overrides.url || '/api/articles',
        method: 'GET',
        headers: overrides.headers || {},
        body: null,
      },
      params: {},
      query: {},
      get: (name: string) => overrides.headers?.[name.toLowerCase()] || overrides.headers?.[name],
      ip: '127.0.0.1',
      ...overrides,
    };
  }

  it('skips auth for routes with auth: false', async () => {
    const apick = createMockApick();
    const middleware = createAuthMiddleware({ apick, jwtSecret, adminSecret, apiTokenSalt });

    const ctx = createMockCtx({
      state: { route: { config: { auth: false } } },
    });
    const next = vi.fn(async () => {});

    await middleware(ctx, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(ctx.state.isAuthenticated).toBe(false);
  });

  it('authenticates admin JWT tokens', async () => {
    const apick = createMockApick();
    const middleware = createAuthMiddleware({ apick, jwtSecret, adminSecret, apiTokenSalt });

    const token = signJWT({ id: 1, isAdmin: true }, adminSecret, { expiresIn: '1h' });
    const ctx = createMockCtx({
      url: '/admin/users',
      headers: { authorization: `Bearer ${token}` },
      state: { route: { config: { auth: true } } },
    });
    const next = vi.fn(async () => {});

    await middleware(ctx, next);

    expect(ctx.state.isAuthenticated).toBe(true);
    expect(ctx.state.auth.credentials.id).toBe(1);
    expect(ctx.state.auth.credentials.type).toBe('user');
  });

  it('authenticates content API JWT tokens', async () => {
    const apick = createMockApick();
    const middleware = createAuthMiddleware({ apick, jwtSecret, adminSecret, apiTokenSalt });

    const token = signJWT({ id: 42 }, jwtSecret, { expiresIn: '7d' });
    const ctx = createMockCtx({
      url: '/api/articles',
      headers: { authorization: `Bearer ${token}` },
      state: { route: { config: { auth: true } } },
    });
    const next = vi.fn(async () => {});

    await middleware(ctx, next);

    expect(ctx.state.isAuthenticated).toBe(true);
    expect(ctx.state.auth.credentials.id).toBe(42);
  });

  it('throws for missing auth header on protected route', async () => {
    const apick = createMockApick();
    const middleware = createAuthMiddleware({ apick, jwtSecret, adminSecret, apiTokenSalt });

    const ctx = createMockCtx({
      state: { route: { config: { auth: true } } },
    });
    const next = vi.fn(async () => {});

    await expect(middleware(ctx, next)).rejects.toThrow('Missing authorization header');
  });

  it('throws for invalid auth format', async () => {
    const apick = createMockApick();
    const middleware = createAuthMiddleware({ apick, jwtSecret, adminSecret, apiTokenSalt });

    const ctx = createMockCtx({
      headers: { authorization: 'Basic abc123' },
      state: { route: { config: { auth: true } } },
    });
    const next = vi.fn(async () => {});

    await expect(middleware(ctx, next)).rejects.toThrow('Invalid authorization format');
  });

  it('throws for invalid JWT token', async () => {
    const apick = createMockApick();
    const middleware = createAuthMiddleware({ apick, jwtSecret, adminSecret, apiTokenSalt });

    const ctx = createMockCtx({
      headers: { authorization: 'Bearer invalid.jwt.token' },
      state: { route: { config: { auth: true } } },
    });
    const next = vi.fn(async () => {});

    await expect(middleware(ctx, next)).rejects.toThrow();
  });

  it('proceeds without auth when no route config and no header', async () => {
    const apick = createMockApick();
    const middleware = createAuthMiddleware({ apick, jwtSecret, adminSecret, apiTokenSalt });

    const ctx = createMockCtx({ state: {} });
    const next = vi.fn(async () => {});

    await middleware(ctx, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(ctx.state.isAuthenticated).toBe(false);
  });

  it('loads user data when user service is available', async () => {
    const mockUser = { id: 42, email: 'test@test.com', username: 'tester' };
    const apick = createMockApick({
      service: (uid: string) => {
        if (uid === 'plugin::users-permissions.user') {
          return { findOne: async (id: any) => id === 42 ? mockUser : null };
        }
        return null;
      },
    });
    const middleware = createAuthMiddleware({ apick, jwtSecret, adminSecret, apiTokenSalt });

    const token = signJWT({ id: 42 }, jwtSecret, { expiresIn: '1h' });
    const ctx = createMockCtx({
      url: '/api/articles',
      headers: { authorization: `Bearer ${token}` },
      state: { route: { config: { auth: true } } },
    });
    const next = vi.fn(async () => {});

    await middleware(ctx, next);

    expect(ctx.state.user).toEqual(mockUser);
  });
});
