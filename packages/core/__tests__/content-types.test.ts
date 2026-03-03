import { describe, it, expect } from 'vitest';
import {
  defineContentType,
  defineComponent,
  normalizeContentType,
  normalizeComponent,
  generateDocumentId,
  isScalarType,
  isRelationType,
  isComponentType,
  isDynamicZoneType,
  isMediaType,
  getScalarTypes,
} from '../src/content-types/index.js';

describe('defineContentType', () => {
  it('accepts a valid collection type config', () => {
    const config = defineContentType({
      kind: 'collectionType',
      info: { singularName: 'article', pluralName: 'articles', displayName: 'Article' },
      attributes: {
        title: { type: 'string', required: true },
        content: { type: 'richtext' },
      },
    });

    expect(config.kind).toBe('collectionType');
    expect(config.info.singularName).toBe('article');
    expect(config.attributes.title.type).toBe('string');
  });

  it('accepts a valid single type config', () => {
    const config = defineContentType({
      kind: 'singleType',
      info: { singularName: 'homepage', pluralName: 'homepages', displayName: 'Homepage' },
      attributes: {
        heroTitle: { type: 'string' },
      },
    });

    expect(config.kind).toBe('singleType');
  });

  it('throws if singularName is missing', () => {
    expect(() => defineContentType({
      kind: 'collectionType',
      info: { singularName: '', pluralName: 'articles', displayName: 'Article' },
      attributes: {},
    })).toThrow('singularName');
  });

  it('throws if pluralName is missing', () => {
    expect(() => defineContentType({
      kind: 'collectionType',
      info: { singularName: 'article', pluralName: '', displayName: 'Article' },
      attributes: {},
    })).toThrow('pluralName');
  });

  it('throws if displayName is missing', () => {
    expect(() => defineContentType({
      kind: 'collectionType',
      info: { singularName: 'article', pluralName: 'articles', displayName: '' },
      attributes: {},
    })).toThrow('displayName');
  });

  it('throws for invalid kind', () => {
    expect(() => defineContentType({
      kind: 'invalid' as any,
      info: { singularName: 'article', pluralName: 'articles', displayName: 'Article' },
      attributes: {},
    })).toThrow('kind');
  });

  it('throws for unknown attribute type', () => {
    expect(() => defineContentType({
      kind: 'collectionType',
      info: { singularName: 'article', pluralName: 'articles', displayName: 'Article' },
      attributes: {
        field: { type: 'unknown_type' },
      },
    })).toThrow('unknown type');
  });

  it('throws if enumeration lacks enum array', () => {
    expect(() => defineContentType({
      kind: 'collectionType',
      info: { singularName: 'article', pluralName: 'articles', displayName: 'Article' },
      attributes: {
        status: { type: 'enumeration' },
      },
    })).toThrow('enum');
  });

  it('throws if relation lacks relation type', () => {
    expect(() => defineContentType({
      kind: 'collectionType',
      info: { singularName: 'article', pluralName: 'articles', displayName: 'Article' },
      attributes: {
        category: { type: 'relation' },
      },
    })).toThrow('relation');
  });

  it('throws if component lacks component UID', () => {
    expect(() => defineContentType({
      kind: 'collectionType',
      info: { singularName: 'article', pluralName: 'articles', displayName: 'Article' },
      attributes: {
        seo: { type: 'component' },
      },
    })).toThrow('component');
  });

  it('throws if dynamiczone lacks components array', () => {
    expect(() => defineContentType({
      kind: 'collectionType',
      info: { singularName: 'page', pluralName: 'pages', displayName: 'Page' },
      attributes: {
        body: { type: 'dynamiczone' },
      },
    })).toThrow('components');
  });

  it('throws if customField lacks customField UID', () => {
    expect(() => defineContentType({
      kind: 'collectionType',
      info: { singularName: 'product', pluralName: 'products', displayName: 'Product' },
      attributes: {
        color: { type: 'customField' },
      },
    })).toThrow('customField');
  });

  it('accepts all valid scalar types', () => {
    const scalarTypes = [
      'string', 'text', 'richtext', 'blocks', 'email', 'password', 'uid',
      'integer', 'biginteger', 'float', 'decimal', 'boolean',
      'date', 'time', 'datetime', 'json',
    ];

    const attrs: Record<string, any> = {};
    for (const type of scalarTypes) {
      attrs[`field_${type}`] = { type };
    }
    attrs['field_enumeration'] = { type: 'enumeration', enum: ['a', 'b'] };

    expect(() => defineContentType({
      kind: 'collectionType',
      info: { singularName: 'test', pluralName: 'tests', displayName: 'Test' },
      attributes: attrs,
    })).not.toThrow();
  });

  it('accepts all valid special types', () => {
    expect(() => defineContentType({
      kind: 'collectionType',
      info: { singularName: 'test', pluralName: 'tests', displayName: 'Test' },
      attributes: {
        cover: { type: 'media', multiple: false },
        category: { type: 'relation', relation: 'manyToOne', target: 'api::category.category' },
        seo: { type: 'component', component: 'shared.seo' },
        body: { type: 'dynamiczone', components: ['blocks.hero', 'blocks.text'] },
        color: { type: 'customField', customField: 'plugin::color-picker.color' },
      },
    })).not.toThrow();
  });
});

describe('defineComponent', () => {
  it('accepts a valid component config', () => {
    const config = defineComponent({
      info: { displayName: 'SEO' },
      attributes: {
        metaTitle: { type: 'string' },
        metaDescription: { type: 'text' },
      },
    });

    expect(config.info.displayName).toBe('SEO');
  });

  it('throws if displayName is missing', () => {
    expect(() => defineComponent({
      info: { displayName: '' },
      attributes: {},
    })).toThrow('displayName');
  });

  it('throws if component contains a dynamic zone', () => {
    expect(() => defineComponent({
      info: { displayName: 'Bad' },
      attributes: {
        body: { type: 'dynamiczone', components: ['a.b'] },
      },
    })).toThrow('cannot contain dynamic zone');
  });

  it('allows nested components', () => {
    expect(() => defineComponent({
      info: { displayName: 'Card' },
      attributes: {
        image: { type: 'media', multiple: false },
        link: { type: 'component', component: 'shared.link' },
      },
    })).not.toThrow();
  });
});

describe('normalizeContentType', () => {
  it('adds system attributes', () => {
    const schema = normalizeContentType('api::article.article', {
      kind: 'collectionType',
      info: { singularName: 'article', pluralName: 'articles', displayName: 'Article' },
      attributes: { title: { type: 'string' } },
    });

    expect(schema.uid).toBe('api::article.article');
    expect(schema.modelType).toBe('contentType');
    expect(schema.attributes.createdAt).toBeDefined();
    expect(schema.attributes.updatedAt).toBeDefined();
    expect(schema.attributes.publishedAt).toBeDefined();
    expect(schema.attributes.locale).toBeDefined();
    expect(schema.attributes.title).toBeDefined();
  });

  it('generates collectionName from pluralName', () => {
    const schema = normalizeContentType('api::article.article', {
      kind: 'collectionType',
      info: { singularName: 'article', pluralName: 'articles', displayName: 'Article' },
      attributes: {},
    });

    expect(schema.collectionName).toBe('articles');
  });

  it('uses explicit collectionName', () => {
    const schema = normalizeContentType('api::article.article', {
      kind: 'collectionType',
      collectionName: 'custom_articles',
      info: { singularName: 'article', pluralName: 'articles', displayName: 'Article' },
      attributes: {},
    });

    expect(schema.collectionName).toBe('custom_articles');
  });

  it('defaults draftAndPublish to true', () => {
    const schema = normalizeContentType('api::article.article', {
      kind: 'collectionType',
      info: { singularName: 'article', pluralName: 'articles', displayName: 'Article' },
      attributes: {},
    });

    expect(schema.options.draftAndPublish).toBe(true);
  });

  it('replaces hyphens with underscores in collection name', () => {
    const schema = normalizeContentType('api::blog-post.blog-post', {
      kind: 'collectionType',
      info: { singularName: 'blog-post', pluralName: 'blog-posts', displayName: 'Blog Post' },
      attributes: {},
    });

    expect(schema.collectionName).toBe('blog_posts');
  });
});

describe('normalizeComponent', () => {
  it('generates UID and collectionName', () => {
    const schema = normalizeComponent('shared.seo', {
      info: { displayName: 'SEO' },
      attributes: { metaTitle: { type: 'string' } },
    });

    expect(schema.uid).toBe('shared.seo');
    expect(schema.modelType).toBe('component');
    expect(schema.category).toBe('shared');
    expect(schema.collectionName).toBe('components_shared_seos');
  });

  it('uses explicit collectionName', () => {
    const schema = normalizeComponent('shared.seo', {
      collectionName: 'custom_seo',
      info: { displayName: 'SEO' },
      attributes: {},
    });

    expect(schema.collectionName).toBe('custom_seo');
  });
});

describe('generateDocumentId', () => {
  it('generates a UUID', () => {
    const id = generateDocumentId();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it('generates unique IDs', () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateDocumentId()));
    expect(ids.size).toBe(100);
  });
});

describe('type helpers', () => {
  it('isScalarType identifies scalar types', () => {
    expect(isScalarType('string')).toBe(true);
    expect(isScalarType('integer')).toBe(true);
    expect(isScalarType('relation')).toBe(false);
    expect(isScalarType('component')).toBe(false);
  });

  it('isRelationType identifies relations', () => {
    expect(isRelationType('relation')).toBe(true);
    expect(isRelationType('string')).toBe(false);
  });

  it('isComponentType identifies components', () => {
    expect(isComponentType('component')).toBe(true);
    expect(isComponentType('string')).toBe(false);
  });

  it('isDynamicZoneType identifies dynamic zones', () => {
    expect(isDynamicZoneType('dynamiczone')).toBe(true);
    expect(isDynamicZoneType('string')).toBe(false);
  });

  it('isMediaType identifies media', () => {
    expect(isMediaType('media')).toBe(true);
    expect(isMediaType('string')).toBe(false);
  });

  it('getScalarTypes returns all 17 scalar types', () => {
    const types = getScalarTypes();
    expect(types).toHaveLength(17);
    expect(types).toContain('string');
    expect(types).toContain('enumeration');
    expect(types).toContain('json');
    expect(types).not.toContain('relation');
  });
});
