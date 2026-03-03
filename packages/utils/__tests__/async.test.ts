import { describe, it, expect, vi } from 'vitest';
import { retry, withTimeout, parallelLimit, delay, debounce, throttle } from '../src/async/index.js';

describe('async utilities', () => {
  // -------------------------------------------------------------------------
  // retry
  // -------------------------------------------------------------------------

  describe('retry', () => {
    it('succeeds on first attempt', async () => {
      const fn = vi.fn().mockResolvedValue('ok');
      const result = await retry(fn);
      expect(result).toBe('ok');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('retries on failure and eventually succeeds', async () => {
      const fn = vi.fn()
        .mockRejectedValueOnce(new Error('fail'))
        .mockResolvedValue('ok');
      const result = await retry(fn, { delay: 1 });
      expect(result).toBe('ok');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('throws after max attempts exhausted', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('always fail'));
      await expect(retry(fn, { maxAttempts: 2, delay: 1 })).rejects.toThrow('always fail');
      expect(fn).toHaveBeenCalledTimes(2);
    });
  });

  // -------------------------------------------------------------------------
  // withTimeout
  // -------------------------------------------------------------------------

  describe('withTimeout', () => {
    it('resolves if promise completes in time', async () => {
      const result = await withTimeout(Promise.resolve('fast'), 1000);
      expect(result).toBe('fast');
    });

    it('rejects if promise exceeds timeout', async () => {
      const slow = new Promise(resolve => setTimeout(resolve, 5000));
      await expect(withTimeout(slow, 10, 'too slow')).rejects.toThrow('too slow');
    });
  });

  // -------------------------------------------------------------------------
  // parallelLimit
  // -------------------------------------------------------------------------

  describe('parallelLimit', () => {
    it('runs tasks in parallel with concurrency limit', async () => {
      const order: number[] = [];
      const tasks = [1, 2, 3, 4].map(n => async () => {
        order.push(n);
        return n * 10;
      });
      const results = await parallelLimit(tasks, 2);
      expect(results).toEqual([10, 20, 30, 40]);
    });

    it('handles empty task list', async () => {
      const results = await parallelLimit([], 5);
      expect(results).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // delay
  // -------------------------------------------------------------------------

  describe('delay', () => {
    it('resolves after specified time', async () => {
      const start = Date.now();
      await delay(50);
      expect(Date.now() - start).toBeGreaterThanOrEqual(40);
    });
  });

  // -------------------------------------------------------------------------
  // debounce
  // -------------------------------------------------------------------------

  describe('debounce', () => {
    it('calls function only after delay', async () => {
      const fn = vi.fn();
      const debounced = debounce(fn, 50);
      debounced('a');
      debounced('b');
      debounced('c');
      expect(fn).not.toHaveBeenCalled();
      await delay(80);
      expect(fn).toHaveBeenCalledTimes(1);
      expect(fn).toHaveBeenCalledWith('c');
    });
  });

  // -------------------------------------------------------------------------
  // throttle
  // -------------------------------------------------------------------------

  describe('throttle', () => {
    it('calls function at most once per interval', () => {
      const fn = vi.fn();
      const throttled = throttle(fn, 1000);
      throttled();
      throttled();
      throttled();
      expect(fn).toHaveBeenCalledTimes(1);
    });
  });
});
