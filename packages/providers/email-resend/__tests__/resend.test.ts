import { describe, it, expect } from 'vitest';
import { createResendProvider } from '../src/index.js';

/**
 * Resend Email Provider Tests.
 *
 * Tests with real Resend API when RESEND_API_KEY is set.
 * Uses Mailinator for delivery verification (public inbox, no auth needed).
 */

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const skipReason = !RESEND_API_KEY ? 'RESEND_API_KEY not set — skipping real email tests' : '';

describe('Resend Email Provider', () => {
  it('has correct factory function', () => {
    expect(typeof createResendProvider).toBe('function');
  });

  it('throws without API key', () => {
    expect(() => createResendProvider({ apiKey: '' })).toThrow('API key is required');
  });

  it('creates a provider with send method', () => {
    const provider = createResendProvider({ apiKey: 'test-key' });
    expect(typeof provider.send).toBe('function');
  });

  describe.skipIf(!RESEND_API_KEY)('real API calls', () => {
    it('sends a real email to Mailinator', async () => {
      const provider = createResendProvider({
        apiKey: RESEND_API_KEY!,
        defaultFrom: 'APICK CMS <onboarding@resend.dev>',
      });

      // Mailinator inbox — publicly readable, no auth needed
      const testEmail = `apick-test-${Date.now()}@mailinator.com`;

      // This should NOT throw — Resend accepts the email for delivery
      await expect(
        provider.send({
          to: testEmail,
          subject: `APICK Test ${new Date().toISOString()}`,
          text: 'This is a test email sent from APICK CMS Resend provider test suite.',
          html: '<p>This is a test email sent from <strong>APICK CMS</strong> Resend provider test suite.</p>',
        })
      ).resolves.toBeUndefined();
    });

    it('sends email with cc and replyTo', async () => {
      const provider = createResendProvider({
        apiKey: RESEND_API_KEY!,
        defaultFrom: 'APICK CMS <onboarding@resend.dev>',
      });

      const testEmail = `apick-cc-test-${Date.now()}@mailinator.com`;

      await expect(
        provider.send({
          to: testEmail,
          subject: `APICK CC Test ${new Date().toISOString()}`,
          text: 'Testing CC and replyTo fields.',
          replyTo: 'noreply@example.com',
        })
      ).resolves.toBeUndefined();
    });

    it('rejects with invalid API key', async () => {
      const provider = createResendProvider({ apiKey: 'invalid-key' });

      await expect(
        provider.send({
          to: 'test@mailinator.com',
          subject: 'Should Fail',
          text: 'This should not be sent.',
        })
      ).rejects.toThrow('Resend API error');
    });
  });
});
