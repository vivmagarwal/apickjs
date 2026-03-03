import { describe, it, expect, vi } from 'vitest';
import { requestContext, createRequestContextMiddleware } from '../src/request-context/index.js';
import type { RequestContextStore } from '../src/request-context/index.js';

describe('requestContext', () => {
  it('returns undefined outside of a run scope', () => {
    expect(requestContext.get()).toBeUndefined();
  });

  it('returns the store inside a run scope', () => {
    const store: RequestContextStore = {
      state: { auth: undefined, isAuthenticated: false },
      request: { ip: '127.0.0.1', url: '/test', method: 'GET', headers: {} },
    };

    requestContext.run(store, () => {
      const ctx = requestContext.get();
      expect(ctx).toBeDefined();
      expect(ctx!.request.ip).toBe('127.0.0.1');
      expect(ctx!.request.url).toBe('/test');
    });
  });

  it('returns undefined after run scope exits', () => {
    const store: RequestContextStore = {
      state: {},
      request: { ip: '1.2.3.4', url: '/', method: 'GET', headers: {} },
    };

    requestContext.run(store, () => {
      expect(requestContext.get()).toBeDefined();
    });

    expect(requestContext.get()).toBeUndefined();
  });

  it('propagates through async calls', async () => {
    const store: RequestContextStore = {
      state: {
        auth: {
          authenticated: true,
          credentials: { id: 42, type: 'user' },
        },
      },
      request: { ip: '10.0.0.1', url: '/api/articles', method: 'POST', headers: {} },
    };

    await requestContext.run(store, async () => {
      await new Promise((resolve) => setTimeout(resolve, 1));
      const ctx = requestContext.get();
      expect(ctx).toBeDefined();
      expect(ctx!.state.auth!.credentials.id).toBe(42);
    });
  });

  it('isolates nested run scopes', () => {
    const outerStore: RequestContextStore = {
      state: {},
      request: { ip: 'outer', url: '/', method: 'GET', headers: {} },
    };
    const innerStore: RequestContextStore = {
      state: {},
      request: { ip: 'inner', url: '/', method: 'GET', headers: {} },
    };

    requestContext.run(outerStore, () => {
      expect(requestContext.get()!.request.ip).toBe('outer');

      requestContext.run(innerStore, () => {
        expect(requestContext.get()!.request.ip).toBe('inner');
      });

      // Back to outer after inner exits
      expect(requestContext.get()!.request.ip).toBe('outer');
    });
  });

  it('stores auth state with ability', () => {
    const mockAbility = { can: () => true };
    const store: RequestContextStore = {
      state: {
        auth: {
          authenticated: true,
          credentials: { id: 1, type: 'user' },
          ability: mockAbility,
        },
        user: { id: 1, email: 'test@test.com' },
        isAuthenticated: true,
      },
      request: { ip: '127.0.0.1', url: '/', method: 'GET', headers: {} },
    };

    requestContext.run(store, () => {
      const ctx = requestContext.get()!;
      expect(ctx.state.auth!.ability.can()).toBe(true);
      expect(ctx.state.user.email).toBe('test@test.com');
      expect(ctx.state.isAuthenticated).toBe(true);
    });
  });

  it('stores request headers', () => {
    const store: RequestContextStore = {
      state: {},
      request: {
        ip: '127.0.0.1',
        url: '/',
        method: 'GET',
        headers: { 'accept-language': 'fr', authorization: 'Bearer test' },
      },
    };

    requestContext.run(store, () => {
      const ctx = requestContext.get()!;
      expect(ctx.request.headers['accept-language']).toBe('fr');
      expect(ctx.request.headers['authorization']).toBe('Bearer test');
    });
  });
});

describe('createRequestContextMiddleware', () => {
  it('creates middleware that populates request context', async () => {
    const middleware = createRequestContextMiddleware();
    const ctx: any = {
      ip: '192.168.1.1',
      request: { url: '/api/test', method: 'POST', headers: { 'x-custom': 'value' } },
      state: {
        auth: { authenticated: true, credentials: { id: 5, type: 'user' } },
        isAuthenticated: true,
      },
    };

    let capturedContext: RequestContextStore | undefined;
    const next = async () => {
      capturedContext = requestContext.get();
    };

    await middleware(ctx, next);

    expect(capturedContext).toBeDefined();
    expect(capturedContext!.request.ip).toBe('192.168.1.1');
    expect(capturedContext!.request.method).toBe('POST');
    expect(capturedContext!.state.auth!.credentials.id).toBe(5);
  });

  it('calls next()', async () => {
    const middleware = createRequestContextMiddleware();
    const ctx: any = {
      ip: '127.0.0.1',
      request: { url: '/', method: 'GET', headers: {} },
      state: {},
    };
    const next = vi.fn(async () => {});

    await middleware(ctx, next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('handles missing fields gracefully', async () => {
    const middleware = createRequestContextMiddleware();
    const ctx: any = { state: {} };

    let capturedContext: RequestContextStore | undefined;
    const next = async () => {
      capturedContext = requestContext.get();
    };

    await middleware(ctx, next);
    expect(capturedContext).toBeDefined();
    expect(capturedContext!.request.ip).toBe('0.0.0.0');
  });
});
