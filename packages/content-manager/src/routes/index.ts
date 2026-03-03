/**
 * Content Manager Routes.
 *
 * Registers admin API endpoints for content CRUD, draft/publish,
 * content history, and content preview.
 */

import type { ContentManagerService, ContentEntry } from '../services/content-manager.js';
import type { HistoryService } from '../history/index.js';
import type { PreviewService } from '../preview/index.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ContentManagerRouteConfig {
  server: any;
  contentManagerService: ContentManagerService;
  historyService: HistoryService;
  previewService: PreviewService;
  prefix?: string;
}

// ---------------------------------------------------------------------------
// Response helpers
// ---------------------------------------------------------------------------

function ok(ctx: any, data: any, meta?: any): void {
  ctx.status = 200;
  ctx.body = meta ? { data, meta } : { data };
}

function created(ctx: any, data: any): void {
  ctx.status = 201;
  ctx.body = { data };
}

function noContent(ctx: any): void {
  ctx.status = 204;
  ctx.body = null;
}

function error(ctx: any, status: number, name: string, message: string): void {
  ctx.status = status;
  ctx.body = { data: null, error: { status, name, message } };
}

// ---------------------------------------------------------------------------
// History snapshot helper
// ---------------------------------------------------------------------------

function captureHistory(
  historyService: HistoryService,
  contentManagerService: ContentManagerService,
  uid: string,
  entry: ContentEntry,
  userId?: number | null,
): void {
  const ct = contentManagerService.getContentType(uid);
  if (!ct) return;

  historyService.createVersion({
    contentType: uid,
    relatedDocumentId: entry.documentId,
    locale: entry.locale,
    status: entry.status,
    data: entry,
    schema: { attributes: ct.attributes, options: ct.options },
    createdBy: userId || null,
  });
}

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

export function registerContentManagerRoutes(config: ContentManagerRouteConfig): void {
  const {
    server,
    contentManagerService: cms,
    historyService,
    previewService,
  } = config;
  const prefix = config.prefix || '/admin/content-manager';

  // ========================================================================
  // Content Types info
  // ========================================================================

  // GET /admin/content-manager/content-types
  server.route({
    method: 'GET',
    path: `${prefix}/content-types`,
    handler: async (ctx: any) => {
      ok(ctx, cms.getAllContentTypes());
    },
  });

  // GET /admin/content-manager/content-types/:uid
  server.route({
    method: 'GET',
    path: `${prefix}/content-types/:uid`,
    handler: async (ctx: any) => {
      const ct = cms.getContentType(ctx.params.uid);
      if (!ct) return error(ctx, 404, 'NotFoundError', 'Content type not found');
      ok(ctx, ct);
    },
  });

  // ========================================================================
  // Collection Types CRUD
  // ========================================================================

  // GET /admin/content-manager/collection-types/:uid
  server.route({
    method: 'GET',
    path: `${prefix}/collection-types/:uid`,
    handler: async (ctx: any) => {
      const uid = ctx.params.uid;
      if (!cms.getContentType(uid)) {
        return error(ctx, 404, 'NotFoundError', 'Content type not found');
      }

      const page = parseInt(ctx.query?.page || '1', 10);
      const pageSize = parseInt(ctx.query?.pageSize || '10', 10);
      const result = cms.findMany(uid, {
        page,
        pageSize,
        sort: ctx.query?.sort,
        status: ctx.query?.status || 'draft',
        locale: ctx.query?.locale,
      });

      ok(ctx, result.results, { pagination: result.pagination });
    },
  });

  // GET /admin/content-manager/collection-types/:uid/:documentId
  server.route({
    method: 'GET',
    path: `${prefix}/collection-types/:uid/:documentId`,
    handler: async (ctx: any) => {
      const uid = ctx.params.uid;
      if (!cms.getContentType(uid)) {
        return error(ctx, 404, 'NotFoundError', 'Content type not found');
      }

      const entry = cms.findOne(uid, ctx.params.documentId, {
        status: ctx.query?.status || 'draft',
        locale: ctx.query?.locale,
      });

      if (!entry) return error(ctx, 404, 'NotFoundError', 'Entry not found');
      ok(ctx, entry);
    },
  });

  // POST /admin/content-manager/collection-types/:uid
  server.route({
    method: 'POST',
    path: `${prefix}/collection-types/:uid`,
    handler: async (ctx: any) => {
      const uid = ctx.params.uid;
      if (!cms.getContentType(uid)) {
        return error(ctx, 404, 'NotFoundError', 'Content type not found');
      }

      const body = ctx.request.body;
      if (!body) return error(ctx, 400, 'ValidationError', 'Missing request body');

      const userId = ctx.state?.auth?.credentials?.id;
      const entry = cms.create(uid, body, {
        locale: ctx.query?.locale,
        createdBy: userId,
      });

      captureHistory(historyService, cms, uid, entry, userId);
      created(ctx, entry);
    },
  });

  // PUT /admin/content-manager/collection-types/:uid/:documentId
  server.route({
    method: 'PUT',
    path: `${prefix}/collection-types/:uid/:documentId`,
    handler: async (ctx: any) => {
      const uid = ctx.params.uid;
      if (!cms.getContentType(uid)) {
        return error(ctx, 404, 'NotFoundError', 'Content type not found');
      }

      const body = ctx.request.body;
      if (!body) return error(ctx, 400, 'ValidationError', 'Missing request body');

      const userId = ctx.state?.auth?.credentials?.id;
      const entry = cms.update(uid, ctx.params.documentId, body, {
        locale: ctx.query?.locale,
        updatedBy: userId,
      });

      if (!entry) return error(ctx, 404, 'NotFoundError', 'Entry not found');

      captureHistory(historyService, cms, uid, entry, userId);
      ok(ctx, entry);
    },
  });

  // DELETE /admin/content-manager/collection-types/:uid/:documentId
  server.route({
    method: 'DELETE',
    path: `${prefix}/collection-types/:uid/:documentId`,
    handler: async (ctx: any) => {
      const uid = ctx.params.uid;
      if (!cms.getContentType(uid)) {
        return error(ctx, 404, 'NotFoundError', 'Content type not found');
      }

      const deleted = cms.delete(uid, ctx.params.documentId, {
        locale: ctx.query?.locale,
      });

      if (!deleted) return error(ctx, 404, 'NotFoundError', 'Entry not found');
      ok(ctx, { documentId: ctx.params.documentId });
    },
  });

  // ========================================================================
  // Draft/Publish actions
  // ========================================================================

  // POST /admin/content-manager/collection-types/:uid/:documentId/actions/publish
  server.route({
    method: 'POST',
    path: `${prefix}/collection-types/:uid/:documentId/actions/publish`,
    handler: async (ctx: any) => {
      const uid = ctx.params.uid;
      if (!cms.getContentType(uid)) {
        return error(ctx, 404, 'NotFoundError', 'Content type not found');
      }

      const ct = cms.getContentType(uid)!;
      if (ct.options?.draftAndPublish === false) {
        return error(ctx, 400, 'ApplicationError', 'Draft and publish is not enabled for this content type');
      }

      const userId = ctx.state?.auth?.credentials?.id;
      const entry = cms.publish(uid, ctx.params.documentId, {
        locale: ctx.query?.locale,
        publishedBy: userId,
      });

      if (!entry) return error(ctx, 404, 'NotFoundError', 'Draft entry not found');

      captureHistory(historyService, cms, uid, entry, userId);
      ok(ctx, entry);
    },
  });

  // POST /admin/content-manager/collection-types/:uid/:documentId/actions/unpublish
  server.route({
    method: 'POST',
    path: `${prefix}/collection-types/:uid/:documentId/actions/unpublish`,
    handler: async (ctx: any) => {
      const uid = ctx.params.uid;
      if (!cms.getContentType(uid)) {
        return error(ctx, 404, 'NotFoundError', 'Content type not found');
      }

      const entry = cms.unpublish(uid, ctx.params.documentId, {
        locale: ctx.query?.locale,
      });

      if (!entry) return error(ctx, 404, 'NotFoundError', 'Published entry not found');

      const userId = ctx.state?.auth?.credentials?.id;
      captureHistory(historyService, cms, uid, entry, userId);
      ok(ctx, entry);
    },
  });

  // POST /admin/content-manager/collection-types/:uid/:documentId/actions/discard-draft
  server.route({
    method: 'POST',
    path: `${prefix}/collection-types/:uid/:documentId/actions/discard-draft`,
    handler: async (ctx: any) => {
      const uid = ctx.params.uid;
      if (!cms.getContentType(uid)) {
        return error(ctx, 404, 'NotFoundError', 'Content type not found');
      }

      const entry = cms.discardDraft(uid, ctx.params.documentId, {
        locale: ctx.query?.locale,
      });

      if (!entry) return error(ctx, 404, 'NotFoundError', 'No published version to restore from');

      const userId = ctx.state?.auth?.credentials?.id;
      captureHistory(historyService, cms, uid, entry, userId);
      ok(ctx, entry);
    },
  });

  // ========================================================================
  // Single Types CRUD
  // ========================================================================

  // GET /admin/content-manager/single-types/:uid
  server.route({
    method: 'GET',
    path: `${prefix}/single-types/:uid`,
    handler: async (ctx: any) => {
      const uid = ctx.params.uid;
      const ct = cms.getContentType(uid);
      if (!ct || ct.kind !== 'singleType') {
        return error(ctx, 404, 'NotFoundError', 'Single type not found');
      }

      const entry = cms.findSingle(uid, {
        status: ctx.query?.status || 'draft',
        locale: ctx.query?.locale,
      });

      if (!entry) return noContent(ctx);
      ok(ctx, entry);
    },
  });

  // PUT /admin/content-manager/single-types/:uid
  server.route({
    method: 'PUT',
    path: `${prefix}/single-types/:uid`,
    handler: async (ctx: any) => {
      const uid = ctx.params.uid;
      const ct = cms.getContentType(uid);
      if (!ct || ct.kind !== 'singleType') {
        return error(ctx, 404, 'NotFoundError', 'Single type not found');
      }

      const body = ctx.request.body;
      if (!body) return error(ctx, 400, 'ValidationError', 'Missing request body');

      const userId = ctx.state?.auth?.credentials?.id;
      const entry = cms.createOrUpdateSingle(uid, body, {
        locale: ctx.query?.locale,
        updatedBy: userId,
      });

      captureHistory(historyService, cms, uid, entry, userId);
      ok(ctx, entry);
    },
  });

  // DELETE /admin/content-manager/single-types/:uid
  server.route({
    method: 'DELETE',
    path: `${prefix}/single-types/:uid`,
    handler: async (ctx: any) => {
      const uid = ctx.params.uid;
      const ct = cms.getContentType(uid);
      if (!ct || ct.kind !== 'singleType') {
        return error(ctx, 404, 'NotFoundError', 'Single type not found');
      }

      const deleted = cms.deleteSingle(uid, {
        locale: ctx.query?.locale,
      });

      if (!deleted) return error(ctx, 404, 'NotFoundError', 'Entry not found');
      ok(ctx, { deleted: true });
    },
  });

  // Single type publish/unpublish
  server.route({
    method: 'POST',
    path: `${prefix}/single-types/:uid/actions/publish`,
    handler: async (ctx: any) => {
      const uid = ctx.params.uid;
      const ct = cms.getContentType(uid);
      if (!ct || ct.kind !== 'singleType') {
        return error(ctx, 404, 'NotFoundError', 'Single type not found');
      }

      // For single types, find the draft's documentId first
      const draft = cms.findSingle(uid, { status: 'draft', locale: ctx.query?.locale });
      if (!draft) return error(ctx, 404, 'NotFoundError', 'Draft entry not found');

      const userId = ctx.state?.auth?.credentials?.id;
      const entry = cms.publish(uid, draft.documentId, {
        locale: ctx.query?.locale,
        publishedBy: userId,
      });

      if (!entry) return error(ctx, 404, 'NotFoundError', 'Draft entry not found');

      captureHistory(historyService, cms, uid, entry, userId);
      ok(ctx, entry);
    },
  });

  server.route({
    method: 'POST',
    path: `${prefix}/single-types/:uid/actions/unpublish`,
    handler: async (ctx: any) => {
      const uid = ctx.params.uid;
      const ct = cms.getContentType(uid);
      if (!ct || ct.kind !== 'singleType') {
        return error(ctx, 404, 'NotFoundError', 'Single type not found');
      }

      const draft = cms.findSingle(uid, { status: 'draft', locale: ctx.query?.locale });
      if (!draft) return error(ctx, 404, 'NotFoundError', 'Entry not found');

      const entry = cms.unpublish(uid, draft.documentId, { locale: ctx.query?.locale });
      if (!entry) return error(ctx, 404, 'NotFoundError', 'Published entry not found');

      const userId = ctx.state?.auth?.credentials?.id;
      captureHistory(historyService, cms, uid, entry, userId);
      ok(ctx, entry);
    },
  });

  // ========================================================================
  // Content History
  // ========================================================================

  // GET /admin/content-manager/history-versions/:contentType/:documentId
  server.route({
    method: 'GET',
    path: `${prefix}/history-versions/:contentType/:documentId`,
    handler: async (ctx: any) => {
      const page = parseInt(ctx.query?.page || '1', 10);
      const pageSize = parseInt(ctx.query?.pageSize || '20', 10);

      const result = historyService.findVersionsPage({
        contentType: ctx.params.contentType,
        relatedDocumentId: ctx.params.documentId,
        locale: ctx.query?.locale,
        page,
        pageSize,
      });

      ok(ctx, result.results, { pagination: result.pagination });
    },
  });

  // POST /admin/content-manager/history-versions/:versionId/restore
  server.route({
    method: 'POST',
    path: `${prefix}/history-versions/:versionId/restore`,
    handler: async (ctx: any) => {
      const versionId = parseInt(ctx.params.versionId, 10);
      const version = historyService.findOne(versionId);

      if (!version) return error(ctx, 404, 'NotFoundError', 'Version not found');

      const ct = cms.getContentType(version.contentType);
      if (!ct) return error(ctx, 404, 'NotFoundError', 'Content type not found');

      const currentSchema = { attributes: ct.attributes, options: ct.options };
      const restoreResult = historyService.restoreVersion(versionId, currentSchema);

      if (!restoreResult) return error(ctx, 404, 'NotFoundError', 'Version not found');

      // Apply restored data via update
      const userId = ctx.state?.auth?.credentials?.id;
      const updated = cms.update(
        version.contentType,
        version.relatedDocumentId,
        restoreResult.entry,
        { locale: version.locale || undefined, updatedBy: userId },
      );

      if (!updated) return error(ctx, 404, 'NotFoundError', 'Entry not found for restore');

      captureHistory(historyService, cms, version.contentType, updated, userId);

      ok(ctx, {
        entry: updated,
        unknowns: restoreResult.unknowns,
      });
    },
  });

  // ========================================================================
  // Content Preview
  // ========================================================================

  // GET /admin/content-manager/preview/url
  server.route({
    method: 'GET',
    path: `${prefix}/preview/url`,
    handler: async (ctx: any) => {
      if (!previewService.isEnabled()) {
        return noContent(ctx);
      }

      const contentType = ctx.query?.contentType;
      const documentId = ctx.query?.documentId;

      if (!contentType || !documentId) {
        return error(ctx, 400, 'ValidationError', 'Missing contentType or documentId query parameters');
      }

      const url = await previewService.getPreviewUrl({
        contentType,
        documentId,
        locale: ctx.query?.locale,
        status: ctx.query?.status || 'draft',
      });

      if (!url) return noContent(ctx);
      ok(ctx, { url });
    },
  });
}
