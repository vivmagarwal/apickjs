import Apickjs from './index.js';
import LowDBAdapter from './src/database/lowDbAdapter.js';

let db = new LowDBAdapter('db.json');
let app = new Apickjs(db);


// You can use custom middleware here if needed
// app.use(customMiddleware());

app.listen(3000, () => {
  console.log('APICK Server is running on port 3000'); 
});
