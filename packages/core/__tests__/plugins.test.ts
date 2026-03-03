import { describe, it, expect, beforeEach } from 'vitest';
import { createPluginManager, definePlugin } from '../src/plugins/index.js';
import type { PluginManager, PluginApickInterface, PluginDefinition } from '../src/plugins/index.js';

function createMockApick(): PluginApickInterface {
  const contentTypes = new Map<string, any>();
  const services = new Map<string, any>();
  const controllers = new Map<string, any>();
  const hooks = new Map<string, any>();

  return {
    plugin: () => undefined,
    config: {},
    contentTypes: {
      add(uid, def) { contentTypes.set(uid, def); },
      get(uid) { return contentTypes.get(uid); },
      has(uid) { return contentTypes.has(uid); },
      getAll() { const r: Record<string, any> = {}; contentTypes.forEach((v, k) => r[k] = v); return r; },
    },
    services: {
      add(uid, value) { services.set(uid, value); },
      get(uid) { return services.get(uid); },
      has(uid) { return services.has(uid); },
      getAll() { const r: Record<string, any> = {}; services.forEach((v, k) => r[k] = v); return r; },
    },
    controllers: {
      add(uid, value) { controllers.set(uid, value); },
      get(uid) { return controllers.get(uid); },
      has(uid) { return controllers.has(uid); },
      getAll() { const r: Record<string, any> = {}; controllers.forEach((v, k) => r[k] = v); return r; },
    },
    hooks: {
      get(name) {
        if (!hooks.has(name)) hooks.set(name, { register() {}, async call() {} });
        return hooks.get(name);
      },
    },
    customFields: {
      register() {},
      get() { return undefined; },
      getAll() { return {}; },
      has() { return false; },
    },
  };
}

describe('Plugin System', () => {
  let apick: PluginApickInterface;
  let manager: PluginManager;

  beforeEach(() => {
    apick = createMockApick();
    manager = createPluginManager({ apick });
  });

  // ---------------------------------------------------------------------------
  // Registration
  // ---------------------------------------------------------------------------

  describe('Registration', () => {
    it('registers a plugin', () => {
      manager.register('my-plugin', definePlugin({ name: 'my-plugin' }));
      manager.loadAll();
      expect(manager.has('my-plugin')).toBe(true);
    });

    it('registers multiple plugins', () => {
      manager.register('plugin-a', { name: 'plugin-a' });
      manager.register('plugin-b', { name: 'plugin-b' });
      manager.loadAll();
      expect(manager.has('plugin-a')).toBe(true);
      expect(manager.has('plugin-b')).toBe(true);
    });

    it('returns false for unregistered plugin', () => {
      expect(manager.has('nonexistent')).toBe(false);
    });

    it('gets a plugin instance', () => {
      manager.register('test', { name: 'test' });
      manager.loadAll();
      const instance = manager.get('test');
      expect(instance).toBeDefined();
      expect(instance!.name).toBe('test');
    });

    it('returns undefined for non-loaded plugin', () => {
      expect(manager.get('nope')).toBeUndefined();
    });

    it('lists all plugins', () => {
      manager.register('a', { name: 'a' });
      manager.register('b', { name: 'b' });
      manager.loadAll();
      const all = manager.getAll();
      expect(Object.keys(all)).toEqual(['a', 'b']);
    });
  });

  // ---------------------------------------------------------------------------
  // Disabling
  // ---------------------------------------------------------------------------

  describe('Disabling', () => {
    it('does not load disabled plugins', () => {
      const mgr = createPluginManager({
        apick,
        userConfig: { 'disabled-plugin': { enabled: false } },
      });
      mgr.register('disabled-plugin', { name: 'disabled-plugin' });
      mgr.loadAll();
      expect(mgr.has('disabled-plugin')).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // Configuration
  // ---------------------------------------------------------------------------

  describe('Configuration', () => {
    it('applies default config', () => {
      manager.register('configured', {
        name: 'configured',
        config: {
          default: { key: 'default-value', nested: { a: 1 } },
        },
      });
      manager.loadAll();
      const instance = manager.get('configured')!;
      expect(instance.config.key).toBe('default-value');
    });

    it('applies default config from factory function', () => {
      manager.register('factory-config', {
        name: 'factory-config',
        config: {
          default: () => ({ setting: 42 }),
        },
      });
      manager.loadAll();
      const instance = manager.get('factory-config')!;
      expect(instance.config.setting).toBe(42);
    });

    it('merges user config over defaults', () => {
      const mgr = createPluginManager({
        apick,
        userConfig: { merged: { config: { key: 'user-value', extra: true } } },
      });
      mgr.register('merged', {
        name: 'merged',
        config: { default: { key: 'default', other: 'kept' } },
      });
      mgr.loadAll();
      const instance = mgr.get('merged')!;
      expect(instance.config.key).toBe('user-value');
      expect(instance.config.other).toBe('kept');
      expect(instance.config.extra).toBe(true);
    });

    it('calls config validator', () => {
      let validated = false;
      manager.register('validated', {
        name: 'validated',
        config: {
          default: { apiKey: 'test' },
          validator: (config) => { validated = true; if (!config.apiKey) throw new Error('Missing apiKey'); },
        },
      });
      manager.loadAll();
      expect(validated).toBe(true);
    });

    it('throws on invalid config', () => {
      manager.register('invalid', {
        name: 'invalid',
        config: {
          default: {},
          validator: () => { throw new Error('Config invalid'); },
        },
      });
      expect(() => manager.loadAll()).toThrow('Config invalid');
    });
  });

  // ---------------------------------------------------------------------------
  // Services
  // ---------------------------------------------------------------------------

  describe('Services', () => {
    it('registers plugin services', () => {
      manager.register('svc-plugin', {
        name: 'svc-plugin',
        services: {
          myService: () => ({ greet: () => 'hello' }),
        },
      });
      manager.loadAll();
      const instance = manager.get('svc-plugin')!;
      const svc = instance.service('myService');
      expect(svc.greet()).toBe('hello');
    });

    it('makes services available via apick.services', () => {
      manager.register('svc', {
        name: 'svc',
        services: {
          counter: () => ({ count: 42 }),
        },
      });
      manager.loadAll();
      expect(apick.services.has('plugin::svc.counter')).toBe(true);
      expect(apick.services.get('plugin::svc.counter').count).toBe(42);
    });
  });

  // ---------------------------------------------------------------------------
  // Controllers
  // ---------------------------------------------------------------------------

  describe('Controllers', () => {
    it('registers plugin controllers', () => {
      manager.register('ctrl-plugin', {
        name: 'ctrl-plugin',
        controllers: {
          main: () => ({ index: () => 'ok' }),
        },
      });
      manager.loadAll();
      const instance = manager.get('ctrl-plugin')!;
      expect(instance.controller('main').index()).toBe('ok');
    });

    it('makes controllers available via apick.controllers', () => {
      manager.register('ctrl', {
        name: 'ctrl',
        controllers: { handler: () => ({ action: () => 'done' }) },
      });
      manager.loadAll();
      expect(apick.controllers.has('plugin::ctrl.handler')).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // Content Types
  // ---------------------------------------------------------------------------

  describe('Content Types', () => {
    it('registers plugin content types', () => {
      manager.register('ct-plugin', {
        name: 'ct-plugin',
        contentTypes: {
          tag: {
            schema: {
              singularName: 'tag', pluralName: 'tags', displayName: 'Tag',
              attributes: { name: { type: 'string', required: true } },
            },
          },
        },
      });
      manager.loadAll();
      expect(apick.contentTypes.has('plugin::ct-plugin.tag')).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  describe('Lifecycle', () => {
    it('calls register on all plugins', async () => {
      const calls: string[] = [];
      manager.register('a', { name: 'a', register: () => { calls.push('register-a'); } });
      manager.register('b', { name: 'b', register: () => { calls.push('register-b'); } });
      manager.loadAll();
      await manager.runRegister();
      expect(calls).toEqual(['register-a', 'register-b']);
    });

    it('calls bootstrap on all plugins', async () => {
      const calls: string[] = [];
      manager.register('a', { name: 'a', bootstrap: () => { calls.push('bootstrap-a'); } });
      manager.register('b', { name: 'b', bootstrap: () => { calls.push('bootstrap-b'); } });
      manager.loadAll();
      await manager.runBootstrap();
      expect(calls).toEqual(['bootstrap-a', 'bootstrap-b']);
    });

    it('calls destroy in reverse order', async () => {
      const calls: string[] = [];
      manager.register('a', { name: 'a', destroy: () => { calls.push('destroy-a'); } });
      manager.register('b', { name: 'b', destroy: () => { calls.push('destroy-b'); } });
      manager.loadAll();
      await manager.runDestroy();
      expect(calls).toEqual(['destroy-b', 'destroy-a']);
    });

    it('handles async lifecycle methods', async () => {
      const calls: string[] = [];
      manager.register('async-plugin', {
        name: 'async-plugin',
        register: async () => { await Promise.resolve(); calls.push('register'); },
        bootstrap: async () => { await Promise.resolve(); calls.push('bootstrap'); },
        destroy: async () => { await Promise.resolve(); calls.push('destroy'); },
      });
      manager.loadAll();
      await manager.runRegister();
      await manager.runBootstrap();
      await manager.runDestroy();
      expect(calls).toEqual(['register', 'bootstrap', 'destroy']);
    });
  });

  // ---------------------------------------------------------------------------
  // Dependencies
  // ---------------------------------------------------------------------------

  describe('Dependencies', () => {
    it('loads plugins in dependency order', () => {
      manager.register('dependent', {
        name: 'dependent',
        requiredPlugins: ['base'],
        services: { dep: () => ({ order: 2 }) },
      });
      manager.register('base', {
        name: 'base',
        services: { base: () => ({ order: 1 }) },
      });
      manager.loadAll();
      const order = manager.getLoadOrder();
      expect(order.indexOf('base')).toBeLessThan(order.indexOf('dependent'));
    });

    it('throws on missing required plugin', () => {
      manager.register('needs-missing', {
        name: 'needs-missing',
        requiredPlugins: ['nonexistent'],
      });
      expect(() => manager.loadAll()).toThrow('requires plugin "nonexistent"');
    });

    it('throws on circular dependencies', () => {
      manager.register('a', { name: 'a', requiredPlugins: ['b'] });
      manager.register('b', { name: 'b', requiredPlugins: ['a'] });
      expect(() => manager.loadAll()).toThrow('Circular plugin dependency');
    });

    it('handles optional plugins gracefully', () => {
      manager.register('with-optional', {
        name: 'with-optional',
        optionalPlugins: ['missing-optional'],
      });
      // Should not throw
      manager.loadAll();
      expect(manager.has('with-optional')).toBe(true);
    });

    it('loads optional plugins before dependent if available', () => {
      manager.register('consumer', {
        name: 'consumer',
        optionalPlugins: ['helper'],
      });
      manager.register('helper', { name: 'helper' });
      manager.loadAll();
      const order = manager.getLoadOrder();
      expect(order.indexOf('helper')).toBeLessThan(order.indexOf('consumer'));
    });
  });

  // ---------------------------------------------------------------------------
  // definePlugin helper
  // ---------------------------------------------------------------------------

  describe('definePlugin', () => {
    it('returns the definition as-is', () => {
      const def = definePlugin({ name: 'test', config: { default: { key: 'val' } } });
      expect(def.name).toBe('test');
      expect(def.config?.default).toEqual({ key: 'val' });
    });
  });
});
