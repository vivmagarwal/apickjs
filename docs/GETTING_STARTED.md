# Getting Started

Build a working content API in under 5 minutes. This guide is for **standalone npm projects** -- no monorepo required.

## Prerequisites

- Node.js 20 or later

## 1. Create the Project

```bash
mkdir my-app && cd my-app
npm init -y
npm install @apick/core @apick/cli @apick/types
```

Set `"type": "module"` in your `package.json`:

```json
{
  "type": "module"
}
```

## 2. Define a Content Type

Create `src/api/post/content-type.ts`:

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
    body:  { type: 'text' },
  },
};
```

That's it for the schema. APICK auto-generates the database table, CRUD endpoints, and query validation from this single file.

## 3. Add Configuration

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

### config/api.ts

```typescript
export default {
  rest: { prefix: '/api' },
};
```

## 4. Start the Server

```bash
npx apick develop
```

You should see:

```
[info] Server listening on http://0.0.0.0:1337
```

## 5. Test with curl

### Create a post

```bash
curl -s -X POST http://localhost:1337/api/posts \
  -H "Content-Type: application/json" \
  -d '{"data":{"title":"My First Post","body":"Hello world!"}}' | jq
```

Response (201):

```json
{
  "data": {
    "id": 1,
    "document_id": "abc123...",
    "title": "My First Post",
    "body": "Hello world!",
    "created_at": "2026-01-15T10:30:00.000Z",
    "updated_at": "2026-01-15T10:30:00.000Z",
    "published_at": null,
    "first_published_at": null,
    "created_by": null,
    "updated_by": null,
    "locale": null
  },
  "meta": {}
}
```

### List all posts

```bash
curl -s http://localhost:1337/api/posts | jq
```

### Get a single post

Replace `DOCUMENT_ID` with the `document_id` from the create response:

```bash
curl -s http://localhost:1337/api/posts/DOCUMENT_ID | jq
```

### Update a post

```bash
curl -s -X PUT http://localhost:1337/api/posts/DOCUMENT_ID \
  -H "Content-Type: application/json" \
  -d '{"data":{"title":"Updated Title","body":"New content"}}' | jq
```

### Delete a post

```bash
curl -s -X DELETE http://localhost:1337/api/posts/DOCUMENT_ID | jq
```

## Project Structure

```
my-app/
  config/
    api.ts
    database.ts
    server.ts
  src/
    api/
      post/
        content-type.ts
  package.json
```

## Alternative: Monorepo Setup

If you want to run the tutorials or contribute to APICK itself:

```bash
git clone https://github.com/vivmagarwal/apickjs.git && cd apickjs
npm install
```

Then run any tutorial:

```bash
cd tutorials/01-hello-apick
npx tsx ../../packages/cli/src/bin.ts develop
```

## Next Steps

- [Tutorial 01: Hello APIck](../tutorials/01-hello-apick/) -- the full walkthrough with detailed explanations
- [Content Modeling Guide](./CONTENT_MODELING_GUIDE.md) -- field types, components, relations
- [Content API Guide](./CONTENT_API_GUIDE.md) -- query params, filtering, sorting, pagination
- [Customization Guide](./CUSTOMIZATION_GUIDE.md) -- custom controllers, services, middleware
