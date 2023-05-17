import Apickjs from './index.js';
import LowDBAdapter from './src/database/lowDbAdapter.js';

let db = new LowDBAdapter('db.json');
let app = await Apickjs.create(db);


// You can use custom middleware here if needed
function logHelloWorldMiddleware() {
  return async function(ctx, next) {
    console.log("*** Hello World ***");
    await next();
  };
}

app.use(logHelloWorldMiddleware());


// if you make it 0, the server will provide you a dynmic port which is available.
app.listen(3000, () => {
  console.log(`APICK Server is running on port ${app.server.address().port}`); 
  console.log(`>> http://localhost:${app.server.address().port} <<`); 
});