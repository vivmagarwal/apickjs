/**
 * Build command — compile TypeScript project.
 */

import { execSync } from 'node:child_process';
import type { CliCommand } from '../cli.js';
import { success, info, error as logError } from '../colors.js';

export const buildCommand: CliCommand = {
  name: 'build',
  description: 'Compile the APICK project TypeScript',
  action: async (_args, ctx) => {
    try {
      info('Compiling TypeScript...');
      execSync('npx tsc -p tsconfig.json', {
        cwd: ctx.cwd,
        stdio: 'inherit',
      });
      success('Build completed.');
    } catch (err: any) {
      logError('Build failed. Check TypeScript errors above.');
      process.exit(1);
    }
  },
};
