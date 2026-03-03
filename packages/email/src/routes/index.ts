/**
 * Email admin routes.
 *
 * POST /admin/email/test — send a test email.
 */

import type { EmailService } from '../services/email.js';

export interface EmailRoutesConfig {
  router: {
    on(method: string, path: string, handler: (req: any, res: any, params: any) => void): void;
  };
  emailService: EmailService;
  auth?: {
    verify(token: string): { id: number } | null;
  };
}

export function registerEmailRoutes(config: EmailRoutesConfig): void {
  const { router, emailService, auth } = config;

  // POST /admin/email/test
  router.on('POST', '/admin/email/test', async (req: any, res: any) => {
    try {
      // Optional auth check
      if (auth) {
        const authHeader = req.headers?.authorization || '';
        const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
        if (!token || !auth.verify(token)) {
          res.statusCode = 401;
          res.end(JSON.stringify({ data: null, error: { status: 401, name: 'UnauthorizedError', message: 'Missing or invalid credentials' } }));
          return;
        }
      }

      const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
      const to = body.to;

      if (!to) {
        res.statusCode = 400;
        res.end(JSON.stringify({ data: null, error: { status: 400, name: 'ValidationError', message: '"to" is required' } }));
        return;
      }

      const result = await emailService.sendTestEmail(to);

      res.statusCode = 200;
      res.end(JSON.stringify({ data: result }));
    } catch (err: any) {
      res.statusCode = 400;
      res.end(JSON.stringify({ data: null, error: { status: 400, name: 'ApplicationError', message: err.message } }));
    }
  });

  // GET /admin/email/settings
  router.on('GET', '/admin/email/settings', (req: any, res: any) => {
    if (auth) {
      const authHeader = req.headers?.authorization || '';
      const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
      if (!token || !auth.verify(token)) {
        res.statusCode = 401;
        res.end(JSON.stringify({ data: null, error: { status: 401, name: 'UnauthorizedError', message: 'Missing or invalid credentials' } }));
        return;
      }
    }

    res.statusCode = 200;
    res.end(JSON.stringify({ data: { provider: emailService.getProviderName() } }));
  });
}
