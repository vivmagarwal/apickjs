/**
 * Schema sync — auto-create/alter tables on boot.
 *
 * Compares content type definitions against actual database schema
 * and creates/alters tables as needed.
 */

import type { Logger } from '@apick/types';
import { fieldToSqliteColumn, getSystemColumns, SYSTEM_ATTRIBUTE_NAMES } from '../schema/field-mappings.js';

/**
 * Synchronizes the database schema with the registered content types.
 *
 * For each content type:
 * 1. Check if the table exists
 * 2. If not, create it with all columns
 * 3. If it exists, add any missing columns
 */
export function syncSchemas(
  rawDb: any, // better-sqlite3 Database instance
  contentTypes: Record<string, any>,
  logger: Logger,
): void {
  for (const [uid, schema] of Object.entries(contentTypes)) {
    const tableName = schema.collectionName || schema.info?.pluralName || uid.split('.').pop();

    if (!tableName) {
      logger.warn({ uid }, 'Cannot determine table name for content type');
      continue;
    }

    // Check if table exists
    const tableExists = rawDb.prepare(
      `SELECT name FROM sqlite_master WHERE type='table' AND name=?`
    ).get(tableName);

    if (!tableExists) {
      // Create the table
      createTable(rawDb, tableName, schema.attributes || {}, logger);
    } else {
      // Add missing columns
      addMissingColumns(rawDb, tableName, schema.attributes || {}, logger);
    }
  }
}

function createTable(
  rawDb: any,
  tableName: string,
  attributes: Record<string, any>,
  logger: Logger,
): void {
  const columns: string[] = [...getSystemColumns()];

  for (const [fieldName, fieldDef] of Object.entries(attributes)) {
    // Skip system attributes — they're already in getSystemColumns()
    if (SYSTEM_ATTRIBUTE_NAMES.has(fieldName)) continue;

    const col = fieldToSqliteColumn(fieldName, fieldDef as any);
    if (col.sql) {
      columns.push(col.sql);
    }
  }

  const createSql = `CREATE TABLE IF NOT EXISTS "${tableName}" (\n  ${columns.join(',\n  ')}\n)`;
  rawDb.exec(createSql);
  logger.info({ table: tableName }, 'Created table');

  // Create index on document_id
  rawDb.exec(`CREATE INDEX IF NOT EXISTS "idx_${tableName}_document_id" ON "${tableName}" ("document_id")`);
}

function addMissingColumns(
  rawDb: any,
  tableName: string,
  attributes: Record<string, any>,
  logger: Logger,
): void {
  // Get existing columns
  const existingColumns = rawDb.prepare(`PRAGMA table_info("${tableName}")`).all() as Array<{ name: string }>;
  const existingColumnNames = new Set(existingColumns.map((c) => c.name));

  for (const [fieldName, fieldDef] of Object.entries(attributes)) {
    // Skip system attributes — handled by getSystemColumns()
    if (SYSTEM_ATTRIBUTE_NAMES.has(fieldName)) continue;
    if (existingColumnNames.has(fieldName)) continue;

    const col = fieldToSqliteColumn(fieldName, fieldDef as any);
    if (!col.sql) continue;

    // SQLite ALTER TABLE can only add columns, and they must have defaults or be nullable
    let alterSql = `ALTER TABLE "${tableName}" ADD COLUMN ${col.sql}`;

    // If column is NOT NULL and has no default, we need to make it nullable or add a default
    if (!col.nullable && !col.sql.includes('DEFAULT')) {
      // Override to be nullable for safety (can't add NOT NULL column without default in SQLite)
      alterSql = `ALTER TABLE "${tableName}" ADD COLUMN "${fieldName}" ${col.sql.split('"')[2]?.trim().replace('NOT NULL', '')}`;
    }

    try {
      rawDb.exec(alterSql);
      logger.info({ table: tableName, column: fieldName }, 'Added column');
    } catch (err: any) {
      logger.warn({ table: tableName, column: fieldName, err: err.message }, 'Failed to add column');
    }
  }
}
