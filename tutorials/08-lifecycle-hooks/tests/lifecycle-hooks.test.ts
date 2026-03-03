import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestEnv } from '../../test-helpers.js';

const ARTICLE_SCHEMA = {
  kind: 'collectionType' as const,
  info: { singularName: 'article', pluralName: 'articles', displayName: 'Article' },
  options: { draftAndPublish: false },
  attributes: {
    title: { type: 'string', required: true },
    slug: { type: 'uid' },
  },
};

describe('Tutorial 08: Lifecycle Hooks and Events', () => {
  let env: ReturnType<typeof createTestEnv>;

  beforeEach(() => {
    env = createTestEnv({
      contentTypes: [{ uid: 'api::article.article', schema: ARTICLE_SCHEMA }],
    });
  });

  afterEach(() => {
    env.eventHub.destroy();
    env.db.close();
  });

  it('eventHub.on receives events when emitted', async () => {
    const received: any[] = [];

    env.eventHub.on('article.created', (event: any) => {
      received.push(event);
    });

    await env.eventHub.emit('article.created', { title: 'Test Article' });

    expect(received).toHaveLength(1);
    expect(received[0].title).toBe('Test Article');
  });

  it('multiple listeners receive the same event', async () => {
    const log1: string[] = [];
    const log2: string[] = [];

    env.eventHub.on('article.published', (event: any) => {
      log1.push(`subscriber1: ${event.title}`);
    });

    env.eventHub.on('article.published', (event: any) => {
      log2.push(`subscriber2: ${event.title}`);
    });

    await env.eventHub.emit('article.published', { title: 'Published Post' });

    expect(log1).toEqual(['subscriber1: Published Post']);
    expect(log2).toEqual(['subscriber2: Published Post']);
  });

  it('auto-slug middleware generates slug on create', async () => {
    // Middleware that auto-generates a slug from the title
    env.server.use(async (ctx, next) => {
      if (ctx.request.method === 'POST' && ctx.request.url === '/api/articles') {
        const body = ctx.request.body;
        if (body?.data?.title && !body.data.slug) {
          body.data.slug = body.data.title
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '');
        }
      }
      await next();
    });

    const res = await env.server.inject({
      method: 'POST', url: '/api/articles',
      body: { data: { title: 'My Amazing Article!' } },
    });

    expect(res.statusCode).toBe(201);
    expect(res.body.data.slug).toBe('my-amazing-article');
  });

  it('auto-slug does not overwrite explicit slug', async () => {
    env.server.use(async (ctx, next) => {
      if (ctx.request.method === 'POST' && ctx.request.url === '/api/articles') {
        const body = ctx.request.body;
        if (body?.data?.title && !body.data.slug) {
          body.data.slug = body.data.title
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '');
        }
      }
      await next();
    });

    const res = await env.server.inject({
      method: 'POST', url: '/api/articles',
      body: { data: { title: 'My Article', slug: 'custom-slug' } },
    });

    expect(res.statusCode).toBe(201);
    expect(res.body.data.slug).toBe('custom-slug');
  });

  it('post-create event fires after article creation', async () => {
    const createdArticles: any[] = [];

    // Middleware that emits events after successful creation
    env.server.use(async (ctx, next) => {
      await next();
      if (
        ctx.request.method === 'POST' &&
        ctx.request.url === '/api/articles' &&
        ctx.status === 201
      ) {
        await env.eventHub.emit('article.created', ctx.body?.data);
      }
    });

    env.eventHub.on('article.created', (event: any) => {
      createdArticles.push(event);
    });

    await env.server.inject({
      method: 'POST', url: '/api/articles',
      body: { data: { title: 'Event Test' } },
    });

    expect(createdArticles).toHaveLength(1);
    expect(createdArticles[0].title).toBe('Event Test');
  });

  it('combined: auto-slug + event notification on create', async () => {
    const events: any[] = [];

    // Auto-slug middleware (before)
    env.server.use(async (ctx, next) => {
      if (ctx.request.method === 'POST' && ctx.request.url === '/api/articles') {
        const body = ctx.request.body;
        if (body?.data?.title && !body.data.slug) {
          body.data.slug = body.data.title
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '');
        }
      }
      await next();
      // Event notification (after)
      if (
        ctx.request.method === 'POST' &&
        ctx.request.url === '/api/articles' &&
        ctx.status === 201
      ) {
        await env.eventHub.emit('article.created', ctx.body?.data);
      }
    });

    env.eventHub.on('article.created', (event: any) => {
      events.push({ title: event.title, slug: event.slug });
    });

    await env.server.inject({
      method: 'POST', url: '/api/articles',
      body: { data: { title: 'Hello World Post' } },
    });

    expect(events).toHaveLength(1);
    expect(events[0].title).toBe('Hello World Post');
    expect(events[0].slug).toBe('hello-world-post');
  });

  it('listeners execute sequentially', async () => {
    const order: number[] = [];

    env.eventHub.on('test.order', async () => {
      await new Promise(r => setTimeout(r, 10));
      order.push(1);
    });

    env.eventHub.on('test.order', async () => {
      order.push(2);
    });

    await env.eventHub.emit('test.order', {});

    expect(order).toEqual([1, 2]);
  });
});
