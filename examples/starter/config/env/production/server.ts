import type { ConfigFactory, ServerConfig } from '@apick/types';

const config: ConfigFactory<Partial<ServerConfig>> = ({ env }) => ({
  url: env('PUBLIC_URL', 'https://api.example.com'),
  proxy: {
    enabled: true,
  },
});

export default config;
