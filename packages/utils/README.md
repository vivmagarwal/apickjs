# @apick/utils

Shared utility functions for [APICK](https://github.com/vivmagarwal/apickjs) — a pure headless CMS built TypeScript-first.

## Install

```bash
npm install @apick/utils
```

## What's Inside

### Error Classes

Typed error classes with HTTP status codes:

```typescript
import { errors } from '@apick/utils';

throw new errors.NotFoundError('Article not found');
throw new errors.ValidationError('Invalid input', { errors: [...] });
throw new errors.UnauthorizedError('Missing token');
throw new errors.ForbiddenError('Insufficient permissions');
```

| Error Class | HTTP Status |
|------------|-------------|
| `ApplicationError` | 400 |
| `ValidationError` | 400 |
| `UnauthorizedError` | 401 |
| `ForbiddenError` | 403 |
| `NotFoundError` | 404 |
| `PayloadTooLargeError` | 413 |
| `RateLimitError` | 429 |

### Environment Helpers

```typescript
import { env } from '@apick/utils';

env('HOST', '0.0.0.0');           // string
env.int('PORT', 1337);            // number
env.bool('DATABASE_SSL', false);  // boolean
env.array('APP_KEYS', []);        // string[]
env.json('CORS_ORIGINS', '["*"]'); // parsed JSON
```

### UID Utilities

```typescript
import { uid } from '@apick/utils';

uid.parseUid('api::article.article');  // { namespace: 'api', name: 'article.article' }
uid.hasNamespace('api::article.article', 'api');  // true
uid.isValidUid('api::article.article');  // true
```

### Object & String Utilities

- `deepMerge`, `dotGet`, `dotSet`, `dotHas`, `deepFreeze`, `isPlainObject`
- `pluralize`, `camelCase`, `pascalCase`, `kebabCase`

## Related Packages

- [`@apick/core`](https://www.npmjs.com/package/@apick/core) -- Framework kernel
- [`@apick/types`](https://www.npmjs.com/package/@apick/types) -- Shared TypeScript type definitions
- [`@apick/cli`](https://www.npmjs.com/package/@apick/cli) -- CLI tool

## License

[MIT](https://github.com/vivmagarwal/apickjs/blob/main/LICENSE)
