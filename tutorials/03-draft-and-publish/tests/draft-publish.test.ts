import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestEnv } from '../../test-helpers.js';

const ARTICLE_SCHEMA = {
  kind: 'collectionType' as const,
  info: { singularName: 'article', pluralName: 'articles', displayName: 'Article' },
  options: { draftAndPublish: true },
  attributes: {
    title: { type: 'string', required: true },
    content: { type: 'richtext' },
  },
};

describe('Tutorial 03: Draft and Publish', () => {
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

  it('POST creates a draft by default', async () => {
    const res = await env.server.inject({
      method: 'POST', url: '/api/articles',
      body: { data: { title: 'My Draft', content: 'Work in progress' } },
    });

    expect(res.statusCode).toBe(201);
    expect(res.body.data.published_at).toBeNull();
  });

  it('draft is NOT visible in default GET (published only)', async () => {
    await env.server.inject({
      method: 'POST', url: '/api/articles',
      body: { data: { title: 'Hidden Draft' } },
    });

    const list = await env.server.inject({ method: 'GET', url: '/api/articles' });
    expect(list.body.data).toHaveLength(0);
    expect(list.body.meta.pagination.total).toBe(0);
  });

  it('draft IS visible with status=draft query', async () => {
    await env.server.inject({
      method: 'POST', url: '/api/articles',
      body: { data: { title: 'Visible Draft' } },
    });

    const list = await env.server.inject({
      method: 'GET', url: '/api/articles',
      query: { status: 'draft' },
    });
    expect(list.body.data).toHaveLength(1);
    expect(list.body.data[0].title).toBe('Visible Draft');
  });

  it('POST with status=published creates a published entry', async () => {
    const res = await env.server.inject({
      method: 'POST', url: '/api/articles',
      body: { data: { title: 'Published Now' }, status: 'published' },
    });

    expect(res.statusCode).toBe(201);
    expect(res.body.data.published_at).not.toBeNull();

    const list = await env.server.inject({ method: 'GET', url: '/api/articles' });
    expect(list.body.data).toHaveLength(1);
  });

  it('publish a draft makes it visible', async () => {
    const create = await env.server.inject({
      method: 'POST', url: '/api/articles',
      body: { data: { title: 'To Publish' } },
    });
    const docId = create.body.data.document_id;

    // Not visible yet
    const before = await env.server.inject({ method: 'GET', url: '/api/articles' });
    expect(before.body.data).toHaveLength(0);

    // Publish
    const pub = await env.server.inject({
      method: 'POST', url: `/api/articles/${docId}/publish`,
    });
    expect(pub.statusCode).toBe(200);
    expect(pub.body.data.published_at).not.toBeNull();

    // Now visible
    const after = await env.server.inject({ method: 'GET', url: '/api/articles' });
    expect(after.body.data).toHaveLength(1);
    expect(after.body.data[0].title).toBe('To Publish');
  });

  it('unpublish reverts to draft', async () => {
    // Create and publish
    const create = await env.server.inject({
      method: 'POST', url: '/api/articles',
      body: { data: { title: 'To Unpublish' }, status: 'published' },
    });
    const docId = create.body.data.document_id;

    // Visible
    const before = await env.server.inject({ method: 'GET', url: '/api/articles' });
    expect(before.body.data).toHaveLength(1);

    // Unpublish
    const unpub = await env.server.inject({
      method: 'POST', url: `/api/articles/${docId}/unpublish`,
    });
    expect(unpub.statusCode).toBe(200);
    expect(unpub.body.data.published_at).toBeNull();

    // No longer visible in default GET
    const after = await env.server.inject({ method: 'GET', url: '/api/articles' });
    expect(after.body.data).toHaveLength(0);

    // Still visible with status=draft
    const drafts = await env.server.inject({
      method: 'GET', url: '/api/articles',
      query: { status: 'draft' },
    });
    expect(drafts.body.data).toHaveLength(1);
  });

  it('full lifecycle: create draft → publish → update → unpublish → delete', async () => {
    // Create draft
    const c = await env.server.inject({
      method: 'POST', url: '/api/articles',
      body: { data: { title: 'Lifecycle', content: 'Draft content' } },
    });
    expect(c.statusCode).toBe(201);
    const docId = c.body.data.document_id;

    // Publish
    const pub = await env.server.inject({
      method: 'POST', url: `/api/articles/${docId}/publish`,
    });
    expect(pub.statusCode).toBe(200);

    // Update published
    const upd = await env.server.inject({
      method: 'PUT', url: `/api/articles/${docId}`,
      body: { data: { title: 'Updated Lifecycle' } },
    });
    expect(upd.body.data.title).toBe('Updated Lifecycle');

    // Unpublish
    const unpub = await env.server.inject({
      method: 'POST', url: `/api/articles/${docId}/unpublish`,
    });
    expect(unpub.statusCode).toBe(200);

    // Delete
    const del = await env.server.inject({ method: 'DELETE', url: `/api/articles/${docId}` });
    expect(del.statusCode).toBe(200);

    // Verify completely gone
    const gone = await env.server.inject({
      method: 'GET', url: `/api/articles/${docId}`,
      query: { status: 'draft' },
    });
    expect(gone.statusCode).toBe(404);
  });
});
