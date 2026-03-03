#!/usr/bin/env node
/**
 * APICK CLI entry point.
 *
 * Usage:
 *   npx tsx packages/cli/src/bin.ts develop
 *   npx tsx packages/cli/src/bin.ts start
 */

import { createCli, builtinCommands } from './cli.js';

const cli = createCli('0.1.0');

for (const cmd of builtinCommands) {
  cli.register(cmd);
}

cli.run(process.argv);
