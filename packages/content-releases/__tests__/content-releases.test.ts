import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { createReleaseService } from '../src/services/release.js';
import { registerReleaseRoutes } from '../src/routes/index.js';
import type { ReleaseService, ReleaseAction } from '../src/services/release.js';

function createDb() {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  return db;
}

describe('@apick/content-releases', () => {
  let db: ReturnType<typeof Database>;
  let service: ReleaseService;

  beforeEach(() => {
    db = createDb();
    service = createReleaseService({ rawDb: db });
  });

  // ---------------------------------------------------------------------------
  // Release CRUD
  // ---------------------------------------------------------------------------

  describe('Release CRUD', () => {
    it('creates a release', () => {
      const release = service.create({ name: 'Sprint 1 Release' });
      expect(release.id).toBeDefined();
      expect(release.name).toBe('Sprint 1 Release');
      expect(release.status).toBe('pending');
      expect(release.scheduledAt).toBeNull();
      expect(release.createdAt).toBeDefined();
    });

    it('lists all releases', () => {
      service.create({ name: 'Release A' });
      service.create({ name: 'Release B' });
      const all = service.findAll();
      expect(all).toHaveLength(2);
    });

    it('finds a release by id', () => {
      const created = service.create({ name: 'Findable' });
      const found = service.findOne(created.id!);
      expect(found).not.toBeNull();
      expect(found!.name).toBe('Findable');
    });

    it('returns null for non-existent release', () => {
      expect(service.findOne(999)).toBeNull();
    });

    it('updates a pending release', () => {
      const release = service.create({ name: 'Old Name' });
      const updated = service.updateById(release.id!, { name: 'New Name' });
      expect(updated).not.toBeNull();
      expect(updated!.name).toBe('New Name');
    });

    it('does not update a non-pending release', () => {
      const release = service.create({ name: 'Published' });
      service.publish(release.id!, () => true);
      const updated = service.updateById(release.id!, { name: 'Updated' });
      expect(updated).toBeNull();
    });

    it('deletes a release', () => {
      const release = service.create({ name: 'Delete Me' });
      expect(service.deleteById(release.id!)).toBe(true);
      expect(service.findOne(release.id!)).toBeNull();
    });

    it('returns false when deleting non-existent release', () => {
      expect(service.deleteById(999)).toBe(false);
    });

    it('creates a release with scheduledAt', () => {
      const scheduled = new Date(Date.now() + 86400000).toISOString();
      const release = service.create({ name: 'Scheduled', scheduledAt: scheduled });
      expect(release.scheduledAt).toBe(scheduled);
    });

    it('creates a release with createdBy', () => {
      const release = service.create({ name: 'By Admin', createdBy: 42 });
      expect(release.createdBy).toBe(42);
    });
  });

  // ---------------------------------------------------------------------------
  // Release Actions
  // ---------------------------------------------------------------------------

  describe('Release Actions', () => {
    it('adds an action to a release', () => {
      const release = service.create({ name: 'With Actions' });
      const action = service.addAction(release.id!, {
        type: 'publish', contentType: 'api::article.article', documentId: 'doc-1',
      });
      expect(action.id).toBeDefined();
      expect(action.releaseId).toBe(release.id);
      expect(action.type).toBe('publish');
      expect(action.contentType).toBe('api::article.article');
    });

    it('lists actions for a release', () => {
      const release = service.create({ name: 'Actions List' });
      service.addAction(release.id!, { type: 'publish', contentType: 'api::a.a', documentId: 'd1' });
      service.addAction(release.id!, { type: 'unpublish', contentType: 'api::b.b', documentId: 'd2' });
      const actions = service.getActions(release.id!);
      expect(actions).toHaveLength(2);
    });

    it('removes an action', () => {
      const release = service.create({ name: 'Remove Action' });
      const action = service.addAction(release.id!, { type: 'publish', contentType: 'api::a.a', documentId: 'd1' });
      expect(service.removeAction(action.id!)).toBe(true);
      expect(service.getActions(release.id!)).toHaveLength(0);
    });

    it('returns false when removing non-existent action', () => {
      expect(service.removeAction(999)).toBe(false);
    });

    it('supports locale on actions', () => {
      const release = service.create({ name: 'i18n Release' });
      const action = service.addAction(release.id!, {
        type: 'publish', contentType: 'api::a.a', documentId: 'd1', locale: 'fr',
      });
      expect(action.locale).toBe('fr');
    });
  });

  // ---------------------------------------------------------------------------
  // Publishing
  // ---------------------------------------------------------------------------

  describe('Publishing', () => {
    it('publishes a release successfully', () => {
      const release = service.create({ name: 'Publish Me' });
      service.addAction(release.id!, { type: 'publish', contentType: 'api::a.a', documentId: 'd1' });
      service.addAction(release.id!, { type: 'publish', contentType: 'api::b.b', documentId: 'd2' });

      const executed: string[] = [];
      const result = service.publish(release.id!, (action) => {
        executed.push(action.documentId);
        return true;
      });

      expect(result).not.toBeNull();
      expect(result!.status).toBe('done');
      expect(result!.releasedAt).toBeDefined();
      expect(executed).toEqual(['d1', 'd2']);
    });

    it('marks release as failed when executor returns false', () => {
      const release = service.create({ name: 'Fail' });
      service.addAction(release.id!, { type: 'publish', contentType: 'api::a.a', documentId: 'd1' });
      service.addAction(release.id!, { type: 'publish', contentType: 'api::b.b', documentId: 'd2' });

      const result = service.publish(release.id!, (action) => {
        return action.documentId !== 'd1'; // fail on first
      });

      expect(result).not.toBeNull();
      expect(result!.status).toBe('failed');
      expect(result!.releasedAt).toBeNull();
    });

    it('returns null when publishing non-existent release', () => {
      expect(service.publish(999, () => true)).toBeNull();
    });

    it('returns null when publishing already-published release', () => {
      const release = service.create({ name: 'Already Done' });
      service.publish(release.id!, () => true);
      expect(service.publish(release.id!, () => true)).toBeNull();
    });

    it('publishes a release with no actions (succeeds immediately)', () => {
      const release = service.create({ name: 'Empty' });
      const result = service.publish(release.id!, () => true);
      expect(result!.status).toBe('done');
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
      registerReleaseRoutes({ router: mockRouter, releaseService: service });
      expect(routes).toContain('GET /admin/content-releases');
      expect(routes).toContain('POST /admin/content-releases');
      expect(routes).toContain('POST /admin/content-releases/:id/publish');
    });
  });
});
