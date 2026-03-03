import { describe, it, expect } from 'vitest';
import {
  generateApi, generateController, generateService,
  generatePolicy, generateMiddleware, generatePlugin,
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
      expect(paths).toContain('src/api/blog-post/content-types/blog-post/schema.ts');
      expect(paths).toContain('src/api/blog-post/controllers/blog-post.ts');
      expect(paths).toContain('src/api/blog-post/services/blog-post.ts');
      expect(paths).toContain('src/api/blog-post/routes/blog-post.ts');
    });

    it('generates content type schema with singularName and pluralName', () => {
      const files = generateApi({ name: 'article' });
      const schema = files.find(f => f.path.includes('schema.ts'))!;
      expect(schema.content).toContain("singularName: 'article'");
      expect(schema.content).toContain("pluralName: 'articles'");
      expect(schema.content).toContain("displayName: 'Article'");
    });

    it('generates controller with UID', () => {
      const files = generateApi({ name: 'article' });
      const ctrl = files.find(f => f.path.includes('controllers'))!;
      expect(ctrl.content).toContain("'api::article.article'");
    });

    it('respects custom baseDir', () => {
      const files = generateApi({ name: 'post', baseDir: 'custom/api' });
      expect(files[0].path.startsWith('custom/api/')).toBe(true);
    });

    it('respects custom singular and plural names', () => {
      const files = generateApi({ name: 'person', singularName: 'person', pluralName: 'people' });
      const schema = files.find(f => f.path.includes('schema.ts'))!;
      expect(schema.content).toContain("singularName: 'person'");
      expect(schema.content).toContain("pluralName: 'people'");
    });

    it('handles PascalCase name', () => {
      const files = generateApi({ name: 'BlogPost' });
      const paths = files.map(f => f.path);
      expect(paths[0]).toContain('blog-post');
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
      expect(files[0].content).toContain('createCoreController');
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
      expect(files[0].content).toContain('createCoreService');
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
});
