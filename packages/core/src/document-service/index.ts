/**
 * Document Service — high-level API for content CRUD.
 *
 * Wraps the Query Engine with document identity (documentId),
 * draft/publish awareness, lifecycle events, transactions,
 * and middleware support.
 */

import { randomUUID } from 'node:crypto';
import type { Logger, EventHub } from '@apick/types';
import type { QueryEngine, WhereClause } from '../query-engine/index.js';
import { createQueryEngine } from '../query-engine/index.js';
import type { ContentTypeSchema } from '../content-types/index.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DocumentServiceOptions {
  uid: string;
  schema: ContentTypeSchema;
  rawDb: any;
  logger: Logger;
  eventHub: EventHub;
}

export interface FindManyParams {
  filters?: WhereClause;
  sort?: string | string[] | Record<string, 'asc' | 'desc'>;
  fields?: string[];
  populate?: any;
  pagination?: { page?: number; pageSize?: number } | { start?: number; limit?: number };
  status?: 'published' | 'draft';
  locale?: string;
}

export interface FindOneParams {
  documentId: string;
  fields?: string[];
  populate?: any;
  status?: 'published' | 'draft';
  locale?: string;
}

export interface CreateParams {
  data: Record<string, any>;
  status?: 'published' | 'draft';
  locale?: string;
}

export interface UpdateParams {
  documentId: string;
  data: Record<string, any>;
  locale?: string;
}

export interface DeleteParams {
  documentId: string;
  locale?: string;
}

export interface CloneParams {
  documentId: string;
  data?: Record<string, any>;
  locale?: string;
}

export interface PublishParams {
  documentId: string;
  locale?: string;
}

export interface DocumentService {
  findMany(params?: FindManyParams): Promise<any[]>;
  findFirst(params?: FindManyParams): Promise<any | null>;
  findOne(params: FindOneParams): Promise<any | null>;
  count(params?: { filters?: WhereClause; status?: 'published' | 'draft'; locale?: string }): Promise<number>;
  create(params: CreateParams): Promise<any>;
  update(params: UpdateParams): Promise<any | null>;
  delete(params: DeleteParams): Promise<{ document_id: string } | null>;
  clone(params: CloneParams): Promise<any>;
  publish(params: PublishParams): Promise<any[]>;
  unpublish(params: PublishParams): Promise<any[]>;
  discardDraft(params: PublishParams): Promise<any[]>;
}

export type DocumentMiddleware = (
  context: { action: string; uid: string; params: any },
  next: () => Promise<any>,
) => Promise<any>;

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createDocumentService(options: DocumentServiceOptions): DocumentService {
  const { uid, schema, rawDb, logger, eventHub } = options;
  const tableName = schema.collectionName;
  const qe = createQueryEngine(rawDb, tableName, logger);
  const draftAndPublish = schema.options?.draftAndPublish !== false;

  const middlewares: DocumentMiddleware[] = [];

  function use(mw: DocumentMiddleware) {
    middlewares.push(mw);
  }

  async function runWithMiddleware(action: string, params: any, fn: (resolvedParams: any) => Promise<any>): Promise<any> {
    const context = { action, uid, params };

    let index = 0;
    const next = async (): Promise<any> => {
      if (index < middlewares.length) {
        const mw = middlewares[index++];
        return mw(context, next);
      }
      // Pass the (possibly modified) params to fn
      return fn(context.params);
    };

    return next();
  }

  // --- Build WHERE clause helpers ---

  function addLocaleFilter(where: WhereClause, locale?: string): WhereClause {
    if (locale) {
      return { ...where, locale };
    }
    return where;
  }

  function addStatusFilter(where: WhereClause, status?: 'published' | 'draft'): WhereClause {
    if (!draftAndPublish) return where;

    if (status === 'published') {
      return { ...where, published_at: { $notNull: true } };
    }
    if (status === 'draft') {
      return { ...where, published_at: null };
    }
    // Default: published
    return { ...where, published_at: { $notNull: true } };
  }

  function buildSort(sort?: string | string[] | Record<string, 'asc' | 'desc'>): any {
    if (!sort) return undefined;
    if (typeof sort === 'string') return sort;
    if (Array.isArray(sort)) return sort;
    return sort;
  }

  // --- Service implementation ---

  const service: DocumentService = {
    async findMany(params?: FindManyParams): Promise<any[]> {
      return runWithMiddleware('findMany', params, async (p: FindManyParams | undefined) => {
        let where: WhereClause = p?.filters || {};
        where = addLocaleFilter(where, p?.locale);
        where = addStatusFilter(where, p?.status);

        const queryParams: any = {
          where,
          select: p?.fields,
          orderBy: buildSort(p?.sort),
        };

        // Handle pagination
        if (p?.pagination) {
          const pg = p.pagination as any;
          if (pg.page !== undefined) {
            queryParams.limit = pg.pageSize || 25;
            queryParams.offset = ((pg.page || 1) - 1) * (pg.pageSize || 25);
          } else if (pg.start !== undefined) {
            queryParams.offset = pg.start;
            queryParams.limit = pg.limit || 25;
          }
        }

        return qe.findMany(queryParams);
      });
    },

    async findFirst(params?: FindManyParams): Promise<any | null> {
      return runWithMiddleware('findFirst', params, async (p: FindManyParams | undefined) => {
        let where: WhereClause = p?.filters || {};
        where = addLocaleFilter(where, p?.locale);
        where = addStatusFilter(where, p?.status);

        return qe.findOne({
          where,
          select: p?.fields,
          orderBy: buildSort(p?.sort),
        });
      });
    },

    async findOne(params: FindOneParams): Promise<any | null> {
      return runWithMiddleware('findOne', params, async (p: FindOneParams) => {
        let where: WhereClause = { document_id: p.documentId };
        where = addLocaleFilter(where, p.locale);
        where = addStatusFilter(where, p.status);

        return qe.findOne({
          where,
          select: p.fields,
        });
      });
    },

    async count(params?: { filters?: WhereClause; status?: 'published' | 'draft'; locale?: string }): Promise<number> {
      return runWithMiddleware('count', params, async (p: any) => {
        let where: WhereClause = p?.filters || {};
        where = addLocaleFilter(where, p?.locale);
        where = addStatusFilter(where, p?.status);
        return qe.count({ where });
      });
    },

    async create(params: CreateParams): Promise<any> {
      return runWithMiddleware('create', params, async (p: CreateParams) => {
        const now = new Date().toISOString();
        const documentId = randomUUID();
        const isPublished = p.status === 'published';

        const data: Record<string, any> = {
          ...p.data,
          document_id: documentId,
          created_at: now,
          updated_at: now,
        };

        if (draftAndPublish) {
          data.published_at = isPublished ? now : null;
          if (isPublished) {
            data.first_published_at = now;
          }
        }

        if (p.locale) {
          data.locale = p.locale;
        }

        const result = await qe.create({ data });

        // Emit event
        eventHub.emit('entry.create', { result, params: p });

        return result;
      });
    },

    async update(params: UpdateParams): Promise<any | null> {
      return runWithMiddleware('update', params, async (p: UpdateParams) => {
        const now = new Date().toISOString();
        let where: WhereClause = { document_id: p.documentId };
        where = addLocaleFilter(where, p.locale);

        // Find existing to get previous state
        const previousEntry = await qe.findOne({ where });
        if (!previousEntry) return null;

        const data: Record<string, any> = {
          ...p.data,
          updated_at: now,
        };

        const result = await qe.update({ where, data });

        // Emit event
        eventHub.emit('entry.update', { result, params: p, previousEntry });

        return result;
      });
    },

    async delete(params: DeleteParams): Promise<{ document_id: string } | null> {
      return runWithMiddleware('delete', params, async (p: DeleteParams) => {
        let where: WhereClause = { document_id: p.documentId };
        where = addLocaleFilter(where, p.locale);

        const existing = await qe.findOne({ where });
        if (!existing) return null;

        // Delete all rows for this documentId (and locale if specified)
        await qe.deleteMany({ where });

        const result = { document_id: p.documentId };

        // Emit event
        eventHub.emit('entry.delete', { result, params: p });

        return result;
      });
    },

    async clone(params: CloneParams): Promise<any> {
      return runWithMiddleware('clone', params, async (p: CloneParams) => {
        let where: WhereClause = { document_id: p.documentId };
        where = addLocaleFilter(where, p.locale);

        const original = await qe.findOne({ where });
        if (!original) {
          throw new Error(`Document "${p.documentId}" not found`);
        }

        const now = new Date().toISOString();
        const newDocumentId = randomUUID();

        // Copy fields, omitting system fields and overriding with provided data
        const { id, document_id, created_at, updated_at, published_at, first_published_at, ...fields } = original;

        const data: Record<string, any> = {
          ...fields,
          ...p.data,
          document_id: newDocumentId,
          created_at: now,
          updated_at: now,
          published_at: null, // Clones start as drafts
        };

        return qe.create({ data });
      });
    },

    async publish(params: PublishParams): Promise<any[]> {
      return runWithMiddleware('publish', params, async (p: PublishParams) => {
        const now = new Date().toISOString();
        let where: WhereClause = { document_id: p.documentId };
        where = addLocaleFilter(where, p.locale);

        // Find draft rows
        const draftWhere = { ...where, published_at: null };
        const drafts = await qe.findMany({ where: draftWhere });

        const results: any[] = [];
        for (const draft of drafts) {
          const updateData: Record<string, any> = {
            published_at: now,
            updated_at: now,
          };
          if (!draft.first_published_at) {
            updateData.first_published_at = now;
          }

          const result = await qe.update({
            where: { id: draft.id },
            data: updateData,
          });
          if (result) results.push(result);
        }

        // Emit event
        if (results.length > 0) {
          eventHub.emit('entry.publish', { result: results, params: p });
        }

        return results;
      });
    },

    async unpublish(params: PublishParams): Promise<any[]> {
      return runWithMiddleware('unpublish', params, async (p: PublishParams) => {
        const now = new Date().toISOString();
        let where: WhereClause = { document_id: p.documentId };
        where = addLocaleFilter(where, p.locale);
        where = { ...where, published_at: { $notNull: true } };

        const published = await qe.findMany({ where });
        const results: any[] = [];

        for (const entry of published) {
          const result = await qe.update({
            where: { id: entry.id },
            data: { published_at: null, updated_at: now },
          });
          if (result) results.push(result);
        }

        // Emit event
        if (results.length > 0) {
          eventHub.emit('entry.unpublish', { result: results, params: p });
        }

        return results;
      });
    },

    async discardDraft(params: PublishParams): Promise<any[]> {
      return runWithMiddleware('discardDraft', params, async (p: PublishParams) => {
        let where: WhereClause = { document_id: p.documentId };
        where = addLocaleFilter(where, p.locale);

        // Find published version
        const publishedWhere = { ...where, published_at: { $notNull: true } };
        const published = await qe.findMany({ where: publishedWhere });

        // Delete draft versions
        const draftWhere = { ...where, published_at: null };
        await qe.deleteMany({ where: draftWhere });

        // Emit event
        if (published.length > 0) {
          eventHub.emit('entry.draft-discard', { result: published, params: p });
        }

        return published;
      });
    },
  };

  // Attach middleware registration
  (service as any).use = use;

  return service;
}

// ---------------------------------------------------------------------------
// Document Service Manager — creates services per content type UID
// ---------------------------------------------------------------------------

export interface DocumentServiceManager {
  (uid: string): DocumentService;
  use(middleware: DocumentMiddleware): void;
  on(event: string, handler: (data: any) => void | Promise<void>): void;
}

export function createDocumentServiceManager(options: {
  rawDb: any;
  logger: Logger;
  eventHub: EventHub;
  getSchema: (uid: string) => ContentTypeSchema | undefined;
}): DocumentServiceManager {
  const { rawDb, logger, eventHub, getSchema } = options;
  const cache = new Map<string, DocumentService>();
  const globalMiddlewares: DocumentMiddleware[] = [];

  const manager = ((uid: string): DocumentService => {
    if (cache.has(uid)) return cache.get(uid)!;

    const schema = getSchema(uid);
    if (!schema) {
      throw new Error(`Content type "${uid}" not found`);
    }

    const service = createDocumentService({ uid, schema, rawDb, logger, eventHub });

    // Apply global middlewares
    for (const mw of globalMiddlewares) {
      (service as any).use(mw);
    }

    cache.set(uid, service);
    return service;
  }) as DocumentServiceManager;

  manager.use = (middleware: DocumentMiddleware) => {
    globalMiddlewares.push(middleware);
    // Apply to already-created services
    for (const service of cache.values()) {
      (service as any).use(middleware);
    }
  };

  manager.on = (event: string, handler: (data: any) => void | Promise<void>) => {
    eventHub.on(event, handler);
  };

  return manager;
}
