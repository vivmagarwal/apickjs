/**
 * Shared test-environment builder for all tutorials.
 *
 * Creates an in-memory SQLite database, wires up a real server + middleware
 * pipeline + document service, and calls registerContentApi() — exactly the
 * same stack a production Apick instance uses, but without touching the
 * filesystem or network.
 */
import Database from 'better-sqlite3';
import { createServer } from '../packages/core/src/server/index.js';
import { createLogger } from '../packages/core/src/logging/index.js';
import { createEventHub } from '../packages/core/src/event-hub/index.js';
import { createCache } from '../packages/core/src/cache/index.js';
import { createRegistry } from '../packages/core/src/registries/index.js';
import { normalizeContentType } from '../packages/core/src/content-types/index.js';
import type { ContentTypeConfig } from '../packages/core/src/content-types/index.js';
import { createDocumentServiceManager } from '../packages/core/src/document-service/index.js';
import { registerContentApi } from '../packages/core/src/content-api/index.js';
import { signJWT, verifyJWT } from '../packages/core/src/auth/index.js';

export { signJWT, verifyJWT };

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ContentTypeDef {
  uid: string;
  schema: ContentTypeConfig;
}

export interface TestEnvOptions {
  contentTypes: ContentTypeDef[];
  apiPrefix?: string;
}

// ---------------------------------------------------------------------------
// SQL column type mapping
// ---------------------------------------------------------------------------

function sqlColumnType(attr: { type: string }): string {
  switch (attr.type) {
    case 'integer':
    case 'biginteger':
      return 'INTEGER';
    case 'float':
    case 'decimal':
      return 'REAL';
    case 'boolean':
      return 'INTEGER'; // SQLite stores booleans as 0/1
    default:
      return 'TEXT';
  }
}

function sqlDefault(attr: { type: string; default?: any }): string {
  if (attr.default !== undefined) {
    if (typeof attr.default === 'number') return `DEFAULT ${attr.default}`;
    if (typeof attr.default === 'boolean') return `DEFAULT ${attr.default ? 1 : 0}`;
    return `DEFAULT '${attr.default}'`;
  }
  switch (attr.type) {
    case 'string':
    case 'text':
    case 'richtext':
    case 'blocks':
    case 'uid':
    case 'email':
    case 'password':
      return "DEFAULT ''";
    case 'integer':
    case 'biginteger':
    case 'float':
    case 'decimal':
      return 'DEFAULT 0';
    case 'boolean':
      return 'DEFAULT 0';
    default:
      return '';
  }
}

// ---------------------------------------------------------------------------
// createTestEnv
// ---------------------------------------------------------------------------

export function createTestEnv(opts: TestEnvOptions) {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  const logger = createLogger({ level: 'silent' });
  const eventHub = createEventHub({ logger });
  const cache = createCache();
  const server = createServer({ logger, proxyEnabled: false });

  const contentTypes = createRegistry();

  for (const ct of opts.contentTypes) {
    const normalized = normalizeContentType(ct.uid, ct.schema);
    contentTypes.add(ct.uid, normalized);

    // Auto-create the SQLite table
    const tableName = normalized.collectionName;
    const userCols: string[] = [];

    for (const [name, attr] of Object.entries(ct.schema.attributes)) {
      // Skip relation/media/component/dynamiczone — they don't become columns
      if (['relation', 'media', 'component', 'dynamiczone'].includes(attr.type)) continue;
      const colName = name.replace(/([A-Z])/g, '_$1').toLowerCase(); // camelCase → snake_case
      const colType = sqlColumnType(attr);
      const colDefault = sqlDefault(attr);
      const notNull = attr.required ? 'NOT NULL' : '';
      userCols.push(`"${colName}" ${colType} ${notNull} ${colDefault}`.trim());
    }

    const sql = `CREATE TABLE "${tableName}" (
      "id" INTEGER PRIMARY KEY AUTOINCREMENT,
      "document_id" VARCHAR(255) NOT NULL,
      ${userCols.join(',\n      ')}${userCols.length > 0 ? ',' : ''}
      "created_at" TEXT NOT NULL,
      "updated_at" TEXT NOT NULL,
      "published_at" TEXT,
      "first_published_at" TEXT,
      "locale" VARCHAR(10)
    )`;

    db.exec(sql);
  }

  const documents = createDocumentServiceManager({
    rawDb: db,
    logger,
    eventHub,
    getSchema: (uid) => contentTypes.get(uid) as any,
  });

  const apiPrefix = opts.apiPrefix || '/api';

  const apick: any = {
    log: logger,
    contentTypes,
    documents: (uid: string) => documents(uid),
    config: {
      get: (key: string, def: any) => {
        if (key === 'api.rest.prefix') return apiPrefix;
        return def;
      },
    },
    service: () => null,
    controller: () => null,
    server,
    eventHub,
    cache,
  };

  registerContentApi(apick);

  return { db, server, logger, eventHub, cache, apick, documents };
}
