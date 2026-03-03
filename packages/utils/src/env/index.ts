import type { Env } from '@apick/types';

/**
 * Creates the env() helper function with type coercion methods.
 * Reads from process.env.
 */
export function createEnv(): Env {
  function env(key: string): string | undefined;
  function env(key: string, defaultValue: string): string;
  function env(key: string, defaultValue?: string): string | undefined {
    const value = process.env[key];
    if (value !== undefined) return value;
    return defaultValue;
  }

  env.int = function (key: string, defaultValue?: number): number | undefined {
    const value = process.env[key];
    if (value !== undefined) {
      const parsed = parseInt(value, 10);
      if (!Number.isNaN(parsed)) return parsed;
    }
    return defaultValue;
  } as Env['int'];

  env.float = function (key: string, defaultValue?: number): number | undefined {
    const value = process.env[key];
    if (value !== undefined) {
      const parsed = parseFloat(value);
      if (!Number.isNaN(parsed)) return parsed;
    }
    return defaultValue;
  } as Env['float'];

  env.bool = function (key: string, defaultValue?: boolean): boolean | undefined {
    const value = process.env[key];
    if (value !== undefined) {
      const lower = value.toLowerCase();
      if (lower === 'true' || lower === '1' || lower === 'yes') return true;
      if (lower === 'false' || lower === '0' || lower === 'no') return false;
    }
    return defaultValue;
  } as Env['bool'];

  env.json = function <T = unknown>(key: string, defaultValue?: T): T | undefined {
    const value = process.env[key];
    if (value !== undefined) {
      try {
        return JSON.parse(value) as T;
      } catch {
        return defaultValue;
      }
    }
    return defaultValue;
  } as Env['json'];

  env.array = function (key: string, separator = ','): string[] {
    const value = process.env[key];
    if (value !== undefined) {
      return value.split(separator).map((s) => s.trim()).filter(Boolean);
    }
    return [];
  };

  env.date = function (key: string, defaultValue?: Date): Date | undefined {
    const value = process.env[key];
    if (value !== undefined) {
      const parsed = new Date(value);
      if (!Number.isNaN(parsed.getTime())) return parsed;
    }
    return defaultValue;
  } as Env['date'];

  return env as Env;
}
