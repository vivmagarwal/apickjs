# Apick.JS API Construction Kit

Apick.JS is a versatile API construction toolkit designed to facilitate the quick and efficient development of scalable and maintainable APIs. Leveraging the power of *Koa*, a modern and lightweight framework for Node.js, Apick.JS offers a streamlined and intuitive approach to API development. Its flexible architecture is further enhanced by the Adapter pattern, enabling support for a wide array of databases. This adaptability makes Apick.JS an ideal choice for projects that demand rapid development, deployment, and the flexibility to work with various types of databases. This README provides a detailed guide on setting up, features, and how to effectively use Apick.JS, complete with original examples to kickstart your API development.

## Getting Started

### Installation
Ensure Node.js is installed on your system before proceeding. Follow these steps to set up Apick.JS:
```
git clone git@github.com:vivmagarwal/apickjs.git
cd apickjs
npm install
```

### Setting Up Your Server

To start your APICK server, you need to initialize it with a database adapter. The following example uses [LowDBAdapter](https://github.com/vivmagarwal/apickjs/blob/main/src/database/lowDbAdapter.js) for simplicity. It ships with APICK JS.

```javascript:server.js
import Apickjs from './index.js';
import LowDBAdapter from './src/database/lowDbAdapter.js';

let db = new LowDBAdapter('db.json');
let app = await Apickjs.create(db);

app.listen(3000, () => {
  console.log(`APICK Server is running on port ${app.server.address().port}`); 
});
```

### Adding Middleware

You can add custom middleware to your server. Here's an example of a simple logging middleware:

```javascript:src/middlewares/logger.js
export default function logger() {
  return async (ctx, next) => {
    const start = Date.now();
    await next();
    const ms = Date.now() - start;
    console.log(`${ctx.method} ${ctx.url} - ${ms}ms`);
  }
}
```

To use this middleware, add it to your server setup:

```javascript:server.js
app.use(logHelloWorldMiddleware());
```

### Dynamic Routes

APICK automatically generates CRUD (Create, Read, Update, Delete) routes for your database collections. For example, if you have a `posts` collection in your `db.json`, the following routes are automatically created:

- `GET /posts` - Fetch all posts
- `GET /posts/:id` - Fetch a single post by ID
- `POST /posts` - Create a new post
- `PUT /posts/:id` - Update a post by ID
- `DELETE /posts/:id` - Delete a post by ID

### Custom Routes

You can define custom routes in addition to the auto-generated CRUD routes. Here's how you can add a custom route for restarting the server:

```javascript:src/middlewares/dynamicRoutes.js
router.post("/__restart-server", async (ctx) => {
  ctx.body = { message: "Server restarting..." };
  setTimeout(() => {
    apickApp.server.close(async () => {
      console.log('Server closed.');
      apickApp.listen(3000);
      console.log('Server restarted.');
    });
  }, 1000);
});
```

### Managing Data

APICK uses a JSON file (`db.json`) as the database by default. You can perform operations on this database using the provided utility functions.

### Routes and Features

Apick.JS auto-generates routes based on your database structure. For a `db.json` resembling:

```json
{
  "posts": [...],
  "comments": [...],
  "profile": {...}
}
```

You'll have routes like:

- **Posts**: `GET /posts`, `GET /posts/:id`, `POST /posts`, `PUT /posts/:id`, `PATCH /posts/:id`, `DELETE /posts/:id`
- **Comments**: Similar structure to posts.
- **Profile**: `GET /profile`, `PUT /profile`, `PATCH /profile`

#### Query Parameters

- **Filtering**: `GET /posts?views_gt=9000` to get posts with more than 9000 views.
- **Range**: `GET /posts?_start=10&_end=20` fetches posts 11 through 20.
- **Pagination**: `GET /posts?_page=1&_per_page=25` for pagination support.
- **Sorting**: `GET /posts?_sort=id,-views` sorts by `id` asc and `views` desc.
- **Nested Fields**: Query by nested fields using dot notation: `GET /foo?a.b=bar`.
- **Embedding**: Include related resources: `GET /posts?_embed=comments`.

### Example Requests

To interact with your API, you can use tools like `curl`, Postman, or any HTTP client. Here are some example requests:

#### Fetch All Posts

```http
GET http://localhost:3000/posts
```

#### Fetch a Single Post

```http
GET http://localhost:3000/posts/1
```

#### Create a New Post

```http
POST http://localhost:3000/posts
Content-Type: application/json

{
  "title": "New Post",
  "userId": 1
}
```

#### Update a Post

```http
PUT http://localhost:3000/posts/1
Content-Type: application/json

{
  "title": "Updated Post Title",
  "userId": 1
}
```

#### Partially Update a Post

```http
PATCH http://localhost:3000/posts/1
Content-Type: application/json

{
  "title": "Partially Updated Post Title"
}
```

#### Delete a Post

```http
DELETE http://localhost:3000/posts/1
```

### Customization and Extensions

Apick.JS is designed to be flexible. You can add custom middleware for authentication, logging, or any other functionality your API might need.

### Contribution and Support

We welcome contributions to Apick.JS! Please submit pull requests or issues on our GitHub repository. For support, refer to the documentation or open an issue.

### Extending
#### Reading Data

To read data from a collection:

```javascript:src/database/lowDbAdapter.js
async get(collectionName, ctx) {
  await this.db.read();
  let data = this.db.data[collectionName];
  return data;
}
```

#### Inserting Data

To insert a new document into a collection:

```javascript:src/database/lowDbAdapter.js
async insert(collectionName, doc) {
  await this.db.read();
  this.db.data[collectionName].push(doc);
  await this.db.write();
  return doc;
}
```

#### Updating Data

To update an existing document in a collection:

```javascript:src/database/lowDbAdapter.js
async update(collectionName, id, doc) {
  await this.db.read();
  const index = this.db.data[collectionName].findIndex(({ id: currentId }) => currentId == id);
  if (index !== -1) {
    this.db.data[collectionName][index] = { ...doc, id };
    await this.db.write();
  }
  return { id, ...doc };
}
```

### License

Apick.JS is released under the MIT License. See the LICENSE file for more details.

