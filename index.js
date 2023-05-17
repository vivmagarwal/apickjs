import Koa from 'koa';
import { koaBody } from 'koa-body';
import cors from '@koa/cors';
import LowDBAdapter from './src/database/lowDbAdapter.js';
import auth from './src/middlewares/auth.js';
import dynamicRoutes from './src/middlewares/dynamicRoutes.js';
import autoIncrementId from './src/middlewares/autoIncrementId.js';
import logger from './src/middlewares/logger.js';


class Apickjs {
  constructor(dbName) {
    this.app = new Koa();
    this.database = new LowDBAdapter(dbName);
    this.preRouteMiddlewares = [];
    // this.initMiddlewares();
  }

  initMiddlewares() {
    this.app.use(koaBody());
    this.app.use(cors());

    // Register the generated routes middleware
    
    for (let middleware of this.preRouteMiddlewares) {
      this.app.use(middleware);
    }
    
    this.app.use(auth(this));
    this.app.use(logger())
    this.app.use(autoIncrementId(this));
    this.app.use(dynamicRoutes(this)); // typically route handlers are at the end of the middleware chain and don't call next() 
  }

  use(middleware) {
    this.preRouteMiddlewares.push(middleware);
  }

  listen(...args) {
    this.app.listen(...args);
  }
}

export default Apickjs;


