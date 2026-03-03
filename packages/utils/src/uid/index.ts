/**
 * UID namespace utilities.
 *
 * Valid namespaces: api::, plugin::, admin::, apick::, global::
 */

const VALID_NAMESPACES = ['api', 'plugin', 'admin', 'apick', 'global'] as const;
type Namespace = typeof VALID_NAMESPACES[number];

/**
 * Adds a namespace prefix to a name.
 * e.g., addNamespace('article.article', 'api') → 'api::article.article'
 */
export function addNamespace(name: string, namespace: Namespace): string {
  if (hasNamespace(name)) return name;
  return `${namespace}::${name}`;
}

/**
 * Removes the namespace prefix from a UID.
 * e.g., removeNamespace('api::article.article') → 'article.article'
 */
export function removeNamespace(uid: string): string {
  const idx = uid.indexOf('::');
  if (idx === -1) return uid;
  return uid.slice(idx + 2);
}

/**
 * Checks if a string has a valid namespace prefix.
 */
export function hasNamespace(value: string): boolean {
  const idx = value.indexOf('::');
  if (idx === -1) return false;
  const ns = value.slice(0, idx);
  return (VALID_NAMESPACES as readonly string[]).includes(ns);
}

/**
 * Parses a UID into its namespace and name parts.
 * e.g., parseUid('api::article.article') → { namespace: 'api', name: 'article.article' }
 */
export function parseUid(uid: string): { namespace: string; name: string } | null {
  const idx = uid.indexOf('::');
  if (idx === -1) return null;
  const namespace = uid.slice(0, idx);
  const name = uid.slice(idx + 2);
  if (!(VALID_NAMESPACES as readonly string[]).includes(namespace)) return null;
  return { namespace, name };
}

/**
 * Validates that a UID is properly formatted.
 */
export function isValidUid(uid: string): boolean {
  const parsed = parseUid(uid);
  if (!parsed) return false;
  if (!parsed.name || parsed.name.length === 0) return false;
  return true;
}

/**
 * Gets the namespace from a UID.
 */
export function getNamespace(uid: string): string | null {
  const parsed = parseUid(uid);
  return parsed?.namespace ?? null;
}
