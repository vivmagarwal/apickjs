import { describe, it, expect, beforeEach } from 'vitest';
import { createServer } from '../src/server/index.js';
import { createLogger } from '../src/logging/index.js';

function makeServer() {
  const logger = createLogger({ level: 'silent' });
  return createServer({ logger, proxyEnabled: false });
}

describe('HTTP Server', () => {
  describe('Health check', () => {
    it('GET /_health returns 204', async () => {
      const server = makeServer();
      const res = await server.inject({ method: 'GET', url: '/_health' });
      expect(res.statusCode).toBe(204);
    });
  });

  describe('Routing', () => {
    it('registers and handles a GET route', async () => {
      const server = makeServer();
      server.route({
        method: 'GET',
        path: '/api/articles',
        handler: (ctx) => {
          ctx.send([{ id: 1, title: 'Hello' }]);
        },
      });

      const res = await server.inject({ method: 'GET', url: '/api/articles' });
      expect(res.statusCode).toBe(200);
      expect(res.body.data).toEqual([{ id: 1, title: 'Hello' }]);
    });

    it('handles URL parameters', async () => {
      const server = makeServer();
      server.route({
        method: 'GET',
        path: '/api/articles/:id',
        handler: (ctx) => {
          ctx.send({ id: ctx.params.id });
        },
      });

      const res = await server.inject({ method: 'GET', url: '/api/articles/42' });
      expect(res.statusCode).toBe(200);
      expect(res.body.data).toEqual({ id: '42' });
    });

    it('parses query parameters', async () => {
      const server = makeServer();
      server.route({
        method: 'GET',
        path: '/api/test',
        handler: (ctx) => {
          ctx.send({ query: ctx.query });
        },
      });

      const res = await server.inject({
        method: 'GET',
        url: '/api/test',
        query: { page: '1', limit: '10' },
      });
      expect(res.statusCode).toBe(200);
      expect(res.body.data.query).toEqual({ page: '1', limit: '10' });
    });

    it('handles POST with JSON body', async () => {
      const server = makeServer();
      server.route({
        method: 'POST',
        path: '/api/articles',
        handler: (ctx) => {
          ctx.created(ctx.request.body);
        },
      });

      const res = await server.inject({
        method: 'POST',
        url: '/api/articles',
        body: { title: 'New Article', content: 'Hello world' },
      });
      expect(res.statusCode).toBe(201);
      expect(res.body.data).toEqual({ title: 'New Article', content: 'Hello world' });
    });

    it('returns 404 for unmatched routes', async () => {
      const server = makeServer();
      const res = await server.inject({ method: 'GET', url: '/nonexistent' });
      expect(res.statusCode).toBe(404);
      expect(res.body.error.name).toBe('NotFoundError');
    });
  });

  describe('Response helpers', () => {
    it('send() returns 200', async () => {
      const server = makeServer();
      server.route({
        method: 'GET',
        path: '/test',
        handler: (ctx) => {
          ctx.send({ hello: 'world' });
        },
      });

      const res = await server.inject({ method: 'GET', url: '/test' });
      expect(res.statusCode).toBe(200);
      expect(res.body.data).toEqual({ hello: 'world' });
    });

    it('created() returns 201', async () => {
      const server = makeServer();
      server.route({
        method: 'POST',
        path: '/test',
        handler: (ctx) => {
          ctx.created({ id: 1 });
        },
      });

      const res = await server.inject({ method: 'POST', url: '/test' });
      expect(res.statusCode).toBe(201);
    });

    it('deleted() returns 200', async () => {
      const server = makeServer();
      server.route({
        method: 'DELETE',
        path: '/test/:id',
        handler: (ctx) => {
          ctx.deleted();
        },
      });

      const res = await server.inject({ method: 'DELETE', url: '/test/1' });
      expect(res.statusCode).toBe(200);
    });
  });

  describe('Error handling', () => {
    it('handles ApplicationError thrown in handler', async () => {
      const server = makeServer();
      server.route({
        method: 'GET',
        path: '/error',
        handler: (ctx) => {
          ctx.notFound('Article not found');
        },
      });

      const res = await server.inject({ method: 'GET', url: '/error' });
      expect(res.statusCode).toBe(404);
      expect(res.body.data).toBeNull();
      expect(res.body.error.name).toBe('NotFoundError');
      expect(res.body.error.message).toBe('Article not found');
    });

    it('handles badRequest', async () => {
      const server = makeServer();
      server.route({
        method: 'POST',
        path: '/test',
        handler: (ctx) => {
          ctx.badRequest('Invalid input');
        },
      });

      const res = await server.inject({ method: 'POST', url: '/test' });
      expect(res.statusCode).toBe(400);
      expect(res.body.error.message).toBe('Invalid input');
    });

    it('handles unhandled errors with 500', async () => {
      const server = makeServer();
      server.route({
        method: 'GET',
        path: '/crash',
        handler: () => {
          throw new Error('unexpected');
        },
      });

      const res = await server.inject({ method: 'GET', url: '/crash' });
      expect(res.statusCode).toBe(500);
      expect(res.body.error.status).toBe(500);
    });
  });

  describe('Middleware pipeline', () => {
    it('executes global middleware in order', async () => {
      const server = makeServer();
      const order: string[] = [];

      server.use(async (ctx, next) => {
        order.push('mw1-before');
        await next();
        order.push('mw1-after');
      });

      server.use(async (ctx, next) => {
        order.push('mw2-before');
        await next();
        order.push('mw2-after');
      });

      server.route({
        method: 'GET',
        path: '/test',
        handler: (ctx) => {
          order.push('handler');
          ctx.send({ ok: true });
        },
      });

      await server.inject({ method: 'GET', url: '/test' });
      expect(order).toEqual([
        'mw1-before',
        'mw2-before',
        'handler',
        'mw2-after',
        'mw1-after',
      ]);
    });

    it('middleware can short-circuit the pipeline', async () => {
      const server = makeServer();
      let handlerCalled = false;

      server.use(async (ctx, _next) => {
        // Don't call next() — short-circuit
        ctx.status = 403;
        ctx.body = { data: null, error: { status: 403, name: 'Forbidden', message: 'Blocked by middleware' } };
      });

      server.route({
        method: 'GET',
        path: '/test',
        handler: () => {
          handlerCalled = true;
        },
      });

      const res = await server.inject({ method: 'GET', url: '/test' });
      expect(res.statusCode).toBe(403);
      expect(handlerCalled).toBe(false);
    });

    it('middleware can modify the context', async () => {
      const server = makeServer();

      server.use(async (ctx, next) => {
        ctx.state.user = { id: 1, name: 'admin' };
        await next();
      });

      server.route({
        method: 'GET',
        path: '/test',
        handler: (ctx) => {
          ctx.send({ user: ctx.state.user });
        },
      });

      const res = await server.inject({ method: 'GET', url: '/test' });
      expect(res.body.data.user).toEqual({ id: 1, name: 'admin' });
    });
  });

  describe('Return value handling', () => {
    it('wraps direct return value in { data, meta }', async () => {
      const server = makeServer();
      server.route({
        method: 'GET',
        path: '/test',
        handler: () => {
          return { title: 'Hello' };
        },
      });

      const res = await server.inject({ method: 'GET', url: '/test' });
      expect(res.statusCode).toBe(200);
      expect(res.body.data).toEqual({ title: 'Hello' });
    });
  });
});
