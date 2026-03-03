# Tutorial 08: Lifecycle Hooks and Events

In a headless CMS, you often need to run custom logic **before** or **after** core operations like creating, updating, or deleting content. Apick achieves this with two complementary mechanisms:

- **Middleware** -- intercepts requests to run "before" logic (modify input) and "after" logic (react to results)
- **Event Hub** -- a pub/sub system for decoupled "after" notifications across the application

Together, these give you full lifecycle hook capabilities without coupling business logic to the core.

---

## Core Concepts

### The Event Hub

The event hub is a simple publish/subscribe system. Any part of the application can emit events, and any number of subscribers can listen for them.

```typescript
// Listen for an event
eventHub.on('article.created', (event) => {
  console.log('New article:', event.title);
});

// Emit an event (subscribers execute sequentially)
await eventHub.emit('article.created', { title: 'Hello World' });
```

Key properties:

- **`eventHub.on(event, handler)`** -- registers a handler for the given event name
- **`eventHub.emit(event, data)`** -- fires the event, passing `data` to each subscriber
- **Sequential execution** -- subscribers run one after another in registration order, not in parallel. This guarantees ordering and prevents race conditions.

### Middleware as Lifecycle Hooks

Apick middleware follows the classic "onion" pattern. Code before `await next()` runs on the way **in** (before the route handler), and code after `await next()` runs on the way **out** (after the route handler).

```typescript
server.use(async (ctx, next) => {
  // --- BEFORE phase ---
  // Modify request, validate input, enrich data
  console.log('Before handler');

  await next(); // calls the route handler (and any inner middleware)

  // --- AFTER phase ---
  // React to the response, emit events, log results
  console.log('After handler');
});
```

This makes middleware the natural place for lifecycle hooks.

---

## Example 1: Auto-Slug Generation (Before Hook)

A common requirement is to automatically generate a URL-friendly slug from the article title when one is not provided. This is "before" logic -- we modify the request body before it reaches the route handler.

```typescript
server.use(async (ctx, next) => {
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
```

Now creating an article without a slug:

```bash
curl -X POST http://localhost:1337/api/articles \
  -H "Content-Type: application/json" \
  -d '{"data": {"title": "My Amazing Article!"}}'
```

Returns:

```json
{
  "data": {
    "id": 1,
    "title": "My Amazing Article!",
    "slug": "my-amazing-article"
  }
}
```

If you provide an explicit slug, the middleware leaves it alone:

```bash
curl -X POST http://localhost:1337/api/articles \
  -H "Content-Type: application/json" \
  -d '{"data": {"title": "My Article", "slug": "custom-slug"}}'
```

---

## Example 2: Event Notification After Creation (After Hook)

After an article is successfully created, you may want to notify other parts of the system -- send an email, invalidate a cache, update a search index, etc. This is "after" logic combined with the event hub.

```typescript
// Middleware emits an event after successful creation
server.use(async (ctx, next) => {
  await next();

  if (
    ctx.request.method === 'POST' &&
    ctx.request.url === '/api/articles' &&
    ctx.status === 201
  ) {
    await eventHub.emit('article.created', ctx.body?.data);
  }
});

// Subscriber reacts to the event
eventHub.on('article.created', (event) => {
  console.log(`Article created: ${event.title} (id: ${event.id})`);
  // Could also: send email, bust cache, index for search, etc.
});
```

The key benefit is **decoupling**: the middleware does not need to know what happens after the event is emitted. Subscribers can be added or removed independently.

---

## Combining Both Patterns

A single middleware can handle both "before" and "after" concerns:

```typescript
server.use(async (ctx, next) => {
  // BEFORE: auto-generate slug
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

  // AFTER: emit creation event
  if (
    ctx.request.method === 'POST' &&
    ctx.request.url === '/api/articles' &&
    ctx.status === 201
  ) {
    await eventHub.emit('article.created', ctx.body?.data);
  }
});
```

This gives you a full lifecycle hook in a single, readable function:
1. The slug is generated before the handler saves the article.
2. After the handler responds with 201, the event fires with the saved data (including the auto-generated slug).

---

## Sequential Subscriber Execution

Subscribers for a given event execute **sequentially**, not in parallel. This means each subscriber finishes before the next one starts:

```typescript
eventHub.on('test.order', async () => {
  await new Promise(r => setTimeout(r, 10)); // simulate async work
  order.push(1);
});

eventHub.on('test.order', async () => {
  order.push(2);
});

await eventHub.emit('test.order', {});
// order is [1, 2], not [2, 1]
```

This guarantees predictable execution order, which is important when subscribers depend on side effects from earlier subscribers.

---

## Content Type

This tutorial uses a simple `Article` content type with `title` (required string) and `slug` (uid):

```typescript
// src/api/article/content-type.ts
export default {
  kind: 'collectionType' as const,
  info: { singularName: 'article', pluralName: 'articles', displayName: 'Article' },
  options: { draftAndPublish: false },
  attributes: {
    title: { type: 'string', required: true },
    slug: { type: 'uid' },
  },
};
```

---

## Curl Examples

Create an article (slug auto-generated):

```bash
curl -X POST http://localhost:1337/api/articles \
  -H "Content-Type: application/json" \
  -d '{"data": {"title": "Getting Started with Apick"}}'
```

Create an article with an explicit slug:

```bash
curl -X POST http://localhost:1337/api/articles \
  -H "Content-Type: application/json" \
  -d '{"data": {"title": "Custom Slug Example", "slug": "my-custom-slug"}}'
```

List all articles:

```bash
curl http://localhost:1337/api/articles
```

---

## Documentation References

The concepts in this tutorial are covered in more detail in these guides:

- [Plugins Guide](../../docs/PLUGINS_GUIDE.md) -- Event Hub section: `eventHub.on()`, `eventHub.emit()`, built-in events (`entry.create`, `entry.update`, etc.), event payload structure (`{ result, params }`), sequential execution, error handling (fail-safe)
- [Customization Guide](../../docs/CUSTOMIZATION_GUIDE.md) -- Middlewares section: onion model for before/after hooks, Lifecycle Hooks section: database-level callbacks
- [Database Guide](../../docs/DATABASE_GUIDE.md) -- Document Service event emission during create/update/delete

---

## Running Tests

From the tutorial directory:

```bash
cd tutorials/08-lifecycle-hooks
npm install
npm test
```

The test suite covers:

1. **eventHub.on receives events when emitted** -- basic pub/sub works
2. **Multiple listeners receive the same event** -- fan-out to multiple listeners
3. **Auto-slug middleware generates slug on create** -- before-hook modifies request
4. **Auto-slug does not overwrite explicit slug** -- conditional before-hook logic
5. **Post-create event fires after article creation** -- after-hook emits event
6. **Combined: auto-slug + event notification on create** -- both patterns in one middleware
7. **Listeners execute sequentially** -- ordering guarantee with async listeners
