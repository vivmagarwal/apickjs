export default {
  kind: 'singleType' as const,
  info: { singularName: 'homepage', pluralName: 'homepages', displayName: 'Homepage' },
  options: { draftAndPublish: false },
  attributes: {
    hero_title: { type: 'string' },
    hero_subtitle: { type: 'text' },
    featured_count: { type: 'integer', default: 3 },
  },
};
