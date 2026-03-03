import { describe, it, expect, beforeEach } from 'vitest';
import { createEmailService } from '../src/services/email.js';
import { registerEmailRoutes } from '../src/routes/index.js';
import type { EmailService, EmailProvider } from '../src/services/email.js';

describe('@apick/email', () => {
  let service: EmailService;

  beforeEach(() => {
    service = createEmailService();
  });

  // ---------------------------------------------------------------------------
  // Basic sending
  // ---------------------------------------------------------------------------

  describe('Email sending', () => {
    it('sends an email with text content', async () => {
      const sentEmails: any[] = [];
      const provider: EmailProvider = {
        send(options) { sentEmails.push(options); },
      };
      service.setProvider(provider);

      const result = await service.send({
        to: 'user@example.com',
        subject: 'Hello',
        text: 'World',
      });

      expect(result.accepted).toEqual(['user@example.com']);
      expect(result.rejected).toEqual([]);
      expect(sentEmails).toHaveLength(1);
      expect(sentEmails[0].to).toEqual(['user@example.com']);
      expect(sentEmails[0].subject).toBe('Hello');
    });

    it('sends an email with html content', async () => {
      const sentEmails: any[] = [];
      const provider: EmailProvider = { send(o) { sentEmails.push(o); } };
      service.setProvider(provider);

      await service.send({
        to: 'user@example.com',
        subject: 'HTML Email',
        html: '<p>Hello</p>',
      });

      expect(sentEmails[0].html).toBe('<p>Hello</p>');
    });

    it('sends to multiple recipients', async () => {
      const sentEmails: any[] = [];
      const provider: EmailProvider = { send(o) { sentEmails.push(o); } };
      service.setProvider(provider);

      const result = await service.send({
        to: ['a@example.com', 'b@example.com'],
        subject: 'Multi',
        text: 'Hi all',
      });

      expect(result.accepted).toEqual(['a@example.com', 'b@example.com']);
    });

    it('includes cc and bcc recipients', async () => {
      const sentEmails: any[] = [];
      const provider: EmailProvider = { send(o) { sentEmails.push(o); } };
      service.setProvider(provider);

      await service.send({
        to: 'to@example.com',
        cc: 'cc@example.com',
        bcc: ['bcc1@example.com', 'bcc2@example.com'],
        subject: 'CC/BCC Test',
        text: 'Content',
      });

      expect(sentEmails[0].cc).toEqual(['cc@example.com']);
      expect(sentEmails[0].bcc).toEqual(['bcc1@example.com', 'bcc2@example.com']);
    });

    it('applies default from and replyTo', async () => {
      const svc = createEmailService({
        defaultFrom: 'noreply@myapp.com',
        defaultReplyTo: 'support@myapp.com',
      });
      const sentEmails: any[] = [];
      const provider: EmailProvider = { send(o) { sentEmails.push(o); } };
      svc.setProvider(provider);

      await svc.send({ to: 'user@example.com', subject: 'Defaults', text: 'Test' });

      expect(sentEmails[0].from).toBe('noreply@myapp.com');
      expect(sentEmails[0].replyTo).toBe('support@myapp.com');
    });

    it('allows overriding from and replyTo', async () => {
      const svc = createEmailService({ defaultFrom: 'default@app.com' });
      const sentEmails: any[] = [];
      const provider: EmailProvider = { send(o) { sentEmails.push(o); } };
      svc.setProvider(provider);

      await svc.send({
        to: 'user@example.com',
        from: 'custom@app.com',
        replyTo: 'reply@app.com',
        subject: 'Override',
        text: 'Test',
      });

      expect(sentEmails[0].from).toBe('custom@app.com');
      expect(sentEmails[0].replyTo).toBe('reply@app.com');
    });
  });

  // ---------------------------------------------------------------------------
  // Validation
  // ---------------------------------------------------------------------------

  describe('Validation', () => {
    it('rejects empty to field', async () => {
      await expect(service.send({ to: [], subject: 'Test', text: 'Content' }))
        .rejects.toThrow('"to" field is required');
    });

    it('rejects missing subject', async () => {
      await expect(service.send({ to: 'user@example.com', subject: '', text: 'Content' }))
        .rejects.toThrow('"subject" field is required');
    });

    it('rejects missing text and html', async () => {
      await expect(service.send({ to: 'user@example.com', subject: 'Test' }))
        .rejects.toThrow('either "text" or "html"');
    });

    it('rejects invalid email address', async () => {
      await expect(service.send({ to: 'not-an-email', subject: 'Test', text: 'Content' }))
        .rejects.toThrow('Invalid email address');
    });

    it('rejects invalid from address', async () => {
      await expect(service.send({ to: 'valid@example.com', from: 'bad-from', subject: 'Test', text: 'Content' }))
        .rejects.toThrow('Invalid "from" email address');
    });

    it('rejects invalid replyTo address', async () => {
      await expect(service.send({ to: 'valid@example.com', replyTo: 'bad', subject: 'Test', text: 'Content' }))
        .rejects.toThrow('Invalid "replyTo" email address');
    });
  });

  // ---------------------------------------------------------------------------
  // Error handling
  // ---------------------------------------------------------------------------

  describe('Error handling', () => {
    it('marks recipients as rejected when provider throws', async () => {
      const provider: EmailProvider = {
        send() { throw new Error('SMTP error'); },
      };
      service.setProvider(provider);

      const result = await service.send({
        to: 'user@example.com',
        subject: 'Fail',
        text: 'Content',
      });

      expect(result.accepted).toEqual([]);
      expect(result.rejected).toEqual(['user@example.com']);
    });
  });

  // ---------------------------------------------------------------------------
  // Test email
  // ---------------------------------------------------------------------------

  describe('Test email', () => {
    it('sends a test email', async () => {
      const sentEmails: any[] = [];
      const provider: EmailProvider = { send(o) { sentEmails.push(o); } };
      service.setProvider(provider);

      const result = await service.sendTestEmail('admin@example.com');
      expect(result.accepted).toEqual(['admin@example.com']);
      expect(sentEmails[0].subject).toContain('Test Email');
      expect(sentEmails[0].text).toContain('test email');
      expect(sentEmails[0].html).toContain('test email');
    });
  });

  // ---------------------------------------------------------------------------
  // Provider info
  // ---------------------------------------------------------------------------

  describe('Provider info', () => {
    it('returns default provider name', () => {
      expect(service.getProviderName()).toBe('default');
    });

    it('returns custom provider name', () => {
      const svc = createEmailService({ providerName: 'sendgrid' });
      expect(svc.getProviderName()).toBe('sendgrid');
    });
  });

  // ---------------------------------------------------------------------------
  // Routes
  // ---------------------------------------------------------------------------

  describe('Routes', () => {
    it('registers routes on the router', () => {
      const routes: string[] = [];
      const mockRouter = {
        on(method: string, path: string) { routes.push(`${method} ${path}`); },
      };
      registerEmailRoutes({ router: mockRouter, emailService: service });
      expect(routes).toContain('POST /admin/email/test');
      expect(routes).toContain('GET /admin/email/settings');
    });
  });
});
