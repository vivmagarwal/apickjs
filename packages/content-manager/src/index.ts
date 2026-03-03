/**
 * @apick/content-manager
 *
 * Content Manager plugin for APICK CMS.
 * Provides admin API endpoints for content CRUD, draft/publish,
 * content history, and content preview.
 */

export { createContentManagerService } from './services/content-manager.js';
export type {
  ContentManagerService,
  ContentManagerServiceConfig,
  ContentEntry,
  ContentType,
  AttributeDefinition,
  FindManyParams,
} from './services/content-manager.js';

export { createHistoryService } from './history/index.js';
export type {
  HistoryService,
  HistoryServiceConfig,
  HistoryVersion,
  RestoreResult,
} from './history/index.js';

export { createPreviewService } from './preview/index.js';
export type {
  PreviewService,
  PreviewConfig,
  PreviewHandler,
} from './preview/index.js';

export { registerContentManagerRoutes } from './routes/index.js';
