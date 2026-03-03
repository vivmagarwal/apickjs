# Tutorial 05: Middleware

In this tutorial you will learn how APIck's **middleware pipeline** works. Middleware lets you intercept every request and response, adding cross-cutting behaviour such as timing, logging, authentication, and more -- without touching your route handlers.

## What You Will Learn

- The **onion model** of middleware execution (before -> next -> after).
- How to register middleware with `server.use()`.
- Three practical middleware patterns:
  1. **Response timing** -- inject an `X-Response-Time` header.
  2. **Request ID injection** -- assign a unique ID to every request.
  3. **API key guard** -- block unauthenticated requests by short-circuiting.
- How multiple middlewares compose and execute in order.
- Using `ctx.set()` for response headers and `ctx.state` for sharing data between middlewares.
- Short-circuiting a request by **not** calling `next()`.

## Prerequisites

- Completed [Tutorial 01: Hello APIck](../01-hello-apick/) or equivalent familiarity with content types and CRUD.

## Project Structure

```
05-middleware/
  config/
    api.ts            # REST prefix (/api)
    database.ts       # SQLite connection
    server.ts         # Host and port
  src/api/article/
    content-type.ts   # Simple Article schema
  tests/
    middleware.test.ts # Middleware test suite
  package.json
```

## The Onion Model

APIck middleware follows the **onion model** (also known as the Koa-style middleware pattern). Each middleware is an async function that receives two arguments:

- **`ctx`** -- the request/response context object.
- **`next`** -- a function that passes control to the next middleware in the stack.

```
Request  ──►  Middleware 1 (before)
                  Middleware 2 (before)
                      Route Handler
                  Middleware 2 (after)
              Middleware 1 (after)  ──►  Response
```

Code that runs **before** `await next()` executes on the way in (request phase). Code that runs **after** `await next()` executes on the way out (response phase). This is why it is called "onion" -- each middleware wraps around the next one.

```typescript
server.use(async (ctx, next) => {
  // --- Request phase (before) ---
  console.log('Incoming:', ctx.request.method, ctx.request.url);

  await next(); // hand off to the next middleware / route handler

  // --- Response phase (after) ---
  console.log('Outgoing:', ctx.status);
});
```

### Execution Order with Multiple Middlewares

When you register multiple middlewares, they nest like layers of an onion:

```typescript
const order: number[] = [];

server.use(async (_ctx, next) => {
  order.push(1);   // first in
  await next();
  order.push(6);   // last out
});

server.use(async (_ctx, next) => {
  order.push(2);   // second in
  await next();
  order.push(5);   // second-to-last out
});

server.use(async (_ctx, next) => {
  order.push(3);   // third in (closest to handler)
  await next();
  order.push(4);   // first out after handler
});

// After a request: order === [1, 2, 3, 4, 5, 6]
```

## Step 1 -- Response Time Middleware

A classic use case: measure how long the route handler takes and report it in a response header.

```typescript
server.use(async (ctx, next) => {
  const start = Date.now();
  await next();
  ctx.set('X-Response-Time', `${Date.now() - start}ms`);
});
```

Test it with curl:

```bash
curl -i http://localhost:1337/api/articles
```

You will see the header in the response:

```
HTTP/1.1 200 OK
X-Response-Time: 3ms
Content-Type: application/json
...
```

The key insight is that `ctx.set()` runs **after** `await next()`, so the timing captures everything that happens downstream.

## Step 2 -- Request ID Middleware

Assign a unique identifier to every request. This is invaluable for tracing requests through logs.

```typescript
let counter = 0;

server.use(async (ctx, next) => {
  counter++;
  ctx.set('X-Request-Id', `req-${counter}`);
  await next();
});
```

Each response now carries a unique ID:

```bash
curl -i http://localhost:1337/api/articles
# X-Request-Id: req-1

curl -i http://localhost:1337/api/articles
# X-Request-Id: req-2
```

In production you would typically use a UUID or ULID instead of a simple counter.

## Step 3 -- API Key Guard (Short-Circuiting)

Middleware can **block** a request by setting the response and **not** calling `next()`. This prevents the route handler from executing at all.

```typescript
const VALID_API_KEY = 'my-secret-api-key';

server.use(async (ctx, next) => {
  const apiKey = ctx.request.headers['x-api-key'];

  if (apiKey !== VALID_API_KEY) {
    ctx.status = 401;
    ctx.body = {
      data: null,
      error: {
        status: 401,
        name: 'UnauthorizedError',
        message: 'Invalid API key',
      },
    };
    return; // <-- short-circuit: do NOT call next()
  }

  await next();
});
```

Without the key, the request is rejected immediately:

```bash
curl -i http://localhost:1337/api/articles
# HTTP/1.1 401 Unauthorized
# {"data":null,"error":{"status":401,"name":"UnauthorizedError","message":"Invalid API key"}}
```

With a valid key, the request passes through to the handler:

```bash
curl -i -H "X-Api-Key: my-secret-api-key" http://localhost:1337/api/articles
# HTTP/1.1 200 OK
# {"data":[],"meta":{"pagination":{"page":1,"pageSize":25,"pageCount":0,"total":0}}}
```

## Step 4 -- Sharing Data Between Middlewares with `ctx.state`

The `ctx.state` object is a per-request bag for passing data between middlewares and handlers. Any middleware can write to it, and downstream middlewares can read from it.

```typescript
// Upstream middleware sets a value
server.use(async (ctx, next) => {
  ctx.state.customValue = 'injected-by-middleware';
  await next();
});

// Downstream middleware reads it
server.use(async (ctx, next) => {
  ctx.set('X-Custom-Value', ctx.state.customValue || 'not-set');
  await next();
});
```

```bash
curl -i http://localhost:1337/api/articles
# X-Custom-Value: injected-by-middleware
```

This pattern is useful for passing authentication info, tenant IDs, feature flags, or any computed value to downstream handlers.

## API Reference

| Method / Property       | Description                                            |
|-------------------------|--------------------------------------------------------|
| `server.use(fn)`        | Register a global middleware function.                 |
| `ctx.set(name, value)`  | Set a response header.                                 |
| `ctx.status`            | Get or set the HTTP status code.                       |
| `ctx.body`              | Get or set the response body.                          |
| `ctx.state`             | Per-request object for sharing data between layers.    |
| `ctx.request.headers`   | Incoming request headers (lowercase keys).             |
| `await next()`          | Pass control to the next middleware / route handler.   |

## Documentation References

The concepts in this tutorial are covered in more detail in these guides:

- [Customization Guide](../../docs/CUSTOMIZATION_GUIDE.md) -- Middlewares section: registration, configuration, onion model, execution order, short-circuiting
- [Architecture](../../docs/ARCHITECTURE.md) -- Request Lifecycle, full middleware pipeline overview

---

## Running Tests

From this tutorial directory:

```bash
npx vitest run
```

The test suite verifies:

1. Response-time middleware injects an `X-Response-Time` header matching the pattern `\d+ms`.
2. Request-ID middleware increments a counter and returns unique IDs across requests.
3. Short-circuiting middleware returns 403 without invoking the route handler.
4. Two-layer onion model produces execution order `[1, 2, 3, 4]`.
5. Three-layer onion model produces execution order `[1, 2, 3, 4, 5, 6]`.
6. API key guard blocks requests without a valid `X-Api-Key` header (401) and allows requests that include one (200).
7. Upstream middleware can inject values into `ctx.state` that downstream middleware can read.

## Key Takeaways

- Middleware in APIck uses the **onion model**: code before `await next()` runs on the way in, code after runs on the way out.
- Register middleware with `server.use()`. Middlewares execute in the order they are registered.
- **Short-circuiting** (not calling `next()`) stops the request from reaching downstream middlewares and the route handler. This is the foundation for guards, rate limiters, and access control.
- Use `ctx.set()` to add response headers and `ctx.state` to share data between middleware layers.
- Middleware is the right place for cross-cutting concerns: logging, timing, authentication, CORS, compression, and more.

## Next Steps

Continue to [Tutorial 06: Error Handling](../06-error-handling/) to learn how APIck structures error responses and how middleware can catch and transform errors.
