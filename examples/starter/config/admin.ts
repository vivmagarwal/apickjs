import type { ConfigFactory, AdminConfig } from '@apick/types';

const config: ConfigFactory<Partial<AdminConfig>> = ({ env }) => ({
  auth: {
    secret: env('ADMIN_JWT_SECRET', 'change-me'),
  },
  apiToken: {
    salt: env('API_TOKEN_SALT', 'change-me'),
  },
  transfer: {
    token: {
      salt: env('TRANSFER_TOKEN_SALT', 'change-me'),
    },
  },
});

export default config;
