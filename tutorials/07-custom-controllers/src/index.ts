export default {
  /**
   * bootstrap() runs after the database is ready.
   * Use it to register custom routes that need the document service.
   */
  async bootstrap({ apick }: { apick: any }) {
    const { server } = apick;

    // Custom route: GET /api/articles/popular
    // Returns the top 3 most-viewed articles.
    server.route({
      method: 'GET',
      path: '/api/articles/popular',
      handler: async (ctx: any) => {
        const documents = apick.documents('api::article.article');
        const articles = await documents.findMany({
          sort: ['views:desc'],
          pagination: { start: 0, limit: 3 },
        });
        ctx.body = {
          data: articles,
          meta: { description: 'Top 3 most viewed articles' },
        };
      },
    });

    // Custom route: POST /api/articles/:id/toggle-featured
    // Flips the `featured` boolean on a specific article.
    server.route({
      method: 'POST',
      path: '/api/articles/:id/toggle-featured',
      handler: async (ctx: any) => {
        const { id } = ctx.params;
        const documents = apick.documents('api::article.article');

        const existing = await documents.findOne({ documentId: id });
        if (!existing) {
          ctx.status = 404;
          ctx.body = {
            data: null,
            error: { status: 404, name: 'NotFoundError', message: 'Not Found' },
          };
          return;
        }

        const updated = await documents.update({
          documentId: id,
          data: { featured: !existing.featured },
        });

        ctx.body = { data: updated, meta: {} };
      },
    });
  },
};
