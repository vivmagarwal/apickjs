export default {
  kind: 'collectionType' as const,
  info: {
    singularName: 'article',
    pluralName: 'articles',
    displayName: 'Article',
  },
  options: { draftAndPublish: true },
  attributes: {
    title: { type: 'string', required: true },
    content: { type: 'richtext' },
  },
};
