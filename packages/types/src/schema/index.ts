/**
 * Schema attribute types for content modeling.
 * Maps to the 17 scalar + 5 special field types.
 */

export namespace Schema {
  export namespace Attribute {
    // --- Common Options ---
    export interface BaseOptions {
      required?: boolean;
      unique?: boolean;
      default?: any;
      private?: boolean;
      configurable?: boolean;
      pluginOptions?: Record<string, any>;
    }

    // --- Scalar Types (17) ---
    export interface String extends BaseOptions {
      type: 'string';
      minLength?: number;
      maxLength?: number;
      regex?: string;
    }

    export interface Text extends BaseOptions {
      type: 'text';
      minLength?: number;
      maxLength?: number;
    }

    export interface RichText extends BaseOptions {
      type: 'richtext';
      minLength?: number;
      maxLength?: number;
    }

    export interface Blocks extends BaseOptions {
      type: 'blocks';
    }

    export interface Email extends BaseOptions {
      type: 'email';
    }

    export interface Password extends BaseOptions {
      type: 'password';
      minLength?: number;
      maxLength?: number;
    }

    export interface UID extends BaseOptions {
      type: 'uid';
      targetField?: string;
      options?: { separator?: string; lowercase?: boolean };
    }

    export interface Integer extends BaseOptions {
      type: 'integer';
      min?: number;
      max?: number;
    }

    export interface BigInteger extends BaseOptions {
      type: 'biginteger';
      min?: string;
      max?: string;
    }

    export interface Float extends BaseOptions {
      type: 'float';
      min?: number;
      max?: number;
    }

    export interface Decimal extends BaseOptions {
      type: 'decimal';
      min?: number;
      max?: number;
    }

    export interface Boolean extends BaseOptions {
      type: 'boolean';
    }

    export interface Date extends BaseOptions {
      type: 'date';
    }

    export interface Time extends BaseOptions {
      type: 'time';
    }

    export interface DateTime extends BaseOptions {
      type: 'datetime';
    }

    export interface Enumeration extends BaseOptions {
      type: 'enumeration';
      enum: string[];
    }

    export interface Json extends BaseOptions {
      type: 'json';
    }

    // --- Special Types (5) ---
    export interface Media extends BaseOptions {
      type: 'media';
      multiple?: boolean;
      allowedTypes?: Array<'images' | 'videos' | 'files' | 'audios'>;
    }

    export interface Relation extends BaseOptions {
      type: 'relation';
      relation: 'oneToOne' | 'oneToMany' | 'manyToOne' | 'manyToMany' | 'morphToOne' | 'morphToMany' | 'morphOne' | 'morphMany';
      target: string;
      inversedBy?: string;
      mappedBy?: string;
    }

    export interface Component extends BaseOptions {
      type: 'component';
      component: string;
      repeatable?: boolean;
      min?: number;
      max?: number;
    }

    export interface DynamicZone extends BaseOptions {
      type: 'dynamiczone';
      components: string[];
    }

    export interface CustomField extends BaseOptions {
      type: 'customField';
      customField: string;
      options?: Record<string, any>;
    }

    // --- Union of all attribute types ---
    export type AnyAttribute =
      | String
      | Text
      | RichText
      | Blocks
      | Email
      | Password
      | UID
      | Integer
      | BigInteger
      | Float
      | Decimal
      | Boolean
      | Date
      | Time
      | DateTime
      | Enumeration
      | Json
      | Media
      | Relation
      | Component
      | DynamicZone
      | CustomField;

    /** Required marker */
    export interface Required {
      required: true;
    }
  }
}
