import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { createSessionService } from '../src/sessions/index.js';
import type { SessionService } from '../src/sessions/index.js';

describe('createSessionService', () => {
  let db: InstanceType<typeof Database>;
  let service: SessionService;
  const secret = 'test-session-secret';

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('journal_mode = WAL');
    service = createSessionService({ rawDb: db, secret });
  });

  afterEach(() => {
    db.close();
  });

  // --- Session creation ---

  it('creates a session', () => {
    const sessionId = service.generateSessionId();
    const session = service.create({
      sessionId,
      userId: 42,
      refreshTokenHash: service.hashToken('refresh-token'),
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
      userAgent: 'test-agent',
      ip: '127.0.0.1',
    });

    expect(session.id).toBeDefined();
    expect(session.sessionId).toBe(sessionId);
    expect(session.userId).toBe(42);
    expect(session.createdAt).toBeDefined();
    expect(session.updatedAt).toBeDefined();
    expect(session.userAgent).toBe('test-agent');
    expect(session.ip).toBe('127.0.0.1');
  });

  it('generates unique session IDs', () => {
    const ids = new Set(Array.from({ length: 10 }, () => service.generateSessionId()));
    expect(ids.size).toBe(10);
  });

  it('hashes tokens consistently', () => {
    const hash1 = service.hashToken('my-token');
    const hash2 = service.hashToken('my-token');
    expect(hash1).toBe(hash2);
  });

  it('produces different hashes for different tokens', () => {
    const hash1 = service.hashToken('token-1');
    const hash2 = service.hashToken('token-2');
    expect(hash1).not.toBe(hash2);
  });

  // --- Session lookup ---

  it('finds session by sessionId', () => {
    const sessionId = service.generateSessionId();
    service.create({
      sessionId,
      userId: 1,
      refreshTokenHash: 'hash',
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
    });

    const found = service.findBySessionId(sessionId);
    expect(found).not.toBeNull();
    expect(found!.sessionId).toBe(sessionId);
  });

  it('returns null for non-existent session', () => {
    expect(service.findBySessionId('nonexistent')).toBeNull();
  });

  // --- Session update ---

  it('updates refresh token hash', () => {
    const sessionId = service.generateSessionId();
    service.create({
      sessionId,
      userId: 1,
      refreshTokenHash: 'old-hash',
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
    });

    const updated = service.updateBySessionId(sessionId, {
      refreshTokenHash: 'new-hash',
    });

    expect(updated).not.toBeNull();
    expect(updated!.refreshTokenHash).toBe('new-hash');
  });

  it('updates expiry time', () => {
    const sessionId = service.generateSessionId();
    service.create({
      sessionId,
      userId: 1,
      refreshTokenHash: 'hash',
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
    });

    const newExpiry = new Date(Date.now() + 2 * 86400000).toISOString();
    const updated = service.updateBySessionId(sessionId, {
      expiresAt: newExpiry,
    });

    expect(updated!.expiresAt).toBe(newExpiry);
  });

  it('returns null when updating non-existent session', () => {
    const updated = service.updateBySessionId('nonexistent', {
      refreshTokenHash: 'new',
    });
    expect(updated).toBeNull();
  });

  // --- Session deletion ---

  it('deletes session by sessionId', () => {
    const sessionId = service.generateSessionId();
    service.create({
      sessionId,
      userId: 1,
      refreshTokenHash: 'hash',
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
    });

    const result = service.deleteBySessionId(sessionId);
    expect(result).toBe(true);
    expect(service.findBySessionId(sessionId)).toBeNull();
  });

  it('returns false when deleting non-existent session', () => {
    expect(service.deleteBySessionId('nonexistent')).toBe(false);
  });

  it('deletes all sessions for a user', () => {
    for (let i = 0; i < 3; i++) {
      service.create({
        sessionId: service.generateSessionId(),
        userId: 42,
        refreshTokenHash: `hash-${i}`,
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      });
    }
    // Create one for a different user
    service.create({
      sessionId: service.generateSessionId(),
      userId: 99,
      refreshTokenHash: 'other',
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
    });

    const deleted = service.deleteByUserId(42);
    expect(deleted).toBe(3);
  });

  it('deletes expired sessions', () => {
    // Create expired session
    service.create({
      sessionId: service.generateSessionId(),
      userId: 1,
      refreshTokenHash: 'expired',
      expiresAt: new Date(Date.now() - 86400000).toISOString(), // expired yesterday
    });
    // Create valid session
    service.create({
      sessionId: service.generateSessionId(),
      userId: 2,
      refreshTokenHash: 'valid',
      expiresAt: new Date(Date.now() + 86400000).toISOString(), // expires tomorrow
    });

    const deleted = service.deleteExpired();
    expect(deleted).toBe(1);
  });

  it('deletes all sessions', () => {
    for (let i = 0; i < 5; i++) {
      service.create({
        sessionId: service.generateSessionId(),
        userId: i,
        refreshTokenHash: `hash-${i}`,
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      });
    }

    const deleted = service.deleteAll();
    expect(deleted).toBe(5);
  });

  // --- Custom table name ---

  it('supports custom table name', () => {
    const customService = createSessionService({
      rawDb: db,
      secret,
      tableName: 'admin_sessions',
    });

    const sessionId = customService.generateSessionId();
    customService.create({
      sessionId,
      userId: 1,
      refreshTokenHash: 'hash',
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
    });

    const found = customService.findBySessionId(sessionId);
    expect(found).not.toBeNull();
  });
});
