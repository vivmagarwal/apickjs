/**
 * Maps content type field definitions to SQLite column DDL.
 *
 * This is the SQLite-specific mapping. PostgreSQL and MySQL mappings
 * will be added when those dialects are implemented.
 */

export interface ColumnDefinition {
  sql: string;
  nullable: boolean;
}

/**
 * Maps a field type + options to a SQLite column definition.
 */
export function fieldToSqliteColumn(
  fieldName: string,
  fieldDef: { type: string; [key: string]: any },
): ColumnDefinition {
  const { type } = fieldDef;
  const required = fieldDef.required === true;
  const unique = fieldDef.unique === true;
  const defaultValue = fieldDef.default;

  let sqlType: string;
  let nullable = !required;

  switch (type) {
    case 'string':
    case 'email':
    case 'password':
    case 'uid':
    case 'enumeration':
      sqlType = 'VARCHAR(255)';
      break;
    case 'text':
    case 'richtext':
      sqlType = 'TEXT';
      break;
    case 'blocks':
    case 'json':
      sqlType = 'TEXT'; // JSON stored as TEXT in SQLite
      break;
    case 'integer':
      sqlType = 'INTEGER';
      break;
    case 'biginteger':
      sqlType = 'BIGINT';
      break;
    case 'float':
      sqlType = 'REAL';
      break;
    case 'decimal':
      sqlType = 'REAL'; // SQLite doesn't have DECIMAL
      break;
    case 'boolean':
      sqlType = 'INTEGER'; // 0/1 in SQLite
      break;
    case 'date':
    case 'time':
    case 'datetime':
      sqlType = 'TEXT'; // ISO 8601 strings in SQLite
      break;
    case 'media':
    case 'relation':
    case 'component':
    case 'dynamiczone':
    case 'customField':
      // These are handled separately (join tables, FK columns, etc.)
      return { sql: '', nullable: true };
    default:
      sqlType = 'TEXT';
      break;
  }

  let columnSql = `"${fieldName}" ${sqlType}`;
  if (!nullable) columnSql += ' NOT NULL';
  if (unique) columnSql += ' UNIQUE';
  if (defaultValue !== undefined) {
    if (typeof defaultValue === 'boolean') {
      columnSql += ` DEFAULT ${defaultValue ? 1 : 0}`;
    } else if (typeof defaultValue === 'number') {
      columnSql += ` DEFAULT ${defaultValue}`;
    } else if (typeof defaultValue === 'string') {
      columnSql += ` DEFAULT '${defaultValue.replace(/'/g, "''")}'`;
    }
  }

  return { sql: columnSql, nullable };
}

/**
 * System fields added to every content type table.
 */
export function getSystemColumns(): string[] {
  return [
    '"id" INTEGER PRIMARY KEY AUTOINCREMENT',
    '"document_id" VARCHAR(255) NOT NULL',
    '"created_at" TEXT NOT NULL',
    '"updated_at" TEXT NOT NULL',
    '"published_at" TEXT',
    '"first_published_at" TEXT',
    '"created_by" INTEGER',
    '"updated_by" INTEGER',
    '"locale" VARCHAR(10)',
  ];
}
