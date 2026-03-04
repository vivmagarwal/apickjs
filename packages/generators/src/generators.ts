/**
 * Code Generators.
 *
 * Generates scaffold files for APIs, controllers, services, policies,
 * middlewares, plugins, and projects.
 */

import { join } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GeneratorOptions {
  name: string;
  baseDir?: string;
  singularName?: string;
  pluralName?: string;
  displayName?: string;
  kind?: 'collectionType' | 'singleType';
  draftAndPublish?: boolean;
  attributes?: Record<string, any>;
}

export interface ProjectOptions {
  name: string;
  database?: 'sqlite' | 'postgres' | 'mysql';
  port?: number;
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
// Write utility
// ---------------------------------------------------------------------------

export function writeGeneratedFiles(files: GeneratedFile[], rootDir: string): void {
  for (const file of files) {
    const fullPath = join(rootDir, file.path);
    mkdirSync(dirname(fullPath), { recursive: true });
    writeFileSync(fullPath, file.content, 'utf8');
  }
}

// ---------------------------------------------------------------------------
// Attribute serializer
// ---------------------------------------------------------------------------

function serializeAttributes(attributes: Record<string, any>): string {
  const lines: string[] = [];
  for (const [key, config] of Object.entries(attributes)) {
    const parts: string[] = [];
    for (const [prop, val] of Object.entries(config)) {
      if (typeof val === 'string') {
        parts.push(`${prop}: '${val}'`);
      } else if (Array.isArray(val)) {
        parts.push(`${prop}: [${val.map(v => `'${v}'`).join(', ')}]`);
      } else {
        parts.push(`${prop}: ${JSON.stringify(val)}`);
      }
    }
    lines.push(`    ${key}: { ${parts.join(', ')} },`);
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

export function generateApi(options: GeneratorOptions): GeneratedFile[] {
  const { name } = options;
  const baseDir = options.baseDir || 'src/api';
  const singular = options.singularName || kebabCase(name);
  const plural = options.pluralName || pluralize(singular);
  const display = options.displayName || pascalCase(name);
  const kind = options.kind || 'collectionType';
  const draftAndPublish = options.draftAndPublish ?? false;
  const apiDir = join(baseDir, singular);

  const attributes = options.attributes || {
    title: { type: 'string', required: true },
    description: { type: 'text' },
  };

  const files: GeneratedFile[] = [];

  // Content type — matches core/lifecycle/apick.ts:402 auto-discovery path
  files.push({
    path: join(apiDir, 'content-type.ts'),
    content: `export default {
  kind: '${kind}' as const,
  info: {
    singularName: '${singular}',
    pluralName: '${plural}',
    displayName: '${display}',
  },
  options: {
    draftAndPublish: ${draftAndPublish},
  },
  attributes: {
${serializeAttributes(attributes)}
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

export default {};
`,
  });

  // Service
  files.push({
    path: join(apiDir, 'services', `${singular}.ts`),
    content: `/**
 * ${singular} service.
 */

export default {};
`,
  });

  // Routes
  files.push({
    path: join(apiDir, 'routes', `${singular}.ts`),
    content: `/**
 * ${singular} router.
 */

export default {};
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

export default {};
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

export default {};
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

// ---------------------------------------------------------------------------
// Project generator
// ---------------------------------------------------------------------------

export function generateProject(options: ProjectOptions): GeneratedFile[] {
  const { name, database = 'sqlite', port = 1337 } = options;
  const files: GeneratedFile[] = [];

  // package.json
  files.push({
    path: 'package.json',
    content: JSON.stringify({
      name: kebabCase(name),
      version: '1.0.0',
      type: 'module',
      private: true,
      scripts: {
        develop: 'apick develop',
        start: 'apick start',
        build: 'apick build',
      },
      dependencies: {
        '@apick/cli': '^0.4.0',
        '@apick/core': '^0.3.0',
        '@apick/types': '^0.3.0',
      },
    }, null, 2) + '\n',
  });

  // tsconfig.json
  files.push({
    path: 'tsconfig.json',
    content: JSON.stringify({
      compilerOptions: {
        target: 'ES2022',
        module: 'Node16',
        moduleResolution: 'Node16',
        strict: true,
        esModuleInterop: true,
        skipLibCheck: true,
        outDir: './dist',
        rootDir: '.',
        declaration: true,
      },
      include: ['src/**/*', 'config/**/*'],
    }, null, 2) + '\n',
  });

  // .env
  const envLines = [`HOST=0.0.0.0`, `PORT=${port}`];
  if (database === 'sqlite') {
    envLines.push('DATABASE_CLIENT=sqlite', 'DATABASE_FILENAME=.tmp/data.db');
  } else if (database === 'postgres') {
    envLines.push('DATABASE_CLIENT=postgres', 'DATABASE_HOST=127.0.0.1', 'DATABASE_PORT=5432', 'DATABASE_NAME=' + kebabCase(name), 'DATABASE_USERNAME=', 'DATABASE_PASSWORD=');
  } else if (database === 'mysql') {
    envLines.push('DATABASE_CLIENT=mysql', 'DATABASE_HOST=127.0.0.1', 'DATABASE_PORT=3306', 'DATABASE_NAME=' + kebabCase(name), 'DATABASE_USERNAME=root', 'DATABASE_PASSWORD=');
  }
  files.push({ path: '.env', content: envLines.join('\n') + '\n' });

  // .gitignore
  files.push({
    path: '.gitignore',
    content: `node_modules/
dist/
.tmp/
.env
*.log
`,
  });

  // config/server.ts
  files.push({
    path: 'config/server.ts',
    content: `export default {
  host: '0.0.0.0',
  port: ${port},
};
`,
  });

  // config/database.ts
  if (database === 'sqlite') {
    files.push({
      path: 'config/database.ts',
      content: `export default {
  connection: {
    client: 'sqlite',
    connection: { filename: '.tmp/data.db' },
  },
};
`,
    });
  } else if (database === 'postgres') {
    files.push({
      path: 'config/database.ts',
      content: `export default {
  connection: {
    client: 'postgres',
    connection: {
      host: process.env.DATABASE_HOST || '127.0.0.1',
      port: parseInt(process.env.DATABASE_PORT || '5432', 10),
      database: process.env.DATABASE_NAME || '${kebabCase(name)}',
      user: process.env.DATABASE_USERNAME || '',
      password: process.env.DATABASE_PASSWORD || '',
    },
  },
};
`,
    });
  } else {
    files.push({
      path: 'config/database.ts',
      content: `export default {
  connection: {
    client: 'mysql',
    connection: {
      host: process.env.DATABASE_HOST || '127.0.0.1',
      port: parseInt(process.env.DATABASE_PORT || '3306', 10),
      database: process.env.DATABASE_NAME || '${kebabCase(name)}',
      user: process.env.DATABASE_USERNAME || 'root',
      password: process.env.DATABASE_PASSWORD || '',
    },
  },
};
`,
    });
  }

  // config/admin.ts
  files.push({
    path: 'config/admin.ts',
    content: `export default {};
`,
  });

  // config/api.ts
  files.push({
    path: 'config/api.ts',
    content: `export default {
  rest: { prefix: '/api' },
};
`,
  });

  // config/middlewares.ts
  files.push({
    path: 'config/middlewares.ts',
    content: `export default [];
`,
  });

  // src/api/.gitkeep
  files.push({ path: 'src/api/.gitkeep', content: '' });

  return files;
}
