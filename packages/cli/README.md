# @apick/cli

Command-line interface for [APICK](https://github.com/vivmagarwal/apickjs) — a pure headless CMS built TypeScript-first.

## Install

```bash
npm install @apick/cli
```

## Commands

| Command | Description |
|---------|-------------|
| `apick develop` | Start development server with auto-reload and schema sync |
| `apick start` | Start production server (`NODE_ENV=production`) |
| `apick build` | Compile TypeScript for production |
| `apick migration:run` | Run pending database migrations |
| `apick migration:rollback` | Roll back the last migration batch |
| `apick migration:status` | Show migration status |
| `apick migration:generate <name>` | Generate a new migration file |
| `apick console` | Interactive REPL with `apick` object |
| `apick version` | Print APICK version |

## Usage

From within an APICK project:

```bash
npx apick develop
```

Or during development from the monorepo:

```bash
npx tsx packages/cli/src/bin.ts develop --dir examples/starter
```

## Related Packages

- [`@apick/core`](https://www.npmjs.com/package/@apick/core) -- Framework kernel (required)
- [`@apick/types`](https://www.npmjs.com/package/@apick/types) -- Shared TypeScript type definitions
- [`@apick/utils`](https://www.npmjs.com/package/@apick/utils) -- Error classes, env helpers, utilities

## License

[MIT](https://github.com/vivmagarwal/apickjs/blob/main/LICENSE)
