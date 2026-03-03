/**
 * Content Releases admin routes.
 */

import type { ReleaseService, ReleaseAction } from '../services/release.js';

export interface ReleaseRoutesConfig {
  router: {
    on(method: string, path: string, handler: (req: any, res: any, params: any) => void): void;
  };
  releaseService: ReleaseService;
  auth?: {
    verify(token: string): { id: number } | null;
  };
}

function ok(res: any, data: any) { res.statusCode = 200; res.end(JSON.stringify({ data })); }
function created(res: any, data: any) { res.statusCode = 201; res.end(JSON.stringify({ data })); }
function noContent(res: any) { res.statusCode = 204; res.end(); }
function error(res: any, status: number, message: string) {
  res.statusCode = status;
  res.end(JSON.stringify({ data: null, error: { status, name: 'ApplicationError', message } }));
}

export function registerReleaseRoutes(config: ReleaseRoutesConfig): void {
  const { router, releaseService } = config;

  // GET /admin/content-releases
  router.on('GET', '/admin/content-releases', (_req: any, res: any) => {
    ok(res, releaseService.findAll());
  });

  // GET /admin/content-releases/:id
  router.on('GET', '/admin/content-releases/:id', (_req: any, res: any, params: any) => {
    const release = releaseService.findOne(Number(params.id));
    if (!release) return error(res, 404, 'Release not found');
    ok(res, release);
  });

  // POST /admin/content-releases
  router.on('POST', '/admin/content-releases', (req: any, res: any) => {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    if (!body.name) return error(res, 400, '"name" is required');
    const release = releaseService.create(body);
    created(res, release);
  });

  // PUT /admin/content-releases/:id
  router.on('PUT', '/admin/content-releases/:id', (req: any, res: any, params: any) => {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const release = releaseService.updateById(Number(params.id), body);
    if (!release) return error(res, 404, 'Release not found or not editable');
    ok(res, release);
  });

  // DELETE /admin/content-releases/:id
  router.on('DELETE', '/admin/content-releases/:id', (_req: any, res: any, params: any) => {
    const deleted = releaseService.deleteById(Number(params.id));
    if (!deleted) return error(res, 404, 'Release not found');
    noContent(res);
  });

  // POST /admin/content-releases/:id/actions
  router.on('POST', '/admin/content-releases/:id/actions', (req: any, res: any, params: any) => {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    if (!body.type || !body.contentType || !body.documentId) {
      return error(res, 400, '"type", "contentType", and "documentId" are required');
    }
    const action = releaseService.addAction(Number(params.id), body);
    created(res, action);
  });

  // GET /admin/content-releases/:id/actions
  router.on('GET', '/admin/content-releases/:id/actions', (_req: any, res: any, params: any) => {
    const actions = releaseService.getActions(Number(params.id));
    ok(res, actions);
  });

  // DELETE /admin/content-releases/actions/:actionId
  router.on('DELETE', '/admin/content-releases/actions/:actionId', (_req: any, res: any, params: any) => {
    const removed = releaseService.removeAction(Number(params.actionId));
    if (!removed) return error(res, 404, 'Action not found');
    noContent(res);
  });

  // POST /admin/content-releases/:id/publish
  router.on('POST', '/admin/content-releases/:id/publish', (req: any, res: any, params: any) => {
    // Default executor always succeeds — in a real system, it would call the content manager
    const executor = (_action: ReleaseAction) => true;
    const release = releaseService.publish(Number(params.id), executor);
    if (!release) return error(res, 400, 'Release not found or not in pending status');
    ok(res, release);
  });
}
