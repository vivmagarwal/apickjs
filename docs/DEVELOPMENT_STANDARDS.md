# Development Standards

## Setup

```bash
git clone <repo-url> && cd apick_js
npm install        # npm workspaces resolve all inter-package deps
npx vitest run   # Run all tests
```

## Project Conventions

### TypeScript

- **Strict mode** in all tsconfig files
- **ESM only** — `"type": "module"`, Node16 module resolution
- `tsc -p tsconfig.build.json` per package
- No `any` leakage — `any` only at service boundaries
- Target: `ES2022`, module: `Node16`

```jsonc
// tsconfig.json (user project)
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "strict": true,
    "outDir": "./dist",
    "rootDir": ".",
    "declaration": true,
    "sourceMap": true,
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["src/**/*.ts", "config/**/*.ts", "types/**/*.ts"]
}
```

### Code Patterns

| Pattern | Example |
|---------|---------|
| Factory functions | `createDocumentService(config) → DocumentService` |
| Interface-first | Define interface, then implement with closure |
| No classes | Closures and plain objects only |
| No decorators | No experimental TS features |
| Middleware | `(ctx, next) => { /* before */ await next(); /* after */ }` |
| Provider | `{ upload(file): Promise<{url}>, delete(file): Promise<void> }` |

### Factory Function Patterns

APICK provides three core factories for creating controllers, services, and routers:

```ts
import { factories } from '@apick/core';

// Core controller — wraps/extends default CRUD actions
export default factories.createCoreController('api::article.article', ({ apick }) => ({
  async find(ctx) {
    const { data, meta } = await apick.service('api::article.article').find(ctx.query);
    return ctx.send({ data, meta });
  },
  // Custom actions
  async findPopular(ctx) {
    const data = await apick.service('api::article.article').findPopular();
    return ctx.send({ data });
  },
}));

// Core service — wraps/extends default CRUD operations
export default factories.createCoreService('api::article.article', ({ apick }) => ({
  async findPopular() {
    return apick.db.query('api::article.article').findMany({
      where: { views: { $gt: 1000 } },
      orderBy: { views: 'desc' },
      limit: 10,
    });
  },
}));

// Core router — generates standard CRUD routes
export default factories.createCoreRouter('api::article.article', {
  config: {
    find: { policies: ['global::is-public'] },
    create: { policies: ['admin::isAuthenticatedAdmin'] },
  },
});
```

See [CUSTOMIZATION_GUIDE.md](./CUSTOMIZATION_GUIDE.md) for the full customization reference.

### Dual Export Schema Pattern

Content type schemas export both a Zod schema (validation) and a definition object (metadata):

```ts
// src/api/article/content-types/article/schema.ts
import { z } from 'zod';
import { defineContentType } from '@apick/core';

// Zod schema: runtime validation + type inference
export const articleSchema = z.object({
  title: z.string().min(1).max(255),
  slug: z.string().regex(/^[a-z0-9-]+$/),
  content: z.string(),
});

export type Article = z.infer<typeof articleSchema>;

// Schema definition: DB generation, relations, framework options
export default defineContentType({
  schema: articleSchema,
  info: { singularName: 'article', pluralName: 'articles', displayName: 'Article' },
  options: { draftAndPublish: true },
  attributes: {
    title: { type: 'string', required: true, maxLength: 255 },
    slug: { type: 'uid', targetField: 'title' },
    content: { type: 'richtext' },
    category: { type: 'relation', relation: 'manyToOne', target: 'api::category.category' },
  },
});
```

See [CONTENT_MODELING_GUIDE.md](./CONTENT_MODELING_GUIDE.md) for the full schema reference.

### Type Generation

```bash
apick ts:generate-types              # Generate types from content type schemas
apick ts:generate-types --out ./types  # Custom output directory
```

Outputs `types/generated/contentTypes.d.ts` with typed interfaces for all content types and UID mappings for `@apick/types`.

### File Organization

```
packages/<name>/
├── src/
│   ├── services/       # Service implementations
│   ├── index.ts        # Barrel exports
├── __tests__/          # Vitest test files
├── package.json        # @apick/<name>
└── tsconfig.json       # extends ../../tsconfig.json
```

### Naming Conventions

| Thing | Convention | Example |
|-------|-----------|---------|
| Packages | `@apick/<name>` kebab-case | `@apick/content-manager` |
| Files | kebab-case | `document-service/index.ts` |
| Functions | camelCase | `createDocumentService()` |
| Interfaces | PascalCase | `DocumentService` |
| UIDs | `namespace::singular.singular` | `api::article.article` |
| DB tables | snake_case | `articles`, `admin_users` |
| DB columns | snake_case | `document_id`, `created_at` |

### Error Handling

Typed error classes from `@apick/utils/errors`:

| Error Class | HTTP Status | When |
|------------|-------------|------|
| `ApplicationError` | 400 | Generic application error |
| `ValidationError` | 400 | Invalid input |
| `UnauthorizedError` | 401 | Missing/invalid auth |
| `ForbiddenError` | 403 | Insufficient permissions |
| `NotFoundError` | 404 | Resource not found |
| `PayloadTooLargeError` | 413 | Request body too large |
| `RateLimitError` | 429 | Rate limit exceeded |

Error response format: `{ data: null, error: { status, name, message, details? } }`

### Configuration

Config files in `config/` directory:

| File | Purpose |
|------|---------|
| `server.ts` | Host, port, proxy settings |
| `database.ts` | Database client and connection |
| `admin.ts` | Admin auth secrets |
| `api.ts` | REST API prefix, default settings |
| `middlewares.ts` | Middleware configuration |
| `plugins.ts` | Plugin settings |

Environment overrides: `config/env/{NODE_ENV}/`. See [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md) for all env vars.

## CLI Commands

### Development

| Command | Description |
|---------|-------------|
| `apick develop` | Start dev server with auto-reload |
| `apick develop --debug` | Start with Node.js inspector |
| `apick build` | Compile TypeScript for production |
| `apick start` | Start production server (requires `build`) |

### Code Generation

| Command | Description |
|---------|-------------|
| `apick generate` | Interactive scaffolding |
| `apick ts:generate-types` | Generate TypeScript types from schemas |

Generator artifacts:

| Generator | Creates | Location |
|-----------|---------|----------|
| `content-type` | Schema, controller, service, route | `src/api/{name}/` |
| `controller` | Controller file | `src/api/{name}/controllers/` |
| `service` | Service file | `src/api/{name}/services/` |
| `policy` | Policy file | `src/policies/` |
| `middleware` | Middleware file | `src/middlewares/` |
| `plugin` | Full plugin scaffold | `src/plugins/{name}/` |
| `api` | Complete API scaffold | `src/api/{name}/` |

### Database

| Command | Description |
|---------|-------------|
| `apick migration:run` | Run pending migrations |
| `apick migration:rollback` | Roll back last batch |
| `apick migration:status` | Show migration status |
| `apick migration:generate <name>` | Generate new migration file |

See [DATABASE_GUIDE.md](./DATABASE_GUIDE.md) for migration details.

### Data Transfer

| Command | Description |
|---------|-------------|
| `apick export --file backup.tar.gz` | Export data to archive |
| `apick import --file backup.tar.gz` | Import data from archive |
| `apick transfer --to <url>` | Push data to remote APICK |
| `apick transfer --from <url>` | Pull data from remote APICK |

See [FEATURES_GUIDE.md](./FEATURES_GUIDE.md) for data transfer details.

### Debug

| Command | Description |
|---------|-------------|
| `apick console` | Interactive REPL with `apick` object |
| `apick version` | Print APICK version |

### Project Creation

Clone the repo and use the starter example:

```bash
git clone https://github.com/APickjs/apickjs.git && cd apickjs
npm install
cd examples/starter
npx tsx ../../packages/cli/src/bin.ts develop
```

## Testing

- **Framework:** Vitest
- **Database:** Better-sqlite3 in-memory (`:memory:`)
- **HTTP tests:** `server.inject()` — bypasses network, routes through full middleware pipeline
- **Pattern:** Fresh DB + event hub in `beforeEach`, close both in `afterEach`

Three levels of tests:

| Level | What it tests | Example |
|-------|--------------|---------|
| Unit | Individual functions/services in isolation | `packages/utils/__tests__/` |
| Service | Document service, query engine with real SQLite | `packages/core/__tests__/document-service.test.ts` |
| HTTP Integration | Full stack via `server.inject()` | `packages/e2e-tests/` |

```bash
# All tests
npx vitest run

# Specific package
npx vitest run packages/core/__tests__/

# Watch mode
npx vitest packages/e2e-tests/
```

See [TESTING_GUIDE.md](./TESTING_GUIDE.md) for test patterns and examples.

## How To

### Add a New Content Type

1. Use `apick generate` to scaffold, or create manually:
   - `src/api/{name}/content-types/{name}/schema.ts`
   - `src/api/{name}/controllers/{name}.ts`
   - `src/api/{name}/services/{name}.ts`
   - `src/api/{name}/routes/{name}.ts`
2. Content API auto-generates CRUD routes
3. Schema sync auto-creates the database table

Or create via API: `POST /admin/content-types`. See [CONTENT_MODELING_GUIDE.md](./CONTENT_MODELING_GUIDE.md).

### Add a Custom Controller Action

```ts
// src/api/article/controllers/article.ts
export default factories.createCoreController('api::article.article', ({ apick }) => ({
  async findBySlug(ctx) {
    const { slug } = ctx.params;
    const article = await apick.service('api::article.article').findBySlug(slug);
    if (!article) return ctx.notFound();
    return ctx.send({ data: article });
  },
}));
```

See [CUSTOMIZATION_GUIDE.md](./CUSTOMIZATION_GUIDE.md).

### Add a New Middleware

```ts
// src/middlewares/custom-header.ts
export default () => async (ctx, next) => {
  await next();
  ctx.set('X-Custom-Header', 'apick');
};
```

See [CUSTOMIZATION_GUIDE.md](./CUSTOMIZATION_GUIDE.md).

### Add a New Provider

Implement the provider interface and register via `config/plugins.ts`:

```ts
// Upload provider: { upload(file), delete(file) }
// Email provider: { send(options) }
// AI provider: { chat(params), embed(params) }
```

See [PLUGINS_GUIDE.md](./PLUGINS_GUIDE.md) for provider development.

### Release & Publish

Before committing and publishing to npm, ensure `README.md` at the project root is up to date. The README is the public face of the package on both GitHub and npm.

```bash
# 1. Update README.md if any user-facing changes were made
#    (new features, changed APIs, updated examples, etc.)

# 2. Bump version
npm version patch --no-git-tag-version   # or minor / major

# 3. Commit everything
git add -A && git commit -m "v$(node -p 'require(\"./package.json\").version')"

# 4. Push to GitHub
git push origin main

# 5. Publish to npm
npm publish --workspaces false
```

> **Important:** npm displays `README.md` from the tarball at publish time. If you update the README after publishing, you must publish a new version for the change to appear on npmjs.com.

### Run Integration Tests

```bash
npx vitest run     # All tests
npx vitest run packages/e2e-tests/                   # HTTP integration only
npx vitest packages/e2e-tests/                       # Watch mode
```
