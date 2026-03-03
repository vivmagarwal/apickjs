/**
 * Database connection management.
 *
 * Creates a Drizzle ORM instance from the database configuration.
 * Currently supports SQLite via better-sqlite3.
 */

import path from 'node:path';
import fs from 'node:fs';
import { AsyncLocalStorage } from 'node:async_hooks';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { sql } from 'drizzle-orm';
import type { Logger, DatabaseService } from '@apick/types';

/** AsyncLocalStorage for transaction context propagation */
const transactionStorage = new AsyncLocalStorage<{ trx: any }>();

export interface DatabaseConfig {
  connection: {
    client: 'sqlite' | 'postgres' | 'mysql';
    connection?: {
      host?: string;
      port?: number;
      database?: string;
      user?: string;
      password?: string;
      filename?: string;
    };
    filename?: string;
    pool?: Record<string, any>;
    debug?: boolean;
  };
}

export function createDatabase(config: DatabaseConfig, logger: Logger): DatabaseService {
  const { connection: connConfig } = config;
  const client = connConfig.client;

  if (client !== 'sqlite') {
    throw new Error(`Database client "${client}" is not yet supported. Use "sqlite" for now.`);
  }

  // Resolve filename
  const filename = connConfig.connection?.filename || connConfig.filename || ':memory:';

  logger.info({ client, filename }, 'Connecting to database');

  // Auto-create directory for SQLite file if it doesn't exist
  if (filename !== ':memory:') {
    const dir = path.dirname(filename);
    if (dir && !fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  // Create better-sqlite3 connection
  const sqlite = new Database(filename);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');

  // Create Drizzle instance
  const db = drizzle(sqlite, {
    logger: connConfig.debug ? {
      logQuery(query: string, params: unknown[]) {
        logger.debug({ query, params }, 'SQL query');
      },
    } : undefined,
  });

  // Lifecycle hooks storage
  const lifecycleHandlers = new Map<string, Array<(event: any) => void | Promise<void>>>();

  // Transaction support
  const onCommitCallbacks: Array<() => void | Promise<void>> = [];
  const onRollbackCallbacks: Array<() => void | Promise<void>> = [];

  const dbService: DatabaseService = {
    connection: db,
    dialect: 'sqlite',
    entityManager: null as any, // Phase 3

    query(uid: string) {
      // Returns an EntityRepository-like object — implemented by QueryEngine
      // This is a placeholder; the Apick class wires this up
      throw new Error('query() must be accessed via apick.db.query() after full initialization');
    },

    async transaction<T>(fn: (ctx: { trx: any; onCommit: (f: () => void | Promise<void>) => void; onRollback: (f: () => void | Promise<void>) => void }) => Promise<T>): Promise<T> {
      // If already in a transaction, reuse it (nested transactions reuse outer context)
      const existing = transactionStorage.getStore();
      if (existing) {
        return fn({
          trx: existing.trx,
          onCommit: (f) => onCommitCallbacks.push(f),
          onRollback: (f) => onRollbackCallbacks.push(f),
        });
      }

      const localOnCommit: Array<() => void | Promise<void>> = [];
      const localOnRollback: Array<() => void | Promise<void>> = [];

      // Use raw SQLite transaction for proper atomicity
      sqlite.exec('BEGIN');
      try {
        const txResult = await transactionStorage.run({ trx: db }, async () => {
          return fn({
            trx: db,
            onCommit: (f) => localOnCommit.push(f),
            onRollback: (f) => localOnRollback.push(f),
          });
        });
        sqlite.exec('COMMIT');

        // Run onCommit callbacks
        for (const cb of localOnCommit) {
          try {
            await cb();
          } catch (err) {
            logger.error({ err }, 'Error in onCommit callback');
          }
        }

        return txResult;
      } catch (err) {
        sqlite.exec('ROLLBACK');

        // Run onRollback callbacks
        for (const cb of localOnRollback) {
          try {
            await cb();
          } catch (rollbackErr) {
            logger.error({ err: rollbackErr }, 'Error in onRollback callback');
          }
        }

        throw err;
      }
    },

    inTransaction(): boolean {
      return transactionStorage.getStore() !== undefined;
    },

    getSchemaConnection() {
      return db;
    },

    migrations: {
      async shouldRun() {
        return false; // Migrations managed by schema-sync module
      },
      async up() {
        // No-op: migrations handled externally via CLI commands
      },
      async down() {
        // No-op: migrations handled externally via CLI commands
      },
      async status() {
        return [];
      },
    },
  };

  // Extend with close method and raw access
  (dbService as any).raw = sqlite;
  (dbService as any).close = () => {
    sqlite.close();
    logger.info('Database connection closed');
  };

  return dbService;
}
