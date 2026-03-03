# Tutorial 06: Authentication with JWT

## What You'll Build

In this tutorial you will protect your API endpoints with **JSON Web Token (JWT)** authentication. By the end, unauthenticated requests will receive a `401 Unauthorized` response, while requests carrying a valid Bearer token will pass through to your content API as normal.

## How JWT Works

JSON Web Tokens are a compact, URL-safe way to represent claims between two parties:

1. **Sign** -- The server creates a token by encoding a payload (e.g. user id, email, role) and signing it with a secret key. The result is a three-part string: `header.payload.signature`.
2. **Send** -- The client stores the token and includes it in every request via the `Authorization` header: `Authorization: Bearer <token>`.
3. **Verify** -- On each request the server extracts the token, verifies the signature against the same secret, and checks that the token has not expired.
4. **Expire** -- Tokens carry an `exp` claim. Once the current time exceeds that value, `verifyJWT` throws and the request is rejected.

## `signJWT` and `verifyJWT`

`@apick/core` ships two utility functions for working with JWTs:

```typescript
import { signJWT, verifyJWT } from '@apick/core/auth';

// Create a token that expires in 1 hour (3600 seconds)
const token = signJWT(
  { id: 1, email: 'user@example.com', role: 'editor' },
  'my-secret-key',
  { expiresIn: 3600 },
);

// Verify and decode -- throws if invalid or expired
const payload = verifyJWT(token, 'my-secret-key');
// => { id: 1, email: 'user@example.com', role: 'editor', iat: ..., exp: ... }
```

**Parameters:**

| Function    | Parameter   | Description                                      |
|-------------|-------------|--------------------------------------------------|
| `signJWT`   | `payload`   | Plain object with the claims to embed             |
| `signJWT`   | `secret`    | HMAC secret string used to sign the token         |
| `signJWT`   | `options`   | Optional. `{ expiresIn: number }` in **seconds**  |
| `verifyJWT` | `token`     | The JWT string to verify                          |
| `verifyJWT` | `secret`    | The same secret that was used to sign              |

## The Auth Middleware Pattern

Authentication is implemented as a global middleware that runs before any route handler. The pattern is straightforward:

```typescript
function addAuthMiddleware(server: any) {
  server.use(async (ctx: any, next: any) => {
    // 1. Skip auth for non-API routes (health checks, etc.)
    if (!ctx.request.url.startsWith('/api/')) {
      await next();
      return;
    }

    // 2. Check for the Authorization header
    const authHeader = ctx.request.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      ctx.status = 401;
      ctx.body = {
        data: null,
        error: {
          status: 401,
          name: 'UnauthorizedError',
          message: 'Missing authorization header',
        },
      };
      return; // short-circuit -- do NOT call next()
    }

    // 3. Verify the token
    try {
      const token = authHeader.slice(7); // strip "Bearer "
      const payload = verifyJWT(token, JWT_SECRET);

      // 4. Attach user info to the request context
      ctx.state.user = payload;
      ctx.state.isAuthenticated = true;

      await next(); // token valid -- continue to the route handler
    } catch {
      ctx.status = 401;
      ctx.body = {
        data: null,
        error: {
          status: 401,
          name: 'UnauthorizedError',
          message: 'Invalid or expired token',
        },
      };
    }
  });
}
```

### Key points

- **Short-circuit on failure.** When the token is missing or invalid, set `ctx.status` and `ctx.body` and return immediately. Do **not** call `next()`.
- **`ctx.state.user`** is the conventional place to store the authenticated user payload so downstream handlers and policies can access it.
- **`ctx.state.isAuthenticated`** is a convenience boolean for quick checks.

## Public vs Protected Routes

The middleware checks `ctx.request.url.startsWith('/api/')` to decide whether authentication is required. Routes outside the `/api/` prefix -- such as the built-in `/_health` endpoint -- are public and bypass the auth check entirely.

This keeps infrastructure endpoints accessible for load balancers and monitoring while locking down all content API routes behind authentication.

## Curl Examples

**Request without a token (401):**

```bash
curl -i http://localhost:1337/api/articles
```

```
HTTP/1.1 401 Unauthorized
Content-Type: application/json

{
  "data": null,
  "error": {
    "status": 401,
    "name": "UnauthorizedError",
    "message": "Missing authorization header"
  }
}
```

**Request with a valid token (200):**

```bash
# First, obtain a token (in a real app this comes from a login endpoint)
TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."

curl -i http://localhost:1337/api/articles \
  -H "Authorization: Bearer $TOKEN"
```

```
HTTP/1.1 200 OK
Content-Type: application/json

{
  "data": [],
  "meta": { "pagination": { "page": 1, "pageSize": 25, "total": 0, "pageCount": 0 } }
}
```

**Create an article with authentication:**

```bash
curl -i -X POST http://localhost:1337/api/articles \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "data": { "title": "My Protected Article" } }'
```

## Running Tests

From the repository root:

```bash
npx vitest run tutorials/06-authentication/tests/auth.test.ts
```

The test suite covers seven scenarios:

1. Rejects requests without an `Authorization` header
2. Rejects requests with an invalid token
3. Accepts requests with a valid JWT
4. Rejects expired JWTs
5. Authenticated user can perform full CRUD (create, read, update, delete)
6. Health check endpoint bypasses authentication
7. `signJWT` / `verifyJWT` round-trip produces a valid three-part token

All tests use `server.inject()` so no network ports are opened -- the entire HTTP stack runs in-process.
