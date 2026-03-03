import { describe, it, expect, vi } from 'vitest';
import { createRateLimitMiddleware } from '../src/middlewares/rate-limit.js';
import { createSecurityMiddleware } from '../src/middlewares/security.js';

// --- Helper to create a mock context ---

function createMockContext(overrides: any = {}): any {
  const headers: Record<string, string> = {};
  return {
    ip: overrides.ip || '127.0.0.1',
    state: {},
    status: 200,
    body: null,
    request: {
      body: null,
      headers: {},
      method: 'GET',
      url: '/',
    },
    params: {},
    query: {},
    set: vi.fn((name: string, value: string) => {
      headers[name] = value;
    }),
    get _headers() {
      return headers;
    },
    ...overrides,
  };
}

// ==========================================================================
// createSecurityMiddleware
// ==========================================================================

describe('createSecurityMiddleware', () => {
  it('sets all default security headers', async () => {
    const middleware = createSecurityMiddleware();
    const ctx = createMockContext();
    const next = vi.fn();

    await middleware(ctx, next);

    expect(ctx.set).toHaveBeenCalledWith('X-Content-Type-Options', 'nosniff');
    expect(ctx.set).toHaveBeenCalledWith('X-Frame-Options', 'DENY');
    expect(ctx.set).toHaveBeenCalledWith('X-XSS-Protection', '1; mode=block');
    expect(ctx.set).toHaveBeenCalledWith('Referrer-Policy', 'strict-origin-when-cross-origin');
    expect(ctx.set).toHaveBeenCalledWith('Content-Security-Policy', "default-src 'self'");
    expect(ctx.set).toHaveBeenCalledWith('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  });

  it('calls next()', async () => {
    const middleware = createSecurityMiddleware();
    const ctx = createMockContext();
    const next = vi.fn();

    await middleware(ctx, next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('allows overriding a header with a custom string', async () => {
    const middleware = createSecurityMiddleware({
      frameOptions: 'SAMEORIGIN',
    });
    const ctx = createMockContext();
    const next = vi.fn();

    await middleware(ctx, next);

    expect(ctx.set).toHaveBeenCalledWith('X-Frame-Options', 'SAMEORIGIN');
  });

  it('allows disabling a header with false', async () => {
    const middleware = createSecurityMiddleware({
      xssProtection: false,
    });
    const ctx = createMockContext();
    const next = vi.fn();

    await middleware(ctx, next);

    // Should NOT have set X-XSS-Protection
    const xssCall = (ctx.set as any).mock.calls.find(
      (c: any[]) => c[0] === 'X-XSS-Protection',
    );
    expect(xssCall).toBeUndefined();
  });

  it('allows disabling a header with null', async () => {
    const middleware = createSecurityMiddleware({
      hsts: null,
    });
    const ctx = createMockContext();
    const next = vi.fn();

    await middleware(ctx, next);

    const hstsCall = (ctx.set as any).mock.calls.find(
      (c: any[]) => c[0] === 'Strict-Transport-Security',
    );
    expect(hstsCall).toBeUndefined();
  });

  it('overrides CSP header', async () => {
    const middleware = createSecurityMiddleware({
      contentSecurityPolicy: "default-src 'self'; script-src 'self' cdn.example.com",
    });
    const ctx = createMockContext();
    const next = vi.fn();

    await middleware(ctx, next);

    expect(ctx.set).toHaveBeenCalledWith(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self' cdn.example.com",
    );
  });

  it('works with empty config object', async () => {
    const middleware = createSecurityMiddleware({});
    const ctx = createMockContext();
    const next = vi.fn();

    await middleware(ctx, next);

    // Should set all 6 default headers
    expect(ctx.set).toHaveBeenCalledTimes(6);
  });

  it('works with no config', async () => {
    const middleware = createSecurityMiddleware();
    const ctx = createMockContext();
    const next = vi.fn();

    await middleware(ctx, next);

    expect(ctx.set).toHaveBeenCalledTimes(6);
  });
});

// ==========================================================================
// createRateLimitMiddleware
// ==========================================================================

describe('createRateLimitMiddleware', () => {
  it('allows requests under the limit', async () => {
    const middleware = createRateLimitMiddleware({ max: 10, window: 60000 });
    const ctx = createMockContext();
    const next = vi.fn();

    await middleware(ctx, next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  it('sets rate limit headers by default', async () => {
    const middleware = createRateLimitMiddleware({ max: 100, window: 60000 });
    const ctx = createMockContext();
    const next = vi.fn();

    await middleware(ctx, next);

    expect(ctx.set).toHaveBeenCalledWith('X-RateLimit-Limit', '100');
    expect(ctx.set).toHaveBeenCalledWith('X-RateLimit-Remaining', '99');
    expect(ctx.set).toHaveBeenCalledWith('X-RateLimit-Reset', expect.any(String));
  });

  it('decrements remaining count on each request', async () => {
    const middleware = createRateLimitMiddleware({ max: 5, window: 60000 });
    const next = vi.fn();

    // First request
    const ctx1 = createMockContext();
    await middleware(ctx1, next);
    expect(ctx1.set).toHaveBeenCalledWith('X-RateLimit-Remaining', '4');

    // Second request
    const ctx2 = createMockContext();
    await middleware(ctx2, next);
    expect(ctx2.set).toHaveBeenCalledWith('X-RateLimit-Remaining', '3');
  });

  it('throws RateLimitError when limit is exceeded', async () => {
    const middleware = createRateLimitMiddleware({ max: 2, window: 60000 });
    const next = vi.fn();

    // First two requests should succeed
    await middleware(createMockContext(), next);
    await middleware(createMockContext(), next);

    // Third should throw
    const ctx3 = createMockContext();
    await expect(middleware(ctx3, next)).rejects.toThrow('Too Many Requests');
  });

  it('uses custom error message', async () => {
    const middleware = createRateLimitMiddleware({
      max: 1,
      window: 60000,
      message: 'Slow down!',
    });
    const next = vi.fn();

    await middleware(createMockContext(), next);

    await expect(middleware(createMockContext(), next)).rejects.toThrow('Slow down!');
  });

  it('uses custom key generator', async () => {
    const middleware = createRateLimitMiddleware({
      max: 2,
      window: 60000,
      keyGenerator: (ctx: any) => ctx.state.userId || ctx.ip,
    });
    const next = vi.fn();

    // Two requests from user-1
    const ctx1 = createMockContext({ state: { userId: 'user-1' } });
    const ctx2 = createMockContext({ state: { userId: 'user-1' } });
    await middleware(ctx1, next);
    await middleware(ctx2, next);

    // Third request from user-1 should fail
    const ctx3 = createMockContext({ state: { userId: 'user-1' } });
    await expect(middleware(ctx3, next)).rejects.toThrow();

    // But user-2 should still be allowed
    const ctx4 = createMockContext({ state: { userId: 'user-2' } });
    await middleware(ctx4, next);
    expect(next).toHaveBeenCalledTimes(3); // ctx1, ctx2, ctx4
  });

  it('does not set headers when headers option is false', async () => {
    const middleware = createRateLimitMiddleware({
      max: 100,
      window: 60000,
      headers: false,
    });
    const ctx = createMockContext();
    const next = vi.fn();

    await middleware(ctx, next);

    expect(ctx.set).not.toHaveBeenCalled();
  });

  it('uses default max of 100', async () => {
    const middleware = createRateLimitMiddleware({ window: 60000 });
    const ctx = createMockContext();
    const next = vi.fn();

    await middleware(ctx, next);

    expect(ctx.set).toHaveBeenCalledWith('X-RateLimit-Limit', '100');
  });

  it('tracks different IPs separately', async () => {
    const middleware = createRateLimitMiddleware({ max: 1, window: 60000 });
    const next = vi.fn();

    // Request from IP 1
    await middleware(createMockContext({ ip: '10.0.0.1' }), next);
    // Request from IP 2 should succeed
    await middleware(createMockContext({ ip: '10.0.0.2' }), next);

    expect(next).toHaveBeenCalledTimes(2);
  });

  it('sets Retry-After header on 429', async () => {
    const middleware = createRateLimitMiddleware({ max: 1, window: 60000 });
    const next = vi.fn();

    await middleware(createMockContext(), next);

    // This should throw but we can check the context
    const ctx = createMockContext();
    try {
      await middleware(ctx, next);
    } catch {
      // Expected
    }

    expect(ctx.set).toHaveBeenCalledWith('Retry-After', expect.any(String));
  });

  it('works with default config', async () => {
    const middleware = createRateLimitMiddleware();
    const ctx = createMockContext();
    const next = vi.fn();

    await middleware(ctx, next);
    expect(next).toHaveBeenCalledTimes(1);
  });
});
