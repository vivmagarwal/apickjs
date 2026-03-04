/**
 * New project scaffolding command.
 */

import { join } from 'node:path';
import { existsSync } from 'node:fs';
import type { CliCommand } from '../cli.js';
import { text, select } from '../prompts.js';
import { success, info, warn, error as logError, colors } from '../colors.js';
import { generateProject, writeGeneratedFiles } from '@apick/generators';

export const newProjectCommand: CliCommand = {
  name: 'new',
  description: 'Create a new APICK project',
  options: [
    { name: 'name', alias: 'n', description: 'Project name', type: 'string' },
  ],
  action: async (args, ctx) => {
    try {
      const name = (args.flags.name as string) || (args.flags.n as string) || args.positional[0] || await text('Project name', {
        validate: (v) => v.trim() ? true : 'Name is required',
      });

      const targetDir = join(ctx.cwd, name);
      if (existsSync(targetDir)) {
        warn(`Directory "${name}" already exists.`);
        return;
      }

      const database = await select('Database?', [
        { value: 'sqlite', label: 'SQLite', hint: 'File-based, no setup required (recommended)' },
        { value: 'postgres', label: 'PostgreSQL', hint: 'Production-grade relational database' },
        { value: 'mysql', label: 'MySQL', hint: 'Popular relational database' },
      ]) as 'sqlite' | 'postgres' | 'mysql';

      const portStr = await text('Port', { default: '1337' });
      const port = parseInt(portStr, 10) || 1337;

      const files = generateProject({ name, database, port });

      info('Creating project...');
      writeGeneratedFiles(files, targetDir);

      console.log('');
      success(`Project "${name}" created!`);
      console.log('');
      info('Next steps:');
      console.log(`  ${colors.cyan('cd')} ${name}`);
      console.log(`  ${colors.cyan('npm install')}`);
      console.log(`  ${colors.cyan('npx apick develop')}`);
    } catch (err: any) {
      logError(err.message || 'Failed to create project');
    }
  },
};
