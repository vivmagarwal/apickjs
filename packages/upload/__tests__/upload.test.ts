import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { createUploadService } from '../src/services/upload.js';
import { registerUploadRoutes } from '../src/routes/index.js';
import type { UploadService, UploadProvider } from '../src/services/upload.js';

function createDb() {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  return db;
}

describe('@apick/upload', () => {
  let db: ReturnType<typeof Database>;
  let service: UploadService;

  beforeEach(() => {
    db = createDb();
    service = createUploadService({ rawDb: db });
  });

  // ---------------------------------------------------------------------------
  // File CRUD
  // ---------------------------------------------------------------------------

  describe('File CRUD', () => {
    it('creates a file', async () => {
      const file = await service.create({
        name: 'photo.jpg', ext: '.jpg', mime: 'image/jpeg', size: 12345,
        width: 800, height: 600,
      });
      expect(file.id).toBeDefined();
      expect(file.name).toBe('photo.jpg');
      expect(file.ext).toBe('.jpg');
      expect(file.mime).toBe('image/jpeg');
      expect(file.size).toBe(12345);
      expect(file.width).toBe(800);
      expect(file.height).toBe(600);
      expect(file.url).toMatch(/^\/uploads\//);
      expect(file.hash).toBeDefined();
    });

    it('finds a file by id', async () => {
      const created = await service.create({ name: 'test.png', ext: '.png', mime: 'image/png', size: 100 });
      const found = service.findOne(created.id!);
      expect(found).not.toBeNull();
      expect(found!.name).toBe('test.png');
    });

    it('returns null for non-existent file', () => {
      expect(service.findOne(999)).toBeNull();
    });

    it('lists files with pagination', async () => {
      for (let i = 0; i < 5; i++) {
        await service.create({ name: `file${i}.txt`, ext: '.txt', mime: 'text/plain', size: 10 });
      }
      const page1 = service.findAll({ page: 1, pageSize: 2 });
      expect(page1.results).toHaveLength(2);
      expect(page1.pagination.total).toBe(5);
      expect(page1.pagination.pageCount).toBe(3);

      const page3 = service.findAll({ page: 3, pageSize: 2 });
      expect(page3.results).toHaveLength(1);
    });

    it('updates file metadata', async () => {
      const file = await service.create({ name: 'original.jpg', ext: '.jpg', mime: 'image/jpeg', size: 100 });
      const updated = service.updateById(file.id!, { name: 'renamed.jpg', alternativeText: 'A photo', caption: 'My photo' });
      expect(updated).not.toBeNull();
      expect(updated!.name).toBe('renamed.jpg');
      expect(updated!.alternativeText).toBe('A photo');
      expect(updated!.caption).toBe('My photo');
    });

    it('returns null when updating non-existent file', () => {
      expect(service.updateById(999, { name: 'nope' })).toBeNull();
    });

    it('deletes a file', async () => {
      const file = await service.create({ name: 'delete.txt', ext: '.txt', mime: 'text/plain', size: 1 });
      const deleted = await service.deleteById(file.id!);
      expect(deleted).toBe(true);
      expect(service.findOne(file.id!)).toBeNull();
    });

    it('returns false when deleting non-existent file', async () => {
      expect(await service.deleteById(999)).toBe(false);
    });

    it('counts files', async () => {
      expect(service.count()).toBe(0);
      await service.create({ name: 'a.txt', ext: '.txt', mime: 'text/plain', size: 1 });
      await service.create({ name: 'b.txt', ext: '.txt', mime: 'text/plain', size: 1 });
      expect(service.count()).toBe(2);
    });
  });

  // ---------------------------------------------------------------------------
  // Folders
  // ---------------------------------------------------------------------------

  describe('Folders', () => {
    it('creates a folder', () => {
      const folder = service.createFolder({ name: 'Images' });
      expect(folder.id).toBeDefined();
      expect(folder.name).toBe('Images');
      expect(folder.path).toMatch(/^\/\d+$/);
    });

    it('creates a nested folder', () => {
      const parent = service.createFolder({ name: 'Media' });
      const child = service.createFolder({ name: 'Photos', parentId: parent.id });
      expect(child.parentId).toBe(parent.id);
      expect(child.path).toContain(String(parent.pathId));
    });

    it('lists all folders', () => {
      service.createFolder({ name: 'A' });
      service.createFolder({ name: 'B' });
      expect(service.findAllFolders()).toHaveLength(2);
    });

    it('deletes a folder', () => {
      const folder = service.createFolder({ name: 'Delete Me' });
      expect(service.deleteFolder(folder.id!)).toBe(true);
      expect(service.findAllFolders()).toHaveLength(0);
    });

    it('returns false when deleting non-existent folder', () => {
      expect(service.deleteFolder(999)).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // Folder filtering
  // ---------------------------------------------------------------------------

  describe('Folder Filtering', () => {
    it('filters files by folderId', async () => {
      const folder = service.createFolder({ name: 'Docs' });
      await service.create({ name: 'in-folder.pdf', ext: '.pdf', mime: 'application/pdf', size: 100, folderId: folder.id });
      await service.create({ name: 'root.txt', ext: '.txt', mime: 'text/plain', size: 50 });

      const inFolder = service.findAll({ folderId: folder.id });
      expect(inFolder.results).toHaveLength(1);
      expect(inFolder.results[0].name).toBe('in-folder.pdf');

      const inRoot = service.findAll({ folderId: null });
      expect(inRoot.results).toHaveLength(1);
      expect(inRoot.results[0].name).toBe('root.txt');
    });
  });

  // ---------------------------------------------------------------------------
  // Provider
  // ---------------------------------------------------------------------------

  describe('Provider', () => {
    it('uses default provider', async () => {
      const file = await service.create({ name: 'default.txt', ext: '.txt', mime: 'text/plain', size: 1 });
      expect(file.url).toMatch(/^\/uploads\/.+\.txt$/);
    });

    it('uses custom provider', async () => {
      const customProvider: UploadProvider = {
        upload(file) { return { url: `https://cdn.example.com/${file.hash}${file.ext}` }; },
        delete() {},
      };
      service.setProvider(customProvider);
      const file = await service.create({ name: 'custom.jpg', ext: '.jpg', mime: 'image/jpeg', size: 100 });
      expect(file.url).toMatch(/^https:\/\/cdn\.example\.com\/.+\.jpg$/);
    });

    it('calls provider.delete on file deletion', async () => {
      let deletedHash = '';
      const provider: UploadProvider = {
        upload(file) { return { url: `/test/${file.hash}` }; },
        delete(file) { deletedHash = file.hash; },
      };
      service.setProvider(provider);
      const file = await service.create({ name: 'del.txt', ext: '.txt', mime: 'text/plain', size: 1 });
      await service.deleteById(file.id!);
      expect(deletedHash).toBe(file.hash);
    });
  });

  // ---------------------------------------------------------------------------
  // Routes
  // ---------------------------------------------------------------------------

  describe('Routes', () => {
    it('registers routes on the router', () => {
      const routes: string[] = [];
      const mockRouter = {
        on(method: string, path: string) { routes.push(`${method} ${path}`); },
      };
      registerUploadRoutes({ router: mockRouter, uploadService: service });
      expect(routes).toContain('GET /api/upload/files');
      expect(routes).toContain('POST /api/upload');
      expect(routes).toContain('DELETE /api/upload/files/:id');
      expect(routes).toContain('POST /api/upload/folders');
    });
  });
});
