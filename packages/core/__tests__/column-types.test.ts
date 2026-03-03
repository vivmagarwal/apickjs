import { describe, it, expect } from 'vitest';
import { createColumnTypeRegistry } from '../src/database/column-types.js';

describe('Column Types', () => {
  it('has built-in column types', () => {
    const registry = createColumnTypeRegistry();
    expect(registry.has('string')).toBe(true);
    expect(registry.has('text')).toBe(true);
    expect(registry.has('integer')).toBe(true);
    expect(registry.has('boolean')).toBe(true);
    expect(registry.has('json')).toBe(true);
    expect(registry.has('vector')).toBe(true);
  });

  it('returns SQL for sqlite string column', () => {
    const registry = createColumnTypeRegistry();
    expect(registry.getColumnSql('string', 'sqlite')).toBe('TEXT');
  });

  it('returns SQL for postgres string column with length', () => {
    const registry = createColumnTypeRegistry();
    expect(registry.getColumnSql('string', 'postgres', { length: 100 })).toBe('VARCHAR(100)');
  });

  it('returns SQL for postgres vector column', () => {
    const registry = createColumnTypeRegistry();
    expect(registry.getColumnSql('vector', 'postgres', { dimensions: 768 })).toBe('vector(768)');
  });

  it('returns SQL for sqlite vector column (TEXT fallback)', () => {
    const registry = createColumnTypeRegistry();
    expect(registry.getColumnSql('vector', 'sqlite')).toBe('TEXT');
  });

  it('serializes boolean values', () => {
    const registry = createColumnTypeRegistry();
    expect(registry.serialize('boolean', true)).toBe(1);
    expect(registry.serialize('boolean', false)).toBe(0);
  });

  it('deserializes boolean values', () => {
    const registry = createColumnTypeRegistry();
    expect(registry.deserialize('boolean', 1)).toBe(true);
    expect(registry.deserialize('boolean', 0)).toBe(false);
  });

  it('serializes json values', () => {
    const registry = createColumnTypeRegistry();
    expect(registry.serialize('json', { a: 1 })).toBe('{"a":1}');
  });

  it('deserializes json values', () => {
    const registry = createColumnTypeRegistry();
    expect(registry.deserialize('json', '{"a":1}')).toEqual({ a: 1 });
  });

  it('serializes vector values', () => {
    const registry = createColumnTypeRegistry();
    expect(registry.serialize('vector', [1.0, 2.5, 3.7])).toBe('[1,2.5,3.7]');
  });

  it('deserializes vector values from JSON string', () => {
    const registry = createColumnTypeRegistry();
    expect(registry.deserialize('vector', '[1,2.5,3.7]')).toEqual([1, 2.5, 3.7]);
  });

  it('registers custom column type', () => {
    const registry = createColumnTypeRegistry();
    registry.register('point', {
      dialects: {
        postgres: () => 'POINT',
        sqlite: () => 'TEXT',
      },
      serialize: (val) => `(${val.x},${val.y})`,
      deserialize: (val) => {
        const match = val.match(/\(([^,]+),([^)]+)\)/);
        return match ? { x: parseFloat(match[1]), y: parseFloat(match[2]) } : val;
      },
    });

    expect(registry.has('point')).toBe(true);
    expect(registry.getColumnSql('point', 'postgres')).toBe('POINT');
    expect(registry.serialize('point', { x: 1.5, y: 2.3 })).toBe('(1.5,2.3)');
    expect(registry.deserialize('point', '(1.5,2.3)')).toEqual({ x: 1.5, y: 2.3 });
  });

  it('throws for unknown column type', () => {
    const registry = createColumnTypeRegistry();
    expect(() => registry.getColumnSql('unknown', 'sqlite')).toThrow('Unknown column type');
  });

  it('throws for unsupported dialect', () => {
    const registry = createColumnTypeRegistry();
    registry.register('pg-only', {
      dialects: { postgres: () => 'SPECIAL' },
    });
    expect(() => registry.getColumnSql('pg-only', 'sqlite')).toThrow('not supported');
  });

  it('passes through values when no serialize/deserialize defined', () => {
    const registry = createColumnTypeRegistry();
    expect(registry.serialize('string', 'hello')).toBe('hello');
    expect(registry.deserialize('string', 'hello')).toBe('hello');
  });

  it('lists all column types', () => {
    const registry = createColumnTypeRegistry();
    const list = registry.list();
    expect(list).toContain('string');
    expect(list).toContain('vector');
    expect(list.length).toBeGreaterThanOrEqual(12);
  });
});
