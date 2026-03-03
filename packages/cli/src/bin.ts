#!/usr/bin/env node
/**
 * APICK CLI entry point.
 *
 * Usage:
 *   npx apick develop
 *   npx apick start
 */

import { register } from 'node:module';

// Register tsx so user .ts files (content types, config) can be imported
try {
  register('tsx/esm', import.meta.url);
} catch {
  // tsx not available — .js imports still work (pre-compiled production code)
}

import { createCli, builtinCommands } from './cli.js';

const cli = createCli('0.3.0');

for (const cmd of builtinCommands) {
  cli.register(cmd);
}

cli.run(process.argv);
