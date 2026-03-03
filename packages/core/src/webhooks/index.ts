/**
 * Webhook Service.
 *
 * CRUD for webhook configurations and event-driven delivery
 * with HMAC-SHA256 signatures.
 */

import { createHmac, randomBytes } from 'node:crypto';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Webhook {
  id?: number;
  name: string;
  url: string;
  events: string[];
  headers: Record<string, string>;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface WebhookPayload {
  event: string;
  createdAt: string;
  model?: string;
  uid?: string;
  entry?: Record<string, any>;
}

export interface WebhookDelivery {
  webhookId: number;
  event: string;
  url: string;
  statusCode: number | null;
  duration: number;
  success: boolean;
  error?: string;
  createdAt: string;
}

export interface WebhookService {
  findAll(): Webhook[];
  findOne(id: number): Webhook | null;
  create(data: { name: string; url: string; events: string[]; headers?: Record<string, string>; enabled?: boolean }): Webhook;
  updateById(id: number, data: Partial<{ name: string; url: string; events: string[]; headers: Record<string, string>; enabled: boolean }>): Webhook | null;
  deleteById(id: number): boolean;

  trigger(event: string, payload: Record<string, any>): Promise<WebhookDelivery[]>;
  getAvailableEvents(): string[];
  setSecret(secret: string): void;
  setFetcher(fn: WebhookFetcher): void;
}

/** Replaceable fetch function for testing */
export type WebhookFetcher = (url: string, init: { method: string; headers: Record<string, string>; body: string; signal: AbortSignal }) => Promise<{ status: number }>;

export interface WebhookServiceConfig {
  rawDb: any;
  secret?: string;
  timeoutMs?: number;
  maxConcurrency?: number;
  fetcher?: WebhookFetcher;
}

// ---------------------------------------------------------------------------
// Default available events
// ---------------------------------------------------------------------------

const AVAILABLE_EVENTS = [
  'entry.create', 'entry.update', 'entry.delete',
  'entry.publish', 'entry.unpublish', 'entry.draft-discard',
  'media.create', 'media.update', 'media.delete',
  'review-workflows.stageChange',
];

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

function ensureTables(db: any): void {
  db.exec(`CREATE TABLE IF NOT EXISTS "webhooks" (
    "id" INTEGER PRIMARY KEY AUTOINCREMENT,
    "name" VARCHAR(255) NOT NULL,
    "url" TEXT NOT NULL,
    "events" TEXT NOT NULL DEFAULT '[]',
    "headers" TEXT NOT NULL DEFAULT '{}',
    "enabled" INTEGER NOT NULL DEFAULT 1,
    "created_at" TEXT NOT NULL,
    "updated_at" TEXT NOT NULL
  )`);
}

function rowToWebhook(row: any): Webhook {
  return {
    id: row.id, name: row.name, url: row.url,
    events: row.events ? JSON.parse(row.events) : [],
    headers: row.headers ? JSON.parse(row.headers) : {},
    enabled: !!row.enabled,
    createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

// ---------------------------------------------------------------------------
// Signature
// ---------------------------------------------------------------------------

function signPayload(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('hex');
}

// ---------------------------------------------------------------------------
// Service factory
// ---------------------------------------------------------------------------

export function createWebhookService(config: WebhookServiceConfig): WebhookService {
  const { rawDb } = config;
  let secret = config.secret || randomBytes(32).toString('hex');
  const timeoutMs = config.timeoutMs || 10_000;
  const maxConcurrency = config.maxConcurrency || 5;
  let fetcher: WebhookFetcher | undefined = config.fetcher;
  ensureTables(rawDb);

  return {
    findAll() {
      return rawDb.prepare(`SELECT * FROM "webhooks" ORDER BY id ASC`).all().map(rowToWebhook);
    },

    findOne(id) {
      const row = rawDb.prepare(`SELECT * FROM "webhooks" WHERE id = ?`).get(id);
      return row ? rowToWebhook(row) : null;
    },

    create(data) {
      const now = new Date().toISOString();
      const result = rawDb.prepare(`
        INSERT INTO "webhooks" (name, url, events, headers, enabled, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        data.name, data.url,
        JSON.stringify(data.events || []),
        JSON.stringify(data.headers || {}),
        data.enabled !== false ? 1 : 0,
        now, now,
      );
      return this.findOne(result.lastInsertRowid as number)!;
    },

    updateById(id, data) {
      const existing = this.findOne(id);
      if (!existing) return null;

      const now = new Date().toISOString();
      const sets: string[] = ['updated_at = ?'];
      const values: any[] = [now];

      if (data.name !== undefined) { sets.push('name = ?'); values.push(data.name); }
      if (data.url !== undefined) { sets.push('url = ?'); values.push(data.url); }
      if (data.events !== undefined) { sets.push('events = ?'); values.push(JSON.stringify(data.events)); }
      if (data.headers !== undefined) { sets.push('headers = ?'); values.push(JSON.stringify(data.headers)); }
      if (data.enabled !== undefined) { sets.push('enabled = ?'); values.push(data.enabled ? 1 : 0); }

      values.push(id);
      rawDb.prepare(`UPDATE "webhooks" SET ${sets.join(', ')} WHERE id = ?`).run(...values);
      return this.findOne(id);
    },

    deleteById(id) {
      const result = rawDb.prepare(`DELETE FROM "webhooks" WHERE id = ?`).run(id);
      return result.changes > 0;
    },

    async trigger(event, payload) {
      const allWebhooks = this.findAll().filter(w => w.enabled && w.events.includes(event));
      if (allWebhooks.length === 0) return [];

      const body: WebhookPayload = {
        event,
        createdAt: new Date().toISOString(),
        ...payload,
      };
      const bodyStr = JSON.stringify(body);
      const signature = signPayload(bodyStr, secret);

      const deliveries: WebhookDelivery[] = [];

      // Process in batches of maxConcurrency
      for (let i = 0; i < allWebhooks.length; i += maxConcurrency) {
        const batch = allWebhooks.slice(i, i + maxConcurrency);
        const results = await Promise.allSettled(
          batch.map(async (webhook) => {
            const start = Date.now();
            const headers: Record<string, string> = {
              'Content-Type': 'application/json',
              'X-Apick-Event': event,
              'X-Apick-Signature': signature,
              ...webhook.headers,
            };

            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), timeoutMs);

            try {
              const doFetch = fetcher || globalFetch;
              const response = await doFetch(webhook.url, {
                method: 'POST',
                headers,
                body: bodyStr,
                signal: controller.signal,
              });
              clearTimeout(timeout);

              const duration = Date.now() - start;
              return {
                webhookId: webhook.id!,
                event, url: webhook.url,
                statusCode: response.status,
                duration,
                success: response.status >= 200 && response.status < 300,
                createdAt: new Date().toISOString(),
              } satisfies WebhookDelivery;
            } catch (err: any) {
              clearTimeout(timeout);
              const duration = Date.now() - start;
              return {
                webhookId: webhook.id!,
                event, url: webhook.url,
                statusCode: null,
                duration,
                success: false,
                error: err.message || 'Unknown error',
                createdAt: new Date().toISOString(),
              } satisfies WebhookDelivery;
            }
          }),
        );

        for (const result of results) {
          if (result.status === 'fulfilled') {
            deliveries.push(result.value);
          }
        }
      }

      return deliveries;
    },

    getAvailableEvents() {
      return [...AVAILABLE_EVENTS];
    },

    setSecret(s) {
      secret = s;
    },

    setFetcher(fn) {
      fetcher = fn;
    },
  };
}

// Fallback for environments with global fetch
function globalFetch(url: string, init: { method: string; headers: Record<string, string>; body: string; signal: AbortSignal }): Promise<{ status: number }> {
  return fetch(url, init).then(r => ({ status: r.status }));
}
