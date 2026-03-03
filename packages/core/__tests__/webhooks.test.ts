import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { createWebhookService } from '../src/webhooks/index.js';
import type { WebhookService, WebhookFetcher } from '../src/webhooks/index.js';

function createDb() {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  return db;
}

describe('Webhook Service', () => {
  let db: ReturnType<typeof Database>;
  let service: WebhookService;

  beforeEach(() => {
    db = createDb();
    service = createWebhookService({ rawDb: db, secret: 'test-secret' });
  });

  // ---------------------------------------------------------------------------
  // CRUD
  // ---------------------------------------------------------------------------

  describe('CRUD', () => {
    it('creates a webhook', () => {
      const wh = service.create({
        name: 'Deploy Hook', url: 'https://hooks.example.com/deploy',
        events: ['entry.create', 'entry.update'],
      });
      expect(wh.id).toBeDefined();
      expect(wh.name).toBe('Deploy Hook');
      expect(wh.url).toBe('https://hooks.example.com/deploy');
      expect(wh.events).toEqual(['entry.create', 'entry.update']);
      expect(wh.enabled).toBe(true);
    });

    it('creates a webhook with custom headers', () => {
      const wh = service.create({
        name: 'With Headers', url: 'https://example.com/hook',
        events: ['entry.create'], headers: { 'X-Custom': 'value' },
      });
      expect(wh.headers).toEqual({ 'X-Custom': 'value' });
    });

    it('creates a disabled webhook', () => {
      const wh = service.create({
        name: 'Disabled', url: 'https://example.com', events: ['entry.create'], enabled: false,
      });
      expect(wh.enabled).toBe(false);
    });

    it('lists all webhooks', () => {
      service.create({ name: 'WH1', url: 'https://a.com', events: ['entry.create'] });
      service.create({ name: 'WH2', url: 'https://b.com', events: ['entry.update'] });
      expect(service.findAll()).toHaveLength(2);
    });

    it('finds a webhook by id', () => {
      const created = service.create({ name: 'Find Me', url: 'https://x.com', events: [] });
      const found = service.findOne(created.id!);
      expect(found).not.toBeNull();
      expect(found!.name).toBe('Find Me');
    });

    it('returns null for non-existent webhook', () => {
      expect(service.findOne(999)).toBeNull();
    });

    it('updates a webhook', () => {
      const wh = service.create({ name: 'Old', url: 'https://old.com', events: ['entry.create'] });
      const updated = service.updateById(wh.id!, { name: 'Updated', url: 'https://new.com', events: ['entry.delete'] });
      expect(updated!.name).toBe('Updated');
      expect(updated!.url).toBe('https://new.com');
      expect(updated!.events).toEqual(['entry.delete']);
    });

    it('enables/disables a webhook', () => {
      const wh = service.create({ name: 'Toggle', url: 'https://x.com', events: [] });
      const disabled = service.updateById(wh.id!, { enabled: false });
      expect(disabled!.enabled).toBe(false);
      const enabled = service.updateById(wh.id!, { enabled: true });
      expect(enabled!.enabled).toBe(true);
    });

    it('deletes a webhook', () => {
      const wh = service.create({ name: 'Delete', url: 'https://x.com', events: [] });
      expect(service.deleteById(wh.id!)).toBe(true);
      expect(service.findOne(wh.id!)).toBeNull();
    });

    it('returns false when deleting non-existent webhook', () => {
      expect(service.deleteById(999)).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // Triggering
  // ---------------------------------------------------------------------------

  describe('Triggering', () => {
    it('triggers matching webhooks', async () => {
      const requests: { url: string; body: any; headers: any }[] = [];
      const fakeFetcher: WebhookFetcher = async (url, init) => {
        requests.push({ url, body: JSON.parse(init.body), headers: init.headers });
        return { status: 200 };
      };
      service.setFetcher(fakeFetcher);

      service.create({ name: 'H1', url: 'https://a.com/hook', events: ['entry.create'] });
      service.create({ name: 'H2', url: 'https://b.com/hook', events: ['entry.update'] });

      const deliveries = await service.trigger('entry.create', { model: 'article', uid: 'api::article.article' });
      expect(deliveries).toHaveLength(1);
      expect(deliveries[0].url).toBe('https://a.com/hook');
      expect(deliveries[0].success).toBe(true);
      expect(requests).toHaveLength(1);
      expect(requests[0].body.event).toBe('entry.create');
    });

    it('does not trigger disabled webhooks', async () => {
      const requests: any[] = [];
      const fakeFetcher: WebhookFetcher = async (url, init) => {
        requests.push(url);
        return { status: 200 };
      };
      service.setFetcher(fakeFetcher);

      service.create({ name: 'Disabled', url: 'https://a.com', events: ['entry.create'], enabled: false });

      const deliveries = await service.trigger('entry.create', {});
      expect(deliveries).toHaveLength(0);
      expect(requests).toHaveLength(0);
    });

    it('does not trigger webhooks for unmatched events', async () => {
      const requests: any[] = [];
      const fakeFetcher: WebhookFetcher = async () => {
        requests.push(true);
        return { status: 200 };
      };
      service.setFetcher(fakeFetcher);

      service.create({ name: 'Only Delete', url: 'https://a.com', events: ['entry.delete'] });

      const deliveries = await service.trigger('entry.create', {});
      expect(deliveries).toHaveLength(0);
    });

    it('includes HMAC signature in headers', async () => {
      let capturedHeaders: Record<string, string> = {};
      const fakeFetcher: WebhookFetcher = async (_url, init) => {
        capturedHeaders = init.headers;
        return { status: 200 };
      };
      service.setFetcher(fakeFetcher);

      service.create({ name: 'Signed', url: 'https://a.com', events: ['entry.create'] });
      await service.trigger('entry.create', {});

      expect(capturedHeaders['X-Apick-Signature']).toBeDefined();
      expect(capturedHeaders['X-Apick-Signature'].length).toBeGreaterThan(0);
      expect(capturedHeaders['X-Apick-Event']).toBe('entry.create');
      expect(capturedHeaders['Content-Type']).toBe('application/json');
    });

    it('includes custom webhook headers', async () => {
      let capturedHeaders: Record<string, string> = {};
      const fakeFetcher: WebhookFetcher = async (_url, init) => {
        capturedHeaders = init.headers;
        return { status: 200 };
      };
      service.setFetcher(fakeFetcher);

      service.create({
        name: 'Custom Headers', url: 'https://a.com', events: ['entry.create'],
        headers: { 'X-My-Header': 'custom-value' },
      });
      await service.trigger('entry.create', {});

      expect(capturedHeaders['X-My-Header']).toBe('custom-value');
    });

    it('reports failed delivery when fetch fails', async () => {
      const fakeFetcher: WebhookFetcher = async () => {
        throw new Error('Connection refused');
      };
      service.setFetcher(fakeFetcher);

      service.create({ name: 'Failing', url: 'https://unreachable.com', events: ['entry.create'] });
      const deliveries = await service.trigger('entry.create', {});

      expect(deliveries).toHaveLength(1);
      expect(deliveries[0].success).toBe(false);
      expect(deliveries[0].statusCode).toBeNull();
      expect(deliveries[0].error).toContain('Connection refused');
    });

    it('reports non-success status codes', async () => {
      const fakeFetcher: WebhookFetcher = async () => ({ status: 500 });
      service.setFetcher(fakeFetcher);

      service.create({ name: 'ServerError', url: 'https://a.com', events: ['entry.create'] });
      const deliveries = await service.trigger('entry.create', {});

      expect(deliveries[0].success).toBe(false);
      expect(deliveries[0].statusCode).toBe(500);
    });

    it('triggers multiple webhooks for the same event', async () => {
      const urls: string[] = [];
      const fakeFetcher: WebhookFetcher = async (url) => {
        urls.push(url);
        return { status: 200 };
      };
      service.setFetcher(fakeFetcher);

      service.create({ name: 'H1', url: 'https://a.com', events: ['entry.create'] });
      service.create({ name: 'H2', url: 'https://b.com', events: ['entry.create'] });
      service.create({ name: 'H3', url: 'https://c.com', events: ['entry.create'] });

      const deliveries = await service.trigger('entry.create', {});
      expect(deliveries).toHaveLength(3);
      expect(urls).toHaveLength(3);
    });
  });

  // ---------------------------------------------------------------------------
  // Available events
  // ---------------------------------------------------------------------------

  describe('Available events', () => {
    it('returns the list of available events', () => {
      const events = service.getAvailableEvents();
      expect(events).toContain('entry.create');
      expect(events).toContain('entry.update');
      expect(events).toContain('entry.delete');
      expect(events).toContain('entry.publish');
      expect(events).toContain('media.create');
      expect(events).toContain('review-workflows.stageChange');
    });
  });
});
