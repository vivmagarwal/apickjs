export default {
  kind: 'collectionType' as const,
  info: {
    singularName: 'article',
    pluralName: 'articles',
    displayName: 'Article',
  },
  options: { draftAndPublish: false },
  attributes: {
    title: { type: 'string', required: true },
    slug: { type: 'uid', targetField: 'title' },
    content: { type: 'richtext' },
    excerpt: { type: 'text' },
    views: { type: 'integer', default: 0 },
    featured: { type: 'boolean', default: false },
    category: { type: 'enumeration', enum: ['news', 'tutorial', 'opinion', 'release'] },
    metadata: { type: 'json' },
  },
};
