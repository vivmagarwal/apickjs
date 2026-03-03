# Tutorial 09: Caching

> **Monorepo tutorial.** This tutorial runs within the [apickjs monorepo](https://github.com/vivmagarwal/apickjs). Clone the repo and `npm install` at the root first. For standalone npm projects, see the [Getting Started guide](../../docs/GETTING_STARTED.md).

## What You'll Build

In this tutorial you will add a caching layer to your API so that repeated
read requests are served from an in-memory cache instead of hitting the
database every time.  You will also learn how to **invalidate** stale cache
entries whenever a write operation (POST / PUT / DELETE) occurs.

By the end you will have:

- A working `createCache()` instance with `get`, `set`, `has`, `del`,
  `clear`, and `keys` operations.
- A **cache-aside** middleware that intercepts GET requests, serves cached
  responses when available, and populates the cache on a miss.
- Automatic **cache invalidation** when articles are created, updated, or
  deleted.
- An `X-Cache` response header (`HIT` or `MISS`) for easy debugging.

---

## Prerequisites

| Requirement | Version |
|-------------|---------|
| Node.js     | >= 20   |
| npm          | >= 10   |

Make sure you have completed the earlier tutorials (especially **Tutorial 01:
Hello World** and **Tutorial 05: Middleware**) so that the core concepts of
content types, the HTTP server, and middleware are familiar.

---

## The `createCache()` API

Apick ships with an in-memory LRU cache (`@apick/core`).  The cache instance
exposes the following methods:

| Method | Signature | Description |
|--------|-----------|-------------|
| **get** | `cache.get(key: string)` | Returns the cached value or `undefined`. |
| **set** | `cache.set(key: string, value: any, ttl?: number)` | Stores a value. Optional `ttl` in **milliseconds**. |
| **has** | `cache.has(key: string)` | Returns `true` if the key exists and has not expired. |
| **del** | `cache.del(key: string)` | Removes a single key from the cache. |
| **clear** | `cache.clear()` | Removes **all** entries. |
| **keys** | `cache.keys()` | Returns an array of all cache keys. |

### Basic Usage

```typescript
import { createCache } from '@apick/core';

const cache = createCache();

// Store a value
await cache.set('greeting', 'Hello, world!');

// Retrieve it
const val = await cache.get('greeting'); // 'Hello, world!'

// Check existence
await cache.has('greeting'); // true

// Delete it
await cache.del('greeting');
await cache.has('greeting'); // false
```

### TTL (Time-To-Live)

Pass a TTL in milliseconds as the third argument to `set`.  After the TTL
elapses the entry is automatically evicted:

```typescript
// Cache for 30 seconds
await cache.set('temp', 'data', 30_000);
```

---

## Cache-Aside Pattern

The **cache-aside** (also called *lazy-loading*) pattern works like this:

1. The middleware intercepts an incoming GET request.
2. It checks the cache for a matching key.
3. **HIT** -- If the key exists, respond immediately from the cache.
4. **MISS** -- If not, call `next()` to let the normal handler run, then
   store the response in the cache for future requests.

### Middleware Implementation

```typescript
// src/middlewares/cache-aside.ts
export default function cacheAside(cache) {
  return async (ctx, next) => {
    // Only cache GET requests for articles
    if (ctx.request.method === 'GET' && ctx.request.url === '/api/articles') {
      const cacheKey = 'api:articles:list';

      const cached = await cache.get(cacheKey);
      if (cached) {
        ctx.status = 200;
        ctx.body = cached;
        ctx.set('X-Cache', 'HIT');
        return;
      }

      // Cache miss — run the real handler
      await next();

      if (ctx.status === 200) {
        await cache.set(cacheKey, ctx.body);
      }
      ctx.set('X-Cache', 'MISS');
      return;
    }

    await next();
  };
}
```

The `X-Cache` header makes it easy to tell from the outside whether a
response was served from memory or freshly computed.

---

## Cache Invalidation on Writes

Cached data becomes **stale** the moment a write operation changes the
underlying data.  To keep the cache consistent you must **invalidate**
(delete) the relevant cache entries after any POST, PUT, or DELETE.

Extend the middleware to handle invalidation:

```typescript
export default function cacheAsideWithInvalidation(cache) {
  return async (ctx, next) => {
    // --- Read path (cache-aside) ---
    if (ctx.request.method === 'GET' && ctx.request.url === '/api/articles') {
      const cacheKey = 'api:articles:list';
      const cached = await cache.get(cacheKey);
      if (cached) {
        ctx.status = 200;
        ctx.body = cached;
        ctx.set('X-Cache', 'HIT');
        return;
      }
      await next();
      if (ctx.status === 200) {
        await cache.set(cacheKey, ctx.body);
      }
      ctx.set('X-Cache', 'MISS');
      return;
    }

    // --- Write path ---
    await next();

    // Invalidate after successful writes
    if (['POST', 'PUT', 'DELETE'].includes(ctx.request.method) &&
        ctx.request.url.startsWith('/api/articles')) {
      await cache.del('api:articles:list');
    }
  };
}
```

With this in place, any mutation automatically busts the list cache so the
next GET re-fetches fresh data from the database.

---

## Trying It with curl

Start the server and observe the cache behaviour:

```bash
# Create an article
curl -X POST http://localhost:1337/api/articles \
  -H "Content-Type: application/json" \
  -d '{"data":{"title":"Caching 101"}}'

# First GET — cache MISS
curl -v http://localhost:1337/api/articles 2>&1 | grep X-Cache
# < X-Cache: MISS

# Second GET — cache HIT (no DB query)
curl -v http://localhost:1337/api/articles 2>&1 | grep X-Cache
# < X-Cache: HIT

# Create another article — invalidates the cache
curl -X POST http://localhost:1337/api/articles \
  -H "Content-Type: application/json" \
  -d '{"data":{"title":"Caching 201"}}'

# Next GET — cache MISS again (stale entry was evicted)
curl -v http://localhost:1337/api/articles 2>&1 | grep X-Cache
# < X-Cache: MISS
```

---

## Documentation References

The concepts in this tutorial are covered in more detail in these guides:

- [Plugins Guide](../../docs/PLUGINS_GUIDE.md) -- Event Hub for cache invalidation patterns
- [Customization Guide](../../docs/CUSTOMIZATION_GUIDE.md) -- Middlewares section: writing middleware for caching, onion model for intercepting responses

---

## Running Tests

```bash
cd tutorials/09-caching
npm install
npm test
```

The test suite covers:

| Test | What it verifies |
|------|------------------|
| `cache.set` and `cache.get` round-trip | Basic store / retrieve. |
| `cache.has` returns true for existing keys | Key existence check. |
| `cache.del` removes a key | Single-key deletion. |
| Cache-aside middleware caches GET responses | MISS on first request, HIT on second, DB hit count stays at 1. |
| Write operations invalidate the cache | POST invalidates the list cache so the next GET returns fresh data. |
| `cache.clear` removes all entries | Bulk deletion. |

---

## Key Takeaways

1. **`createCache()`** gives you a fast, in-memory LRU cache with optional
   TTL support.
2. The **cache-aside** pattern keeps your caching logic in middleware,
   separate from business logic.
3. Always **invalidate** the cache after write operations to avoid serving
   stale data.
4. Use the **`X-Cache`** header to quickly diagnose whether a response was
   served from cache or from the database.
5. For production, consider using a distributed cache (e.g., Redis) so that
   cache entries are shared across multiple server instances.
