# APICK CLI Developer Guide

## Architecture

```
packages/cli/src/
  bin.ts                 # Entry point (shebang, tsx registration)
  cli.ts                 # CLI framework (parseArgs, createCli, builtinCommands)
  colors.ts              # ANSI color helpers
  prompts.ts             # Interactive prompt system (readline-based)
  env-config.ts          # Environment configuration management
  index.ts               # Public API exports
  commands/
    generate.ts          # generate:api, generate:controller, etc.
    new-project.ts       # new command (project scaffolding)
    introspect.ts        # content-types:list, routes:list, etc.
    build.ts             # build command (tsc)
    types.ts             # ts:generate-types command
    console.ts           # console command (REPL)
```

## Adding a New Command

### 1. Create the command file

Create `packages/cli/src/commands/my-command.ts`:

```typescript
import type { CliCommand } from '../cli.js';
import { success, info, error as logError } from '../colors.js';

export const myCommand: CliCommand = {
  name: 'my:command',
  description: 'Description shown in help',
  options: [
    { name: 'flag', alias: 'f', description: 'A flag', type: 'string' },
  ],
  action: async (args, ctx) => {
    try {
      const flagValue = args.flags.flag || args.flags.f;
      info(`Running with flag: ${flagValue}`);
      // ... implementation ...
      success('Done!');
    } catch (err: any) {
      logError(err.message);
    }
  },
};
```

### 2. Register it in cli.ts

Import and add to `builtinCommands`:

```typescript
import { myCommand } from './commands/my-command.js';

export const builtinCommands: CliCommand[] = [
  // ... existing commands ...
  myCommand,
];
```

### 3. Add tests

Create `packages/cli/__tests__/commands/my-command.test.ts` and update the command count in `cli.test.ts`.

## Prompt System

The prompt system (`prompts.ts`) provides four functions:

```typescript
// Text input
const name = await text('Enter name', { default: 'world', validate: v => v ? true : 'Required' });

// Single select
const choice = await select('Pick one', [
  { value: 'a', label: 'Option A', hint: 'Description' },
  { value: 'b', label: 'Option B' },
]);

// Confirm
const ok = await confirm('Continue?', true);

// Multi-select
const items = await multiSelect('Pick many', [
  { value: 'x', label: 'X' },
  { value: 'y', label: 'Y' },
]);
```

All functions accept an optional `{ input, output }` parameter for testing with mock streams.

## Color System

Colors are automatically disabled when `NO_COLOR` is set or stdout is not a TTY.

```typescript
import { colors, success, error, info, warn } from '../colors.js';

console.log(colors.green('green text'));
console.log(colors.bold(colors.cyan('bold cyan')));
success('Operation completed');
error('Something failed');
```

## Extending Generators

The `@apick/generators` package produces `GeneratedFile[]` arrays. To add a new generator:

1. Add the function in `packages/generators/src/generators.ts`
2. Export it from `packages/generators/src/index.ts`
3. Create a CLI command that calls it
4. Use `writeGeneratedFiles(files, rootDir)` to write to disk

## Testing Strategy

- CLI framework tests use stubs for `@apick/core` and `@apick/generators` (see `vitest.config.ts`)
- Generator tests run against real implementations
- Prompt tests use mock streams (`Readable`/`Writable`)
- Color tests verify output functions work

## Key Design Decisions

1. **Zero external dependencies** for CLI framework — only `tsx` for TypeScript support
2. **Dynamic imports** for `@apick/core` — commands that need the server load it lazily
3. **Non-TTY fallback** — prompts use numeric input when raw mode is unavailable
4. **Plain object templates** — generated controllers/services export `{}` instead of using factory functions, matching the playground convention
