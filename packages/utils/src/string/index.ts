/**
 * String utilities.
 */

/**
 * Converts a string to a URL-friendly slug.
 * e.g., 'Hello World!' → 'hello-world'
 */
export function slugify(text: string, separator = '-'): string {
  return text
    .toString()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, separator) // Replace non-alphanumeric
    .replace(new RegExp(`${escapeRegExp(separator)}+`, 'g'), separator) // Remove duplicates
    .replace(new RegExp(`^${escapeRegExp(separator)}|${escapeRegExp(separator)}$`, 'g'), ''); // Trim separator
}

/**
 * Naive pluralize — adds 's' for simple cases.
 * For a more sophisticated solution, use a proper library.
 */
export function pluralize(word: string): string {
  if (word.endsWith('s') || word.endsWith('x') || word.endsWith('z') || word.endsWith('ch') || word.endsWith('sh')) {
    return `${word}es`;
  }
  if (word.endsWith('y') && !/[aeiou]y$/i.test(word)) {
    return `${word.slice(0, -1)}ies`;
  }
  return `${word}s`;
}

/**
 * Converts a string to camelCase.
 */
export function camelCase(str: string): string {
  return str
    .replace(/[-_\s]+(.)?/g, (_, c) => (c ? c.toUpperCase() : ''))
    .replace(/^(.)/, (c) => c.toLowerCase());
}

/**
 * Converts a string to PascalCase.
 */
export function pascalCase(str: string): string {
  const camel = camelCase(str);
  return camel.charAt(0).toUpperCase() + camel.slice(1);
}

/**
 * Converts a string to kebab-case.
 */
export function kebabCase(str: string): string {
  return str
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/[\s_]+/g, '-')
    .toLowerCase();
}

function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
