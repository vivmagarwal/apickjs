/**
 * Permissions Engine — CASL-inspired attribute-based access control.
 *
 * This module implements:
 *   - Ability building from permission records
 *   - Action/subject permission checks
 *   - Field-level permission checks
 *   - Condition-based permissions (e.g., "own content only")
 *   - Template variable interpolation (e.g., {{ user.id }})
 *   - Permission sanitization for queries, input, and output
 *
 * No external CASL dependency — self-contained implementation.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * A permission record as stored in the database.
 */
export interface Permission {
  action: string;
  subject: string | null;
  properties?: {
    fields?: string[];
  } | null;
  conditions?: Record<string, any>[] | null;
}

/**
 * A condition handler resolves a condition name into a filter object.
 */
export type ConditionHandler = (user: any) => Record<string, any>;

/**
 * Options for building an ability.
 */
export interface AbilityOptions {
  /** Map of condition names to handler functions */
  conditionHandlers?: Record<string, ConditionHandler>;
  /** The authenticated user object */
  user?: any;
}

/**
 * Internal rule compiled from a Permission record.
 */
interface AbilityRule {
  action: string;
  subject: string | null;
  fields: string[] | null;
  conditions: Record<string, any> | null;
}

/**
 * The Ability instance returned by generateAbility().
 */
export interface Ability {
  /** Check if an action is allowed on a subject, optionally for a specific field. */
  can(action: string, subject?: string | null, field?: string): boolean;
  /** Check if an action is denied on a subject. */
  cannot(action: string, subject?: string | null, field?: string): boolean;
  /** Get all fields allowed for an action on a subject. Returns null if unrestricted. */
  allowedFields(action: string, subject?: string | null): string[] | null;
  /** Get the resolved conditions for an action on a subject. Returns null if no conditions. */
  getConditions(action: string, subject?: string | null): Record<string, any> | null;
  /** Get the raw rules. */
  rules: AbilityRule[];
}

// ---------------------------------------------------------------------------
// Template interpolation
// ---------------------------------------------------------------------------

/**
 * Interpolates template variables like {{ user.id }} in a value.
 * Supports nested property paths.
 */
function interpolate(value: any, context: Record<string, any>): any {
  if (typeof value === 'string') {
    const match = value.match(/^\{\{\s*(.+?)\s*\}\}$/);
    if (match) {
      const path = match[1];
      return getNestedValue(context, path);
    }
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((v) => interpolate(v, context));
  }

  if (value !== null && typeof value === 'object') {
    const result: Record<string, any> = {};
    for (const [k, v] of Object.entries(value)) {
      result[k] = interpolate(v, context);
    }
    return result;
  }

  return value;
}

/**
 * Gets a nested value from an object by dot-separated path.
 */
function getNestedValue(obj: any, path: string): any {
  const keys = path.split('.');
  let current = obj;
  for (const key of keys) {
    if (current == null) return undefined;
    current = current[key];
  }
  return current;
}

// ---------------------------------------------------------------------------
// Condition evaluation (sift-like)
// ---------------------------------------------------------------------------

/**
 * Evaluates MongoDB-style conditions against an entity.
 * Supports: $eq, $ne, $in, $nin, $lt, $lte, $gt, $gte, $exists, $and, $or, $regex.
 */
export function matchConditions(entity: Record<string, any>, conditions: Record<string, any>): boolean {
  for (const [key, value] of Object.entries(conditions)) {
    // Logical operators
    if (key === '$and') {
      if (!Array.isArray(value)) return false;
      if (!value.every((cond: any) => matchConditions(entity, cond))) return false;
      continue;
    }
    if (key === '$or') {
      if (!Array.isArray(value)) return false;
      if (!value.some((cond: any) => matchConditions(entity, cond))) return false;
      continue;
    }

    // Field-level condition
    const fieldValue = getNestedValue(entity, key);

    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      // Operator-based condition
      for (const [op, opVal] of Object.entries(value)) {
        if (!evaluateOperator(fieldValue, op, opVal)) return false;
      }
    } else {
      // Direct equality
      if (fieldValue !== value) return false;
    }
  }
  return true;
}

function evaluateOperator(fieldValue: any, op: string, opVal: any): boolean {
  switch (op) {
    case '$eq': return fieldValue === opVal;
    case '$ne': return fieldValue !== opVal;
    case '$in': return Array.isArray(opVal) && opVal.includes(fieldValue);
    case '$nin': return Array.isArray(opVal) && !opVal.includes(fieldValue);
    case '$lt': return fieldValue < opVal;
    case '$lte': return fieldValue <= opVal;
    case '$gt': return fieldValue > opVal;
    case '$gte': return fieldValue >= opVal;
    case '$exists': return opVal ? fieldValue !== undefined && fieldValue !== null : fieldValue === undefined || fieldValue === null;
    case '$regex': {
      const regex = opVal instanceof RegExp ? opVal : new RegExp(opVal);
      return typeof fieldValue === 'string' && regex.test(fieldValue);
    }
    default: return true;
  }
}

// ---------------------------------------------------------------------------
// Ability builder
// ---------------------------------------------------------------------------

/**
 * Generates an Ability instance from permission records.
 *
 * @param permissions - Array of permission records
 * @param options - Condition handlers and user context
 * @returns An Ability instance for authorization checks
 *
 * @example
 *   const ability = generateAbility(permissions, {
 *     conditionHandlers: {
 *       isCreator: (user) => ({ createdBy: { id: user.id } }),
 *     },
 *     user: currentUser,
 *   });
 *
 *   ability.can('read', 'api::article.article'); // true/false
 *   ability.can('update', 'api::article.article', 'title'); // field check
 */
export function generateAbility(permissions: Permission[], options?: AbilityOptions): Ability {
  const conditionHandlers = options?.conditionHandlers || {};
  const user = options?.user || {};
  const rules: AbilityRule[] = [];

  for (const perm of permissions) {
    const fields = perm.properties?.fields || null;

    // Resolve conditions
    let conditions: Record<string, any> | null = null;
    if (perm.conditions && perm.conditions.length > 0) {
      const resolvedConditions: Record<string, any>[] = [];
      for (const cond of perm.conditions) {
        if (typeof cond === 'string') {
          // Named condition — resolve via handler
          const handler = conditionHandlers[cond];
          if (handler) {
            resolvedConditions.push(handler(user));
          }
        } else if (typeof cond === 'object') {
          // Inline condition — interpolate template variables
          resolvedConditions.push(interpolate(cond, { user }));
        }
      }

      if (resolvedConditions.length === 1) {
        conditions = resolvedConditions[0];
      } else if (resolvedConditions.length > 1) {
        conditions = { $and: resolvedConditions };
      }
    }

    rules.push({
      action: perm.action,
      subject: perm.subject,
      fields,
      conditions,
    });
  }

  return createAbility(rules);
}

/**
 * Creates an Ability instance from compiled rules.
 */
function createAbility(rules: AbilityRule[]): Ability {
  function can(action: string, subject?: string | null, field?: string): boolean {
    for (const rule of rules) {
      // Check action match
      if (rule.action !== action) continue;

      // Check subject match (null subject means "all subjects")
      if (rule.subject !== null && subject !== undefined && subject !== null && rule.subject !== subject) continue;

      // Check field match
      if (field && rule.fields !== null) {
        if (!rule.fields.includes(field)) continue;
      }

      // Rule matches
      return true;
    }
    return false;
  }

  function cannot(action: string, subject?: string | null, field?: string): boolean {
    return !can(action, subject, field);
  }

  function allowedFields(action: string, subject?: string | null): string[] | null {
    const matchingFields: Set<string> = new Set();
    let hasUnrestricted = false;

    for (const rule of rules) {
      if (rule.action !== action) continue;
      if (rule.subject !== null && subject !== undefined && subject !== null && rule.subject !== subject) continue;

      if (rule.fields === null) {
        hasUnrestricted = true;
      } else {
        for (const f of rule.fields) {
          matchingFields.add(f);
        }
      }
    }

    if (hasUnrestricted) return null; // null means unrestricted
    if (matchingFields.size === 0) return []; // no matching rules
    return Array.from(matchingFields);
  }

  function getConditions(action: string, subject?: string | null): Record<string, any> | null {
    const conditions: Record<string, any>[] = [];
    for (const rule of rules) {
      if (rule.action !== action) continue;
      if (rule.subject !== null && subject !== undefined && subject !== null && rule.subject !== subject) continue;
      if (rule.conditions) {
        conditions.push(rule.conditions);
      }
    }

    if (conditions.length === 0) return null;
    if (conditions.length === 1) return conditions[0];
    return { $or: conditions };
  }

  return { can, cannot, allowedFields, getConditions, rules };
}

// ---------------------------------------------------------------------------
// Batch check
// ---------------------------------------------------------------------------

/**
 * Checks multiple action/subject pairs at once.
 *
 * @returns An array of booleans corresponding to each check.
 */
export function checkMany(
  ability: Ability,
  checks: Array<{ action: string; subject?: string | null }>,
): boolean[] {
  return checks.map((c) => ability.can(c.action, c.subject));
}

// ---------------------------------------------------------------------------
// Sanitization helpers
// ---------------------------------------------------------------------------

/**
 * Sanitizes output data by removing fields the user cannot read.
 */
export function sanitizeOutput(
  ability: Ability,
  action: string,
  subject: string,
  data: Record<string, any>,
): Record<string, any> {
  const fields = ability.allowedFields(action, subject);
  if (fields === null) return data; // unrestricted

  const result: Record<string, any> = {};
  for (const field of fields) {
    if (field in data) {
      result[field] = data[field];
    }
  }

  // Always include system fields
  const systemFields = ['id', 'documentId', 'createdAt', 'updatedAt', 'publishedAt', 'locale'];
  for (const sf of systemFields) {
    if (sf in data) {
      result[sf] = data[sf];
    }
  }

  return result;
}

/**
 * Sanitizes input data by removing fields the user cannot write.
 */
export function sanitizeInput(
  ability: Ability,
  action: string,
  subject: string,
  data: Record<string, any>,
): Record<string, any> {
  const fields = ability.allowedFields(action, subject);
  if (fields === null) return data; // unrestricted

  const result: Record<string, any> = {};
  for (const field of fields) {
    if (field in data) {
      result[field] = data[field];
    }
  }

  return result;
}

/**
 * Sanitizes query params by removing fields the user cannot access.
 */
export function sanitizeQuery(
  ability: Ability,
  action: string,
  subject: string,
  query: Record<string, any>,
): Record<string, any> {
  const result = { ...query };

  // Sanitize fields param
  if (result.fields && Array.isArray(result.fields)) {
    const allowed = ability.allowedFields(action, subject);
    if (allowed !== null) {
      result.fields = result.fields.filter((f: string) => allowed.includes(f));
    }
  }

  // Add conditions to filters if any
  const conditions = ability.getConditions(action, subject);
  if (conditions) {
    result.filters = result.filters
      ? { $and: [result.filters, conditions] }
      : conditions;
  }

  return result;
}
