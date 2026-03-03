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

Define a content type. Get a full CRUD API. Add auth, i18n, draft/publish, vector search, review workflows — all through the same consistent patterns. No code generation. No magic. Just functions, middleware, and configuration.

## Why APICK

**For teams building serious content infrastructure:**

- You want your CMS to be a **dependency**, not a platform. APICK is a library. You `import` it, configure it, extend it, test it, deploy it — like any other Node.js package.

- You want **real TypeScript**, not types bolted on after the fact. Every API, every config object, every query result is typed. `strict: true` everywhere. Zod schemas generate both runtime validation and static types from the same source.

- You want to **own the API contract**. No proprietary query languages. No framework-specific abstractions leaking into your frontend. Standard REST with filtering, sorting, pagination, population — all documented, all predictable.

- You want **AI-native content management**. Vector fields, semantic search, RAG pipelines, content enrichment, prompt registries, MCP server integration — built into the core, not afterthought plugins.

## Quick Start

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
    content:  { type: 'blocks' },
    category: { type: 'enumeration', enum: ['news', 'tutorial', 'opinion'] },
    author:   { type: 'relation', relation: 'manyToOne', target: 'plugin::users-permissions.user' },
  },
};
```

That's it. APICK auto-generates the database table, CRUD endpoints, query validation, and draft/publish workflow. No migrations to write. No routes to register.

## Use the API

```bash
# Create
curl -X POST http://localhost:1337/api/articles \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "data": { "title": "Hello World", "category": "tutorial" } }'

# Query with filters, sorting, pagination, and relation population
curl "http://localhost:1337/api/articles?filters[category][\$eq]=tutorial&sort=createdAt:desc&pagination[pageSize]=10&populate=author"

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
- **14+ field types** — string, text, richtext, blocks, integer, float, decimal, boolean, date, datetime, time, email, password, uid, enumeration, json, media, relation, component, dynamic zone
- **Draft & Publish** — Every document has draft and published versions. Publish when ready, unpublish to retract.
- **Relations** — oneToOne, oneToMany, manyToOne, manyToMany, with bidirectional inverse configuration
- **Components & Dynamic Zones** — Reusable field groups and flexible content blocks
- **Content History** — Point-in-time snapshots with schema-aware restore

### Query Engine
- **35+ filter operators** — `$eq`, `$ne`, `$in`, `$contains`, `$between`, `$null`, `$not`, and more
- **Deep filtering** — Filter on nested relations: `filters[author][role][name][$eq]=editor`
- **Field selection** — `fields=title,slug` to reduce payload size
- **Nested population** — `populate[author][fields]=name,email`
- **Cursor & offset pagination** — Choose your pagination strategy

### Authentication & Authorization
- **Dual auth system** — Separate admin and end-user authentication
- **JWT with refresh tokens** — Access/refresh token rotation with reuse detection
- **CASL-powered RBAC** — Field-level and row-level permissions
- **API tokens** — Read-only, full-access, or custom-scoped tokens for machine clients
- **Rate limiting** — Per-IP, per-user, or per-route with Redis support

### Internationalization
- **Per-field localization** — Choose which fields are translated, which are shared
- **Independent publish per locale** — Published in English, still draft in French
- **Locale management API** — Add/remove locales at runtime

### AI (Built-in)
- **Vector fields** — Auto-computed embeddings via lifecycle hooks
- **Semantic search** — Keyword, vector similarity, or hybrid search with Reciprocal Rank Fusion
- **Content enrichment** — Auto-generate summaries, tags, SEO descriptions, alt text, sentiment scores
- **Prompt registry** — Versioned prompt templates with draft/publish workflow
- **Structured output** — Generate typed content from LLMs, validated against your Zod schemas
- **RAG pipeline** — Auto-chunk, embed, retrieve, and answer questions grounded in your content
- **MCP server** — Expose your content to Claude, Cursor, and other AI agents via Model Context Protocol
- **AI gateway** — Proxy AI calls with semantic caching, per-user rate limiting, cost tracking, and fallback chains

### Operations
- **Review workflows** — Multi-stage editorial approval with publish gates
- **Content releases** — Batch publish/unpublish across content types and locales atomically
- **Data transfer** — Export/import archives or direct instance-to-instance sync
- **Audit logs** — Track every admin action for compliance
- **Webhooks** — HMAC-signed event delivery to external systems
- **Cron jobs** — In-process scheduled tasks

## Architecture

APICK is a monorepo of 20 focused packages:

| Package | What it does |
|---------|-------------|
| `@apick/core` | HTTP server, config, lifecycle, registries, middleware, policies, factories, document service, query engine, database, auth, cache, logging, events, cron, queue, webhooks |
| `@apick/admin` | Admin users, roles, API tokens, audit logs |
| `@apick/content-manager` | Content CRUD orchestration, history/versioning |
| `@apick/users-permissions` | End-user auth, registration, OAuth |
| `@apick/permissions` | CASL-based RBAC engine |
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
| `@apick/cli` | Command-line interface |
| `@apick/types` | Shared TypeScript definitions |
| `@apick/utils` | Errors, env helpers, validation, UID utilities |

**Providers** (swappable):

| Provider | Package |
|----------|---------|
| OpenAI | `@apick/provider-ai-openai` |
| Anthropic | `@apick/provider-ai-anthropic` |
| Google AI | `@apick/provider-ai-google` |
| Ollama | `@apick/provider-ai-ollama` |
| Resend (email) | `@apick/provider-email-resend` |
| Cloudflare R2 (upload) | `@apick/provider-upload-r2` |

## Tech Stack

| Layer | Choice | Why |
|-------|--------|-----|
| **Language** | TypeScript (strict, ESM) | End-to-end type safety |
| **Runtime** | Node.js >= 20 | LTS, native ESM, AsyncLocalStorage |
| **HTTP** | `node:http` + `find-my-way` | Zero framework overhead, trie-based routing |
| **Database** | Drizzle ORM | TypeScript-first, SQL-like API, zero runtime cost |
| **Validation** | Zod | Runtime validation = static types, single source of truth |
| **Auth** | JWT + CASL | Stateless tokens, fine-grained attribute-level RBAC |
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

**Lifecycle hooks** — react to data changes:
```typescript
export default {
  beforeCreate(event) {
    event.params.data.slug = slugify(event.params.data.title);
  },
  afterCreate(event) {
    apick.service('plugin::email.email').send({
      to: 'editors@example.com',
      subject: `New article: ${event.result.title}`,
    });
  },
};
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

## Deploy

```bash
NODE_ENV=production apick build
NODE_ENV=production apick migration:run
NODE_ENV=production apick start
```

Works with Docker, PM2, Kubernetes, or any Node.js hosting. See the [Deployment Guide](./docs/DEPLOYMENT_GUIDE.md).

## Packages

APICK is published as scoped packages on npm:

| Package | Description | npm |
|---------|-------------|-----|
| [`@apick/core`](./packages/core) | Framework kernel: HTTP server, config, lifecycle, registries, document service, database, auth, event hub, cache | [![npm](https://img.shields.io/npm/v/@apick/core.svg)](https://www.npmjs.com/package/@apick/core) |
| [`@apick/cli`](./packages/cli) | CLI tool: `apick develop`, `apick start`, `apick build` | [![npm](https://img.shields.io/npm/v/@apick/cli.svg)](https://www.npmjs.com/package/@apick/cli) |
| [`@apick/types`](./packages/types) | Shared TypeScript type definitions | [![npm](https://img.shields.io/npm/v/@apick/types.svg)](https://www.npmjs.com/package/@apick/types) |
| [`@apick/utils`](./packages/utils) | Error classes, env helpers, UID utilities, object/string utils | [![npm](https://img.shields.io/npm/v/@apick/utils.svg)](https://www.npmjs.com/package/@apick/utils) |

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
