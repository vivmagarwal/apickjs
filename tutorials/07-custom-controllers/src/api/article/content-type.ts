export default {
  kind: 'collectionType' as const,
  info: { singularName: 'article', pluralName: 'articles', displayName: 'Article' },
  options: { draftAndPublish: false },
  attributes: {
    title: { type: 'string', required: true },
    views: { type: 'integer', default: 0 },
    featured: { type: 'boolean', default: false },
  },
};
