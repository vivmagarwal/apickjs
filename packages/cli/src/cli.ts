/**
 * APICK CLI.
 *
 * Command parser and executor for all APICK CLI commands.
 * Uses no external dependencies — simple argv parsing.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CliCommand {
  name: string;
  description: string;
  aliases?: string[];
  options?: CliOption[];
  action: (args: ParsedArgs, context: CliContext) => void | Promise<void>;
}

export interface CliOption {
  name: string;
  alias?: string;
  description: string;
  type: 'string' | 'boolean' | 'number';
  default?: any;
}

export interface ParsedArgs {
  command: string;
  positional: string[];
  flags: Record<string, string | boolean | number>;
}

export interface CliContext {
  cwd: string;
  version: string;
  commands: Map<string, CliCommand>;
}

// ---------------------------------------------------------------------------
// Argument parser
// ---------------------------------------------------------------------------

export function parseArgs(argv: string[]): ParsedArgs {
  const args = argv.slice(2); // skip node + script
  const flags: Record<string, string | boolean | number> = {};
  const positional: string[] = [];
  let command = '';

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg.startsWith('--')) {
      const eqIndex = arg.indexOf('=');
      if (eqIndex !== -1) {
        flags[arg.slice(2, eqIndex)] = arg.slice(eqIndex + 1);
      } else {
        const next = args[i + 1];
        if (next && !next.startsWith('-')) {
          flags[arg.slice(2)] = next;
          i++;
        } else {
          flags[arg.slice(2)] = true;
        }
      }
    } else if (arg.startsWith('-') && arg.length === 2) {
      const next = args[i + 1];
      if (next && !next.startsWith('-')) {
        flags[arg.slice(1)] = next;
        i++;
      } else {
        flags[arg.slice(1)] = true;
      }
    } else if (!command) {
      command = arg;
    } else {
      positional.push(arg);
    }
  }

  return { command, positional, flags };
}

// ---------------------------------------------------------------------------
// CLI factory
// ---------------------------------------------------------------------------

export interface Cli {
  register(command: CliCommand): void;
  run(argv: string[]): Promise<void>;
  getCommands(): CliCommand[];
  getHelp(): string;
}

export function createCli(version: string = '0.1.0'): Cli {
  const commands = new Map<string, CliCommand>();
  const aliases = new Map<string, string>();

  // Built-in help command
  const helpCommand: CliCommand = {
    name: 'help',
    description: 'Display help information',
    action: (_args, ctx) => {
      const cli = createCliFromContext(ctx);
      console.log(cli.getHelp());
    },
  };

  // Built-in version command
  const versionCommand: CliCommand = {
    name: 'version',
    description: 'Display the APICK version',
    action: (_args, ctx) => {
      console.log(`APICK v${ctx.version}`);
    },
  };

  function createCliFromContext(ctx: CliContext): { getHelp: () => string } {
    return {
      getHelp() {
        const lines = [`APICK CLI v${ctx.version}`, '', 'Usage: apick <command> [options]', '', 'Commands:'];
        for (const cmd of ctx.commands.values()) {
          const aliasStr = cmd.aliases?.length ? ` (${cmd.aliases.join(', ')})` : '';
          lines.push(`  ${cmd.name.padEnd(30)}${cmd.description}${aliasStr}`);
        }
        lines.push('', 'Run "apick <command> --help" for more information on a command.');
        return lines.join('\n');
      },
    };
  }

  return {
    register(command) {
      commands.set(command.name, command);
      if (command.aliases) {
        for (const alias of command.aliases) {
          aliases.set(alias, command.name);
        }
      }
    },

    async run(argv) {
      const parsed = parseArgs(argv);
      const ctx: CliContext = { cwd: process.cwd(), version, commands };

      // Handle --version flag
      if (parsed.flags.version || parsed.flags.v) {
        versionCommand.action(parsed, ctx);
        return;
      }

      // Handle --help flag or no command
      if (!parsed.command || parsed.flags.help || parsed.flags.h) {
        helpCommand.action(parsed, ctx);
        return;
      }

      // Resolve command (check aliases)
      const commandName = aliases.get(parsed.command) || parsed.command;
      const command = commands.get(commandName);

      if (!command) {
        console.error(`Unknown command: "${parsed.command}". Run "apick help" for available commands.`);
        return;
      }

      // Command-level help
      if (parsed.flags.help || parsed.flags.h) {
        const lines = [`Usage: apick ${command.name} [options]`, '', command.description];
        if (command.options?.length) {
          lines.push('', 'Options:');
          for (const opt of command.options) {
            const aliasStr = opt.alias ? `, -${opt.alias}` : '';
            lines.push(`  --${opt.name}${aliasStr}  ${opt.description} (${opt.type}, default: ${opt.default ?? 'none'})`);
          }
        }
        console.log(lines.join('\n'));
        return;
      }

      await command.action(parsed, ctx);
    },

    getCommands() {
      return [...commands.values()];
    },

    getHelp() {
      const ctx: CliContext = { cwd: process.cwd(), version, commands };
      return createCliFromContext(ctx).getHelp();
    },
  };
}

// ---------------------------------------------------------------------------
// Built-in commands
// ---------------------------------------------------------------------------

export const developCommand: CliCommand = {
  name: 'develop',
  description: 'Start the APICK development server',
  aliases: ['dev'],
  options: [
    { name: 'port', alias: 'p', description: 'Port to listen on', type: 'number', default: 1337 },
    { name: 'host', alias: 'H', description: 'Host to bind to', type: 'string', default: '0.0.0.0' },
    { name: 'debug', description: 'Enable debug mode', type: 'boolean', default: false },
    { name: 'watch-admin', description: 'Watch admin panel', type: 'boolean', default: false },
  ],
  action: async (_args, ctx) => {
    try {
      const { Apick } = await import('@apick/core');
      const apick = new Apick({ appDir: ctx.cwd });
      await apick.load();
      await apick.listen();
    } catch (err: any) {
      console.error('Failed to start development server:', err.message || err);
      process.exit(1);
    }
  },
};

export const startCommand: CliCommand = {
  name: 'start',
  description: 'Start the APICK production server',
  options: [
    { name: 'port', alias: 'p', description: 'Port to listen on', type: 'number', default: 1337 },
    { name: 'host', alias: 'H', description: 'Host to bind to', type: 'string', default: '0.0.0.0' },
  ],
  action: async (_args, ctx) => {
    try {
      process.env.NODE_ENV = 'production';
      const { Apick } = await import('@apick/core');
      const apick = new Apick({ appDir: ctx.cwd });
      await apick.load();
      await apick.listen();
    } catch (err: any) {
      console.error('Failed to start production server:', err.message || err);
      process.exit(1);
    }
  },
};

export const buildCommand: CliCommand = {
  name: 'build',
  description: 'Compile the APICK project TypeScript',
  action: async () => {
    console.log('Building APICK project...');
  },
};

export const generateTypesCommand: CliCommand = {
  name: 'ts:generate-types',
  description: 'Generate TypeScript type definitions from content type schemas',
  action: async () => {
    console.log('Generating TypeScript types...');
  },
};

export const routesListCommand: CliCommand = {
  name: 'routes:list',
  description: 'List all registered routes',
  action: async () => {
    console.log('Listing routes...');
  },
};

export const policiesListCommand: CliCommand = {
  name: 'policies:list',
  description: 'List all registered policies',
  action: async () => {
    console.log('Listing policies...');
  },
};

export const middlewaresListCommand: CliCommand = {
  name: 'middlewares:list',
  description: 'List all registered middlewares',
  action: async () => {
    console.log('Listing middlewares...');
  },
};

export const contentTypesListCommand: CliCommand = {
  name: 'content-types:list',
  description: 'List all registered content types',
  action: async () => {
    console.log('Listing content types...');
  },
};

export const consoleCommand: CliCommand = {
  name: 'console',
  description: 'Start an interactive REPL with APICK context',
  action: async () => {
    console.log('Starting APICK console...');
  },
};

export const exportCommand: CliCommand = {
  name: 'export',
  description: 'Export data to a tar.gz archive',
  aliases: ['transfer:export'],
  options: [
    { name: 'file', alias: 'f', description: 'Output file path', type: 'string' },
    { name: 'encrypt', description: 'Encrypt the archive', type: 'boolean', default: false },
    { name: 'only', description: 'Only export specific data (content, files, config)', type: 'string' },
    { name: 'exclude', description: 'Exclude specific data', type: 'string' },
  ],
  action: async (args) => {
    const file = args.flags.file || args.flags.f || 'export.tar.gz';
    console.log(`Exporting data to ${file}...`);
  },
};

export const importCommand: CliCommand = {
  name: 'import',
  description: 'Import data from a tar.gz archive',
  aliases: ['transfer:import'],
  options: [
    { name: 'file', alias: 'f', description: 'Input file path', type: 'string' },
    { name: 'decrypt', description: 'Decrypt the archive', type: 'boolean', default: false },
    { name: 'force', description: 'Overwrite existing data', type: 'boolean', default: false },
    { name: 'dry-run', description: 'Preview without modifying data', type: 'boolean', default: false },
  ],
  action: async (args) => {
    const file = args.flags.file || args.flags.f;
    console.log(`Importing data from ${file}...`);
  },
};

export const migrationRunCommand: CliCommand = {
  name: 'migration:run',
  description: 'Run pending database migrations',
  action: async () => {
    console.log('Running migrations...');
  },
};

export const migrationRollbackCommand: CliCommand = {
  name: 'migration:rollback',
  description: 'Rollback the last batch of migrations',
  action: async () => {
    console.log('Rolling back migrations...');
  },
};

export const migrationStatusCommand: CliCommand = {
  name: 'migration:status',
  description: 'Display migration status',
  action: async () => {
    console.log('Migration status...');
  },
};

export const migrationGenerateCommand: CliCommand = {
  name: 'migration:generate',
  description: 'Generate a new migration file',
  options: [
    { name: 'name', alias: 'n', description: 'Migration name', type: 'string' },
  ],
  action: async (args) => {
    const name = args.flags.name || args.flags.n || args.positional[0] || 'unnamed';
    console.log(`Generating migration: ${name}...`);
  },
};

// All built-in commands
export const builtinCommands: CliCommand[] = [
  developCommand, startCommand, buildCommand,
  generateTypesCommand, routesListCommand, policiesListCommand,
  middlewaresListCommand, contentTypesListCommand, consoleCommand,
  exportCommand, importCommand,
  migrationRunCommand, migrationRollbackCommand, migrationStatusCommand, migrationGenerateCommand,
];
