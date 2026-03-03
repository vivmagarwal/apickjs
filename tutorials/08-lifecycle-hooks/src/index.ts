export default {
  /**
   * bootstrap() runs after the database is ready.
   * Use it to register middleware (lifecycle hooks) and event listeners.
   */
  async bootstrap({ apick }: { apick: any }) {
    const { server, eventHub } = apick;

    // --- Auto-slug middleware (before hook) ---
    // Generates a URL-friendly slug from the title when one is not provided.
    server.use(async (ctx: any, next: any) => {
      if (ctx.request.method === 'POST' && ctx.request.url === '/api/articles') {
        const body = ctx.request.body;
        if (body?.data?.title && !body.data.slug) {
          body.data.slug = body.data.title
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '');
        }
      }

      await next();

      // --- Event notification (after hook) ---
      // Emits an event after successful article creation.
      if (
        ctx.request.method === 'POST' &&
        ctx.request.url === '/api/articles' &&
        ctx.status === 201
      ) {
        await eventHub.emit('article.created', ctx.body?.data);
      }
    });

    // --- Event subscriber ---
    // Logs article creation events to the console.
    eventHub.on('article.created', (event: any) => {
      console.log(`Article created: ${event.title} (slug: ${event.slug})`);
    });
  },
};
