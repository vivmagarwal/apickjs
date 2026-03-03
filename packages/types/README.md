# @apick/types

Shared TypeScript type definitions for [APICK](https://github.com/vivmagarwal/apickjs) — a pure headless CMS built TypeScript-first.

## Install

```bash
npm install @apick/types
```

## Type Namespaces

| Namespace | Description |
|-----------|-------------|
| `Core` | Core framework types (`Apick`, `Server`, `Config`, `Registry`) |
| `UID` | UID string types (`ContentType`, `Service`, `Controller`) |
| `Schema` | Content type schema types (`Attribute`, `ContentType`, `Component`) |
| `Modules` | Module-specific types (document service, query engine) |
| `Data` | Data shape types (request/response bodies) |
| `Struct` | Structural utility types |
| `Config` | Configuration file types (`ServerConfig`, `DatabaseConfig`, etc.) |

## Usage

```typescript
import type { Core, UID, Schema } from '@apick/types';

function getArticles(apick: Core.Apick): Promise<any[]> {
  const uid: UID.ContentType = 'api::article.article';
  return apick.documents(uid).findMany();
}
```

## Related Packages

- [`@apick/core`](https://www.npmjs.com/package/@apick/core) -- Framework kernel
- [`@apick/utils`](https://www.npmjs.com/package/@apick/utils) -- Error classes, env helpers, utilities
- [`@apick/cli`](https://www.npmjs.com/package/@apick/cli) -- CLI tool

## License

[MIT](https://github.com/vivmagarwal/apickjs/blob/main/LICENSE)
