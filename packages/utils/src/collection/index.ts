/**
 * Collection utilities: groupBy, keyBy, pick, omit, unique, chunk, compact.
 */

/**
 * Groups array items by a key function.
 */
export function groupBy<T>(items: T[], fn: (item: T) => string): Record<string, T[]> {
  const result: Record<string, T[]> = {};
  for (const item of items) {
    const key = fn(item);
    if (!result[key]) result[key] = [];
    result[key].push(item);
  }
  return result;
}

/**
 * Creates a lookup object keyed by a function.
 */
export function keyBy<T>(items: T[], fn: (item: T) => string): Record<string, T> {
  const result: Record<string, T> = {};
  for (const item of items) {
    result[fn(item)] = item;
  }
  return result;
}

/**
 * Picks specified keys from an object.
 */
export function pick<T extends Record<string, any>, K extends keyof T>(
  obj: T,
  keys: K[],
): Pick<T, K> {
  const result = {} as Pick<T, K>;
  for (const key of keys) {
    if (key in obj) {
      result[key] = obj[key];
    }
  }
  return result;
}

/**
 * Omits specified keys from an object.
 */
export function omit<T extends Record<string, any>, K extends keyof T>(
  obj: T,
  keys: K[],
): Omit<T, K> {
  const result = { ...obj };
  for (const key of keys) {
    delete result[key];
  }
  return result as Omit<T, K>;
}

/**
 * Returns unique items from an array, optionally by a key function.
 */
export function unique<T>(items: T[], fn?: (item: T) => any): T[] {
  if (!fn) return [...new Set(items)];

  const seen = new Set<any>();
  const result: T[] = [];
  for (const item of items) {
    const key = fn(item);
    if (!seen.has(key)) {
      seen.add(key);
      result.push(item);
    }
  }
  return result;
}

/**
 * Splits an array into chunks of a given size.
 */
export function chunk<T>(items: T[], size: number): T[][] {
  if (size <= 0) return [items];
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    result.push(items.slice(i, i + size));
  }
  return result;
}

/**
 * Removes null and undefined values from an array.
 */
export function compact<T>(items: (T | null | undefined)[]): T[] {
  return items.filter((item): item is T => item != null);
}

/**
 * Flattens a nested array one level deep.
 */
export function flatten<T>(items: (T | T[])[]): T[] {
  return items.flat() as T[];
}

/**
 * Maps object values with a transform function.
 */
export function mapValues<T extends Record<string, any>, U>(
  obj: T,
  fn: (value: T[keyof T], key: string) => U,
): Record<string, U> {
  const result: Record<string, U> = {};
  for (const [key, value] of Object.entries(obj)) {
    result[key] = fn(value, key);
  }
  return result;
}

/**
 * Filters object entries by a predicate.
 */
export function pickBy<T extends Record<string, any>>(
  obj: T,
  predicate: (value: T[keyof T], key: string) => boolean,
): Partial<T> {
  const result: Partial<T> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (predicate(value, key)) {
      (result as any)[key] = value;
    }
  }
  return result;
}
