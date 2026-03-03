import { describe, it, expect } from 'vitest';
import { contentTypeToJsonSchema, contentTypeToToolSchema, attributeMapToJsonSchema } from '../src/json-schema/index.js';

describe('JSON Schema Generation', () => {
  const articleType = {
    uid: 'api::article.article',
    kind: 'collectionType',
    info: { singularName: 'article', pluralName: 'articles', displayName: 'Article', description: 'Blog articles' },
    attributes: {
      title: { type: 'string', required: true, maxLength: 200 },
      content: { type: 'richtext' },
      views: { type: 'integer', min: 0, default: 0 },
      rating: { type: 'float', min: 0, max: 5 },
      featured: { type: 'boolean' },
      publishDate: { type: 'datetime' },
      category: { type: 'enumeration', enum: ['news', 'tutorial', 'opinion'] },
      tags: { type: 'json' },
      cover: { type: 'media' },
      gallery: { type: 'media', multiple: true },
      author: { type: 'relation', relation: 'manyToOne', target: 'plugin::users-permissions.user' },
      comments: { type: 'relation', relation: 'oneToMany', target: 'api::comment.comment' },
      seo: { type: 'component', component: 'shared.seo' },
      sections: { type: 'dynamiczone', components: ['blocks.text', 'blocks.image'] },
      secret: { type: 'string', private: true },
    },
  };

  describe('contentTypeToJsonSchema', () => {
    it('generates valid JSON Schema', () => {
      const schema = contentTypeToJsonSchema(articleType);
      expect(schema.$schema).toBe('http://json-schema.org/draft-07/schema#');
      expect(schema.type).toBe('object');
      expect(schema.title).toBe('Article');
      expect(schema.description).toBe('Blog articles');
    });

    it('marks required fields', () => {
      const schema = contentTypeToJsonSchema(articleType);
      expect(schema.required).toContain('title');
      expect(schema.required).toHaveLength(1);
    });

    it('excludes private fields', () => {
      const schema = contentTypeToJsonSchema(articleType);
      expect(schema.properties!.secret).toBeUndefined();
    });

    it('maps string types correctly', () => {
      const schema = contentTypeToJsonSchema(articleType);
      expect(schema.properties!.title.type).toBe('string');
      expect(schema.properties!.title.maxLength).toBe(200);
      expect(schema.properties!.content.type).toBe('string');
    });

    it('maps numeric types correctly', () => {
      const schema = contentTypeToJsonSchema(articleType);
      expect(schema.properties!.views.type).toBe('integer');
      expect(schema.properties!.views.minimum).toBe(0);
      expect(schema.properties!.rating.type).toBe('number');
      expect(schema.properties!.rating.maximum).toBe(5);
    });

    it('maps boolean type', () => {
      const schema = contentTypeToJsonSchema(articleType);
      expect(schema.properties!.featured.type).toBe('boolean');
    });

    it('maps datetime with format', () => {
      const schema = contentTypeToJsonSchema(articleType);
      expect(schema.properties!.publishDate.format).toBe('date-time');
    });

    it('maps enumeration type', () => {
      const schema = contentTypeToJsonSchema(articleType);
      expect(schema.properties!.category.enum).toEqual(['news', 'tutorial', 'opinion']);
    });

    it('maps json type', () => {
      const schema = contentTypeToJsonSchema(articleType);
      expect(schema.properties!.tags.type).toBe('object');
    });

    it('maps single media as URI', () => {
      const schema = contentTypeToJsonSchema(articleType);
      expect(schema.properties!.cover.type).toBe('string');
      expect(schema.properties!.cover.format).toBe('uri');
    });

    it('maps multiple media as array of URIs', () => {
      const schema = contentTypeToJsonSchema(articleType);
      expect(schema.properties!.gallery.type).toBe('array');
      expect(schema.properties!.gallery.items!.format).toBe('uri');
    });

    it('maps manyToOne relation as string ID', () => {
      const schema = contentTypeToJsonSchema(articleType);
      expect(schema.properties!.author.type).toBe('string');
    });

    it('maps oneToMany relation as array of IDs', () => {
      const schema = contentTypeToJsonSchema(articleType);
      expect(schema.properties!.comments.type).toBe('array');
    });

    it('maps component as object', () => {
      const schema = contentTypeToJsonSchema(articleType);
      expect(schema.properties!.seo.type).toBe('object');
    });

    it('maps dynamic zone as array with oneOf', () => {
      const schema = contentTypeToJsonSchema(articleType);
      expect(schema.properties!.sections.type).toBe('array');
      expect(schema.properties!.sections.items!.oneOf).toHaveLength(2);
    });

    it('includes default values', () => {
      const schema = contentTypeToJsonSchema(articleType);
      expect(schema.properties!.views.default).toBe(0);
    });
  });

  describe('contentTypeToToolSchema', () => {
    it('generates LLM tool schema for create', () => {
      const tool = contentTypeToToolSchema(articleType);
      expect(tool.name).toBe('create_article');
      expect(tool.description).toContain('Create');
      expect(tool.parameters.type).toBe('object');
      expect(tool.parameters.required).toContain('title');
    });

    it('generates tool schema for update (no required)', () => {
      const tool = contentTypeToToolSchema(articleType, { operation: 'update' });
      expect(tool.name).toBe('update_article');
      expect(tool.parameters.required).toBeUndefined();
    });
  });

  describe('attributeMapToJsonSchema', () => {
    it('converts a flat attribute map', () => {
      const schema = attributeMapToJsonSchema(
        { name: { type: 'string', required: true }, age: { type: 'integer' } },
        'Person',
      );
      expect(schema.title).toBe('Person');
      expect(schema.properties!.name.type).toBe('string');
      expect(schema.required).toContain('name');
    });
  });
});
