import { describe, it, expect, vi } from 'vitest';
import { createCli, builtinCommands } from '../../src/cli.js';

describe('generate commands', () => {
  it('generate:api command is registered', () => {
    const names = builtinCommands.map(c => c.name);
    expect(names).toContain('generate:api');
  });

  it('generate:controller command is registered', () => {
    const names = builtinCommands.map(c => c.name);
    expect(names).toContain('generate:controller');
  });

  it('generate:service command is registered', () => {
    const names = builtinCommands.map(c => c.name);
    expect(names).toContain('generate:service');
  });

  it('generate:policy command is registered', () => {
    const names = builtinCommands.map(c => c.name);
    expect(names).toContain('generate:policy');
  });

  it('generate:middleware command is registered', () => {
    const names = builtinCommands.map(c => c.name);
    expect(names).toContain('generate:middleware');
  });

  it('generate:plugin command is registered', () => {
    const names = builtinCommands.map(c => c.name);
    expect(names).toContain('generate:plugin');
  });

  it('all generate commands have descriptions', () => {
    const genCommands = builtinCommands.filter(c => c.name.startsWith('generate:'));
    expect(genCommands.length).toBe(6);
    for (const cmd of genCommands) {
      expect(cmd.description).toBeTruthy();
    }
  });

  it('generate:api has name option', () => {
    const cmd = builtinCommands.find(c => c.name === 'generate:api')!;
    expect(cmd.options?.some(o => o.name === 'name')).toBe(true);
  });
});
