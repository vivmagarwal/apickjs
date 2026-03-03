/**
 * Stub for @apick/core used during CLI unit tests.
 * The CLI develop/start commands dynamically import @apick/core at runtime,
 * but the CLI unit tests only test the CLI framework — not the server boot.
 */
export class Apick {
  constructor(_opts: any) {}
  async load() {}
  async listen() {}
  async destroy() {}
}
