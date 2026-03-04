import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      // Stub @apick/core during tests — it's only used at runtime by develop/start commands
      '@apick/core': new URL('./__tests__/stubs/apick-core.ts', import.meta.url).pathname,
      // Stub @apick/generators during tests — generators are tested in their own package
      '@apick/generators': new URL('./__tests__/stubs/apick-generators.ts', import.meta.url).pathname,
    },
  },
  test: {
    include: ['__tests__/**/*.test.ts'],
  },
});
