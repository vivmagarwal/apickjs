/**
 * Object utilities: deep merge, dot-notation access.
 */

/**
 * Deep merges source into target.
 * - Arrays are replaced (not merged)
 * - Objects are recursively merged
 * - undefined values are skipped
 * - null removes the key
 */
export function deepMerge<T extends Record<string, any>>(
  target: T,
  source: Record<string, any>,
): T {
  const result = { ...target } as Record<string, any>;

  for (const key of Object.keys(source)) {
    const sourceVal = source[key];

    if (sourceVal === undefined) continue;

    if (sourceVal === null) {
      delete result[key];
      continue;
    }

    if (Array.isArray(sourceVal)) {
      result[key] = [...sourceVal];
      continue;
    }

    if (isPlainObject(sourceVal) && isPlainObject(result[key])) {
      result[key] = deepMerge(result[key], sourceVal);
      continue;
    }

    result[key] = sourceVal;
  }

  return result as T;
}

/**
 * Gets a value from an object using dot-notation path.
 * e.g., dotGet({ a: { b: 1 } }, 'a.b') → 1
 */
export function dotGet<T = any>(obj: Record<string, any>, path: string, defaultValue?: T): T {
  const keys = path.split('.');
  let current: any = obj;

  for (const key of keys) {
    if (current === null || current === undefined) {
      return defaultValue as T;
    }
    current = current[key];
  }

  return (current !== undefined ? current : defaultValue) as T;
}

/**
 * Sets a value on an object using dot-notation path.
 * e.g., dotSet({}, 'a.b', 1) → { a: { b: 1 } }
 */
export function dotSet(obj: Record<string, any>, path: string, value: any): void {
  const keys = path.split('.');
  let current = obj;

  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i]!;
    if (!(key in current) || !isPlainObject(current[key])) {
      current[key] = {};
    }
    current = current[key];
  }

  const lastKey = keys[keys.length - 1]!;
  current[lastKey] = value;
}

/**
 * Checks if a dot-notation path exists on an object.
 */
export function dotHas(obj: Record<string, any>, path: string): boolean {
  const keys = path.split('.');
  let current: any = obj;

  for (const key of keys) {
    if (current === null || current === undefined || !isPlainObject(current)) {
      return false;
    }
    if (!(key in current)) return false;
    current = current[key];
  }

  return true;
}

/**
 * Checks if a value is a plain object (not array, Date, etc.).
 */
export function isPlainObject(value: any): value is Record<string, any> {
  if (value === null || typeof value !== 'object') return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * Deep freezes an object.
 */
export function deepFreeze<T extends Record<string, any>>(obj: T): Readonly<T> {
  Object.freeze(obj);
  for (const value of Object.values(obj)) {
    if (isPlainObject(value) || Array.isArray(value)) {
      deepFreeze(value);
    }
  }
  return obj;
}
