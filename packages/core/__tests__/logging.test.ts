import { describe, it, expect } from 'vitest';
import { createLogger } from '../src/logging/index.js';

describe('Logger', () => {
  it('creates a logger with default level', () => {
    const logger = createLogger({ level: 'info' });
    expect(logger).toBeDefined();
    expect(typeof logger.info).toBe('function');
    expect(typeof logger.error).toBe('function');
    expect(typeof logger.warn).toBe('function');
    expect(typeof logger.debug).toBe('function');
    expect(typeof logger.trace).toBe('function');
    expect(typeof logger.fatal).toBe('function');
  });

  it('creates a logger with silent level (no output)', () => {
    const logger = createLogger({ level: 'silent' });
    // Should not throw
    logger.info('test message');
    logger.error({ err: new Error('test') }, 'error message');
  });

  it('creates child loggers', () => {
    const logger = createLogger({ level: 'silent' });
    const child = logger.child({ plugin: 'upload' });
    expect(child).toBeDefined();
    expect(typeof child.info).toBe('function');
  });

  it('respects enabled: false', () => {
    const logger = createLogger({ level: 'info', enabled: false });
    // Should not throw
    logger.info('should not appear');
  });
});
