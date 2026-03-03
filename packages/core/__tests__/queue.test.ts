import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createQueueService } from '../src/queue/index.js';
import type { QueueService } from '../src/queue/index.js';

describe('Job Queue', () => {
  let queue: QueueService;

  beforeEach(() => {
    queue = createQueueService();
  });

  afterEach(() => {
    queue.destroy();
  });

  it('registers a handler and dispatches a job', async () => {
    const results: string[] = [];
    queue.register('greet', async (data) => {
      results.push(`Hello ${data.name}`);
      return 'done';
    });

    const job = queue.dispatch('greet', { name: 'World' });
    expect(job.id).toBeDefined();
    expect(job.status).toBe('pending');

    await queue.drain();
    const updated = queue.getJob(job.id)!;
    expect(updated.status).toBe('completed');
    expect(updated.result).toBe('done');
    expect(results).toEqual(['Hello World']);
  });

  it('throws when dispatching without a registered handler', () => {
    expect(() => queue.dispatch('unknown', {})).toThrow('No handler registered');
  });

  it('retries on failure and eventually succeeds', async () => {
    let attempts = 0;
    queue.register('flaky', async () => {
      attempts++;
      if (attempts < 3) throw new Error('fail');
      return 'success';
    }, { maxRetries: 3, backoffDelay: 10 });

    queue.dispatch('flaky', {});
    await queue.drain();

    expect(attempts).toBe(3);
    const stats = queue.getStats();
    expect(stats.completed).toBe(1);
  });

  it('sends to dead letter after max retries', async () => {
    queue.register('always-fail', async () => {
      throw new Error('permanent failure');
    }, { maxRetries: 2, backoffDelay: 10 });

    queue.dispatch('always-fail', {});
    await queue.drain();

    const stats = queue.getStats();
    expect(stats.dead).toBe(1);
    expect(stats.completed).toBe(0);
  });

  it('respects concurrency limit', async () => {
    let maxConcurrent = 0;
    let currentConcurrent = 0;

    queue.register('concurrent', async () => {
      currentConcurrent++;
      maxConcurrent = Math.max(maxConcurrent, currentConcurrent);
      await new Promise(r => setTimeout(r, 20));
      currentConcurrent--;
    }, { concurrency: 2 });

    for (let i = 0; i < 5; i++) {
      queue.dispatch('concurrent', { i });
    }

    await queue.drain();
    expect(maxConcurrent).toBeLessThanOrEqual(2);
    expect(queue.getStats().completed).toBe(5);
  });

  it('pauses and resumes processing', async () => {
    const results: number[] = [];
    queue.register('pausable', async (data) => {
      results.push(data.n);
    });

    queue.pause();
    queue.dispatch('pausable', { n: 1 });
    queue.dispatch('pausable', { n: 2 });

    await new Promise(r => setTimeout(r, 50));
    expect(results).toHaveLength(0);

    queue.resume();
    await queue.drain();
    expect(results).toHaveLength(2);
  });

  it('returns stats', async () => {
    queue.register('stats-test', async () => 'ok');

    queue.dispatch('stats-test', {});
    queue.dispatch('stats-test', {});
    await queue.drain();

    const stats = queue.getStats();
    expect(stats.completed).toBe(2);
    expect(stats.total).toBe(2);
    expect(stats.pending).toBe(0);
  });

  it('retries a dead job', async () => {
    let callCount = 0;
    queue.register('retry-dead', async () => {
      callCount++;
      if (callCount <= 1) throw new Error('fail');
      return 'recovered';
    }, { maxRetries: 1, backoffDelay: 10 });

    const job = queue.dispatch('retry-dead', {});
    await queue.drain();

    expect(queue.getJob(job.id)!.status).toBe('dead');

    // Retry the dead job — handler now succeeds on call #2
    queue.retryJob(job.id);
    await queue.drain();

    expect(queue.getJob(job.id)!.status).toBe('completed');
    expect(queue.getJob(job.id)!.result).toBe('recovered');
  });

  it('removes a job', () => {
    queue.register('removable', async () => 'ok');
    const job = queue.dispatch('removable', {});
    expect(queue.removeJob(job.id)).toBe(true);
    expect(queue.getJob(job.id)).toBeNull();
  });

  it('supports delayed dispatch', async () => {
    const results: number[] = [];
    queue.register('delayed', async (data) => {
      results.push(data.n);
    });

    const job = queue.dispatch('delayed', { n: 1 }, { delay: 50 });
    expect(job.status).toBe('delayed');

    await new Promise(r => setTimeout(r, 30));
    expect(results).toHaveLength(0);

    await queue.drain();
    expect(results).toEqual([1]);
  });
});
