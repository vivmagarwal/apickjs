import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestEnv } from '../../test-helpers.js';

const ARTICLE_SCHEMA = {
  kind: 'collectionType' as const,
  info: { singularName: 'article', pluralName: 'articles', displayName: 'Article' },
  options: { draftAndPublish: false },
  attributes: {
    title: { type: 'string', required: true },
  },
};

const HOMEPAGE_SCHEMA = {
  kind: 'singleType' as const,
  info: { singularName: 'homepage', pluralName: 'homepages', displayName: 'Homepage' },
  options: { draftAndPublish: false },
  attributes: {
    hero_title: { type: 'string' },
    hero_subtitle: { type: 'text' },
    featured_count: { type: 'integer', default: 3 },
  },
};

describe('Tutorial 04: Single Types', () => {
  let env: ReturnType<typeof createTestEnv>;

  beforeEach(() => {
    env = createTestEnv({
      contentTypes: [
        { uid: 'api::article.article', schema: ARTICLE_SCHEMA },
        { uid: 'api::homepage.homepage', schema: HOMEPAGE_SCHEMA },
      ],
    });
  });

  afterEach(() => {
    env.eventHub.destroy();
    env.db.close();
  });

  it('GET /api/homepage returns 404 when no data exists', async () => {
    const res = await env.server.inject({ method: 'GET', url: '/api/homepage' });
    expect(res.statusCode).toBe(404);
  });

  it('PUT /api/homepage creates single type on first call (201)', async () => {
    const res = await env.server.inject({
      method: 'PUT', url: '/api/homepage',
      body: { data: { hero_title: 'Welcome to APICK' } },
    });

    expect(res.statusCode).toBe(201);
    expect(res.body.data.hero_title).toBe('Welcome to APICK');
  });

  it('PUT /api/homepage updates existing single type (200)', async () => {
    await env.server.inject({
      method: 'PUT', url: '/api/homepage',
      body: { data: { hero_title: 'Initial' } },
    });

    const res = await env.server.inject({
      method: 'PUT', url: '/api/homepage',
      body: { data: { hero_title: 'Updated Title' } },
    });

    expect(res.statusCode).toBe(200);
    expect(res.body.data.hero_title).toBe('Updated Title');
  });

  it('GET /api/homepage returns single type after creation', async () => {
    await env.server.inject({
      method: 'PUT', url: '/api/homepage',
      body: { data: { hero_title: 'Hello World', hero_subtitle: 'Build APIs fast' } },
    });

    const res = await env.server.inject({ method: 'GET', url: '/api/homepage' });
    expect(res.statusCode).toBe(200);
    expect(res.body.data.hero_title).toBe('Hello World');
    expect(res.body.data.hero_subtitle).toBe('Build APIs fast');
  });

  it('DELETE /api/homepage removes the single type', async () => {
    await env.server.inject({
      method: 'PUT', url: '/api/homepage',
      body: { data: { hero_title: 'Remove Me' } },
    });

    const del = await env.server.inject({ method: 'DELETE', url: '/api/homepage' });
    expect(del.statusCode).toBe(200);

    const get = await env.server.inject({ method: 'GET', url: '/api/homepage' });
    expect(get.statusCode).toBe(404);
  });

  it('single type and collection type coexist', async () => {
    // Create homepage single type
    await env.server.inject({
      method: 'PUT', url: '/api/homepage',
      body: { data: { hero_title: 'Homepage' } },
    });

    // Create collection articles
    await env.server.inject({
      method: 'POST', url: '/api/articles',
      body: { data: { title: 'Article 1' } },
    });
    await env.server.inject({
      method: 'POST', url: '/api/articles',
      body: { data: { title: 'Article 2' } },
    });

    // Both work independently
    const homepage = await env.server.inject({ method: 'GET', url: '/api/homepage' });
    expect(homepage.statusCode).toBe(200);
    expect(homepage.body.data.hero_title).toBe('Homepage');

    const articles = await env.server.inject({ method: 'GET', url: '/api/articles' });
    expect(articles.statusCode).toBe(200);
    expect(articles.body.data).toHaveLength(2);
  });

  it('full single type lifecycle: create → read → update → delete → verify gone', async () => {
    // Create
    const c = await env.server.inject({
      method: 'PUT', url: '/api/homepage',
      body: { data: { hero_title: 'Lifecycle Test', featured_count: 5 } },
    });
    expect(c.statusCode).toBe(201);

    // Read
    const r = await env.server.inject({ method: 'GET', url: '/api/homepage' });
    expect(r.body.data.hero_title).toBe('Lifecycle Test');

    // Update
    const u = await env.server.inject({
      method: 'PUT', url: '/api/homepage',
      body: { data: { hero_title: 'Updated' } },
    });
    expect(u.body.data.hero_title).toBe('Updated');

    // Delete
    const d = await env.server.inject({ method: 'DELETE', url: '/api/homepage' });
    expect(d.statusCode).toBe(200);

    // Verify gone
    const gone = await env.server.inject({ method: 'GET', url: '/api/homepage' });
    expect(gone.statusCode).toBe(404);
  });
});
