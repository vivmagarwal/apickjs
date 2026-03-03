/**
 * Cron Service.
 *
 * Schedules recurring tasks using cron expressions.
 * Uses a simple in-process scheduler (no external dependency).
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CronJob {
  name: string;
  rule: string;
  task: (context: CronJobContext) => void | Promise<void>;
  options?: CronJobOptions;
}

export interface CronJobOptions {
  rule: string;
  tz?: string;
}

export interface CronJobContext {
  date: Date;
}

export interface CronJobEntry {
  name: string;
  rule: string;
  running: boolean;
  lastRun: Date | null;
  nextRun: Date | null;
  timerId: ReturnType<typeof setTimeout> | null;
}

export interface CronService {
  add(jobs: Record<string, CronJobDefinition>): void;
  remove(name: string): boolean;
  start(): void;
  stop(): void;
  destroy(): void;
  getJobs(): CronJobEntry[];
  isRunning(): boolean;
}

/** Simple format: cron expression key → task, or named format with task+options */
export type CronJobDefinition =
  | ((context: CronJobContext) => void | Promise<void>)
  | { task: (context: CronJobContext) => void | Promise<void>; options?: CronJobOptions };

export interface CronServiceConfig {
  enabled?: boolean;
}

// ---------------------------------------------------------------------------
// Cron expression parser (simple 5-field: min hour dom month dow)
// ---------------------------------------------------------------------------

interface CronFields {
  minutes: Set<number>;
  hours: Set<number>;
  daysOfMonth: Set<number>;
  months: Set<number>;
  daysOfWeek: Set<number>;
}

function parseField(field: string, min: number, max: number): Set<number> {
  const values = new Set<number>();

  for (const part of field.split(',')) {
    const trimmed = part.trim();

    if (trimmed === '*') {
      for (let i = min; i <= max; i++) values.add(i);
      continue;
    }

    // Step: */n or range/n
    const stepMatch = trimmed.match(/^(.+)\/(\d+)$/);
    if (stepMatch) {
      const step = parseInt(stepMatch[2], 10);
      const base = stepMatch[1];
      let start = min;
      let end = max;
      if (base !== '*') {
        const rangeMatch = base.match(/^(\d+)-(\d+)$/);
        if (rangeMatch) {
          start = parseInt(rangeMatch[1], 10);
          end = parseInt(rangeMatch[2], 10);
        } else {
          start = parseInt(base, 10);
        }
      }
      for (let i = start; i <= end; i += step) values.add(i);
      continue;
    }

    // Range: n-m
    const rangeMatch = trimmed.match(/^(\d+)-(\d+)$/);
    if (rangeMatch) {
      const start = parseInt(rangeMatch[1], 10);
      const end = parseInt(rangeMatch[2], 10);
      for (let i = start; i <= end; i++) values.add(i);
      continue;
    }

    // Single value
    const num = parseInt(trimmed, 10);
    if (!isNaN(num) && num >= min && num <= max) {
      values.add(num);
    }
  }

  return values;
}

function parseCronExpression(expression: string): CronFields {
  const parts = expression.trim().split(/\s+/);
  if (parts.length !== 5) {
    throw new Error(`Invalid cron expression: "${expression}" — expected 5 fields (min hour dom month dow)`);
  }

  return {
    minutes: parseField(parts[0], 0, 59),
    hours: parseField(parts[1], 0, 23),
    daysOfMonth: parseField(parts[2], 1, 31),
    months: parseField(parts[3], 1, 12),
    daysOfWeek: parseField(parts[4], 0, 6),
  };
}

function matchesCron(fields: CronFields, date: Date): boolean {
  return (
    fields.minutes.has(date.getMinutes()) &&
    fields.hours.has(date.getHours()) &&
    fields.daysOfMonth.has(date.getDate()) &&
    fields.months.has(date.getMonth() + 1) &&
    fields.daysOfWeek.has(date.getDay())
  );
}

function getNextRun(fields: CronFields, after: Date): Date {
  const next = new Date(after.getTime());
  next.setSeconds(0, 0);
  next.setMinutes(next.getMinutes() + 1);

  // Scan up to 366 days ahead
  const limit = 366 * 24 * 60;
  for (let i = 0; i < limit; i++) {
    if (matchesCron(fields, next)) return next;
    next.setMinutes(next.getMinutes() + 1);
  }

  // Fallback — shouldn't happen for valid expressions
  return next;
}

// ---------------------------------------------------------------------------
// Service factory
// ---------------------------------------------------------------------------

export function createCronService(config: CronServiceConfig = {}): CronService {
  const enabled = config.enabled !== false;
  const jobs = new Map<string, {
    name: string;
    rule: string;
    task: (context: CronJobContext) => void | Promise<void>;
    fields: CronFields;
    running: boolean;
    lastRun: Date | null;
    timerId: ReturnType<typeof setTimeout> | null;
  }>();
  let started = false;

  function scheduleNext(name: string): void {
    const job = jobs.get(name);
    if (!job || !started) return;

    const now = new Date();
    const nextRun = getNextRun(job.fields, now);
    const delay = nextRun.getTime() - now.getTime();

    job.timerId = setTimeout(async () => {
      if (!started || !jobs.has(name)) return;
      job.running = true;
      job.lastRun = new Date();
      try {
        await job.task({ date: job.lastRun });
      } catch {
        // Swallow errors — cron tasks should handle their own errors
      }
      job.running = false;
      // Schedule next run
      scheduleNext(name);
    }, Math.max(delay, 0));
  }

  return {
    add(newJobs) {
      for (const [name, definition] of Object.entries(newJobs)) {
        let task: (context: CronJobContext) => void | Promise<void>;
        let rule: string;

        if (typeof definition === 'function') {
          task = definition;
          rule = name; // Name IS the cron expression in simple format
        } else {
          task = definition.task;
          rule = definition.options?.rule || name;
        }

        const fields = parseCronExpression(rule);
        jobs.set(name, { name, rule, task, fields, running: false, lastRun: null, timerId: null });

        if (started && enabled) {
          scheduleNext(name);
        }
      }
    },

    remove(name) {
      const job = jobs.get(name);
      if (!job) return false;
      if (job.timerId) clearTimeout(job.timerId);
      jobs.delete(name);
      return true;
    },

    start() {
      if (!enabled || started) return;
      started = true;
      for (const name of jobs.keys()) {
        scheduleNext(name);
      }
    },

    stop() {
      started = false;
      for (const job of jobs.values()) {
        if (job.timerId) {
          clearTimeout(job.timerId);
          job.timerId = null;
        }
      }
    },

    destroy() {
      this.stop();
      jobs.clear();
    },

    getJobs() {
      return Array.from(jobs.values()).map(job => ({
        name: job.name,
        rule: job.rule,
        running: job.running,
        lastRun: job.lastRun,
        nextRun: started ? getNextRun(job.fields, new Date()) : null,
        timerId: job.timerId,
      }));
    },

    isRunning() {
      return started;
    },
  };
}
