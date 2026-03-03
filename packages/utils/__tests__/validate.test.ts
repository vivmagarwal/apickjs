import { describe, it, expect } from 'vitest';
import {
  isValidEmail, isValidUrl, isNonEmptyString, isPositiveInteger,
  isObject, isValidUidFormat, isValidCronExpression, isStrongPassword,
} from '../src/validate/index.js';

describe('validation utilities', () => {
  describe('isValidEmail', () => {
    it('accepts valid emails', () => {
      expect(isValidEmail('user@example.com')).toBe(true);
      expect(isValidEmail('name+tag@sub.domain.org')).toBe(true);
    });

    it('rejects invalid emails', () => {
      expect(isValidEmail('')).toBe(false);
      expect(isValidEmail('no-at-sign')).toBe(false);
      expect(isValidEmail('@domain.com')).toBe(false);
    });
  });

  describe('isValidUrl', () => {
    it('accepts valid URLs', () => {
      expect(isValidUrl('https://example.com')).toBe(true);
      expect(isValidUrl('http://localhost:3000/path')).toBe(true);
    });

    it('rejects invalid URLs', () => {
      expect(isValidUrl('')).toBe(false);
      expect(isValidUrl('not-a-url')).toBe(false);
    });
  });

  describe('isNonEmptyString', () => {
    it('accepts non-empty strings', () => {
      expect(isNonEmptyString('hello')).toBe(true);
    });

    it('rejects empty or non-string values', () => {
      expect(isNonEmptyString('')).toBe(false);
      expect(isNonEmptyString('   ')).toBe(false);
      expect(isNonEmptyString(null)).toBe(false);
      expect(isNonEmptyString(42)).toBe(false);
    });
  });

  describe('isPositiveInteger', () => {
    it('accepts positive integers', () => {
      expect(isPositiveInteger(1)).toBe(true);
      expect(isPositiveInteger(100)).toBe(true);
    });

    it('rejects non-positive or non-integer values', () => {
      expect(isPositiveInteger(0)).toBe(false);
      expect(isPositiveInteger(-1)).toBe(false);
      expect(isPositiveInteger(1.5)).toBe(false);
      expect(isPositiveInteger('1')).toBe(false);
    });
  });

  describe('isObject', () => {
    it('accepts plain objects', () => {
      expect(isObject({})).toBe(true);
      expect(isObject({ key: 'value' })).toBe(true);
    });

    it('rejects non-objects', () => {
      expect(isObject(null)).toBe(false);
      expect(isObject([])).toBe(false);
      expect(isObject('string')).toBe(false);
    });
  });

  describe('isValidUidFormat', () => {
    it('accepts valid UIDs', () => {
      expect(isValidUidFormat('api::article.article')).toBe(true);
      expect(isValidUidFormat('plugin::users-permissions.user')).toBe(true);
      expect(isValidUidFormat('admin::admin')).toBe(true);
      expect(isValidUidFormat('global::is-authenticated')).toBe(true);
    });

    it('rejects invalid UIDs', () => {
      expect(isValidUidFormat('')).toBe(false);
      expect(isValidUidFormat('article')).toBe(false);
      expect(isValidUidFormat('bad::Article.Article')).toBe(false);
    });
  });

  describe('isValidCronExpression', () => {
    it('accepts valid cron expressions', () => {
      expect(isValidCronExpression('* * * * *')).toBe(true);
      expect(isValidCronExpression('0 */2 * * *')).toBe(true);
      expect(isValidCronExpression('30 9 1 * 1-5')).toBe(true);
    });

    it('rejects invalid cron expressions', () => {
      expect(isValidCronExpression('')).toBe(false);
      expect(isValidCronExpression('* * *')).toBe(false);
      expect(isValidCronExpression('60 * * * *')).toBe(false);
    });
  });

  describe('isStrongPassword', () => {
    it('accepts strong passwords', () => {
      expect(isStrongPassword('Test1234')).toBe(true);
      expect(isStrongPassword('MyP@ss123')).toBe(true);
    });

    it('rejects weak passwords', () => {
      expect(isStrongPassword('short')).toBe(false);
      expect(isStrongPassword('alllowercase1')).toBe(false);
      expect(isStrongPassword('ALLUPPERCASE1')).toBe(false);
      expect(isStrongPassword('NoDigitsHere')).toBe(false);
    });
  });
});
