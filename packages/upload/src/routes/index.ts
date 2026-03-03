/**
 * Upload/Media admin routes.
 */

import type { UploadService } from '../services/upload.js';

export interface UploadRoutesConfig {
  router: {
    on(method: string, path: string, handler: (req: any, res: any, params: any) => void): void;
  };
  uploadService: UploadService;
}

function ok(res: any, data: any, meta?: any) {
  res.statusCode = 200;
  res.end(JSON.stringify({ data, ...(meta ? { meta } : {}) }));
}
function created(res: any, data: any) { res.statusCode = 201; res.end(JSON.stringify({ data })); }
function noContent(res: any) { res.statusCode = 204; res.end(); }
function error(res: any, status: number, message: string) {
  res.statusCode = status;
  res.end(JSON.stringify({ data: null, error: { status, name: 'ApplicationError', message } }));
}

export function registerUploadRoutes(config: UploadRoutesConfig): void {
  const { router, uploadService } = config;

  // GET /api/upload/files
  router.on('GET', '/api/upload/files', (req: any, res: any) => {
    const url = new URL(req.url || '', 'http://localhost');
    const page = Number(url.searchParams.get('page')) || 1;
    const pageSize = Number(url.searchParams.get('pageSize')) || 10;
    const folderId = url.searchParams.get('folderId');
    const result = uploadService.findAll({
      page, pageSize,
      folderId: folderId === 'null' ? null : folderId ? Number(folderId) : undefined,
    });
    ok(res, result.results, { pagination: result.pagination });
  });

  // GET /api/upload/files/:id
  router.on('GET', '/api/upload/files/:id', (_req: any, res: any, params: any) => {
    const file = uploadService.findOne(Number(params.id));
    if (!file) return error(res, 404, 'File not found');
    ok(res, file);
  });

  // POST /api/upload
  router.on('POST', '/api/upload', async (req: any, res: any) => {
    try {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
      if (!body.name || !body.mime) return error(res, 400, '"name" and "mime" are required');
      const file = await uploadService.create({
        name: body.name,
        ext: body.ext || '',
        mime: body.mime,
        size: body.size || 0,
        width: body.width,
        height: body.height,
        folderId: body.folderId,
      });
      created(res, file);
    } catch (err: any) {
      error(res, 400, err.message);
    }
  });

  // PUT /api/upload/files/:id
  router.on('PUT', '/api/upload/files/:id', (req: any, res: any, params: any) => {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const file = uploadService.updateById(Number(params.id), body);
    if (!file) return error(res, 404, 'File not found');
    ok(res, file);
  });

  // DELETE /api/upload/files/:id
  router.on('DELETE', '/api/upload/files/:id', async (_req: any, res: any, params: any) => {
    const deleted = await uploadService.deleteById(Number(params.id));
    if (!deleted) return error(res, 404, 'File not found');
    noContent(res);
  });

  // GET /api/upload/folders
  router.on('GET', '/api/upload/folders', (_req: any, res: any) => {
    ok(res, uploadService.findAllFolders());
  });

  // POST /api/upload/folders
  router.on('POST', '/api/upload/folders', (req: any, res: any) => {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    if (!body.name) return error(res, 400, '"name" is required');
    const folder = uploadService.createFolder(body);
    created(res, folder);
  });

  // DELETE /api/upload/folders/:id
  router.on('DELETE', '/api/upload/folders/:id', (_req: any, res: any, params: any) => {
    const deleted = uploadService.deleteFolder(Number(params.id));
    if (!deleted) return error(res, 404, 'Folder not found');
    noContent(res);
  });
}
