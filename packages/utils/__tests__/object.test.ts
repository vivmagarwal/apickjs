import { describe, it, expect } from 'vitest';
import { deepMerge, dotGet, dotSet, dotHas, deepFreeze, isPlainObject } from '../src/object/index.js';

describe('deepMerge', () => {
  it('merges nested objects', () => {
    const target = { a: { b: 1, c: 2 }, d: 3 };
    const source = { a: { c: 99 }, e: 4 };
    const result = deepMerge(target, source);
    expect(result).toEqual({ a: { b: 1, c: 99 }, d: 3, e: 4 });
  });

  it('replaces arrays', () => {
    const target = { items: [1, 2, 3] };
    const source = { items: [4, 5] };
    expect(deepMerge(target, source)).toEqual({ items: [4, 5] });
  });

  it('skips undefined values', () => {
    const target = { a: 1, b: 2 };
    const source = { a: undefined, b: 3 };
    expect(deepMerge(target, source)).toEqual({ a: 1, b: 3 });
  });

  it('null removes key', () => {
    const target = { a: 1, b: 2 };
    const source = { a: null };
    const result = deepMerge(target, source);
    expect(result).toEqual({ b: 2 });
    expect('a' in result).toBe(false);
  });

  it('does not mutate original', () => {
    const target = { a: { b: 1 } };
    const source = { a: { c: 2 } };
    const result = deepMerge(target, source);
    expect(target).toEqual({ a: { b: 1 } });
    expect(result).toEqual({ a: { b: 1, c: 2 } });
  });
});

describe('dotGet', () => {
  it('gets nested values', () => {
    const obj = { a: { b: { c: 42 } } };
    expect(dotGet(obj, 'a.b.c')).toBe(42);
  });

  it('returns default for missing paths', () => {
    expect(dotGet({}, 'a.b.c', 'fallback')).toBe('fallback');
  });

  it('handles top-level keys', () => {
    expect(dotGet({ key: 'val' }, 'key')).toBe('val');
  });
});

describe('dotSet', () => {
  it('sets nested values, creating intermediate objects', () => {
    const obj: Record<string, any> = {};
    dotSet(obj, 'a.b.c', 42);
    expect(obj).toEqual({ a: { b: { c: 42 } } });
  });
});

describe('dotHas', () => {
  it('returns true for existing paths', () => {
    expect(dotHas({ a: { b: 1 } }, 'a.b')).toBe(true);
  });

  it('returns false for missing paths', () => {
    expect(dotHas({ a: { b: 1 } }, 'a.c')).toBe(false);
    expect(dotHas({}, 'a.b.c')).toBe(false);
  });
});

describe('deepFreeze', () => {
  it('freezes nested objects', () => {
    const obj = deepFreeze({ a: { b: 1 } });
    expect(Object.isFrozen(obj)).toBe(true);
    expect(Object.isFrozen(obj.a)).toBe(true);
  });
});

describe('isPlainObject', () => {
  it('identifies plain objects', () => {
    expect(isPlainObject({})).toBe(true);
    expect(isPlainObject({ a: 1 })).toBe(true);
  });

  it('rejects non-plain values', () => {
    expect(isPlainObject(null)).toBe(false);
    expect(isPlainObject([])).toBe(false);
    expect(isPlainObject(new Date())).toBe(false);
    expect(isPlainObject('string')).toBe(false);
  });
});
