/**
 * Background Job Queue.
 *
 * In-memory queue for development with configurable concurrency,
 * retry with exponential backoff, and dead-letter handling.
 */

import { randomBytes } from 'node:crypto';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type JobStatus = 'pending' | 'delayed' | 'active' | 'completed' | 'failed' | 'dead';

export interface Job {
  id: string;
  name: string;
  data: Record<string, any>;
  status: JobStatus;
  result: any;
  error: string | null;
  attempts: number;
  maxRetries: number;
  backoff: 'exponential' | 'fixed';
  backoffDelay: number;
  createdAt: number;
  updatedAt: number;
  processedAt: number | null;
  completedAt: number | null;
}

export interface JobHandler {
  (data: Record<string, any>): any | Promise<any>;
}

export interface HandlerOptions {
  concurrency?: number;
  maxRetries?: number;
  backoff?: 'exponential' | 'fixed';
  backoffDelay?: number;
}

export interface DispatchOptions {
  maxRetries?: number;
  delay?: number;
  backoff?: 'exponential' | 'fixed';
  backoffDelay?: number;
}

export interface QueueStats {
  pending: number;
  active: number;
  completed: number;
  failed: number;
  dead: number;
  total: number;
}

export interface QueueService {
  register(name: string, handler: JobHandler, opts?: HandlerOptions): void;
  dispatch(name: string, data: Record<string, any>, opts?: DispatchOptions): Job;
  getJob(id: string): Job | null;
  getStats(): QueueStats;
  retryJob(id: string): Job | null;
  removeJob(id: string): boolean;
  drain(): Promise<void>;
  pause(): void;
  resume(): void;
  destroy(): void;
}

export interface QueueConfig {
  driver?: 'memory';
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createQueueService(config: QueueConfig = {}): QueueService {
  const jobs = new Map<string, Job>();
  const handlers = new Map<string, { handler: JobHandler; opts: HandlerOptions }>();
  const activeCount = new Map<string, number>();
  let paused = false;
  let destroyed = false;
  const timers: ReturnType<typeof setTimeout>[] = [];

  function generateId(): string {
    return randomBytes(12).toString('hex');
  }

  function processNext(name: string): void {
    if (paused || destroyed) return;

    const entry = handlers.get(name);
    if (!entry) return;

    const maxConcurrency = entry.opts.concurrency ?? 1;
    const current = activeCount.get(name) ?? 0;
    if (current >= maxConcurrency) return;

    // Find next pending job for this handler
    const pendingJob = Array.from(jobs.values()).find(
      j => j.name === name && j.status === 'pending',
    );
    if (!pendingJob) return;

    pendingJob.status = 'active';
    pendingJob.updatedAt = Date.now();
    pendingJob.processedAt = Date.now();
    activeCount.set(name, current + 1);

    Promise.resolve()
      .then(() => entry.handler(pendingJob.data))
      .then(result => {
        pendingJob.status = 'completed';
        pendingJob.result = result;
        pendingJob.completedAt = Date.now();
        pendingJob.updatedAt = Date.now();
      })
      .catch(err => {
        pendingJob.attempts++;
        pendingJob.error = err instanceof Error ? err.message : String(err);
        pendingJob.updatedAt = Date.now();

        if (pendingJob.attempts >= pendingJob.maxRetries) {
          pendingJob.status = 'dead';
        } else {
          pendingJob.status = 'failed';
          // Schedule retry with backoff
          const delayMs = pendingJob.backoff === 'exponential'
            ? pendingJob.backoffDelay * Math.pow(2, pendingJob.attempts - 1)
            : pendingJob.backoffDelay;

          const timer = setTimeout(() => {
            if (!destroyed) {
              pendingJob.status = 'pending';
              pendingJob.updatedAt = Date.now();
              processNext(name);
            }
          }, delayMs);
          timers.push(timer);
        }
      })
      .finally(() => {
        activeCount.set(name, (activeCount.get(name) ?? 1) - 1);
        processNext(name);
      });
  }

  return {
    register(name, handler, opts = {}) {
      handlers.set(name, { handler, opts });
      activeCount.set(name, 0);
    },

    dispatch(name, data, opts = {}) {
      if (!handlers.has(name)) {
        throw new Error(`No handler registered for job "${name}"`);
      }

      const entry = handlers.get(name)!;
      const job: Job = {
        id: generateId(),
        name,
        data,
        status: opts.delay ? 'delayed' : 'pending',
        result: null,
        error: null,
        attempts: 0,
        maxRetries: opts.maxRetries ?? entry.opts.maxRetries ?? 3,
        backoff: opts.backoff ?? entry.opts.backoff ?? 'exponential',
        backoffDelay: opts.backoffDelay ?? entry.opts.backoffDelay ?? 100,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        processedAt: null,
        completedAt: null,
      };

      jobs.set(job.id, job);

      if (opts.delay) {
        const timer = setTimeout(() => {
          if (!destroyed) {
            job.status = 'pending';
            job.updatedAt = Date.now();
            processNext(name);
          }
        }, opts.delay);
        timers.push(timer);
      } else {
        // Use microtask to allow synchronous dispatch to return the job
        queueMicrotask(() => processNext(name));
      }

      return job;
    },

    getJob(id) {
      return jobs.get(id) ?? null;
    },

    getStats() {
      const stats: QueueStats = { pending: 0, active: 0, completed: 0, failed: 0, dead: 0, total: 0 };
      for (const job of jobs.values()) {
        stats.total++;
        if (job.status === 'pending' || job.status === 'delayed') stats.pending++;
        else if (job.status === 'active') stats.active++;
        else if (job.status === 'completed') stats.completed++;
        else if (job.status === 'failed') stats.failed++;
        else if (job.status === 'dead') stats.dead++;
      }
      return stats;
    },

    retryJob(id) {
      const job = jobs.get(id);
      if (!job || (job.status !== 'failed' && job.status !== 'dead')) return null;

      job.status = 'pending';
      job.attempts = 0;
      job.error = null;
      job.updatedAt = Date.now();
      queueMicrotask(() => processNext(job.name));
      return job;
    },

    removeJob(id) {
      return jobs.delete(id);
    },

    async drain() {
      // Wait for all active, pending, delayed, and failed (retrying) jobs to settle
      const check = () => {
        for (const job of jobs.values()) {
          if (job.status === 'pending' || job.status === 'active' || job.status === 'delayed' || job.status === 'failed') {
            return false;
          }
        }
        return true;
      };

      while (!check()) {
        await new Promise(resolve => setTimeout(resolve, 10));
      }
    },

    pause() {
      paused = true;
    },

    resume() {
      paused = false;
      // Kick-start processing for all handlers with pending jobs
      for (const name of handlers.keys()) {
        processNext(name);
      }
    },

    destroy() {
      destroyed = true;
      for (const timer of timers) {
        clearTimeout(timer);
      }
      timers.length = 0;
      jobs.clear();
      handlers.clear();
      activeCount.clear();
    },
  };
}
