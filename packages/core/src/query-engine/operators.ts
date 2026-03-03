/**
 * Extensible Query Operators.
 *
 * Allows registering custom query operators that translate to
 * dialect-specific SQL. Used in Query Engine, Document Service
 * filters, and Content API query strings.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SqlDialect = 'sqlite' | 'postgres' | 'mysql';

export interface OperatorTranslation {
  /** Returns a SQL fragment and bound values for this operator */
  (column: string, value: any): { sql: string; values: any[] };
}

export interface OperatorDefinition {
  /** SQL translation per dialect */
  dialects: Partial<Record<SqlDialect, OperatorTranslation>>;
  /** Optional value validation */
  validate?: (value: any) => boolean;
}

export interface OperatorRegistry {
  /** Register a custom query operator */
  register(name: string, definition: OperatorDefinition): void;
  /** Get a registered operator */
  get(name: string): OperatorDefinition | undefined;
  /** Check if an operator exists */
  has(name: string): boolean;
  /** List all operator names */
  list(): string[];
  /** Translate an operator to SQL for a dialect */
  translate(name: string, column: string, value: any, dialect: SqlDialect): { sql: string; values: any[] };
}

// ---------------------------------------------------------------------------
// Built-in operators
// ---------------------------------------------------------------------------

const builtinOperators: Record<string, OperatorDefinition> = {
  $eq: {
    dialects: {
      sqlite: (col, val) => ({ sql: `${col} = ?`, values: [val] }),
      postgres: (col, val) => ({ sql: `${col} = $1`, values: [val] }),
      mysql: (col, val) => ({ sql: `${col} = ?`, values: [val] }),
    },
  },
  $ne: {
    dialects: {
      sqlite: (col, val) => ({ sql: `${col} != ?`, values: [val] }),
      postgres: (col, val) => ({ sql: `${col} != $1`, values: [val] }),
      mysql: (col, val) => ({ sql: `${col} != ?`, values: [val] }),
    },
  },
  $gt: {
    dialects: {
      sqlite: (col, val) => ({ sql: `${col} > ?`, values: [val] }),
      postgres: (col, val) => ({ sql: `${col} > $1`, values: [val] }),
      mysql: (col, val) => ({ sql: `${col} > ?`, values: [val] }),
    },
  },
  $gte: {
    dialects: {
      sqlite: (col, val) => ({ sql: `${col} >= ?`, values: [val] }),
      postgres: (col, val) => ({ sql: `${col} >= $1`, values: [val] }),
      mysql: (col, val) => ({ sql: `${col} >= ?`, values: [val] }),
    },
  },
  $lt: {
    dialects: {
      sqlite: (col, val) => ({ sql: `${col} < ?`, values: [val] }),
      postgres: (col, val) => ({ sql: `${col} < $1`, values: [val] }),
      mysql: (col, val) => ({ sql: `${col} < ?`, values: [val] }),
    },
  },
  $lte: {
    dialects: {
      sqlite: (col, val) => ({ sql: `${col} <= ?`, values: [val] }),
      postgres: (col, val) => ({ sql: `${col} <= $1`, values: [val] }),
      mysql: (col, val) => ({ sql: `${col} <= ?`, values: [val] }),
    },
  },
  $in: {
    dialects: {
      sqlite: (col, val) => {
        const arr = Array.isArray(val) ? val : [val];
        const placeholders = arr.map(() => '?').join(', ');
        return { sql: `${col} IN (${placeholders})`, values: arr };
      },
      postgres: (col, val) => {
        const arr = Array.isArray(val) ? val : [val];
        return { sql: `${col} = ANY($1)`, values: [arr] };
      },
      mysql: (col, val) => {
        const arr = Array.isArray(val) ? val : [val];
        const placeholders = arr.map(() => '?').join(', ');
        return { sql: `${col} IN (${placeholders})`, values: arr };
      },
    },
    validate: (val) => Array.isArray(val),
  },
  $notIn: {
    dialects: {
      sqlite: (col, val) => {
        const arr = Array.isArray(val) ? val : [val];
        const placeholders = arr.map(() => '?').join(', ');
        return { sql: `${col} NOT IN (${placeholders})`, values: arr };
      },
      postgres: (col, val) => {
        const arr = Array.isArray(val) ? val : [val];
        return { sql: `${col} != ALL($1)`, values: [arr] };
      },
      mysql: (col, val) => {
        const arr = Array.isArray(val) ? val : [val];
        const placeholders = arr.map(() => '?').join(', ');
        return { sql: `${col} NOT IN (${placeholders})`, values: arr };
      },
    },
    validate: (val) => Array.isArray(val),
  },
  $contains: {
    dialects: {
      sqlite: (col, val) => ({ sql: `${col} LIKE ?`, values: [`%${val}%`] }),
      postgres: (col, val) => ({ sql: `${col} ILIKE $1`, values: [`%${val}%`] }),
      mysql: (col, val) => ({ sql: `${col} LIKE ?`, values: [`%${val}%`] }),
    },
  },
  $startsWith: {
    dialects: {
      sqlite: (col, val) => ({ sql: `${col} LIKE ?`, values: [`${val}%`] }),
      postgres: (col, val) => ({ sql: `${col} ILIKE $1`, values: [`${val}%`] }),
      mysql: (col, val) => ({ sql: `${col} LIKE ?`, values: [`${val}%`] }),
    },
  },
  $endsWith: {
    dialects: {
      sqlite: (col, val) => ({ sql: `${col} LIKE ?`, values: [`%${val}`] }),
      postgres: (col, val) => ({ sql: `${col} ILIKE $1`, values: [`%${val}`] }),
      mysql: (col, val) => ({ sql: `${col} LIKE ?`, values: [`%${val}`] }),
    },
  },
  $null: {
    dialects: {
      sqlite: (col, val) => ({ sql: val ? `${col} IS NULL` : `${col} IS NOT NULL`, values: [] }),
      postgres: (col, val) => ({ sql: val ? `${col} IS NULL` : `${col} IS NOT NULL`, values: [] }),
      mysql: (col, val) => ({ sql: val ? `${col} IS NULL` : `${col} IS NOT NULL`, values: [] }),
    },
  },
  $between: {
    dialects: {
      sqlite: (col, val) => ({ sql: `${col} BETWEEN ? AND ?`, values: [val[0], val[1]] }),
      postgres: (col, val) => ({ sql: `${col} BETWEEN $1 AND $2`, values: [val[0], val[1]] }),
      mysql: (col, val) => ({ sql: `${col} BETWEEN ? AND ?`, values: [val[0], val[1]] }),
    },
    validate: (val) => Array.isArray(val) && val.length === 2,
  },
};

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createOperatorRegistry(): OperatorRegistry {
  const operators = new Map<string, OperatorDefinition>();

  // Register built-in operators
  for (const [name, def] of Object.entries(builtinOperators)) {
    operators.set(name, def);
  }

  return {
    register(name, definition) {
      if (!name.startsWith('$')) {
        throw new Error(`Operator name must start with "$": ${name}`);
      }
      operators.set(name, definition);
    },

    get(name) {
      return operators.get(name);
    },

    has(name) {
      return operators.has(name);
    },

    list() {
      return Array.from(operators.keys());
    },

    translate(name, column, value, dialect) {
      const op = operators.get(name);
      if (!op) throw new Error(`Unknown operator: ${name}`);

      if (op.validate && !op.validate(value)) {
        throw new Error(`Invalid value for operator ${name}`);
      }

      const translator = op.dialects[dialect];
      if (!translator) {
        throw new Error(`Operator ${name} not supported for dialect "${dialect}"`);
      }

      return translator(column, value);
    },
  };
}
