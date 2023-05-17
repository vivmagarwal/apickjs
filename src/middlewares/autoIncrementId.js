export default function autoIncrementId({database}) {
  return async function (ctx, next) {
    console.log('inside autoIncrementId middleware')
    if (ctx.method === 'POST') {
      if (ctx.request.body && !ctx.request.body.id) {
        const url = new URL(ctx.request.href);
        const collectionName = url.pathname.split('/')[1];
        console.log('collectionName: ', collectionName)
  
        const maxId = await database.getMaxId(collectionName);
        ctx.request.body.id =  maxId + 1;
      }
    }
  
    await next();
  }
}

