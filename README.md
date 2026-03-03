<p align="center">
  <h1 align="center">APICK</h1>
  <p align="center"><strong>API Construction Kit</strong></p>
  <p align="center">A pure headless CMS built TypeScript-first. No admin UI. Just APIs.</p>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@apick/core"><img src="https://img.shields.io/npm/v/@apick/core.svg" alt="npm version"></a>
  <a href="https://github.com/vivmagarwal/apickjs/blob/main/LICENSE"><img src="https://img.shields.io/github/license/vivmagarwal/apickjs.svg" alt="license"></a>
  <a href="https://nodejs.org"><img src="https://img.shields.io/node/v/@apick/core.svg" alt="node version"></a>
</p>

---

Most headless CMS tools give you a UI you'll eventually outgrow, a GraphQL layer you didn't ask for, or a plugin system that fights your architecture. APICK gives you none of that. What it gives you is a **TypeScript-native framework for building content APIs** — with every feature accessible via REST, every schema validated by Zod, and every query type-safe end to end.

Define a content type. Get a full CRUD API. Add auth, middleware, draft/publish, caching, event hooks — all through the same consistent patterns. No code generation. No magic. Just functions, middleware, and configuration.

## Why APICK

**For teams building serious content infrastructure:**

- You want your CMS to be a **dependency**, not a platform. APICK is a library. You `import` it, configure it, extend it, test it, deploy it — like any other Node.js package.

- You want **real TypeScript**, not types bolted on after the fact. Every API, every config object, every query result is typed. `strict: true` everywhere. Zod schemas generate both runtime validation and static types from the same source.

- You want to **own the API contract**. No proprietary query languages. No framework-specific abstractions leaking into your frontend. Standard REST with filtering, sorting, pagination — all documented, all predictable.

## Install

```bash
npm install @apick/core @apick/cli @apick/types @apick/utils
```

Or work from the monorepo source:

```bash
git clone https://github.com/vivmagarwal/apickjs.git && cd apickjs
npm install
```

## Quick Start

### Option A: From npm (standalone project)

```bash
mkdir my-app && cd my-app
npm init -y
npm install @apick/core @apick/cli @apick/types
```

Create a content type, config files, and start the server. See [Tutorial 01](./tutorials/01-hello-apick/) for the full walkthrough.

### Option B: From the monorepo

```bash
git clone https://github.com/vivmagarwal/apickjs.git && cd apickjs
npm install
cd examples/starter
cp .env.example .env      # uses SQLite by default
npx tsx ../../packages/cli/src/bin.ts develop
```

Your API is live at `http://localhost:1337`. Try it out:

```bash
# Create an article (created as draft by default)
curl -X POST http://localhost:1337/api/articles \
  -H "Content-Type: application/json" \
  -d '{ "data": { "title": "Hello World", "slug": "hello-world" } }'

# List draft articles (drafts are hidden by default)
curl "http://localhost:1337/api/articles?status=draft"

# Publish an article (replace DOCUMENT_ID with the document_id from create response)
curl -X POST "http://localhost:1337/api/articles/DOCUMENT_ID/publish"

# List published articles
curl http://localhost:1337/api/articles
```

## Define a Content Type

```typescript
// src/api/article/content-type.ts
export default {
  kind: 'collectionType',
  collectionName: 'articles',
  info: {
    singularName: 'article',
    pluralName: 'articles',
    displayName: 'Article',
  },
  options: { draftAndPublish: true },
  attributes: {
    title:    { type: 'string', required: true },
    slug:     { type: 'uid', targetField: 'title' },
    content:  { type: 'richtext' },
    category: { type: 'enumeration', enum: ['news', 'tutorial', 'opinion'] },
  },
};
```

That's it. APICK auto-generates the database table, CRUD endpoints, query validation, and draft/publish workflow. No migrations to write. No routes to register.

## Use the API

```bash
# Create
curl -X POST http://localhost:1337/api/articles \
  -H "Content-Type: application/json" \
  -d '{ "data": { "title": "Hello World", "category": "tutorial" } }'

# Query with filters, sorting, and pagination
curl "http://localhost:1337/api/articles?filters[category][\$eq]=tutorial&sort=created_at:desc&pagination[pageSize]=10"

# Publish a draft
curl -X POST "http://localhost:1337/api/articles/DOCUMENT_ID/publish"
```

**Response format** — always consistent:
```json
{
  "data": {
    "id": 1,
    "document_id": "abc123",
    "title": "Hello World",
    "category": "tutorial",
    "created_at": "2026-01-15T10:30:00.000Z",
    "updated_at": "2026-01-15T10:30:00.000Z",
    "published_at": null
  },
  "meta": {}
}
```

## Features

### Content Management
- **20+ field types** — string, text, richtext, blocks, integer, biginteger, float, decimal, boolean, date, datetime, time, email, password, uid, enumeration, json, media, relation, component, dynamic zone, customField
- **Draft & Publish** — Every document has draft and published versions. Publish when ready, unpublish to retract.
- **Single Types & Collection Types** — One-off settings pages or lists of entries, both from the same schema system.

### Query Engine
- **19 filter operators** — `$eq`, `$ne`, `$gt`, `$gte`, `$lt`, `$lte`, `$in`, `$notIn`, `$contains`, `$containsi`, `$notContains`, `$startsWith`, `$endsWith`, `$null`, `$notNull`, `$between`, `$and`, `$or`, `$not`
- **Field selection** — `fields=title,slug` to reduce payload size
- **Sorting** — `sort=created_at:desc` or multi-field sorting
- **Pagination** — Page-based (`page`, `pageSize`) or offset-based (`start`, `limit`)

### Authentication & Authorization
- **JWT authentication** — `signJWT` / `verifyJWT` utilities with configurable secrets and expiry
- **RBAC permission engine** — Field-level and condition-based permissions with MongoDB-style operators
- **API tokens** — HMAC-hashed tokens for machine clients
- **Rate limiting** — Per-IP, configurable windows and max requests

### Middleware & Extensibility
- **Onion model middleware** — `(ctx, next) => { ... await next() ... }` with full before/after control
- **Policies** — Boolean gate functions for route-level access control
- **Custom controllers & services** — Extend or replace default CRUD via factory functions
- **Lifecycle hooks** — `beforeCreate`, `afterCreate`, `beforeUpdate`, `afterUpdate`, etc.
- **Event hub** — Pub/sub event system with `on()`, `subscribe()`, `emit()`, `once()`

### Caching
- **In-memory LRU cache** — TTL support, prefix-based invalidation, configurable max size

### Logging
- **Pino structured logging** — JSON output, child loggers per module, configurable levels

### Webhooks & Cron
- **Webhooks** — HMAC-SHA256 signed event delivery to external URLs
- **Cron jobs** — In-process scheduled tasks with cron syntax

## Tech Stack

| Layer | Choice | Why |
|-------|--------|-----|
| **Language** | TypeScript (strict, ESM) | End-to-end type safety |
| **Runtime** | Node.js >= 20 | LTS, native ESM, AsyncLocalStorage |
| **HTTP** | `node:http` + `find-my-way` | Zero framework overhead, trie-based routing |
| **Database** | Drizzle ORM + SQLite | TypeScript-first, zero runtime cost |
| **Validation** | Zod | Runtime validation = static types, single source of truth |
| **Auth** | JWT + custom RBAC | Stateless tokens, condition-based permissions |
| **Logging** | Pino | Structured JSON, 30x faster than Winston |
| **Testing** | Vitest + `server.inject()` | Fast, no network overhead, full middleware coverage |

## Customize Everything

**Controllers** — wrap, replace, or add actions:
```typescript
import { factories } from '@apick/core';

export default factories.createCoreController('api::article.article', ({ apick }) => ({
  async findPopular(ctx) {
    const data = await apick.service('api::article.article').findPopular();
    return ctx.send({ data });
  },
}));
```

**Middlewares** — intercept any request:
```typescript
export default () => async (ctx, next) => {
  const start = Date.now();
  await next();
  ctx.set('X-Response-Time', `${Date.now() - start}ms`);
};
```

**Policies** — gate access with boolean logic:
```typescript
export default (policyContext, config, { apick }) => {
  return policyContext.state.user?.role?.type === 'admin';
};
```

**Event hooks** — react to data changes:
```typescript
// In register() lifecycle
apick.eventHub.on('entry.create', ({ result, params }) => {
  apick.log.info(`Created ${params.uid}: ${result.document_id}`);
});
```

## Testing

APICK is tested with **1,352 tests** across 29 projects. The same patterns are available for your project:

```typescript
import { describe, it, expect } from 'vitest';

describe('Articles API', () => {
  it('creates and retrieves an article', async () => {
    const create = await server.inject({
      method: 'POST',
      url: '/api/articles',
      body: { data: { title: 'Test Article' } },
    });
    expect(create.statusCode).toBe(201);

    const docId = create.body.data.document_id;
    const find = await server.inject({
      method: 'GET',
      url: `/api/articles/${docId}`,
    });
    expect(find.body.data.title).toBe('Test Article');
  });
});
```

No mocking HTTP. No spinning up servers. `server.inject()` sends requests through the full middleware stack without touching the network.

## Packages

APICK is published as scoped packages on npm:

| Package | Description | npm |
|---------|-------------|-----|
| [`@apick/core`](./packages/core) | Framework kernel: HTTP server, config, lifecycle, registries, document service, database, auth, event hub, cache | [![npm](https://img.shields.io/npm/v/@apick/core.svg)](https://www.npmjs.com/package/@apick/core) |
| [`@apick/cli`](./packages/cli) | CLI tool: `apick develop`, `apick start` | [![npm](https://img.shields.io/npm/v/@apick/cli.svg)](https://www.npmjs.com/package/@apick/cli) |
| [`@apick/types`](./packages/types) | Shared TypeScript type definitions | [![npm](https://img.shields.io/npm/v/@apick/types.svg)](https://www.npmjs.com/package/@apick/types) |
| [`@apick/utils`](./packages/utils) | Error classes, env helpers, UID utilities, object/string utils | [![npm](https://img.shields.io/npm/v/@apick/utils.svg)](https://www.npmjs.com/package/@apick/utils) |

Additional packages in the monorepo (not yet published to npm):

| Package | What it does |
|---------|-------------|
| `@apick/admin` | Admin users, roles, API tokens, audit logs |
| `@apick/permissions` | Condition-based RBAC engine |
| `@apick/users-permissions` | End-user auth, registration |
| `@apick/content-manager` | Content CRUD orchestration, history/versioning |
| `@apick/i18n` | Multi-locale content management |
| `@apick/upload` | File/media management with provider support |
| `@apick/email` | Provider-based transactional email |
| `@apick/ai` | Vector search, enrichment, generation, RAG, prompts |
| `@apick/mcp-server` | Model Context Protocol server |
| `@apick/ai-gateway` | AI proxy with caching, rate limiting, cost tracking |
| `@apick/content-releases` | Batch publish/unpublish releases |
| `@apick/review-workflows` | Editorial approval stages |
| `@apick/data-transfer` | Export/import/sync |
| `@apick/generators` | Code scaffolding CLI |

## Tutorials

Progressive tutorial series — each builds on the previous, with working code and automated tests:

| # | Tutorial | What you learn |
|---|----------|---------------|
| 01 | [Hello APIck](./tutorials/01-hello-apick/) | Your first content API — define a schema, get full CRUD |
| 02 | [Field Types & Querying](./tutorials/02-field-types-and-querying/) | 8+ field types, sort, pagination, field selection |
| 03 | [Draft & Publish](./tutorials/03-draft-and-publish/) | Draft/publish lifecycle, status filtering |
| 04 | [Single Types](./tutorials/04-single-types/) | One-off settings alongside collection types |
| 05 | [Middleware](./tutorials/05-middleware/) | Onion model, response timing, API key guard |
| 06 | [Authentication](./tutorials/06-authentication/) | JWT-protected endpoints with signJWT/verifyJWT |
| 07 | [Custom Controllers](./tutorials/07-custom-controllers/) | Extending core CRUD with custom actions |
| 08 | [Lifecycle Hooks](./tutorials/08-lifecycle-hooks/) | Auto-slug generation, event-driven side effects |
| 09 | [Caching](./tutorials/09-caching/) | In-memory cache, TTL, invalidation on write |
| 10 | [Testing](./tutorials/10-testing/) | Full test suite with server.inject() |

## Documentation

| Guide | What it covers |
|-------|---------------|
| [Architecture](./docs/ARCHITECTURE.md) | System overview, package structure, request lifecycle |
| [Content Modeling](./docs/CONTENT_MODELING_GUIDE.md) | Content types, field types, components, relations |
| [Content API](./docs/CONTENT_API_GUIDE.md) | REST endpoints, query params, filtering, draft/publish |
| [Database](./docs/DATABASE_GUIDE.md) | Query engine, operators, migrations, transactions |
| [Auth](./docs/AUTH_GUIDE.md) | Admin/user auth, JWT, RBAC, API tokens, sessions |
| [Customization](./docs/CUSTOMIZATION_GUIDE.md) | Controllers, services, routes, middleware, policies |
| [Plugins](./docs/PLUGINS_GUIDE.md) | Plugin system, providers, email, upload, webhooks, cron |
| [Features](./docs/FEATURES_GUIDE.md) | i18n, releases, workflows, history, data transfer, audit |
| [AI](./docs/AI_GUIDE.md) | Vectors, search, enrichment, RAG, MCP, gateway |
| [Testing](./docs/TESTING_GUIDE.md) | Test patterns, server.inject(), database isolation |
| [Development](./docs/DEVELOPMENT_STANDARDS.md) | Setup, conventions, CLI commands |
| [Deployment](./docs/DEPLOYMENT_GUIDE.md) | Env vars, Docker, PM2, Nginx, Kubernetes |

## Contributing

```bash
git clone https://github.com/vivmagarwal/apickjs.git && cd apickjs
npm install
npx vitest run --exclude "**/strapi-develop/**"   # 1,308 tests
```

## License

[MIT](LICENSE)
