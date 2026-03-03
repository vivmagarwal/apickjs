import { ZodError } from 'zod';

/**
 * Base application error. All APICK errors extend this.
 */
export class ApplicationError extends Error {
  public statusCode: number;
  public details: Record<string, any>;

  constructor(message = 'An application error occurred', details: Record<string, any> = {}) {
    super(message);
    this.name = 'ApplicationError';
    this.statusCode = 400;
    this.details = details;
  }

  toJSON() {
    return {
      data: null,
      error: {
        status: this.statusCode,
        name: this.name,
        message: this.message,
        details: Object.keys(this.details).length > 0 ? this.details : undefined,
      },
    };
  }
}

export class ValidationError extends ApplicationError {
  constructor(message = 'Validation error', details: Record<string, any> = {}) {
    super(message, details);
    this.name = 'ValidationError';
    this.statusCode = 400;
  }
}

export class NotFoundError extends ApplicationError {
  constructor(message = 'Not Found', details: Record<string, any> = {}) {
    super(message, details);
    this.name = 'NotFoundError';
    this.statusCode = 404;
  }
}

export class ForbiddenError extends ApplicationError {
  constructor(message = 'Forbidden', details: Record<string, any> = {}) {
    super(message, details);
    this.name = 'ForbiddenError';
    this.statusCode = 403;
  }
}

export class UnauthorizedError extends ApplicationError {
  constructor(message = 'Unauthorized', details: Record<string, any> = {}) {
    super(message, details);
    this.name = 'UnauthorizedError';
    this.statusCode = 401;
  }
}

export class PayloadTooLargeError extends ApplicationError {
  constructor(message = 'Payload Too Large', details: Record<string, any> = {}) {
    super(message, details);
    this.name = 'PayloadTooLargeError';
    this.statusCode = 413;
  }
}

export class RateLimitError extends ApplicationError {
  constructor(message = 'Too Many Requests', details: Record<string, any> = {}) {
    super(message, details);
    this.name = 'RateLimitError';
    this.statusCode = 429;
  }
}

export class PolicyError extends ApplicationError {
  constructor(message = 'Forbidden', details: Record<string, any> = {}) {
    super(message, details);
    this.name = 'PolicyError';
    this.statusCode = 403;
  }
}

export class NotImplementedError extends ApplicationError {
  constructor(message = 'Not Implemented', details: Record<string, any> = {}) {
    super(message, details);
    this.name = 'NotImplementedError';
    this.statusCode = 501;
  }
}

/**
 * Converts a ZodError into a ValidationError with structured details.
 */
export function zodToValidationError(err: ZodError, message = 'Validation failed'): ValidationError {
  const errors = err.errors.map((issue) => ({
    path: issue.path.map(String),
    message: issue.message,
    name: 'ValidationError',
  }));
  return new ValidationError(message, { errors });
}

/** Convenience object for importing all error classes */
export const errors = {
  ApplicationError,
  ValidationError,
  NotFoundError,
  ForbiddenError,
  UnauthorizedError,
  PayloadTooLargeError,
  RateLimitError,
  PolicyError,
  NotImplementedError,
};
