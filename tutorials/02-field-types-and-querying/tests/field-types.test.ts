import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestEnv } from '../../test-helpers.js';

const ARTICLE_SCHEMA = {
  kind: 'collectionType' as const,
  info: { singularName: 'article', pluralName: 'articles', displayName: 'Article' },
  options: { draftAndPublish: false },
  attributes: {
    title: { type: 'string', required: true },
    slug: { type: 'uid', targetField: 'title' },
    content: { type: 'richtext' },
    excerpt: { type: 'text' },
    views: { type: 'integer', default: 0 },
    featured: { type: 'boolean', default: false },
    category: { type: 'enumeration', enum: ['news', 'tutorial', 'opinion', 'release'] },
    metadata: { type: 'json' },
  },
};

describe('Tutorial 02: Field Types and Querying', () => {
  let env: ReturnType<typeof createTestEnv>;

  beforeEach(async () => {
    env = createTestEnv({
      contentTypes: [{ uid: 'api::article.article', schema: ARTICLE_SCHEMA }],
    });

    // Seed 5 articles
    const articles = [
      { title: 'Alpha Article', slug: 'alpha', views: 100, category: 'news', featured: true },
      { title: 'Beta Guide', slug: 'beta', views: 50, category: 'tutorial', featured: false },
      { title: 'Gamma Release', slug: 'gamma', views: 200, category: 'release', featured: true },
      { title: 'Delta Opinion', slug: 'delta', views: 75, category: 'opinion', featured: false },
      { title: 'Epsilon Tutorial', slug: 'epsilon', views: 150, category: 'tutorial', featured: true },
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

  it('stores and retrieves all field types correctly', async () => {
    const res = await env.server.inject({
      method: 'POST', url: '/api/articles',
      body: {
        data: {
          title: 'Full Fields',
          slug: 'full-fields',
          content: '<p>Rich text content</p>',
          excerpt: 'A short excerpt',
          views: 42,
          featured: true,
          category: 'tutorial',
          metadata: JSON.stringify({ seo: { keywords: ['test'] } }),
        },
      },
    });

    expect(res.statusCode).toBe(201);
    const article = res.body.data;
    expect(article.title).toBe('Full Fields');
    expect(article.slug).toBe('full-fields');
    expect(article.content).toBe('<p>Rich text content</p>');
    expect(article.excerpt).toBe('A short excerpt');
    expect(article.views).toBe(42);
    expect(article.category).toBe('tutorial');
  });

  it('sort ascending by title', async () => {
    const res = await env.server.inject({
      method: 'GET', url: '/api/articles',
      query: { sort: 'title:asc' },
    });

    expect(res.statusCode).toBe(200);
    const titles = res.body.data.map((d: any) => d.title);
    expect(titles[0]).toBe('Alpha Article');
    expect(titles[4]).toBe('Gamma Release');
  });

  it('sort descending by views', async () => {
    const res = await env.server.inject({
      method: 'GET', url: '/api/articles',
      query: { sort: 'views:desc' },
    });

    expect(res.statusCode).toBe(200);
    const views = res.body.data.map((d: any) => d.views);
    expect(views[0]).toBe(200); // Gamma
    expect(views[4]).toBe(50);  // Beta
  });

  it('page-based pagination', async () => {
    const res = await env.server.inject({
      method: 'GET', url: '/api/articles',
      query: { page: '1', pageSize: '2' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.meta.pagination.total).toBe(5);
    expect(res.body.meta.pagination.pageCount).toBe(3);
    expect(res.body.meta.pagination.page).toBe(1);
  });

  it('offset-based pagination', async () => {
    const res = await env.server.inject({
      method: 'GET', url: '/api/articles',
      query: { start: '0', limit: '3' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.body.data).toHaveLength(3);
    expect(res.body.meta.pagination.total).toBe(5);
  });

  it('second page returns remaining items', async () => {
    const res = await env.server.inject({
      method: 'GET', url: '/api/articles',
      query: { page: '3', pageSize: '2' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.body.data).toHaveLength(1); // 5 items, page 3 of pageSize 2 = 1 item
    expect(res.body.meta.pagination.total).toBe(5);
  });

  it('default pagination metadata is present', async () => {
    const res = await env.server.inject({
      method: 'GET', url: '/api/articles',
    });

    expect(res.body.meta.pagination).toBeDefined();
    expect(res.body.meta.pagination.total).toBe(5);
    expect(res.body.meta.pagination.page).toBeDefined();
    expect(res.body.meta.pagination.pageSize).toBeDefined();
    expect(res.body.meta.pagination.pageCount).toBeDefined();
  });
});
