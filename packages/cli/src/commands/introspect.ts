/**
 * Introspection commands — inspect content types, routes, policies, middlewares.
 */

import type { CliCommand } from '../cli.js';
import { info, error as logError, colors } from '../colors.js';

// ---------------------------------------------------------------------------
// Shared helper
// ---------------------------------------------------------------------------

async function loadApickForIntrospection(cwd: string) {
  const { Apick } = await import('@apick/core');
  const apick = new Apick({ appDir: cwd });
  await apick.load();
  return apick;
}

// ---------------------------------------------------------------------------
// content-types:list
// ---------------------------------------------------------------------------

export const contentTypesListCommand: CliCommand = {
  name: 'content-types:list',
  description: 'List all registered content types',
  action: async (_args, ctx) => {
    try {
      const apick = await loadApickForIntrospection(ctx.cwd);

      const types = apick.contentTypes || {};
      const entries = Object.entries(types);

      if (entries.length === 0) {
        info('No content types registered.');
      } else {
        console.log('');
        console.log(colors.bold('Content Types'));
        console.log(colors.dim('─'.repeat(70)));
        console.log(
          `  ${colors.bold('UID'.padEnd(35))} ${colors.bold('Kind'.padEnd(18))} ${colors.bold('Attributes')}`,
        );
        console.log(colors.dim('─'.repeat(70)));

        for (const [uid, ct] of entries) {
          const kind = ct.kind || ct.info?.kind || 'unknown';
          const attrs = ct.attributes ? Object.keys(ct.attributes).join(', ') : '';
          console.log(`  ${uid.padEnd(35)} ${kind.padEnd(18)} ${colors.dim(attrs)}`);
        }
        console.log('');
        info(`${entries.length} content type(s) found.`);
      }

      await apick.destroy();
    } catch (err: any) {
      logError(err.message || 'Failed to list content types');
    }
  },
};

// ---------------------------------------------------------------------------
// routes:list
// ---------------------------------------------------------------------------

export const routesListCommand: CliCommand = {
  name: 'routes:list',
  description: 'List all registered routes',
  action: async (_args, ctx) => {
    try {
      const apick = await loadApickForIntrospection(ctx.cwd);

      const routes = apick.server.getRoutes?.() || [];

      if (routes.length === 0) {
        info('No routes registered.');
      } else {
        console.log('');
        console.log(colors.bold('Routes'));
        console.log(colors.dim('─'.repeat(60)));
        console.log(`  ${colors.bold('Method'.padEnd(10))} ${colors.bold('Path')}`);
        console.log(colors.dim('─'.repeat(60)));

        for (const route of routes) {
          const method = route.method.toUpperCase();
          const methodColor = method === 'GET' ? colors.green :
                              method === 'POST' ? colors.cyan :
                              method === 'PUT' ? colors.yellow :
                              method === 'DELETE' ? colors.red : colors.dim;
          console.log(`  ${methodColor(method.padEnd(10))} ${route.path}`);
        }
        console.log('');
        info(`${routes.length} route(s) found.`);
      }

      await apick.destroy();
    } catch (err: any) {
      logError(err.message || 'Failed to list routes');
    }
  },
};

// ---------------------------------------------------------------------------
// policies:list
// ---------------------------------------------------------------------------

export const policiesListCommand: CliCommand = {
  name: 'policies:list',
  description: 'List all registered policies',
  action: async (_args, ctx) => {
    try {
      const apick = await loadApickForIntrospection(ctx.cwd);

      const policies = apick.policies || {};
      const entries = Object.entries(policies);

      if (entries.length === 0) {
        info('No policies registered.');
      } else {
        console.log('');
        console.log(colors.bold('Policies'));
        console.log(colors.dim('─'.repeat(50)));
        for (const [uid] of entries) {
          console.log(`  ${uid}`);
        }
        console.log('');
        info(`${entries.length} policy(s) found.`);
      }

      await apick.destroy();
    } catch (err: any) {
      logError(err.message || 'Failed to list policies');
    }
  },
};

// ---------------------------------------------------------------------------
// middlewares:list
// ---------------------------------------------------------------------------

export const middlewaresListCommand: CliCommand = {
  name: 'middlewares:list',
  description: 'List all registered middlewares',
  action: async (_args, ctx) => {
    try {
      const apick = await loadApickForIntrospection(ctx.cwd);

      const middlewares = apick.middlewares || {};
      const entries = Object.entries(middlewares);

      if (entries.length === 0) {
        info('No middlewares registered.');
      } else {
        console.log('');
        console.log(colors.bold('Middlewares'));
        console.log(colors.dim('─'.repeat(50)));
        for (const [uid] of entries) {
          console.log(`  ${uid}`);
        }
        console.log('');
        info(`${entries.length} middleware(s) found.`);
      }

      await apick.destroy();
    } catch (err: any) {
      logError(err.message || 'Failed to list middlewares');
    }
  },
};

export const introspectCommands: CliCommand[] = [
  contentTypesListCommand,
  routesListCommand,
  policiesListCommand,
  middlewaresListCommand,
];
