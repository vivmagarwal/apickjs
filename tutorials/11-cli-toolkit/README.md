# Tutorial 11: CLI Toolkit

> **Monorepo tutorial.** This tutorial runs within the [apickjs monorepo](https://github.com/vivmagarwal/apickjs). Clone the repo and `npm install` at the root first. For standalone npm projects, see the [Getting Started guide](../../docs/GETTING_STARTED.md).

Tutorials 01-10 cover everything you need to build, customize, and test a content API. This bonus tutorial shifts focus to **developer tooling** — the zero-dependency CLI framework that powers every `apick` command.

You will learn how APIck parses command-line arguments, how to build and register custom commands, and how to manage environment configuration — all without touching a database.

---

## What You Will Learn

- Parse command-line arguments with `parseArgs()`
- Create a CLI instance with `createCli()` and register commands
- Build custom commands with aliases, options, and typed context
- Manage environment configuration with dot-notation access, freeze, and `.env` parsing
- Explore the 15 built-in commands that ship with APIck

## Prerequisites

- Familiarity with Tutorial 01 (project structure, running tests)
- **No database needed** — this tutorial is pure TypeScript with no SQLite dependency

---

## Part 1: Argument Parsing with `parseArgs()`

Every CLI starts with argument parsing. APIck's `parseArgs()` takes a raw `argv` array (like `process.argv`) and returns a structured `ParsedArgs` object:

```typescript
interface ParsedArgs {
  command: string;              // the first non-flag argument
  positional: string[];         // remaining non-flag arguments
  flags: Record<string, string | boolean | number>;
}
```

### How it works

`parseArgs()` skips the first two elements of `argv` (the `node` binary and script path), then walks the remaining arguments:

- `--port 4000` or `--port=4000` → `flags.port = '4000'`
- `-H localhost` → `flags.H = 'localhost'`
- `--debug` (no following value) → `flags.debug = true`
- The first bare word becomes `command`; subsequent bare words become `positional`

### Example

```typescript
import { parseArgs } from '@apick/cli';

const result = parseArgs([
  'node', 'apick', 'develop',
  '--port', '4000',
  '-H', 'localhost',
  '--debug',
]);

result.command     // 'develop'
result.flags.port  // '4000'
result.flags.H     // 'localhost'
result.flags.debug // true
result.positional  // []
```

Positional arguments are useful for commands like `migration:generate`:

```typescript
const result = parseArgs([
  'node', 'apick', 'migration:generate',
  'add-users-table',
  '--name', 'create_users',
]);

result.command       // 'migration:generate'
result.positional    // ['add-users-table']
result.flags.name    // 'create_users'
```

---

## Part 2: Building a CLI with `createCli()`

`createCli()` returns a `Cli` instance with four methods:

| Method | Description |
|--------|-------------|
| `register(command)` | Add a command (with optional aliases) |
| `run(argv)` | Parse argv and execute the matching command |
| `getCommands()` | Return all registered commands |
| `getHelp()` | Generate formatted help text |

```typescript
import { createCli } from '@apick/cli';

const cli = createCli('1.0.0');

cli.register({
  name: 'greet',
  description: 'Say hello',
  action: (args, ctx) => {
    console.log(`Hello from APICK v${ctx.version}!`);
  },
});

await cli.run(process.argv);
```

### Built-in behaviors

The CLI handles two special cases automatically:

- **No command** or `--help` / `-h` → prints help text listing all registered commands
- `--version` / `-v` → prints `APICK v<version>`

### Action context

Every command action receives two arguments:

1. **`args: ParsedArgs`** — the parsed command, positional args, and flags
2. **`ctx: CliContext`** — runtime context with `cwd`, `version`, and the full `commands` map

```typescript
interface CliContext {
  cwd: string;                          // process.cwd()
  version: string;                      // version passed to createCli()
  commands: Map<string, CliCommand>;    // all registered commands
}
```

This lets commands introspect the CLI itself — useful for building meta-commands or plugin systems.

---

## Part 3: Custom CLI Commands

A `CliCommand` has this shape:

```typescript
interface CliCommand {
  name: string;
  description: string;
  aliases?: string[];
  options?: CliOption[];
  action: (args: ParsedArgs, context: CliContext) => void | Promise<void>;
}
```

### Example: a deploy command

```typescript
const deployCommand: CliCommand = {
  name: 'deploy',
  description: 'Deploy the app to a target environment',
  aliases: ['ship'],
  options: [
    { name: 'target', alias: 't', description: 'Deploy target', type: 'string', default: 'staging' },
  ],
  action: (args) => {
    const target = args.flags.target || args.flags.t || 'staging';
    console.log(`Deploying to ${target}...`);
  },
};

cli.register(deployCommand);
```

Now both `apick deploy --target production` and `apick ship --target production` execute the same action.

### Help output

Calling `cli.getHelp()` produces formatted output:

```
APICK CLI v1.0.0

Usage: apick <command> [options]

Commands:
  deploy                        Deploy the app to a target environment (ship)
  rollback                      Rollback last deploy

Run "apick <command> --help" for more information on a command.
```

Aliases are shown in parentheses next to the command name.

---

## Part 4: Environment Configuration

APIck's `createEnvConfig()` provides a lightweight config store with dot-notation paths, immutability via `freeze()`, and `.env` file parsing.

### Dot-notation access

```typescript
import { createEnvConfig } from '@apick/cli';

const cfg = createEnvConfig({
  server: { host: '0.0.0.0', port: 1337 },
  database: { client: 'sqlite' },
});

cfg.get('server.port');           // 1337
cfg.get('missing.key', 'default'); // 'default'
cfg.has('server.host');           // true
cfg.has('server.missing');        // false

cfg.set('server.port', 4000);
cfg.get('server.port');           // 4000

// Creates nested paths automatically
cfg.set('custom.nested.value', 'hello');
cfg.get('custom.nested.value');   // 'hello'
```

### Freezing configuration

Once your app has finished bootstrapping, freeze the config to prevent accidental mutations:

```typescript
cfg.freeze();
cfg.isFrozen();  // true

cfg.set('server.port', 9999);  // throws: "Configuration is frozen and cannot be modified"

// Even direct property assignment is blocked (deep freeze)
const all = cfg.getAll();
all.server.port = 9999;  // throws TypeError
```

### `.env` file parsing

`parseEnvFile()` handles comments, empty lines, quoted values, and values containing `=`:

```typescript
import { parseEnvFile } from '@apick/cli';

const content = `
# Database config
DB_HOST=localhost
DB_PORT=5432

# Credentials
DB_USER="admin"
DB_PASS='s3cret=value'
DATABASE_URL=postgres://admin:s3cret@localhost:5432/mydb?ssl=true
`;

const vars = parseEnvFile(content);
vars.DB_HOST       // 'localhost'
vars.DB_USER       // 'admin' (quotes stripped)
vars.DB_PASS       // 's3cret=value' (quotes stripped, = preserved in value)
vars.DATABASE_URL  // full URL preserved
```

---

## Part 5: The Built-in Commands

APIck ships with 15 built-in commands. When you call `apick develop`, the CLI framework parses your arguments, resolves the command (or its alias), and calls the action with full context.

| Command | Description | Aliases |
|---------|-------------|---------|
| `develop` | Start the development server | `dev` |
| `start` | Start the production server | |
| `build` | Compile the project TypeScript | |
| `ts:generate-types` | Generate TypeScript types from schemas | |
| `routes:list` | List all registered routes | |
| `policies:list` | List all registered policies | |
| `middlewares:list` | List all registered middlewares | |
| `content-types:list` | List all registered content types | |
| `console` | Start an interactive REPL | |
| `export` | Export data to a tar.gz archive | `transfer:export` |
| `import` | Import data from a tar.gz archive | `transfer:import` |
| `migration:run` | Run pending database migrations | |
| `migration:rollback` | Rollback the last batch of migrations | |
| `migration:status` | Display migration status | |
| `migration:generate` | Generate a new migration file | |

All 15 are exported as `builtinCommands` from `@apick/cli` and registered automatically when the CLI boots.

---

## Running the Tests

```bash
npx vitest run
```

To run in watch mode:

```bash
npx vitest
```

You should see 10 tests across 4 describe blocks:

```
 ✓ tests/cli-toolkit.test.ts (10 tests)
   ✓ Argument parsing patterns (2)
   ✓ Building a custom CLI (4)
   ✓ Environment configuration (3)
   ✓ Built-in command inventory (1)
```

---

## Key Takeaways

1. **Zero dependencies.** The entire CLI framework — argument parsing, command routing, alias resolution, help generation — is built with no external packages.

2. **Composable.** `createCli()` gives you a blank slate. Register only the commands you need, or load all 15 built-in commands for a full-featured developer experience.

3. **Introspectable.** Every command action receives a `CliContext` with the version string and the full commands map, enabling meta-commands and plugin architectures.

4. **Config is just data.** `createEnvConfig()` gives you dot-notation access, deep freeze for safety, and `.env` parsing — the same primitives that power APIck's configuration system.

---

## Next Steps

- Read the [CLI source](../../packages/cli/src/cli.ts) to see how `builtinCommands` are defined
- Explore `env-config.ts` for the full `EnvConfig` interface including `loadEnvFile()` and `loadEnvOverrides()`
- Build a custom command for your project (linting, seeding, health checks) using the patterns from this tutorial
- Revisit [Tutorial 01](../01-hello-apick/README.md) to see how the CLI bootstraps an actual APIck server
