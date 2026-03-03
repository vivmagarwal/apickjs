/**
 * Environment Configuration.
 *
 * Manages environment-specific config loading, .env file parsing,
 * config freezing, and the env() helper.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EnvConfig {
  /** Load .env file and merge into process.env */
  loadEnvFile(dir?: string): void;

  /** Get a config value by dot-notation path */
  get(path: string, defaultValue?: any): any;

  /** Set a config value by dot-notation path */
  set(path: string, value: any): void;

  /** Check if a config path exists */
  has(path: string): boolean;

  /** Load environment-specific config overrides */
  loadEnvOverrides(baseConfig: Record<string, any>, configDir: string, nodeEnv?: string): Record<string, any>;

  /** Freeze the config (make read-only) */
  freeze(): void;

  /** Check if config is frozen */
  isFrozen(): boolean;

  /** Get all config */
  getAll(): Record<string, any>;
}

// ---------------------------------------------------------------------------
// .env file parser
// ---------------------------------------------------------------------------

export function parseEnvFile(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  const lines = content.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith('#')) continue;

    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;

    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();

    // Remove surrounding quotes
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    result[key] = value;
  }

  return result;
}

// ---------------------------------------------------------------------------
// Deep merge
// ---------------------------------------------------------------------------

function deepMerge(target: Record<string, any>, source: Record<string, any>): Record<string, any> {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (
      source[key] !== null &&
      typeof source[key] === 'object' &&
      !Array.isArray(source[key]) &&
      typeof result[key] === 'object' &&
      result[key] !== null &&
      !Array.isArray(result[key])
    ) {
      result[key] = deepMerge(result[key], source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Dot-notation access
// ---------------------------------------------------------------------------

function getByPath(obj: Record<string, any>, path: string): any {
  const parts = path.split('.');
  let current: any = obj;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    current = current[part];
  }
  return current;
}

function setByPath(obj: Record<string, any>, path: string, value: any): void {
  const parts = path.split('.');
  let current = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (current[parts[i]] === undefined || typeof current[parts[i]] !== 'object') {
      current[parts[i]] = {};
    }
    current = current[parts[i]];
  }
  current[parts[parts.length - 1]] = value;
}

function hasByPath(obj: Record<string, any>, path: string): boolean {
  return getByPath(obj, path) !== undefined;
}

// ---------------------------------------------------------------------------
// Deep freeze
// ---------------------------------------------------------------------------

function deepFreeze(obj: any): any {
  if (obj === null || typeof obj !== 'object') return obj;
  Object.freeze(obj);
  for (const value of Object.values(obj)) {
    if (typeof value === 'object' && value !== null) {
      deepFreeze(value);
    }
  }
  return obj;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createEnvConfig(initialConfig: Record<string, any> = {}): EnvConfig {
  let config = { ...initialConfig };
  let frozen = false;

  return {
    loadEnvFile(dir) {
      const envPath = resolve(dir || process.cwd(), '.env');
      if (!existsSync(envPath)) return;

      try {
        const content = readFileSync(envPath, 'utf-8');
        const vars = parseEnvFile(content);
        for (const [key, value] of Object.entries(vars)) {
          // Don't override existing env vars
          if (process.env[key] === undefined) {
            process.env[key] = value;
          }
        }
      } catch {
        // Silently ignore .env read errors
      }
    },

    get(path, defaultValue) {
      const value = getByPath(config, path);
      return value !== undefined ? value : defaultValue;
    },

    set(path, value) {
      if (frozen) {
        throw new Error('Configuration is frozen and cannot be modified');
      }
      setByPath(config, path, value);
    },

    has(path) {
      return hasByPath(config, path);
    },

    loadEnvOverrides(baseConfig, configDir, nodeEnv) {
      const env = nodeEnv || process.env.NODE_ENV || 'development';
      const envDir = join(configDir, 'env', env);

      if (!existsSync(envDir)) {
        config = { ...baseConfig };
        return config;
      }

      // Try loading config files from the env directory
      const configFiles = ['server', 'database', 'admin', 'api', 'middlewares', 'plugins'];
      let envConfig: Record<string, any> = {};

      for (const name of configFiles) {
        const filePath = join(envDir, `${name}.ts`);
        const jsPath = join(envDir, `${name}.js`);
        if (existsSync(filePath) || existsSync(jsPath)) {
          // In a real implementation, this would dynamically import the config file
          // For now, we just note the override point
        }
      }

      config = deepMerge(baseConfig, envConfig);
      return config;
    },

    freeze() {
      frozen = true;
      deepFreeze(config);
    },

    isFrozen() {
      return frozen;
    },

    getAll() {
      return config;
    },
  };
}
