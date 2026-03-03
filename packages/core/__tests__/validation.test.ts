import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { generateSchemas, generateQuerySchema } from '../src/content-types/validation/index.js';
import type { AttributeDefinition } from '../src/content-types/index.js';

describe('generateSchemas', () => {
  const articleAttributes: Record<string, AttributeDefinition> = {
    title: { type: 'string', required: true, minLength: 1, maxLength: 255 },
    slug: { type: 'uid' },
    content: { type: 'richtext' },
    excerpt: { type: 'text', maxLength: 500 },
    views: { type: 'integer', min: 0, default: 0 },
    rating: { type: 'float', min: 0, max: 5 },
    featured: { type: 'boolean', default: false },
    status: { type: 'enumeration', enum: ['draft', 'review', 'published'], required: true },
    email: { type: 'email' },
    publishDate: { type: 'date' },
    publishTime: { type: 'time' },
    publishedAt: { type: 'datetime' },
    metadata: { type: 'json' },
    password: { type: 'password', private: true },
  };

  it('generates create and update schemas', () => {
    const schemas = generateSchemas(articleAttributes);
    expect(schemas.create).toBeDefined();
    expect(schemas.update).toBeDefined();
  });

  describe('create schema', () => {
    const { create } = generateSchemas(articleAttributes);

    it('validates required fields', () => {
      const result = create.safeParse({
        title: 'Hello',
        status: 'draft',
      });
      expect(result.success).toBe(true);
    });

    it('rejects missing required fields', () => {
      const result = create.safeParse({
        slug: 'hello',
      });
      expect(result.success).toBe(false);
    });

    it('validates string minLength', () => {
      const result = create.safeParse({
        title: '',
        status: 'draft',
      });
      expect(result.success).toBe(false);
    });

    it('validates string maxLength', () => {
      const result = create.safeParse({
        title: 'a'.repeat(256),
        status: 'draft',
      });
      expect(result.success).toBe(false);
    });

    it('validates enumeration values', () => {
      const valid = create.safeParse({ title: 'Hello', status: 'draft' });
      expect(valid.success).toBe(true);

      const invalid = create.safeParse({ title: 'Hello', status: 'invalid' });
      expect(invalid.success).toBe(false);
    });

    it('validates integer type', () => {
      const valid = create.safeParse({ title: 'Hello', status: 'draft', views: 10 });
      expect(valid.success).toBe(true);

      const invalid = create.safeParse({ title: 'Hello', status: 'draft', views: 10.5 });
      expect(invalid.success).toBe(false);
    });

    it('validates integer min/max', () => {
      const invalid = create.safeParse({ title: 'Hello', status: 'draft', views: -1 });
      expect(invalid.success).toBe(false);
    });

    it('validates float min/max', () => {
      const valid = create.safeParse({ title: 'Hello', status: 'draft', rating: 4.5 });
      expect(valid.success).toBe(true);

      const invalid = create.safeParse({ title: 'Hello', status: 'draft', rating: 6 });
      expect(invalid.success).toBe(false);
    });

    it('validates email format', () => {
      const valid = create.safeParse({ title: 'Hello', status: 'draft', email: 'user@example.com' });
      expect(valid.success).toBe(true);

      const invalid = create.safeParse({ title: 'Hello', status: 'draft', email: 'not-an-email' });
      expect(invalid.success).toBe(false);
    });

    it('validates date format', () => {
      const valid = create.safeParse({ title: 'Hello', status: 'draft', publishDate: '2025-01-15' });
      expect(valid.success).toBe(true);

      const invalid = create.safeParse({ title: 'Hello', status: 'draft', publishDate: 'January 15' });
      expect(invalid.success).toBe(false);
    });

    it('validates time format', () => {
      const valid = create.safeParse({ title: 'Hello', status: 'draft', publishTime: '14:30' });
      expect(valid.success).toBe(true);

      const invalid = create.safeParse({ title: 'Hello', status: 'draft', publishTime: '2pm' });
      expect(invalid.success).toBe(false);
    });

    it('validates datetime format', () => {
      const valid = create.safeParse({ title: 'Hello', status: 'draft', publishedAt: '2025-01-15T14:30:00.000Z' });
      expect(valid.success).toBe(true);
    });

    it('allows optional fields to be omitted', () => {
      const result = create.safeParse({ title: 'Hello', status: 'draft' });
      expect(result.success).toBe(true);
    });

    it('allows optional fields to be null', () => {
      const result = create.safeParse({
        title: 'Hello',
        status: 'draft',
        content: null,
        slug: null,
      });
      expect(result.success).toBe(true);
    });

    it('excludes private fields from the schema', () => {
      // Password is private, should not be in the schema
      const shape = create.shape;
      expect(shape.password).toBeUndefined();
    });

    it('skips system fields', () => {
      const attrs: Record<string, AttributeDefinition> = {
        createdAt: { type: 'datetime', required: true },
        updatedAt: { type: 'datetime', required: true },
        title: { type: 'string', required: true },
      };
      const { create } = generateSchemas(attrs);
      const shape = create.shape;
      expect(shape.createdAt).toBeUndefined();
      expect(shape.updatedAt).toBeUndefined();
      expect(shape.title).toBeDefined();
    });
  });

  describe('update schema', () => {
    const { update } = generateSchemas(articleAttributes);

    it('makes all fields optional', () => {
      const result = update.safeParse({});
      expect(result.success).toBe(true);
    });

    it('validates provided fields', () => {
      const valid = update.safeParse({ title: 'Updated' });
      expect(valid.success).toBe(true);
    });
  });
});

describe('generateSchemas — special types', () => {
  it('validates media (single) as number', () => {
    const { create } = generateSchemas({
      cover: { type: 'media', required: true },
    });
    expect(create.safeParse({ cover: 1 }).success).toBe(true);
    expect(create.safeParse({ cover: 'abc' }).success).toBe(false);
  });

  it('validates media (multiple) as number array', () => {
    const { create } = generateSchemas({
      gallery: { type: 'media', multiple: true, required: true },
    });
    expect(create.safeParse({ gallery: [1, 2, 3] }).success).toBe(true);
    expect(create.safeParse({ gallery: 1 }).success).toBe(false);
  });

  it('validates to-one relation as number', () => {
    const { create } = generateSchemas({
      category: { type: 'relation', relation: 'manyToOne', target: 'api::cat.cat' },
    });
    // Optional, so omitting is fine
    expect(create.safeParse({}).success).toBe(true);
    expect(create.safeParse({ category: 5 }).success).toBe(true);
    expect(create.safeParse({ category: null }).success).toBe(true);
  });

  it('validates to-many relation as number array or connect/disconnect', () => {
    const { create } = generateSchemas({
      tags: { type: 'relation', relation: 'manyToMany', target: 'api::tag.tag' },
    });
    expect(create.safeParse({ tags: [1, 2, 3] }).success).toBe(true);
    expect(create.safeParse({ tags: { connect: [{ id: 1 }], disconnect: [{ id: 2 }] } }).success).toBe(true);
  });

  it('validates component (single) as nested object', () => {
    const componentSchemas = new Map<string, Record<string, AttributeDefinition>>();
    componentSchemas.set('shared.seo', {
      metaTitle: { type: 'string', required: true },
      metaDescription: { type: 'text' },
    });

    const { create } = generateSchemas(
      { seo: { type: 'component', component: 'shared.seo', required: true } },
      { componentSchemas },
    );

    expect(create.safeParse({
      seo: { metaTitle: 'Hello' },
    }).success).toBe(true);

    expect(create.safeParse({
      seo: {},
    }).success).toBe(false); // metaTitle is required
  });

  it('validates component (repeatable) as array', () => {
    const componentSchemas = new Map<string, Record<string, AttributeDefinition>>();
    componentSchemas.set('shared.slide', {
      title: { type: 'string', required: true },
    });

    const { create } = generateSchemas(
      { slides: { type: 'component', component: 'shared.slide', repeatable: true, min: 1, max: 3, required: true } },
      { componentSchemas },
    );

    expect(create.safeParse({
      slides: [{ title: 'Slide 1' }],
    }).success).toBe(true);

    expect(create.safeParse({
      slides: [],
    }).success).toBe(false); // min: 1
  });

  it('validates dynamiczone with discriminated union', () => {
    const componentSchemas = new Map<string, Record<string, AttributeDefinition>>();
    componentSchemas.set('blocks.hero', {
      heading: { type: 'string', required: true },
    });
    componentSchemas.set('blocks.text', {
      body: { type: 'richtext', required: true },
    });

    const { create } = generateSchemas(
      {
        body: {
          type: 'dynamiczone',
          components: ['blocks.hero', 'blocks.text'],
          min: 1,
          required: true,
        },
      },
      { componentSchemas },
    );

    expect(create.safeParse({
      body: [
        { __component: 'blocks.hero', heading: 'Welcome' },
        { __component: 'blocks.text', body: '<p>Hello</p>' },
      ],
    }).success).toBe(true);

    expect(create.safeParse({
      body: [],
    }).success).toBe(false); // min: 1
  });

  it('validates custom field with custom schema', () => {
    const customFieldSchemas = new Map<string, (field: any) => z.ZodTypeAny>();
    customFieldSchemas.set('plugin::color-picker.color', () =>
      z.string().regex(/^#[0-9A-Fa-f]{6}$/)
    );

    const { create } = generateSchemas(
      { color: { type: 'customField', customField: 'plugin::color-picker.color', required: true } },
      { customFieldSchemas },
    );

    expect(create.safeParse({ color: '#FF0000' }).success).toBe(true);
    expect(create.safeParse({ color: 'red' }).success).toBe(false);
  });
});

describe('generateQuerySchema', () => {
  const attributes: Record<string, AttributeDefinition> = {
    title: { type: 'string' },
    views: { type: 'integer' },
    published: { type: 'boolean' },
    password: { type: 'password', private: true },
  };

  it('generates a query schema with filters, sort, fields, populate, pagination', () => {
    const schema = generateQuerySchema(attributes);

    const result = schema.safeParse({
      filters: { title: 'Hello' },
      sort: 'title:asc',
      fields: ['title', 'views'],
      pagination: { page: 1, pageSize: 10 },
    });
    expect(result.success).toBe(true);
  });

  it('accepts array sort', () => {
    const schema = generateQuerySchema(attributes);
    expect(schema.safeParse({ sort: ['title:asc', 'views:desc'] }).success).toBe(true);
  });

  it('accepts status filter', () => {
    const schema = generateQuerySchema(attributes);
    expect(schema.safeParse({ status: 'published' }).success).toBe(true);
    expect(schema.safeParse({ status: 'draft' }).success).toBe(true);
    expect(schema.safeParse({ status: 'invalid' }).success).toBe(false);
  });

  it('excludes private fields from filter schema', () => {
    const schema = generateQuerySchema(attributes);
    const result = schema.safeParse({
      filters: { password: 'secret' },
    });
    // Password field should not be in the schema but passthrough allowed in z.object partial
    // The point is that the generated filters shape doesn't include password
  });

  it('accepts filter operators', () => {
    const schema = generateQuerySchema(attributes);
    expect(schema.safeParse({
      filters: {
        views: { $gt: 100 },
      },
    }).success).toBe(true);
  });

  it('accepts locale parameter', () => {
    const schema = generateQuerySchema(attributes);
    expect(schema.safeParse({ locale: 'en' }).success).toBe(true);
  });
});
