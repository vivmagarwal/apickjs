import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { createAuditLogService, TRACKED_ACTIONS } from '../src/audit-logs/index.js';
import type { AuditLogService } from '../src/audit-logs/index.js';

function createDb() {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  return db;
}

describe('Audit Log Service', () => {
  let db: ReturnType<typeof Database>;
  let service: AuditLogService;

  beforeEach(() => {
    db = createDb();
    service = createAuditLogService({ rawDb: db });
  });

  // ---------------------------------------------------------------------------
  // Logging
  // ---------------------------------------------------------------------------

  describe('Logging', () => {
    it('logs an action', () => {
      const entry = service.log({
        action: 'content-manager.entry.create',
        userId: 1,
        userEmail: 'admin@example.com',
        userName: 'Admin',
        payload: { contentType: 'api::article.article', documentId: 'doc-1' },
      });
      expect(entry.id).toBeDefined();
      expect(entry.action).toBe('content-manager.entry.create');
      expect(entry.userId).toBe(1);
      expect(entry.user).not.toBeNull();
      expect(entry.user!.displayName).toBe('Admin');
      expect(entry.user!.email).toBe('admin@example.com');
      expect(entry.payload.contentType).toBe('api::article.article');
      expect(entry.date).toBeDefined();
    });

    it('resolves display name from email when no userName', () => {
      const entry = service.log({
        action: 'admin.user.create',
        userId: 2,
        userEmail: 'john.doe@example.com',
      });
      expect(entry.user!.displayName).toBe('john.doe');
    });

    it('uses "Unknown" when no name or email', () => {
      const entry = service.log({ action: 'admin.auth.success', userId: 3 });
      expect(entry.user!.displayName).toBe('Unknown');
    });

    it('logs without userId', () => {
      const entry = service.log({ action: 'admin.auth.success', payload: { ip: '127.0.0.1' } });
      expect(entry.userId).toBeNull();
      expect(entry.user).toBeNull();
    });

    it('logs with empty payload', () => {
      const entry = service.log({ action: 'admin.auth.success', userId: 1 });
      expect(entry.payload).toEqual({});
    });
  });

  // ---------------------------------------------------------------------------
  // Querying
  // ---------------------------------------------------------------------------

  describe('Querying', () => {
    beforeEach(() => {
      service.log({ action: 'content-manager.entry.create', userId: 1, userEmail: 'a@x.com' });
      service.log({ action: 'content-manager.entry.update', userId: 1, userEmail: 'a@x.com' });
      service.log({ action: 'admin.user.create', userId: 2, userEmail: 'b@x.com' });
      service.log({ action: 'content-manager.entry.delete', userId: 1, userEmail: 'a@x.com' });
      service.log({ action: 'admin.role.create', userId: 2, userEmail: 'b@x.com' });
    });

    it('lists all entries with pagination', () => {
      const result = service.findMany({ page: 1, pageSize: 3 });
      expect(result.results).toHaveLength(3);
      expect(result.pagination.total).toBe(5);
      expect(result.pagination.pageCount).toBe(2);
    });

    it('filters by action', () => {
      const result = service.findMany({ action: 'admin.user.create' });
      expect(result.results).toHaveLength(1);
      expect(result.results[0].action).toBe('admin.user.create');
    });

    it('filters by userId', () => {
      const result = service.findMany({ userId: 2 });
      expect(result.results).toHaveLength(2);
    });

    it('filters by date range', () => {
      const past = new Date(Date.now() - 1000).toISOString();
      const future = new Date(Date.now() + 1000).toISOString();
      const result = service.findMany({ dateFrom: past, dateTo: future });
      expect(result.results).toHaveLength(5);
    });

    it('sorts ascending', () => {
      const result = service.findMany({ sort: 'date:asc' });
      expect(result.results[0].action).toBe('content-manager.entry.create');
    });

    it('sorts descending by default', () => {
      const result = service.findMany();
      expect(result.results[0].action).toBe('admin.role.create');
    });

    it('finds a single entry by id', () => {
      const all = service.findMany();
      const first = all.results[0];
      const found = service.findOne(first.id!);
      expect(found).not.toBeNull();
      expect(found!.action).toBe(first.action);
    });

    it('returns null for non-existent entry', () => {
      expect(service.findOne(999)).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // Cleanup
  // ---------------------------------------------------------------------------

  describe('Cleanup', () => {
    it('deletes expired events', () => {
      service.log({ action: 'old.action', userId: 1 });
      service.log({ action: 'new.action', userId: 1 });
      expect(service.count()).toBe(2);

      // Delete everything before far future
      const futureDate = new Date(Date.now() + 86400000).toISOString();
      const deleted = service.deleteExpiredEvents(futureDate);
      expect(deleted).toBe(2);
      expect(service.count()).toBe(0);
    });

    it('retains non-expired events', () => {
      service.log({ action: 'keep.me', userId: 1 });
      const pastDate = new Date(Date.now() - 86400000).toISOString();
      const deleted = service.deleteExpiredEvents(pastDate);
      expect(deleted).toBe(0);
      expect(service.count()).toBe(1);
    });
  });

  // ---------------------------------------------------------------------------
  // Counting
  // ---------------------------------------------------------------------------

  describe('Counting', () => {
    it('counts all entries', () => {
      expect(service.count()).toBe(0);
      service.log({ action: 'a', userId: 1 });
      service.log({ action: 'b', userId: 2 });
      expect(service.count()).toBe(2);
    });
  });

  // ---------------------------------------------------------------------------
  // Tracked actions list
  // ---------------------------------------------------------------------------

  describe('Tracked actions', () => {
    it('has 26 tracked actions', () => {
      expect(TRACKED_ACTIONS).toHaveLength(26);
    });

    it('includes content-manager actions', () => {
      expect(TRACKED_ACTIONS).toContain('content-manager.entry.create');
      expect(TRACKED_ACTIONS).toContain('content-manager.entry.publish');
    });

    it('includes admin actions', () => {
      expect(TRACKED_ACTIONS).toContain('admin.user.create');
      expect(TRACKED_ACTIONS).toContain('admin.auth.success');
      expect(TRACKED_ACTIONS).toContain('admin.api-token.regenerate');
    });

    it('includes review workflow action', () => {
      expect(TRACKED_ACTIONS).toContain('review-workflows.stage.transition');
    });
  });
});
