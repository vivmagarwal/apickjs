/**
 * Plugin System.
 *
 * Manages plugin discovery, loading, lifecycle execution, and registration
 * of plugin artifacts (content types, services, controllers, routes, etc.).
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PluginDefinition {
  name: string;
  displayName?: string;
  description?: string;
  kind?: 'plugin';

  config?: {
    default?: Record<string, any> | (() => Record<string, any>);
    validator?: (config: any) => void;
  };

  contentTypes?: Record<string, ContentTypeFromPlugin>;
  services?: Record<string, (context: PluginContext) => any>;
  controllers?: Record<string, (context: PluginContext) => any>;
  routes?: PluginRoutes;
  middlewares?: Record<string, (context: PluginContext) => any>;
  policies?: Record<string, (context: PluginContext) => any>;

  register?: (context: PluginContext) => void | Promise<void>;
  bootstrap?: (context: PluginContext) => void | Promise<void>;
  destroy?: (context: PluginContext) => void | Promise<void>;

  requiredPlugins?: string[];
  optionalPlugins?: string[];
}

export interface ContentTypeFromPlugin {
  schema: {
    singularName: string;
    pluralName: string;
    displayName?: string;
    description?: string;
    options?: Record<string, any>;
    attributes: Record<string, any>;
  };
}

export interface PluginRoutes {
  'content-api'?: PluginRoute[];
  admin?: PluginRoute[];
}

export interface PluginRoute {
  method: string;
  path: string;
  handler: string;
  config?: {
    auth?: false | { scope?: string[] };
    policies?: Array<string | { name: string; config?: Record<string, any> }>;
    middlewares?: Array<string | { name: string; config?: Record<string, any> }>;
  };
}

export interface PluginContext {
  apick: PluginApickInterface;
}

export interface PluginApickInterface {
  plugin(name: string): PluginInstance | undefined;
  config: Record<string, any>;
  contentTypes: {
    add(uid: string, def: any): void;
    get(uid: string): any;
    has(uid: string): boolean;
    getAll(): Record<string, any>;
  };
  services: {
    add(uid: string, value: any): void;
    get(uid: string): any;
    has(uid: string): boolean;
    getAll(): Record<string, any>;
  };
  controllers: {
    add(uid: string, value: any): void;
    get(uid: string): any;
    has(uid: string): boolean;
    getAll(): Record<string, any>;
  };
  hooks: {
    get(name: string): { register(handler: (...args: any[]) => any): void; call(...args: any[]): Promise<void> };
  };
  customFields: {
    register(field: any): void;
    get(uid: string): any;
    getAll(): Record<string, any>;
    has(uid: string): boolean;
  };
}

export interface PluginInstance {
  name: string;
  definition: PluginDefinition;
  config: Record<string, any>;
  service(name: string): any;
  controller(name: string): any;
  contentType(uid: string): any;
}

export interface LoadedPlugin {
  name: string;
  definition: PluginDefinition;
  config: Record<string, any>;
  services: Map<string, any>;
  controllers: Map<string, any>;
  contentTypes: Map<string, any>;
}

export interface PluginUserConfig {
  enabled?: boolean;
  config?: Record<string, any>;
  resolve?: string;
}

export interface PluginManagerConfig {
  apick: PluginApickInterface;
  userConfig?: Record<string, PluginUserConfig>;
}

// ---------------------------------------------------------------------------
// Topological sort for dependency ordering
// ---------------------------------------------------------------------------

function topologicalSort(plugins: Map<string, PluginDefinition>): string[] {
  const visited = new Set<string>();
  const visiting = new Set<string>();
  const order: string[] = [];

  function visit(name: string) {
    if (visited.has(name)) return;
    if (visiting.has(name)) {
      throw new Error(`Circular plugin dependency detected involving "${name}"`);
    }

    visiting.add(name);
    const plugin = plugins.get(name);
    if (plugin) {
      for (const dep of plugin.requiredPlugins || []) {
        if (!plugins.has(dep)) {
          throw new Error(`Plugin "${name}" requires plugin "${dep}" which is not available`);
        }
        visit(dep);
      }
      for (const dep of plugin.optionalPlugins || []) {
        if (plugins.has(dep)) {
          visit(dep);
        }
      }
    }
    visiting.delete(name);
    visited.add(name);
    order.push(name);
  }

  for (const name of plugins.keys()) {
    visit(name);
  }

  return order;
}

// ---------------------------------------------------------------------------
// Plugin Manager
// ---------------------------------------------------------------------------

export interface PluginManager {
  register(name: string, definition: PluginDefinition): void;
  get(name: string): PluginInstance | undefined;
  getAll(): Record<string, PluginInstance>;
  has(name: string): boolean;

  loadAll(): void;
  runRegister(): Promise<void>;
  runBootstrap(): Promise<void>;
  runDestroy(): Promise<void>;

  getLoadOrder(): string[];
}

export function createPluginManager(config: PluginManagerConfig): PluginManager {
  const { apick, userConfig = {} } = config;
  const definitions = new Map<string, PluginDefinition>();
  const loaded = new Map<string, LoadedPlugin>();
  let loadOrder: string[] = [];

  function resolveConfig(name: string, definition: PluginDefinition): Record<string, any> {
    // Start with defaults
    let cfg: Record<string, any> = {};
    if (definition.config?.default) {
      cfg = typeof definition.config.default === 'function'
        ? definition.config.default()
        : { ...definition.config.default };
    }

    // Merge user config
    const user = userConfig[name];
    if (user?.config) {
      cfg = { ...cfg, ...user.config };
    }

    // Validate
    if (definition.config?.validator) {
      definition.config.validator(cfg);
    }

    return cfg;
  }

  function createPluginInstance(name: string, lp: LoadedPlugin): PluginInstance {
    return {
      name,
      definition: lp.definition,
      config: lp.config,
      service(svcName: string) {
        return lp.services.get(svcName);
      },
      controller(ctrlName: string) {
        return lp.controllers.get(ctrlName);
      },
      contentType(uid: string) {
        return lp.contentTypes.get(uid);
      },
    };
  }

  return {
    register(name, definition) {
      // Check if disabled by user config
      const uc = userConfig[name];
      if (uc?.enabled === false) return;

      definitions.set(name, definition);
    },

    get(name) {
      const lp = loaded.get(name);
      if (!lp) return undefined;
      return createPluginInstance(name, lp);
    },

    getAll() {
      const result: Record<string, PluginInstance> = {};
      for (const [name, lp] of loaded) {
        result[name] = createPluginInstance(name, lp);
      }
      return result;
    },

    has(name) {
      return loaded.has(name);
    },

    loadAll() {
      loadOrder = topologicalSort(definitions);

      for (const name of loadOrder) {
        const definition = definitions.get(name)!;
        const pluginConfig = resolveConfig(name, definition);
        const ctx: PluginContext = { apick: { ...apick, config: pluginConfig } };

        const services = new Map<string, any>();
        const controllers = new Map<string, any>();
        const contentTypes = new Map<string, any>();

        // Register services
        if (definition.services) {
          for (const [svcName, factory] of Object.entries(definition.services)) {
            const uid = `plugin::${name}.${svcName}`;
            const instance = factory(ctx);
            services.set(svcName, instance);
            apick.services.add(uid, instance);
          }
        }

        // Register controllers
        if (definition.controllers) {
          for (const [ctrlName, factory] of Object.entries(definition.controllers)) {
            const uid = `plugin::${name}.${ctrlName}`;
            const instance = factory(ctx);
            controllers.set(ctrlName, instance);
            apick.controllers.add(uid, instance);
          }
        }

        // Register content types
        if (definition.contentTypes) {
          for (const [ctName, ctDef] of Object.entries(definition.contentTypes)) {
            const uid = `plugin::${name}.${ctDef.schema.singularName}`;
            contentTypes.set(ctName, ctDef);
            apick.contentTypes.add(uid, ctDef);
          }
        }

        loaded.set(name, { name, definition, config: pluginConfig, services, controllers, contentTypes });
      }
    },

    async runRegister() {
      for (const name of loadOrder) {
        const lp = loaded.get(name)!;
        const ctx: PluginContext = { apick: { ...apick, config: lp.config } };
        if (lp.definition.register) {
          await lp.definition.register(ctx);
        }
      }
    },

    async runBootstrap() {
      for (const name of loadOrder) {
        const lp = loaded.get(name)!;
        const ctx: PluginContext = { apick: { ...apick, config: lp.config } };
        if (lp.definition.bootstrap) {
          await lp.definition.bootstrap(ctx);
        }
      }
    },

    async runDestroy() {
      // Destroy in reverse order
      for (let i = loadOrder.length - 1; i >= 0; i--) {
        const name = loadOrder[i];
        const lp = loaded.get(name)!;
        const ctx: PluginContext = { apick: { ...apick, config: lp.config } };
        if (lp.definition.destroy) {
          await lp.definition.destroy(ctx);
        }
      }
    },

    getLoadOrder() {
      return [...loadOrder];
    },
  };
}

// ---------------------------------------------------------------------------
// Convenience: definePlugin
// ---------------------------------------------------------------------------

export function definePlugin(definition: PluginDefinition): PluginDefinition {
  return definition;
}
