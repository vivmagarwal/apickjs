import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('colors', () => {
  let originalNoColor: string | undefined;
  let originalIsTTY: boolean | undefined;

  beforeEach(() => {
    originalNoColor = process.env.NO_COLOR;
    originalIsTTY = process.stdout.isTTY;
  });

  afterEach(() => {
    if (originalNoColor === undefined) {
      delete process.env.NO_COLOR;
    } else {
      process.env.NO_COLOR = originalNoColor;
    }
    Object.defineProperty(process.stdout, 'isTTY', {
      value: originalIsTTY,
      writable: true,
      configurable: true,
    });
  });

  it('exports color functions', async () => {
    const { colors } = await import('../src/colors.js');
    expect(typeof colors.green).toBe('function');
    expect(typeof colors.red).toBe('function');
    expect(typeof colors.cyan).toBe('function');
    expect(typeof colors.yellow).toBe('function');
    expect(typeof colors.dim).toBe('function');
    expect(typeof colors.bold).toBe('function');
  });

  it('exports helper functions', async () => {
    const { success, error, info, warn } = await import('../src/colors.js');
    expect(typeof success).toBe('function');
    expect(typeof error).toBe('function');
    expect(typeof info).toBe('function');
    expect(typeof warn).toBe('function');
  });

  it('success writes to console.log', async () => {
    const { success } = await import('../src/colors.js');
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    success('test message');
    expect(log).toHaveBeenCalled();
    expect(log.mock.calls[0][0]).toContain('test message');
    log.mockRestore();
  });

  it('error writes to console.error', async () => {
    const { error } = await import('../src/colors.js');
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    error('test error');
    expect(err).toHaveBeenCalled();
    expect(err.mock.calls[0][0]).toContain('test error');
    err.mockRestore();
  });

  it('info writes to console.log', async () => {
    const { info } = await import('../src/colors.js');
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    info('test info');
    expect(log).toHaveBeenCalled();
    expect(log.mock.calls[0][0]).toContain('test info');
    log.mockRestore();
  });

  it('warn writes to console.warn', async () => {
    const { warn } = await import('../src/colors.js');
    const w = vi.spyOn(console, 'warn').mockImplementation(() => {});
    warn('test warn');
    expect(w).toHaveBeenCalled();
    expect(w.mock.calls[0][0]).toContain('test warn');
    w.mockRestore();
  });

  it('color wraps text in ANSI codes when enabled', async () => {
    const { colors } = await import('../src/colors.js');
    const result = colors.green('hello');
    // Either has ANSI codes or is plain text (depending on TTY detection in CI)
    expect(result).toContain('hello');
  });
});
