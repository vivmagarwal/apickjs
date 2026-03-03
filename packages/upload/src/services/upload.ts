/**
 * Upload/Media Service.
 *
 * Manages file uploads and media metadata with folder organization
 * and provider interface for storage backends.
 */

import { createHash, randomBytes } from 'node:crypto';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MediaFile {
  id?: number;
  name: string;
  alternativeText: string;
  caption: string;
  hash: string;
  ext: string;
  mime: string;
  size: number;
  width: number | null;
  height: number | null;
  url: string;
  formats: Record<string, any>;
  folderId: number | null;
  folderPath: string;
  provider: string;
  createdAt: string;
  updatedAt: string;
}

export interface MediaFolder {
  id?: number;
  name: string;
  pathId: number;
  path: string;
  parentId: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface UploadProvider {
  upload(file: { name: string; hash: string; ext: string; mime: string; buffer: Buffer; size: number }): Promise<{ url: string }> | { url: string };
  delete(file: { hash: string; ext: string; url: string }): Promise<void> | void;
}

export interface UploadService {
  findAll(params?: { page?: number; pageSize?: number; folderId?: number | null }): { results: MediaFile[]; pagination: { page: number; pageSize: number; pageCount: number; total: number } };
  findOne(id: number): MediaFile | null;
  create(data: { name: string; ext: string; mime: string; size: number; width?: number; height?: number; buffer?: Buffer; folderId?: number }): Promise<MediaFile>;
  updateById(id: number, data: Partial<{ name: string; alternativeText: string; caption: string; folderId: number | null }>): MediaFile | null;
  deleteById(id: number): Promise<boolean>;
  count(): number;

  // Folders
  findAllFolders(): MediaFolder[];
  createFolder(data: { name: string; parentId?: number | null }): MediaFolder;
  deleteFolder(id: number): boolean;

  // Provider
  setProvider(provider: UploadProvider): void;
}

export interface UploadServiceConfig {
  rawDb: any;
  provider?: UploadProvider;
}

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

function ensureTables(db: any): void {
  db.exec(`CREATE TABLE IF NOT EXISTS "upload_files" (
    "id" INTEGER PRIMARY KEY AUTOINCREMENT,
    "name" VARCHAR(255) NOT NULL,
    "alternative_text" TEXT NOT NULL DEFAULT '',
    "caption" TEXT NOT NULL DEFAULT '',
    "hash" VARCHAR(255) NOT NULL,
    "ext" VARCHAR(20) NOT NULL DEFAULT '',
    "mime" VARCHAR(100) NOT NULL DEFAULT '',
    "size" REAL NOT NULL DEFAULT 0,
    "width" INTEGER,
    "height" INTEGER,
    "url" TEXT NOT NULL DEFAULT '',
    "formats" TEXT NOT NULL DEFAULT '{}',
    "folder_id" INTEGER,
    "folder_path" VARCHAR(512) NOT NULL DEFAULT '/',
    "provider" VARCHAR(50) NOT NULL DEFAULT 'local',
    "created_at" TEXT NOT NULL,
    "updated_at" TEXT NOT NULL
  )`);

  db.exec(`CREATE TABLE IF NOT EXISTS "upload_folders" (
    "id" INTEGER PRIMARY KEY AUTOINCREMENT,
    "name" VARCHAR(255) NOT NULL,
    "path_id" INTEGER NOT NULL,
    "path" VARCHAR(512) NOT NULL DEFAULT '/',
    "parent_id" INTEGER,
    "created_at" TEXT NOT NULL,
    "updated_at" TEXT NOT NULL
  )`);
}

function rowToFile(row: any): MediaFile {
  return {
    id: row.id, name: row.name,
    alternativeText: row.alternative_text || '',
    caption: row.caption || '',
    hash: row.hash, ext: row.ext, mime: row.mime,
    size: row.size, width: row.width, height: row.height,
    url: row.url,
    formats: row.formats ? JSON.parse(row.formats) : {},
    folderId: row.folder_id, folderPath: row.folder_path,
    provider: row.provider,
    createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

function rowToFolder(row: any): MediaFolder {
  return {
    id: row.id, name: row.name, pathId: row.path_id,
    path: row.path, parentId: row.parent_id,
    createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

// ---------------------------------------------------------------------------
// Default local provider (stores URL references only)
// ---------------------------------------------------------------------------

const defaultProvider: UploadProvider = {
  upload(file) {
    return { url: `/uploads/${file.hash}${file.ext}` };
  },
  delete() { /* no-op */ },
};

// ---------------------------------------------------------------------------
// Service factory
// ---------------------------------------------------------------------------

export function createUploadService(config: UploadServiceConfig): UploadService {
  const { rawDb } = config;
  let provider = config.provider || defaultProvider;
  ensureTables(rawDb);

  let nextPathId = (rawDb.prepare(`SELECT MAX(path_id) as max FROM "upload_folders"`).get()?.max || 0) + 1;

  return {
    findAll(params = {}) {
      const page = params.page || 1;
      const pageSize = params.pageSize || 10;
      const offset = (page - 1) * pageSize;

      const conditions: string[] = [];
      const values: any[] = [];

      if (params.folderId !== undefined) {
        if (params.folderId === null) {
          conditions.push('folder_id IS NULL');
        } else {
          conditions.push('folder_id = ?');
          values.push(params.folderId);
        }
      }

      const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      const total = rawDb.prepare(`SELECT COUNT(*) as cnt FROM "upload_files" ${where}`).get(...values).cnt;
      const pageCount = Math.ceil(total / pageSize);

      const rows = rawDb.prepare(`SELECT * FROM "upload_files" ${where} ORDER BY id DESC LIMIT ? OFFSET ?`).all(...values, pageSize, offset);

      return { results: rows.map(rowToFile), pagination: { page, pageSize, pageCount, total } };
    },

    findOne(id) {
      const row = rawDb.prepare(`SELECT * FROM "upload_files" WHERE id = ?`).get(id);
      return row ? rowToFile(row) : null;
    },

    async create(data) {
      const now = new Date().toISOString();
      const hash = createHash('md5').update(randomBytes(32)).digest('hex');

      const uploadResult = await provider.upload({
        name: data.name, hash, ext: data.ext, mime: data.mime,
        buffer: data.buffer || Buffer.alloc(0), size: data.size,
      });

      const result = rawDb.prepare(`
        INSERT INTO "upload_files" (name, hash, ext, mime, size, width, height, url, folder_id, folder_path, provider, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        data.name, hash, data.ext, data.mime, data.size,
        data.width || null, data.height || null,
        uploadResult.url, data.folderId || null, '/', 'local', now, now,
      );

      return this.findOne(result.lastInsertRowid as number)!;
    },

    updateById(id, data) {
      const existing = this.findOne(id);
      if (!existing) return null;

      const now = new Date().toISOString();
      const sets: string[] = ['updated_at = ?'];
      const values: any[] = [now];

      if (data.name !== undefined) { sets.push('name = ?'); values.push(data.name); }
      if (data.alternativeText !== undefined) { sets.push('alternative_text = ?'); values.push(data.alternativeText); }
      if (data.caption !== undefined) { sets.push('caption = ?'); values.push(data.caption); }
      if (data.folderId !== undefined) { sets.push('folder_id = ?'); values.push(data.folderId); }

      values.push(id);
      rawDb.prepare(`UPDATE "upload_files" SET ${sets.join(', ')} WHERE id = ?`).run(...values);
      return this.findOne(id);
    },

    async deleteById(id) {
      const file = this.findOne(id);
      if (!file) return false;

      await provider.delete({ hash: file.hash, ext: file.ext, url: file.url });
      const result = rawDb.prepare(`DELETE FROM "upload_files" WHERE id = ?`).run(id);
      return result.changes > 0;
    },

    count() {
      return rawDb.prepare(`SELECT COUNT(*) as cnt FROM "upload_files"`).get().cnt;
    },

    findAllFolders() {
      return rawDb.prepare(`SELECT * FROM "upload_folders" ORDER BY path ASC`).all().map(rowToFolder);
    },

    createFolder(data) {
      const now = new Date().toISOString();
      const pathId = nextPathId++;
      let path = `/${pathId}`;
      if (data.parentId) {
        const parent = rawDb.prepare(`SELECT path FROM "upload_folders" WHERE id = ?`).get(data.parentId);
        if (parent) path = `${parent.path}/${pathId}`;
      }

      const result = rawDb.prepare(`
        INSERT INTO "upload_folders" (name, path_id, path, parent_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(data.name, pathId, path, data.parentId || null, now, now);

      const row = rawDb.prepare(`SELECT * FROM "upload_folders" WHERE id = ?`).get(result.lastInsertRowid);
      return rowToFolder(row);
    },

    deleteFolder(id) {
      const result = rawDb.prepare(`DELETE FROM "upload_folders" WHERE id = ?`).run(id);
      return result.changes > 0;
    },

    setProvider(p) {
      provider = p;
    },
  };
}
