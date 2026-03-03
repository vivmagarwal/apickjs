import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import {
  ApplicationError,
  ValidationError,
  NotFoundError,
  ForbiddenError,
  UnauthorizedError,
  PayloadTooLargeError,
  RateLimitError,
  PolicyError,
  NotImplementedError,
  zodToValidationError,
} from '../src/errors/index.js';

describe('Error classes', () => {
  it('ApplicationError has correct defaults', () => {
    const err = new ApplicationError();
    expect(err.message).toBe('An application error occurred');
    expect(err.statusCode).toBe(400);
    expect(err.name).toBe('ApplicationError');
    expect(err.details).toEqual({});
  });

  it('ApplicationError accepts custom message and details', () => {
    const err = new ApplicationError('custom msg', { field: 'title' });
    expect(err.message).toBe('custom msg');
    expect(err.details).toEqual({ field: 'title' });
  });

  it('ApplicationError.toJSON produces standard error response', () => {
    const err = new ApplicationError('test error', { key: 'val' });
    const json = err.toJSON();
    expect(json).toEqual({
      data: null,
      error: {
        status: 400,
        name: 'ApplicationError',
        message: 'test error',
        details: { key: 'val' },
      },
    });
  });

  it('ApplicationError.toJSON omits details when empty', () => {
    const err = new ApplicationError('test');
    const json = err.toJSON();
    expect(json.error.details).toBeUndefined();
  });

  it.each([
    [ValidationError, 'ValidationError', 400, 'Validation error'],
    [NotFoundError, 'NotFoundError', 404, 'Not Found'],
    [ForbiddenError, 'ForbiddenError', 403, 'Forbidden'],
    [UnauthorizedError, 'UnauthorizedError', 401, 'Unauthorized'],
    [PayloadTooLargeError, 'PayloadTooLargeError', 413, 'Payload Too Large'],
    [RateLimitError, 'RateLimitError', 429, 'Too Many Requests'],
    [PolicyError, 'PolicyError', 403, 'Forbidden'],
    [NotImplementedError, 'NotImplementedError', 501, 'Not Implemented'],
  ] as const)('%s has correct name=%s, statusCode=%d, message=%s', (ErrorClass, name, statusCode, message) => {
    const err = new ErrorClass();
    expect(err.name).toBe(name);
    expect(err.statusCode).toBe(statusCode);
    expect(err.message).toBe(message);
    expect(err).toBeInstanceOf(ApplicationError);
    expect(err).toBeInstanceOf(Error);
  });
});

describe('zodToValidationError', () => {
  it('converts ZodError to ValidationError', () => {
    const schema = z.object({
      title: z.string().min(1),
      age: z.number().int(),
    });

    try {
      schema.parse({ title: '', age: 1.5 });
    } catch (err) {
      if (err instanceof z.ZodError) {
        const validationError = zodToValidationError(err);
        expect(validationError).toBeInstanceOf(ValidationError);
        expect(validationError.statusCode).toBe(400);
        expect(validationError.message).toBe('Validation failed');
        expect(validationError.details.errors).toBeInstanceOf(Array);
        expect(validationError.details.errors.length).toBe(2);
        expect(validationError.details.errors[0]).toHaveProperty('path');
        expect(validationError.details.errors[0]).toHaveProperty('message');
      }
    }
  });

  it('accepts custom message', () => {
    const schema = z.object({ x: z.number() });
    try {
      schema.parse({ x: 'not a number' });
    } catch (err) {
      if (err instanceof z.ZodError) {
        const validationError = zodToValidationError(err, 'Bad input');
        expect(validationError.message).toBe('Bad input');
      }
    }
  });
});
