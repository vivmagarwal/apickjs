export default function autoIncrementId({database}) {
  return async function (ctx, next) {
    if (ctx.method === 'POST') {
      if (ctx.request.body && !ctx.request.body.id) {
        const url = new URL(ctx.request.href);
        const collectionName = url.pathname.split('/')[1];  

        if (collectionName !== 'register' && collectionName !== 'login') {
          const maxId = await database.getMaxId(collectionName);
          ctx.request.body.id =  maxId + 1;
        }
      }
    }
  
    await next();
  }
}

