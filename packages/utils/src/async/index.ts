/**
 * Async utilities: retry, timeout, parallel execution, debounce, throttle.
 */

/**
 * Retries an async function up to `maxAttempts` times with exponential backoff.
 */
export async function retry<T>(
  fn: () => Promise<T>,
  options: { maxAttempts?: number; delay?: number; backoff?: number } = {},
): Promise<T> {
  const { maxAttempts = 3, delay = 100, backoff = 2 } = options;

  let lastError: Error | undefined;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < maxAttempts) {
        const wait = delay * Math.pow(backoff, attempt - 1);
        await new Promise(resolve => setTimeout(resolve, wait));
      }
    }
  }

  throw lastError!;
}

/**
 * Wraps a promise with a timeout. Rejects if the promise doesn't resolve in time.
 */
export function withTimeout<T>(promise: Promise<T>, ms: number, message?: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message || `Operation timed out after ${ms}ms`)), ms);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timer));
}

/**
 * Executes async tasks in parallel with a concurrency limit.
 */
export async function parallelLimit<T>(
  tasks: Array<() => Promise<T>>,
  concurrency: number,
): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let index = 0;

  async function worker(): Promise<void> {
    while (index < tasks.length) {
      const i = index++;
      results[i] = await tasks[i]();
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, tasks.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

/**
 * Delays execution for a given number of milliseconds.
 */
export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Creates a debounced version of a function.
 */
export function debounce<T extends (...args: any[]) => any>(
  fn: T,
  ms: number,
): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return (...args: Parameters<T>) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

/**
 * Creates a throttled version of a function.
 */
export function throttle<T extends (...args: any[]) => any>(
  fn: T,
  ms: number,
): (...args: Parameters<T>) => void {
  let lastCall = 0;
  return (...args: Parameters<T>) => {
    const now = Date.now();
    if (now - lastCall >= ms) {
      lastCall = now;
      fn(...args);
    }
  };
}
