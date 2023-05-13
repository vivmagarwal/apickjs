export default function auth() {
  return async (ctx, next) => {
    if (ctx.path === '/login' || ctx.path === '/register') {
      await next();
    } else {
      const token = ctx.headers['authorization'];
      if (token) {
        // @todo: validate token here...
        await next();
      } else {
        ctx.status = 401;
        ctx.body = { message: 'Unauthorized' };
      }
    }
  }
}
