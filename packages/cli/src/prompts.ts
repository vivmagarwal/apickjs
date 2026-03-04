/**
 * Interactive prompt system built on Node.js readline.
 *
 * Zero external dependencies. Supports custom input/output streams for testing.
 */

import * as readline from 'node:readline';
import { colors } from './colors.js';

export interface PromptOptions {
  input?: NodeJS.ReadableStream;
  output?: NodeJS.WritableStream;
}

export interface TextOptions extends PromptOptions {
  default?: string;
  validate?: (value: string) => string | true;
  hint?: string;
}

export interface Choice {
  label: string;
  value: string;
  hint?: string;
}

// ---------------------------------------------------------------------------
// Text input
// ---------------------------------------------------------------------------

export async function text(message: string, opts: TextOptions = {}): Promise<string> {
  const input = opts.input || process.stdin;
  const output = opts.output || process.stdout;

  const rl = readline.createInterface({ input, output, terminal: false });

  const defaultHint = opts.default ? colors.dim(` (${opts.default})`) : '';
  const hint = opts.hint ? colors.dim(` ${opts.hint}`) : '';

  return new Promise<string>((resolve) => {
    const ask = () => {
      output.write(`${colors.cyan('?')} ${colors.bold(message)}${defaultHint}${hint}: `);
      rl.once('line', (line) => {
        const value = line.trim() || opts.default || '';

        if (opts.validate) {
          const result = opts.validate(value);
          if (result !== true) {
            output.write(`  ${colors.red(result)}\n`);
            ask();
            return;
          }
        }

        rl.close();
        resolve(value);
      });
    };

    // Handle Ctrl+C
    rl.on('close', () => {
      // If we haven't resolved yet, resolve with default or empty
    });

    ask();
  });
}

// ---------------------------------------------------------------------------
// Select (single choice)
// ---------------------------------------------------------------------------

export async function select(message: string, choices: Choice[], opts: PromptOptions = {}): Promise<string> {
  const input = opts.input || process.stdin;
  const output = opts.output || process.stdout;

  // Non-TTY fallback: numeric selection
  const rl = readline.createInterface({ input, output, terminal: false });

  output.write(`${colors.cyan('?')} ${colors.bold(message)}\n`);
  choices.forEach((choice, i) => {
    const hint = choice.hint ? colors.dim(` — ${choice.hint}`) : '';
    output.write(`  ${colors.cyan(`${i + 1})`)} ${choice.label}${hint}\n`);
  });

  return new Promise<string>((resolve) => {
    const ask = () => {
      output.write(`${colors.cyan('>')} Enter number (1-${choices.length}): `);
      rl.once('line', (line) => {
        const num = parseInt(line.trim(), 10);
        if (num >= 1 && num <= choices.length) {
          rl.close();
          output.write(`  ${colors.dim(`Selected: ${choices[num - 1].label}`)}\n`);
          resolve(choices[num - 1].value);
        } else {
          output.write(`  ${colors.red(`Please enter a number between 1 and ${choices.length}`)}\n`);
          ask();
        }
      });
    };
    ask();
  });
}

// ---------------------------------------------------------------------------
// Confirm (Y/n)
// ---------------------------------------------------------------------------

export async function confirm(message: string, defaultValue = true, opts: PromptOptions = {}): Promise<boolean> {
  const input = opts.input || process.stdin;
  const output = opts.output || process.stdout;

  const rl = readline.createInterface({ input, output, terminal: false });
  const hint = defaultValue ? 'Y/n' : 'y/N';

  return new Promise<boolean>((resolve) => {
    output.write(`${colors.cyan('?')} ${colors.bold(message)} ${colors.dim(`(${hint})`)}: `);
    rl.once('line', (line) => {
      rl.close();
      const val = line.trim().toLowerCase();
      if (val === '') {
        resolve(defaultValue);
      } else {
        resolve(val === 'y' || val === 'yes');
      }
    });
  });
}

// ---------------------------------------------------------------------------
// Multi-select (space to toggle, enter to confirm)
// ---------------------------------------------------------------------------

export async function multiSelect(message: string, choices: Choice[], opts: PromptOptions = {}): Promise<string[]> {
  const input = opts.input || process.stdin;
  const output = opts.output || process.stdout;

  // Non-TTY fallback: comma-separated numbers
  const rl = readline.createInterface({ input, output, terminal: false });

  output.write(`${colors.cyan('?')} ${colors.bold(message)}\n`);
  choices.forEach((choice, i) => {
    const hint = choice.hint ? colors.dim(` — ${choice.hint}`) : '';
    output.write(`  ${colors.cyan(`${i + 1})`)} ${choice.label}${hint}\n`);
  });

  return new Promise<string[]>((resolve) => {
    const ask = () => {
      output.write(`${colors.cyan('>')} Enter numbers separated by commas (e.g. 1,3,4): `);
      rl.once('line', (line) => {
        const parts = line.trim().split(',').map(s => s.trim()).filter(Boolean);
        const nums = parts.map(s => parseInt(s, 10));
        const valid = nums.every(n => n >= 1 && n <= choices.length);

        if (parts.length === 0) {
          rl.close();
          resolve([]);
          return;
        }

        if (!valid) {
          output.write(`  ${colors.red(`Please enter numbers between 1 and ${choices.length}`)}\n`);
          ask();
          return;
        }

        rl.close();
        const selected = nums.map(n => choices[n - 1].value);
        const labels = nums.map(n => choices[n - 1].label).join(', ');
        output.write(`  ${colors.dim(`Selected: ${labels}`)}\n`);
        resolve(selected);
      });
    };
    ask();
  });
}
