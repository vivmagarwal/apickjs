/**
 * Stub for @apick/core used during CLI unit tests.
 * The CLI develop/start commands dynamically import @apick/core at runtime,
 * but the CLI unit tests only test the CLI framework — not the server boot.
 */
export class Apick {
  contentTypes: Record<string, any> = {};
  policies: Record<string, any> = {};
  middlewares: Record<string, any> = {};
  server = {
    getRoutes: () => [] as { method: string; path: string }[],
  };

  constructor(_opts: any) {}
  async load() {}
  async listen() {}
  async destroy() {}
}
