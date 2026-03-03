/**
 * Module interfaces for core services.
 *
 * Aggregates type definitions for all service modules across the CMS:
 * Event Hub, Document Service, Content Manager, Admin, Users & Permissions,
 * i18n, Content Releases, Review Workflows, Upload, Email, Webhooks,
 * Cron, Audit Logs, Data Transfer, Plugins, and Providers.
 */

// ---------------------------------------------------------------------------
// Event Hub
// ---------------------------------------------------------------------------

/** Event hub interface */
export interface EventHub {
  emit(event: string, data?: any): Promise<void>;
  on(event: string, handler: EventListener): () => void;
  once(event: string, handler: EventListener): void;
  off(event: string, handler: EventListener): void;
  subscribe(handler: EventSubscriber): () => void;
  removeAllListeners(): void;
  removeAllSubscribers(): void;
  destroy(): void;
}

export type EventListener = (data?: any) => void | Promise<void>;
export type EventSubscriber = (event: string, data?: any) => void | Promise<void>;

// ---------------------------------------------------------------------------
// Document Service
// ---------------------------------------------------------------------------

/** Document Service interface */
export interface DocumentService {
  findMany(uid: string, params?: DocumentServiceParams): Promise<any[]>;
  findOne(uid: string, documentId: string, params?: DocumentServiceParams): Promise<any>;
  findFirst(uid: string, params?: DocumentServiceParams): Promise<any>;
  create(uid: string, params: DocumentServiceCreateParams): Promise<any>;
  update(uid: string, documentId: string, params: DocumentServiceUpdateParams): Promise<any>;
  delete(uid: string, documentId: string, params?: DocumentServiceParams): Promise<any>;
  count(uid: string, params?: DocumentServiceParams): Promise<number>;
  clone(uid: string, documentId: string, params?: DocumentServiceCreateParams): Promise<any>;
  publish(uid: string, documentId: string, params?: DocumentServiceParams): Promise<any>;
  unpublish(uid: string, documentId: string, params?: DocumentServiceParams): Promise<any>;
  discardDraft(uid: string, documentId: string, params?: DocumentServiceParams): Promise<any>;
}

export interface DocumentServiceParams {
  filters?: Record<string, any>;
  sort?: string | string[] | Record<string, 'asc' | 'desc'>;
  fields?: string[];
  populate?: string | string[] | Record<string, any>;
  pagination?: { page?: number; pageSize?: number } | { start?: number; limit?: number };
  status?: 'published' | 'draft';
  locale?: string;
}

export interface DocumentServiceCreateParams extends DocumentServiceParams {
  data: Record<string, any>;
}

export interface DocumentServiceUpdateParams extends DocumentServiceParams {
  data: Record<string, any>;
}

// ---------------------------------------------------------------------------
// Content Manager
// ---------------------------------------------------------------------------

export interface ContentManagerService {
  registerContentType(contentType: ContentManagerContentType): void;
  getContentTypes(): Map<string, ContentManagerContentType>;
  findMany(uid: string, params?: ContentManagerFindParams): { results: ContentEntry[]; pagination: PaginationResult };
  findOne(uid: string, documentId: string, params?: { status?: 'draft' | 'published'; locale?: string }): ContentEntry | null;
  create(uid: string, data: Record<string, any>, params?: { locale?: string; createdBy?: number }): ContentEntry;
  update(uid: string, documentId: string, data: Record<string, any>, params?: { locale?: string; updatedBy?: number }): ContentEntry | null;
  delete(uid: string, documentId: string, params?: { locale?: string }): boolean;
  count(uid: string, params?: { status?: 'draft' | 'published'; locale?: string }): number;
  publish(uid: string, documentId: string, params?: { locale?: string; publishedBy?: number }): ContentEntry | null;
  unpublish(uid: string, documentId: string, params?: { locale?: string }): ContentEntry | null;
  discardDraft(uid: string, documentId: string, params?: { locale?: string }): ContentEntry | null;
  findSingle(uid: string, params?: { status?: 'draft' | 'published'; locale?: string }): ContentEntry | null;
  createOrUpdateSingle(uid: string, data: Record<string, any>, params?: { locale?: string; updatedBy?: number }): ContentEntry;
  deleteSingle(uid: string, params?: { locale?: string }): boolean;
}

export interface ContentManagerContentType {
  uid: string;
  kind: 'collectionType' | 'singleType';
  info: { singularName: string; pluralName: string; displayName: string; description?: string };
  options?: { draftAndPublish?: boolean };
  attributes: Record<string, { type: string; required?: boolean; unique?: boolean; default?: any; private?: boolean; [key: string]: any }>;
}

export interface ContentEntry {
  id: number;
  documentId: string;
  status: 'draft' | 'published';
  locale: string | null;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  firstPublishedAt: string | null;
  createdBy: number | null;
  updatedBy: number | null;
  [key: string]: any;
}

export interface ContentManagerFindParams {
  page?: number;
  pageSize?: number;
  status?: 'draft' | 'published';
  locale?: string;
  sort?: string;
  filters?: Record<string, any>;
}

export interface PaginationResult {
  page: number;
  pageSize: number;
  pageCount: number;
  total: number;
}

// ---------------------------------------------------------------------------
// Content History
// ---------------------------------------------------------------------------

export interface HistoryService {
  createVersion(params: HistoryVersionParams): HistoryVersion;
  findVersionsPage(params: { contentType: string; relatedDocumentId: string; locale?: string; page?: number; pageSize?: number }): { results: HistoryVersion[]; pagination: PaginationResult };
  restoreVersion(versionId: number): HistoryVersion | null;
}

export interface HistoryVersionParams {
  contentType: string;
  relatedDocumentId: string;
  locale?: string | null;
  status: string;
  data: Record<string, any>;
  schema: Record<string, any>;
  createdBy?: number | null;
}

export interface HistoryVersion {
  id: number;
  contentType: string;
  relatedDocumentId: string;
  locale: string | null;
  status: string;
  data: Record<string, any>;
  schema: Record<string, any>;
  createdBy: number | null;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

export interface AdminUser {
  id?: number;
  documentId: string;
  firstname: string;
  lastname: string;
  email: string;
  isActive: boolean;
  roles: number[];
  createdAt: string;
  updatedAt: string;
}

export interface AdminRole {
  id?: number;
  name: string;
  description: string;
  code?: string;
  permissions: AdminPermission[];
  createdAt: string;
  updatedAt: string;
}

export interface AdminPermission {
  action: string;
  subject?: string;
  conditions?: string[];
  properties?: Record<string, any>;
}

export interface AdminAuthService {
  issue(payload: { id: number; isAdmin?: boolean }): string;
  verify(token: string): Record<string, any>;
  registerFirstAdmin(data: { firstname: string; lastname: string; email: string; password: string }): { token: string; user: AdminUser };
  login(email: string, password: string): { token: string; user: AdminUser };
  renewToken(token: string): { token: string };
  hasAdmin(): boolean;
  generateResetToken(email: string): string | null;
  resetPassword(resetToken: string, newPassword: string): boolean;
}

export interface ApiToken {
  id?: number;
  name: string;
  description: string;
  type: 'read-only' | 'full-access' | 'custom';
  accessKey?: string;
  tokenHash: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
  permissions: Array<{ action: string; subject?: string }>;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Audit Logs
// ---------------------------------------------------------------------------

export interface AuditLogService {
  log(entry: AuditLogEntry): void;
  findMany(params?: { page?: number; pageSize?: number; action?: string; userId?: number }): { results: AuditLogRecord[]; pagination: PaginationResult };
  findOne(id: number): AuditLogRecord | null;
  deleteExpiredEvents(olderThan: Date): number;
  count(params?: { action?: string; userId?: number }): number;
}

export interface AuditLogEntry {
  action: string;
  userId?: number;
  userEmail?: string;
  payload?: Record<string, any>;
}

export interface AuditLogRecord extends AuditLogEntry {
  id: number;
  date: string;
  displayName: string;
}

// ---------------------------------------------------------------------------
// Users & Permissions
// ---------------------------------------------------------------------------

export interface EndUser {
  id?: number;
  username: string;
  email: string;
  confirmed: boolean;
  blocked: boolean;
  provider: string;
  roleId: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface EndUserRole {
  id?: number;
  name: string;
  description: string;
  type: string;
  permissions: EndUserPermission[];
  createdAt: string;
  updatedAt: string;
}

export interface EndUserPermission {
  action: string;
  subject?: string;
  conditions?: string[];
}

export interface UserAuthService {
  issue(payload: { id: number }): string;
  verify(token: string): Record<string, any>;
  register(data: { username: string; email: string; password: string }): { jwt: string; user: EndUser };
  login(email: string, password: string): { jwt: string; user: EndUser };
  forgotPassword(email: string): string | null;
  resetPassword(resetToken: string, newPassword: string): boolean;
  emailConfirmation(confirmationToken: string): EndUser | null;
  sendConfirmation(email: string): boolean;
}

// ---------------------------------------------------------------------------
// i18n
// ---------------------------------------------------------------------------

export interface Locale {
  id?: number;
  code: string;
  name: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface LocaleService {
  findAll(): Locale[];
  findOne(id: number): Locale | null;
  findByCode(code: string): Locale | null;
  create(data: { code: string; name: string; isDefault?: boolean }): Locale;
  updateById(id: number, data: Partial<{ name: string; isDefault: boolean }>): Locale | null;
  deleteById(id: number): boolean;
  getDefaultLocale(): Locale | null;
  isValidLocale(code: string): boolean;
}

// ---------------------------------------------------------------------------
// Content Releases
// ---------------------------------------------------------------------------

export interface Release {
  id?: number;
  name: string;
  status: 'ready' | 'blocked' | 'done' | 'failed';
  releasedAt: string | null;
  scheduledAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ReleaseAction {
  id?: number;
  releaseId: number;
  type: 'publish' | 'unpublish';
  contentType: string;
  documentId: string;
  locale?: string;
  status: 'pending' | 'done' | 'failed';
}

export interface ReleaseService {
  findAll(): Release[];
  findOne(id: number): Release | null;
  create(data: { name: string; scheduledAt?: string }): Release;
  updateById(id: number, data: Partial<{ name: string; scheduledAt: string | null }>): Release | null;
  deleteById(id: number): boolean;
  addAction(releaseId: number, action: { type: 'publish' | 'unpublish'; contentType: string; documentId: string; locale?: string }): ReleaseAction;
  removeAction(releaseId: number, actionId: number): boolean;
  getActions(releaseId: number): ReleaseAction[];
  publish(releaseId: number, executor: (action: ReleaseAction) => boolean): Release | null;
}

// ---------------------------------------------------------------------------
// Review Workflows
// ---------------------------------------------------------------------------

export interface Workflow {
  id?: number;
  name: string;
  contentTypes: string[];
  stages: WorkflowStage[];
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowStage {
  id?: number;
  name: string;
  color?: string;
  permissions?: Record<string, any>;
}

export interface WorkflowService {
  findAll(): Workflow[];
  findOne(id: number): Workflow | null;
  create(data: { name: string; stages: Array<{ name: string; color?: string }> }): Workflow;
  updateById(id: number, data: Partial<{ name: string }>): Workflow | null;
  deleteById(id: number): boolean;
  getStages(workflowId: number): WorkflowStage[];
  assignStage(contentType: string, documentId: string, stageId: number): void;
  getDocumentStage(contentType: string, documentId: string): WorkflowStage | null;
}

// ---------------------------------------------------------------------------
// Upload
// ---------------------------------------------------------------------------

export interface UploadFile {
  id?: number;
  name: string;
  alternativeText: string | null;
  caption: string | null;
  hash: string;
  ext: string;
  mime: string;
  size: number;
  width: number | null;
  height: number | null;
  url: string;
  formats: Record<string, any>;
  folderPath: string;
  folderId: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface UploadFolder {
  id?: number;
  name: string;
  pathId: number;
  path: string;
  parentId: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface UploadService {
  create(data: { name: string; ext: string; mime: string; size: number; width?: number; height?: number; alternativeText?: string; caption?: string; folderId?: number }): Promise<UploadFile>;
  findOne(id: number): UploadFile | null;
  findMany(params?: { page?: number; pageSize?: number; mime?: string; folderId?: number | null }): { results: UploadFile[]; pagination: PaginationResult };
  updateById(id: number, data: Partial<{ name: string; alternativeText: string; caption: string; folderId: number | null }>): UploadFile | null;
  deleteById(id: number): boolean;
  count(): number;
}

// ---------------------------------------------------------------------------
// Email
// ---------------------------------------------------------------------------

export interface EmailService {
  send(options: EmailOptions): Promise<void>;
  sendTestEmail(to: string): Promise<void>;
  setProvider(provider: EmailProvider): void;
  getProviderName(): string;
}

export interface EmailOptions {
  to: string;
  from?: string;
  cc?: string;
  bcc?: string;
  replyTo?: string;
  subject: string;
  text?: string;
  html?: string;
}

export interface EmailProvider {
  name?: string;
  send(options: EmailOptions): void | Promise<void>;
}

// ---------------------------------------------------------------------------
// Webhooks
// ---------------------------------------------------------------------------

export interface WebhookConfig {
  id?: number;
  name: string;
  url: string;
  events: string[];
  headers: Record<string, string>;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface WebhookService {
  findAll(): WebhookConfig[];
  findOne(id: number): WebhookConfig | null;
  create(data: { name: string; url: string; events: string[]; headers?: Record<string, string> }): WebhookConfig;
  updateById(id: number, data: Partial<{ name: string; url: string; events: string[]; headers: Record<string, string>; enabled: boolean }>): WebhookConfig | null;
  deleteById(id: number): boolean;
  trigger(event: string, payload: any): Promise<void>;
  getAvailableEvents(): string[];
}

// ---------------------------------------------------------------------------
// Cron
// ---------------------------------------------------------------------------

export interface CronJob {
  name: string;
  expression: string;
  task: () => void | Promise<void>;
  running: boolean;
}

export interface CronService {
  add(name: string, expression: string, task: () => void | Promise<void>): void;
  remove(name: string): boolean;
  start(): void;
  stop(): void;
  destroy(): void;
  getJobs(): CronJob[];
  isRunning(): boolean;
}

// ---------------------------------------------------------------------------
// Data Transfer
// ---------------------------------------------------------------------------

export type TransferPermission = 'push' | 'pull';

export interface TransferToken {
  id?: number;
  name: string;
  description: string;
  accessKey: string;
  permissions: TransferPermission[];
  lifespan: number | null;
  expiresAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ExportData {
  metadata: { createdAt: string; version: string; source: string };
  schemas: Record<string, any>[];
  content: Record<string, Record<string, any>[]>;
  media: Record<string, any>[];
}

export interface ImportResult {
  imported: { schemas: number; content: number; media: number };
  skipped: { schemas: number; content: number; media: number };
  errors: string[];
}

export interface TransferService {
  findAllTokens(): TransferToken[];
  findOneToken(id: number): TransferToken | null;
  createToken(data: { name: string; description?: string; permissions: TransferPermission[]; lifespan?: number | null }): TransferToken;
  deleteToken(id: number): boolean;
  regenerateToken(id: number): TransferToken | null;
  validateToken(accessKey: string, requiredPermission: TransferPermission): boolean;
  exportData(options?: { only?: ('schemas' | 'content' | 'media')[]; exclude?: string[] }): ExportData;
  importData(data: ExportData, options?: { force?: boolean; dryRun?: boolean }): ImportResult;
}

// ---------------------------------------------------------------------------
// Plugins
// ---------------------------------------------------------------------------

export interface PluginDefinition {
  name: string;
  description?: string;
  requiredPlugins?: string[];
  optionalPlugins?: string[];
  config?: { default?: Record<string, any>; validator?: (config: any) => boolean };
  contentTypes?: Record<string, any>;
  services?: Record<string, (...args: any[]) => any>;
  controllers?: Record<string, (...args: any[]) => any>;
  routes?: any[];
  policies?: Record<string, any>;
  middlewares?: Record<string, any>;
  register?: (apick: any) => void | Promise<void>;
  bootstrap?: (apick: any) => void | Promise<void>;
  destroy?: (apick: any) => void | Promise<void>;
}

export interface LoadedPlugin {
  name: string;
  config: Record<string, any>;
  service(name: string): any;
  controller(name: string): any;
  contentType(name: string): any;
  routes: any[];
  policies: Record<string, any>;
  middlewares: Record<string, any>;
}

export interface PluginManager {
  register(name: string, definition: PluginDefinition): void;
  get(name: string): LoadedPlugin | undefined;
  getAll(): Map<string, LoadedPlugin>;
  has(name: string): boolean;
  loadAll(): void;
  runRegister(): Promise<void>;
  runBootstrap(): Promise<void>;
  runDestroy(): Promise<void>;
  getLoadOrder(): string[];
}

// ---------------------------------------------------------------------------
// Providers
// ---------------------------------------------------------------------------

export interface ProviderDefinition {
  init: (config?: any) => any;
  bootstrap?: (config?: any) => void | Promise<void>;
  destroy?: () => void | Promise<void>;
}

export interface ProviderDomain {
  required: string[];
  optional?: string[];
}

export interface ProviderRegistry {
  registerDomain(name: string, domain: ProviderDomain): void;
  setProvider(domain: string, provider: ProviderDefinition): void;
  getProvider(domain: string): any;
  initAll(): Promise<void>;
  bootstrapAll(): Promise<void>;
  destroyAll(): Promise<void>;
}
