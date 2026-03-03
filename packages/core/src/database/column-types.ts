/**
 * Extensible Column Types.
 *
 * Allows registering custom database column types with per-dialect
 * definitions and serialize/deserialize hooks.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SqlDialect = 'sqlite' | 'postgres' | 'mysql';

export interface ColumnTypeDefinition {
  /** SQL column definition per dialect */
  dialects: Partial<Record<SqlDialect, (options?: any) => string>>;
  /** Serialize a JS value to database-storable format */
  serialize?: (value: any, options?: any) => any;
  /** Deserialize a database value to JS format */
  deserialize?: (value: any, options?: any) => any;
}

export interface ColumnTypeRegistry {
  /** Register a custom column type */
  register(name: string, definition: ColumnTypeDefinition): void;
  /** Get a column type definition */
  get(name: string): ColumnTypeDefinition | undefined;
  /** Check if a column type exists */
  has(name: string): boolean;
  /** List all registered column type names */
  list(): string[];
  /** Get SQL column definition for a dialect */
  getColumnSql(name: string, dialect: SqlDialect, options?: any): string;
  /** Serialize a value for storage */
  serialize(name: string, value: any, options?: any): any;
  /** Deserialize a value from storage */
  deserialize(name: string, value: any, options?: any): any;
}

// ---------------------------------------------------------------------------
// Built-in column types
// ---------------------------------------------------------------------------

const builtinTypes: Record<string, ColumnTypeDefinition> = {
  string: {
    dialects: {
      sqlite: () => 'TEXT',
      postgres: (opts) => `VARCHAR(${opts?.length ?? 255})`,
      mysql: (opts) => `VARCHAR(${opts?.length ?? 255})`,
    },
  },
  text: {
    dialects: {
      sqlite: () => 'TEXT',
      postgres: () => 'TEXT',
      mysql: () => 'LONGTEXT',
    },
  },
  integer: {
    dialects: {
      sqlite: () => 'INTEGER',
      postgres: () => 'INTEGER',
      mysql: () => 'INT',
    },
  },
  biginteger: {
    dialects: {
      sqlite: () => 'INTEGER',
      postgres: () => 'BIGINT',
      mysql: () => 'BIGINT',
    },
    serialize: (val) => typeof val === 'string' ? val : String(val),
    deserialize: (val) => String(val),
  },
  float: {
    dialects: {
      sqlite: () => 'REAL',
      postgres: () => 'DOUBLE PRECISION',
      mysql: () => 'DOUBLE',
    },
  },
  decimal: {
    dialects: {
      sqlite: () => 'REAL',
      postgres: (opts) => `NUMERIC(${opts?.precision ?? 10}, ${opts?.scale ?? 2})`,
      mysql: (opts) => `DECIMAL(${opts?.precision ?? 10}, ${opts?.scale ?? 2})`,
    },
  },
  boolean: {
    dialects: {
      sqlite: () => 'INTEGER',
      postgres: () => 'BOOLEAN',
      mysql: () => 'TINYINT(1)',
    },
    serialize: (val) => val ? 1 : 0,
    deserialize: (val) => val === 1 || val === true,
  },
  date: {
    dialects: {
      sqlite: () => 'TEXT',
      postgres: () => 'DATE',
      mysql: () => 'DATE',
    },
  },
  datetime: {
    dialects: {
      sqlite: () => 'TEXT',
      postgres: () => 'TIMESTAMPTZ',
      mysql: () => 'DATETIME',
    },
  },
  time: {
    dialects: {
      sqlite: () => 'TEXT',
      postgres: () => 'TIME',
      mysql: () => 'TIME',
    },
  },
  json: {
    dialects: {
      sqlite: () => 'TEXT',
      postgres: () => 'JSONB',
      mysql: () => 'JSON',
    },
    serialize: (val) => typeof val === 'string' ? val : JSON.stringify(val),
    deserialize: (val) => typeof val === 'string' ? JSON.parse(val) : val,
  },
  vector: {
    dialects: {
      sqlite: () => 'TEXT', // Stored as JSON array
      postgres: (opts) => `vector(${opts?.dimensions ?? 1536})`, // pgvector
      mysql: () => 'JSON', // Stored as JSON array
    },
    serialize: (val) => {
      if (Array.isArray(val)) return JSON.stringify(val);
      return val;
    },
    deserialize: (val) => {
      if (typeof val === 'string') {
        // Handle pgvector format [1,2,3] or JSON
        const cleaned = val.replace(/^\[/, '').replace(/\]$/, '');
        return cleaned.split(',').map(Number);
      }
      return val;
    },
  },
};

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createColumnTypeRegistry(): ColumnTypeRegistry {
  const types = new Map<string, ColumnTypeDefinition>();

  for (const [name, def] of Object.entries(builtinTypes)) {
    types.set(name, def);
  }

  return {
    register(name, definition) {
      types.set(name, definition);
    },

    get(name) {
      return types.get(name);
    },

    has(name) {
      return types.has(name);
    },

    list() {
      return Array.from(types.keys());
    },

    getColumnSql(name, dialect, options) {
      const def = types.get(name);
      if (!def) throw new Error(`Unknown column type: ${name}`);

      const dialectFn = def.dialects[dialect];
      if (!dialectFn) throw new Error(`Column type "${name}" not supported for dialect "${dialect}"`);

      return dialectFn(options);
    },

    serialize(name, value, options) {
      const def = types.get(name);
      if (!def || !def.serialize) return value;
      return def.serialize(value, options);
    },

    deserialize(name, value, options) {
      const def = types.get(name);
      if (!def || !def.deserialize) return value;
      return def.deserialize(value, options);
    },
  };
}
