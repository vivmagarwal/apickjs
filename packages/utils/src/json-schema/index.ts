/**
 * JSON Schema Generation.
 *
 * Converts APICK content type definitions to JSON Schema (Draft 7),
 * suitable for LLM function-calling, OpenAPI docs, and validation.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface JsonSchema {
  type?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
  enum?: any[];
  format?: string;
  description?: string;
  oneOf?: JsonSchema[];
  $ref?: string;
  definitions?: Record<string, JsonSchema>;
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  default?: any;
  additionalProperties?: boolean | JsonSchema;
  title?: string;
  $schema?: string;
  [key: string]: any;
}

export interface ContentTypeSchema {
  uid: string;
  kind: string;
  info: { singularName: string; pluralName: string; displayName: string; description?: string };
  attributes: Record<string, AttributeDef>;
}

export interface AttributeDef {
  type: string;
  required?: boolean;
  unique?: boolean;
  default?: any;
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  enum?: string[];
  relation?: string;
  target?: string;
  component?: string;
  repeatable?: boolean;
  components?: string[];
  allowedTypes?: string[];
  private?: boolean;
  [key: string]: any;
}

export interface ToolSchema {
  name: string;
  description: string;
  parameters: JsonSchema;
}

// ---------------------------------------------------------------------------
// Attribute → JSON Schema
// ---------------------------------------------------------------------------

function attributeToSchema(name: string, attr: AttributeDef): JsonSchema {
  const schema: JsonSchema = {};

  switch (attr.type) {
    case 'string':
    case 'text':
    case 'richtext':
    case 'email':
    case 'password':
    case 'uid':
      schema.type = 'string';
      if (attr.type === 'email') schema.format = 'email';
      if (attr.minLength) schema.minLength = attr.minLength;
      if (attr.maxLength) schema.maxLength = attr.maxLength;
      break;

    case 'blocks':
      schema.type = 'array';
      schema.items = { type: 'object' };
      schema.description = 'Block-based rich content';
      break;

    case 'integer':
    case 'biginteger':
      schema.type = 'integer';
      if (attr.min !== undefined) schema.minimum = attr.min;
      if (attr.max !== undefined) schema.maximum = attr.max;
      break;

    case 'float':
    case 'decimal':
      schema.type = 'number';
      if (attr.min !== undefined) schema.minimum = attr.min;
      if (attr.max !== undefined) schema.maximum = attr.max;
      break;

    case 'boolean':
      schema.type = 'boolean';
      break;

    case 'date':
      schema.type = 'string';
      schema.format = 'date';
      break;

    case 'time':
      schema.type = 'string';
      schema.format = 'time';
      break;

    case 'datetime':
      schema.type = 'string';
      schema.format = 'date-time';
      break;

    case 'enumeration':
      schema.type = 'string';
      if (attr.enum) schema.enum = attr.enum;
      break;

    case 'json':
      // JSON fields can be anything
      schema.type = 'object';
      schema.additionalProperties = true;
      break;

    case 'media':
      if (attr.multiple) {
        schema.type = 'array';
        schema.items = { type: 'string', format: 'uri', description: 'Media file URL' };
      } else {
        schema.type = 'string';
        schema.format = 'uri';
        schema.description = 'Media file URL';
      }
      break;

    case 'relation':
      // Relations are represented as IDs
      if (['oneToMany', 'manyToMany', 'morphToMany', 'morphMany'].includes(attr.relation ?? '')) {
        schema.type = 'array';
        schema.items = { type: 'string', description: `Document ID referencing ${attr.target || 'related'}` };
      } else {
        schema.type = 'string';
        schema.description = `Document ID referencing ${attr.target || 'related'}`;
      }
      break;

    case 'component':
      if (attr.repeatable) {
        schema.type = 'array';
        schema.items = { type: 'object', description: `Component: ${attr.component || 'unknown'}` };
      } else {
        schema.type = 'object';
        schema.description = `Component: ${attr.component || 'unknown'}`;
      }
      break;

    case 'dynamiczone':
      schema.type = 'array';
      if (attr.components && attr.components.length > 0) {
        schema.items = {
          oneOf: attr.components.map(c => ({
            type: 'object' as const,
            description: `Component: ${c}`,
            properties: { __component: { type: 'string', enum: [c] } },
            required: ['__component'],
          })),
        };
      } else {
        schema.items = { type: 'object' };
      }
      break;

    default:
      schema.type = 'string';
  }

  if (attr.default !== undefined) schema.default = attr.default;

  return schema;
}

// ---------------------------------------------------------------------------
// Content type → JSON Schema
// ---------------------------------------------------------------------------

/**
 * Converts an APICK content type definition to JSON Schema (Draft 7).
 */
export function contentTypeToJsonSchema(contentType: ContentTypeSchema): JsonSchema {
  const properties: Record<string, JsonSchema> = {};
  const required: string[] = [];

  for (const [name, attr] of Object.entries(contentType.attributes)) {
    if (attr.private) continue;
    properties[name] = attributeToSchema(name, attr);
    if (attr.required) required.push(name);
  }

  return {
    $schema: 'http://json-schema.org/draft-07/schema#',
    title: contentType.info.displayName,
    description: contentType.info.description,
    type: 'object',
    properties,
    required: required.length > 0 ? required : undefined,
    additionalProperties: false,
  };
}

/**
 * Converts an APICK content type to LLM function-calling tool schema.
 */
export function contentTypeToToolSchema(
  contentType: ContentTypeSchema,
  options: { operation?: 'create' | 'update' } = {},
): ToolSchema {
  const schema = contentTypeToJsonSchema(contentType);
  const op = options.operation ?? 'create';
  const name = `${op}_${contentType.info.singularName}`;

  return {
    name,
    description: `${op === 'create' ? 'Create' : 'Update'} a ${contentType.info.displayName}`,
    parameters: {
      type: 'object',
      properties: schema.properties,
      required: op === 'create' ? schema.required : undefined,
    },
  };
}

/**
 * Converts a plain attribute map to JSON Schema.
 */
export function attributeMapToJsonSchema(
  attributes: Record<string, AttributeDef>,
  title?: string,
): JsonSchema {
  const properties: Record<string, JsonSchema> = {};
  const required: string[] = [];

  for (const [name, attr] of Object.entries(attributes)) {
    properties[name] = attributeToSchema(name, attr);
    if (attr.required) required.push(name);
  }

  return {
    type: 'object',
    title,
    properties,
    required: required.length > 0 ? required : undefined,
  };
}
