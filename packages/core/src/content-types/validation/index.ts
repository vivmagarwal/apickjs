/**
 * Zod schema auto-generation from content type definitions.
 *
 * Maps every attribute type + options to Zod validators.
 * Generates input schemas (create/update) and query schemas.
 */

import { z, type ZodTypeAny, type ZodObject, type ZodRawShape } from 'zod';
import type { AttributeDefinition } from '../index.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GeneratedSchemas {
  /** Validation schema for create requests */
  create: ZodObject<any>;
  /** Validation schema for update requests (all fields optional) */
  update: ZodObject<any>;
}

interface SchemaContext {
  /** Component schemas for resolving nested components */
  componentSchemas?: Map<string, Record<string, AttributeDefinition>>;
  /** Custom field registry for resolving custom field validation */
  customFieldSchemas?: Map<string, (field: any) => ZodTypeAny>;
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Generates Zod schemas for a content type from its attribute definitions.
 */
export function generateSchemas(
  attributes: Record<string, AttributeDefinition>,
  context?: SchemaContext,
): GeneratedSchemas {
  const shape: ZodRawShape = {};

  for (const [name, attr] of Object.entries(attributes)) {
    // Skip system fields — they're managed by the framework
    if (isSystemField(name)) continue;
    // Skip private fields in input schemas
    if (attr.private) continue;

    const fieldSchema = attributeToZod(name, attr, context);
    shape[name] = fieldSchema;
  }

  const createSchema = z.object(shape);

  // Update schema: all fields optional
  const updateShape: ZodRawShape = {};
  for (const [name, schema] of Object.entries(shape)) {
    updateShape[name] = (schema as ZodTypeAny).optional();
  }
  const updateSchema = z.object(updateShape);

  return {
    create: createSchema,
    update: updateSchema,
  };
}

/**
 * Generates a Zod schema for query filter parameters.
 */
export function generateQuerySchema(
  attributes: Record<string, AttributeDefinition>,
): ZodObject<any> {
  const filterShape: ZodRawShape = {};

  for (const [name, attr] of Object.entries(attributes)) {
    if (attr.private) continue;
    if (attr.type === 'password') continue;
    if (['component', 'dynamiczone'].includes(attr.type)) continue;

    filterShape[name] = generateFilterFieldSchema(attr).optional();
  }

  return z.object({
    filters: z.object(filterShape).optional(),
    sort: z.union([
      z.string(),
      z.array(z.string()),
      z.record(z.enum(['asc', 'desc'])),
    ]).optional(),
    fields: z.array(z.string()).optional(),
    populate: z.union([
      z.string(),
      z.array(z.string()),
      z.record(z.any()),
    ]).optional(),
    pagination: z.object({
      page: z.number().int().positive().optional(),
      pageSize: z.number().int().positive().max(100).optional(),
      start: z.number().int().nonnegative().optional(),
      limit: z.number().int().positive().max(100).optional(),
    }).optional(),
    status: z.enum(['published', 'draft']).optional(),
    locale: z.string().optional(),
  });
}

// ---------------------------------------------------------------------------
// Attribute → Zod mapping
// ---------------------------------------------------------------------------

function attributeToZod(
  name: string,
  attr: AttributeDefinition,
  context?: SchemaContext,
): ZodTypeAny {
  let schema: ZodTypeAny;

  switch (attr.type) {
    case 'string':
    case 'text':
    case 'richtext':
    case 'uid':
      schema = buildStringSchema(attr);
      break;

    case 'email':
      schema = z.string().email();
      if (attr.maxLength) schema = (schema as any).max(attr.maxLength);
      break;

    case 'password':
      schema = z.string();
      if (attr.minLength) schema = (schema as any).min(attr.minLength);
      if (attr.maxLength) schema = (schema as any).max(attr.maxLength);
      break;

    case 'integer':
      schema = z.number().int();
      if (attr.min !== undefined) schema = (schema as any).min(attr.min);
      if (attr.max !== undefined) schema = (schema as any).max(attr.max);
      break;

    case 'biginteger':
      schema = z.string(); // String in JSON to avoid precision loss
      break;

    case 'float':
    case 'decimal':
      schema = z.number();
      if (attr.min !== undefined) schema = (schema as any).min(attr.min);
      if (attr.max !== undefined) schema = (schema as any).max(attr.max);
      break;

    case 'boolean':
      schema = z.boolean();
      break;

    case 'date':
      schema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected date format YYYY-MM-DD');
      break;

    case 'time':
      schema = z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, 'Expected time format HH:mm or HH:mm:ss');
      break;

    case 'datetime':
      schema = z.string().datetime();
      break;

    case 'enumeration':
      if (attr.enum && attr.enum.length > 0) {
        schema = z.enum(attr.enum as [string, ...string[]]);
      } else {
        schema = z.string();
      }
      break;

    case 'json':
    case 'blocks':
      schema = z.unknown();
      break;

    case 'media':
      schema = attr.multiple
        ? z.array(z.number().int().positive())
        : z.number().int().positive();
      break;

    case 'relation':
      schema = buildRelationSchema(attr);
      break;

    case 'component':
      schema = buildComponentSchema(attr, context);
      break;

    case 'dynamiczone':
      schema = buildDynamicZoneSchema(attr, context);
      break;

    case 'customField':
      schema = buildCustomFieldSchema(attr, context);
      break;

    default:
      schema = z.unknown();
      break;
  }

  // Apply common modifiers
  if (attr.default !== undefined) {
    schema = schema.default(attr.default);
  }

  if (!attr.required) {
    schema = schema.optional().nullable();
  }

  return schema;
}

// ---------------------------------------------------------------------------
// Builder helpers
// ---------------------------------------------------------------------------

function buildStringSchema(attr: AttributeDefinition): ZodTypeAny {
  let schema = z.string();
  if (attr.minLength) schema = schema.min(attr.minLength);
  if (attr.maxLength) schema = schema.max(attr.maxLength);
  if (attr.regex) schema = schema.regex(new RegExp(attr.regex));
  return schema;
}

function buildRelationSchema(attr: AttributeDefinition): ZodTypeAny {
  const toMany = attr.relation === 'oneToMany' ||
    attr.relation === 'manyToMany' ||
    attr.relation === 'morphToMany' ||
    attr.relation === 'morphMany';

  if (toMany) {
    // Accept array of IDs or connect/disconnect object
    return z.union([
      z.array(z.number().int().positive()),
      z.object({
        connect: z.array(z.object({ id: z.number().int().positive() })).optional(),
        disconnect: z.array(z.object({ id: z.number().int().positive() })).optional(),
      }),
    ]);
  }

  // To-one: accept single ID or null
  return z.number().int().positive().nullable();
}

function buildComponentSchema(
  attr: AttributeDefinition,
  context?: SchemaContext,
): ZodTypeAny {
  const componentUid = attr.component;
  if (!componentUid) return z.unknown();

  // Try to resolve the component schema
  const componentAttrs = context?.componentSchemas?.get(componentUid);
  if (componentAttrs) {
    const shape: ZodRawShape = {};
    for (const [name, fieldAttr] of Object.entries(componentAttrs)) {
      shape[name] = attributeToZod(name, fieldAttr, context);
    }
    const componentObj = z.object(shape);

    if (attr.repeatable) {
      let arraySchema = z.array(componentObj);
      if (attr.min !== undefined) arraySchema = arraySchema.min(attr.min);
      if (attr.max !== undefined) arraySchema = arraySchema.max(attr.max);
      return arraySchema;
    }
    return componentObj;
  }

  // Fallback: unresolved component
  return attr.repeatable ? z.array(z.record(z.unknown())) : z.record(z.unknown());
}

function buildDynamicZoneSchema(
  attr: AttributeDefinition,
  context?: SchemaContext,
): ZodTypeAny {
  const componentUids = attr.components || [];

  if (componentUids.length > 0 && context?.componentSchemas) {
    const discriminatedSchemas: z.ZodTypeAny[] = [];

    for (const uid of componentUids) {
      const componentAttrs = context.componentSchemas.get(uid);
      if (componentAttrs) {
        const shape: ZodRawShape = { __component: z.literal(uid) };
        for (const [name, fieldAttr] of Object.entries(componentAttrs)) {
          shape[name] = attributeToZod(name, fieldAttr, context);
        }
        discriminatedSchemas.push(z.object(shape));
      }
    }

    if (discriminatedSchemas.length > 0) {
      let arraySchema = z.array(
        z.discriminatedUnion('__component', discriminatedSchemas as [any, any, ...any[]]),
      );
      if (attr.min !== undefined) arraySchema = arraySchema.min(attr.min);
      if (attr.max !== undefined) arraySchema = arraySchema.max(attr.max);
      return arraySchema;
    }
  }

  // Fallback
  let arraySchema = z.array(z.object({ __component: z.string() }).passthrough());
  if (attr.min !== undefined) arraySchema = arraySchema.min(attr.min);
  if (attr.max !== undefined) arraySchema = arraySchema.max(attr.max);
  return arraySchema;
}

function buildCustomFieldSchema(
  attr: AttributeDefinition,
  context?: SchemaContext,
): ZodTypeAny {
  const uid = attr.customField;
  if (uid && context?.customFieldSchemas?.has(uid)) {
    return context.customFieldSchemas.get(uid)!(attr);
  }
  // Fallback to unknown
  return z.unknown();
}

// ---------------------------------------------------------------------------
// Filter schema for a single field
// ---------------------------------------------------------------------------

function generateFilterFieldSchema(attr: AttributeDefinition): ZodTypeAny {
  const baseSchema = getFilterBaseType(attr);

  return z.union([
    baseSchema, // Direct equality
    z.object({
      $eq: baseSchema.optional(),
      $ne: baseSchema.optional(),
      $gt: baseSchema.optional(),
      $gte: baseSchema.optional(),
      $lt: baseSchema.optional(),
      $lte: baseSchema.optional(),
      $in: z.array(baseSchema).optional(),
      $notIn: z.array(baseSchema).optional(),
      $contains: z.string().optional(),
      $containsi: z.string().optional(),
      $notContains: z.string().optional(),
      $startsWith: z.string().optional(),
      $endsWith: z.string().optional(),
      $null: z.boolean().optional(),
      $notNull: z.boolean().optional(),
      $between: z.tuple([baseSchema, baseSchema]).optional(),
    }).partial(),
  ]);
}

function getFilterBaseType(attr: AttributeDefinition): ZodTypeAny {
  switch (attr.type) {
    case 'integer':
    case 'biginteger':
    case 'float':
    case 'decimal':
      return z.number();
    case 'boolean':
      return z.boolean();
    default:
      return z.union([z.string(), z.number(), z.null()]);
  }
}

// ---------------------------------------------------------------------------
// System field check
// ---------------------------------------------------------------------------

const SYSTEM_FIELDS = new Set([
  'id', 'documentId', 'createdAt', 'updatedAt',
  'publishedAt', 'firstPublishedAt', 'createdBy', 'updatedBy', 'locale',
]);

function isSystemField(name: string): boolean {
  return SYSTEM_FIELDS.has(name);
}
