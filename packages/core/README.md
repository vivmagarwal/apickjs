# @apick/core

The framework kernel for [APICK](https://github.com/vivmagarwal/apickjs) — a pure headless CMS built TypeScript-first.

## What's Inside

`@apick/core` provides the complete runtime for building content APIs:

| Module | Description |
|--------|-------------|
| **HTTP Server** | `node:http` + `find-my-way` trie router, `server.inject()` for testing |
| **Configuration** | Dotenv, environment-specific overrides, dot-notation access |
| **Lifecycle** | `Apick` class with `load()` / `listen()` / `destroy()` phases |
| **Content API** | Auto-generated REST endpoints from content type schemas |
| **Content Types** | Schema definition, normalization, system field injection |
| **Document Service** | High-level CRUD with draft/publish, events, validation |
| **Database** | Drizzle ORM (SQLite/PostgreSQL/MySQL), schema sync, migrations |
| **Query Engine** | SQL query builder with operators (`$eq`, `$gt`, `$contains`, etc.) |
| **Auth** | JWT sign/verify (HS256), password hashing |
| **Middleware** | Async `(ctx, next)` pipeline: rate-limit, CORS, security, body parser |
| **Event Hub** | Pub/sub event system with sequential execution |
| **Cache** | In-memory LRU cache with TTL and prefix deletion |
| **Factories** | `createCoreController`, `createCoreService`, `createCoreRouter` |
| **Logging** | Pino structured JSON logger |
| **Plugins** | Plugin manager with dependency resolution |
| **Webhooks** | HMAC-signed webhook delivery |
| **Cron** | In-process cron scheduler |
| **Queue** | Background job queue |

## Install

```bash
npm install @apick/core
```

## Quick Example

```typescript
import { Apick } from '@apick/core';

const apick = new Apick({ appDir: process.cwd() });
await apick.load();
await apick.listen();
// Server running at http://0.0.0.0:1337
```

## Documentation

- [Architecture](https://github.com/vivmagarwal/apickjs/blob/main/docs/ARCHITECTURE.md)
- [Content API Guide](https://github.com/vivmagarwal/apickjs/blob/main/docs/CONTENT_API_GUIDE.md)
- [Content Modeling Guide](https://github.com/vivmagarwal/apickjs/blob/main/docs/CONTENT_MODELING_GUIDE.md)
- [Database Guide](https://github.com/vivmagarwal/apickjs/blob/main/docs/DATABASE_GUIDE.md)
- [Auth Guide](https://github.com/vivmagarwal/apickjs/blob/main/docs/AUTH_GUIDE.md)
- [Customization Guide](https://github.com/vivmagarwal/apickjs/blob/main/docs/CUSTOMIZATION_GUIDE.md)
- [Plugins Guide](https://github.com/vivmagarwal/apickjs/blob/main/docs/PLUGINS_GUIDE.md)
- [Testing Guide](https://github.com/vivmagarwal/apickjs/blob/main/docs/TESTING_GUIDE.md)

## Related Packages

- [`@apick/cli`](https://www.npmjs.com/package/@apick/cli) -- CLI tool (`apick develop`, `apick start`)
- [`@apick/types`](https://www.npmjs.com/package/@apick/types) -- Shared TypeScript type definitions
- [`@apick/utils`](https://www.npmjs.com/package/@apick/utils) -- Error classes, env helpers, utilities

## License

[MIT](https://github.com/vivmagarwal/apickjs/blob/main/LICENSE)
