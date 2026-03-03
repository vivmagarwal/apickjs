export default {
  /**
   * bootstrap() runs after the database is ready.
   * Register cache-aside middleware with invalidation.
   */
  async bootstrap({ apick }: { apick: any }) {
    const { server, cache } = apick;

    // Cache-aside middleware with write invalidation
    server.use(async (ctx: any, next: any) => {
      // --- Read path (cache-aside) ---
      if (ctx.request.method === 'GET' && ctx.request.url === '/api/articles') {
        const cacheKey = 'api:articles:list';

        const cached = await cache.get(cacheKey);
        if (cached) {
          ctx.status = 200;
          ctx.body = cached;
          ctx.set('X-Cache', 'HIT');
          return;
        }

        await next();

        if (ctx.status === 200) {
          await cache.set(cacheKey, ctx.body);
        }
        ctx.set('X-Cache', 'MISS');
        return;
      }

      // --- Write path ---
      await next();

      // Invalidate after successful writes
      if (
        ['POST', 'PUT', 'DELETE'].includes(ctx.request.method) &&
        ctx.request.url.startsWith('/api/articles')
      ) {
        await cache.del('api:articles:list');
      }
    });
  },
};
