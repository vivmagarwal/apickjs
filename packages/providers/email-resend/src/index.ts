/**
 * @apick/provider-email-resend — Resend Email Provider.
 *
 * Sends real emails via the Resend REST API (https://resend.com/docs/api-reference).
 * No SDK dependency — uses fetch directly.
 */

// Inline EmailProvider/EmailOptions to avoid cross-package resolution issues
interface EmailOptions {
  to: string | string[];
  from?: string;
  cc?: string | string[];
  bcc?: string | string[];
  replyTo?: string;
  subject: string;
  text?: string;
  html?: string;
}

interface EmailProvider {
  send(options: EmailOptions): Promise<void> | void;
}

export interface ResendProviderConfig {
  apiKey: string;
  defaultFrom?: string;
}

export function createResendProvider(config: ResendProviderConfig): EmailProvider {
  const { apiKey, defaultFrom } = config;

  if (!apiKey) {
    throw new Error('Resend API key is required. Set RESEND_API_KEY environment variable.');
  }

  return {
    async send(options: EmailOptions): Promise<void> {
      const to = Array.isArray(options.to) ? options.to : [options.to];
      const from = options.from || defaultFrom || 'APICK CMS <onboarding@resend.dev>';

      const body: Record<string, any> = {
        from,
        to,
        subject: options.subject,
      };

      if (options.text) body.text = options.text;
      if (options.html) body.html = options.html;
      if (options.cc) body.cc = Array.isArray(options.cc) ? options.cc : [options.cc];
      if (options.bcc) body.bcc = Array.isArray(options.bcc) ? options.bcc : [options.bcc];
      if (options.replyTo) body.reply_to = options.replyTo;

      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Resend API error (${response.status}): ${error}`);
      }
    },
  };
}
