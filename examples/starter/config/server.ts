import type { ConfigFactory, ServerConfig } from '@apick/types';

const config: ConfigFactory<Partial<ServerConfig>> = ({ env }) => ({
  host: env('HOST', '0.0.0.0'),
  port: env.int('PORT', 1337),
  app: {
    keys: env.array('APP_KEYS'),
  },
  cron: {
    enabled: false,
    tasks: {},
  },
});

export default config;
