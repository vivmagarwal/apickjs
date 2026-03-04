/**
 * Console command — interactive REPL with Apick instance in context.
 */

import * as repl from 'node:repl';
import type { CliCommand } from '../cli.js';
import { info, error as logError, colors } from '../colors.js';

export const consoleCommand: CliCommand = {
  name: 'console',
  description: 'Start an interactive REPL with APICK context',
  action: async (_args, ctx) => {
    try {
      info('Loading APICK...');
      const { Apick } = await import('@apick/core');
      const apick = new Apick({ appDir: ctx.cwd });
      await apick.load();

      info(`APICK console ready. Access the instance via ${colors.bold('apick')}.`);
      info('Type .exit to quit.');
      console.log('');

      const r = repl.start({
        prompt: colors.cyan('apick> '),
        useGlobal: true,
      });

      r.context.apick = apick;

      await new Promise<void>((resolve) => {
        r.on('exit', async () => {
          info('Shutting down...');
          await apick.destroy();
          resolve();
        });
      });
    } catch (err: any) {
      logError(err.message || 'Failed to start console');
    }
  },
};
