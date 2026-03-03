# Tutorial 04: Single Types

In previous tutorials we worked exclusively with **collection types** — content types that store multiple entries (articles, categories, etc.). APICK also supports **single types**, which represent content that exists as exactly one instance: a homepage, a global settings object, an "about us" page, and so on.

## Collection Types vs Single Types

| Aspect | Collection Type | Single Type |
|---|---|---|
| `kind` | `'collectionType'` | `'singleType'` |
| Entries | Many (0..N) | Exactly one (0..1) |
| Routes | `/api/articles`, `/api/articles/:id` | `/api/homepage` (no `:id`) |
| Create | `POST /api/articles` | `PUT /api/homepage` (creates or updates) |
| Read one | `GET /api/articles/:id` | `GET /api/homepage` |
| Update | `PUT /api/articles/:id` | `PUT /api/homepage` |
| Delete | `DELETE /api/articles/:id` | `DELETE /api/homepage` |
| List | `GET /api/articles` | N/A |

The key difference: single types never have an `:id` parameter in their routes. There is only ever one row, so the system manages its identity internally.

## Defining a Single Type

A single type content definition looks almost identical to a collection type. The only difference is the `kind` field:

```typescript
// src/api/homepage/content-type.ts
export default {
  kind: 'singleType' as const,
  info: {
    singularName: 'homepage',
    pluralName: 'homepages',
    displayName: 'Homepage',
  },
  options: { draftAndPublish: false },
  attributes: {
    hero_title:    { type: 'string' },
    hero_subtitle: { type: 'text' },
    featured_count: { type: 'integer', default: 3 },
  },
};
```

Compare with a standard collection type:

```typescript
// src/api/article/content-type.ts
export default {
  kind: 'collectionType' as const,
  info: {
    singularName: 'article',
    pluralName: 'articles',
    displayName: 'Article',
  },
  options: { draftAndPublish: false },
  attributes: {
    title: { type: 'string', required: true },
  },
};
```

## API Differences

### Creating / Updating (PUT)

Single types use `PUT` for both creation and updates. The first `PUT` creates the record (returns `201`), and subsequent `PUT` calls update it (returns `200`):

```bash
# First call — creates the homepage (201 Created)
curl -X PUT http://localhost:1337/api/homepage \
  -H "Content-Type: application/json" \
  -d '{"data": {"hero_title": "Welcome to APICK", "hero_subtitle": "Build APIs fast"}}'

# Second call — updates the homepage (200 OK)
curl -X PUT http://localhost:1337/api/homepage \
  -H "Content-Type: application/json" \
  -d '{"data": {"hero_title": "Updated Title"}}'
```

### Reading (GET)

A single `GET` returns the one instance. If it has not been created yet, the API returns `404`:

```bash
# Returns the homepage object (or 404 if not created)
curl http://localhost:1337/api/homepage
```

Response:

```json
{
  "data": {
    "id": 1,
    "hero_title": "Welcome to APICK",
    "hero_subtitle": "Build APIs fast",
    "featured_count": 3,
    "createdAt": "2026-03-03T10:00:00.000Z",
    "updatedAt": "2026-03-03T10:00:00.000Z"
  }
}
```

### Deleting (DELETE)

Removes the single type instance entirely. After deletion, `GET` returns `404` again:

```bash
curl -X DELETE http://localhost:1337/api/homepage
```

## Using Single Types Alongside Collection Types

Single types and collection types coexist naturally. Each content type gets its own database table and its own set of routes:

```
GET    /api/homepage          <- single type
PUT    /api/homepage          <- single type
DELETE /api/homepage          <- single type

GET    /api/articles          <- collection type (list)
POST   /api/articles          <- collection type (create)
GET    /api/articles/:id      <- collection type (find one)
PUT    /api/articles/:id      <- collection type (update)
DELETE /api/articles/:id      <- collection type (delete)
```

This makes single types ideal for:
- **Homepage** configuration (hero section, featured items count)
- **Global settings** (site name, SEO defaults, social links)
- **About page** content
- **Footer** configuration
- Any content that should exist as exactly one instance

## Running the Tests

```bash
cd tutorials/04-single-types
npm install
npm test
```

The test suite covers:
1. `GET` returns `404` when no data exists
2. `PUT` creates the single type on the first call (`201`)
3. `PUT` updates the existing single type on subsequent calls (`200`)
4. `GET` returns the single type after creation
5. `DELETE` removes the single type
6. Single types and collection types coexist independently
7. Full lifecycle: create, read, update, delete, verify gone
