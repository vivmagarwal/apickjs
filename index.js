import Koa from 'koa';
import { koaBody } from 'koa-body';
import cors from '@koa/cors';
import LowDBAdapter from './src/database/lowDbAdapter.js';
import auth from './src/middlewares/auth.js';
import dynamicRoutes from './src/middlewares/dynamicRoutes.js';
import autoIncrementId from './src/middlewares/autoIncrementId.js';

class Apickjs {
  constructor(dbName) {
    this.app = new Koa();
    this.database = new LowDBAdapter(dbName);
    this.initMiddlewares();
  }

  initMiddlewares() {
    this.app.use(koaBody());
    this.app.use(cors());
    // this.app.use(auth());
    // Register the generated routes middleware
    this.app.use(autoIncrementId(this));
    this.app.use(dynamicRoutes(this))
  }

  use(middleware) {
    this.app.use(middleware);
  }

  listen(...args) {
    this.app.listen(...args);
  }
}

export default Apickjs;


