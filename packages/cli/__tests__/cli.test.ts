import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createCli, parseArgs, builtinCommands } from '../src/cli.js';
import { createEnvConfig, parseEnvFile } from '../src/env-config.js';
import type { Cli } from '../src/cli.js';

describe('@apick/cli', () => {
  // ---------------------------------------------------------------------------
  // Argument parsing
  // ---------------------------------------------------------------------------

  describe('parseArgs', () => {
    it('parses a simple command', () => {
      const result = parseArgs(['node', 'apick', 'develop']);
      expect(result.command).toBe('develop');
      expect(result.positional).toEqual([]);
      expect(result.flags).toEqual({});
    });

    it('parses long flags with values', () => {
      const result = parseArgs(['node', 'apick', 'develop', '--port', '3000']);
      expect(result.command).toBe('develop');
      expect(result.flags.port).toBe('3000');
    });

    it('parses long flags with = syntax', () => {
      const result = parseArgs(['node', 'apick', 'develop', '--port=3000']);
      expect(result.flags.port).toBe('3000');
    });

    it('parses boolean flags', () => {
      const result = parseArgs(['node', 'apick', 'develop', '--debug']);
      expect(result.flags.debug).toBe(true);
    });

    it('parses short flags', () => {
      const result = parseArgs(['node', 'apick', 'develop', '-p', '3000']);
      expect(result.flags.p).toBe('3000');
    });

    it('parses positional arguments', () => {
      const result = parseArgs(['node', 'apick', 'generate', 'api', 'blog-post']);
      expect(result.command).toBe('generate');
      expect(result.positional).toEqual(['api', 'blog-post']);
    });

    it('parses mixed flags and positional args', () => {
      const result = parseArgs(['node', 'apick', 'export', '--file', 'backup.tar.gz', '--encrypt']);
      expect(result.command).toBe('export');
      expect(result.flags.file).toBe('backup.tar.gz');
      expect(result.flags.encrypt).toBe(true);
    });

    it('handles no arguments', () => {
      const result = parseArgs(['node', 'apick']);
      expect(result.command).toBe('');
      expect(result.positional).toEqual([]);
    });
  });

  // ---------------------------------------------------------------------------
  // CLI creation
  // ---------------------------------------------------------------------------

  describe('createCli', () => {
    let cli: Cli;

    beforeEach(() => {
      cli = createCli('1.0.0');
    });

    it('creates a CLI instance', () => {
      expect(cli).toBeDefined();
      expect(typeof cli.run).toBe('function');
      expect(typeof cli.register).toBe('function');
    });

    it('registers and lists commands', () => {
      cli.register({ name: 'test', description: 'Test command', action: () => {} });
      const commands = cli.getCommands();
      expect(commands).toHaveLength(1);
      expect(commands[0].name).toBe('test');
    });

    it('generates help text', () => {
      cli.register({ name: 'develop', description: 'Start dev server', action: () => {} });
      cli.register({ name: 'build', description: 'Build project', action: () => {} });
      const help = cli.getHelp();
      expect(help).toContain('APICK CLI v1.0.0');
      expect(help).toContain('develop');
      expect(help).toContain('build');
    });

    it('displays help when no command given', async () => {
      const log = vi.spyOn(console, 'log').mockImplementation(() => {});
      cli.register({ name: 'develop', description: 'Dev', action: () => {} });
      await cli.run(['node', 'apick']);
      expect(log).toHaveBeenCalled();
      expect(log.mock.calls[0][0]).toContain('APICK CLI');
      log.mockRestore();
    });

    it('displays version with --version flag', async () => {
      const log = vi.spyOn(console, 'log').mockImplementation(() => {});
      await cli.run(['node', 'apick', '--version']);
      expect(log).toHaveBeenCalledWith('APICK v1.0.0');
      log.mockRestore();
    });

    it('runs a registered command', async () => {
      let executed = false;
      cli.register({ name: 'test', description: 'Test', action: () => { executed = true; } });
      await cli.run(['node', 'apick', 'test']);
      expect(executed).toBe(true);
    });

    it('passes parsed args to command action', async () => {
      let receivedArgs: any;
      cli.register({
        name: 'serve',
        description: 'Serve',
        action: (args) => { receivedArgs = args; },
      });
      await cli.run(['node', 'apick', 'serve', '--port', '8080']);
      expect(receivedArgs.command).toBe('serve');
      expect(receivedArgs.flags.port).toBe('8080');
    });

    it('resolves command aliases', async () => {
      let executed = false;
      cli.register({
        name: 'develop',
        description: 'Dev',
        aliases: ['dev'],
        action: () => { executed = true; },
      });
      await cli.run(['node', 'apick', 'dev']);
      expect(executed).toBe(true);
    });

    it('reports unknown commands', async () => {
      const error = vi.spyOn(console, 'error').mockImplementation(() => {});
      await cli.run(['node', 'apick', 'unknown-cmd']);
      expect(error).toHaveBeenCalled();
      expect(error.mock.calls[0][0]).toContain('Unknown command');
      error.mockRestore();
    });

    it('handles async command actions', async () => {
      let done = false;
      cli.register({
        name: 'async-cmd',
        description: 'Async',
        action: async () => { await Promise.resolve(); done = true; },
      });
      await cli.run(['node', 'apick', 'async-cmd']);
      expect(done).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // Built-in commands
  // ---------------------------------------------------------------------------

  describe('Built-in commands', () => {
    it('has all required built-in commands', () => {
      const names = builtinCommands.map(c => c.name);
      // Original 15 commands
      expect(names).toContain('develop');
      expect(names).toContain('start');
      expect(names).toContain('build');
      expect(names).toContain('ts:generate-types');
      expect(names).toContain('routes:list');
      expect(names).toContain('policies:list');
      expect(names).toContain('middlewares:list');
      expect(names).toContain('content-types:list');
      expect(names).toContain('console');
      expect(names).toContain('export');
      expect(names).toContain('import');
      expect(names).toContain('migration:run');
      expect(names).toContain('migration:rollback');
      expect(names).toContain('migration:status');
      expect(names).toContain('migration:generate');
      // New 7 commands
      expect(names).toContain('generate:api');
      expect(names).toContain('generate:controller');
      expect(names).toContain('generate:service');
      expect(names).toContain('generate:policy');
      expect(names).toContain('generate:middleware');
      expect(names).toContain('generate:plugin');
      expect(names).toContain('new');
    });

    it('has 22 built-in commands', () => {
      expect(builtinCommands).toHaveLength(22);
    });

    it('develop command has dev alias', () => {
      const develop = builtinCommands.find(c => c.name === 'develop')!;
      expect(develop.aliases).toContain('dev');
    });

    it('export command has transfer:export alias', () => {
      const exp = builtinCommands.find(c => c.name === 'export')!;
      expect(exp.aliases).toContain('transfer:export');
    });

    it('registers all built-in commands', () => {
      const cli = createCli();
      for (const cmd of builtinCommands) {
        cli.register(cmd);
      }
      expect(cli.getCommands()).toHaveLength(builtinCommands.length);
    });
  });

  // ---------------------------------------------------------------------------
  // .env file parsing
  // ---------------------------------------------------------------------------

  describe('parseEnvFile', () => {
    it('parses key=value pairs', () => {
      const result = parseEnvFile('KEY=value\nANOTHER=test');
      expect(result.KEY).toBe('value');
      expect(result.ANOTHER).toBe('test');
    });

    it('skips comments and empty lines', () => {
      const result = parseEnvFile('# Comment\n\nKEY=value\n# Another comment');
      expect(result).toEqual({ KEY: 'value' });
    });

    it('removes surrounding quotes', () => {
      const result = parseEnvFile('A="double quoted"\nB=\'single quoted\'');
      expect(result.A).toBe('double quoted');
      expect(result.B).toBe('single quoted');
    });

    it('handles values with = sign', () => {
      const result = parseEnvFile('URL=postgres://user:pass@host/db?sslmode=require');
      expect(result.URL).toBe('postgres://user:pass@host/db?sslmode=require');
    });

    it('trims whitespace', () => {
      const result = parseEnvFile('  KEY  =  value  ');
      expect(result.KEY).toBe('value');
    });
  });

  // ---------------------------------------------------------------------------
  // Environment config
  // ---------------------------------------------------------------------------

  describe('EnvConfig', () => {
    it('creates config with initial values', () => {
      const cfg = createEnvConfig({ server: { port: 1337 } });
      expect(cfg.get('server.port')).toBe(1337);
    });

    it('gets nested values by dot notation', () => {
      const cfg = createEnvConfig({ a: { b: { c: 42 } } });
      expect(cfg.get('a.b.c')).toBe(42);
    });

    it('returns default value for missing path', () => {
      const cfg = createEnvConfig({});
      expect(cfg.get('missing.path', 'fallback')).toBe('fallback');
    });

    it('sets values by dot notation', () => {
      const cfg = createEnvConfig({});
      cfg.set('server.port', 3000);
      expect(cfg.get('server.port')).toBe(3000);
    });

    it('checks path existence', () => {
      const cfg = createEnvConfig({ exists: true });
      expect(cfg.has('exists')).toBe(true);
      expect(cfg.has('missing')).toBe(false);
    });

    it('freezes config', () => {
      const cfg = createEnvConfig({ key: 'value' });
      cfg.freeze();
      expect(cfg.isFrozen()).toBe(true);
      expect(() => cfg.set('key', 'new')).toThrow('frozen');
    });

    it('returns all config', () => {
      const cfg = createEnvConfig({ a: 1, b: { c: 2 } });
      const all = cfg.getAll();
      expect(all.a).toBe(1);
      expect(all.b.c).toBe(2);
    });

    it('loads env overrides (returns base when no override dir)', () => {
      const cfg = createEnvConfig();
      const result = cfg.loadEnvOverrides(
        { server: { port: 1337 } },
        '/nonexistent/config',
        'test',
      );
      expect(result.server.port).toBe(1337);
    });
  });
});
