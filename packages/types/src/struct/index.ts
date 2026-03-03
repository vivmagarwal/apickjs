/**
 * Struct types for content type schemas.
 */

import type { Schema } from '../schema/index.js';

/** Base schema structure */
export interface BaseSchema {
  uid: string;
  collectionName: string;
  info: {
    singularName: string;
    pluralName: string;
    displayName: string;
    description?: string;
  };
  pluginOptions?: Record<string, any>;
  attributes: Record<string, Schema.Attribute.AnyAttribute>;
}

/** Collection type schema (has multiple entries) */
export interface CollectionTypeSchema extends BaseSchema {
  kind: 'collectionType';
  options: {
    draftAndPublish?: boolean;
    populateCreatorFields?: boolean;
    indexes?: Array<{
      name: string;
      columns: string[];
      type?: 'unique';
    }>;
  };
}

/** Single type schema (has exactly one entry) */
export interface SingleTypeSchema extends BaseSchema {
  kind: 'singleType';
  options: {
    draftAndPublish?: boolean;
    populateCreatorFields?: boolean;
  };
}

/** Component schema (embeddable in content types) */
export interface ComponentSchema {
  uid: string;
  category: string;
  collectionName: string;
  info: {
    displayName: string;
    description?: string;
    icon?: string;
  };
  pluginOptions?: Record<string, any>;
  attributes: Record<string, Schema.Attribute.AnyAttribute>;
}
