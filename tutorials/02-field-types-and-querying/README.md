# Tutorial 02: Field Types and Querying

In this tutorial you will build an **Article** content type that exercises eight different field types, then query the collection using sorting and pagination.

## What You Will Build

An `Article` collection type with the following attributes:

| Attribute  | Field Type    | Notes                                      |
|------------|---------------|--------------------------------------------|
| `title`    | `string`      | Required. Short single-line text.          |
| `slug`     | `uid`         | URL-safe identifier derived from `title`.  |
| `content`  | `richtext`    | Full HTML body content.                    |
| `excerpt`  | `text`        | Multi-line plain text summary.             |
| `views`    | `integer`     | Defaults to `0`.                           |
| `featured` | `boolean`     | Defaults to `false`.                       |
| `category` | `enumeration` | One of: news, tutorial, opinion, release.  |
| `metadata` | `json`        | Arbitrary JSON blob (SEO data, tags, etc). |

## Prerequisites

- Completed [Tutorial 01: Hello APIck](../01-hello-apick/) or equivalent familiarity with content types and CRUD.

## Project Structure

```
02-field-types-and-querying/
  config/
    api.ts            # REST prefix (/api)
    database.ts       # SQLite connection
    server.ts         # Host and port
  src/api/article/
    content-type.ts   # Article schema (8 field types)
  tests/
    field-types.test.ts
  package.json
```

## Step 1 -- Define the Content Type

Create `src/api/article/content-type.ts`:

```typescript
export default {
  kind: 'collectionType' as const,
  info: {
    singularName: 'article',
    pluralName: 'articles',
    displayName: 'Article',
  },
  options: { draftAndPublish: false },
  attributes: {
    title:    { type: 'string', required: true },
    slug:     { type: 'uid', targetField: 'title' },
    content:  { type: 'richtext' },
    excerpt:  { type: 'text' },
    views:    { type: 'integer', default: 0 },
    featured: { type: 'boolean', default: false },
    category: { type: 'enumeration', enum: ['news', 'tutorial', 'opinion', 'release'] },
    metadata: { type: 'json' },
  },
};
```

### Field Type Reference

- **string** -- Short text, stored as `TEXT` in SQLite. Use for titles, names, labels.
- **text** -- Multi-line text, also `TEXT`. Use for descriptions, excerpts, bios.
- **richtext** -- HTML content stored as `TEXT`. Intended for WYSIWYG editor output.
- **integer** -- Whole numbers, stored as `INTEGER`. Use for counts, scores, quantities.
- **boolean** -- True/false, stored as `INTEGER` (0/1 in SQLite). Use for flags and toggles.
- **enumeration** -- A fixed set of allowed string values. Great for statuses, categories, roles.
- **uid** -- URL-friendly unique identifier. Often generated from another field like `title`.
- **json** -- Arbitrary JSON, stored as `TEXT`. Useful for flexible or nested data.

## Step 2 -- Create Articles

```bash
# Create an article with all fields populated
curl -X POST http://localhost:1337/api/articles \
  -H "Content-Type: application/json" \
  -d '{
    "data": {
      "title": "Getting Started with APIck",
      "slug": "getting-started",
      "content": "<p>APIck is a headless CMS...</p>",
      "excerpt": "A quick introduction to APIck CMS.",
      "views": 0,
      "featured": true,
      "category": "tutorial",
      "metadata": "{\"seo\": {\"keywords\": [\"cms\", \"api\"]}}"
    }
  }'
```

The response wraps the created document in the standard envelope:

```json
{
  "data": {
    "id": 1,
    "document_id": "abc123...",
    "title": "Getting Started with APIck",
    "slug": "getting-started",
    "content": "<p>APIck is a headless CMS...</p>",
    "excerpt": "A quick introduction to APIck CMS.",
    "views": 0,
    "featured": true,
    "category": "tutorial",
    "metadata": "{\"seo\": {\"keywords\": [\"cms\", \"api\"]}}",
    "created_at": "2026-03-03T...",
    "updated_at": "2026-03-03T..."
  },
  "meta": {}
}
```

## Step 3 -- Sorting

Pass a `sort` query parameter in the format `field:direction` where direction is `asc` or `desc`.

```bash
# Sort by title A-Z
curl "http://localhost:1337/api/articles?sort=title:asc"

# Sort by views, highest first
curl "http://localhost:1337/api/articles?sort=views:desc"
```

## Step 4 -- Pagination

APIck supports two pagination styles:

### Page-Based Pagination

Use `page` and `pageSize` query parameters.

```bash
# First page, 2 items per page
curl "http://localhost:1337/api/articles?page=1&pageSize=2"
```

Response includes pagination metadata:

```json
{
  "data": [ ... ],
  "meta": {
    "pagination": {
      "page": 1,
      "pageSize": 2,
      "pageCount": 3,
      "total": 5
    }
  }
}
```

### Offset-Based Pagination

Use `start` (zero-based offset) and `limit`.

```bash
# Skip first 2 items, return next 3
curl "http://localhost:1337/api/articles?start=2&limit=3"
```

Response:

```json
{
  "data": [ ... ],
  "meta": {
    "pagination": {
      "start": 2,
      "limit": 3,
      "total": 5
    }
  }
}
```

### Default Behavior

When no pagination parameters are provided, the response still includes pagination metadata with default values for `page`, `pageSize`, `pageCount`, and `total`.

## Step 5 -- Combining Sort and Pagination

Sort and pagination compose naturally:

```bash
# Most-viewed articles, page 1 of 3
curl "http://localhost:1337/api/articles?sort=views:desc&page=1&pageSize=3"
```

## Running Tests

From this tutorial directory:

```bash
npx vitest run
```

The test suite seeds five articles and verifies:

1. All eight field types are stored and retrieved correctly.
2. Ascending sort by `title` returns alphabetical order.
3. Descending sort by `views` returns highest-first order.
4. Page-based pagination returns the correct page size and metadata.
5. Offset-based pagination returns the correct slice.
6. The last page contains only the remaining items.
7. Default pagination metadata is always present.

## Key Takeaways

- APIck supports a rich set of scalar field types out of the box. Each maps to an appropriate SQLite column type.
- The `enumeration` type restricts values to a predefined set -- useful for categories, statuses, and roles.
- The `json` type allows flexible nested data without needing relations or components.
- Sorting and pagination are first-class query parameters on every collection endpoint.
- Pagination metadata (`total`, `pageCount`, `page`, `pageSize`) is always returned, even when no pagination parameters are explicitly passed.

## Next Steps

Continue to [Tutorial 03: Draft and Publish](../03-draft-and-publish/) to learn how `draftAndPublish: true` adds draft/publish workflow to your content types.
