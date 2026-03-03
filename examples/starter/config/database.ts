import type { ConfigFactory, DatabaseConfig } from '@apick/types';

const config: ConfigFactory<DatabaseConfig> = ({ env }) => ({
  connection: {
    client: env('DATABASE_CLIENT', 'sqlite') as 'sqlite',
    connection: {
      filename: env('DATABASE_FILENAME', '.tmp/data.db'),
    },
  },
});

export default config;
