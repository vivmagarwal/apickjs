import { describe, it, expect, beforeEach } from 'vitest';
import { createProviderRegistry, defineProvider } from '../src/providers/index.js';
import type { ProviderRegistry } from '../src/providers/index.js';

describe('Provider System', () => {
  let registry: ProviderRegistry;

  beforeEach(() => {
    registry = createProviderRegistry();
  });

  // ---------------------------------------------------------------------------
  // Domain registration
  // ---------------------------------------------------------------------------

  describe('Domain registration', () => {
    it('registers a domain', () => {
      registry.registerDomain('upload', { required: ['upload', 'delete'] });
      expect(registry.hasDomain('upload')).toBe(true);
    });

    it('registers multiple domains', () => {
      registry.registerDomain('upload', { required: ['upload', 'delete'] });
      registry.registerDomain('email', { required: ['send'] });
      expect(registry.getDomains()).toEqual(['upload', 'email']);
    });

    it('does not duplicate domain on re-registration', () => {
      registry.registerDomain('upload', {});
      registry.registerDomain('upload', {});
      expect(registry.getDomains()).toEqual(['upload']);
    });

    it('returns false for unregistered domain', () => {
      expect(registry.hasDomain('nonexistent')).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // Provider setting
  // ---------------------------------------------------------------------------

  describe('Provider setting', () => {
    it('sets a provider for a domain', async () => {
      registry.registerDomain('email', { required: ['send'] });
      registry.setProvider('email', defineProvider({
        init: () => ({ send: () => {} }),
      }));
      await registry.initAll();
      const provider = registry.getProvider('email');
      expect(provider).toBeDefined();
      expect(typeof provider.send).toBe('function');
    });

    it('throws when setting provider for unregistered domain', () => {
      expect(() => {
        registry.setProvider('nope', defineProvider({ init: () => ({}) }));
      }).toThrow('not registered');
    });

    it('validates required methods after init', async () => {
      registry.registerDomain('upload', { required: ['upload', 'delete'] });
      registry.setProvider('upload', defineProvider({
        init: () => ({ upload: () => {} }), // missing 'delete'
      }));
      await expect(registry.initAll()).rejects.toThrow('missing required method "delete"');
    });

    it('passes providerOptions to init', async () => {
      let receivedOptions: any;
      registry.registerDomain('email', { required: ['send'] });
      registry.setProvider('email', defineProvider({
        init: (opts) => { receivedOptions = opts; return { send: () => {} }; },
      }), { apiKey: 'test-key' });
      await registry.initAll();
      expect(receivedOptions.apiKey).toBe('test-key');
    });

    it('returns undefined for domain with no provider', () => {
      registry.registerDomain('upload', {});
      expect(registry.getProvider('upload')).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  describe('Lifecycle', () => {
    it('calls register before init', async () => {
      const calls: string[] = [];
      registry.registerDomain('test', {});
      registry.setProvider('test', defineProvider({
        register: () => { calls.push('register'); },
        init: () => { calls.push('init'); return {}; },
      }));
      await registry.initAll();
      expect(calls).toEqual(['register', 'init']);
    });

    it('calls bootstrap after init', async () => {
      const calls: string[] = [];
      registry.registerDomain('test', {});
      registry.setProvider('test', defineProvider({
        init: () => { calls.push('init'); return {}; },
        bootstrap: () => { calls.push('bootstrap'); },
      }));
      await registry.initAll();
      await registry.bootstrapAll();
      expect(calls).toEqual(['init', 'bootstrap']);
    });

    it('calls destroy in reverse order', async () => {
      const calls: string[] = [];
      registry.registerDomain('a', {});
      registry.registerDomain('b', {});
      registry.setProvider('a', defineProvider({
        init: () => ({}),
        destroy: () => { calls.push('destroy-a'); },
      }));
      registry.setProvider('b', defineProvider({
        init: () => ({}),
        destroy: () => { calls.push('destroy-b'); },
      }));
      await registry.initAll();
      await registry.destroyAll();
      expect(calls).toEqual(['destroy-b', 'destroy-a']);
    });

    it('handles async lifecycle methods', async () => {
      const calls: string[] = [];
      registry.registerDomain('async', {});
      registry.setProvider('async', defineProvider({
        register: async () => { await Promise.resolve(); calls.push('register'); },
        init: async () => { await Promise.resolve(); calls.push('init'); return {}; },
        bootstrap: async () => { await Promise.resolve(); calls.push('bootstrap'); },
        destroy: async () => { await Promise.resolve(); calls.push('destroy'); },
      }));
      await registry.initAll();
      await registry.bootstrapAll();
      await registry.destroyAll();
      expect(calls).toEqual(['register', 'init', 'bootstrap', 'destroy']);
    });
  });

  // ---------------------------------------------------------------------------
  // Upload provider example
  // ---------------------------------------------------------------------------

  describe('Upload provider', () => {
    it('works as an upload provider', async () => {
      registry.registerDomain('upload', { required: ['upload', 'delete'] });
      const uploads: string[] = [];
      const deletes: string[] = [];
      registry.setProvider('upload', defineProvider({
        init: (opts) => ({
          upload: (file: any) => { uploads.push(file.name); file.url = `https://cdn.example.com/${file.hash}`; },
          delete: (file: any) => { deletes.push(file.name); },
        }),
      }), { bucket: 'test-bucket' });
      await registry.initAll();

      const provider = registry.getProvider('upload');
      const file = { name: 'photo.jpg', hash: 'abc123', ext: '.jpg', mime: 'image/jpeg', size: 100, url: '' };
      provider.upload(file);
      expect(uploads).toEqual(['photo.jpg']);
      expect(file.url).toBe('https://cdn.example.com/abc123');

      provider.delete(file);
      expect(deletes).toEqual(['photo.jpg']);
    });
  });

  // ---------------------------------------------------------------------------
  // Email provider example
  // ---------------------------------------------------------------------------

  describe('Email provider', () => {
    it('works as an email provider', async () => {
      registry.registerDomain('email', { required: ['send'] });
      const sent: any[] = [];
      registry.setProvider('email', defineProvider({
        init: (opts) => ({
          send: (options: any) => { sent.push(options); },
        }),
      }), { apiKey: 'sg-test' });
      await registry.initAll();

      const provider = registry.getProvider('email');
      provider.send({ to: 'user@example.com', subject: 'Test', text: 'Hello' });
      expect(sent).toHaveLength(1);
      expect(sent[0].to).toBe('user@example.com');
    });
  });

  // ---------------------------------------------------------------------------
  // defineProvider helper
  // ---------------------------------------------------------------------------

  describe('defineProvider', () => {
    it('returns the definition as-is', () => {
      const def = defineProvider({
        init: () => ({ send: () => {} }),
        register: () => {},
      });
      expect(typeof def.init).toBe('function');
      expect(typeof def.register).toBe('function');
    });
  });
});
