import { describe, it, expect } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import {
  generateApi, generateController, generateService,
  generatePolicy, generateMiddleware, generatePlugin,
  generateProject, writeGeneratedFiles,
} from '../src/generators.js';

describe('@apick/generators', () => {
  // ---------------------------------------------------------------------------
  // API generator
  // ---------------------------------------------------------------------------

  describe('generateApi', () => {
    it('generates all API scaffold files', () => {
      const files = generateApi({ name: 'blog-post' });
      expect(files).toHaveLength(4);

      const paths = files.map(f => f.path);
      expect(paths).toContain('src/api/blog-post/content-type.ts');
      expect(paths).toContain('src/api/blog-post/controllers/blog-post.ts');
      expect(paths).toContain('src/api/blog-post/services/blog-post.ts');
      expect(paths).toContain('src/api/blog-post/routes/blog-post.ts');
    });

    it('generates content type schema with singularName and pluralName', () => {
      const files = generateApi({ name: 'article' });
      const schema = files.find(f => f.path.includes('content-type.ts'))!;
      expect(schema.content).toContain("singularName: 'article'");
      expect(schema.content).toContain("pluralName: 'articles'");
      expect(schema.content).toContain("displayName: 'Article'");
    });

    it('respects custom baseDir', () => {
      const files = generateApi({ name: 'post', baseDir: 'custom/api' });
      expect(files[0].path.startsWith('custom/api/')).toBe(true);
    });

    it('respects custom singular and plural names', () => {
      const files = generateApi({ name: 'person', singularName: 'person', pluralName: 'people' });
      const schema = files.find(f => f.path.includes('content-type.ts'))!;
      expect(schema.content).toContain("singularName: 'person'");
      expect(schema.content).toContain("pluralName: 'people'");
    });

    it('handles PascalCase name', () => {
      const files = generateApi({ name: 'BlogPost' });
      const paths = files.map(f => f.path);
      expect(paths[0]).toContain('blog-post');
    });

    it('supports kind option', () => {
      const files = generateApi({ name: 'homepage', kind: 'singleType' });
      const schema = files.find(f => f.path.includes('content-type.ts'))!;
      expect(schema.content).toContain("kind: 'singleType'");
    });

    it('supports displayName option', () => {
      const files = generateApi({ name: 'blog', displayName: 'Blog Entry' });
      const schema = files.find(f => f.path.includes('content-type.ts'))!;
      expect(schema.content).toContain("displayName: 'Blog Entry'");
    });

    it('supports custom attributes', () => {
      const files = generateApi({
        name: 'product',
        attributes: {
          title: { type: 'string', required: true },
          price: { type: 'decimal' },
          category: { type: 'enumeration', enum: ['electronics', 'clothing'] },
        },
      });
      const schema = files.find(f => f.path.includes('content-type.ts'))!;
      expect(schema.content).toContain("title:");
      expect(schema.content).toContain("type: 'string'");
      expect(schema.content).toContain("price:");
      expect(schema.content).toContain("category:");
    });

    it('defaults draftAndPublish to false', () => {
      const files = generateApi({ name: 'test' });
      const schema = files.find(f => f.path.includes('content-type.ts'))!;
      expect(schema.content).toContain('draftAndPublish: false');
    });

    it('uses plain object exports (not factories)', () => {
      const files = generateApi({ name: 'test' });
      const ctrl = files.find(f => f.path.includes('controllers'))!;
      expect(ctrl.content).toContain('export default {}');
      expect(ctrl.content).not.toContain('factories');
    });
  });

  // ---------------------------------------------------------------------------
  // Controller generator
  // ---------------------------------------------------------------------------

  describe('generateController', () => {
    it('generates a controller file', () => {
      const files = generateController({ name: 'article' });
      expect(files).toHaveLength(1);
      expect(files[0].path).toContain('controllers/article.ts');
      expect(files[0].content).toContain('export default {}');
    });
  });

  // ---------------------------------------------------------------------------
  // Service generator
  // ---------------------------------------------------------------------------

  describe('generateService', () => {
    it('generates a service file', () => {
      const files = generateService({ name: 'article' });
      expect(files).toHaveLength(1);
      expect(files[0].path).toContain('services/article.ts');
      expect(files[0].content).toContain('export default {}');
    });
  });

  // ---------------------------------------------------------------------------
  // Policy generator
  // ---------------------------------------------------------------------------

  describe('generatePolicy', () => {
    it('generates a policy file', () => {
      const files = generatePolicy({ name: 'is-admin' });
      expect(files).toHaveLength(1);
      expect(files[0].path).toContain('policies/is-admin.ts');
      expect(files[0].content).toContain('policyContext');
      expect(files[0].content).toContain('isAuthenticated');
    });
  });

  // ---------------------------------------------------------------------------
  // Middleware generator
  // ---------------------------------------------------------------------------

  describe('generateMiddleware', () => {
    it('generates a middleware file', () => {
      const files = generateMiddleware({ name: 'rate-limit' });
      expect(files).toHaveLength(1);
      expect(files[0].path).toContain('middlewares/rate-limit.ts');
      expect(files[0].content).toContain('async (ctx');
      expect(files[0].content).toContain('await next()');
    });
  });

  // ---------------------------------------------------------------------------
  // Plugin generator
  // ---------------------------------------------------------------------------

  describe('generatePlugin', () => {
    it('generates full plugin scaffold', () => {
      const files = generatePlugin({ name: 'analytics' });
      expect(files.length).toBeGreaterThanOrEqual(10);

      const paths = files.map(f => f.path);
      expect(paths.some(p => p.includes('package.json'))).toBe(true);
      expect(paths.some(p => p.includes('server/src/index.ts'))).toBe(true);
      expect(paths.some(p => p.includes('server/src/register.ts'))).toBe(true);
      expect(paths.some(p => p.includes('server/src/bootstrap.ts'))).toBe(true);
      expect(paths.some(p => p.includes('server/src/destroy.ts'))).toBe(true);
      expect(paths.some(p => p.includes('server/src/config/index.ts'))).toBe(true);
      expect(paths.some(p => p.includes('server/src/services/'))).toBe(true);
      expect(paths.some(p => p.includes('server/src/controllers/'))).toBe(true);
      expect(paths.some(p => p.includes('server/src/routes/'))).toBe(true);
    });

    it('generates package.json with apick metadata', () => {
      const files = generatePlugin({ name: 'seo' });
      const pkgFile = files.find(f => f.path.includes('package.json'))!;
      const pkg = JSON.parse(pkgFile.content);
      expect(pkg.apick.name).toBe('seo');
      expect(pkg.apick.kind).toBe('plugin');
      expect(pkg.name).toBe('apick-plugin-seo');
    });

    it('generates service with plugin name', () => {
      const files = generatePlugin({ name: 'analytics' });
      const svcFile = files.find(f => f.path.includes('services/analytics.ts'))!;
      expect(svcFile.content).toContain('analyticsService');
      expect(svcFile.content).toContain('getWelcomeMessage');
    });

    it('generates routes with correct handler UIDs', () => {
      const files = generatePlugin({ name: 'analytics' });
      const routeFile = files.find(f => f.path.includes('routes/index.ts'))!;
      expect(routeFile.content).toContain("plugin::analytics.analytics");
    });

    it('respects custom baseDir', () => {
      const files = generatePlugin({ name: 'custom', baseDir: 'custom/plugins' });
      expect(files[0].path.startsWith('custom/plugins/')).toBe(true);
    });

    it('converts camelCase names to kebab-case', () => {
      const files = generatePlugin({ name: 'MyPlugin' });
      const pkgFile = files.find(f => f.path.includes('package.json'))!;
      const pkg = JSON.parse(pkgFile.content);
      expect(pkg.apick.name).toBe('my-plugin');
    });
  });

  // ---------------------------------------------------------------------------
  // Project generator
  // ---------------------------------------------------------------------------

  describe('generateProject', () => {
    it('generates project files for sqlite', () => {
      const files = generateProject({ name: 'my-app' });
      const paths = files.map(f => f.path);
      expect(paths).toContain('package.json');
      expect(paths).toContain('tsconfig.json');
      expect(paths).toContain('.env');
      expect(paths).toContain('.gitignore');
      expect(paths).toContain('config/server.ts');
      expect(paths).toContain('config/database.ts');
      expect(paths).toContain('config/admin.ts');
      expect(paths).toContain('config/api.ts');
      expect(paths).toContain('config/middlewares.ts');
      expect(paths).toContain('src/api/.gitkeep');
    });

    it('generates correct package.json', () => {
      const files = generateProject({ name: 'My App' });
      const pkg = JSON.parse(files.find(f => f.path === 'package.json')!.content);
      expect(pkg.name).toBe('my-app');
      expect(pkg.type).toBe('module');
      expect(pkg.scripts.develop).toBe('apick develop');
      expect(pkg.dependencies['@apick/cli']).toBeDefined();
    });

    it('uses sqlite config by default', () => {
      const files = generateProject({ name: 'app' });
      const db = files.find(f => f.path === 'config/database.ts')!;
      expect(db.content).toContain("client: 'sqlite'");
    });

    it('generates postgres config', () => {
      const files = generateProject({ name: 'app', database: 'postgres' });
      const db = files.find(f => f.path === 'config/database.ts')!;
      expect(db.content).toContain("client: 'postgres'");
    });

    it('generates mysql config', () => {
      const files = generateProject({ name: 'app', database: 'mysql' });
      const db = files.find(f => f.path === 'config/database.ts')!;
      expect(db.content).toContain("client: 'mysql'");
    });

    it('uses custom port', () => {
      const files = generateProject({ name: 'app', port: 3000 });
      const server = files.find(f => f.path === 'config/server.ts')!;
      expect(server.content).toContain('port: 3000');
      const env = files.find(f => f.path === '.env')!;
      expect(env.content).toContain('PORT=3000');
    });
  });

  // ---------------------------------------------------------------------------
  // writeGeneratedFiles
  // ---------------------------------------------------------------------------

  describe('writeGeneratedFiles', () => {
    it('writes files to disk', () => {
      const tmpDir = mkdtempSync(join(tmpdir(), 'apick-gen-'));
      const files = [
        { path: 'test/hello.txt', content: 'hello world' },
        { path: 'test/nested/file.txt', content: 'nested' },
      ];
      writeGeneratedFiles(files, tmpDir);

      expect(existsSync(join(tmpDir, 'test/hello.txt'))).toBe(true);
      expect(readFileSync(join(tmpDir, 'test/hello.txt'), 'utf8')).toBe('hello world');
      expect(existsSync(join(tmpDir, 'test/nested/file.txt'))).toBe(true);
      expect(readFileSync(join(tmpDir, 'test/nested/file.txt'), 'utf8')).toBe('nested');
    });
  });
});
