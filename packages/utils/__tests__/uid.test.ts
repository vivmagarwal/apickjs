import { describe, it, expect } from 'vitest';
import {
  addNamespace,
  removeNamespace,
  hasNamespace,
  parseUid,
  isValidUid,
  getNamespace,
} from '../src/uid/index.js';

describe('UID utilities', () => {
  describe('addNamespace', () => {
    it('adds namespace prefix', () => {
      expect(addNamespace('article.article', 'api')).toBe('api::article.article');
    });

    it('does not double-add namespace', () => {
      expect(addNamespace('api::article.article', 'api')).toBe('api::article.article');
    });
  });

  describe('removeNamespace', () => {
    it('removes namespace prefix', () => {
      expect(removeNamespace('api::article.article')).toBe('article.article');
    });

    it('returns original if no namespace', () => {
      expect(removeNamespace('article.article')).toBe('article.article');
    });
  });

  describe('hasNamespace', () => {
    it('returns true for valid namespaces', () => {
      expect(hasNamespace('api::something')).toBe(true);
      expect(hasNamespace('plugin::upload.file')).toBe(true);
      expect(hasNamespace('admin::user')).toBe(true);
      expect(hasNamespace('apick::core-store')).toBe(true);
      expect(hasNamespace('global::is-owner')).toBe(true);
    });

    it('returns false for invalid namespaces', () => {
      expect(hasNamespace('unknown::thing')).toBe(false);
      expect(hasNamespace('nocolon')).toBe(false);
      expect(hasNamespace('')).toBe(false);
    });
  });

  describe('parseUid', () => {
    it('parses valid UIDs', () => {
      expect(parseUid('api::article.article')).toEqual({ namespace: 'api', name: 'article.article' });
      expect(parseUid('plugin::upload.file')).toEqual({ namespace: 'plugin', name: 'upload.file' });
    });

    it('returns null for invalid UIDs', () => {
      expect(parseUid('invalid')).toBeNull();
      expect(parseUid('unknown::thing')).toBeNull();
    });
  });

  describe('isValidUid', () => {
    it('validates UIDs', () => {
      expect(isValidUid('api::article.article')).toBe(true);
      expect(isValidUid('api::')).toBe(false);
      expect(isValidUid('invalid')).toBe(false);
    });
  });

  describe('getNamespace', () => {
    it('extracts namespace', () => {
      expect(getNamespace('api::article.article')).toBe('api');
      expect(getNamespace('plugin::upload.file')).toBe('plugin');
    });

    it('returns null for no namespace', () => {
      expect(getNamespace('no-namespace')).toBeNull();
    });
  });
});
