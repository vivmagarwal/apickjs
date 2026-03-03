import type { ConfigFactory, ApiConfig } from '@apick/types';

const config: ConfigFactory<Partial<ApiConfig>> = () => ({
  rest: {
    prefix: '/api',
    defaultLimit: 25,
    maxLimit: 100,
    withCount: true,
  },
});

export default config;
