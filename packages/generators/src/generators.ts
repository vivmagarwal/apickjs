/**
 * Code Generators.
 *
 * Generates scaffold files for APIs, controllers, services, policies,
 * middlewares, and plugins.
 */

import { join } from 'node:path';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GeneratorOptions {
  name: string;
  baseDir?: string;
  singularName?: string;
  pluralName?: string;
}

export interface GeneratedFile {
  path: string;
  content: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function kebabCase(str: string): string {
  return str
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/[\s_]+/g, '-')
    .toLowerCase();
}

function pascalCase(str: string): string {
  return kebabCase(str)
    .split('-')
    .map(s => s.charAt(0).toUpperCase() + s.slice(1))
    .join('');
}

function camelCase(str: string): string {
  const pascal = pascalCase(str);
  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}

function pluralize(str: string): string {
  if (str.endsWith('s')) return str + 'es';
  if (str.endsWith('y')) return str.slice(0, -1) + 'ies';
  return str + 's';
}

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

export function generateApi(options: GeneratorOptions): GeneratedFile[] {
  const { name } = options;
  const baseDir = options.baseDir || 'src/api';
  const singular = options.singularName || kebabCase(name);
  const plural = options.pluralName || pluralize(singular);
  const apiDir = join(baseDir, singular);

  const files: GeneratedFile[] = [];

  // Content type schema
  files.push({
    path: join(apiDir, 'content-types', singular, 'schema.ts'),
    content: `export default {
  kind: 'collectionType' as const,
  info: {
    singularName: '${singular}',
    pluralName: '${plural}',
    displayName: '${pascalCase(name)}',
    description: '',
  },
  options: {
    draftAndPublish: true,
  },
  attributes: {
    title: { type: 'string' as const, required: true },
    description: { type: 'text' as const },
  },
};
`,
  });

  // Controller
  files.push({
    path: join(apiDir, 'controllers', `${singular}.ts`),
    content: `/**
 * ${singular} controller.
 */

import { factories } from '@apick/core';

export default factories.createCoreController('api::${singular}.${singular}');
`,
  });

  // Service
  files.push({
    path: join(apiDir, 'services', `${singular}.ts`),
    content: `/**
 * ${singular} service.
 */

import { factories } from '@apick/core';

export default factories.createCoreService('api::${singular}.${singular}');
`,
  });

  // Routes
  files.push({
    path: join(apiDir, 'routes', `${singular}.ts`),
    content: `/**
 * ${singular} router.
 */

import { factories } from '@apick/core';

export default factories.createCoreRouter('api::${singular}.${singular}');
`,
  });

  return files;
}

export function generateController(options: GeneratorOptions): GeneratedFile[] {
  const { name } = options;
  const baseDir = options.baseDir || 'src/api';
  const singular = kebabCase(name);
  const apiDir = join(baseDir, singular);

  return [{
    path: join(apiDir, 'controllers', `${singular}.ts`),
    content: `/**
 * ${singular} controller.
 */

import { factories } from '@apick/core';

export default factories.createCoreController('api::${singular}.${singular}');
`,
  }];
}

export function generateService(options: GeneratorOptions): GeneratedFile[] {
  const { name } = options;
  const baseDir = options.baseDir || 'src/api';
  const singular = kebabCase(name);
  const apiDir = join(baseDir, singular);

  return [{
    path: join(apiDir, 'services', `${singular}.ts`),
    content: `/**
 * ${singular} service.
 */

import { factories } from '@apick/core';

export default factories.createCoreService('api::${singular}.${singular}');
`,
  }];
}

export function generatePolicy(options: GeneratorOptions): GeneratedFile[] {
  const { name } = options;
  const baseDir = options.baseDir || 'src';
  const policyName = kebabCase(name);

  return [{
    path: join(baseDir, 'policies', `${policyName}.ts`),
    content: `/**
 * ${policyName} policy.
 */

export default (policyContext: any, config: any, { apick }: any) => {
  // Add your policy logic here
  // Return true to allow, false to deny
  if (policyContext.state.isAuthenticated) {
    return true;
  }
  return false;
};
`,
  }];
}

export function generateMiddleware(options: GeneratorOptions): GeneratedFile[] {
  const { name } = options;
  const baseDir = options.baseDir || 'src';
  const mwName = kebabCase(name);

  return [{
    path: join(baseDir, 'middlewares', `${mwName}.ts`),
    content: `/**
 * ${mwName} middleware.
 */

export default (config: any, { apick }: any) => {
  return async (ctx: any, next: () => Promise<void>) => {
    // Add your middleware logic here
    await next();
  };
};
`,
  }];
}

export function generatePlugin(options: GeneratorOptions): GeneratedFile[] {
  const { name } = options;
  const baseDir = options.baseDir || 'src/plugins';
  const pluginName = kebabCase(name);
  const pluginDir = join(baseDir, pluginName);
  const svcName = camelCase(name);

  const files: GeneratedFile[] = [];

  // package.json
  files.push({
    path: join(pluginDir, 'package.json'),
    content: JSON.stringify({
      name: `apick-plugin-${pluginName}`,
      version: '0.1.0',
      type: 'module',
      apick: {
        name: pluginName,
        displayName: pascalCase(name),
        description: `${pascalCase(name)} plugin for APICK`,
        kind: 'plugin',
      },
    }, null, 2) + '\n',
  });

  // server/src/index.ts
  files.push({
    path: join(pluginDir, 'server', 'src', 'index.ts'),
    content: `import { register } from './register.js';
import { bootstrap } from './bootstrap.js';
import { destroy } from './destroy.js';
import { config as configSchema } from './config/index.js';
import { services } from './services/index.js';
import { controllers } from './controllers/index.js';
import { routes } from './routes/index.js';

export default {
  register,
  bootstrap,
  destroy,
  config: configSchema,
  services,
  controllers,
  routes,
};
`,
  });

  // server/src/register.ts
  files.push({
    path: join(pluginDir, 'server', 'src', 'register.ts'),
    content: `export const register = ({ apick }: any) => {
  // Register phase: no DB access yet.
};
`,
  });

  // server/src/bootstrap.ts
  files.push({
    path: join(pluginDir, 'server', 'src', 'bootstrap.ts'),
    content: `export const bootstrap = ({ apick }: any) => {
  // Bootstrap phase: DB is available.
};
`,
  });

  // server/src/destroy.ts
  files.push({
    path: join(pluginDir, 'server', 'src', 'destroy.ts'),
    content: `export const destroy = ({ apick }: any) => {
  // Cleanup timers, connections, etc.
};
`,
  });

  // server/src/config/index.ts
  files.push({
    path: join(pluginDir, 'server', 'src', 'config', 'index.ts'),
    content: `export const config = {
  default: () => ({
    // default config
  }),
  validator: (config: any) => {
    // validate config
  },
};
`,
  });

  // server/src/services/index.ts
  files.push({
    path: join(pluginDir, 'server', 'src', 'services', 'index.ts'),
    content: `import { ${svcName}Service } from './${pluginName}.js';

export const services = {
  ${svcName}: ${svcName}Service,
};
`,
  });

  // server/src/services/{plugin}.ts
  files.push({
    path: join(pluginDir, 'server', 'src', 'services', `${pluginName}.ts`),
    content: `export const ${svcName}Service = ({ apick }: any) => ({
  getWelcomeMessage() {
    return 'Welcome to ${pascalCase(name)} plugin';
  },
});
`,
  });

  // server/src/controllers/index.ts
  files.push({
    path: join(pluginDir, 'server', 'src', 'controllers', 'index.ts'),
    content: `import { ${svcName}Controller } from './${pluginName}.js';

export const controllers = {
  ${svcName}: ${svcName}Controller,
};
`,
  });

  // server/src/controllers/{plugin}.ts
  files.push({
    path: join(pluginDir, 'server', 'src', 'controllers', `${pluginName}.ts`),
    content: `export const ${svcName}Controller = ({ apick }: any) => ({
  async index(ctx: any) {
    ctx.body = await apick.plugin('${pluginName}').service('${svcName}').getWelcomeMessage();
  },
});
`,
  });

  // server/src/routes/index.ts
  files.push({
    path: join(pluginDir, 'server', 'src', 'routes', 'index.ts'),
    content: `export const routes = {
  'content-api': [
    {
      method: 'GET',
      path: '/${pluginName}',
      handler: 'plugin::${pluginName}.${svcName}.index',
      config: { auth: false },
    },
  ],
  admin: [],
};
`,
  });

  return files;
}
