# Tutorial 07: Custom Controllers and Services

The auto-generated CRUD routes (`GET`, `POST`, `PUT`, `DELETE`) cover standard data operations, but real-world APIs often need endpoints that go beyond simple create/read/update/delete. You might need to return a filtered subset of data, perform a multi-step business logic operation, or combine data from multiple content types into a single response.

This tutorial shows how to register **custom routes** that sit alongside the auto-generated ones, using the document service to interact with your data.

## Why Custom Routes?

Standard CRUD is great for basic data management, but consider these scenarios:

- **Popular articles** — return only the top N articles sorted by view count
- **Toggle a flag** — flip a boolean field on a record in a single request instead of requiring the client to read, modify, and write back
- **Aggregate endpoints** — return computed data (counts, averages, summaries)
- **Workflow triggers** — publish, archive, or transition content through states

Each of these requires custom logic that the generic CRUD handlers cannot provide.

## Adding Custom Routes via `server.route()`

Custom routes are registered by calling `server.route()` with a method, path, and handler function. The handler receives a `ctx` object (the same context used by built-in routes) and can use the document service to query or mutate data.

### Example 1: GET /api/articles/popular

This endpoint returns the top 3 most-viewed articles:

```typescript
server.route({
  method: 'GET',
  path: '/api/articles/popular',
  handler: async (ctx) => {
    const documents = apick.documents('api::article.article');
    const articles = await documents.findMany({
      sort: ['views:desc'],
      pagination: { start: 0, limit: 3 },
    });
    ctx.body = {
      data: articles,
      meta: { description: 'Top 3 most viewed articles' },
    };
  },
});
```

The handler uses the document service's `findMany` with sorting and pagination to fetch exactly the data it needs. The response follows the standard `{ data, meta }` envelope.

### Example 2: POST /api/articles/:id/toggle-featured

This endpoint flips the `featured` boolean on a specific article:

```typescript
server.route({
  method: 'POST',
  path: '/api/articles/:id/toggle-featured',
  handler: async (ctx) => {
    const { id } = ctx.params;
    const documents = apick.documents('api::article.article');

    // Fetch the current state
    const existing = await documents.findOne({ documentId: id });
    if (!existing) {
      ctx.status = 404;
      ctx.body = {
        data: null,
        error: { status: 404, name: 'NotFoundError', message: 'Not Found' },
      };
      return;
    }

    // Flip the flag and persist
    const updated = await documents.update({
      documentId: id,
      data: { featured: !existing.featured },
    });

    ctx.body = { data: updated, meta: {} };
  },
});
```

Key points:

- The handler reads the current record, checks it exists, computes the new value, and writes it back -- all in a single request.
- Error handling follows the standard APICK error envelope (`{ data: null, error: { ... } }`).
- The `:id` parameter in the path is available via `ctx.params.id`.

## Route Registration Order

When using a router like `find-my-way`, **specific paths take priority over parameterized paths**. The path `/api/articles/popular` is a static match and will always be preferred over `/api/articles/:id` when the URL is `/api/articles/popular`.

This means custom routes with specific path segments naturally coexist with the auto-generated CRUD routes:

```
GET  /api/articles              <- auto-generated (list)
POST /api/articles              <- auto-generated (create)
GET  /api/articles/popular      <- custom (static match wins)
GET  /api/articles/:id          <- auto-generated (find one)
PUT  /api/articles/:id          <- auto-generated (update)
DELETE /api/articles/:id        <- auto-generated (delete)
POST /api/articles/:id/toggle-featured  <- custom (nested param route)
```

## Pattern: Custom Handlers Use the Document Service

A custom route handler should use the document service (`apick.documents(uid)`) rather than raw SQL. This ensures:

1. **Consistent behavior** — sorting, filtering, and pagination work the same as in auto-generated routes
2. **Event emission** — lifecycle events (`beforeCreate`, `afterUpdate`, etc.) still fire
3. **Validation** — input data is validated against the content type schema
4. **Maintainability** — if the underlying storage changes, your custom routes keep working

## Curl Examples

Seed some articles:

```bash
curl -X POST http://localhost:1337/api/articles \
  -H "Content-Type: application/json" \
  -d '{"data": {"title": "Getting Started", "views": 500}}'

curl -X POST http://localhost:1337/api/articles \
  -H "Content-Type: application/json" \
  -d '{"data": {"title": "Advanced Tips", "views": 1000}}'

curl -X POST http://localhost:1337/api/articles \
  -H "Content-Type: application/json" \
  -d '{"data": {"title": "Quick Guide", "views": 250}}'
```

Fetch the most popular articles:

```bash
curl http://localhost:1337/api/articles/popular
```

Response:

```json
{
  "data": [
    { "id": 2, "document_id": "...", "title": "Advanced Tips", "views": 1000, "featured": false },
    { "id": 1, "document_id": "...", "title": "Getting Started", "views": 500, "featured": false },
    { "id": 3, "document_id": "...", "title": "Quick Guide", "views": 250, "featured": false }
  ],
  "meta": { "description": "Top 3 most viewed articles" }
}
```

Toggle the featured flag on an article:

```bash
# Get the document_id of the first article
DOC_ID=$(curl -s http://localhost:1337/api/articles | jq -r '.data[0].document_id')

# Toggle featured
curl -X POST "http://localhost:1337/api/articles/${DOC_ID}/toggle-featured"
```

## Documentation References

The concepts in this tutorial are covered in more detail in these guides:

- [Customization Guide](../../docs/CUSTOMIZATION_GUIDE.md) -- Controllers section: `createCoreController`, custom actions, route registration. Services section: `createCoreService`, extending default CRUD
- [Content API Guide](../../docs/CONTENT_API_GUIDE.md) -- route registration order, per-content-type route configuration
- [Development Standards](../../docs/DEVELOPMENT_STANDARDS.md) -- factory function patterns, custom controller examples

---

## Running the Tests

```bash
cd tutorials/07-custom-controllers
npm install
npm test
```

The test suite covers:
1. `GET /api/articles/popular` returns the top 3 articles sorted by views descending
2. Standard CRUD routes continue to work alongside custom routes
3. `POST /api/articles/:id/toggle-featured` flips the featured boolean
4. Toggle-featured returns `404` for a non-existent article
5. Custom static paths (`/popular`) coexist correctly with parameterized CRUD paths (`/:id`)
