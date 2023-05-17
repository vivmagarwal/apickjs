import Koa from 'koa';
import { koaBody } from 'koa-body';
import cors from '@koa/cors';
import LowDBAdapter from './src/database/lowDbAdapter.js';
import auth from './src/middlewares/auth.js';
import dynamicRoutes from './src/middlewares/dynamicRoutes.js';
import autoIncrementId from './src/middlewares/autoIncrementId.js';
import logger from './src/middlewares/logger.js';
import bcrypt from 'bcrypt';



class Apickjs {
  constructor(dbName) {
    this.app = new Koa();
    this.database = new LowDBAdapter(dbName);
    this.preRouteMiddlewares = [];
    this.createUsersIfDoesNotExist();
    // this.initMiddlewares();
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
    const server = this.app.listen(...args);
    server.on('listening', () => {
      const addressInfo = server.address();
      this.port = typeof addressInfo === 'string' ? addressInfo : addressInfo.port;
    });
    return server;
  }
  
}

export default Apickjs;


