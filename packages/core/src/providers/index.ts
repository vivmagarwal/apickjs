/**
 * Provider System.
 *
 * Manages provider loading, lifecycle, and a generic domain-based
 * provider registry for upload, email, and custom domains.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ProviderDefinition<T = any> {
  init(providerOptions: Record<string, any>): T | Promise<T>;
  register?: (providerOptions: Record<string, any>) => void | Promise<void>;
  bootstrap?: (providerOptions: Record<string, any>) => void | Promise<void>;
  destroy?: (providerOptions: Record<string, any>) => void | Promise<void>;
}

export interface UploadProviderInterface {
  upload(file: UploadFile): Promise<void> | void;
  uploadStream?(file: UploadFile): Promise<void> | void;
  delete(file: UploadFile): Promise<void> | void;
  checkFileSize?(file: UploadFile, options: { sizeLimit: number }): void;
  isPrivate?(): boolean;
  getSignedUrl?(file: UploadFile, options?: { expires?: number }): Promise<{ url: string }> | { url: string };
}

export interface UploadFile {
  name: string;
  hash: string;
  ext: string;
  mime: string;
  size: number;
  width?: number | null;
  height?: number | null;
  url: string;
  buffer?: Buffer;
  stream?: NodeJS.ReadableStream;
  path?: string;
}

export interface EmailProviderInterface {
  send(options: EmailSendOptions): Promise<void> | void;
}

export interface EmailSendOptions {
  to: string | string[];
  from?: string;
  cc?: string | string[];
  bcc?: string | string[];
  replyTo?: string;
  subject: string;
  text?: string;
  html?: string;
}

export interface ProviderDomain<T = any> {
  name: string;
  required: string[];
  optional: string[];
  instance?: T;
  definition?: ProviderDefinition<T>;
  options?: Record<string, any>;
}

export interface ProviderRegistry {
  registerDomain<T = any>(name: string, spec: { required?: string[]; optional?: string[] }): void;
  hasDomain(name: string): boolean;
  setProvider<T = any>(domain: string, definition: ProviderDefinition<T>, options?: Record<string, any>): void;
  getProvider<T = any>(domain: string): T | undefined;
  initAll(): Promise<void>;
  bootstrapAll(): Promise<void>;
  destroyAll(): Promise<void>;
  getDomains(): string[];
}

// ---------------------------------------------------------------------------
// defineProvider helper
// ---------------------------------------------------------------------------

export function defineProvider<T = any>(definition: ProviderDefinition<T>): ProviderDefinition<T> {
  return definition;
}

// ---------------------------------------------------------------------------
// Provider Registry factory
// ---------------------------------------------------------------------------

export function createProviderRegistry(): ProviderRegistry {
  const domains = new Map<string, ProviderDomain>();

  return {
    registerDomain(name, spec = {}) {
      if (domains.has(name)) return;
      domains.set(name, {
        name,
        required: spec.required || [],
        optional: spec.optional || [],
      });
    },

    hasDomain(name) {
      return domains.has(name);
    },

    setProvider(domain, definition, options = {}) {
      const d = domains.get(domain);
      if (!d) {
        throw new Error(`Provider domain "${domain}" is not registered. Call registerDomain() first.`);
      }
      d.definition = definition;
      d.options = options;

      // Validate required methods
      // We'll do this after init since init returns the actual instance
    },

    getProvider<T = any>(domain: string): T | undefined {
      const d = domains.get(domain);
      return d?.instance as T | undefined;
    },

    async initAll() {
      for (const [, d] of domains) {
        if (!d.definition) continue;

        // Run register phase
        if (d.definition.register) {
          await d.definition.register(d.options || {});
        }

        // Init the provider
        d.instance = await d.definition.init(d.options || {});

        // Validate required methods
        if (d.required.length > 0 && d.instance) {
          for (const method of d.required) {
            if (typeof (d.instance as any)[method] !== 'function') {
              throw new Error(`Provider for domain "${d.name}" is missing required method "${method}"`);
            }
          }
        }
      }
    },

    async bootstrapAll() {
      for (const [, d] of domains) {
        if (d.definition?.bootstrap) {
          await d.definition.bootstrap(d.options || {});
        }
      }
    },

    async destroyAll() {
      // Destroy in reverse insertion order
      const entries = [...domains.entries()].reverse();
      for (const [, d] of entries) {
        if (d.definition?.destroy) {
          await d.definition.destroy(d.options || {});
        }
      }
    },

    getDomains() {
      return [...domains.keys()];
    },
  };
}
