/**
 * Validation utilities for common patterns.
 */

/** Validates an email address format. */
export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/** Validates a URL format. */
export function isValidUrl(value: string): boolean {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

/** Validates a non-empty string. */
export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/** Validates a positive integer. */
export function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

/** Validates that a value is a non-null object (not an array). */
export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Validates a UID format (namespace::name.name or namespace::name). */
export function isValidUidFormat(uid: string): boolean {
  return /^(api|plugin|admin|apick|global)::[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)?$/.test(uid);
}

/** Validates a cron expression (5 fields). */
export function isValidCronExpression(expression: string): boolean {
  const parts = expression.trim().split(/\s+/);
  if (parts.length !== 5) return false;

  const ranges = [
    [0, 59],  // minute
    [0, 23],  // hour
    [1, 31],  // day of month
    [1, 12],  // month
    [0, 7],   // day of week (0 and 7 = Sunday)
  ];

  for (let i = 0; i < 5; i++) {
    const field = parts[i];
    if (field === '*') continue;

    // Handle step (*/5 or 1-10/2)
    const [rangePart] = field.split('/');
    if (rangePart === '*') continue;

    // Handle list (1,2,3)
    const listParts = rangePart.split(',');
    for (const part of listParts) {
      // Handle range (1-5)
      const [lo, hi] = part.split('-').map(Number);
      if (isNaN(lo) || lo < ranges[i][0] || lo > ranges[i][1]) return false;
      if (hi !== undefined && (isNaN(hi) || hi < ranges[i][0] || hi > ranges[i][1])) return false;
    }
  }

  return true;
}

/** Validates password strength: min 8 chars, uppercase, lowercase, digit. */
export function isStrongPassword(password: string): boolean {
  return password.length >= 8 &&
    /[A-Z]/.test(password) &&
    /[a-z]/.test(password) &&
    /[0-9]/.test(password);
}
