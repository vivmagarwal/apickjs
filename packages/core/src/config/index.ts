import dotenv from 'dotenv';
import { resolve, join } from 'node:path';
import { existsSync } from 'node:fs';
import { createEnv } from '@apick/utils';
import { dotGet, dotSet, dotHas, deepMerge, deepFreeze } from '@apick/utils';
import type { ConfigAccessor, Env } from '@apick/types';

/**
 * The six canonical config file names loaded by the framework.
 * Each corresponds to a top-level key in the config store.
 */
const CONFIG_FILES = [
  'server',
  'database',
  'admin',
  'api',
  'middlewares',
  'plugins',
] as const;

/**
 * File extensions to attempt when resolving a config file.
 * Tried in order: .ts first (for source projects), then .js (for compiled output).
 */
const EXTENSIONS = ['.ts', '.js'] as const;

/**
 * Resolves the path to a config file, trying each supported extension in order.
 * Returns the first path that exists on disk, or undefined if none found.
 */
function resolveConfigFile(dir: string, name: string): string | undefined {
  for (const ext of EXTENSIONS) {
    const filePath = join(dir, `${name}${ext}`);
    if (existsSync(filePath)) {
      return filePath;
    }
  }
  return undefined;
}

/**
 * Dynamically imports a config file and extracts its exported value.
 *
 * Config files may export:
 *   - A plain object (used as-is)
 *   - A function `({ env }) => config` (called with the env helper)
 *   - A default export of either form
 *
 * Returns the resolved configuration object, or an empty object if loading fails.
 */
async function loadConfigFile(
  filePath: string,
  env: Env,
): Promise<Record<string, any>> {
  try {
    // Use dynamic import — works for both .js and .ts (if a loader like tsx is active)
    const mod = await import(filePath);

    // Support both named `default` export and the module itself
    let exported = mod.default ?? mod;

    // If the export is a function (ConfigFactory), invoke it with { env }
    if (typeof exported === 'function') {
      exported = exported({ env });
    }

    // Guard: only return plain objects
    if (exported !== null && typeof exported === 'object' && !Array.isArray(exported)) {
      return exported as Record<string, any>;
    }

    return {};
  } catch {
    // Config file failed to load — return empty so the framework can still boot
    return {};
  }
}

/**
 * Creates the configuration provider for an Apick application.
 *
 * Lifecycle:
 *   1. Load .env into process.env via dotenv
 *   2. Create the typed env() helper
 *   3. Load each canonical config file from `appDir/config/`
 *   4. Load environment-specific overrides from `appDir/config/env/{NODE_ENV}/`
 *   5. Deep-merge overrides on top of base configs
 *   6. Freeze the config store when NODE_ENV === 'production'
 *
 * The returned accessor supports dot-notation:
 *   config.get('server.host')          → value or undefined
 *   config.get('server.port', 1337)    → value or default
 *   config.set('server.host', '0.0.0.0')
 *   config.has('database.connection')  → boolean
 */
export function createConfigProvider(opts: {
  appDir: string;
  distDir: string;
}): ConfigAccessor {
  const { appDir } = opts;

  // ---- State ----
  let store: Record<string, any> = {};
  let frozen = false;

  // ---- Internal helpers ----

  /**
   * Loads all config files (base + env override) and populates the store.
   * Called lazily on first access OR can be awaited explicitly via the
   * `_load()` method (non-public, used by the bootstrap sequence).
   */
  let loadPromise: Promise<void> | null = null;

  async function doLoad(): Promise<void> {
    // 1. Load .env file from the app root
    dotenv.config({ path: resolve(appDir, '.env') });

    // 2. Create the env helper (reads from process.env after dotenv)
    const env = createEnv();

    // 3. Determine environment
    const nodeEnv = process.env.NODE_ENV || 'development';

    // 4. Resolve config directories
    const baseConfigDir = resolve(appDir, 'config');
    const envConfigDir = resolve(baseConfigDir, 'env', nodeEnv);

    // 5. Load each canonical config file
    for (const name of CONFIG_FILES) {
      // Base config
      const basePath = resolveConfigFile(baseConfigDir, name);
      let baseConfig: Record<string, any> = {};
      if (basePath) {
        baseConfig = await loadConfigFile(basePath, env);
      }

      // Environment override
      const envPath = resolveConfigFile(envConfigDir, name);
      let envConfig: Record<string, any> = {};
      if (envPath) {
        envConfig = await loadConfigFile(envPath, env);
      }

      // Deep-merge: env override on top of base
      const merged = Object.keys(envConfig).length > 0
        ? deepMerge(baseConfig, envConfig)
        : baseConfig;

      // Store under the canonical key
      if (Object.keys(merged).length > 0) {
        store[name] = merged;
      }
    }

    // 6. Freeze in production
    if (nodeEnv === 'production') {
      store = deepFreeze(store) as Record<string, any>;
      frozen = true;
    }
  }

  function ensureLoaded(): void {
    if (loadPromise === null) {
      loadPromise = doLoad();
    }
  }

  // ---- Public accessor ----

  const accessor: ConfigAccessor & { _load(): Promise<void> } = {
    /**
     * Retrieve a config value by dot-notation key.
     *
     * @example
     *   config.get('server.host')             // '0.0.0.0'
     *   config.get('server.port', 1337)       // 1337 if not set
     *   config.get('database')                // entire database config object
     */
    get<T = any>(key: string, defaultValue?: T): T {
      return dotGet<T>(store, key, defaultValue);
    },

    /**
     * Set a config value by dot-notation key.
     * Throws in production once the config has been frozen.
     *
     * @example
     *   config.set('server.host', '127.0.0.1')
     */
    set(key: string, value: any): void {
      if (frozen) {
        throw new Error(
          `Cannot set config key "${key}" — configuration is frozen in production.`,
        );
      }
      dotSet(store, key, value);
    },

    /**
     * Check if a config key exists (even if the value is falsy).
     *
     * @example
     *   config.has('database.connection.ssl') // true or false
     */
    has(key: string): boolean {
      return dotHas(store, key);
    },

    /**
     * Explicitly load (or re-load) all configuration files.
     * Called by the framework bootstrap sequence before the server starts.
     * Safe to call multiple times — subsequent calls return the same promise.
     */
    async _load(): Promise<void> {
      ensureLoaded();
      await loadPromise;
    },
  };

  return accessor;
}
