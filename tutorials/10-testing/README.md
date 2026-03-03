# Tutorial 10: Testing Your APIck App

In this final tutorial of the series, we bring everything together by showing you how to **test** an APIck application thoroughly. Instead of a traditional walkthrough, the test file itself _is_ the tutorial — each `describe` block demonstrates a real-world testing pattern you can copy into your own projects.

---

## Why `server.inject()`?

APIck's HTTP server exposes a `server.inject()` method that simulates an HTTP request **without opening a network socket**. This gives you:

- **Speed** — no TCP overhead, no port conflicts.
- **Full fidelity** — the entire middleware stack, router, and controller pipeline runs exactly as it would in production.
- **Simplicity** — no need for `fetch`, `supertest`, or any HTTP client library.

```typescript
const res = await env.server.inject({
  method: 'GET',
  url: '/api/articles',
  query: { status: 'draft' },
  headers: { Authorization: 'Bearer ...' },
  body: { data: { title: 'Hello' } },
});

expect(res.statusCode).toBe(200);
expect(res.body.data).toBeDefined();
```

The returned object contains `statusCode`, `headers`, and `body` (already parsed from JSON).

---

## The `createTestEnv` Pattern

Every test in this tutorial uses a shared helper that lives at `tutorials/test-helpers.ts`:

```typescript
import { createTestEnv, signJWT, verifyJWT } from '../../test-helpers.js';
```

`createTestEnv` does three things:

1. **Creates an in-memory SQLite database** — no files on disk, no cleanup needed.
2. **Registers your content types** and builds the corresponding tables automatically.
3. **Returns a fully wired environment** (`server`, `db`, `eventHub`) ready to accept `inject()` calls.

Because each call to `createTestEnv` produces a completely independent database, **every test starts from a clean slate** with zero data leakage between tests.

```typescript
const env = createTestEnv({
  contentTypes: [
    { uid: 'api::article.article', schema: ARTICLE_SCHEMA },
  ],
});
```

The helper also exports `signJWT` and `verifyJWT` for testing authentication flows without pulling in heavyweight JWT libraries.

---

## The Six Testing Patterns

Open `tests/testing-patterns.test.ts` and follow along. Each section below maps to a `describe` block in that file.

### Pattern 1: Basic CRUD Lifecycle

The bread and butter of API testing — verify that Create, Read, Update, and Delete all work end-to-end.

**What this tests:**
- `POST /api/articles` returns `201` with the created document.
- `GET /api/articles/:documentId` retrieves it.
- `PUT /api/articles/:documentId` updates fields.
- `DELETE /api/articles/:documentId` removes it.
- A subsequent `GET` returns `404`.

**Key takeaway:** Always test the _full_ lifecycle in a single test. This catches ordering bugs (e.g., delete not actually removing the row) that isolated tests would miss.

```typescript
const create = await env.server.inject({
  method: 'POST', url: '/api/articles',
  body: { data: { title: 'Test Article', slug: 'test-article' } },
});
expect(create.statusCode).toBe(201);
const docId = create.body.data.document_id;

const del = await env.server.inject({
  method: 'DELETE', url: `/api/articles/${docId}`,
});
expect(del.statusCode).toBe(200);
```

### Pattern 2: Draft/Publish Workflow

Content types with `draftAndPublish: true` have a two-phase lifecycle. This pattern verifies the entire flow:

**What this tests:**
- Newly created documents are drafts (`published_at` is `null`).
- Drafts are hidden from the default listing (`GET /api/articles`).
- Drafts appear when you query with `?status=draft`.
- `POST /api/articles/:documentId/publish` publishes the document.
- Published documents appear in the default listing.
- `POST /api/articles/:documentId/unpublish` reverts to draft.

**Key takeaway:** Test visibility from the consumer's perspective. It is not enough to check that `published_at` flips — also verify the listing endpoint reflects the change.

### Pattern 3: Middleware Testing

Middleware is a core part of any APIck app. This pattern shows three ways to test it:

#### 3a: Custom Response Headers

Register a timing middleware with `env.server.use()`, then assert the header is present:

```typescript
env.server.use(async (ctx, next) => {
  const start = Date.now();
  await next();
  ctx.set('X-Response-Time', `${Date.now() - start}ms`);
});

const res = await env.server.inject({ method: 'GET', url: '/api/articles' });
expect(res.headers['x-response-time']).toMatch(/\d+ms/);
```

#### 3b: Auth Middleware with JWT

Register a middleware that checks for a `Bearer` token, then test both the rejection path (no token -> `401`) and the happy path (valid token -> `200`):

```typescript
// Without token
const noAuth = await env.server.inject({ method: 'GET', url: '/api/articles' });
expect(noAuth.statusCode).toBe(401);

// With valid token
const token = signJWT({ id: 1 }, SECRET, { expiresIn: 3600 });
const authed = await env.server.inject({
  method: 'GET', url: '/api/articles',
  headers: { Authorization: `Bearer ${token}` },
});
expect(authed.statusCode).toBe(200);
```

#### 3c: Execution Order

Push numbers into an array before and after `await next()` to prove the onion model:

```typescript
const order: number[] = [];
env.server.use(async (_ctx, next) => { order.push(1); await next(); order.push(4); });
env.server.use(async (_ctx, next) => { order.push(2); await next(); order.push(3); });

await env.server.inject({ method: 'GET', url: '/api/articles' });
expect(order).toEqual([1, 2, 3, 4]);
```

**Key takeaway:** You can add middleware _per test_ since each `createTestEnv` call gives you a fresh server instance.

### Pattern 4: Error Response Format Validation

APIck follows a standard error envelope. This pattern verifies that every error response matches:

```json
{
  "data": null,
  "error": {
    "status": 404,
    "name": "NotFoundError",
    "message": "..."
  }
}
```

**What this tests:**
- `GET /api/articles/nonexistent` returns `404` with the standard shape.
- `POST /api/articles` with a malformed body returns `400` with `name: 'ValidationError'`.
- A completely unknown route returns `404` (not a stack trace or empty response).

**Key takeaway:** Use `expect.objectContaining()` and `expect.any(String)` for fields whose exact value may change, while still enforcing the overall structure.

### Pattern 5: Pagination and Sorting

Once you have more than a handful of records, pagination and sorting become critical. This pattern seeds five articles and tests:

**Sorting:**
- `?sort=title:asc` returns alphabetical order.
- `?sort=views:desc` returns highest views first.

**Page-based pagination:**
- `?page=1&pageSize=2` returns 2 items and a `meta.pagination` object with `page`, `pageSize`, `pageCount`, and `total`.

**Offset-based pagination:**
- `?start=2&limit=2` skips the first 2 records and returns the next 2.

**Key takeaway:** Always assert both the `data` array and the `meta.pagination` object. A pagination bug that returns the right data but wrong `pageCount` will break your frontend.

### Pattern 6: Test Isolation

This is the simplest but most important pattern. Two tests run back-to-back:

- **Test A** creates an article and asserts the listing has 1 item.
- **Test B** creates a fresh environment and asserts the listing has 0 items.

If test isolation is broken, Test B would see the article from Test A. The in-memory SQLite approach guarantees this never happens.

**Key takeaway:** Never rely on test execution order. Every test should set up its own state and tear it down.

---

## Best Practices

1. **Test the full stack.** `server.inject()` exercises middleware, routing, controllers, and the database layer in one call. This catches integration bugs that unit tests miss.

2. **Avoid mocks wherever possible.** Since `createTestEnv` gives you a real (in-memory) database, there is no need to mock the data layer. Your tests reflect actual behavior.

3. **Assert both status codes and body structure.** A `200` status code alone does not guarantee correctness — always check the response body too.

4. **Clean up after each test.** Call `env.eventHub.destroy()` and `env.db.close()` in `afterEach` to release resources. This prevents memory leaks when running large test suites.

5. **Use `beforeEach` for seeding.** When multiple tests need the same data (like Pattern 5), seed in `beforeEach` rather than in a `beforeAll`. This ensures each test starts fresh even if a previous test mutated the data.

6. **Keep test files focused.** One test file per content type or feature area. This makes it easy to run a subset of tests during development (`npx vitest run tests/articles.test.ts`).

---

## Running the Tests

```bash
npx vitest run
```

To run in watch mode during development:

```bash
npx vitest
```

To run a specific test file:

```bash
npx vitest run tests/testing-patterns.test.ts
```

---

## Tutorial Series Summary

Congratulations on completing all 10 tutorials! Here is what we covered:

| Tutorial | Topic | Key Concepts |
|----------|-------|--------------|
| 01 | Hello APIck | Project setup, first content type, CRUD basics |
| 02 | Field Types and Querying | All field types, filtering, sorting, field selection |
| 03 | Draft and Publish | Draft/publish lifecycle, status filtering, publish/unpublish actions |
| 04 | Single Types | Single-type content (e.g., homepage), PUT/GET semantics |
| 05 | Middleware | Global middleware, route-scoped middleware, the onion model |
| 06 | Authentication | JWT-based auth, protected routes, user context |
| 07 | Custom Controllers | Override default CRUD, custom business logic |
| 08 | Lifecycle Hooks | beforeCreate, afterUpdate, and other model hooks |
| 09 | Caching | In-memory LRU cache, TTL, cache invalidation |
| 10 | Testing | server.inject(), createTestEnv, 6 testing patterns |

You now have the foundation to build, customize, and thoroughly test a production-grade headless CMS with APIck.
