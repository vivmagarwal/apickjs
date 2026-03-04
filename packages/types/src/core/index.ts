import type { EventHub } from '../modules/index.js';
import type { UID } from '../uid/index.js';

/**
 * Core Apick instance — the central service locator and framework runtime.
 */
export interface Apick {
  /** Configuration accessor */
  config: ConfigAccessor;

  /** Pino logger */
  log: Logger;

  /** Event hub */
  eventHub: EventHub;

  /** Cache service */
  cache: CacheService;

  /** Directory paths */
  dirs: ApickDirs;

  /** Is the server running */
  isLoaded: boolean;

  // --- Registries ---
  contentTypes: Record<string, any>;
  components: Record<string, any>;
  services: Record<string, any>;
  controllers: Record<string, any>;
  policies: Record<string, any>;
  middlewares: Record<string, any>;
  hooks: HookRegistry;
  apis: Record<string, any>;
  plugins: Record<string, any>;
  modules: Record<string, any>;
  models: Record<string, any>;
  customFields: CustomFieldRegistry;
  validators: Record<string, any>;
  sanitizers: Record<string, any>;

  // --- Registry access shortcuts ---
  service(uid: string): any;
  controller(uid: string): any;
  policy(uid: string): any;
  middleware(uid: string): any;
  plugin(name: string): any;

  // --- Container ---
  add(name: string, factory: (opts: { apick: Apick }) => any): void;
  get(name: string): any;
  has(name: string): boolean;

  // --- Database (available after bootstrap) ---
  db: DatabaseService;

  // --- Document Service ---
  documents(uid: string): any;

  // --- Server ---
  server: Server;

  // --- Lifecycle ---
  load(): Promise<void>;
  listen(): Promise<void>;
  destroy(): Promise<void>;
}

export interface ConfigAccessor {
  get<T = any>(key: string, defaultValue?: T): T;
  set(key: string, value: any): void;
  has(key: string): boolean;
}

export interface Logger {
  fatal(obj: any, msg?: string): void;
  error(obj: any, msg?: string): void;
  warn(obj: any, msg?: string): void;
  info(obj: any, msg?: string): void;
  debug(obj: any, msg?: string): void;
  trace(obj: any, msg?: string): void;
  child(bindings: Record<string, any>): Logger;
}

export interface CacheService {
  get<T = any>(key: string): Promise<T | undefined>;
  set<T = any>(key: string, value: T, opts?: { ttl?: number }): Promise<void>;
  del(key: string): Promise<void>;
  delByPrefix(prefix: string): Promise<void>;
  has(key: string): Promise<boolean>;
  clear(): Promise<void>;
}

export interface ApickDirs {
  app: {
    root: string;
    src: string;
    config: string;
    public: string;
  };
  dist: {
    root: string;
    src: string;
    config: string;
  };
}

export interface Server {
  listen(port?: number, host?: string): Promise<void>;
  close(): Promise<void>;
  inject(options: InjectOptions): Promise<InjectResponse>;
  use(middleware: MiddlewareHandler): void;
  route(options: RouteOptions): void;
  getRoutes?(): { method: string; path: string }[];
}

export interface InjectOptions {
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: any;
  query?: Record<string, string>;
}

export interface InjectResponse {
  statusCode: number;
  headers: Record<string, string | string[] | undefined>;
  body: any;
  rawBody: string;
}

export interface RouteOptions {
  method: string;
  path: string;
  handler: string | RequestHandler;
  config?: RouteConfig;
}

export interface RouteConfig {
  auth?: boolean | { scope?: string[] };
  policies?: Array<string | PolicyHandler | { name: string; config?: any }>;
  middlewares?: Array<string | MiddlewareHandler | { name: string; config?: any }>;
  tag?: string;
  description?: string;
  cache?: { maxAge?: number; sMaxAge?: number };
}

export interface ApickContext {
  request: {
    body: any;
    headers: Record<string, string | undefined>;
    method: string;
    url: string;
  };
  params: Record<string, string>;
  query: Record<string, any>;
  ip: string;
  protocol: string;
  state: {
    user?: any;
    auth?: any;
    isAuthenticated?: boolean;
    route?: any;
  };
  log: Logger;

  // Response helpers (these throw)
  send(data: any): void;
  created(data: any): void;
  deleted(data?: any): void;
  badRequest(message?: string, details?: any): never;
  unauthorized(message?: string, details?: any): never;
  forbidden(message?: string, details?: any): never;
  notFound(message?: string, details?: any): never;
  payloadTooLarge(message?: string, details?: any): never;
  tooManyRequests(message?: string, details?: any): never;
  internalServerError(message?: string, details?: any): never;

  // Response control
  status: number;
  body: any;
  set(name: string, value: string): void;
  get(name: string): string | undefined;

  // SSE
  sse(): SSEWriter;

  // Raw Node.js objects
  raw: {
    req: any;
    res: any;
  };
}

export interface SSEWriter {
  send(options: { event?: string; data: any; id?: string; retry?: number }): void;
  close(): void;
}

export type RequestHandler = (ctx: ApickContext) => any | Promise<any>;
export type MiddlewareHandler = (ctx: ApickContext, next: () => Promise<void>) => any | Promise<any>;
export type PolicyHandler = (ctx: ApickContext, config: any, opts: { apick: Apick }) => boolean | Promise<boolean>;

export interface HookRegistry {
  get(name: string): Hook;
}

export interface Hook {
  register(handler: (...args: any[]) => any): void;
  delete(handler: (...args: any[]) => any): void;
  call(...args: any[]): Promise<void>;
}

export interface CustomFieldRegistry {
  register(field: CustomFieldDefinition): void;
  get(uid: string): CustomFieldDefinition | undefined;
  getAll(): Record<string, CustomFieldDefinition>;
  has(uid: string): boolean;
}

export interface CustomFieldDefinition {
  name: string;
  plugin?: string;
  type: string;
  zodSchema?: any;
  inputTransform?: (value: any) => any;
  outputTransform?: (value: any) => any;
}

export interface DatabaseService {
  connection: any;
  query(uid: string): any;
  transaction<T>(fn: (opts: TransactionContext) => Promise<T>): Promise<T>;
  inTransaction(): boolean;
  getSchemaConnection(): any;
  dialect: string;
  entityManager: any;
  migrations: MigrationService;
}

export interface TransactionContext {
  trx: any;
  onCommit(fn: () => void | Promise<void>): void;
  onRollback(fn: () => void | Promise<void>): void;
}

export interface MigrationService {
  shouldRun(): Promise<boolean>;
  up(): Promise<void>;
  down(): Promise<void>;
  status(): Promise<any>;
}
