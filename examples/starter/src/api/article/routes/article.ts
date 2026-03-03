/**
 * Article routes.
 *
 * Uses the default CRUD routes provided by APICK core.
 */
export default {
  routes: [
    {
      method: 'GET',
      path: '/articles',
      handler: 'article.find',
      config: { auth: false },
    },
    {
      method: 'GET',
      path: '/articles/:documentId',
      handler: 'article.findOne',
      config: { auth: false },
    },
    {
      method: 'POST',
      path: '/articles',
      handler: 'article.create',
      config: {
        policies: ['global::is-authenticated'],
      },
    },
    {
      method: 'PUT',
      path: '/articles/:documentId',
      handler: 'article.update',
      config: {
        policies: ['global::is-authenticated'],
      },
    },
    {
      method: 'DELETE',
      path: '/articles/:documentId',
      handler: 'article.delete',
      config: {
        policies: ['global::is-authenticated'],
      },
    },
  ],
};
