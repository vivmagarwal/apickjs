import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createCronService } from '../src/cron/index.js';
import type { CronService } from '../src/cron/index.js';

describe('Cron Service', () => {
  let service: CronService;

  afterEach(() => {
    service?.destroy();
  });

  // ---------------------------------------------------------------------------
  // Job management
  // ---------------------------------------------------------------------------

  describe('Job management', () => {
    it('adds jobs', () => {
      service = createCronService();
      service.add({
        'cleanup': { task: () => {}, options: { rule: '0 * * * *' } },
      });
      const jobs = service.getJobs();
      expect(jobs).toHaveLength(1);
      expect(jobs[0].name).toBe('cleanup');
      expect(jobs[0].rule).toBe('0 * * * *');
    });

    it('adds jobs in simple format (name is cron expression)', () => {
      service = createCronService();
      service.add({
        '*/5 * * * *': () => {},
      });
      const jobs = service.getJobs();
      expect(jobs).toHaveLength(1);
      expect(jobs[0].rule).toBe('*/5 * * * *');
    });

    it('adds multiple jobs', () => {
      service = createCronService();
      service.add({
        job1: { task: () => {}, options: { rule: '0 * * * *' } },
        job2: { task: () => {}, options: { rule: '30 * * * *' } },
      });
      expect(service.getJobs()).toHaveLength(2);
    });

    it('removes a job', () => {
      service = createCronService();
      service.add({ myJob: { task: () => {}, options: { rule: '0 * * * *' } } });
      expect(service.remove('myJob')).toBe(true);
      expect(service.getJobs()).toHaveLength(0);
    });

    it('returns false when removing non-existent job', () => {
      service = createCronService();
      expect(service.remove('nonexistent')).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  describe('Lifecycle', () => {
    it('starts and stops', () => {
      service = createCronService();
      expect(service.isRunning()).toBe(false);
      service.start();
      expect(service.isRunning()).toBe(true);
      service.stop();
      expect(service.isRunning()).toBe(false);
    });

    it('destroys clears all jobs', () => {
      service = createCronService();
      service.add({ job: { task: () => {}, options: { rule: '* * * * *' } } });
      service.start();
      service.destroy();
      expect(service.getJobs()).toHaveLength(0);
      expect(service.isRunning()).toBe(false);
    });

    it('does not start when disabled', () => {
      service = createCronService({ enabled: false });
      service.start();
      expect(service.isRunning()).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // Cron expression parsing
  // ---------------------------------------------------------------------------

  describe('Cron expression parsing', () => {
    it('rejects invalid cron expression', () => {
      service = createCronService();
      expect(() => {
        service.add({ bad: { task: () => {}, options: { rule: 'invalid' } } });
      }).toThrow('Invalid cron expression');
    });

    it('rejects expression with wrong number of fields', () => {
      service = createCronService();
      expect(() => {
        service.add({ bad: { task: () => {}, options: { rule: '* * *' } } });
      }).toThrow('expected 5 fields');
    });

    it('accepts wildcard expression', () => {
      service = createCronService();
      service.add({ every: { task: () => {}, options: { rule: '* * * * *' } } });
      expect(service.getJobs()).toHaveLength(1);
    });

    it('accepts step expression', () => {
      service = createCronService();
      service.add({ step: { task: () => {}, options: { rule: '*/15 * * * *' } } });
      expect(service.getJobs()).toHaveLength(1);
    });

    it('accepts range expression', () => {
      service = createCronService();
      service.add({ range: { task: () => {}, options: { rule: '0-30 * * * *' } } });
      expect(service.getJobs()).toHaveLength(1);
    });

    it('accepts list expression', () => {
      service = createCronService();
      service.add({ list: { task: () => {}, options: { rule: '0,15,30,45 * * * *' } } });
      expect(service.getJobs()).toHaveLength(1);
    });
  });

  // ---------------------------------------------------------------------------
  // Execution
  // ---------------------------------------------------------------------------

  describe('Execution', () => {
    it('executes a job when its time comes', async () => {
      vi.useFakeTimers();
      const executions: Date[] = [];

      service = createCronService();
      service.add({
        everyMinute: { task: ({ date }) => { executions.push(date); }, options: { rule: '* * * * *' } },
      });
      service.start();

      // Advance to next minute boundary + 1 second
      const now = new Date();
      const msToNextMinute = (60 - now.getSeconds()) * 1000 - now.getMilliseconds();
      await vi.advanceTimersByTimeAsync(msToNextMinute + 1000);

      expect(executions.length).toBeGreaterThanOrEqual(1);

      service.destroy();
      vi.useRealTimers();
    });

    it('records lastRun after execution', async () => {
      vi.useFakeTimers();

      service = createCronService();
      service.add({
        everyMinute: { task: () => {}, options: { rule: '* * * * *' } },
      });
      service.start();

      const now = new Date();
      const msToNextMinute = (60 - now.getSeconds()) * 1000 - now.getMilliseconds();
      await vi.advanceTimersByTimeAsync(msToNextMinute + 1000);

      const jobs = service.getJobs();
      const job = jobs.find(j => j.name === 'everyMinute');
      expect(job?.lastRun).not.toBeNull();

      service.destroy();
      vi.useRealTimers();
    });

    it('jobs added after start are scheduled', () => {
      service = createCronService();
      service.start();
      service.add({ late: { task: () => {}, options: { rule: '0 * * * *' } } });
      const jobs = service.getJobs();
      expect(jobs[0].timerId).not.toBeNull();
      service.destroy();
    });
  });

  // ---------------------------------------------------------------------------
  // Next run computation
  // ---------------------------------------------------------------------------

  describe('Next run', () => {
    it('returns null for nextRun when not started', () => {
      service = createCronService();
      service.add({ job: { task: () => {}, options: { rule: '0 * * * *' } } });
      const jobs = service.getJobs();
      expect(jobs[0].nextRun).toBeNull();
    });

    it('computes nextRun when started', () => {
      service = createCronService();
      service.add({ job: { task: () => {}, options: { rule: '0 * * * *' } } });
      service.start();
      const jobs = service.getJobs();
      expect(jobs[0].nextRun).not.toBeNull();
      expect(jobs[0].nextRun!.getMinutes()).toBe(0);
      service.destroy();
    });
  });
});
