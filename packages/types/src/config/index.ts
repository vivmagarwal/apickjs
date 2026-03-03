/**
 * Configuration types.
 */

/** The env() helper with type coercion overloads */
export interface Env {
  (key: string): string | undefined;
  (key: string, defaultValue: string): string;
  int(key: string): number | undefined;
  int(key: string, defaultValue: number): number;
  float(key: string): number | undefined;
  float(key: string, defaultValue: number): number;
  bool(key: string): boolean | undefined;
  bool(key: string, defaultValue: boolean): boolean;
  json<T = unknown>(key: string): T | undefined;
  json<T = unknown>(key: string, defaultValue: T): T;
  array(key: string, separator?: string): string[];
  date(key: string): Date | undefined;
  date(key: string, defaultValue: Date): Date;
}

/** Config factory function type — used in config/*.ts files */
export type ConfigFactory<T = Record<string, any>> = (opts: { env: Env }) => T;

/** Server configuration */
export interface ServerConfig {
  host: string;
  port: number;
  url: string;
  proxy: {
    enabled: boolean;
    host?: string;
    port?: number;
  };
  app: {
    keys: string[];
  };
  cron: {
    enabled: boolean;
    tasks: Record<string, any>;
  };
  logger: LoggerConfig;
  dirs: {
    public: string;
  };
}

export interface LoggerConfig {
  level: string;
  transport?: {
    target: string;
    options?: Record<string, any>;
  } | {
    targets: Array<{
      target: string;
      options?: Record<string, any>;
      level?: string;
    }>;
  };
  serializers?: Record<string, (value: any) => any>;
  redact?: {
    paths: string[];
    censor?: string;
  };
  timestamp?: boolean | ((time?: number) => string);
  formatters?: Record<string, (...args: any[]) => any>;
  enabled?: boolean;
}

/** Database configuration */
export interface DatabaseConfig {
  connection: {
    client: 'postgres' | 'mysql' | 'sqlite';
    connection: {
      host?: string;
      port?: number;
      database?: string;
      user?: string;
      password?: string;
      ssl?: boolean | { rejectUnauthorized?: boolean };
      filename?: string;
    };
    pool?: {
      min?: number;
      max?: number;
      acquireTimeoutMillis?: number;
      idleTimeoutMillis?: number;
      createTimeoutMillis?: number;
      destroyTimeoutMillis?: number;
    };
    debug?: boolean;
  };
}

/** Admin configuration */
export interface AdminConfig {
  auth: {
    secret: string;
    expiresIn?: string;
    session?: {
      refreshTokenTTL?: string;
    };
  };
  apiToken: {
    salt: string;
  };
  transfer: {
    token: {
      salt: string;
    };
  };
  rateLimit: {
    enabled: boolean;
    max: number;
    interval: number;
  };
}

/** API configuration */
export interface ApiConfig {
  rest: {
    prefix: string;
    defaultLimit: number;
    maxLimit: number;
    withCount: boolean;
  };
  responses: {
    privateAttributes: string[];
  };
}

/** Middleware config entry */
export type MiddlewareConfigEntry =
  | string
  | {
      name: string;
      config?: Record<string, any>;
    }
  | {
      resolve: string;
      config?: Record<string, any>;
    };

/** Plugin config entry */
export interface PluginConfigEntry {
  enabled?: boolean;
  config?: Record<string, any>;
  resolve?: string;
}
