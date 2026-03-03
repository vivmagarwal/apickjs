# APICK CMS -- Plugins, Providers, Email, Upload, Webhooks, Cron, Event Hub & Job Queue

> Cross-references: [ARCHITECTURE.md](./ARCHITECTURE.md) | [CONTENT_API_GUIDE.md](./CONTENT_API_GUIDE.md) | [CUSTOMIZATION_GUIDE.md](./CUSTOMIZATION_GUIDE.md)

---

## Table of Contents

1. [Plugin System](#plugin-system)
2. [Plugin Development](#plugin-development)
3. [Provider System](#provider-system)
4. [Email](#email)
5. [Upload / Media](#upload--media)
6. [Webhooks](#webhooks)
7. [Cron Jobs](#cron-jobs)
8. [Event Hub](#event-hub)
9. [Background Job Queue](#background-job-queue)
10. [AI Providers](#ai-providers)
11. [Key Files](#key-files)

---

## Plugin System

Plugins are the primary extension mechanism in APICK. Every major feature -- upload, email, i18n, users-permissions -- is itself a plugin. Custom functionality follows the same structure.

### Plugin Types

| Type | Location | Resolution | Use Case |
|------|----------|------------|----------|
| **Internal (core)** | `packages/` in monorepo | Bundled with `@apick/*` scope | Framework features (content-manager, upload, i18n) |
| **npm package** | `node_modules/` | Installed via `npm install` | Community/third-party plugins |
| **Local** | `src/plugins/{name}/` | Resolved from project source | Project-specific plugins |

APICK discovers plugins in this order: internal packages, npm packages, then local plugins. If two plugins share a name, the later one wins (local overrides npm, npm overrides internal).

### Plugin Manager

`createPluginManager(config)` returns a `PluginManager` that owns the full plugin lifecycle.

| Method | Description |
|---|---|
| `register(name, definition)` | Queues a plugin definition. Skipped if `userConfig[name].enabled === false`. |
| `loadAll()` | Topologically sorts plugins, resolves config, instantiates services/controllers/content-types, registers them into the Apick registries under `plugin::<name>.<artifact>` UIDs. |
| `runRegister()` | Calls each plugin's `register()` hook in dependency order. |
| `runBootstrap()` | Calls each plugin's `bootstrap()` hook in dependency order. |
| `runDestroy()` | Calls each plugin's `destroy()` hook in **reverse** dependency order. |
| `get(name)` / `has(name)` / `getAll()` | Access loaded `PluginInstance` objects. |
| `getLoadOrder()` | Returns the computed topological order. |

### Plugin Lifecycle

```mermaid
flowchart TD
    A["Discovery<br/>Scan internal, npm, local"] --> B["Config Merge<br/>Defaults + user overrides + validator"]
    B --> C["Extensions<br/>src/extensions/{plugin}/apick-server.ts"]
    C --> D["register()<br/>Extend registries, custom fields — no DB"]
    D --> E["Schema Sync<br/>Drizzle table definitions generated"]
    E --> F["bootstrap()<br/>Seed data, event subscriptions — DB available"]
    F --> G["Running"]
    G -->|shutdown| H["destroy()<br/>Cleanup, reverse order"]
```

#### Phase Details

| Phase | What Happens |
|-------|-------------|
| **Discovery** | APICK scans internal packages, `node_modules`, and `src/plugins/` for plugin definitions. Disabled plugins are excluded. |
| **Config Merge** | Plugin default config (from `config/index.ts`) is deep-merged with user overrides from `config/plugins.ts`. Zod validation applied. |
| **Extensions** | User extensions in `src/extensions/{pluginName}/apick-server.ts` are applied, allowing modification of any plugin artifact. |
| **register()** | Plugin `register` hook runs. No database access. Used for registry modifications and custom field registration. |
| **Schema Sync** | All content type schemas (from APIs and plugins) are collected, Drizzle table definitions generated, and the database schema is synchronized. |
| **bootstrap()** | Plugin `bootstrap` hook runs. Database is available. Used for seeding, event subscriptions, external connections. |
| **destroy()** | Plugin `destroy` hook runs on shutdown. Runs in **reverse** order (last registered plugin destroys first). |

### Dependency Resolution

Topological sort via DFS with cycle detection.

| Field | Behaviour |
|---|---|
| `requiredPlugins` | Must be registered. Throws `"Plugin X requires plugin Y which is not available"` if missing. |
| `optionalPlugins` | Loaded first if present, silently ignored if absent. |

Circular dependencies throw: `"Circular plugin dependency detected involving X"`.

```mermaid
flowchart LR
    A["users-permissions"] --> C["my-plugin"]
    B["upload"] --> C
    D["i18n"] -.->|optional| C
```

### Plugin Definition Structure

```ts
import { definePlugin } from '@apick/core/plugins';

export default definePlugin({
  name: 'my-plugin',
  displayName: 'My Plugin',
  description: 'Does things.',
  kind: 'plugin',

  config: {
    default: { foo: 'bar' },          // or () => ({ foo: 'bar' })
    validator: (cfg) => { /* throw on bad config */ },
  },

  requiredPlugins: ['other-plugin'],
  optionalPlugins: ['optional-dep'],

  contentTypes: {
    myType: {
      schema: {
        singularName: 'my-type',
        pluralName: 'my-types',
        displayName: 'My Type',
        attributes: { title: { type: 'string' } },
      },
    },
  },

  services: {
    myService: (ctx) => ({
      doWork() { return ctx.apick.config.foo; },
    }),
  },

  controllers: {
    myController: (ctx) => ({
      async find(httpCtx: any) { /* ... */ },
    }),
  },

  routes: {
    'content-api': [
      { method: 'GET', path: '/my-things', handler: 'myController.find' },
    ],
    admin: [],
  },

  middlewares: { /* same factory pattern */ },
  policies:    { /* same factory pattern */ },

  register(ctx)  { /* early setup, before bootstrap */ },
  bootstrap(ctx) { /* after all plugins loaded */ },
  destroy(ctx)   { /* cleanup on shutdown */ },
});
```

All exports are optional. A plugin that only adds routes needs only `routes`. A plugin that only runs setup logic needs only `bootstrap`.

### PluginContext

Every hook and factory receives `{ apick: PluginApickInterface }`:

| Property | Type | Notes |
|---|---|---|
| `apick.config` | `Record<string, any>` | Merged plugin config (defaults + user overrides). |
| `apick.plugin(name)` | `PluginInstance \| undefined` | Access another plugin. |
| `apick.services` | Registry (`add`, `get`, `has`, `getAll`) | Global service registry. |
| `apick.controllers` | Registry | Global controller registry. |
| `apick.contentTypes` | Registry | Global content type registry. |
| `apick.hooks` | `{ get(name) }` | Hook registry with `register(handler)` and `call(...args)`. |
| `apick.customFields` | `{ register, get, getAll, has }` | Custom field registry. |
| `apick.eventHub` | EventHub | Event emission and subscription. |
| `apick.log` | Pino logger | Structured logging. |
| `apick.documents(uid)` | Document Service | Content type CRUD. |

### Lifecycle Hooks

| Hook | DB Available | Purpose |
|------|-------------|---------|
| `register({ apick })` | No | Extend registries, add custom fields, modify schemas |
| `bootstrap({ apick })` | Yes | Seed data, subscribe to events, start background tasks |
| `destroy({ apick })` | Yes | Clean up connections, stop timers |

### User Config (enable/disable, override)

In the project's `config/plugins.ts`:

```ts
// config/plugins.ts
export default ({ env }) => ({
  // Enable a local plugin
  'my-plugin': {
    enabled: true,
    resolve: './src/plugins/my-plugin',  // Path for local plugins
    config: {
      apiKey: env('MY_PLUGIN_API_KEY'),
      maxRetries: 3,
    },
  },

  // Enable an npm plugin
  'seo-toolkit': {
    enabled: true,
    // No resolve needed -- npm packages auto-resolved from node_modules
    config: {
      defaultTitle: 'My Site',
    },
  },

  // Disable a built-in plugin
  'content-releases': {
    enabled: false,
  },
});
```

#### Config Resolution

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `enabled` | `boolean` | `true` | Whether the plugin is loaded |
| `resolve` | `string` | Auto-resolved | Absolute or relative path to plugin root. Required for local plugins. npm plugins are resolved from `node_modules`. |
| `config` | `object` | `{}` | User-provided config, deep-merged with plugin defaults |

### Plugin Naming

- Use **kebab-case** for plugin directory names: `my-plugin`, `seo-toolkit`, `audit-log`
- Plugin UIDs follow the pattern: `plugin::{pluginName}.{artifactName}`
- Content types: `plugin::my-plugin.my-entity`
- Services: `plugin::my-plugin.my-service`
- Controllers: `plugin::my-plugin.my-controller`

```ts
// Accessing plugin artifacts by UID
apick.service('plugin::my-plugin.my-service');
apick.controller('plugin::my-plugin.my-controller');
apick.documents('plugin::my-plugin.my-entity');
apick.contentType('plugin::my-plugin.my-entity');
```

### Extending Existing Plugins

Override or extend any installed plugin's behavior via the extensions directory:

```
src/extensions/
  users-permissions/
    apick-server.ts
```

```ts
// src/extensions/users-permissions/apick-server.ts
export default (plugin) => {
  // Override the register controller action
  const originalRegister = plugin.controllers.auth.register;

  plugin.controllers.auth.register = async (ctx) => {
    const { email } = ctx.request.body;
    if (!email.endsWith('@company.com')) {
      return ctx.badRequest('Only company email addresses are allowed');
    }
    return originalRegister(ctx);
  };

  return plugin;
};
```

#### What You Can Extend

| Artifact | How |
|----------|-----|
| Controllers | Replace or wrap individual action functions |
| Services | Replace or wrap service methods |
| Routes | Add new routes or modify existing route config |
| Content types | Modify schema attributes |
| Policies | Replace policy functions |
| Middlewares | Replace middleware functions |
| Config | Override default config values |

---

## Plugin Development

This section covers the full plugin development workflow: scaffolding, developing, testing, and publishing.

### Plugin Anatomy

```
src/plugins/my-plugin/
  server/src/
    index.ts              # Server entry point (exports lifecycle hooks)
    register.ts           # register() logic
    bootstrap.ts          # bootstrap() logic
    destroy.ts            # destroy() logic
    config/
      index.ts          # Default plugin configuration + Zod validation schema
    content-types/
      my-entity/
        schema.ts       # Content type schema (Zod + definition object)
    controllers/
      my-controller.ts
    services/
      my-service.ts
    routes/
      index.ts          # Route definitions (content-api and/or admin)
    policies/
      is-owner.ts
    middlewares/
      rate-limit.ts
  package.json            # Plugin metadata and dependencies
```

**No `admin/` directory.** APICK is a pure headless CMS -- there is no built-in admin UI. Plugins are server-only. If you need a management UI, build it as an independent frontend that consumes the plugin's API routes.

### Generating a Plugin

Use the interactive generator:

```bash
apick generate
```

Select **plugin** from the menu, then provide:

| Prompt | Example | Description |
|--------|---------|-------------|
| Plugin name | `audit-log` | kebab-case name |
| Description | `Track all content changes` | Short description for `package.json` |

You can also generate specific artifacts within an existing plugin:

```bash
apick generate
# Select: content-type, controller, service, policy, middleware, or route
# Specify the target plugin when prompted
```

### Development Workflow

```mermaid
flowchart LR
    A["apick generate"] --> B["Enable in config/plugins.ts"]
    B --> C["apick develop --watch"]
    C --> D["Write code"]
    D --> E["Test with vitest"]
    E --> F["Publish to npm"]
```

**Step 1: Generate the scaffold**

```bash
apick generate
# Select: plugin
# Name: audit-log
```

**Step 2: Enable in config**

```ts
// config/plugins.ts
export default () => ({
  'audit-log': {
    enabled: true,
    resolve: './src/plugins/audit-log',
  },
});
```

**Step 3: Develop with hot reload**

```bash
apick develop --watch
```

**Step 4: Test**

```bash
npx vitest run src/plugins/audit-log/
```

**Step 5: Publish (optional)**

```bash
cd src/plugins/audit-log
npm publish --access public
```

### Plugin package.json

Every plugin needs a `package.json` with APICK metadata:

```json
{
  "name": "@myorg/apick-plugin-audit-log",
  "version": "1.0.0",
  "description": "Track all content changes in APICK",
  "license": "MIT",
  "main": "server/src/index.ts",
  "types": "server/src/index.ts",
  "apick": {
    "name": "audit-log",
    "displayName": "Audit Log",
    "description": "Track all content changes",
    "kind": "plugin",
    "required": false
  },
  "files": [
    "server/",
    "package.json",
    "LICENSE"
  ],
  "dependencies": {},
  "peerDependencies": {
    "@apick/core": "^1.0.0",
    "@apick/types": "^1.0.0"
  }
}
```

#### `apick` Metadata Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | `string` | Yes | Plugin identifier (kebab-case). Must match the directory name. |
| `displayName` | `string` | No | Human-readable name |
| `description` | `string` | No | Short description |
| `kind` | `'plugin'` | Yes | Must be `'plugin'` |
| `required` | `boolean` | No | If `true`, cannot be disabled by the user |

#### npm Naming Convention

| Format | Example |
|--------|---------|
| Unscoped | `apick-plugin-audit-log` |
| Scoped | `@myorg/apick-plugin-audit-log` |

The `apick.name` field in `package.json` determines the identifier used in `config/plugins.ts`, not the npm package name.

### Plugin Config Validation

Plugins define a Zod schema for their configuration in `config/index.ts`:

```ts
// server/src/config/index.ts
import { z } from 'zod';

const configSchema = z.object({
  apiKey: z.string().min(1),
  maxRetries: z.number().int().min(0).max(10).default(3),
  timeout: z.number().int().min(100).default(5000),
});

export default {
  default: () => ({
    apiKey: '',
    maxRetries: 3,
    timeout: 5000,
  }),
  validator: (config: unknown) => configSchema.parse(config),
};
```

If the merged config fails validation, APICK throws at startup with a descriptive error.

### Accessing Config at Runtime

```ts
// Inside a plugin service
const config = apick.config.get('plugin.my-plugin');
// { apiKey: '...', maxRetries: 3, timeout: 5000 }
```

### Full Plugin Example: Audit Log

**Content type:**

```ts
// server/src/content-types/audit-entry/schema.ts
import { z } from 'zod';
import { defineContentType } from '@apick/core';

export const auditEntrySchema = z.object({
  action: z.enum(['create', 'update', 'delete', 'publish', 'unpublish']),
  entityUid: z.string(),
  entityId: z.string(),
  payload: z.record(z.unknown()).nullable(),
  performedBy: z.string().nullable(),
  performedAt: z.date(),
});

export default defineContentType({
  schema: auditEntrySchema,
  info: {
    singularName: 'audit-entry',
    pluralName: 'audit-entries',
    displayName: 'Audit Entry',
  },
  options: {
    draftAndPublish: false,
  },
  attributes: {
    action: { type: 'enumeration', enum: ['create', 'update', 'delete', 'publish', 'unpublish'], required: true },
    entityUid: { type: 'string', required: true },
    entityId: { type: 'string', required: true },
    payload: { type: 'json' },
    performedBy: { type: 'string' },
    performedAt: { type: 'datetime', required: true },
  },
});
```

**CRUD controller (using core factory):**

```ts
// server/src/controllers/audit-entry.ts
import { factories } from '@apick/core';

export default factories.createCoreController('plugin::audit-log.audit-entry');
```

**CRUD service (using core factory):**

```ts
// server/src/services/audit-entry.ts
import { factories } from '@apick/core';

export default factories.createCoreService('plugin::audit-log.audit-entry');
```

**Custom service (non-CRUD):**

```ts
// server/src/services/audit-logger.ts
import type { Core } from '@apick/types';

export default ({ apick }: { apick: Core.Apick }) => ({
  async log(action: string, entityUid: string, entityId: string, payload?: unknown) {
    return apick.documents('plugin::audit-log.audit-entry').create({
      data: {
        action,
        entityUid,
        entityId,
        payload: payload ?? null,
        performedBy: apick.requestContext.get()?.state?.auth?.credentials?.id ?? null,
        performedAt: new Date(),
      },
    });
  },
});
```

**Routes:**

```ts
// server/src/routes/index.ts
export default {
  'content-api': {
    type: 'content-api',
    routes: [
      {
        method: 'GET',
        path: '/audit-entries',
        handler: 'audit-entry.find',
        config: { policies: [] },
      },
      {
        method: 'GET',
        path: '/audit-entries/:id',
        handler: 'audit-entry.findOne',
      },
    ],
  },
  admin: {
    type: 'admin',
    routes: [
      {
        method: 'GET',
        path: '/audit-log/entries',
        handler: 'audit-entry.find',
        config: { policies: ['admin::isAuthenticatedAdmin'] },
      },
    ],
  },
};
```

**Policy:**

```ts
// server/src/policies/has-audit-access.ts
import type { Core } from '@apick/types';

export default (policyContext, config, { apick }: { apick: Core.Apick }) => {
  const user = policyContext.state?.auth?.credentials;
  if (!user) return false;
  return user.roles?.some((role) => role.code === 'super-admin') ?? false;
};
```

**Middleware:**

```ts
// server/src/middlewares/audit-header.ts
import type { Core } from '@apick/types';

export default (config: Record<string, unknown>, { apick }: { apick: Core.Apick }) => {
  return async (ctx, next) => {
    ctx.set('X-Audit-Plugin', 'active');
    await next();
  };
};
```

**Bootstrap (wiring event subscriptions):**

```ts
// server/src/bootstrap.ts
import type { Core } from '@apick/types';

export default async ({ apick }: { apick: Core.Apick }) => {
  const auditLogger = apick.service('plugin::audit-log.audit-logger');

  apick.eventHub.on('entry.create', async ({ result, params }) => {
    await auditLogger.log('create', result.document_id, params.data);
  });

  apick.eventHub.on('entry.update', async ({ result, params }) => {
    await auditLogger.log('update', result.document_id, params.data);
  });

  apick.eventHub.on('entry.delete', async ({ result, params }) => {
    await auditLogger.log('delete', result.document_id);
  });

  apick.eventHub.on('entry.publish', async ({ result, params }) => {
    await auditLogger.log('publish', result.document_id);
  });
};
```

**Entry point:**

```ts
// server/src/index.ts
import register from './register';
import bootstrap from './bootstrap';
import destroy from './destroy';
import config from './config';
import contentTypes from './content-types';
import controllers from './controllers';
import services from './services';
import routes from './routes';
import policies from './policies';
import middlewares from './middlewares';

export default {
  register,
  bootstrap,
  destroy,
  config,
  contentTypes,
  controllers,
  services,
  routes,
  policies,
  middlewares,
};
```

### Testing Plugins

#### Unit Tests

Test services and utilities in isolation:

```ts
// server/src/services/__tests__/audit-logger.test.ts
import { describe, it, expect, vi } from 'vitest';
import auditLoggerFactory from '../audit-logger';

describe('audit-logger service', () => {
  it('creates an audit entry with correct data', async () => {
    const mockCreate = vi.fn().mockResolvedValue({ documentId: 'new-123' });
    const mockApick = {
      documents: vi.fn().mockReturnValue({ create: mockCreate }),
      requestContext: { get: () => ({ state: { auth: { credentials: { id: 'user-1' } } } }) },
    };

    const logger = auditLoggerFactory({ apick: mockApick as any });
    await logger.log('create', 'api::article.article', 'doc-456', { title: 'Test' });

    expect(mockCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'create',
        entityUid: 'api::article.article',
        entityId: 'doc-456',
        performedBy: 'user-1',
      }),
    });
  });
});
```

#### Integration Tests

Test the full plugin with a running APICK instance:

```ts
// server/src/__tests__/plugin.integration.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createApick } from '@apick/core';
import type { Apick } from '@apick/types';

let apick: Apick;

beforeAll(async () => {
  apick = await createApick({
    database: { connection: { filename: ':memory:' } },
    plugins: {
      'audit-log': {
        enabled: true,
        resolve: './src/plugins/audit-log',
      },
    },
  });
  await apick.start();
});

afterAll(async () => {
  await apick.destroy();
});

describe('audit-log plugin', () => {
  it('records create events', async () => {
    await apick.documents('api::article.article').create({
      data: { title: 'Test Article', slug: 'test' },
    });

    await new Promise((resolve) => setTimeout(resolve, 100));

    const entries = await apick.documents('plugin::audit-log.audit-entry').findMany({
      filters: { action: { $eq: 'create' } },
    });

    expect(entries.length).toBeGreaterThan(0);
    expect(entries[0].entityUid).toBe('api::article.article');
  });
});
```

### Publishing to npm

1. Ensure the `package.json` has the correct `apick` metadata block
2. Set `main` to the compiled entry point (if publishing compiled JS) or source entry point
3. Configure `files` in `package.json` to include only necessary files
4. Publish:

```bash
cd src/plugins/audit-log
npm publish --access public
```

**Consumer installation:**

```bash
npm install apick-plugin-audit-log
```

```ts
// config/plugins.ts -- no `resolve` needed for npm packages
export default () => ({
  'audit-log': {
    enabled: true,
    config: { /* plugin-specific config */ },
  },
});
```

---

## Provider System

Domain-based provider registry that decouples service interfaces from their implementations.

```mermaid
flowchart LR
    S[Service layer] -->|getProvider| R[ProviderRegistry]
    R -->|domain: upload| UP[R2 / S3 / Local / Cloudinary]
    R -->|domain: email| EP[Resend / SendGrid / SMTP / SES]
    R -->|domain: ai| AP[Anthropic / OpenAI / Google / Ollama]
    R -->|domain: custom| CP[Your Provider]
```

### ProviderRegistry API

Created via `createProviderRegistry()`.

| Method | Description |
|---|---|
| `registerDomain(name, { required?, optional? })` | Declares a domain (e.g. `'upload'`) with required method names for validation. |
| `setProvider(domain, definition, options?)` | Assigns a `ProviderDefinition` to a domain. Throws if domain not registered. |
| `getProvider<T>(domain)` | Returns the initialized provider instance. |
| `initAll()` | For each domain: runs `register()`, then `init(options)`, then validates required methods. |
| `bootstrapAll()` / `destroyAll()` | Lifecycle hooks. Destroy runs in reverse insertion order. |
| `hasDomain(name)` / `getDomains()` | Introspection. |

### ProviderDefinition Interface

```ts
import { defineProvider } from '@apick/core/providers';

const myProvider = defineProvider<MyInterface>({
  init(options) {
    // Return the provider instance (or Promise)
    return { upload(file) { /* ... */ } };
  },
  register(options) { /* optional: early setup */ },
  bootstrap(options) { /* optional: post-init */ },
  destroy(options)   { /* optional: teardown */ },
});
```

### Provider Lifecycle

```mermaid
flowchart LR
    A["register()"] --> B["init()"]
    B --> C["Validate required methods"]
    C --> D["bootstrap()"]
    D --> E["Running"]
    E -->|shutdown| F["destroy()"]
```

| Hook | Phase | DB Available | Purpose |
|------|-------|-------------|---------|
| `register` | register | No | Validate config, extend registries |
| `init` | Between register and bootstrap | No | Create provider instance, return implementation |
| `bootstrap` | bootstrap | Yes | Connectivity checks, post-DB setup |
| `destroy` | destroy | Yes | Close connections, flush buffers |

### Built-in Domain Interfaces

| Domain | Interface | Required methods | Optional methods |
|---|---|---|---|
| `upload` | `UploadProviderInterface` | `upload`, `delete` | `uploadStream`, `checkFileSize`, `isPrivate`, `getSignedUrl` |
| `email` | `EmailProviderInterface` | `send` | -- |

### Built-in Upload Providers

| Provider | Package | Storage |
|----------|---------|---------|
| Local filesystem | `@apick/provider-upload-local` | Serves from `public/uploads/` |
| AWS S3 | `@apick/provider-upload-s3` | S3-compatible object storage |
| Cloudinary | `@apick/provider-upload-cloudinary` | Cloudinary media CDN |
| Cloudflare R2 | `@apick/provider-upload-r2` | R2 via S3-compatible API with AWS SigV4 signing |

### Built-in Email Providers

| Provider | Package | Transport |
|----------|---------|-----------|
| Sendmail | `@apick/provider-email-sendmail` | Local sendmail binary |
| Resend | `@apick/provider-email-resend` | Resend REST API (zero SDK) |
| SendGrid | `@apick/provider-email-sendgrid` | SendGrid API |
| Mailgun | `@apick/provider-email-mailgun` | Mailgun API |
| AWS SES | `@apick/provider-email-ses` | AWS Simple Email Service |
| Nodemailer | `@apick/provider-email-nodemailer` | SMTP via Nodemailer |

### Provider Configuration

Configure providers in `config/plugins.ts` under the parent plugin:

```ts
// config/plugins.ts
export default ({ env }) => ({
  // Upload provider
  upload: {
    config: {
      provider: '@apick/provider-upload-s3',
      providerOptions: {
        accessKeyId: env('AWS_ACCESS_KEY_ID'),
        secretAccessKey: env('AWS_SECRET_ACCESS_KEY'),
        region: env('AWS_REGION', 'us-east-1'),
        params: { Bucket: env('AWS_S3_BUCKET'), ACL: 'public-read' },
      },
      sizeLimit: 10 * 1024 * 1024, // 10 MB
    },
  },

  // Email provider
  email: {
    config: {
      provider: '@apick/provider-email-sendgrid',
      providerOptions: {
        apiKey: env('SENDGRID_API_KEY'),
      },
      settings: {
        defaultFrom: 'noreply@example.com',
        defaultReplyTo: 'support@example.com',
      },
    },
  },

  // Custom domain provider
  ai: {
    enabled: true,
    config: {
      provider: '@apick/provider-ai-openai',
      providerOptions: {
        apiKey: env('OPENAI_API_KEY'),
        defaultModel: 'gpt-4o',
      },
    },
  },
});
```

#### Local Plugin Provider

For custom providers in `src/plugins/`:

```ts
upload: {
  config: {
    provider: 'provider-upload-gcs',
    resolve: './src/plugins/provider-upload-gcs',
    providerOptions: {
      projectId: env('GCP_PROJECT_ID'),
      bucket: env('GCS_BUCKET'),
      serviceAccountPath: env('GCS_SERVICE_ACCOUNT_PATH'),
    },
  },
},
```

### Provider Resolution Order

1. Check `resolve` path (local providers)
2. Check `node_modules` for the package name
3. Check built-in providers (`@apick/provider-*`)

### Building a Custom Upload Provider

```ts
// src/plugins/provider-upload-gcs/server/src/index.ts
import { defineProvider } from '@apick/utils';
import { Storage } from '@google-cloud/storage';

export default defineProvider({
  init(providerOptions) {
    const storage = new Storage({
      projectId: providerOptions.projectId,
      keyFilename: providerOptions.serviceAccountPath,
    });
    const bucket = storage.bucket(providerOptions.bucket);

    return {
      async upload(file) {
        const path = `${file.hash}${file.ext}`;
        const blob = bucket.file(path);
        await blob.save(file.buffer, {
          contentType: file.mime,
          metadata: { cacheControl: 'public, max-age=31536000' },
        });
        file.url = `https://storage.googleapis.com/${providerOptions.bucket}/${path}`;
      },

      async uploadStream(file) {
        const path = `${file.hash}${file.ext}`;
        const blob = bucket.file(path);
        const writeStream = blob.createWriteStream({ contentType: file.mime });
        await new Promise<void>((resolve, reject) => {
          file.stream.pipe(writeStream).on('finish', resolve).on('error', reject);
        });
        file.url = `https://storage.googleapis.com/${providerOptions.bucket}/${path}`;
      },

      async delete(file) {
        const path = `${file.hash}${file.ext}`;
        await bucket.file(path).delete({ ignoreNotFound: true });
      },

      isPrivate() {
        return providerOptions.private ?? false;
      },

      async getSignedUrl(file, options = {}) {
        const path = `${file.hash}${file.ext}`;
        const [url] = await bucket.file(path).getSignedUrl({
          action: 'read',
          expires: Date.now() + (options.expires ?? 15 * 60) * 1000,
        });
        return { url };
      },
    };
  },
});
```

### Building a Custom Email Provider

```ts
// src/plugins/provider-email-postmark/server/src/index.ts
import { defineProvider } from '@apick/utils';
import { ServerClient } from 'postmark';

export default defineProvider({
  init(providerOptions) {
    const client = new ServerClient(providerOptions.apiToken);

    return {
      async send(options) {
        await client.sendEmail({
          From: options.from || providerOptions.defaultFrom,
          To: Array.isArray(options.to) ? options.to.join(',') : options.to,
          Subject: options.subject,
          TextBody: options.text,
          HtmlBody: options.html,
          ReplyTo: options.replyTo,
        });
      },
    };
  },
});
```

### Registering a Custom Provider Domain

A plugin registers a domain in its `register()` phase:

```ts
// In plugin register()
apick.provider.registerDomain('ai', {
  required: ['generateText', 'embed'],        // Provider MUST implement these
  optional: ['generateObject', 'streamText'], // Provider MAY implement these
});
```

The registry validates at bootstrap that the configured provider satisfies all `required` methods. Missing required methods throw an error.

#### Accessing a Provider

```ts
const aiProvider = apick.provider('ai');
const result = await aiProvider.generateText({ prompt: '...' });

const emailProvider = apick.provider('email');
await emailProvider.send({ to: '...', subject: '...', text: '...', html: '...' });
```

#### Domain Registry API

| Method | Description |
|--------|-------------|
| `apick.provider.registerDomain(name, schema)` | Register a new provider domain with required/optional method signatures |
| `apick.provider(name)` | Get the active provider instance for a domain |
| `apick.provider.hasDomain(name)` | Check if a domain is registered |
| `apick.provider.domains()` | List all registered domain names |

#### Naming Convention

| Domain | Provider Package Pattern | Example |
|--------|--------------------------|---------|
| `upload` | `@apick/provider-upload-*` | `@apick/provider-upload-s3` |
| `email` | `@apick/provider-email-*` | `@apick/provider-email-sendgrid` |
| `ai` | `@apick/provider-ai-*` | `@apick/provider-ai-openai` |
| Custom | `@apick/provider-{domain}-*` | `@apick/provider-search-algolia` |

### Testing Providers

```ts
import { describe, it, expect } from 'vitest';
import providerFactory from '../server/src/index';

describe('GCS upload provider', () => {
  const provider = providerFactory.init({
    projectId: 'test-project',
    bucket: 'test-bucket',
    serviceAccountPath: '/path/to/key.json',
  });

  it('sets file.url after upload', async () => {
    const file = {
      hash: 'abc123',
      ext: '.png',
      mime: 'image/png',
      buffer: Buffer.from('fake-image-data'),
      url: '',
    };

    await provider.upload(file as any);

    expect(file.url).toContain('storage.googleapis.com');
    expect(file.url).toContain('abc123.png');
  });
});
```

---

## Email

### EmailService

Created via `createEmailService(config?)`.

| Method | Signature | Notes |
|---|---|---|
| `send` | `(options: EmailOptions) => Promise<EmailSendResult>` | Validates all addresses, applies defaults, delegates to provider. Returns `{ accepted, rejected }`. |
| `sendTestEmail` | `(to: string) => Promise<EmailSendResult>` | Sends a canned test email to verify provider config. |
| `sendTemplatedEmail` | `(recipient, template, data) => Promise<void>` | Lodash template syntax for dynamic content. |
| `setProvider` | `(provider: EmailProvider) => void` | Hot-swap the email provider at runtime. |
| `getProviderName` | `() => string` | Returns current provider name string. |

### EmailOptions

| Field | Type | Required |
|---|---|---|
| `to` | `string \| string[]` | Yes |
| `subject` | `string` | Yes |
| `text` | `string` | One of text/html required |
| `html` | `string` | One of text/html required |
| `from` | `string` | No (falls back to `defaultFrom`) |
| `cc`, `bcc` | `string \| string[]` | No |
| `replyTo` | `string` | No |

Validation: all addresses checked against `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`. Throws on invalid.

### Configuration

```ts
// config/plugins.ts
export default ({ env }) => ({
  email: {
    config: {
      provider: 'sendgrid',
      providerOptions: {
        apiKey: env('SENDGRID_API_KEY'),
      },
      settings: {
        defaultFrom: 'noreply@example.com',
        defaultReplyTo: 'support@example.com',
      },
    },
  },
});
```

### Provider Configuration Examples

**SendGrid:**

```ts
provider: 'sendgrid',
providerOptions: {
  apiKey: process.env.SENDGRID_API_KEY,
},
```

**Mailgun:**

```ts
provider: 'mailgun',
providerOptions: {
  apiKey: process.env.MAILGUN_API_KEY,
  domain: process.env.MAILGUN_DOMAIN,
  host: 'api.eu.mailgun.net', // optional, for EU region
},
```

**Amazon SES:**

```ts
provider: 'amazon-ses',
providerOptions: {
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
  region: process.env.AWS_SES_REGION,
},
```

**Nodemailer (SMTP):**

```ts
provider: 'nodemailer',
providerOptions: {
  host: 'smtp.example.com',
  port: 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
},
```

### Default Provider Auto-Detection

If `process.env.RESEND_API_KEY` is set at service creation time, the default provider calls the Resend REST API directly (no SDK). Otherwise a no-op provider logs a single warning and drops emails silently.

### Resend Provider (`@apick/provider-email-resend`)

```ts
import { createResendProvider } from '@apick/provider-email-resend';

const resend = createResendProvider({
  apiKey: process.env.RESEND_API_KEY!,
  defaultFrom: 'App <noreply@example.com>',  // optional
});
emailService.setProvider(resend);
```

Uses `fetch` directly against `https://api.resend.com/emails`. No SDK dependency.

### Sending Emails

**Basic send:**

```ts
await apick.plugin('email').service('email').send({
  to: 'user@example.com',
  from: 'noreply@example.com',
  subject: 'Welcome to APICK',
  text: 'Your account has been created.',
  html: '<p>Your account has been <strong>created</strong>.</p>',
});
```

**Templated send (lodash template syntax):**

```ts
await apick.plugin('email').service('email').sendTemplatedEmail(
  { to: 'user@example.com' },
  {
    subject: 'Welcome, <%= user.username %>!',
    text: `Hello <%= user.username %>,\n\nYour account was created on <%= createdAt %>.`,
    html: `<h1>Hello <%= user.username %></h1>
<p>Your account was created on <strong><%= createdAt %></strong>.</p>`,
  },
  {
    user: { username: 'johndoe' },
    createdAt: '2026-03-01',
  },
);
```

#### Template Syntax

| Syntax | Description | Example |
|--------|-------------|---------|
| `<%= value %>` | Interpolate (escaped) | `<%= user.name %>` -> `John` |
| `<%- value %>` | Interpolate (raw HTML) | `<%- htmlContent %>` |
| `<% code %>` | Execute JavaScript | `<% if (user) { %> ... <% } %>` |

### Custom Email Provider

Implement `EmailProvider`:

```ts
const myProvider: EmailProvider = {
  async send(options) {
    // options: { to, from, cc, bcc, replyTo, subject, text, html }
    await myTransport.send(options);
    // Throw on failure -- the service catches and marks recipients as rejected.
  },
};
emailService.setProvider(myProvider);
```

---

## Upload / Media

### Architecture

```mermaid
flowchart TB
    Client -->|"POST /api/upload"| UploadController
    UploadController --> Validate["Validate size & MIME"]
    Validate --> Optimize["Optimize images (sharp)"]
    Optimize --> Thumbnails["Generate thumbnails & responsive formats"]
    Thumbnails --> Provider["Upload to Provider"]
    Provider --> DB["Save metadata to DB"]

    subgraph Providers
        Local["Local filesystem"]
        S3["AWS S3"]
        R2["Cloudflare R2"]
        Cloudinary["Cloudinary"]
    end

    Provider --> Local
    Provider --> S3
    Provider --> R2
    Provider --> Cloudinary
```

### UploadService

Created via `createUploadService({ rawDb, provider? })`. Manages `upload_files` and `upload_folders` tables (SQLite, auto-created).

| Method | Notes |
|---|---|
| `create(data)` | Generates MD5 hash, delegates to provider's `upload()`, inserts DB row. Returns `MediaFile`. |
| `deleteById(id)` | Calls provider's `delete()`, removes DB row. |
| `findAll({ page, pageSize, folderId })` | Paginated query with optional folder filter. Returns `{ results, pagination }`. |
| `findOne(id)` / `updateById(id, data)` / `count()` | Standard CRUD. |
| `findAllFolders()` / `createFolder({ name, parentId })` / `deleteFolder(id)` | Folder tree management with hierarchical path IDs. |
| `setProvider(provider)` | Hot-swap storage backend at runtime. |

Default provider: local, returns `/uploads/<hash><ext>` URLs, no-op delete.

### Upload Configuration

```ts
// config/plugins.ts
export default {
  upload: {
    config: {
      provider: 'local',  // 'local' | 'aws-s3' | 'cloudinary' | 'r2'
      providerOptions: {
        localServer: { maxage: 300000 },
      },
      sizeLimit: 10 * 1024 * 1024, // 10 MB
      breakpoints: {
        xlarge: 1920,
        large: 1000,
        medium: 750,
        small: 500,
      },
    },
  },
};
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `provider` | `string` | `'local'` | Storage provider |
| `providerOptions` | `object` | `{}` | Provider-specific configuration |
| `sizeLimit` | `number` | `209715200` (200 MB) | Max file size in bytes |
| `breakpoints` | `object` | `{ large, medium, small }` | Responsive image widths in pixels |

### Upload Pipeline

```mermaid
flowchart LR
    A["Receive file"] --> B{"Size OK?"}
    B -->|No| E["400 Error"]
    B -->|Yes| C{"MIME allowed?"}
    C -->|No| E
    C -->|Yes| D{"Is image?"}
    D -->|No| G["Upload to provider"]
    D -->|Yes| F["Optimize & generate formats"]
    F --> G
    G --> H["Save metadata to DB"]
    H --> I["Return file object"]
```

1. **Validate** -- check file size against `sizeLimit` and MIME type against allowed types.
2. **Optimize** (images only) -- compress the image using sharp.
3. **Generate thumbnails and responsive formats** -- create variants for each configured breakpoint where the original image is wider than the breakpoint.
4. **Upload to provider** -- send the original and all formats to the configured storage provider.
5. **Save metadata** -- persist file metadata and format information to the database.

### `MediaFile` Schema

| Field | Type | Description |
|---|---|---|
| `id` | `number` | Auto-increment primary key |
| `name`, `alternativeText`, `caption` | `string` | Descriptive metadata |
| `hash`, `ext`, `mime` | `string` | Unique hash, extension, MIME type |
| `size` | `number` | File size in KB |
| `width`, `height` | `number \| null` | Image dimensions (images only) |
| `url` | `string` | Public URL to the file |
| `formats` | `Record<string, any>` | Generated responsive formats (thumbnail, small, etc.) |
| `folderId` | `number \| null` | Folder the file belongs to |
| `folderPath` | `string` | Materialized path of the folder |
| `provider` | `string` | Provider that stores this file |
| `createdAt`, `updatedAt` | ISO 8601 string | Timestamps |

### REST API

**Upload files:**

```bash
POST /api/upload
Content-Type: multipart/form-data
Authorization: Bearer <jwt>

files: <binary>
fileInfo: {"name": "photo.jpg", "alternativeText": "A scenic photo", "caption": "Sunset"}
```

**Upload with relation to a content type:**

```bash
POST /api/upload
Content-Type: multipart/form-data

files: <binary>
ref: api::article.article
refId: abc123
field: cover
```

**List / Get / Update / Delete:**

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/upload/files` | List files (paginated: `?page=1&pageSize=25&sort=createdAt:desc`) |
| `GET` | `/api/upload/files/:id` | Get file by ID |
| `PUT` | `/api/upload/files/:id` | Update file metadata |
| `DELETE` | `/api/upload/files/:id` | Delete file from provider and DB |

### Folder Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/admin/upload/folders` | List folders |
| `POST` | `/admin/upload/folders` | Create a folder |
| `PUT` | `/admin/upload/folders/:id` | Update a folder |
| `DELETE` | `/admin/upload/folders/:id` | Delete a folder |

Folders use a materialized path pattern (e.g., `/marketing/blog/2026/`) for efficient tree queries.

### Programmatic Upload

```ts
const uploadService = apick.plugin('upload').service('upload');

const files = await uploadService.upload({
  data: {
    fileInfo: {
      name: 'report.pdf',
      alternativeText: 'Q1 Report',
    },
  },
  files: {
    path: '/tmp/report.pdf',
    name: 'report.pdf',
    type: 'application/pdf',
    size: 102400,
  },
});
```

### File Signing (Private Providers)

When using private storage providers (e.g., private S3 buckets), file URLs are not publicly accessible. APICK supports signed URLs transparently through the provider's `isPrivate()` and `getSignedUrl()` methods.

### R2 Provider (`@apick/provider-upload-r2`)

Cloudflare R2 via S3-compatible API with AWS Signature V4 signing. Zero SDK dependencies.

```ts
import { createR2Provider } from '@apick/provider-upload-r2';

const r2 = createR2Provider({
  accountId:       process.env.R2_ACCOUNT_ID!,
  accessKeyId:     process.env.R2_ACCESS_KEY_ID!,
  secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  bucketName:      process.env.R2_BUCKET_NAME!,
  publicUrl:       'https://cdn.example.com',  // optional
});
uploadService.setProvider(r2);
```

| Config | Required | Default |
|---|---|---|
| `accountId` | Yes | -- |
| `accessKeyId` | Yes | -- |
| `secretAccessKey` | Yes | -- |
| `bucketName` | Yes | -- |
| `publicUrl` | No | `https://<accountId>.r2.cloudflarestorage.com/<bucket>/<key>` |

### Custom Upload Provider

Implement `UploadProvider`:

```ts
const myStorage: UploadProvider = {
  async upload(file) {
    // file: { name, hash, ext, mime, buffer, size }
    const key = `${file.hash}${file.ext}`;
    await myBucket.put(key, file.buffer, { contentType: file.mime });
    return { url: `https://cdn.example.com/${key}` };
  },
  async delete(file) {
    // file: { hash, ext, url }
    await myBucket.delete(`${file.hash}${file.ext}`);
  },
};
uploadService.setProvider(myStorage);
```

---

## Webhooks

### Architecture

```mermaid
flowchart LR
    subgraph APICK
        Action["Content Action"] --> EventHub["Event Hub"]
        EventHub --> WebhookRunner["Webhook Runner"]
        WebhookRunner --> Queue["Worker Queue<br/>concurrency: 5"]
    end

    Queue -->|"POST + HMAC"| ExtA["Build System"]
    Queue -->|"POST + HMAC"| ExtB["Search Index"]
    Queue -->|"POST + HMAC"| ExtC["Notification Service"]
```

### WebhookService

Created via `createWebhookService({ rawDb, secret?, timeoutMs?, maxConcurrency?, fetcher? })`. Stores webhooks in a `webhooks` SQLite table (auto-created).

| Method | Signature |
|---|---|
| `create` | `({ name, url, events, headers?, enabled? }) => Webhook` |
| `findAll` / `findOne` / `updateById` / `deleteById` | Standard CRUD |
| `trigger` | `(event, payload) => Promise<WebhookDelivery[]>` |
| `getAvailableEvents` | `() => string[]` |
| `setSecret` | `(secret) => void` |
| `setFetcher` | `(fn) => void` -- injectable fetch for testing |

### Available Events

| Category | Events |
|---|---|
| Entry | `entry.create`, `entry.update`, `entry.delete`, `entry.publish`, `entry.unpublish`, `entry.draft-discard` |
| Media | `media.create`, `media.update`, `media.delete` |
| Workflows | `review-workflows.stageChange` |

### Webhook Properties

| Property | Type | Description |
|----------|------|-------------|
| `name` | `string` | Display name for the webhook |
| `url` | `string` | Target URL (must be HTTPS in production) |
| `headers` | `object` | Custom headers sent with each request |
| `events` | `string[]` | Events that trigger this webhook |
| `isEnabled` | `boolean` | Whether the webhook is active |

### Delivery Mechanics

```mermaid
flowchart TD
    A["Event fires"] --> B["Filter enabled webhooks<br/>matching event"]
    B --> C["Serialize payload as JSON"]
    C --> D["Sign body:<br/>X-Apick-Signature = HMAC-SHA256(body, secret)"]
    D --> E["POST with timeout (10s)<br/>+ AbortController"]
    E --> F{"Status 2xx?"}
    F -->|Yes| G["success: true"]
    F -->|No| H["success: false<br/>error logged"]
```

1. `trigger(event, payload)` filters enabled webhooks whose `events` array includes the fired event.
2. Payload is JSON-serialized as `WebhookPayload`: `{ event, createdAt, model?, uid?, entry? }`.
3. Signature: `X-Apick-Signature` header = `HMAC-SHA256(body, secret)`. Event name in `X-Apick-Event`.
4. Delivery uses `POST` with configurable timeout (`timeoutMs`, default 10s) and `AbortController`.
5. Concurrent deliveries capped at `maxConcurrency` (default 5), processed in batches via `Promise.allSettled`.
6. Secret auto-generated (`randomBytes(32).hex()`) if not provided; overridable via `setSecret()`.

### Execution Behavior

| Parameter | Value | Description |
|-----------|-------|-------------|
| Timeout | 10s | Request aborted after 10 seconds |
| Concurrency | 5 | Max 5 webhook requests in parallel |
| Retry | None | Failed requests are not retried |
| Method | POST | Always HTTP POST |

### Request Format

```
POST https://hooks.example.com/apick
Content-Type: application/json
X-Apick-Event: entry.publish
X-Apick-Signature: <hmac-sha256-hex>
Authorization: Bearer <custom-header-value>

{
  "event": "entry.publish",
  "createdAt": "2026-03-02T14:30:00.000Z",
  "model": "article",
  "uid": "api::article.article",
  "entry": {
    "id": 1,
    "documentId": "abc123",
    "title": "Getting Started with APICK",
    "publishedAt": "2026-03-02T14:30:00.000Z",
    "locale": "en"
  }
}
```

### WebhookDelivery Result

```ts
{
  webhookId: number;
  event: string;
  url: string;
  statusCode: number | null;  // null on network error
  duration: number;            // ms
  success: boolean;            // 2xx = true
  error?: string;
  createdAt: string;
}
```

### Management API

All webhook management endpoints require admin authentication.

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/admin/webhooks` | List all webhooks |
| `POST` | `/admin/webhooks` | Create a webhook |
| `GET` | `/admin/webhooks/:id` | Get webhook by ID |
| `PUT` | `/admin/webhooks/:id` | Update a webhook |
| `DELETE` | `/admin/webhooks/:id` | Delete a webhook |

**Create example:**

```bash
POST /admin/webhooks
Content-Type: application/json
Authorization: Bearer <admin-jwt>

{
  "name": "Trigger Rebuild",
  "url": "https://hooks.example.com/rebuild",
  "headers": {
    "Authorization": "Bearer rebuild-secret-token"
  },
  "events": [
    "entry.create",
    "entry.update",
    "entry.publish",
    "entry.unpublish",
    "entry.delete"
  ],
  "isEnabled": true
}
```

### Verifying Signatures (consumer side)

```ts
import { createHmac } from 'node:crypto';

function verify(body: string, signature: string, secret: string): boolean {
  const expected = createHmac('sha256', secret).update(body).digest('hex');
  return expected === signature;
}

// In your handler:
const sig = req.headers['x-apick-signature'];
if (!verify(rawBody, sig, SHARED_SECRET)) throw new Error('Invalid signature');
```

---

## Cron Jobs

### Enabling Cron

Cron must be explicitly enabled in the server configuration:

```ts
// config/server.ts
export default {
  host: '0.0.0.0',
  port: 1337,
  cron: {
    enabled: true,
  },
};
```

When `cron.enabled` is `false` (the default), no scheduled tasks will run, even if they are defined.

### CronService

Created via `createCronService({ enabled? })`. In-process scheduler, no external dependencies.

| Method | Description |
|---|---|
| `add(jobs)` | Register jobs. Keys are names (or cron expressions in simple format). |
| `remove(name)` | Unregister and cancel a job's pending timer. |
| `start()` | Begin scheduling. No-op if `enabled: false`. |
| `stop()` | Cancel all pending timers. Jobs preserved. |
| `destroy()` | Stop + clear all jobs. |
| `getJobs()` | Returns `CronJobEntry[]` with `name, rule, running, lastRun, nextRun, timerId`. |
| `isRunning()` | Whether the scheduler is started. |

### Cron Expressions

Standard 5-field format: `minute hour day-of-month month day-of-week`.

```
 minute (0-59)
  hour (0-23)
   day of month (1-31)
    month (1-12)
     day of week (0-7, 0 and 7 = Sunday)

* * * * *
```

| Token | Example | Meaning |
|---|---|---|
| `*` | `* * * * *` | Every minute |
| `,` | `0,30 * * * *` | Minute 0 and 30 |
| `-` | `0-15 * * * *` | Minutes 0 through 15 |
| `/` | `*/5 * * * *` | Every 5 minutes |
| Combined | `0-30/10 9-17 * * 1-5` | Minutes 0,10,20,30 during hours 9-17, weekdays |

### Common Expressions

| Expression | Schedule |
|------------|----------|
| `* * * * *` | Every minute |
| `*/5 * * * *` | Every 5 minutes |
| `0 * * * *` | Every hour (at minute 0) |
| `0 0 * * *` | Daily at midnight |
| `0 8 * * 1-5` | Weekdays at 8:00 AM |
| `0 0 1 * *` | First day of every month at midnight |
| `0 0 * * 0` | Every Sunday at midnight |
| `30 2 * * *` | Daily at 2:30 AM |

### Defining Static Cron Jobs

```ts
// config/cron-tasks.ts
export default {
  // Simple: cron expression as key, handler as value
  '0 0 * * *': async ({ apick }) => {
    apick.log.info('Running daily cleanup at midnight');
    await apick.documents('api::log.log').deleteMany({
      filters: {
        createdAt: { $lt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
      },
    });
  },

  // Named task with options
  myDailyDigest: {
    task: async ({ apick }) => {
      const articles = await apick.documents('api::article.article').findMany({
        filters: { publishedAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
      });
      await apick.plugin('email').service('email').send({
        to: 'editors@example.com',
        subject: `Daily Digest: ${articles.length} new articles`,
        text: articles.map((a) => `- ${a.title}`).join('\n'),
      });
    },
    options: {
      rule: '0 8 * * 1-5', // 8:00 AM, Monday through Friday
    },
  },
};
```

### Dynamic Cron Management

Add and remove cron jobs at runtime:

```ts
// In bootstrap or service code
apick.cron.add({
  syncExternalData: {
    task: async ({ apick }) => {
      apick.log.info('Syncing external data...');
      // fetch and sync logic
    },
    options: {
      rule: '0 */6 * * *', // every 6 hours
    },
  },
});

// Remove later
apick.cron.remove('syncExternalData');
```

**Example: Register dynamic cron in bootstrap:**

```ts
// src/index.ts
export default {
  bootstrap({ apick }) {
    apick.cron.add({
      healthCheck: {
        task: async ({ apick }) => {
          const start = Date.now();
          await apick.db.connection.raw('SELECT 1');
          apick.log.info(`DB health check: ${Date.now() - start}ms`);
        },
        options: {
          rule: '*/10 * * * *', // every 10 minutes
        },
      },
    });
  },
};
```

### Important Considerations

**In-process execution** -- Cron jobs run inside the APICK Node.js process. Long-running or CPU-intensive tasks will block the event loop. For heavy workloads, offload to the job queue or an external worker.

**Single instance** -- If you run multiple APICK instances (e.g., behind a load balancer), each instance runs its own cron scheduler independently. Use an external lock (e.g., database advisory lock) or designate one instance as the cron runner to prevent duplicate execution.

**No persistence** -- Dynamic cron jobs added via `apick.cron.add()` do not survive process restarts. Re-register them in the bootstrap lifecycle if needed.

**Error handling** -- Wrap task bodies in try/catch. Unhandled errors in cron tasks are logged but do not crash the process.

```ts
myTask: {
  task: async ({ apick }) => {
    try {
      await riskyOperation();
    } catch (error) {
      apick.log.error('Cron task failed:', error);
    }
  },
  options: { rule: '0 * * * *' },
},
```

### Internal Usage: Content Releases

The Content Releases feature uses cron jobs internally for scheduled publishing:

```mermaid
sequenceDiagram
    participant Admin
    participant ReleaseService
    participant CronService

    Admin->>ReleaseService: Schedule release for 2026-03-15T09:00:00Z
    ReleaseService->>CronService: add({ release_3: { rule: Date, task: publish } })
    Note over CronService: Waiting...
    CronService->>ReleaseService: Fire at 2026-03-15T09:00:00Z
    ReleaseService->>ReleaseService: publish(releaseId: 3)
```

---

## Event Hub

APICK's event hub provides a two-level event system for decoupling business logic from side effects.

### Two Listener Types

| Type | Receives | Use Case |
|------|----------|----------|
| **Subscriber** | All events | Audit logging, analytics, debugging |
| **Listener** | Specific named events | React to specific changes |

All handlers execute **sequentially** (not in parallel). A slow handler blocks subsequent handlers for the same event.

### API

```ts
const hub = apick.eventHub;
```

| Method | Description |
|--------|-------------|
| `hub.emit(event, data?)` | Emit an event to all subscribers and matching listeners |
| `hub.on(event, handler)` | Add a listener for a specific event. Returns `unsubscribe` function |
| `hub.once(event, handler)` | Add a one-time listener. Auto-removed after first call |
| `hub.off(event, handler)` | Remove a specific listener |
| `hub.subscribe(handler)` | Add a subscriber (receives all events). Returns `unsubscribe` function |
| `hub.removeAllListeners()` | Remove all named event listeners |
| `hub.removeAllSubscribers()` | Remove all subscribers |
| `hub.destroy()` | Remove everything. Called during `apick.destroy()` |

### Event Flow

```mermaid
flowchart TD
    A["apick.eventHub.emit('entry.create', data)"]
    A --> B["Subscribers<br/>(receive ALL events)"]
    A --> C["Listeners<br/>(only 'entry.create')"]
    B --> B1["subscriber1(event, data)"]
    B1 --> B2["subscriber2(event, data)"]
    C --> C1["listener1(data)"]
    C1 --> C2["listener2(data)"]
    B2 --> D["Emission complete"]
    C2 --> D
```

**Execution order:**
1. All subscribers run first, sequentially in registration order
2. All matching listeners run next, sequentially in registration order
3. Emission completes after all handlers finish (including async handlers that are awaited)

### Built-In Events

#### Entry Events

| Event | Payload | When |
|-------|---------|------|
| `entry.create` | `{ result, params }` | After creating an entry |
| `entry.update` | `{ result, params, previousEntry }` | After updating an entry |
| `entry.delete` | `{ result, params }` | After deleting an entry |
| `entry.publish` | `{ result, params }` | After publishing a draft |
| `entry.unpublish` | `{ result, params }` | After unpublishing to draft |
| `entry.draft-discard` | `{ result, params }` | After discarding draft changes |

#### Media Events

| Event | Payload | When |
|-------|---------|------|
| `media.create` | `{ result }` | After file uploaded |
| `media.update` | `{ result }` | After file metadata updated |
| `media.delete` | `{ result }` | After file deleted |

#### Content Type Events

| Event | Payload | When |
|-------|---------|------|
| `content-types.beforeSync` | `{ contentTypes }` | Before applying schema changes to DB |
| `content-types.afterSync` | `{ contentTypes }` | After schema changes applied |

#### Review Workflow Events

| Event | Payload | When |
|-------|---------|------|
| `review-workflows.stageChange` | `{ uid, entity, from, to }` | Entry moved between stages |

#### User Events

| Event | Payload | When |
|-------|---------|------|
| `user.create` | `{ result }` | Admin or API user created |
| `user.update` | `{ result }` | User updated |
| `user.delete` | `{ result }` | User deleted |
| `admin.auth.success` | `{ user }` | Successful admin login |
| `admin.auth.failure` | `{ error }` | Failed admin login |

### Usage Examples

**Audit logging (subscriber):**

```ts
apick.eventHub.subscribe((event, data) => {
  apick.log.info({
    event,
    entityId: data?.result?.id,
    documentId: data?.result?.document_id,
    timestamp: new Date().toISOString(),
  }, 'audit');
});
```

**External sync (listener):**

```ts
apick.eventHub.on('entry.publish', async (data) => {
  // data is { result, params }
  await searchClient.index('articles').addDocuments([{
    id: data.result.id,
    title: data.result.title,
    content: data.result.content,
    published_at: data.result.published_at,
  }]);
});

apick.eventHub.on('entry.unpublish', async (data) => {
  await searchClient.index('articles').deleteDocument(data.result.id);
});
```

**Cache invalidation:**

```ts
apick.eventHub.on('entry.update', async (data) => {
  // data is { result, params, previousEntry }
  await cache.invalidate(`entry:${data.result.id}`);
  await cache.invalidate(`entry:list`);
});
```

**One-time setup:**

```ts
apick.eventHub.once('content-types.afterSync', async () => {
  apick.log.info('Schema sync completed, running one-time migration');
  await runDataMigration();
});
```

**Unsubscribing:**

```ts
const unsubscribe = apick.eventHub.on('entry.create', handler);
unsubscribe(); // later

// Or using off() with the same handler reference
apick.eventHub.off('entry.create', handler);
```

### Custom Events

You can emit and listen for custom events. There is no registration step.

```ts
await apick.eventHub.emit('custom.article.featured', {
  articleId: article.id,
  featuredAt: new Date(),
});

apick.eventHub.on('custom.article.featured', async (data) => {
  await notifySubscribers(data.articleId);
});
```

**Naming convention:** Prefix custom events with `custom.` to avoid collisions with built-in events.

### Sequential Execution

Handlers execute **sequentially**, not in parallel. This is deliberate:

- Predictable ordering guarantees (handler A always completes before handler B)
- Prevents race conditions between handlers that modify the same data
- Easier debugging -- stack traces show the exact handler that failed
- Errors are caught and logged per-handler (fail-safe) -- a failing handler does not prevent subsequent handlers from running

**If you need parallel execution**, handle it inside a single handler:

```ts
apick.eventHub.on('entry.create', async (data) => {
  await Promise.all([
    sendNotification(data),
    updateSearchIndex(data),
  ]);
});
```

### Error Handling in Events

If a handler throws, the error is logged but does **not** propagate to the caller of `emit()`. The remaining handlers for that event still execute. This prevents side-effect failures (e.g., search indexing) from breaking primary operations (e.g., content creation).

---

## Background Job Queue

The built-in job queue handles async processing. AI inference, webhook delivery, data transfer, email dispatch, content enrichment -- anything that takes more than a few hundred milliseconds belongs in the queue, not in a request handler.

Access it via `apick.queue`.

### Architecture

```mermaid
graph LR
    Controller --> Dispatch["apick.queue.dispatch()"]
    Lifecycle["Lifecycle Hook"] --> Dispatch
    Plugin --> Dispatch
    Dispatch --> Q["Job Queue"]
    Q --> W1["Worker 1"]
    Q --> W2["Worker 2"]
    Q --> W3["Worker N"]
    W1 --> Handler["Registered Handler"]
    W2 --> Handler
    W3 --> Handler
    Failed["Failed Jobs"] --> DLQ["Dead Letter Queue"]

    style Q fill:#2563eb,color:#fff
```

| Concept | Description |
|---------|-------------|
| **Job** | A unit of work: a name, JSON payload, and execution options |
| **Handler** | An async function registered to process jobs of a given name |
| **Worker** | A concurrent processor that pulls jobs from the queue and runs handlers |
| **Dead Letter Queue** | Storage for permanently failed jobs (exhausted all retries) |

### Configuration

```ts
// config/server.ts
export default ({ env }) => ({
  queue: {
    driver: env('QUEUE_DRIVER', 'memory'),  // 'memory' | 'redis'
    redis: {
      url: env('REDIS_URL', 'redis://127.0.0.1:6379'),
    },
    defaultConcurrency: 5,
    defaultRetries: 3,
  },
});
```

#### Drivers

| Driver | Package | Use Case | Persistence |
|--------|---------|----------|-------------|
| `memory` | Built-in | Development, testing | None -- jobs lost on restart |
| `redis` | BullMQ | Production | Full -- survives restarts, supports distributed workers |

The in-memory driver uses a simple array with `setTimeout` for delays. The Redis driver uses BullMQ for reliable, persistent, distributed job processing.

### Registering Handlers

Register job handlers during the plugin `bootstrap()` phase:

```ts
apick.queue.register('email::send-welcome', async (job) => {
  const { to, userName } = job.data;
  await apick.service('plugin::email.email').send({
    to,
    subject: 'Welcome!',
    text: `Hello ${userName}, welcome aboard.`,
  });
});

apick.queue.register('webhook::deliver', async (job) => {
  const { url, payload, headers } = job.data;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(`Webhook failed: ${response.status}`);
});
```

#### Handler Options

```ts
apick.queue.register('data-transfer::export', handler, {
  concurrency: 2,        // Max concurrent jobs for this handler (default: from config)
  timeout: 300_000,      // Job timeout in ms (default: 30000)
});
```

### Dispatching Jobs

Dispatch jobs from anywhere -- controllers, services, lifecycle hooks, other job handlers.

```ts
// Basic dispatch
await apick.queue.dispatch('email::send-welcome', {
  to: 'user@example.com',
  userName: 'Alice',
});

// With options
const jobId = await apick.queue.dispatch('webhook::deliver', {
  url: 'https://hooks.example.com/content-updated',
  payload: { event: 'entry.update', data: { id: 42 } },
}, {
  delay: 5000,              // Wait 5s before processing
  retries: 5,               // Override default retries
  backoff: 'exponential',   // 'fixed' | 'exponential' (default: 'exponential')
  backoffDelay: 1000,       // Base delay between retries in ms (default: 1000)
  priority: 1,              // Lower = higher priority (default: 0)
});
```

#### Dispatch Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `delay` | `number` | `0` | Delay before first attempt (ms) |
| `retries` | `number` | Config default (3) | Max retry attempts on failure |
| `backoff` | `'fixed' \| 'exponential'` | `'exponential'` | Retry delay strategy |
| `backoffDelay` | `number` | `1000` | Base delay between retries (ms) |
| `priority` | `number` | `0` | Job priority (lower = higher priority) |

#### Backoff Behavior

| Strategy | Retry 1 | Retry 2 | Retry 3 | Retry 4 |
|----------|---------|---------|---------|---------|
| `fixed` | 1s | 1s | 1s | 1s |
| `exponential` | 1s | 2s | 4s | 8s |

### Job Status

```ts
const job = await apick.queue.getJob(jobId);
```

```ts
interface Job {
  id: string;
  name: string;
  data: Record<string, unknown>;
  status: 'pending' | 'delayed' | 'active' | 'completed' | 'failed' | 'dead';
  result?: unknown;          // Set by handler return value
  error?: string;            // Set on failure
  attempts: number;          // Current attempt count
  maxRetries: number;
  createdAt: Date;
  updatedAt: Date;
  processedAt?: Date;
  completedAt?: Date;
}
```

#### Status Lifecycle

```mermaid
stateDiagram-v2
    [*] --> pending
    pending --> delayed: delay > 0
    delayed --> pending: delay elapsed
    pending --> active: worker picks up
    active --> completed: handler succeeds
    active --> pending: handler fails, retries remaining
    active --> failed: handler fails, no retries left
    failed --> dead: moved to dead letter queue
```

### Queue Management

```ts
// Get queue stats
const stats = await apick.queue.getStats();
// { pending: 42, active: 3, completed: 1580, failed: 12, dead: 2 }

// Get stats for a specific job name
const emailStats = await apick.queue.getStats('email::send-welcome');

// Retry a failed job
await apick.queue.retryJob(jobId);

// Remove a job
await apick.queue.removeJob(jobId);

// Drain the queue (remove all pending jobs)
await apick.queue.drain();

// Pause/resume processing
await apick.queue.pause();
await apick.queue.resume();
```

### Practical Patterns

**From lifecycle hooks:**

```ts
apick.db.lifecycles.subscribe({
  afterCreate(event) {
    if (event.model.uid === 'api::article.article') {
      apick.queue.dispatch('webhook::deliver', {
        url: apick.config.get('webhooks.contentCreated'),
        payload: { event: 'article.created', documentId: event.result.documentId },
      });
    }
  },
});
```

**Job chaining:**

```ts
apick.queue.register('pipeline::step-1', async (job) => {
  const intermediate = await processStep1(job.data);
  await apick.queue.dispatch('pipeline::step-2', {
    ...job.data,
    step1Result: intermediate,
  });
  return intermediate;
});
```

**Bulk dispatch:**

```ts
const articles = await apick.db.query('api::article.article').findMany({
  where: { publishedAt: { $notNull: true } },
  select: ['documentId'],
});

for (const article of articles) {
  await apick.queue.dispatch('ai::compute-embedding', {
    uid: 'api::article.article',
    documentId: article.documentId,
  });
}
```

### Job Naming Convention

| Pattern | Examples |
|---------|----------|
| `ai::{action}` | `ai::compute-embedding`, `ai::enrich-content`, `ai::chunk-document` |
| `webhook::{action}` | `webhook::deliver`, `webhook::retry` |
| `email::{action}` | `email::send-welcome`, `email::send-digest` |
| `data-transfer::{action}` | `data-transfer::export`, `data-transfer::import` |
| `{api-name}::{action}` | `articles::generate-sitemap`, `orders::process-refund` |

---

## AI Providers

Four providers, all following the same `AIProvider` interface. Zero SDK dependencies -- all use `fetch` directly against vendor REST APIs.

| Package | Factory | Default Model | Embedding |
|---|---|---|---|
| `@apick/provider-ai-anthropic` | `createAnthropicProvider(config)` | `claude-3-haiku-20240307` | Not supported (throws) |
| `@apick/provider-ai-openai` | `createOpenAIProvider(config)` | `gpt-4o-mini` | `text-embedding-3-small` |
| `@apick/provider-ai-google` | `createGoogleProvider(config)` | -- | -- |
| `@apick/provider-ai-ollama` | `createOllamaProvider(config)` | -- | -- |

### AIProvider Interface

```ts
interface AIProvider {
  name: string;
  generateText(options: GenerateTextOptions): Promise<GenerateTextResult>;
  embed(options: EmbedOptions): Promise<EmbedResult>;
  generateObject?(options: GenerateObjectOptions): Promise<GenerateObjectResult>;
  streamText?(options: StreamTextOptions): AsyncIterable<StreamTextChunk>;
}
```

All providers return normalized `TokenUsage` (`promptTokens`, `completionTokens`, `totalTokens`) regardless of vendor format.

---

## Key Files

| File | Purpose |
|---|---|
| `packages/core/src/plugins/index.ts` | Plugin manager, topological sort, `definePlugin`, all plugin types |
| `packages/core/src/providers/index.ts` | Provider registry, `defineProvider`, domain interfaces (`UploadProviderInterface`, `EmailProviderInterface`) |
| `packages/email/src/services/email.ts` | `createEmailService`, default Resend auto-detection, validation |
| `packages/providers/email-resend/src/index.ts` | `createResendProvider` -- standalone Resend email provider |
| `packages/upload/src/services/upload.ts` | `createUploadService`, media/folder CRUD, SQLite schema |
| `packages/providers/upload-r2/src/index.ts` | `createR2Provider` -- Cloudflare R2 with AWS SigV4 signing |
| `packages/core/src/webhooks/index.ts` | `createWebhookService`, HMAC signing, batched delivery |
| `packages/core/src/cron/index.ts` | `createCronService`, 5-field cron parser, in-process scheduler |
| `packages/providers/ai-anthropic/src/index.ts` | `createAnthropicProvider` |
| `packages/providers/ai-openai/src/index.ts` | `createOpenAIProvider` |
| `packages/providers/ai-google/src/index.ts` | `createGoogleProvider` |
| `packages/providers/ai-ollama/src/index.ts` | `createOllamaProvider` |
