# Tutorial 03: Draft and Publish

## What You'll Build

An **Article API** with a full draft/publish workflow. Content starts as a draft, can be published to make it publicly visible, and can be unpublished to revert it back to draft status.

## Key Concept: `draftAndPublish`

When you set `draftAndPublish: true` in your content type options, Apick automatically adds a `published_at` field to your entries and manages their visibility based on publication status.

```typescript
// src/api/article/content-type.ts
export default {
  kind: 'collectionType' as const,
  info: {
    singularName: 'article',
    pluralName: 'articles',
    displayName: 'Article',
  },
  options: { draftAndPublish: true },
  attributes: {
    title: { type: 'string', required: true },
    content: { type: 'richtext' },
  },
};
```

With this option enabled:

- **`published_at`** is `null` for drafts and set to a timestamp for published entries.
- **Default GET** requests only return published entries (`published_at IS NOT NULL`).
- **Draft entries** are hidden unless you explicitly request them.

---

## Step-by-Step Workflow

### 1. Creating a Draft (Default Behavior)

By default, `POST` creates a **draft** entry with `published_at: null`.

```bash
curl -X POST http://localhost:1337/api/articles \
  -H "Content-Type: application/json" \
  -d '{
    "data": {
      "title": "My First Article",
      "content": "This is a work in progress."
    }
  }'
```

**Response:**
```json
{
  "data": {
    "document_id": "abc123",
    "title": "My First Article",
    "content": "This is a work in progress.",
    "published_at": null,
    "created_at": "2026-03-03T10:00:00.000Z",
    "updated_at": "2026-03-03T10:00:00.000Z"
  }
}
```

Notice `published_at` is `null` -- this entry is a draft.

### 2. Listing Published Entries (Default GET)

A standard GET request returns **only published** entries. Drafts are excluded.

```bash
curl http://localhost:1337/api/articles
```

**Response (no published entries yet):**
```json
{
  "data": [],
  "meta": { "pagination": { "total": 0 } }
}
```

### 3. Querying Drafts with `?status=draft`

To see draft entries, add the `status=draft` query parameter.

```bash
curl "http://localhost:1337/api/articles?status=draft"
```

**Response:**
```json
{
  "data": [
    {
      "document_id": "abc123",
      "title": "My First Article",
      "content": "This is a work in progress.",
      "published_at": null
    }
  ],
  "meta": { "pagination": { "total": 1 } }
}
```

### 4. Creating as Published Directly

You can skip the draft stage by passing `status: 'published'` in the request body.

```bash
curl -X POST http://localhost:1337/api/articles \
  -H "Content-Type: application/json" \
  -d '{
    "data": { "title": "Breaking News" },
    "status": "published"
  }'
```

**Response:**
```json
{
  "data": {
    "document_id": "def456",
    "title": "Breaking News",
    "published_at": "2026-03-03T10:05:00.000Z"
  }
}
```

### 5. Publishing a Draft

Use the `/publish` action endpoint to publish an existing draft.

```bash
curl -X POST http://localhost:1337/api/articles/abc123/publish
```

**Response:**
```json
{
  "data": {
    "document_id": "abc123",
    "title": "My First Article",
    "published_at": "2026-03-03T10:10:00.000Z"
  }
}
```

The article is now visible in default GET requests.

### 6. Unpublishing an Entry

Use the `/unpublish` action endpoint to revert a published entry back to draft.

```bash
curl -X POST http://localhost:1337/api/articles/abc123/unpublish
```

**Response:**
```json
{
  "data": {
    "document_id": "abc123",
    "title": "My First Article",
    "published_at": null
  }
}
```

The article is no longer visible in default GET requests, but can still be found with `?status=draft`.

---

## Full Lifecycle Example

Here is the complete lifecycle of a content entry with draft and publish:

```
  POST /api/articles          -->  Draft created (published_at: null)
  GET  /api/articles           -->  Not visible (drafts excluded)
  GET  /api/articles?status=draft  -->  Visible
  POST /api/articles/:id/publish   -->  Published (published_at set)
  GET  /api/articles           -->  Now visible
  PUT  /api/articles/:id       -->  Update the entry
  POST /api/articles/:id/unpublish -->  Back to draft (published_at: null)
  GET  /api/articles           -->  Not visible again
  DELETE /api/articles/:id     -->  Entry deleted
```

---

## Running the Tests

```bash
npm test
```

The test suite covers:
- Creating drafts (default behavior)
- Draft visibility rules (hidden by default, visible with `?status=draft`)
- Creating entries as published directly
- Publishing a draft via the `/publish` endpoint
- Unpublishing via the `/unpublish` endpoint
- The full create/publish/update/unpublish/delete lifecycle
