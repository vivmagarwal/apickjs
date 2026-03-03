import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestEnv } from '../../test-helpers.js';

const POST_SCHEMA = {
  kind: 'collectionType' as const,
  info: { singularName: 'post', pluralName: 'posts', displayName: 'Post' },
  options: { draftAndPublish: false },
  attributes: {
    title: { type: 'string', required: true },
    body: { type: 'text' },
  },
};

describe('Tutorial 01: Hello APIck', () => {
  let env: ReturnType<typeof createTestEnv>;

  beforeEach(() => {
    env = createTestEnv({
      contentTypes: [{ uid: 'api::post.post', schema: POST_SCHEMA }],
    });
  });

  afterEach(() => {
    env.eventHub.destroy();
    env.db.close();
  });

  it('POST /api/posts creates a post and returns 201', async () => {
    const res = await env.server.inject({
      method: 'POST',
      url: '/api/posts',
      body: { data: { title: 'My First Post', body: 'Hello world!' } },
    });

    expect(res.statusCode).toBe(201);
    expect(res.body.data.title).toBe('My First Post');
    expect(res.body.data.body).toBe('Hello world!');
    expect(res.body.data.document_id).toBeDefined();
  });

  it('GET /api/posts lists all posts', async () => {
    await env.server.inject({
      method: 'POST', url: '/api/posts',
      body: { data: { title: 'Post A' } },
    });
    await env.server.inject({
      method: 'POST', url: '/api/posts',
      body: { data: { title: 'Post B' } },
    });

    const res = await env.server.inject({ method: 'GET', url: '/api/posts' });
    expect(res.statusCode).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.meta.pagination.total).toBe(2);
  });

  it('GET /api/posts/:id retrieves a specific post', async () => {
    const create = await env.server.inject({
      method: 'POST', url: '/api/posts',
      body: { data: { title: 'Specific Post' } },
    });
    const docId = create.body.data.document_id;

    const res = await env.server.inject({ method: 'GET', url: `/api/posts/${docId}` });
    expect(res.statusCode).toBe(200);
    expect(res.body.data.title).toBe('Specific Post');
  });

  it('PUT /api/posts/:id updates a post', async () => {
    const create = await env.server.inject({
      method: 'POST', url: '/api/posts',
      body: { data: { title: 'Original' } },
    });
    const docId = create.body.data.document_id;

    const res = await env.server.inject({
      method: 'PUT', url: `/api/posts/${docId}`,
      body: { data: { title: 'Updated' } },
    });
    expect(res.statusCode).toBe(200);
    expect(res.body.data.title).toBe('Updated');
  });

  it('DELETE /api/posts/:id removes a post', async () => {
    const create = await env.server.inject({
      method: 'POST', url: '/api/posts',
      body: { data: { title: 'To Delete' } },
    });
    const docId = create.body.data.document_id;

    const del = await env.server.inject({ method: 'DELETE', url: `/api/posts/${docId}` });
    expect(del.statusCode).toBe(200);

    const get = await env.server.inject({ method: 'GET', url: `/api/posts/${docId}` });
    expect(get.statusCode).toBe(404);
  });

  it('full CRUD lifecycle', async () => {
    // Create
    const c = await env.server.inject({
      method: 'POST', url: '/api/posts',
      body: { data: { title: 'Lifecycle Test', body: 'Initial' } },
    });
    expect(c.statusCode).toBe(201);
    const docId = c.body.data.document_id;

    // Read
    const r = await env.server.inject({ method: 'GET', url: `/api/posts/${docId}` });
    expect(r.body.data.title).toBe('Lifecycle Test');

    // Update
    const u = await env.server.inject({
      method: 'PUT', url: `/api/posts/${docId}`,
      body: { data: { title: 'Updated Lifecycle', body: 'Updated' } },
    });
    expect(u.body.data.title).toBe('Updated Lifecycle');

    // Delete
    const d = await env.server.inject({ method: 'DELETE', url: `/api/posts/${docId}` });
    expect(d.statusCode).toBe(200);

    // Verify gone
    const gone = await env.server.inject({ method: 'GET', url: `/api/posts/${docId}` });
    expect(gone.statusCode).toBe(404);
  });
});
