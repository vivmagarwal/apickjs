import Koa from 'koa';
import { koaBody } from 'koa-body';
import cors from '@koa/cors';
import LowDBAdapter from './src/database/lowDbAdapter.js';
import auth from './src/middlewares/auth.js';
import dynamicRoutes from './src/middlewares/dynamicRoutes.js';
import autoIncrementId from './src/middlewares/autoIncrementId.js';
import logger from './src/middlewares/logger.js';
import bcrypt from 'bcrypt';
import serve from 'koa-static';


class Apickjs {
  constructor(dbName) {
    this._app = new Koa();
    this.database = new LowDBAdapter(dbName);
    this.preRouteMiddlewares = [];
  }


  async createUsersIfDoesNotExist() {
    const collections = await this.database.getCollections();
    if (!collections.users) {
      await this.database.createCollection("users");
      await this.database.insert("users", {
        id: 1,
        username: "admin",
        password: await bcrypt.hash("admin", 10),
      });
    }
  }

  async createProtectedIfDoesNotExist() {
    const collections = await this.database.getCollections();
    if (!collections['protected-routes']) {
      await this.database.createCollection("protected-routes");
    }
  }

  initMiddlewares() {
    this._app.use(koaBody());
    this._app.use(cors());

    // Register the generated routes middleware
    
    for (let middleware of this.preRouteMiddlewares) {
      this._app.use(middleware);
    }
    
    this._app.use(serve('./public'));
    this._app.use(auth(this));
    this._app.use(logger())
    this._app.use(autoIncrementId(this));
    this._app.use(dynamicRoutes(this)); // typically route handlers are at the end of the middleware chain and don't call next() 
  }
 
  use(middleware) {
    this.preRouteMiddlewares.push(middleware);
  }

  extend(middleware) {
    this.preRouteMiddlewares.push(middleware);
  }

  listen(...args) {
    this.initMiddlewares();
    this.server = this._app.listen(...args);
    return this.server;
  }


  static  async create(dbName) {
    const instance = new Apickjs(dbName);
    await instance.createUsersIfDoesNotExist();
    await instance.createProtectedIfDoesNotExist();
    return instance;
  }
}

export default Apickjs;









