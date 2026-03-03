export default {
  kind: 'collectionType' as const,
  info: {
    singularName: 'post',
    pluralName: 'posts',
    displayName: 'Post',
  },
  options: { draftAndPublish: false },
  attributes: {
    title: { type: 'string', required: true },
    body: { type: 'text' },
  },
};
