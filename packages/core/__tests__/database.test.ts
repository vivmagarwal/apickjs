import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDatabase } from '../src/database/connection.js';
import { createLifecycleRegistry } from '../src/database/lifecycles/index.js';
import { createLogger } from '../src/logging/index.js';

const logger = createLogger({ level: 'silent' });

describe('Database Connection', () => {
  it('creates an in-memory SQLite database', () => {
    const db = createDatabase({
      connection: { client: 'sqlite', filename: ':memory:' },
    }, logger);

    expect(db).toBeDefined();
    expect(db.dialect).toBe('sqlite');
    expect(db.connection).toBeDefined();
    (db as any).close();
  });

  it('creates database with connection.connection.filename', () => {
    const db = createDatabase({
      connection: { client: 'sqlite', connection: { filename: ':memory:' } },
    }, logger);

    expect(db.dialect).toBe('sqlite');
    (db as any).close();
  });

  it('throws for unsupported client', () => {
    expect(() => createDatabase({
      connection: { client: 'postgres' as any },
    }, logger)).toThrow('not yet supported');
  });

  it('getSchemaConnection returns the drizzle instance', () => {
    const db = createDatabase({
      connection: { client: 'sqlite', filename: ':memory:' },
    }, logger);

    expect(db.getSchemaConnection()).toBeDefined();
    (db as any).close();
  });

  it('inTransaction returns false when not in transaction', () => {
    const db = createDatabase({
      connection: { client: 'sqlite', filename: ':memory:' },
    }, logger);

    expect(db.inTransaction()).toBe(false);
    (db as any).close();
  });
});

describe('Database Transactions', () => {
  let dbService: any;

  beforeEach(() => {
    dbService = createDatabase({
      connection: { client: 'sqlite', filename: ':memory:' },
    }, logger);

    // Create a test table
    const raw = dbService.raw;
    raw.exec(`CREATE TABLE "test_items" (
      "id" INTEGER PRIMARY KEY AUTOINCREMENT,
      "name" VARCHAR(255) NOT NULL,
      "value" INTEGER DEFAULT 0
    )`);
  });

  afterEach(() => {
    dbService.close();
  });

  it('commits on success', async () => {
    const raw = dbService.raw;

    await dbService.transaction(async (ctx: any) => {
      raw.prepare(`INSERT INTO "test_items" ("name", "value") VALUES (?, ?)`).run('item1', 10);
      raw.prepare(`INSERT INTO "test_items" ("name", "value") VALUES (?, ?)`).run('item2', 20);
    });

    const rows = raw.prepare(`SELECT * FROM "test_items"`).all();
    expect(rows).toHaveLength(2);
  });

  it('rolls back on error', async () => {
    const raw = dbService.raw;

    await expect(
      dbService.transaction(async (ctx: any) => {
        raw.prepare(`INSERT INTO "test_items" ("name", "value") VALUES (?, ?)`).run('item1', 10);
        throw new Error('Test rollback');
      }),
    ).rejects.toThrow('Test rollback');

    const rows = raw.prepare(`SELECT * FROM "test_items"`).all();
    expect(rows).toHaveLength(0);
  });

  it('runs onCommit callbacks after commit', async () => {
    let committed = false;

    await dbService.transaction(async (ctx: any) => {
      ctx.onCommit(() => {
        committed = true;
      });
      dbService.raw.prepare(`INSERT INTO "test_items" ("name", "value") VALUES (?, ?)`).run('item1', 10);
    });

    expect(committed).toBe(true);
  });

  it('runs onRollback callbacks after rollback', async () => {
    let rolledBack = false;

    await expect(
      dbService.transaction(async (ctx: any) => {
        ctx.onRollback(() => {
          rolledBack = true;
        });
        throw new Error('Trigger rollback');
      }),
    ).rejects.toThrow();

    expect(rolledBack).toBe(true);
  });

  it('does not run onCommit when rolled back', async () => {
    let committed = false;

    await expect(
      dbService.transaction(async (ctx: any) => {
        ctx.onCommit(() => {
          committed = true;
        });
        throw new Error('Trigger rollback');
      }),
    ).rejects.toThrow();

    expect(committed).toBe(false);
  });
});

describe('Lifecycle Registry', () => {
  it('subscribes and runs per-model handlers', async () => {
    const registry = createLifecycleRegistry(logger);
    const calls: string[] = [];

    registry.subscribe('api::article.article', {
      beforeCreate: (event) => { calls.push(`beforeCreate:${event.model}`); },
      afterCreate: (event) => { calls.push(`afterCreate:${event.model}`); },
    });

    await registry.run({
      action: 'beforeCreate',
      model: 'api::article.article',
      params: {},
      state: new Map(),
    });

    await registry.run({
      action: 'afterCreate',
      model: 'api::article.article',
      params: {},
      state: new Map(),
    });

    expect(calls).toEqual([
      'beforeCreate:api::article.article',
      'afterCreate:api::article.article',
    ]);
  });

  it('does not fire handlers for different models', async () => {
    const registry = createLifecycleRegistry(logger);
    const calls: string[] = [];

    registry.subscribe('api::article.article', {
      beforeCreate: () => { calls.push('article'); },
    });

    await registry.run({
      action: 'beforeCreate',
      model: 'api::category.category',
      params: {},
      state: new Map(),
    });

    expect(calls).toHaveLength(0);
  });

  it('runs global handlers for all models', async () => {
    const registry = createLifecycleRegistry(logger);
    const calls: string[] = [];

    registry.subscribeGlobal((event) => {
      calls.push(`${event.action}:${event.model}`);
    });

    await registry.run({
      action: 'beforeCreate',
      model: 'api::article.article',
      params: {},
      state: new Map(),
    });

    await registry.run({
      action: 'beforeUpdate',
      model: 'api::category.category',
      params: {},
      state: new Map(),
    });

    expect(calls).toEqual([
      'beforeCreate:api::article.article',
      'beforeUpdate:api::category.category',
    ]);
  });

  it('runs global handlers before model-specific handlers', async () => {
    const registry = createLifecycleRegistry(logger);
    const order: string[] = [];

    registry.subscribeGlobal(() => { order.push('global'); });
    registry.subscribe('api::article.article', {
      beforeCreate: () => { order.push('model'); },
    });

    await registry.run({
      action: 'beforeCreate',
      model: 'api::article.article',
      params: {},
      state: new Map(),
    });

    expect(order).toEqual(['global', 'model']);
  });

  it('catches and logs handler errors without stopping', async () => {
    const registry = createLifecycleRegistry(logger);
    const calls: string[] = [];

    registry.subscribe('api::article.article', {
      beforeCreate: () => { throw new Error('handler error'); },
    });

    // Should not throw
    await registry.run({
      action: 'beforeCreate',
      model: 'api::article.article',
      params: {},
      state: new Map(),
    });
  });

  it('supports multiple handlers for the same action', async () => {
    const registry = createLifecycleRegistry(logger);
    const calls: string[] = [];

    registry.subscribe('api::article.article', {
      beforeCreate: () => { calls.push('handler1'); },
    });
    registry.subscribe('api::article.article', {
      beforeCreate: () => { calls.push('handler2'); },
    });

    await registry.run({
      action: 'beforeCreate',
      model: 'api::article.article',
      params: {},
      state: new Map(),
    });

    expect(calls).toEqual(['handler1', 'handler2']);
  });

  it('passes shared state between before/after pairs', async () => {
    const registry = createLifecycleRegistry(logger);
    const state = new Map<string, any>();

    registry.subscribe('api::article.article', {
      beforeCreate: (event) => { event.state.set('startedAt', Date.now()); },
      afterCreate: (event) => { event.state.set('endedAt', Date.now()); },
    });

    await registry.run({
      action: 'beforeCreate',
      model: 'api::article.article',
      params: {},
      state,
    });

    expect(state.has('startedAt')).toBe(true);

    await registry.run({
      action: 'afterCreate',
      model: 'api::article.article',
      params: {},
      state,
    });

    expect(state.has('endedAt')).toBe(true);
  });

  it('supports all 12 lifecycle actions', async () => {
    const registry = createLifecycleRegistry(logger);
    const actions = [
      'beforeCreate', 'afterCreate',
      'beforeUpdate', 'afterUpdate',
      'beforeDelete', 'afterDelete',
      'beforeFindOne', 'afterFindOne',
      'beforeFindMany', 'afterFindMany',
      'beforeCount', 'afterCount',
    ] as const;

    const fired: string[] = [];

    const handlers: any = {};
    for (const action of actions) {
      handlers[action] = (event: any) => { fired.push(action); };
    }

    registry.subscribe('api::test.test', handlers);

    for (const action of actions) {
      await registry.run({
        action,
        model: 'api::test.test',
        params: {},
        state: new Map(),
      });
    }

    expect(fired).toEqual([...actions]);
  });
});
