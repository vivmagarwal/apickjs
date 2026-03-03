# Testing Guide

Testing is a first-class concern in APICK. Because APICK is a **pure headless CMS** with no admin UI, every feature is exposed through HTTP APIs and programmatic interfaces. This means every feature is directly testable without browser automation, DOM manipulation, or UI mocking.

This guide covers testing from two perspectives:

1. **Framework contributors** -- writing tests for APICK packages (`@apick/utils`, `@apick/core`, etc.)
2. **Extension developers** -- writing tests for plugins, custom APIs, and applications built on APICK

---

## Table of Contents

- [Testing Philosophy](#testing-philosophy)
- [Test Stack](#test-stack)
- [Test Commands](#test-commands)
- [Vitest Configuration](#vitest-configuration)
- [Test Levels](#test-levels)
  - [Level 1: Unit Tests](#level-1-unit-tests)
  - [Level 2: Service Tests](#level-2-service-tests)
  - [Level 3: HTTP Integration Tests](#level-3-http-integration-tests)
  - [Level 4: End-to-End Integration Tests](#level-4-end-to-end-integration-tests)
- [server.inject() Patterns](#serverinject-patterns)
- [Database Test Patterns](#database-test-patterns)
- [Mock Patterns](#mock-patterns)
- [Test Helpers and Utilities](#test-helpers-and-utilities)
- [Testing Authentication and Authorization](#testing-authentication-and-authorization)
- [Testing Plugins](#testing-plugins)
- [Testing Middleware](#testing-middleware)
- [Test File Organization](#test-file-organization)
- [CI/CD Integration](#cicd-integration)
- [Troubleshooting](#troubleshooting)
- [Cross-References](#cross-references)

---

## Testing Philosophy

| Principle | Implication |
|-----------|-------------|
| Pure headless | Every feature has an API endpoint or a service method. No UI-only features. |
| TypeScript-first | Type safety reduces runtime errors. Tests focus on behavior, not type correctness. |
| Server inject | No real HTTP needed. `server.inject()` simulates requests in-process for speed. |
| SQLite in-memory | Tests run against an ephemeral SQLite database. Fast, isolated, no cleanup. |
| Vitest | Modern test runner with native ESM, TypeScript, and parallel execution. |
| Isolation | Each test suite bootstraps its own instance. No shared mutable state across files. |

---

## Test Stack

| Tool | Role |
|------|------|
| **Vitest 3.x** | Test runner, assertions, mocking, coverage |
| **`server.inject()`** | In-process HTTP request simulation (no network overhead) |
| **better-sqlite3** | Synchronous in-memory SQLite for fast, isolated database tests |
| **`vi.fn()` / `vi.spyOn()`** | Mocking and spying on functions |
| **Nx** | Monorepo task orchestration -- runs tests across all packages |

---

## Test Commands

### Root-level commands (run from the monorepo root)

| Command | Description |
|---------|-------------|
| `npm test` | Run all tests across all packages via Nx |
| `npm run test:unit` | Run only unit tests across all packages |

### Package-level commands (run from within a package directory)

| Command | Description |
|---------|-------------|
| `npx vitest run` | Run all tests once |
| `npx vitest` | Run tests in watch mode |
| `npx vitest run --coverage` | Run tests with V8 coverage |
| `npx vitest --ui` | Open the Vitest UI for interactive debugging |
| `npx vitest run __tests__/server.test.ts` | Run a single test file |
| `npx vitest run -t "creates an article"` | Run tests matching a name pattern |

---

## Vitest Configuration

Each package has its own `vitest.config.ts`. The standard configuration is minimal:

```ts
// packages/<package>/vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['__tests__/**/*.test.ts'],
  },
});
```

Key points:
- Tests live in a `__tests__/` directory at the package root.
- Files must match the `*.test.ts` pattern.
- Vitest uses native ESM -- import paths use `.js` extensions (matching the TypeScript `"type": "module"` setup).
- No `globals: true` by default. Each test file explicitly imports from `vitest`.

### Recommended Vitest configuration for application-level testing

For full CMS integration tests (with database, auth, plugins), use a more comprehensive config:

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    testTimeout: 30000,           // APICK bootstrap can take a few seconds
    hookTimeout: 30000,
    pool: 'forks',                // Use forks for process isolation
    poolOptions: {
      forks: {
        singleFork: false,        // Parallel test files
      },
    },
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/**/__tests__/**'],
    },
  },
});
```

### Global setup file

```ts
// tests/setup.ts
import { beforeAll } from 'vitest';

beforeAll(() => {
  process.env.LOG_LEVEL = 'silent';
  process.env.NODE_ENV = 'test';
});
```

---

## Test Levels

APICK tests are organized into four levels, from the fastest/most-isolated to the slowest/most-integrated.

| Level | Scope | Database? | Network? | Speed |
|-------|-------|-----------|----------|-------|
| **Unit** | Pure functions, utilities, validators | No | No | Fastest |
| **Service** | Service layer with in-memory SQLite | Yes (in-memory) | No | Fast |
| **HTTP Integration** | Full HTTP pipeline via `server.inject()` | Yes (in-memory) | No (simulated) | Medium |
| **End-to-End Integration** | Cross-package service orchestration | Yes (in-memory) | No | Medium |

---

### Level 1: Unit Tests

Unit tests verify pure functions in isolation. No database, no HTTP, no mocking needed. These are the fastest tests and form the foundation of the test pyramid.

**When to use:** Utility functions, validators, error classes, string/object helpers, UID parsers.

**Real example from `@apick/utils`** (`packages/utils/__tests__/errors.test.ts`):

```ts
import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import {
  ApplicationError,
  ValidationError,
  NotFoundError,
  ForbiddenError,
  UnauthorizedError,
  PayloadTooLargeError,
  RateLimitError,
  PolicyError,
  NotImplementedError,
  zodToValidationError,
} from '../src/errors/index.js';

describe('Error classes', () => {
  it('ApplicationError has correct defaults', () => {
    const err = new ApplicationError();
    expect(err.message).toBe('An application error occurred');
    expect(err.statusCode).toBe(400);
    expect(err.name).toBe('ApplicationError');
    expect(err.details).toEqual({});
  });

  it('ApplicationError.toJSON produces standard error response', () => {
    const err = new ApplicationError('test error', { key: 'val' });
    const json = err.toJSON();
    expect(json).toEqual({
      data: null,
      error: {
        status: 400,
        name: 'ApplicationError',
        message: 'test error',
        details: { key: 'val' },
      },
    });
  });

  // Parameterized tests with it.each()
  it.each([
    [ValidationError, 'ValidationError', 400, 'Validation error'],
    [NotFoundError, 'NotFoundError', 404, 'Not Found'],
    [ForbiddenError, 'ForbiddenError', 403, 'Forbidden'],
    [UnauthorizedError, 'UnauthorizedError', 401, 'Unauthorized'],
    [PayloadTooLargeError, 'PayloadTooLargeError', 413, 'Payload Too Large'],
    [RateLimitError, 'RateLimitError', 429, 'Too Many Requests'],
    [PolicyError, 'PolicyError', 403, 'Forbidden'],
    [NotImplementedError, 'NotImplementedError', 501, 'Not Implemented'],
  ] as const)(
    '%s has correct name=%s, statusCode=%d, message=%s',
    (ErrorClass, name, statusCode, message) => {
      const err = new ErrorClass();
      expect(err.name).toBe(name);
      expect(err.statusCode).toBe(statusCode);
      expect(err.message).toBe(message);
      expect(err).toBeInstanceOf(ApplicationError);
      expect(err).toBeInstanceOf(Error);
    },
  );
});
```

**Real example: Validation utilities** (`packages/utils/__tests__/validate.test.ts`):

```ts
import { describe, it, expect } from 'vitest';
import {
  isValidEmail, isValidUrl, isNonEmptyString,
  isPositiveInteger, isObject, isValidUidFormat,
} from '../src/validate/index.js';

describe('validation utilities', () => {
  describe('isValidEmail', () => {
    it('accepts valid emails', () => {
      expect(isValidEmail('user@example.com')).toBe(true);
      expect(isValidEmail('name+tag@sub.domain.org')).toBe(true);
    });

    it('rejects invalid emails', () => {
      expect(isValidEmail('')).toBe(false);
      expect(isValidEmail('no-at-sign')).toBe(false);
    });
  });

  describe('isValidUidFormat', () => {
    it('accepts valid UIDs', () => {
      expect(isValidUidFormat('api::article.article')).toBe(true);
      expect(isValidUidFormat('plugin::users-permissions.user')).toBe(true);
      expect(isValidUidFormat('admin::admin')).toBe(true);
    });

    it('rejects invalid UIDs', () => {
      expect(isValidUidFormat('')).toBe(false);
      expect(isValidUidFormat('article')).toBe(false);
    });
  });
});
```

**Unit test patterns:**

- Import directly from source (`../src/...`) using `.js` extensions.
- No `beforeAll`/`afterAll` lifecycle hooks needed.
- Use `it.each()` for parameterized tests with many similar cases.
- Test both valid and invalid inputs (happy path + edge cases).

---

### Level 2: Service Tests

Service tests verify internal modules (event hub, cache, config, registries) that have state but do not require HTTP. They use factory functions to create lightweight instances.

**When to use:** Event hub, cache, config provider, registries, document services.

**Real example: EventHub** (`packages/core/__tests__/event-hub.test.ts`):

```ts
import { describe, it, expect, vi } from 'vitest';
import { createEventHub } from '../src/event-hub/index.js';
import { createLogger } from '../src/logging/index.js';

function makeHub() {
  const logger = createLogger({ level: 'silent' });
  return createEventHub({ logger });
}

describe('EventHub', () => {
  it('emits events to listeners', async () => {
    const hub = makeHub();
    const calls: any[] = [];

    hub.on('test.event', (data) => {
      calls.push(data);
    });

    await hub.emit('test.event', { key: 'value' });
    expect(calls).toEqual([{ key: 'value' }]);
  });

  it('subscribers receive all events', async () => {
    const hub = makeHub();
    const calls: Array<[string, any]> = [];

    hub.subscribe((event, data) => {
      calls.push([event, data]);
    });

    await hub.emit('a', 1);
    await hub.emit('b', 2);
    expect(calls).toEqual([['a', 1], ['b', 2]]);
  });

  it('on() returns an unsubscribe function', async () => {
    const hub = makeHub();
    const calls: number[] = [];

    const off = hub.on('test', () => calls.push(1));
    await hub.emit('test');
    expect(calls).toEqual([1]);

    off();
    await hub.emit('test');
    expect(calls).toEqual([1]); // no second call
  });

  it('errors in handlers are caught and do not propagate', async () => {
    const hub = makeHub();
    const calls: number[] = [];

    hub.on('test', () => { throw new Error('boom'); });
    hub.on('test', () => calls.push(2));

    await hub.emit('test'); // Should not throw
    expect(calls).toEqual([2]);
  });

  it('destroy clears everything', async () => {
    const hub = makeHub();
    const calls: number[] = [];

    hub.on('test', () => calls.push(1));
    hub.subscribe(() => calls.push(2));

    hub.destroy();

    await hub.emit('test');
    expect(calls).toEqual([]);
  });
});
```

**Real example: Cache** (`packages/core/__tests__/cache.test.ts`):

```ts
import { describe, it, expect } from 'vitest';
import { createCache } from '../src/cache/index.js';

describe('Cache', () => {
  it('stores and retrieves values', async () => {
    const cache = createCache();
    await cache.set('key1', { hello: 'world' });
    const result = await cache.get('key1');
    expect(result).toEqual({ hello: 'world' });
  });

  it('deletes by prefix', async () => {
    const cache = createCache();
    await cache.set('article:1', 'a');
    await cache.set('article:2', 'b');
    await cache.set('user:1', 'c');

    await cache.delByPrefix('article:');

    expect(await cache.get('article:1')).toBeUndefined();
    expect(await cache.get('article:2')).toBeUndefined();
    expect(await cache.get('user:1')).toBe('c');
  });

  it('respects TTL expiration', async () => {
    const cache = createCache({ ttl: 0 }); // expire immediately
    await cache.set('key', 'value');
    await new Promise((r) => setTimeout(r, 5));
    expect(await cache.get('key')).toBeUndefined();
  });

  it('evicts LRU entries when max is exceeded', async () => {
    const cache = createCache({ max: 3, ttl: 600 });
    await cache.set('a', 1);
    await cache.set('b', 2);
    await cache.set('c', 3);
    await cache.set('d', 4); // should evict 'a'

    expect(await cache.get('a')).toBeUndefined();
    expect(await cache.get('d')).toBe(4);
  });
});
```

**Real example: Config Provider** (`packages/core/__tests__/config.test.ts`):

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createConfigProvider } from '../src/config/index.js';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

describe('ConfigProvider', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'apick-test-'));
    fs.mkdirSync(path.join(tmpDir, 'config'), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('get() returns default for missing keys', () => {
    const config = createConfigProvider({
      appDir: tmpDir,
      distDir: path.join(tmpDir, 'dist'),
    });
    expect(config.get('server.host', '0.0.0.0')).toBe('0.0.0.0');
    expect(config.get('nonexistent')).toBeUndefined();
  });

  it('set() and get() work together', () => {
    const config = createConfigProvider({
      appDir: tmpDir,
      distDir: path.join(tmpDir, 'dist'),
    });
    config.set('server.host', 'localhost');
    expect(config.get('server.host')).toBe('localhost');
  });
});
```

**Service test patterns:**

- Use factory functions (e.g., `makeHub()`, `createCache()`) for setup.
- Create the logger with `level: 'silent'` to suppress noise.
- Clean up with `destroy()` or let garbage collection handle in-memory objects.
- For filesystem-dependent tests, use `os.tmpdir()` with `beforeEach`/`afterEach` cleanup.

---

### Level 3: HTTP Integration Tests

HTTP integration tests exercise the full request pipeline -- body parsing, middleware, routing, controllers, document services, and database -- using `server.inject()`. No real network connections are opened.

**When to use:** Content API CRUD, query parameter handling, middleware pipelines, auth flows, error response formats.

**Real example: Content API CRUD** (`packages/e2e-tests/http-integration.test.ts`):

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { createServer } from '../core/src/server/index.js';
import { createLogger } from '../core/src/logging/index.js';
import { createEventHub } from '../core/src/event-hub/index.js';
import { createRegistry } from '../core/src/registries/index.js';
import { normalizeContentType } from '../core/src/content-types/index.js';
import { createDocumentServiceManager } from '../core/src/document-service/index.js';
import { registerContentApi } from '../core/src/content-api/index.js';

function createTestEnv() {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`CREATE TABLE "articles" (
    "id" INTEGER PRIMARY KEY AUTOINCREMENT,
    "document_id" VARCHAR(255) NOT NULL,
    "title" VARCHAR(255) NOT NULL DEFAULT '',
    "slug" VARCHAR(255),
    "content" TEXT DEFAULT '',
    "created_at" TEXT NOT NULL,
    "updated_at" TEXT NOT NULL,
    "published_at" TEXT,
    "locale" VARCHAR(10)
  )`);

  const logger = createLogger({ level: 'silent' });
  const eventHub = createEventHub({ logger });
  const server = createServer({ logger, proxyEnabled: false });
  const contentTypes = createRegistry();

  const articleSchema = normalizeContentType('api::article.article', {
    kind: 'collectionType',
    collectionName: 'articles',
    info: { singularName: 'article', pluralName: 'articles', displayName: 'Article' },
    options: { draftAndPublish: false },
    attributes: {
      title: { type: 'string', required: true },
      slug: { type: 'uid' },
      content: { type: 'richtext' },
    },
  });
  contentTypes.add('api::article.article', articleSchema);

  const documents = createDocumentServiceManager({
    rawDb: db, logger, eventHub,
    getSchema: (uid) => contentTypes.get(uid) as any,
  });

  const apick: any = {
    log: logger,
    contentTypes,
    documents: (uid: string) => documents(uid),
    config: {
      get: (key: string, def: any) => {
        if (key === 'api.rest.prefix') return '/api';
        return def;
      },
    },
    server,
  };

  registerContentApi(apick);
  return { db, server, eventHub };
}

describe('HTTP Integration: Content API CRUD', () => {
  let env: ReturnType<typeof createTestEnv>;

  beforeEach(() => { env = createTestEnv(); });
  afterEach(() => { env.eventHub.destroy(); env.db.close(); });

  it('POST /api/articles creates an article and returns 201', async () => {
    const res = await env.server.inject({
      method: 'POST',
      url: '/api/articles',
      body: { data: { title: 'My First Post', slug: 'my-first-post' } },
    });

    expect(res.statusCode).toBe(201);
    expect(res.body.data.title).toBe('My First Post');
    expect(res.body.data.document_id).toBeDefined();
    expect(res.body.meta).toBeDefined();
  });

  it('GET /api/articles returns empty list initially', async () => {
    const res = await env.server.inject({ method: 'GET', url: '/api/articles' });

    expect(res.statusCode).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.meta.pagination.total).toBe(0);
  });

  it('full CRUD lifecycle', async () => {
    // Create
    const c = await env.server.inject({
      method: 'POST', url: '/api/articles',
      body: { data: { title: 'Lifecycle Test', content: 'Initial content' } },
    });
    expect(c.statusCode).toBe(201);
    const docId = c.body.data.document_id;

    // Read
    const r = await env.server.inject({ method: 'GET', url: `/api/articles/${docId}` });
    expect(r.body.data.title).toBe('Lifecycle Test');

    // Update
    const u = await env.server.inject({
      method: 'PUT', url: `/api/articles/${docId}`,
      body: { data: { title: 'Updated Title' } },
    });
    expect(u.body.data.title).toBe('Updated Title');

    // Delete
    const d = await env.server.inject({ method: 'DELETE', url: `/api/articles/${docId}` });
    expect(d.statusCode).toBe(200);

    // Verify gone
    const g = await env.server.inject({ method: 'GET', url: `/api/articles/${docId}` });
    expect(g.statusCode).toBe(404);
  });
});
```

**HTTP integration test patterns:**

- `createTestEnv()` wires up database, server, registries, and content API in one function.
- `beforeEach` creates a fresh environment; `afterEach` destroys it cleanly.
- All assertions use the response object returned by `server.inject()`.
- Test both success and error paths (201 for create, 404 for missing, 400 for bad input).

---

### Level 4: End-to-End Integration Tests

E2E integration tests verify that multiple packages work together correctly. They test cross-cutting scenarios: admin auth flows, content lifecycle with publishing, i18n, review workflows, data transfer, and more.

**When to use:** Multi-service flows, cross-package orchestration, full CMS scenarios.

**Real example** (`packages/e2e-tests/integration.test.ts`):

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { createContentManagerService } from '../../packages/content-manager/src/services/content-manager.js';
import { createAdminService } from '../../packages/admin/src/services/admin-user.js';
import { createAdminAuthService } from '../../packages/admin/src/services/admin-auth.js';
import { createUserService } from '../../packages/users-permissions/src/services/user.js';
import { createUserAuthService } from '../../packages/users-permissions/src/services/auth.js';

function createDb() {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  return db;
}

describe('Content lifecycle: create -> publish -> update -> unpublish -> delete', () => {
  let db: ReturnType<typeof Database>;

  beforeEach(() => { db = createDb(); });

  it('manages the full lifecycle of a content entry', () => {
    const contentManager = createContentManagerService({ rawDb: db });

    contentManager.registerContentType({
      uid: 'api::article.article',
      kind: 'collectionType',
      info: { singularName: 'article', pluralName: 'articles', displayName: 'Article' },
      attributes: {
        title: { type: 'string' },
        body: { type: 'text' },
      },
      options: { draftAndPublish: true },
    });

    // Create draft
    const entry = contentManager.create('api::article.article', {
      title: 'My First Article', body: 'Hello World',
    });
    expect(entry.title).toBe('My First Article');

    // Publish
    const published = contentManager.publish('api::article.article', entry.documentId);
    expect(published).not.toBeNull();

    // Update
    const updated = contentManager.update('api::article.article', entry.documentId, {
      title: 'Updated Title',
    });
    expect(updated!.title).toBe('Updated Title');

    // Unpublish
    const unpublished = contentManager.unpublish('api::article.article', entry.documentId);
    expect(unpublished).not.toBeNull();

    // Delete
    const deleted = contentManager.delete('api::article.article', entry.documentId);
    expect(deleted).toBe(true);
    expect(contentManager.count('api::article.article')).toBe(0);
  });
});
```

---

## server.inject() Patterns

The `server.inject()` method is the primary way to test HTTP behavior without opening a real socket. It simulates the entire request pipeline in-process.

### API reference

```ts
const response = await server.inject({
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  url: string,             // The path, e.g. '/api/articles/abc123'
  body?: object,           // JSON request body (for POST/PUT)
  query?: Record<string, string>,  // Query parameters
  headers?: Record<string, string>, // Request headers
});
```

### Response object

```ts
response.statusCode    // number (200, 201, 400, 404, etc.)
response.body          // parsed JSON body (already an object)
response.headers       // response headers as a Record
```

### Common patterns

**GET with query parameters:**
```ts
const res = await server.inject({
  method: 'GET',
  url: '/api/articles',
  query: { page: '1', pageSize: '10', sort: 'title:asc' },
});
```

**POST with JSON body:**
```ts
const res = await server.inject({
  method: 'POST',
  url: '/api/articles',
  body: { data: { title: 'New Article', content: 'Body text' } },
});
```

**Request with auth header:**
```ts
const res = await server.inject({
  method: 'GET',
  url: '/api/articles',
  headers: { Authorization: `Bearer ${token}` },
});
```

**Bracket notation for nested query params:**
```ts
const res = await server.inject({
  method: 'GET',
  url: '/api/articles',
  query: {
    'pagination[page]': '1',
    'pagination[pageSize]': '2',
    'filters[title][$contains]': 'Tech',
  },
});
```

### Response format assertions

**Success response** (`{ data, meta }`):
```ts
expect(res.statusCode).toBe(200);
expect(res.body.data).toBeDefined();
expect(res.body.meta).toBeDefined();
expect(res.body.meta.pagination.total).toBe(5);
```

**Error response** (`{ data: null, error: { status, name, message } }`):
```ts
expect(res.statusCode).toBe(404);
expect(res.body.data).toBeNull();
expect(res.body.error).toMatchObject({
  status: 404,
  name: 'NotFoundError',
  message: expect.any(String),
});
```

---

## Database Test Patterns

### Option 1: Fresh in-memory database per test suite (recommended)

Each `describe` block or test file creates its own SQLite `:memory:` database. This is the most reliable approach -- tests are fully isolated with no cleanup needed.

```ts
import Database from 'better-sqlite3';

function createDb() {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  return db;
}

describe('My feature', () => {
  let db: ReturnType<typeof Database>;

  beforeEach(() => { db = createDb(); });
  afterEach(() => { db.close(); });

  it('does something with the database', () => {
    // db is fresh and empty
  });
});
```

### Option 2: Fresh instance per test file

When using the full test environment builder, the entire environment (database + server + services) is created per suite:

```ts
let env: ReturnType<typeof createTestEnv>;

beforeEach(() => { env = createTestEnv(); });
afterEach(() => {
  env.eventHub.destroy();
  env.db.close();
});
```

### Option 3: Table truncation between tests

If bootstrapping is expensive and you want to share the database connection:

```ts
afterEach(async () => {
  const tables = ['articles', 'categories', 'tags'];
  for (const table of tables) {
    db.exec(`DELETE FROM "${table}"`);
  }
});
```

### Schema setup for tests

HTTP integration tests create the database schema directly with SQL:

```ts
db.exec(`CREATE TABLE "articles" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "document_id" VARCHAR(255) NOT NULL,
  "title" VARCHAR(255) NOT NULL DEFAULT '',
  "slug" VARCHAR(255),
  "content" TEXT DEFAULT '',
  "created_at" TEXT NOT NULL,
  "updated_at" TEXT NOT NULL,
  "published_at" TEXT,
  "first_published_at" TEXT,
  "locale" VARCHAR(10)
)`);
```

For more details on schema design, see [DATABASE_GUIDE.md](./DATABASE_GUIDE.md).

---

## Mock Patterns

### Mock context for middleware testing

When testing middleware in isolation (without a full server), create a mock context:

```ts
import { vi } from 'vitest';

function createMockContext(overrides: any = {}): any {
  const headers: Record<string, string> = {};
  return {
    ip: overrides.ip || '127.0.0.1',
    state: {},
    status: 200,
    body: null,
    request: {
      body: null,
      headers: {},
      method: 'GET',
      url: '/',
    },
    params: {},
    query: {},
    set: vi.fn((name: string, value: string) => {
      headers[name] = value;
    }),
    get _headers() {
      return headers;
    },
    ...overrides,
  };
}
```

**Usage:**
```ts
it('sets security headers', async () => {
  const middleware = createSecurityMiddleware();
  const ctx = createMockContext();
  const next = vi.fn();

  await middleware(ctx, next);

  expect(ctx.set).toHaveBeenCalledWith('X-Content-Type-Options', 'nosniff');
  expect(ctx.set).toHaveBeenCalledWith('X-Frame-Options', 'DENY');
  expect(next).toHaveBeenCalledTimes(1);
});
```

### Mocking external services with vi.fn()

For providers that call external services (email, upload, webhooks), create mock implementations:

**Email provider mock:**
```ts
export function createMockEmailProvider() {
  const sentEmails: any[] = [];

  return {
    provider: {
      send: vi.fn(async (options) => {
        sentEmails.push(options);
      }),
    },
    getSentEmails: () => sentEmails,
    reset: () => { sentEmails.length = 0; },
  };
}
```

**Webhook fetcher mock:**
```ts
const webhookRequests: any[] = [];
const webhookService = createWebhookService({
  rawDb: db,
  secret: 'test',
  fetcher: async (url, init) => {
    webhookRequests.push({ url, body: JSON.parse(init.body) });
    return { status: 200 };
  },
});
```

### Spying on global functions

```ts
it('triggers webhook on content creation', async () => {
  const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(
    new Response(JSON.stringify({ ok: true }), { status: 200 }),
  );

  // ... perform action ...

  expect(fetchSpy).toHaveBeenCalledWith(
    'https://hooks.example.com/test',
    expect.objectContaining({ method: 'POST' }),
  );

  fetchSpy.mockRestore();
});
```

### Tracking function call order

Use arrays to record execution order, a pattern used extensively in middleware and event hub tests:

```ts
it('executes middleware in onion model order', async () => {
  const order: number[] = [];

  server.use(async (_ctx, next) => { order.push(1); await next(); order.push(4); });
  server.use(async (_ctx, next) => { order.push(2); await next(); order.push(3); });

  await server.inject({ method: 'GET', url: '/test' });
  expect(order).toEqual([1, 2, 3, 4]);
});
```

---

## Test Helpers and Utilities

### createTestApick() -- Full CMS instance for extension developers

```ts
import { createApick } from '@apick/core';
import type { Core } from '@apick/types';

export async function createTestApick(options?: {
  plugins?: Record<string, { enabled: boolean; resolve?: string; config?: object }>;
  config?: Record<string, unknown>;
}): Promise<Core.Apick> {
  const apick = await createApick({
    database: {
      connection: { client: 'sqlite', filename: ':memory:' },
    },
    server: {
      host: '127.0.0.1',
      port: 0, // Random available port
    },
    ...options?.config,
    plugins: options?.plugins,
  });

  await apick.start();
  return apick;
}
```

### createTestUser() -- Authenticated user with JWT

```ts
export async function createTestUser(
  apick: Core.Apick,
  userData?: Partial<{ username: string; email: string; password: string }>,
) {
  const defaults = {
    username: 'testuser',
    email: 'test@example.com',
    password: 'TestPassword123!',
  };
  const data = { ...defaults, ...userData };

  const response = await apick.server.inject({
    method: 'POST',
    url: '/api/auth/local/register',
    payload: data,
  });

  const body = response.json();
  return { jwt: body.jwt, user: body.user, credentials: data };
}
```

### injectRequest() -- Convenience wrapper with auth support

```ts
interface InjectOptions {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  url: string;
  payload?: unknown;
  headers?: Record<string, string>;
  query?: Record<string, string>;
}

export function injectRequest(
  apick: Core.Apick,
  options: InjectOptions & { auth?: string },
) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  if (options.auth) {
    headers['Authorization'] = `Bearer ${options.auth}`;
  }

  return apick.server.inject({
    method: options.method,
    url: options.url,
    payload: options.payload,
    headers,
    query: options.query,
  });
}
```

---

## Testing Authentication and Authorization

### JWT authentication middleware

The HTTP integration tests demonstrate how to test auth with `server.inject()` by attaching auth middleware and using `signJWT`/`verifyJWT`:

```ts
import { signJWT, verifyJWT } from '../core/src/auth/index.js';

const JWT_SECRET = 'test-jwt-secret-for-integration';

function withAuthMiddleware(env: ReturnType<typeof createTestEnv>) {
  env.server.use(async (ctx, next) => {
    if (!ctx.request.url.startsWith('/api/')) {
      await next();
      return;
    }

    const authHeader = ctx.request.headers['authorization'];
    if (authHeader?.startsWith('Bearer ')) {
      try {
        ctx.state.user = verifyJWT(authHeader.slice(7), JWT_SECRET);
        ctx.state.isAuthenticated = true;
      } catch {
        ctx.status = 401;
        ctx.body = {
          data: null,
          error: { status: 401, name: 'UnauthorizedError', message: 'Invalid or expired token' },
        };
        return;
      }
    } else {
      ctx.status = 401;
      ctx.body = {
        data: null,
        error: { status: 401, name: 'UnauthorizedError', message: 'Missing authorization header' },
      };
      return;
    }

    await next();
  });
}

it('rejects request without Authorization header', async () => {
  const env = createTestEnv();
  withAuthMiddleware(env);

  const res = await env.server.inject({ method: 'GET', url: '/api/articles' });
  expect(res.statusCode).toBe(401);
  expect(res.body.error.name).toBe('UnauthorizedError');
});

it('accepts request with valid JWT', async () => {
  const env = createTestEnv();
  withAuthMiddleware(env);

  const token = signJWT({ id: 1, email: 'admin@test.com' }, JWT_SECRET, { expiresIn: 3600 });
  const res = await env.server.inject({
    method: 'GET',
    url: '/api/articles',
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(res.statusCode).toBe(200);
});

it('rejects expired JWT', async () => {
  const env = createTestEnv();
  withAuthMiddleware(env);

  const expiredToken = signJWT({ id: 1 }, JWT_SECRET, { expiresIn: -1 });
  const res = await env.server.inject({
    method: 'GET',
    url: '/api/articles',
    headers: { Authorization: `Bearer ${expiredToken}` },
  });
  expect(res.statusCode).toBe(401);
});
```

For auth concepts and configuration, see [AUTH_GUIDE.md](./AUTH_GUIDE.md) referenced from [ARCHITECTURE.md](./ARCHITECTURE.md).

---

## Testing Plugins

Plugins are tested by bootstrapping an APICK instance with the plugin enabled:

```ts
let apick: Core.Apick;

beforeAll(async () => {
  apick = await createTestApick({
    plugins: {
      'audit-log': {
        enabled: true,
        resolve: './src/plugins/audit-log',
      },
    },
  });
});

afterAll(async () => {
  await apick.destroy();
});
```

**Testing plugin lifecycle hooks:**

```ts
it('loads plugins with services and runs lifecycle', async () => {
  const lifecycleCalls: string[] = [];

  manager.register('test-plugin', {
    name: 'test-plugin',
    services: {
      greeting: () => ({ hello: () => 'world' }),
    },
    register: () => { lifecycleCalls.push('register'); },
    bootstrap: () => { lifecycleCalls.push('bootstrap'); },
    destroy: () => { lifecycleCalls.push('destroy'); },
  });

  manager.loadAll();
  await manager.runRegister();
  await manager.runBootstrap();

  const plugin = manager.get('test-plugin');
  expect(plugin!.service('greeting').hello()).toBe('world');
  expect(lifecycleCalls).toEqual(['register', 'bootstrap']);

  await manager.runDestroy();
  expect(lifecycleCalls).toEqual(['register', 'bootstrap', 'destroy']);
});
```

For plugin architecture details, see [PLUGINS_GUIDE.md](./PLUGINS_GUIDE.md).

---

## Testing Middleware

### Isolated middleware testing (with mock context)

Test middleware logic independently from the HTTP server:

```ts
import { createRateLimitMiddleware } from '../src/middlewares/rate-limit.js';

it('allows requests under the limit', async () => {
  const middleware = createRateLimitMiddleware({ max: 10, window: 60000 });
  const ctx = createMockContext();
  const next = vi.fn();

  await middleware(ctx, next);
  expect(next).toHaveBeenCalledTimes(1);
});

it('throws RateLimitError when limit is exceeded', async () => {
  const middleware = createRateLimitMiddleware({ max: 2, window: 60000 });
  const next = vi.fn();

  await middleware(createMockContext(), next);
  await middleware(createMockContext(), next);

  await expect(middleware(createMockContext(), next)).rejects.toThrow('Too Many Requests');
});

it('tracks different IPs separately', async () => {
  const middleware = createRateLimitMiddleware({ max: 1, window: 60000 });
  const next = vi.fn();

  await middleware(createMockContext({ ip: '10.0.0.1' }), next);
  await middleware(createMockContext({ ip: '10.0.0.2' }), next);

  expect(next).toHaveBeenCalledTimes(2);
});
```

### Integrated middleware testing (with server.inject)

Test middleware as part of the full HTTP pipeline:

```ts
it('middleware can short-circuit the request', async () => {
  const server = makeServer();
  let handlerCalled = false;

  server.use(async (ctx, _next) => {
    ctx.status = 403;
    ctx.body = {
      data: null,
      error: { status: 403, name: 'Forbidden', message: 'Blocked' },
    };
  });

  server.route({
    method: 'GET',
    path: '/test',
    handler: () => { handlerCalled = true; },
  });

  const res = await server.inject({ method: 'GET', url: '/test' });
  expect(res.statusCode).toBe(403);
  expect(handlerCalled).toBe(false);
});

it('middleware can modify the context', async () => {
  const server = makeServer();

  server.use(async (ctx, next) => {
    ctx.state.user = { id: 1, name: 'admin' };
    await next();
  });

  server.route({
    method: 'GET',
    path: '/test',
    handler: (ctx) => {
      ctx.send({ user: ctx.state.user });
    },
  });

  const res = await server.inject({ method: 'GET', url: '/test' });
  expect(res.body.data.user).toEqual({ id: 1, name: 'admin' });
});
```

---

## Test File Organization

### Framework contributor layout (per package)

```
packages/<package>/
  __tests__/
    cache.test.ts
    config.test.ts
    event-hub.test.ts
    server.test.ts
    middlewares.test.ts
    registries.test.ts
    ...
  src/
    ...
  vitest.config.ts
```

### Cross-package integration tests

```
packages/e2e-tests/
  integration.test.ts        # Service-level cross-package tests
  http-integration.test.ts   # Full HTTP pipeline integration tests
```

### Extension developer layout (application)

```
tests/
  setup.ts                     # Global test setup
  helpers/
    apick.ts                   # createTestApick()
    auth.ts                    # createTestUser(), createTestAdmin()
    request.ts                 # injectRequest()
    mocks.ts                   # Mock providers
  api/
    articles.test.ts           # Content API CRUD
    categories.test.ts
    relations.test.ts          # Relation population tests
  auth/
    authentication.test.ts     # Login, register, token refresh
    api-tokens.test.ts         # API token access
    permissions.test.ts        # RBAC, role-based access
  lifecycle/
    hooks.test.ts              # Document Service events
  plugins/
    audit-log.test.ts          # Plugin integration tests
  webhooks/
    webhooks.test.ts
  services/
    article-service.test.ts    # Direct service testing
```

---

## CI/CD Integration

### GitHub Actions

```yaml
# .github/workflows/test.yml
name: Tests
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node: [20, 22]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node }}
          cache: 'npm'
      - run: npm ci
      - run: npm test
      - run: npm run test:coverage
        if: matrix.node == 22
```

### npm scripts summary

| Script | Scope | Description |
|--------|-------|-------------|
| `npm test` | Root | Run all tests via Nx across all packages |
| `npm run test:unit` | Root | Run only unit tests across all packages |
| `npx vitest run` | Package | Run all tests in current package |
| `npx vitest` | Package | Watch mode for current package |
| `npx vitest run --coverage` | Package | Run with V8 code coverage |

---

## Troubleshooting

### Common issues

| Issue | Solution |
|-------|----------|
| `ERR_MODULE_NOT_FOUND` | Make sure import paths use `.js` extensions (ESM requirement). |
| Tests hang or time out | Ensure `afterAll`/`afterEach` calls `destroy()` and `db.close()`. Check for unresolved promises. |
| Flaky TTL/timing tests | Use `await new Promise(r => setTimeout(r, N))` with generous margins. Avoid TTL=0 with instant checks. |
| Logger noise in test output | Create loggers with `level: 'silent'` or set `process.env.LOG_LEVEL = 'silent'` in setup. |
| Port conflicts | Use `port: 0` for random ports. Prefer `server.inject()` over real HTTP. |
| Database state leaks between tests | Use `beforeEach` to create fresh `Database(':memory:')` instances. |

### Debugging tips

- Run a single test file: `npx vitest run __tests__/server.test.ts`
- Run a single test by name: `npx vitest run -t "creates an article"`
- Use `vitest --ui` for interactive browser-based debugging.
- Add `console.log(res.body)` to inspect response payloads during development.

---

## Cross-References

- **[ARCHITECTURE.md](./ARCHITECTURE.md)** -- System architecture, package layout, and request lifecycle.
- **[DEVELOPMENT_STANDARDS.md](./DEVELOPMENT_STANDARDS.md)** -- Coding conventions, ESM setup, and build system.
- **[DATABASE_GUIDE.md](./DATABASE_GUIDE.md)** -- Schema design, Drizzle ORM usage, and database patterns.
- **[PLUGINS_GUIDE.md](./PLUGINS_GUIDE.md)** -- Plugin architecture and lifecycle hooks.
- **[CONTENT_API_GUIDE.md](./CONTENT_API_GUIDE.md)** -- Content API routes, filtering, sorting, and pagination.
