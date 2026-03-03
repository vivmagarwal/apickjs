import { describe, it, expect } from 'vitest';
import {
  groupBy, keyBy, pick, omit, unique, chunk, compact,
  flatten, mapValues, pickBy,
} from '../src/collection/index.js';

describe('collection utilities', () => {
  describe('groupBy', () => {
    it('groups items by key function', () => {
      const items = [{ type: 'a', v: 1 }, { type: 'b', v: 2 }, { type: 'a', v: 3 }];
      const result = groupBy(items, i => i.type);
      expect(result.a).toHaveLength(2);
      expect(result.b).toHaveLength(1);
    });
  });

  describe('keyBy', () => {
    it('creates a lookup by key', () => {
      const items = [{ id: 'x', name: 'X' }, { id: 'y', name: 'Y' }];
      const result = keyBy(items, i => i.id);
      expect(result.x.name).toBe('X');
      expect(result.y.name).toBe('Y');
    });
  });

  describe('pick', () => {
    it('picks specified keys', () => {
      const obj = { a: 1, b: 2, c: 3 };
      expect(pick(obj, ['a', 'c'])).toEqual({ a: 1, c: 3 });
    });

    it('ignores missing keys', () => {
      const obj = { a: 1 } as any;
      expect(pick(obj, ['a', 'z'])).toEqual({ a: 1 });
    });
  });

  describe('omit', () => {
    it('omits specified keys', () => {
      const obj = { a: 1, b: 2, c: 3 };
      expect(omit(obj, ['b'])).toEqual({ a: 1, c: 3 });
    });
  });

  describe('unique', () => {
    it('removes duplicates from primitives', () => {
      expect(unique([1, 2, 2, 3, 1])).toEqual([1, 2, 3]);
    });

    it('removes duplicates by key function', () => {
      const items = [{ id: 1, v: 'a' }, { id: 2, v: 'b' }, { id: 1, v: 'c' }];
      const result = unique(items, i => i.id);
      expect(result).toHaveLength(2);
      expect(result[0].v).toBe('a');
    });
  });

  describe('chunk', () => {
    it('splits array into chunks', () => {
      expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    });

    it('handles chunk size larger than array', () => {
      expect(chunk([1, 2], 5)).toEqual([[1, 2]]);
    });

    it('handles zero chunk size', () => {
      expect(chunk([1, 2], 0)).toEqual([[1, 2]]);
    });
  });

  describe('compact', () => {
    it('removes null and undefined', () => {
      expect(compact([1, null, 2, undefined, 3, 0, ''])).toEqual([1, 2, 3, 0, '']);
    });
  });

  describe('flatten', () => {
    it('flattens one level', () => {
      expect(flatten([1, [2, 3], 4, [5]])).toEqual([1, 2, 3, 4, 5]);
    });
  });

  describe('mapValues', () => {
    it('maps object values', () => {
      const obj = { a: 1, b: 2 };
      expect(mapValues(obj, v => v * 10)).toEqual({ a: 10, b: 20 });
    });
  });

  describe('pickBy', () => {
    it('filters object entries', () => {
      const obj = { a: 1, b: null, c: 3, d: undefined };
      const result = pickBy(obj, v => v != null);
      expect(result).toEqual({ a: 1, c: 3 });
    });
  });
});
