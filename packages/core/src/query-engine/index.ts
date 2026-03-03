/**
 * Query Engine — low-level database CRUD API.
 *
 * Provides findMany, findOne, findWithCount, findPage, create, createMany,
 * update, updateMany, delete, deleteMany, count operations.
 *
 * Supports full filter operators, sorting, pagination, and field selection.
 * Works with raw SQL tables managed by the schema sync system.
 */

import { sql, eq, ne, gt, gte, lt, lte, like, and, or, not, inArray, notInArray, isNull, isNotNull, between, asc, desc } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type { SQLiteTableWithColumns } from 'drizzle-orm/sqlite-core';
import type { Logger } from '@apick/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WhereClause {
  [key: string]: any;
}

export type OrderBy = string | Record<string, 'asc' | 'desc'>;

export interface QueryParams {
  where?: WhereClause;
  select?: string[];
  orderBy?: OrderBy | OrderBy[];
  offset?: number;
  limit?: number;
  populate?: any;
}

export interface PageParams {
  where?: WhereClause;
  select?: string[];
  orderBy?: OrderBy | OrderBy[];
  page?: number;
  pageSize?: number;
  populate?: any;
}

export interface QueryEngine {
  findOne(params?: QueryParams): Promise<any | null>;
  findMany(params?: QueryParams): Promise<any[]>;
  findWithCount(params?: QueryParams): Promise<[any[], number]>;
  findPage(params?: PageParams): Promise<{ results: any[]; pagination: { page: number; pageSize: number; pageCount: number; total: number } }>;
  count(params?: { where?: WhereClause }): Promise<number>;
  create(params: { data: Record<string, any> }): Promise<any>;
  createMany(params: { data: Record<string, any>[] }): Promise<{ count: number }>;
  update(params: { where: WhereClause; data: Record<string, any> }): Promise<any | null>;
  updateMany(params: { where: WhereClause; data: Record<string, any> }): Promise<{ count: number }>;
  delete(params: { where: WhereClause }): Promise<any | null>;
  deleteMany(params: { where: WhereClause }): Promise<{ count: number }>;
}

// ---------------------------------------------------------------------------
// Filter operator translation
// ---------------------------------------------------------------------------

function buildWhereConditions(
  where: WhereClause,
  tableName: string,
): string {
  const conditions: string[] = [];

  for (const [key, value] of Object.entries(where)) {
    if (key === '$and') {
      const andConds = (value as WhereClause[]).map(
        (w) => `(${buildWhereConditions(w, tableName)})`
      );
      conditions.push(andConds.join(' AND '));
      continue;
    }

    if (key === '$or') {
      const orConds = (value as WhereClause[]).map(
        (w) => `(${buildWhereConditions(w, tableName)})`
      );
      conditions.push(`(${orConds.join(' OR ')})`);
      continue;
    }

    if (key === '$not') {
      conditions.push(`NOT (${buildWhereConditions(value, tableName)})`);
      continue;
    }

    // Direct equality shorthand
    if (value === null || typeof value !== 'object' || value instanceof Date) {
      if (value === null) {
        conditions.push(`"${key}" IS NULL`);
      } else {
        conditions.push(`"${key}" = ${sqlLiteral(value)}`);
      }
      continue;
    }

    // Operator object
    for (const [op, opValue] of Object.entries(value)) {
      switch (op) {
        case '$eq':
          if (opValue === null) {
            conditions.push(`"${key}" IS NULL`);
          } else {
            conditions.push(`"${key}" = ${sqlLiteral(opValue)}`);
          }
          break;
        case '$ne':
          if (opValue === null) {
            conditions.push(`"${key}" IS NOT NULL`);
          } else {
            conditions.push(`"${key}" != ${sqlLiteral(opValue)}`);
          }
          break;
        case '$gt':
          conditions.push(`"${key}" > ${sqlLiteral(opValue)}`);
          break;
        case '$gte':
          conditions.push(`"${key}" >= ${sqlLiteral(opValue)}`);
          break;
        case '$lt':
          conditions.push(`"${key}" < ${sqlLiteral(opValue)}`);
          break;
        case '$lte':
          conditions.push(`"${key}" <= ${sqlLiteral(opValue)}`);
          break;
        case '$in':
          if (Array.isArray(opValue) && opValue.length > 0) {
            const vals = opValue.map(sqlLiteral).join(', ');
            conditions.push(`"${key}" IN (${vals})`);
          } else {
            conditions.push('0 = 1'); // impossible condition
          }
          break;
        case '$notIn':
          if (Array.isArray(opValue) && opValue.length > 0) {
            const vals = opValue.map(sqlLiteral).join(', ');
            conditions.push(`"${key}" NOT IN (${vals})`);
          }
          break;
        case '$contains':
          conditions.push(`"${key}" LIKE ${sqlLiteral(`%${opValue}%`)}`);
          break;
        case '$containsi':
          conditions.push(`LOWER("${key}") LIKE LOWER(${sqlLiteral(`%${opValue}%`)})`);
          break;
        case '$notContains':
          conditions.push(`"${key}" NOT LIKE ${sqlLiteral(`%${opValue}%`)}`);
          break;
        case '$startsWith':
          conditions.push(`"${key}" LIKE ${sqlLiteral(`${opValue}%`)}`);
          break;
        case '$endsWith':
          conditions.push(`"${key}" LIKE ${sqlLiteral(`%${opValue}`)}`);
          break;
        case '$null':
          conditions.push(opValue ? `"${key}" IS NULL` : `"${key}" IS NOT NULL`);
          break;
        case '$notNull':
          conditions.push(opValue ? `"${key}" IS NOT NULL` : `"${key}" IS NULL`);
          break;
        case '$between':
          if (Array.isArray(opValue) && opValue.length === 2) {
            conditions.push(`"${key}" BETWEEN ${sqlLiteral(opValue[0])} AND ${sqlLiteral(opValue[1])}`);
          }
          break;
        case '$not':
          // Nested NOT for a single field
          const innerConditions = buildWhereConditions({ [key]: opValue }, tableName);
          conditions.push(`NOT (${innerConditions})`);
          break;
        default:
          // Unknown operator — skip
          break;
      }
    }
  }

  return conditions.length > 0 ? conditions.join(' AND ') : '1 = 1';
}

function sqlLiteral(value: any): string {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? '1' : '0';
  if (value instanceof Date) return `'${value.toISOString()}'`;
  // Escape single quotes
  const escaped = String(value).replace(/'/g, "''");
  return `'${escaped}'`;
}

// ---------------------------------------------------------------------------
// ORDER BY builder
// ---------------------------------------------------------------------------

function buildOrderBy(orderBy: OrderBy | OrderBy[]): string {
  const clauses: string[] = [];

  const items = Array.isArray(orderBy) ? orderBy : [orderBy];

  for (const item of items) {
    if (typeof item === 'string') {
      // Simple: "createdAt" or "createdAt:desc"
      const [field, direction] = item.split(':');
      clauses.push(`"${field}" ${direction?.toUpperCase() === 'DESC' ? 'DESC' : 'ASC'}`);
    } else if (typeof item === 'object') {
      for (const [field, direction] of Object.entries(item)) {
        clauses.push(`"${field}" ${direction.toUpperCase()}`);
      }
    }
  }

  return clauses.length > 0 ? `ORDER BY ${clauses.join(', ')}` : '';
}

// ---------------------------------------------------------------------------
// SELECT builder
// ---------------------------------------------------------------------------

function buildSelect(fields?: string[]): string {
  if (!fields || fields.length === 0) return '*';
  return fields.map((f) => `"${f}"`).join(', ');
}

// ---------------------------------------------------------------------------
// Query Engine factory
// ---------------------------------------------------------------------------

export function createQueryEngine(
  db: any, // BetterSQLite3Database or raw better-sqlite3 instance
  tableName: string,
  logger: Logger,
): QueryEngine {
  // Get the raw better-sqlite3 database for direct SQL execution
  // The db parameter here is the raw better-sqlite3 Database instance
  const rawDb = db;

  function exec(sqlStr: string): any[] {
    try {
      const stmt = rawDb.prepare(sqlStr);
      // Check if it's a read or write statement
      if (sqlStr.trimStart().toUpperCase().startsWith('SELECT') || sqlStr.trimStart().toUpperCase().startsWith('WITH')) {
        return stmt.all();
      } else {
        const result = stmt.run();
        return [result];
      }
    } catch (err: any) {
      logger.error({ sql: sqlStr, err }, 'SQL execution error');
      throw err;
    }
  }

  function execGet(sqlStr: string): any | undefined {
    try {
      const stmt = rawDb.prepare(sqlStr);
      return stmt.get();
    } catch (err: any) {
      logger.error({ sql: sqlStr, err }, 'SQL execution error');
      throw err;
    }
  }

  return {
    async findOne(params?: QueryParams): Promise<any | null> {
      const select = buildSelect(params?.select);
      const where = params?.where ? buildWhereConditions(params.where, tableName) : '1 = 1';
      const orderBy = params?.orderBy ? buildOrderBy(params.orderBy) : '';

      const sqlStr = `SELECT ${select} FROM "${tableName}" WHERE ${where} ${orderBy} LIMIT 1`;
      const row = execGet(sqlStr);
      return row ?? null;
    },

    async findMany(params?: QueryParams): Promise<any[]> {
      const select = buildSelect(params?.select);
      const where = params?.where ? buildWhereConditions(params.where, tableName) : '1 = 1';
      const orderBy = params?.orderBy ? buildOrderBy(params.orderBy) : '';
      const limit = params?.limit ? `LIMIT ${params.limit}` : '';
      const offset = params?.offset ? `OFFSET ${params.offset}` : '';

      const sqlStr = `SELECT ${select} FROM "${tableName}" WHERE ${where} ${orderBy} ${limit} ${offset}`;
      return exec(sqlStr);
    },

    async findWithCount(params?: QueryParams): Promise<[any[], number]> {
      const rows = await this.findMany(params);
      const total = await this.count({ where: params?.where });
      return [rows, total];
    },

    async findPage(params?: PageParams): Promise<{ results: any[]; pagination: { page: number; pageSize: number; pageCount: number; total: number } }> {
      const page = params?.page ?? 1;
      const pageSize = params?.pageSize ?? 25;
      const offset = (page - 1) * pageSize;

      const total = await this.count({ where: params?.where });
      const results = await this.findMany({
        ...params,
        limit: pageSize,
        offset,
      });

      return {
        results,
        pagination: {
          page,
          pageSize,
          pageCount: Math.ceil(total / pageSize),
          total,
        },
      };
    },

    async count(params?: { where?: WhereClause }): Promise<number> {
      const where = params?.where ? buildWhereConditions(params.where, tableName) : '1 = 1';
      const sqlStr = `SELECT COUNT(*) as count FROM "${tableName}" WHERE ${where}`;
      const row = execGet(sqlStr);
      return row?.count ?? 0;
    },

    async create(params: { data: Record<string, any> }): Promise<any> {
      const { data } = params;
      const columns = Object.keys(data);
      const values = Object.values(data);

      if (columns.length === 0) {
        throw new Error('Cannot create with empty data');
      }

      const colStr = columns.map((c) => `"${c}"`).join(', ');
      const valStr = values.map(sqlLiteral).join(', ');

      const sqlStr = `INSERT INTO "${tableName}" (${colStr}) VALUES (${valStr})`;
      const [result] = exec(sqlStr);
      const id = result.lastInsertRowid;

      // Fetch and return the created row
      const row = execGet(`SELECT * FROM "${tableName}" WHERE id = ${id}`);
      return row;
    },

    async createMany(params: { data: Record<string, any>[] }): Promise<{ count: number }> {
      const { data } = params;
      if (data.length === 0) return { count: 0 };

      let count = 0;
      for (const item of data) {
        await this.create({ data: item });
        count++;
      }
      return { count };
    },

    async update(params: { where: WhereClause; data: Record<string, any> }): Promise<any | null> {
      const { where, data } = params;
      const setClauses = Object.entries(data)
        .map(([key, value]) => `"${key}" = ${sqlLiteral(value)}`)
        .join(', ');

      if (!setClauses) return null;

      const whereStr = buildWhereConditions(where, tableName);

      // First, find the row(s)
      const existing = execGet(`SELECT * FROM "${tableName}" WHERE ${whereStr}`);
      if (!existing) return null;

      const sqlStr = `UPDATE "${tableName}" SET ${setClauses} WHERE ${whereStr}`;
      exec(sqlStr);

      // Return updated row
      const updated = execGet(`SELECT * FROM "${tableName}" WHERE ${whereStr}`);
      return updated ?? null;
    },

    async updateMany(params: { where: WhereClause; data: Record<string, any> }): Promise<{ count: number }> {
      const { where, data } = params;
      const setClauses = Object.entries(data)
        .map(([key, value]) => `"${key}" = ${sqlLiteral(value)}`)
        .join(', ');

      if (!setClauses) return { count: 0 };

      const whereStr = buildWhereConditions(where, tableName);
      const sqlStr = `UPDATE "${tableName}" SET ${setClauses} WHERE ${whereStr}`;
      const [result] = exec(sqlStr);
      return { count: result.changes ?? 0 };
    },

    async delete(params: { where: WhereClause }): Promise<any | null> {
      const { where } = params;
      const whereStr = buildWhereConditions(where, tableName);

      // Find the row first
      const existing = execGet(`SELECT * FROM "${tableName}" WHERE ${whereStr}`);
      if (!existing) return null;

      const sqlStr = `DELETE FROM "${tableName}" WHERE ${whereStr}`;
      exec(sqlStr);
      return existing;
    },

    async deleteMany(params: { where: WhereClause }): Promise<{ count: number }> {
      const { where } = params;
      const whereStr = buildWhereConditions(where, tableName);
      const sqlStr = `DELETE FROM "${tableName}" WHERE ${whereStr}`;
      const [result] = exec(sqlStr);
      return { count: result.changes ?? 0 };
    },
  };
}
