import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createEnv } from '../src/env/index.js';

describe('env() helper', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('reads string values from process.env', () => {
    process.env.TEST_KEY = 'hello';
    const env = createEnv();
    expect(env('TEST_KEY')).toBe('hello');
  });

  it('returns undefined for missing keys', () => {
    const env = createEnv();
    expect(env('MISSING_KEY')).toBeUndefined();
  });

  it('returns default for missing keys', () => {
    const env = createEnv();
    expect(env('MISSING_KEY', 'fallback')).toBe('fallback');
  });

  it('env.int() parses integers', () => {
    process.env.PORT = '3000';
    const env = createEnv();
    expect(env.int('PORT')).toBe(3000);
  });

  it('env.int() returns default for missing/invalid', () => {
    const env = createEnv();
    expect(env.int('MISSING', 8080)).toBe(8080);
    process.env.BAD_INT = 'abc';
    expect(env.int('BAD_INT', 42)).toBe(42);
  });

  it('env.float() parses floats', () => {
    process.env.RATIO = '3.14';
    const env = createEnv();
    expect(env.float('RATIO')).toBeCloseTo(3.14);
  });

  it('env.bool() parses boolean values', () => {
    const env = createEnv();
    process.env.B1 = 'true';
    process.env.B2 = '1';
    process.env.B3 = 'yes';
    process.env.B4 = 'false';
    process.env.B5 = '0';
    process.env.B6 = 'no';

    expect(env.bool('B1')).toBe(true);
    expect(env.bool('B2')).toBe(true);
    expect(env.bool('B3')).toBe(true);
    expect(env.bool('B4')).toBe(false);
    expect(env.bool('B5')).toBe(false);
    expect(env.bool('B6')).toBe(false);
    expect(env.bool('MISSING')).toBeUndefined();
    expect(env.bool('MISSING', true)).toBe(true);
  });

  it('env.json() parses JSON', () => {
    process.env.DATA = '{"key":"value"}';
    const env = createEnv();
    expect(env.json('DATA')).toEqual({ key: 'value' });
  });

  it('env.json() returns default for invalid JSON', () => {
    process.env.BAD_JSON = 'not json';
    const env = createEnv();
    expect(env.json('BAD_JSON', { fallback: true })).toEqual({ fallback: true });
  });

  it('env.array() splits comma-separated values', () => {
    process.env.LIST = 'a, b, c';
    const env = createEnv();
    expect(env.array('LIST')).toEqual(['a', 'b', 'c']);
  });

  it('env.array() supports custom separator', () => {
    process.env.LIST2 = 'x|y|z';
    const env = createEnv();
    expect(env.array('LIST2', '|')).toEqual(['x', 'y', 'z']);
  });

  it('env.array() returns empty array for missing key', () => {
    const env = createEnv();
    expect(env.array('MISSING')).toEqual([]);
  });

  it('env.date() parses dates', () => {
    process.env.DATE = '2024-01-15T00:00:00Z';
    const env = createEnv();
    const date = env.date('DATE');
    expect(date).toBeInstanceOf(Date);
    expect(date!.toISOString()).toBe('2024-01-15T00:00:00.000Z');
  });
});
