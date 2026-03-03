import { describe, it, expect } from 'vitest';
import {
  generateAbility,
  checkMany,
  matchConditions,
  sanitizeOutput,
  sanitizeInput,
  sanitizeQuery,
} from '../src/index.js';
import type { Permission, Ability } from '../src/index.js';

// ==========================================================================
// generateAbility
// ==========================================================================

describe('generateAbility', () => {
  it('creates ability from empty permissions', () => {
    const ability = generateAbility([]);
    expect(ability.can('read', 'api::article.article')).toBe(false);
  });

  it('allows action on matching subject', () => {
    const permissions: Permission[] = [
      { action: 'read', subject: 'api::article.article' },
    ];
    const ability = generateAbility(permissions);

    expect(ability.can('read', 'api::article.article')).toBe(true);
    expect(ability.can('create', 'api::article.article')).toBe(false);
    expect(ability.can('read', 'api::page.page')).toBe(false);
  });

  it('null subject matches all subjects', () => {
    const permissions: Permission[] = [
      { action: 'read', subject: null },
    ];
    const ability = generateAbility(permissions);

    expect(ability.can('read', 'api::article.article')).toBe(true);
    expect(ability.can('read', 'api::page.page')).toBe(true);
    expect(ability.can('create', 'api::article.article')).toBe(false);
  });

  it('supports multiple permissions', () => {
    const permissions: Permission[] = [
      { action: 'read', subject: 'api::article.article' },
      { action: 'create', subject: 'api::article.article' },
      { action: 'read', subject: 'api::page.page' },
    ];
    const ability = generateAbility(permissions);

    expect(ability.can('read', 'api::article.article')).toBe(true);
    expect(ability.can('create', 'api::article.article')).toBe(true);
    expect(ability.can('read', 'api::page.page')).toBe(true);
    expect(ability.can('delete', 'api::article.article')).toBe(false);
  });

  it('cannot() is inverse of can()', () => {
    const permissions: Permission[] = [
      { action: 'read', subject: 'api::article.article' },
    ];
    const ability = generateAbility(permissions);

    expect(ability.cannot('read', 'api::article.article')).toBe(false);
    expect(ability.cannot('delete', 'api::article.article')).toBe(true);
  });

  it('exposes compiled rules', () => {
    const permissions: Permission[] = [
      { action: 'read', subject: 'api::article.article' },
    ];
    const ability = generateAbility(permissions);

    expect(ability.rules).toHaveLength(1);
    expect(ability.rules[0].action).toBe('read');
    expect(ability.rules[0].subject).toBe('api::article.article');
  });
});

// ==========================================================================
// Field-level permissions
// ==========================================================================

describe('field-level permissions', () => {
  it('checks field-level access', () => {
    const permissions: Permission[] = [
      {
        action: 'read',
        subject: 'api::article.article',
        properties: { fields: ['title', 'content'] },
      },
    ];
    const ability = generateAbility(permissions);

    expect(ability.can('read', 'api::article.article', 'title')).toBe(true);
    expect(ability.can('read', 'api::article.article', 'content')).toBe(true);
    expect(ability.can('read', 'api::article.article', 'password')).toBe(false);
  });

  it('null fields means unrestricted', () => {
    const permissions: Permission[] = [
      { action: 'read', subject: 'api::article.article', properties: null },
    ];
    const ability = generateAbility(permissions);

    expect(ability.can('read', 'api::article.article', 'anything')).toBe(true);
  });

  it('allowedFields returns field list when restricted', () => {
    const permissions: Permission[] = [
      {
        action: 'read',
        subject: 'api::article.article',
        properties: { fields: ['title', 'slug'] },
      },
    ];
    const ability = generateAbility(permissions);

    expect(ability.allowedFields('read', 'api::article.article')).toEqual(['title', 'slug']);
  });

  it('allowedFields returns null when unrestricted', () => {
    const permissions: Permission[] = [
      { action: 'read', subject: 'api::article.article' },
    ];
    const ability = generateAbility(permissions);

    expect(ability.allowedFields('read', 'api::article.article')).toBeNull();
  });

  it('allowedFields returns empty array when no matching rules', () => {
    const ability = generateAbility([]);
    expect(ability.allowedFields('read', 'api::article.article')).toEqual([]);
  });

  it('merges fields from multiple matching rules', () => {
    const permissions: Permission[] = [
      {
        action: 'read',
        subject: 'api::article.article',
        properties: { fields: ['title', 'slug'] },
      },
      {
        action: 'read',
        subject: 'api::article.article',
        properties: { fields: ['content', 'slug'] },
      },
    ];
    const ability = generateAbility(permissions);

    const fields = ability.allowedFields('read', 'api::article.article');
    expect(fields).toHaveLength(3);
    expect(fields).toContain('title');
    expect(fields).toContain('slug');
    expect(fields).toContain('content');
  });
});

// ==========================================================================
// Conditions
// ==========================================================================

describe('condition-based permissions', () => {
  it('resolves named conditions via handlers', () => {
    const permissions: Permission[] = [
      {
        action: 'update',
        subject: 'api::article.article',
        conditions: ['isCreator' as any],
      },
    ];
    const ability = generateAbility(permissions, {
      conditionHandlers: {
        isCreator: (user) => ({ createdBy: { id: user.id } }),
      },
      user: { id: 42 },
    });

    expect(ability.can('update', 'api::article.article')).toBe(true);
    const conditions = ability.getConditions('update', 'api::article.article');
    expect(conditions).toEqual({ createdBy: { id: 42 } });
  });

  it('interpolates template variables in inline conditions', () => {
    const permissions: Permission[] = [
      {
        action: 'update',
        subject: 'api::article.article',
        conditions: [{ createdBy: { id: '{{ user.id }}' } }],
      },
    ];
    const ability = generateAbility(permissions, {
      user: { id: 99 },
    });

    const conditions = ability.getConditions('update', 'api::article.article');
    expect(conditions).toEqual({ createdBy: { id: 99 } });
  });

  it('returns null conditions when no conditions defined', () => {
    const permissions: Permission[] = [
      { action: 'read', subject: 'api::article.article' },
    ];
    const ability = generateAbility(permissions);
    expect(ability.getConditions('read', 'api::article.article')).toBeNull();
  });

  it('merges conditions from multiple rules with $or', () => {
    const permissions: Permission[] = [
      {
        action: 'read',
        subject: 'api::article.article',
        conditions: [{ status: 'published' }],
      },
      {
        action: 'read',
        subject: 'api::article.article',
        conditions: [{ createdBy: { id: '{{ user.id }}' } }],
      },
    ];
    const ability = generateAbility(permissions, { user: { id: 5 } });

    const conditions = ability.getConditions('read', 'api::article.article');
    expect(conditions).toHaveProperty('$or');
    expect(conditions!.$or).toHaveLength(2);
  });
});

// ==========================================================================
// matchConditions (sift-like)
// ==========================================================================

describe('matchConditions', () => {
  it('matches direct equality', () => {
    expect(matchConditions({ status: 'published' }, { status: 'published' })).toBe(true);
    expect(matchConditions({ status: 'draft' }, { status: 'published' })).toBe(false);
  });

  it('matches $eq operator', () => {
    expect(matchConditions({ age: 25 }, { age: { $eq: 25 } })).toBe(true);
    expect(matchConditions({ age: 30 }, { age: { $eq: 25 } })).toBe(false);
  });

  it('matches $ne operator', () => {
    expect(matchConditions({ age: 30 }, { age: { $ne: 25 } })).toBe(true);
    expect(matchConditions({ age: 25 }, { age: { $ne: 25 } })).toBe(false);
  });

  it('matches $in operator', () => {
    expect(matchConditions({ role: 'admin' }, { role: { $in: ['admin', 'editor'] } })).toBe(true);
    expect(matchConditions({ role: 'viewer' }, { role: { $in: ['admin', 'editor'] } })).toBe(false);
  });

  it('matches $nin operator', () => {
    expect(matchConditions({ role: 'viewer' }, { role: { $nin: ['admin'] } })).toBe(true);
    expect(matchConditions({ role: 'admin' }, { role: { $nin: ['admin'] } })).toBe(false);
  });

  it('matches $lt and $lte', () => {
    expect(matchConditions({ price: 50 }, { price: { $lt: 100 } })).toBe(true);
    expect(matchConditions({ price: 100 }, { price: { $lt: 100 } })).toBe(false);
    expect(matchConditions({ price: 100 }, { price: { $lte: 100 } })).toBe(true);
  });

  it('matches $gt and $gte', () => {
    expect(matchConditions({ price: 150 }, { price: { $gt: 100 } })).toBe(true);
    expect(matchConditions({ price: 100 }, { price: { $gt: 100 } })).toBe(false);
    expect(matchConditions({ price: 100 }, { price: { $gte: 100 } })).toBe(true);
  });

  it('matches $exists', () => {
    expect(matchConditions({ name: 'John' }, { name: { $exists: true } })).toBe(true);
    expect(matchConditions({}, { name: { $exists: true } })).toBe(false);
    expect(matchConditions({}, { name: { $exists: false } })).toBe(true);
  });

  it('matches $regex', () => {
    expect(matchConditions({ email: 'user@company.com' }, { email: { $regex: '@company\\.com$' } })).toBe(true);
    expect(matchConditions({ email: 'user@other.com' }, { email: { $regex: '@company\\.com$' } })).toBe(false);
  });

  it('matches $and', () => {
    expect(matchConditions(
      { age: 25, status: 'active' },
      { $and: [{ age: { $gte: 18 } }, { status: 'active' }] },
    )).toBe(true);
    expect(matchConditions(
      { age: 15, status: 'active' },
      { $and: [{ age: { $gte: 18 } }, { status: 'active' }] },
    )).toBe(false);
  });

  it('matches $or', () => {
    expect(matchConditions(
      { role: 'editor' },
      { $or: [{ role: 'admin' }, { role: 'editor' }] },
    )).toBe(true);
    expect(matchConditions(
      { role: 'viewer' },
      { $or: [{ role: 'admin' }, { role: 'editor' }] },
    )).toBe(false);
  });

  it('matches nested properties', () => {
    expect(matchConditions(
      { createdBy: { id: 42 } },
      { 'createdBy.id': 42 },
    )).toBe(true);
  });

  it('matches multiple conditions on the same entity', () => {
    expect(matchConditions(
      { age: 25, name: 'John', active: true },
      { age: { $gte: 18 }, name: 'John', active: true },
    )).toBe(true);
  });
});

// ==========================================================================
// checkMany
// ==========================================================================

describe('checkMany', () => {
  it('checks multiple action/subject pairs', () => {
    const permissions: Permission[] = [
      { action: 'read', subject: 'api::article.article' },
      { action: 'create', subject: 'api::article.article' },
    ];
    const ability = generateAbility(permissions);

    const results = checkMany(ability, [
      { action: 'read', subject: 'api::article.article' },
      { action: 'create', subject: 'api::article.article' },
      { action: 'delete', subject: 'api::article.article' },
    ]);

    expect(results).toEqual([true, true, false]);
  });

  it('handles empty checks array', () => {
    const ability = generateAbility([]);
    expect(checkMany(ability, [])).toEqual([]);
  });
});

// ==========================================================================
// Sanitization helpers
// ==========================================================================

describe('sanitizeOutput', () => {
  it('strips fields not in allowedFields', () => {
    const permissions: Permission[] = [
      {
        action: 'read',
        subject: 'api::article.article',
        properties: { fields: ['title', 'slug'] },
      },
    ];
    const ability = generateAbility(permissions);

    const data = { title: 'Hello', slug: 'hello', password: 'secret', views: 100 };
    const result = sanitizeOutput(ability, 'read', 'api::article.article', data);

    expect(result.title).toBe('Hello');
    expect(result.slug).toBe('hello');
    expect(result.password).toBeUndefined();
    expect(result.views).toBeUndefined();
  });

  it('preserves system fields always', () => {
    const permissions: Permission[] = [
      {
        action: 'read',
        subject: 'api::article.article',
        properties: { fields: ['title'] },
      },
    ];
    const ability = generateAbility(permissions);

    const data = { title: 'Hello', id: 1, documentId: 'doc-1', createdAt: 'now', updatedAt: 'now' };
    const result = sanitizeOutput(ability, 'read', 'api::article.article', data);

    expect(result.id).toBe(1);
    expect(result.documentId).toBe('doc-1');
    expect(result.createdAt).toBe('now');
  });

  it('returns all fields when unrestricted', () => {
    const permissions: Permission[] = [
      { action: 'read', subject: 'api::article.article' },
    ];
    const ability = generateAbility(permissions);

    const data = { title: 'Hello', password: 'secret', views: 100 };
    const result = sanitizeOutput(ability, 'read', 'api::article.article', data);

    expect(result).toEqual(data);
  });
});

describe('sanitizeInput', () => {
  it('strips fields not in allowedFields', () => {
    const permissions: Permission[] = [
      {
        action: 'update',
        subject: 'api::article.article',
        properties: { fields: ['title', 'content'] },
      },
    ];
    const ability = generateAbility(permissions);

    const data = { title: 'New Title', content: 'Body', role: 'admin' };
    const result = sanitizeInput(ability, 'update', 'api::article.article', data);

    expect(result.title).toBe('New Title');
    expect(result.content).toBe('Body');
    expect(result.role).toBeUndefined();
  });
});

describe('sanitizeQuery', () => {
  it('filters query fields', () => {
    const permissions: Permission[] = [
      {
        action: 'read',
        subject: 'api::article.article',
        properties: { fields: ['title', 'slug'] },
      },
    ];
    const ability = generateAbility(permissions);

    const query = { fields: ['title', 'slug', 'password'], sort: 'title:asc' };
    const result = sanitizeQuery(ability, 'read', 'api::article.article', query);

    expect(result.fields).toEqual(['title', 'slug']);
    expect(result.sort).toBe('title:asc');
  });

  it('adds conditions to filters', () => {
    const permissions: Permission[] = [
      {
        action: 'read',
        subject: 'api::article.article',
        conditions: [{ createdBy: { id: '{{ user.id }}' } }],
      },
    ];
    const ability = generateAbility(permissions, { user: { id: 42 } });

    const query = { filters: { status: 'published' } };
    const result = sanitizeQuery(ability, 'read', 'api::article.article', query);

    expect(result.filters).toEqual({
      $and: [
        { status: 'published' },
        { createdBy: { id: 42 } },
      ],
    });
  });

  it('sets conditions as filters when no existing filters', () => {
    const permissions: Permission[] = [
      {
        action: 'read',
        subject: 'api::article.article',
        conditions: [{ status: 'published' }],
      },
    ];
    const ability = generateAbility(permissions);

    const result = sanitizeQuery(ability, 'read', 'api::article.article', {});
    expect(result.filters).toEqual({ status: 'published' });
  });
});
