import { describe, it, expect, vi } from 'vitest';
import { createCli, parseArgs, builtinCommands } from '../../../packages/cli/src/cli.js';
import { createEnvConfig, parseEnvFile } from '../../../packages/cli/src/env-config.js';
import type { CliCommand, ParsedArgs, CliContext } from '../../../packages/cli/src/cli.js';

// ---------------------------------------------------------------------------
// 1. Argument parsing patterns
// ---------------------------------------------------------------------------

describe('Argument parsing patterns', () => {
  it('parses a realistic develop command with mixed flags', () => {
    const result = parseArgs([
      'node', 'apick', 'develop',
      '--port', '4000',
      '-H', 'localhost',
      '--debug',
    ]);

    expect(result.command).toBe('develop');
    expect(result.flags.port).toBe('4000');
    expect(result.flags.H).toBe('localhost');
    expect(result.flags.debug).toBe(true);
    expect(result.positional).toEqual([]);
  });

  it('parses positional args for migration:generate', () => {
    const result = parseArgs([
      'node', 'apick', 'migration:generate',
      'add-users-table',
      '--name', 'create_users',
    ]);

    expect(result.command).toBe('migration:generate');
    expect(result.positional).toEqual(['add-users-table']);
    expect(result.flags.name).toBe('create_users');
  });
});

// ---------------------------------------------------------------------------
// 2. Building a custom CLI
// ---------------------------------------------------------------------------

describe('Building a custom CLI', () => {
  it('registers and executes a custom deploy command', async () => {
    const cli = createCli('2.0.0');
    let deployTarget = '';

    const deployCommand: CliCommand = {
      name: 'deploy',
      description: 'Deploy the app to a target environment',
      aliases: ['ship'],
      options: [
        { name: 'target', alias: 't', description: 'Deploy target', type: 'string', default: 'staging' },
      ],
      action: (args) => {
        deployTarget = (args.flags.target as string) || (args.flags.t as string) || 'staging';
      },
    };

    cli.register(deployCommand);
    await cli.run(['node', 'apick', 'deploy', '--target', 'production']);

    expect(deployTarget).toBe('production');
    expect(cli.getCommands()).toHaveLength(1);
    expect(cli.getCommands()[0].name).toBe('deploy');
  });

  it('resolves aliases for custom commands', async () => {
    const cli = createCli('2.0.0');
    let ran = false;

    cli.register({
      name: 'deploy',
      description: 'Deploy',
      aliases: ['ship'],
      action: () => { ran = true; },
    });

    await cli.run(['node', 'apick', 'ship']);
    expect(ran).toBe(true);
  });

  it('provides version and commands map in action context', async () => {
    const cli = createCli('3.5.0');
    let capturedContext: CliContext | null = null;

    cli.register({
      name: 'inspect',
      description: 'Inspect CLI context',
      action: (_args, ctx) => { capturedContext = ctx; },
    });

    await cli.run(['node', 'apick', 'inspect']);

    expect(capturedContext).not.toBeNull();
    expect(capturedContext!.version).toBe('3.5.0');
    expect(capturedContext!.commands).toBeInstanceOf(Map);
    expect(capturedContext!.commands.has('inspect')).toBe(true);
    expect(typeof capturedContext!.cwd).toBe('string');
  });

  it('generates help output listing all registered commands', () => {
    const cli = createCli('1.0.0');
    cli.register({ name: 'deploy', description: 'Deploy the app', aliases: ['ship'], action: () => {} });
    cli.register({ name: 'rollback', description: 'Rollback last deploy', action: () => {} });

    const help = cli.getHelp();

    expect(help).toContain('APICK CLI v1.0.0');
    expect(help).toContain('deploy');
    expect(help).toContain('Deploy the app');
    expect(help).toContain('ship');
    expect(help).toContain('rollback');
    expect(help).toContain('apick <command> [options]');
  });
});

// ---------------------------------------------------------------------------
// 3. Environment configuration
// ---------------------------------------------------------------------------

describe('Environment configuration', () => {
  it('supports dot-notation get, set, and has', () => {
    const cfg = createEnvConfig({
      server: { host: '0.0.0.0', port: 1337 },
      database: { client: 'sqlite' },
    });

    // get
    expect(cfg.get('server.host')).toBe('0.0.0.0');
    expect(cfg.get('server.port')).toBe(1337);
    expect(cfg.get('database.client')).toBe('sqlite');
    expect(cfg.get('missing.key', 'default')).toBe('default');

    // has
    expect(cfg.has('server.host')).toBe(true);
    expect(cfg.has('server.missing')).toBe(false);

    // set
    cfg.set('server.port', 4000);
    expect(cfg.get('server.port')).toBe(4000);

    // set creates nested paths
    cfg.set('custom.nested.value', 'hello');
    expect(cfg.get('custom.nested.value')).toBe('hello');
  });

  it('freezes config and prevents further mutations', () => {
    const cfg = createEnvConfig({
      server: { port: 1337, host: '0.0.0.0' },
    });

    expect(cfg.isFrozen()).toBe(false);
    cfg.freeze();
    expect(cfg.isFrozen()).toBe(true);

    // set() throws on frozen config
    expect(() => cfg.set('server.port', 9999)).toThrow('frozen');

    // Values remain readable after freeze
    expect(cfg.get('server.port')).toBe(1337);

    // Deep-frozen: direct mutation on getAll() is silently ignored
    const all = cfg.getAll();
    expect(() => { (all.server as any).port = 9999; }).toThrow();
    expect(cfg.get('server.port')).toBe(1337);
  });

  it('parses .env content with comments, quotes, and special characters', () => {
    const content = [
      '# Database config',
      'DB_HOST=localhost',
      'DB_PORT=5432',
      '',
      '# Credentials',
      'DB_USER="admin"',
      "DB_PASS='s3cret=value'",
      'DATABASE_URL=postgres://admin:s3cret@localhost:5432/mydb?ssl=true',
      '# End of file',
    ].join('\n');

    const parsed = parseEnvFile(content);

    expect(parsed.DB_HOST).toBe('localhost');
    expect(parsed.DB_PORT).toBe('5432');
    expect(parsed.DB_USER).toBe('admin');
    expect(parsed.DB_PASS).toBe('s3cret=value');
    expect(parsed.DATABASE_URL).toBe('postgres://admin:s3cret@localhost:5432/mydb?ssl=true');
    // Comments and empty lines are skipped
    expect(Object.keys(parsed)).toHaveLength(5);
  });
});

// ---------------------------------------------------------------------------
// 4. Built-in command inventory
// ---------------------------------------------------------------------------

describe('Built-in command inventory', () => {
  it('registers all 15 built-in commands and key names are present', () => {
    const cli = createCli('1.0.0');
    for (const cmd of builtinCommands) {
      cli.register(cmd);
    }

    expect(builtinCommands).toHaveLength(15);
    expect(cli.getCommands()).toHaveLength(15);

    const names = cli.getCommands().map(c => c.name);
    const expected = [
      'develop', 'start', 'build',
      'ts:generate-types', 'routes:list', 'policies:list',
      'middlewares:list', 'content-types:list', 'console',
      'export', 'import',
      'migration:run', 'migration:rollback', 'migration:status', 'migration:generate',
    ];

    for (const name of expected) {
      expect(names).toContain(name);
    }
  });
});
