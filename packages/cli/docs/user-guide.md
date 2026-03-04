# APICK CLI User Guide

## Getting Started

### Create a New Project

```bash
npx apick new my-project
cd my-project
npm install
npx apick develop
```

The `new` command walks you through project setup interactively:
- Project name
- Database type (SQLite, PostgreSQL, MySQL)
- Server port

### Start Development Server

```bash
npx apick develop    # or: npx apick dev
```

### Start Production Server

```bash
npx apick start
```

---

## Command Reference

### Project Commands

| Command | Description |
|---------|-------------|
| `new [name]` | Create a new APICK project |
| `develop` / `dev` | Start the development server |
| `start` | Start the production server |
| `build` | Compile TypeScript |

### Generator Commands

| Command | Description |
|---------|-------------|
| `generate:api` | Create a new API (content type + controller + service + routes) |
| `generate:controller` | Create a new controller |
| `generate:service` | Create a new service |
| `generate:policy` | Create a new policy |
| `generate:middleware` | Create a new middleware |
| `generate:plugin` | Create a new plugin |

### Introspection Commands

| Command | Description |
|---------|-------------|
| `content-types:list` | List all registered content types |
| `routes:list` | List all registered routes |
| `policies:list` | List all registered policies |
| `middlewares:list` | List all registered middlewares |

### Type Generation

| Command | Description |
|---------|-------------|
| `ts:generate-types` | Generate TypeScript interfaces from content type schemas |

### Interactive Console

| Command | Description |
|---------|-------------|
| `console` | Start a REPL with the `apick` instance available |

### Data Transfer

| Command | Description |
|---------|-------------|
| `export` / `transfer:export` | Export data to a tar.gz archive |
| `import` / `transfer:import` | Import data from a tar.gz archive |

### Migration Commands

| Command | Description |
|---------|-------------|
| `migration:run` | Run pending database migrations |
| `migration:rollback` | Rollback the last batch of migrations |
| `migration:status` | Display migration status |
| `migration:generate` | Generate a new migration file |

---

## Interactive API Generation

The `generate:api` command walks you through creating a complete API:

```bash
npx apick generate:api
```

### Walkthrough

1. **API name** — e.g., `product`
2. **Content type kind** — Collection Type (multiple entries) or Single Type (one entry)
3. **Display name** — e.g., `Product`
4. **Plural name** — e.g., `products`
5. **Attributes** — add fields interactively:
   - Choose a field name
   - Select a field type
   - Configure type-specific options
   - Repeat until done

### Field Types

| Type | TS Type | Description |
|------|---------|-------------|
| `string` | `string` | Short text (title, name) |
| `text` | `string` | Long text (description, body) |
| `richtext` | `string` | Rich text with formatting |
| `blocks` | `unknown` | Block-based structured content |
| `integer` | `number` | Whole number |
| `float` | `number` | Decimal number (float) |
| `decimal` | `number` | Precise decimal number |
| `boolean` | `boolean` | True or false |
| `date` | `string` | Date only (YYYY-MM-DD) |
| `time` | `string` | Time only (HH:mm:ss) |
| `datetime` | `string` | Date and time |
| `email` | `string` | Email address |
| `password` | `string` | Hashed password |
| `uid` | `string` | URL-friendly identifier (slug) |
| `enumeration` | union | One of a fixed set of values |
| `json` | `unknown` | Arbitrary JSON data |
| `media` | `unknown` | File upload (images, videos, etc.) |
| `relation` | `unknown` | Link to another content type |
| `component` | `unknown` | Reusable component reference |
| `dynamiczone` | `unknown[]` | Multiple component types |
| `customField` | `unknown` | Plugin-defined custom field |

### Generated Files

For `npx apick generate:api` with name `product`:

```
src/api/product/
  content-type.ts          # Schema definition
  controllers/product.ts   # Request handlers
  services/product.ts      # Business logic
  routes/product.ts        # Route definitions
```

### Auto-Generated REST Endpoints

After generating and starting the server:

```
GET    /api/products       # List all
GET    /api/products/:id   # Get one
POST   /api/products       # Create
PUT    /api/products/:id   # Update
DELETE /api/products/:id   # Delete
```

---

## Type Generation

Generate TypeScript interfaces from your content type schemas:

```bash
npx apick ts:generate-types
```

Output is written to `types/generated/contentTypes.d.ts`.

Example output:

```typescript
export interface Article {
  id: number;
  title: string;
  slug?: string;
  content?: string;
  views?: number;
  featured?: boolean;
  category?: 'news' | 'tutorial' | 'opinion' | 'release';
}
```

---

## Tips

- Use `--name` or `-n` flag to skip the name prompt: `npx apick generate:api -n product`
- All commands support `--help` for usage information: `npx apick build --help`
- Use `npx apick help` to see all available commands
- Use `npx apick --version` to check your CLI version
