import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestEnv } from '../../test-helpers.js';

const ARTICLE_SCHEMA = {
  kind: 'collectionType' as const,
  info: { singularName: 'article', pluralName: 'articles', displayName: 'Article' },
  options: { draftAndPublish: false },
  attributes: {
    title: { type: 'string', required: true },
    views: { type: 'integer', default: 0 },
    featured: { type: 'boolean', default: false },
  },
};

describe('Tutorial 07: Custom Controllers and Services', () => {
  let env: ReturnType<typeof createTestEnv>;

  beforeEach(async () => {
    env = createTestEnv({
      contentTypes: [{ uid: 'api::article.article', schema: ARTICLE_SCHEMA }],
    });

    // Register a custom "findPopular" route
    env.server.route({
      method: 'GET',
      path: '/api/articles/popular',
      handler: async (ctx) => {
        const documents = env.apick.documents('api::article.article');
        const articles = await documents.findMany({
          sort: ['views:desc'],
          pagination: { start: 0, limit: 3 },
        });
        ctx.body = { data: articles, meta: { description: 'Top 3 most viewed articles' } };
      },
    });

    // Register a custom "toggleFeatured" route
    env.server.route({
      method: 'POST',
      path: '/api/articles/:id/toggle-featured',
      handler: async (ctx) => {
        const { id } = ctx.params;
        const documents = env.apick.documents('api::article.article');
        const existing = await documents.findOne({ documentId: id });
        if (!existing) {
          ctx.status = 404;
          ctx.body = { data: null, error: { status: 404, name: 'NotFoundError', message: 'Not Found' } };
          return;
        }
        const updated = await documents.update({
          documentId: id,
          data: { featured: !existing.featured },
        });
        ctx.body = { data: updated, meta: {} };
      },
    });

    // Seed articles with different view counts
    const articles = [
      { title: 'Low Views', views: 10 },
      { title: 'Medium Views', views: 100 },
      { title: 'High Views', views: 500 },
      { title: 'Very High Views', views: 1000 },
      { title: 'Moderate Views', views: 250 },
    ];
    for (const data of articles) {
      await env.server.inject({
        method: 'POST', url: '/api/articles',
        body: { data },
      });
    }
  });

  afterEach(() => {
    env.eventHub.destroy();
    env.db.close();
  });

  it('GET /api/articles/popular returns top 3 by views', async () => {
    const res = await env.server.inject({ method: 'GET', url: '/api/articles/popular' });

    expect(res.statusCode).toBe(200);
    expect(res.body.data).toHaveLength(3);
    expect(res.body.data[0].title).toBe('Very High Views');
    expect(res.body.data[1].title).toBe('High Views');
    expect(res.body.data[2].title).toBe('Moderate Views');
    expect(res.body.meta.description).toBe('Top 3 most viewed articles');
  });

  it('standard CRUD routes still work alongside custom routes', async () => {
    const res = await env.server.inject({ method: 'GET', url: '/api/articles' });
    expect(res.statusCode).toBe(200);
    expect(res.body.data).toHaveLength(5);
  });

  it('POST /api/articles/:id/toggle-featured flips the featured flag', async () => {
    // Get the first article
    const list = await env.server.inject({ method: 'GET', url: '/api/articles' });
    const article = list.body.data[0];
    const docId = article.document_id;
    const originalFeatured = article.featured;

    // Toggle
    const toggle = await env.server.inject({
      method: 'POST', url: `/api/articles/${docId}/toggle-featured`,
    });
    expect(toggle.statusCode).toBe(200);

    // Verify the toggle happened
    // SQLite stores booleans as 0/1, so compare truthiness
    const newFeatured = toggle.body.data.featured;
    expect(!!newFeatured).toBe(!originalFeatured);
  });

  it('toggle-featured returns 404 for non-existent article', async () => {
    const res = await env.server.inject({
      method: 'POST', url: '/api/articles/nonexistent/toggle-featured',
    });
    expect(res.statusCode).toBe(404);
  });

  it('custom route can coexist with parameterized CRUD routes', async () => {
    // /api/articles/popular should NOT be treated as /api/articles/:id
    const popular = await env.server.inject({ method: 'GET', url: '/api/articles/popular' });
    expect(popular.statusCode).toBe(200);
    expect(popular.body.data).toHaveLength(3);

    // /api/articles/:real-id should still work
    const list = await env.server.inject({ method: 'GET', url: '/api/articles' });
    const docId = list.body.data[0].document_id;
    const single = await env.server.inject({ method: 'GET', url: `/api/articles/${docId}` });
    expect(single.statusCode).toBe(200);
  });
});
