/**
 * Review Workflows admin routes.
 */

import type { WorkflowService } from '../services/workflow.js';

export interface WorkflowRoutesConfig {
  router: {
    on(method: string, path: string, handler: (req: any, res: any, params: any) => void): void;
  };
  workflowService: WorkflowService;
}

function ok(res: any, data: any) { res.statusCode = 200; res.end(JSON.stringify({ data })); }
function created(res: any, data: any) { res.statusCode = 201; res.end(JSON.stringify({ data })); }
function noContent(res: any) { res.statusCode = 204; res.end(); }
function error(res: any, status: number, message: string) {
  res.statusCode = status;
  res.end(JSON.stringify({ data: null, error: { status, name: 'ApplicationError', message } }));
}

export function registerWorkflowRoutes(config: WorkflowRoutesConfig): void {
  const { router, workflowService } = config;

  // GET /admin/review-workflows
  router.on('GET', '/admin/review-workflows', (_req: any, res: any) => {
    ok(res, workflowService.findAll());
  });

  // GET /admin/review-workflows/:id
  router.on('GET', '/admin/review-workflows/:id', (_req: any, res: any, params: any) => {
    const wf = workflowService.findOne(Number(params.id));
    if (!wf) return error(res, 404, 'Workflow not found');
    ok(res, wf);
  });

  // POST /admin/review-workflows
  router.on('POST', '/admin/review-workflows', (req: any, res: any) => {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    if (!body.name) return error(res, 400, '"name" is required');
    const wf = workflowService.create(body);
    created(res, wf);
  });

  // PUT /admin/review-workflows/:id
  router.on('PUT', '/admin/review-workflows/:id', (req: any, res: any, params: any) => {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const wf = workflowService.updateById(Number(params.id), body);
    if (!wf) return error(res, 404, 'Workflow not found');
    ok(res, wf);
  });

  // DELETE /admin/review-workflows/:id
  router.on('DELETE', '/admin/review-workflows/:id', (_req: any, res: any, params: any) => {
    const deleted = workflowService.deleteById(Number(params.id));
    if (!deleted) return error(res, 404, 'Workflow not found');
    noContent(res);
  });

  // POST /admin/review-workflows/:id/stages
  router.on('POST', '/admin/review-workflows/:id/stages', (req: any, res: any, params: any) => {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    if (!body.name) return error(res, 400, '"name" is required');
    const stage = workflowService.addStage(Number(params.id), body);
    if (!stage) return error(res, 404, 'Workflow not found');
    created(res, stage);
  });

  // DELETE /admin/review-workflows/stages/:stageId
  router.on('DELETE', '/admin/review-workflows/stages/:stageId', (_req: any, res: any, params: any) => {
    const removed = workflowService.removeStage(Number(params.stageId));
    if (!removed) return error(res, 404, 'Stage not found');
    noContent(res);
  });

  // PUT /admin/review-workflows/assign-stage
  router.on('PUT', '/admin/review-workflows/assign-stage', (req: any, res: any) => {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    if (!body.contentType || !body.documentId || !body.stageId) {
      return error(res, 400, '"contentType", "documentId", and "stageId" are required');
    }
    const assigned = workflowService.assignStage(body.contentType, body.documentId, body.stageId);
    if (!assigned) return error(res, 400, 'Stage not found');
    ok(res, { assigned: true });
  });

  // GET /admin/review-workflows/document-stage
  router.on('GET', '/admin/review-workflows/document-stage', (req: any, res: any) => {
    const url = new URL(req.url || '', 'http://localhost');
    const contentType = url.searchParams.get('contentType');
    const documentId = url.searchParams.get('documentId');
    if (!contentType || !documentId) {
      return error(res, 400, '"contentType" and "documentId" query params required');
    }
    const stage = workflowService.getDocumentStage(contentType, documentId);
    ok(res, stage);
  });
}
