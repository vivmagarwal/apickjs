import { describe, it, expect } from 'vitest';
import { builtinCommands } from '../../src/cli.js';
import { generateProject } from '@apick/generators';

describe('new project command', () => {
  it('new command is registered', () => {
    const names = builtinCommands.map(c => c.name);
    expect(names).toContain('new');
  });

  it('new command has description', () => {
    const cmd = builtinCommands.find(c => c.name === 'new')!;
    expect(cmd.description).toContain('new APICK project');
  });

  it('new command has name option', () => {
    const cmd = builtinCommands.find(c => c.name === 'new')!;
    expect(cmd.options?.some(o => o.name === 'name')).toBe(true);
  });
});

describe('generateProject (stubbed)', () => {
  it('generates files for sqlite', () => {
    const files = generateProject({ name: 'test-app', database: 'sqlite' });
    expect(files.length).toBeGreaterThan(0);
    const paths = files.map(f => f.path);
    expect(paths).toContain('package.json');
    expect(paths).toContain('config/server.ts');
    expect(paths).toContain('config/database.ts');
  });

  it('generates files for postgres', () => {
    const files = generateProject({ name: 'test-app', database: 'postgres' });
    expect(files.length).toBeGreaterThan(0);
  });
});
