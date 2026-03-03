/**
 * Content Type Definition System.
 *
 * Provides `defineContentType()` and `defineComponent()` factories
 * that validate and normalize content type / component schemas.
 */

import { randomUUID } from 'node:crypto';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ContentTypeInfo {
  singularName: string;
  pluralName: string;
  displayName: string;
  description?: string;
}

export interface ContentTypeOptions {
  draftAndPublish?: boolean;
  populateCreatorFields?: boolean;
  indexes?: Array<{
    name: string;
    columns: string[];
    type?: 'unique' | 'index';
  }>;
}

export interface AttributeDefinition {
  type: string;
  required?: boolean;
  unique?: boolean;
  default?: any;
  private?: boolean;
  configurable?: boolean;
  pluginOptions?: Record<string, any>;
  // String/text options
  minLength?: number;
  maxLength?: number;
  regex?: string;
  // Number options
  min?: number;
  max?: number;
  // Enumeration
  enum?: string[];
  // UID
  targetField?: string;
  // Component
  component?: string;
  repeatable?: boolean;
  // Dynamic zone
  components?: string[];
  // Relation
  relation?: RelationType;
  target?: string;
  inversedBy?: string;
  mappedBy?: string;
  // Media
  multiple?: boolean;
  allowedTypes?: string[];
  // Custom field
  customField?: string;
}

export type RelationType =
  | 'oneToOne'
  | 'oneToMany'
  | 'manyToOne'
  | 'manyToMany'
  | 'morphToOne'
  | 'morphToMany'
  | 'morphOne'
  | 'morphMany';

export interface ContentTypeConfig {
  kind: 'collectionType' | 'singleType';
  collectionName?: string;
  info: ContentTypeInfo;
  options?: ContentTypeOptions;
  pluginOptions?: Record<string, any>;
  attributes: Record<string, AttributeDefinition>;
}

export interface ContentTypeSchema extends ContentTypeConfig {
  uid: string;
  collectionName: string;
  modelType: 'contentType';
  options: ContentTypeOptions;
}

export interface ComponentInfo {
  displayName: string;
  icon?: string;
  description?: string;
}

export interface ComponentConfig {
  collectionName?: string;
  info: ComponentInfo;
  attributes: Record<string, AttributeDefinition>;
}

export interface ComponentSchema extends ComponentConfig {
  uid: string;
  collectionName: string;
  modelType: 'component';
  category: string;
}

// ---------------------------------------------------------------------------
// System fields injected into every content type
// ---------------------------------------------------------------------------

const SYSTEM_ATTRIBUTES: Record<string, AttributeDefinition> = {
  createdAt: { type: 'datetime', required: true },
  updatedAt: { type: 'datetime', required: true },
  publishedAt: { type: 'datetime' },
  firstPublishedAt: { type: 'datetime' },
  createdBy: { type: 'relation', relation: 'oneToOne', target: 'admin::user' },
  updatedBy: { type: 'relation', relation: 'oneToOne', target: 'admin::user' },
  locale: { type: 'string' },
};

// ---------------------------------------------------------------------------
// Allowed field types
// ---------------------------------------------------------------------------

const SCALAR_TYPES = new Set([
  'string', 'text', 'richtext', 'blocks', 'email', 'password', 'uid',
  'integer', 'biginteger', 'float', 'decimal', 'boolean',
  'date', 'time', 'datetime', 'enumeration', 'json',
]);

const SPECIAL_TYPES = new Set([
  'media', 'relation', 'component', 'dynamiczone', 'customField',
]);

const ALL_TYPES = new Set([...SCALAR_TYPES, ...SPECIAL_TYPES]);

// ---------------------------------------------------------------------------
// defineContentType
// ---------------------------------------------------------------------------

export function defineContentType(config: ContentTypeConfig): ContentTypeConfig {
  validateContentTypeConfig(config);
  return config;
}

// ---------------------------------------------------------------------------
// defineComponent
// ---------------------------------------------------------------------------

export function defineComponent(config: ComponentConfig): ComponentConfig {
  validateComponentConfig(config);
  return config;
}

// ---------------------------------------------------------------------------
// Schema normalization (called when registering with the system)
// ---------------------------------------------------------------------------

export function normalizeContentType(
  uid: string,
  config: ContentTypeConfig,
): ContentTypeSchema {
  const collectionName = config.collectionName ||
    config.info.pluralName.replace(/-/g, '_');

  const options: ContentTypeOptions = {
    draftAndPublish: true,
    populateCreatorFields: false,
    ...config.options,
  };

  return {
    ...config,
    uid,
    collectionName,
    modelType: 'contentType',
    options,
    attributes: {
      ...config.attributes,
      ...SYSTEM_ATTRIBUTES,
    },
  };
}

export function normalizeComponent(
  uid: string,
  config: ComponentConfig,
): ComponentSchema {
  const parts = uid.split('.');
  const category = parts[0] || 'default';
  const collectionName = config.collectionName ||
    `components_${category}_${(parts[1] || parts[0]).replace(/-/g, '_')}s`;

  return {
    ...config,
    uid,
    collectionName,
    modelType: 'component',
    category,
  };
}

// ---------------------------------------------------------------------------
// Generate a document ID
// ---------------------------------------------------------------------------

export function generateDocumentId(): string {
  return randomUUID();
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function isScalarType(type: string): boolean {
  return SCALAR_TYPES.has(type);
}

export function isRelationType(type: string): boolean {
  return type === 'relation';
}

export function isComponentType(type: string): boolean {
  return type === 'component';
}

export function isDynamicZoneType(type: string): boolean {
  return type === 'dynamiczone';
}

export function isMediaType(type: string): boolean {
  return type === 'media';
}

export function getScalarTypes(): string[] {
  return [...SCALAR_TYPES];
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function validateContentTypeConfig(config: ContentTypeConfig): void {
  if (!config.info?.singularName) {
    throw new Error('Content type must have info.singularName');
  }
  if (!config.info?.pluralName) {
    throw new Error('Content type must have info.pluralName');
  }
  if (!config.info?.displayName) {
    throw new Error('Content type must have info.displayName');
  }
  if (!config.kind || !['collectionType', 'singleType'].includes(config.kind)) {
    throw new Error('Content type must have kind: "collectionType" or "singleType"');
  }
  if (!config.attributes || typeof config.attributes !== 'object') {
    throw new Error('Content type must have attributes object');
  }

  validateAttributes(config.attributes);
}

function validateComponentConfig(config: ComponentConfig): void {
  if (!config.info?.displayName) {
    throw new Error('Component must have info.displayName');
  }
  if (!config.attributes || typeof config.attributes !== 'object') {
    throw new Error('Component must have attributes object');
  }

  for (const [name, attr] of Object.entries(config.attributes)) {
    if (attr.type === 'dynamiczone') {
      throw new Error(`Components cannot contain dynamic zone fields (field: "${name}")`);
    }
  }

  validateAttributes(config.attributes);
}

function validateAttributes(attributes: Record<string, AttributeDefinition>): void {
  for (const [name, attr] of Object.entries(attributes)) {
    if (!attr.type) {
      throw new Error(`Attribute "${name}" must have a type`);
    }
    if (!ALL_TYPES.has(attr.type)) {
      throw new Error(`Attribute "${name}" has unknown type "${attr.type}"`);
    }

    // Enumeration must have enum array
    if (attr.type === 'enumeration' && (!attr.enum || !Array.isArray(attr.enum) || attr.enum.length === 0)) {
      throw new Error(`Enumeration attribute "${name}" must have non-empty "enum" array`);
    }

    // Relation must have relation type
    if (attr.type === 'relation' && !attr.relation) {
      throw new Error(`Relation attribute "${name}" must have "relation" property`);
    }

    // Component must have component UID
    if (attr.type === 'component' && !attr.component) {
      throw new Error(`Component attribute "${name}" must have "component" property`);
    }

    // Dynamic zone must have components array
    if (attr.type === 'dynamiczone' && (!attr.components || !Array.isArray(attr.components))) {
      throw new Error(`Dynamic zone attribute "${name}" must have "components" array`);
    }

    // Custom field must have customField UID
    if (attr.type === 'customField' && !attr.customField) {
      throw new Error(`Custom field attribute "${name}" must have "customField" property`);
    }
  }
}
