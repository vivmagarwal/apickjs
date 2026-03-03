import { describe, it, expect } from 'vitest';
import { createOperatorRegistry } from '../src/query-engine/operators.js';

describe('Query Operators', () => {
  it('has built-in operators', () => {
    const registry = createOperatorRegistry();
    expect(registry.has('$eq')).toBe(true);
    expect(registry.has('$ne')).toBe(true);
    expect(registry.has('$gt')).toBe(true);
    expect(registry.has('$gte')).toBe(true);
    expect(registry.has('$lt')).toBe(true);
    expect(registry.has('$lte')).toBe(true);
    expect(registry.has('$in')).toBe(true);
    expect(registry.has('$contains')).toBe(true);
    expect(registry.has('$null')).toBe(true);
    expect(registry.has('$between')).toBe(true);
  });

  it('translates $eq for sqlite', () => {
    const registry = createOperatorRegistry();
    const result = registry.translate('$eq', '"title"', 'hello', 'sqlite');
    expect(result.sql).toBe('"title" = ?');
    expect(result.values).toEqual(['hello']);
  });

  it('translates $in for sqlite', () => {
    const registry = createOperatorRegistry();
    const result = registry.translate('$in', '"status"', ['draft', 'published'], 'sqlite');
    expect(result.sql).toBe('"status" IN (?, ?)');
    expect(result.values).toEqual(['draft', 'published']);
  });

  it('translates $contains for postgres (ILIKE)', () => {
    const registry = createOperatorRegistry();
    const result = registry.translate('$contains', '"name"', 'john', 'postgres');
    expect(result.sql).toBe('"name" ILIKE $1');
    expect(result.values).toEqual(['%john%']);
  });

  it('translates $null', () => {
    const registry = createOperatorRegistry();
    const isNull = registry.translate('$null', '"field"', true, 'sqlite');
    expect(isNull.sql).toBe('"field" IS NULL');

    const isNotNull = registry.translate('$null', '"field"', false, 'sqlite');
    expect(isNotNull.sql).toBe('"field" IS NOT NULL');
  });

  it('translates $between', () => {
    const registry = createOperatorRegistry();
    const result = registry.translate('$between', '"age"', [18, 65], 'sqlite');
    expect(result.sql).toBe('"age" BETWEEN ? AND ?');
    expect(result.values).toEqual([18, 65]);
  });

  it('registers a custom operator', () => {
    const registry = createOperatorRegistry();
    registry.register('$regex', {
      dialects: {
        postgres: (col, val) => ({ sql: `${col} ~ $1`, values: [val] }),
        sqlite: (col, val) => ({ sql: `${col} REGEXP ?`, values: [val] }),
      },
    });

    expect(registry.has('$regex')).toBe(true);
    const result = registry.translate('$regex', '"name"', '^foo', 'postgres');
    expect(result.sql).toBe('"name" ~ $1');
  });

  it('rejects operator names without $', () => {
    const registry = createOperatorRegistry();
    expect(() => registry.register('bad', { dialects: {} })).toThrow('must start with "$"');
  });

  it('throws for unknown operator', () => {
    const registry = createOperatorRegistry();
    expect(() => registry.translate('$unknown', '"col"', 1, 'sqlite')).toThrow('Unknown operator');
  });

  it('throws for unsupported dialect', () => {
    const registry = createOperatorRegistry();
    registry.register('$pgonly', {
      dialects: {
        postgres: (col, val) => ({ sql: `${col} @@ $1`, values: [val] }),
      },
    });
    expect(() => registry.translate('$pgonly', '"col"', 'val', 'sqlite')).toThrow('not supported');
  });

  it('validates operator values', () => {
    const registry = createOperatorRegistry();
    expect(() => registry.translate('$between', '"col"', 'not-array', 'sqlite')).toThrow('Invalid value');
  });

  it('lists all operators', () => {
    const registry = createOperatorRegistry();
    const list = registry.list();
    expect(list).toContain('$eq');
    expect(list).toContain('$between');
    expect(list.length).toBeGreaterThanOrEqual(12);
  });
});
