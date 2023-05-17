export default function auth({ database }) {
  return async (ctx, next) => {
    if (ctx.path === "/login" || ctx.path === "/register") {
      await next();
    } else {
      // Check if the route is protected
      const protectedRoutes = await database.read("protected-routes");

      console.log("protectedRoutes **", protectedRoutes);

      // [ { "posts": ["GET"] }]
      const route = ctx.request.path.split("/")[1];

      if (Object.keys(protectedRoutes).includes(route)) {
        const protectedMethods = protectedRoutes.find((r) => r[route])[route];

        console.log("protectedMethods **", protectedMethods);

        // If the route is not protected or the method is not protected, bypass this middleware
        if (!protectedMethods || !protectedMethods.includes(ctx.method)) {
          await next();
          return;
        }

        // If the route is protected, use the koa-jwt middleware to validate the token
        await jwt({ secret: "your_secret_key", passthrough: true })(ctx, next);

        // Check if the user is authenticated
        if (!ctx.state.user) {
          ctx.throw(401, "Authentication Error");
        }

        await next();
      } else {
        await next();
      }
    }
  };
}
