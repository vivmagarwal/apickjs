# @apick/cli

Command-line interface for [APICK](https://github.com/vivmagarwal/apickjs) — a pure headless CMS built TypeScript-first.

## Install

```bash
npm install @apick/cli
```

## Quick Start

```bash
npx apick new my-project
cd my-project
npm install
npx apick develop
```

## Commands (22)

### Project

| Command | Description |
|---------|-------------|
| `apick new [name]` | Create a new APICK project (interactive) |
| `apick develop` / `apick dev` | Start development server |
| `apick start` | Start production server (`NODE_ENV=production`) |
| `apick build` | Compile TypeScript for production |

### Generators

| Command | Description |
|---------|-------------|
| `apick generate:api` | Generate API (content type + controller + service + routes) |
| `apick generate:controller` | Generate a controller |
| `apick generate:service` | Generate a service |
| `apick generate:policy` | Generate a policy |
| `apick generate:middleware` | Generate a middleware |
| `apick generate:plugin` | Generate a full plugin scaffold |

### Introspection

| Command | Description |
|---------|-------------|
| `apick content-types:list` | List all registered content types |
| `apick routes:list` | List all registered routes |
| `apick policies:list` | List all registered policies |
| `apick middlewares:list` | List all registered middlewares |

### Type Generation

| Command | Description |
|---------|-------------|
| `apick ts:generate-types` | Generate TypeScript interfaces from content type schemas |

### Console

| Command | Description |
|---------|-------------|
| `apick console` | Interactive REPL with `apick` object |

### Data Transfer

| Command | Description |
|---------|-------------|
| `apick export` / `apick transfer:export` | Export data to tar.gz |
| `apick import` / `apick transfer:import` | Import data from tar.gz |

### Migrations

| Command | Description |
|---------|-------------|
| `apick migration:run` | Run pending database migrations |
| `apick migration:rollback` | Roll back the last migration batch |
| `apick migration:status` | Show migration status |
| `apick migration:generate` | Generate a new migration file |

## Documentation

- [User Guide](docs/user-guide.md) — Getting started, command reference, field types
- [Developer Guide](docs/developer-guide.md) — Architecture, adding commands, extending generators

## Related Packages

- [`@apick/core`](https://www.npmjs.com/package/@apick/core) — Framework kernel (required)
- [`@apick/generators`](https://www.npmjs.com/package/@apick/generators) — Code generators
- [`@apick/types`](https://www.npmjs.com/package/@apick/types) — Shared TypeScript type definitions
- [`@apick/utils`](https://www.npmjs.com/package/@apick/utils) — Error classes, env helpers, utilities

## License

[MIT](https://github.com/vivmagarwal/apickjs/blob/main/LICENSE)
