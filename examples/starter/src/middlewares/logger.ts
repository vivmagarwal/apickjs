/**
 * Example custom middleware — request logger.
 *
 * Logs each request method and URL to the console.
 */
export default () => {
  return async (ctx: any, next: () => Promise<void>) => {
    const start = Date.now();
    await next();
    const duration = Date.now() - start;
    console.log(`${ctx.request.method} ${ctx.request.url} — ${duration}ms`);
  };
};
