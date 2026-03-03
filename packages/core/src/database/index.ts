/**
 * Database layer — Drizzle ORM integration.
 *
 * Provides:
 *   - Connection management (SQLite, PostgreSQL, MySQL)
 *   - Schema generation from content type definitions
 *   - Query engine for low-level CRUD
 *   - Transaction support with AsyncLocalStorage
 *   - Schema sync (auto-create/alter tables on boot)
 *   - Database lifecycle hooks
 */

export { createDatabase } from './connection.js';
export { createQueryEngine } from '../query-engine/index.js';
export type { QueryEngine, WhereClause, OrderBy } from '../query-engine/index.js';
