/**
 * Article content type schema.
 *
 * Defines the attributes for the "article" collection type.
 */
export default {
  kind: 'collectionType' as const,
  collectionName: 'articles',
  info: {
    singularName: 'article',
    pluralName: 'articles',
    displayName: 'Article',
    description: 'Blog articles managed via the Content API.',
  },
  options: {
    draftAndPublish: true,
  },
  attributes: {
    title: {
      type: 'string',
      required: true,
    },
    slug: {
      type: 'uid',
      targetField: 'title',
    },
    content: {
      type: 'blocks',
    },
    excerpt: {
      type: 'text',
    },
    coverImage: {
      type: 'media',
      allowedTypes: ['images'],
    },
    category: {
      type: 'enumeration',
      enum: ['news', 'tutorial', 'opinion', 'release'],
      default: 'news',
    },
    tags: {
      type: 'json',
    },
    author: {
      type: 'relation',
      relation: 'manyToOne',
      target: 'plugin::users-permissions.user',
    },
  },
};
