/**
 * Email Service.
 *
 * Provider-based email sending with test endpoint support.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EmailOptions {
  to: string | string[];
  from?: string;
  cc?: string | string[];
  bcc?: string | string[];
  replyTo?: string;
  subject: string;
  text?: string;
  html?: string;
}

export interface EmailProvider {
  send(options: EmailOptions): Promise<void> | void;
}

export interface EmailSendResult {
  accepted: string[];
  rejected: string[];
}

export interface EmailService {
  send(options: EmailOptions): Promise<EmailSendResult>;
  sendTestEmail(to: string): Promise<EmailSendResult>;
  setProvider(provider: EmailProvider): void;
  getProviderName(): string;
}

export interface EmailServiceConfig {
  provider?: EmailProvider;
  providerName?: string;
  defaultFrom?: string;
  defaultReplyTo?: string;
}

// ---------------------------------------------------------------------------
// Default provider — uses Resend if RESEND_API_KEY is set, otherwise no-op
// ---------------------------------------------------------------------------

function createDefaultProvider(): EmailProvider {
  const resendKey = typeof process !== 'undefined' ? process.env?.RESEND_API_KEY : undefined;

  if (resendKey) {
    return {
      async send(options) {
        const to = Array.isArray(options.to) ? options.to : [options.to];
        const body: Record<string, any> = {
          from: options.from || 'APICK CMS <onboarding@resend.dev>',
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
            'Authorization': `Bearer ${resendKey}`,
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

  // No-op fallback — logs warning once
  let warned = false;
  return {
    send(options) {
      if (!warned) {
        console.warn('[apick:email] No email provider configured. Set RESEND_API_KEY or provide a custom provider. Emails will be silently dropped.');
        warned = true;
      }
      void options;
    },
  };
}

const defaultProvider: EmailProvider = createDefaultProvider();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normalizeRecipients(value: string | string[] | undefined): string[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// ---------------------------------------------------------------------------
// Service factory
// ---------------------------------------------------------------------------

export function createEmailService(config: EmailServiceConfig = {}): EmailService {
  let provider = config.provider || defaultProvider;
  let providerName = config.providerName || 'default';
  const defaultFrom = config.defaultFrom || 'noreply@apick.local';
  const defaultReplyTo = config.defaultReplyTo;

  return {
    async send(options) {
      const to = normalizeRecipients(options.to);
      const cc = normalizeRecipients(options.cc);
      const bcc = normalizeRecipients(options.bcc);

      if (to.length === 0) {
        throw new Error('Email "to" field is required and must not be empty');
      }

      if (!options.subject) {
        throw new Error('Email "subject" field is required');
      }

      if (!options.text && !options.html) {
        throw new Error('Email must have either "text" or "html" content');
      }

      // Validate all email addresses
      const allRecipients = [...to, ...cc, ...bcc];
      for (const email of allRecipients) {
        if (!validateEmail(email)) {
          throw new Error(`Invalid email address: ${email}`);
        }
      }

      if (options.from && !validateEmail(options.from)) {
        throw new Error(`Invalid "from" email address: ${options.from}`);
      }
      if (options.replyTo && !validateEmail(options.replyTo)) {
        throw new Error(`Invalid "replyTo" email address: ${options.replyTo}`);
      }

      const finalOptions: EmailOptions = {
        ...options,
        to,
        cc: cc.length > 0 ? cc : undefined,
        bcc: bcc.length > 0 ? bcc : undefined,
        from: options.from || defaultFrom,
        replyTo: options.replyTo || defaultReplyTo,
      };

      const accepted: string[] = [];
      const rejected: string[] = [];

      try {
        await provider.send(finalOptions);
        accepted.push(...allRecipients);
      } catch {
        rejected.push(...allRecipients);
      }

      return { accepted, rejected };
    },

    async sendTestEmail(to) {
      return this.send({
        to,
        subject: 'APICK Test Email',
        text: 'This is a test email sent from APICK CMS.\n\nIf you received this email, your email provider is configured correctly.',
        html: '<p>This is a test email sent from <strong>APICK CMS</strong>.</p><p>If you received this email, your email provider is configured correctly.</p>',
      });
    },

    setProvider(p) {
      provider = p;
    },

    getProviderName() {
      return providerName;
    },
  };
}
