# Tutorial 01: Hello APIck -- Your First Content API

In this tutorial you will build a fully working **Post** content API with Create, Read, Update, and Delete (CRUD) operations. By the end you will have a running server that stores posts in SQLite and exposes them over REST.

## What You Will Build

A `Post` content type with two fields:

| Field   | Type     | Required |
|---------|----------|----------|
| `title` | string   | yes      |
| `body`  | text     | no       |

APIck auto-generates five REST endpoints from this single definition:

| Method   | Path               | Action             |
|----------|--------------------|---------------------|
| `POST`   | `/api/posts`       | Create a post       |
| `GET`    | `/api/posts`       | List all posts      |
| `GET`    | `/api/posts/:id`   | Get one post        |
| `PUT`    | `/api/posts/:id`   | Update a post       |
| `DELETE` | `/api/posts/:id`   | Delete a post       |

## Prerequisites

- Node.js 20 or later
- git

## Step 1: Clone the Repo and Install Dependencies

```bash
git clone https://github.com/anthropics/apick_js.git
cd apick_js
npm install
```

The monorepo uses npm workspaces. A single `npm install` at the root fetches everything, including this tutorial's dev dependencies.

## Step 2: Define the Post Content Type

Create the file `tutorials/01-hello-apick/src/api/post/content-type.ts`:

```typescript
export default {
  kind: 'collectionType' as const,
  info: {
    singularName: 'post',
    pluralName: 'posts',
    displayName: 'Post',
  },
  options: { draftAndPublish: false },
  attributes: {
    title: { type: 'string', required: true },
    body: { type: 'text' },
  },
};
```

This is the only file you *must* write to get a working API. APIck reads this schema, creates the database table, and registers all five CRUD routes automatically.

### Key fields

- **`kind`** -- `'collectionType'` means many entries (like blog posts). The alternative is `'singleType'` for one-off data (like site settings).
- **`info.singularName` / `pluralName`** -- used to build the REST path (`/api/posts`).
- **`attributes`** -- each key becomes a database column. `type: 'string'` maps to `VARCHAR(255)`; `type: 'text'` maps to `TEXT`.

## Step 3: Add Configuration Files

APIck loads config from a `config/` directory next to your `src/` folder.

### config/server.ts

```typescript
export default {
  host: '0.0.0.0',
  port: 1337,
};
```

### config/database.ts

```typescript
export default {
  connection: {
    client: 'sqlite',
    connection: { filename: '.tmp/data.db' },
  },
};
```

SQLite stores the database in a single file. The `.tmp/` directory is created automatically.

### config/api.ts

```typescript
export default {
  rest: { prefix: '/api' },
};
```

This prefixes every auto-generated route with `/api`, so the `posts` plural name becomes `/api/posts`.

## Step 4: Start the Server

From the repository root:

```bash
npx tsx packages/cli/src/bin.ts develop --dir tutorials/01-hello-apick
```

You should see output like:

```
[info] Server listening on http://0.0.0.0:1337
```

## Step 5: Test with curl

Open a second terminal and try each operation.

### Create a post

```bash
curl -s -X POST http://localhost:1337/api/posts \
  -H "Content-Type: application/json" \
  -d '{"data":{"title":"My First Post","body":"Hello world!"}}' | jq
```

Expected response (status 201):

```json
{
  "data": {
    "id": 1,
    "document_id": "abc123...",
    "title": "My First Post",
    "body": "Hello world!",
    "created_at": "2026-03-03T12:00:00.000Z",
    "updated_at": "2026-03-03T12:00:00.000Z"
  },
  "meta": {}
}
```

### List all posts

```bash
curl -s http://localhost:1337/api/posts | jq
```

Expected response (status 200):

```json
{
  "data": [
    {
      "id": 1,
      "document_id": "abc123...",
      "title": "My First Post",
      "body": "Hello world!",
      "created_at": "2026-03-03T12:00:00.000Z",
      "updated_at": "2026-03-03T12:00:00.000Z"
    }
  ],
  "meta": {
    "pagination": {
      "page": 1,
      "pageSize": 25,
      "pageCount": 1,
      "total": 1
    }
  }
}
```

### Get a single post

Replace `DOCUMENT_ID` with the `document_id` value from the create response:

```bash
curl -s http://localhost:1337/api/posts/DOCUMENT_ID | jq
```

Expected response (status 200):

```json
{
  "data": {
    "id": 1,
    "document_id": "abc123...",
    "title": "My First Post",
    "body": "Hello world!",
    "created_at": "2026-03-03T12:00:00.000Z",
    "updated_at": "2026-03-03T12:00:00.000Z"
  },
  "meta": {}
}
```

### Update a post

```bash
curl -s -X PUT http://localhost:1337/api/posts/DOCUMENT_ID \
  -H "Content-Type: application/json" \
  -d '{"data":{"title":"Updated Title","body":"New content"}}' | jq
```

Expected response (status 200):

```json
{
  "data": {
    "id": 1,
    "document_id": "abc123...",
    "title": "Updated Title",
    "body": "New content",
    "created_at": "2026-03-03T12:00:00.000Z",
    "updated_at": "2026-03-03T12:00:05.000Z"
  },
  "meta": {}
}
```

### Delete a post

```bash
curl -s -X DELETE http://localhost:1337/api/posts/DOCUMENT_ID | jq
```

Expected response (status 200):

```json
{
  "data": {
    "id": 1,
    "document_id": "abc123...",
    "title": "Updated Title",
    "body": "New content",
    "created_at": "2026-03-03T12:00:00.000Z",
    "updated_at": "2026-03-03T12:00:05.000Z"
  },
  "meta": {}
}
```

Fetching the same document ID again returns 404:

```bash
curl -s http://localhost:1337/api/posts/DOCUMENT_ID | jq
```

```json
{
  "data": null,
  "error": {
    "status": 404,
    "name": "NotFoundError",
    "message": "Not Found"
  }
}
```

## Key Concepts

### Content Types

A content type is a schema definition that tells APIck what data to store and how to expose it. Place the file at `src/api/<name>/content-type.ts` and APIck discovers it automatically.

### UID Convention

Every content type gets a unique identifier following the pattern `api::<singularName>.<singularName>`. For this tutorial, the post content type has the UID `api::post.post`. The `api::` prefix means it lives in the public API namespace.

### Auto-Generated Routes

APIck reads `pluralName` from the schema and generates RESTful routes under the configured prefix. You do not write any route or controller code for standard CRUD -- it is all derived from the content type definition.

### Response Format

All responses follow a consistent envelope:

- **Success**: `{ "data": { ... }, "meta": { ... } }`
- **List**: `{ "data": [ ... ], "meta": { "pagination": { ... } } }`
- **Error**: `{ "data": null, "error": { "status": 404, "name": "NotFoundError", "message": "..." } }`

## Documentation References

The concepts in this tutorial are covered in more detail in these guides:

- [Content Modeling Guide](../../docs/CONTENT_MODELING_GUIDE.md) -- content type schemas, field types, system fields (`document_id`, `created_at`, etc.)
- [Content API Guide](../../docs/CONTENT_API_GUIDE.md) -- auto-generated REST endpoints, request/response format, error envelope
- [Architecture](../../docs/ARCHITECTURE.md) -- project structure, startup lifecycle, UID namespace system
- [Development Standards](../../docs/DEVELOPMENT_STANDARDS.md) -- TypeScript conventions, file organization, config files

---

## Running the Tests

From the repository root:

```bash
cd tutorials/01-hello-apick
npx vitest run
```

The test file at `tests/hello.test.ts` exercises every CRUD operation using `server.inject()`, which sends requests directly to the HTTP handler without opening a network port. This makes tests fast and deterministic.

## Next Steps

In **Tutorial 02**, you will add field validation and custom error messages to the post content type.
