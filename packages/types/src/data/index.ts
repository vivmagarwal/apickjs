/**
 * Data types for entities and content types.
 */

/** Base entity fields present on all documents */
export interface Entity {
  id: number;
  documentId: string;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  firstPublishedAt?: string | null;
  createdBy?: any;
  updatedBy?: any;
  locale?: string;
  [key: string]: any;
}

/** Content type definition metadata */
export interface ContentTypeDefinition {
  uid: string;
  kind: 'collectionType' | 'singleType';
  collectionName: string;
  info: ContentTypeInfo;
  options: ContentTypeOptions;
  pluginOptions?: Record<string, any>;
  attributes: Record<string, any>;
}

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
    type?: 'unique';
  }>;
}

/** Component definition metadata */
export interface ComponentDefinition {
  uid: string;
  category: string;
  collectionName: string;
  info: {
    displayName: string;
    description?: string;
    icon?: string;
  };
  attributes: Record<string, any>;
}

/** Pagination metadata */
export interface PaginationMeta {
  page: number;
  pageSize: number;
  pageCount: number;
  total: number;
}

/** Standard API response format */
export interface ApiResponse<T = any> {
  data: T;
  meta?: {
    pagination?: PaginationMeta;
    [key: string]: any;
  };
}

/** Standard error response format */
export interface ApiErrorResponse {
  data: null;
  error: {
    status: number;
    name: string;
    message: string;
    details?: Record<string, any>;
  };
}
