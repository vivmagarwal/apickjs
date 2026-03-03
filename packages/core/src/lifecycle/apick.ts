/**
 * The Apick class — central runtime for the APICK CMS.
 *
 * Implements the full lifecycle: constructor → load → listen → destroy.
 * Acts as the service locator (container) providing access to all registries,
 * services, event hub, cache, logger, database, and server.
 */

import path from 'node:path';
import type {
  Apick as ApickInterface,
  ConfigAccessor,
  Logger,
  CacheService,
  ApickDirs,
  Server,
  EventHub,
  HookRegistry,
  CustomFieldRegistry,
  DatabaseService,
} from '@apick/types';
import { createConfigProvider } from '../config/index.js';
import { createLogger } from '../logging/index.js';
import { createEventHub } from '../event-hub/index.js';
import { createCache } from '../cache/index.js';
import { createServer } from '../server/index.js';
import {
  createRegistry,
  createLazyRegistry,
  createHookRegistry,
  createCustomFieldRegistry,
} from '../registries/index.js';
import { createDatabase } from '../database/connection.js';
import { createQueryEngine } from '../query-engine/index.js';
import { syncSchemas } from '../database/sync/index.js';
import { createLifecycleRegistry } from '../database/lifecycles/index.js';
import { normalizeContentType } from '../content-types/index.js';
import type { ContentTypeSchema } from '../content-types/index.js';
import { createDocumentServiceManager, type DocumentServiceManager } from '../document-service/index.js';

export interface ApickOptions {
  appDir: string;
  distDir?: string;
}

export class Apick implements ApickInterface {
  // --- Core services ---
  config: ConfigAccessor & { _load?(): Promise<void> };
  log: Logger;
  eventHub: EventHub;
  cache: CacheService;
  server: Server;
  dirs: ApickDirs;
  isLoaded = false;

  // --- Registries ---
  contentTypes: ReturnType<typeof createRegistry>;
  components: ReturnType<typeof createRegistry>;
  services: ReturnType<typeof createLazyRegistry>;
  controllers: ReturnType<typeof createLazyRegistry>;
  policies: ReturnType<typeof createRegistry>;
  middlewares: ReturnType<typeof createRegistry>;
  hooks: HookRegistry;
  apis: ReturnType<typeof createRegistry>;
  plugins: ReturnType<typeof createRegistry>;
  modules: ReturnType<typeof createRegistry>;
  models: ReturnType<typeof createRegistry>;
  customFields: CustomFieldRegistry;
  validators: ReturnType<typeof createRegistry>;
  sanitizers: ReturnType<typeof createRegistry>;

  // --- Database (set during bootstrap) ---
  db: DatabaseService = null as any;

  // --- Document Service Manager ---
  private _documents: DocumentServiceManager | null = null;

  // --- Container (generic add/get/has) ---
  private container = new Map<string, { factory: (opts: { apick: ApickInterface }) => any; instance?: any }>();

  // --- Options ---
  private appDir: string;
  private distDir: string;

  constructor(options: ApickOptions) {
    this.appDir = options.appDir;
    this.distDir = options.distDir || path.join(options.appDir, 'dist');

    // Dirs
    this.dirs = {
      app: {
        root: this.appDir,
        src: path.join(this.appDir, 'src'),
        config: path.join(this.appDir, 'config'),
        public: path.join(this.appDir, 'public'),
      },
      dist: {
        root: this.distDir,
        src: path.join(this.distDir, 'src'),
        config: path.join(this.distDir, 'config'),
      },
    };

    // 1. Configuration
    this.config = createConfigProvider({ appDir: this.appDir, distDir: this.distDir });

    // 2. Logger (create with defaults, reconfigure after config loads)
    this.log = createLogger({ level: 'info' });

    // 3. Event Hub
    this.eventHub = createEventHub({ logger: this.log });

    // 4. Cache
    this.cache = createCache();

    // 5. Server
    this.server = createServer({
      logger: this.log,
      proxyEnabled: false,
    });

    // 6. Registries
    this.contentTypes = createRegistry();
    this.components = createRegistry();
    this.policies = createRegistry();
    this.middlewares = createRegistry();
    this.hooks = createHookRegistry();
    this.apis = createRegistry();
    this.plugins = createRegistry();
    this.modules = createRegistry();
    this.models = createRegistry();
    this.customFields = createCustomFieldRegistry();
    this.validators = createRegistry();
    this.sanitizers = createRegistry();

    // Lazy registries need `this` (the apick instance)
    this.services = createLazyRegistry(this);
    this.controllers = createLazyRegistry(this);
  }

  // --- Registry access shortcuts ---

  service(uid: string): any {
    return this.services.get(uid);
  }

  controller(uid: string): any {
    return this.controllers.get(uid);
  }

  policy(uid: string): any {
    return this.policies.get(uid);
  }

  middleware(uid: string): any {
    return this.middlewares.get(uid);
  }

  plugin(name: string): any {
    return this.plugins.get(name);
  }

  documents(uid: string): any {
    if (!this._documents) {
      throw new Error('Document Service not available — call load() first');
    }
    return this._documents(uid);
  }

  // --- Container ---

  add(name: string, factory: (opts: { apick: ApickInterface }) => any): void {
    this.container.set(name, { factory });
  }

  get(name: string): any {
    const entry = this.container.get(name);
    if (!entry) return undefined;
    if (!entry.instance) {
      entry.instance = entry.factory({ apick: this });
    }
    return entry.instance;
  }

  has(name: string): boolean {
    return this.container.has(name);
  }

  // --- Lifecycle ---

  /**
   * Load phase: loads config, reconfigures logger, runs register() + bootstrap().
   *
   * After this call the server is NOT yet listening — call listen() separately.
   */
  async load(): Promise<void> {
    // 1. Load configuration files
    if (this.config._load) {
      await this.config._load();
    }

    // 2. Reconfigure logger from loaded config
    const loggerConfig = this.config.get('server.logger', { level: 'info' });
    this.log = createLogger(loggerConfig);
    this.eventHub = createEventHub({ logger: this.log });

    // 3. Reconfigure cache from loaded config
    const cacheConfig = this.config.get('server.cache');
    if (cacheConfig) {
      this.cache = createCache(cacheConfig);
    }

    // 4. Reconfigure server with proxy setting
    const proxyEnabled = this.config.get('server.proxy.enabled', false);
    this.server = createServer({ logger: this.log, proxyEnabled });

    // 5. register() phase — DB NOT available
    //    Load plugins, user register function, etc.
    await this.runRegisterPhase();

    // 6. Initialize database
    await this.initDatabase();

    // 7. Schema sync (between register and bootstrap)
    this.runSchemaSync();

    // 8. Wire up db.query() to return QueryEngine per content type
    this.wireQueryEngine();

    // 9. Initialize Document Service Manager
    this.initDocumentService();

    // 10. bootstrap() phase — DB available
    await this.runBootstrapPhase();

    this.isLoaded = true;
    this.log.info('Apick loaded successfully');
  }

  /**
   * Start the HTTP server.
   */
  async listen(): Promise<void> {
    if (!this.isLoaded) {
      await this.load();
    }

    const host = this.config.get('server.host', '0.0.0.0');
    const port = this.config.get('server.port', 1337);

    await this.server.listen(port, host);
  }

  /**
   * Graceful shutdown — destroy in reverse order.
   */
  async destroy(): Promise<void> {
    this.log.info('Shutting down...');

    // 1. Close HTTP server
    await this.server.close();

    // 2. User destroy (if any)
    await this.runDestroyPhase();

    // 3. Clear event hub
    this.eventHub.destroy();

    // 4. Clear cache
    await this.cache.clear();

    // 5. Close database
    if (this.db && (this.db as any).close) {
      (this.db as any).close();
    }

    this.isLoaded = false;
    this.log.info('Apick destroyed');
  }

  // --- Internal lifecycle phases ---

  private async runRegisterPhase(): Promise<void> {
    // Load user lifecycle file: src/index.ts → register()
    try {
      const userLifecyclePath = path.join(this.dirs.app.src, 'index.js');
      const mod = await import(userLifecyclePath).catch(() => null);
      const lifecycle = mod?.default ?? mod;
      if (lifecycle?.register) {
        await lifecycle.register({ apick: this });
      }
    } catch {
      // No user lifecycle file — that's fine
    }
  }

  private async runBootstrapPhase(): Promise<void> {
    // Load user lifecycle file: src/index.ts → bootstrap()
    try {
      const userLifecyclePath = path.join(this.dirs.app.src, 'index.js');
      const mod = await import(userLifecyclePath).catch(() => null);
      const lifecycle = mod?.default ?? mod;
      if (lifecycle?.bootstrap) {
        await lifecycle.bootstrap({ apick: this });
      }
    } catch {
      // No user lifecycle file — that's fine
    }
  }

  private async initDatabase(): Promise<void> {
    const dbConfig = this.config.get('database', null);
    if (!dbConfig) {
      this.log.debug('No database configuration found — skipping database init');
      return;
    }

    this.db = createDatabase(dbConfig, this.log);
    this.log.info('Database initialized');
  }

  private runSchemaSync(): void {
    if (!this.db) return;

    // Collect all content type schemas as a plain object
    const schemas: Record<string, any> = {};
    for (const [uid, schema] of this.contentTypes) {
      schemas[uid] = schema;
    }

    if (Object.keys(schemas).length > 0) {
      const rawDb = (this.db as any).raw;
      if (rawDb) {
        syncSchemas(rawDb, schemas, this.log);
        this.log.info({ count: Object.keys(schemas).length }, 'Schema sync completed');
      }
    }
  }

  private initDocumentService(): void {
    if (!this.db) return;

    const rawDb = (this.db as any).raw;
    if (!rawDb) return;

    const contentTypes = this.contentTypes;

    this._documents = createDocumentServiceManager({
      rawDb,
      logger: this.log,
      eventHub: this.eventHub,
      getSchema: (uid: string) => {
        const schema = contentTypes.get(uid) as any;
        if (!schema) return undefined;
        // If already normalized, return as-is; otherwise normalize
        if (schema.modelType === 'contentType') return schema;
        return normalizeContentType(uid, schema);
      },
    });
  }

  private wireQueryEngine(): void {
    if (!this.db) return;

    const rawDb = (this.db as any).raw;
    if (!rawDb) return;

    const log = this.log;
    const contentTypes = this.contentTypes;

    // Override db.query to return a QueryEngine for the given content type UID
    this.db.query = (uid: string) => {
      const schema = contentTypes.get(uid) as any;
      if (!schema) {
        throw new Error(`Content type "${uid}" not found in registry`);
      }
      const tableName = schema.collectionName || schema.info?.pluralName || uid.split('.').pop();
      return createQueryEngine(rawDb, tableName, log);
    };
  }

  private async runDestroyPhase(): Promise<void> {
    try {
      const userLifecyclePath = path.join(this.dirs.app.src, 'index.js');
      const mod = await import(userLifecyclePath).catch(() => null);
      const lifecycle = mod?.default ?? mod;
      if (lifecycle?.destroy) {
        await lifecycle.destroy({ apick: this });
      }
    } catch {
      // No user lifecycle file — that's fine
    }
  }
}
