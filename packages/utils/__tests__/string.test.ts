import { describe, it, expect } from 'vitest';
import { slugify, pluralize, camelCase, pascalCase, kebabCase } from '../src/string/index.js';

describe('slugify', () => {
  it('converts to URL-friendly slug', () => {
    expect(slugify('Hello World!')).toBe('hello-world');
    expect(slugify('  Multiple   Spaces  ')).toBe('multiple-spaces');
    expect(slugify('Café & Résumé')).toBe('cafe-resume');
  });

  it('supports custom separator', () => {
    expect(slugify('Hello World', '_')).toBe('hello_world');
  });
});

describe('pluralize', () => {
  it('adds s for regular words', () => {
    expect(pluralize('article')).toBe('articles');
    expect(pluralize('user')).toBe('users');
  });

  it('adds es for words ending in s/x/z/ch/sh', () => {
    expect(pluralize('bus')).toBe('buses');
    expect(pluralize('box')).toBe('boxes');
    expect(pluralize('match')).toBe('matches');
  });

  it('handles words ending in consonant + y', () => {
    expect(pluralize('category')).toBe('categories');
    expect(pluralize('city')).toBe('cities');
  });

  it('handles words ending in vowel + y', () => {
    expect(pluralize('day')).toBe('days');
    expect(pluralize('key')).toBe('keys');
  });
});

describe('camelCase', () => {
  it('converts to camelCase', () => {
    expect(camelCase('hello-world')).toBe('helloWorld');
    expect(camelCase('some_thing')).toBe('someThing');
    expect(camelCase('PascalCase')).toBe('pascalCase');
  });
});

describe('pascalCase', () => {
  it('converts to PascalCase', () => {
    expect(pascalCase('hello-world')).toBe('HelloWorld');
    expect(pascalCase('some_thing')).toBe('SomeThing');
  });
});

describe('kebabCase', () => {
  it('converts to kebab-case', () => {
    expect(kebabCase('helloWorld')).toBe('hello-world');
    expect(kebabCase('some_thing')).toBe('some-thing');
  });
});
