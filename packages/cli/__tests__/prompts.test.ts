import { describe, it, expect } from 'vitest';
import { Readable, Writable } from 'node:stream';
import { text, select, confirm, multiSelect } from '../src/prompts.js';

function createMockInput(lines: string[]): NodeJS.ReadableStream {
  const data = lines.join('\n') + '\n';
  return new Readable({
    read() {
      this.push(data);
      this.push(null);
    },
  });
}

function createMockOutput(): { stream: NodeJS.WritableStream; data: string } {
  let data = '';
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      data += chunk.toString();
      callback();
    },
  }) as NodeJS.WritableStream;
  return { stream, get data() { return data; } };
}

describe('prompts', () => {
  describe('text', () => {
    it('returns user input', async () => {
      const input = createMockInput(['hello']);
      const output = createMockOutput();
      const result = await text('Name?', { input, output: output.stream });
      expect(result).toBe('hello');
    });

    it('returns default when input is empty', async () => {
      const input = createMockInput(['']);
      const output = createMockOutput();
      const result = await text('Name?', { input, output: output.stream, default: 'world' });
      expect(result).toBe('world');
    });

    it('trims whitespace', async () => {
      const input = createMockInput(['  hello  ']);
      const output = createMockOutput();
      const result = await text('Name?', { input, output: output.stream });
      expect(result).toBe('hello');
    });
  });

  describe('select', () => {
    it('returns the selected choice value', async () => {
      const input = createMockInput(['2']);
      const output = createMockOutput();
      const result = await select('Pick?', [
        { label: 'A', value: 'a' },
        { label: 'B', value: 'b' },
        { label: 'C', value: 'c' },
      ], { input, output: output.stream });
      expect(result).toBe('b');
    });

    it('returns first choice for selection 1', async () => {
      const input = createMockInput(['1']);
      const output = createMockOutput();
      const result = await select('Pick?', [
        { label: 'X', value: 'x' },
        { label: 'Y', value: 'y' },
      ], { input, output: output.stream });
      expect(result).toBe('x');
    });
  });

  describe('confirm', () => {
    it('returns true for y', async () => {
      const input = createMockInput(['y']);
      const output = createMockOutput();
      const result = await confirm('OK?', true, { input, output: output.stream });
      expect(result).toBe(true);
    });

    it('returns false for n', async () => {
      const input = createMockInput(['n']);
      const output = createMockOutput();
      const result = await confirm('OK?', true, { input, output: output.stream });
      expect(result).toBe(false);
    });

    it('returns default for empty input', async () => {
      const input = createMockInput(['']);
      const output = createMockOutput();
      const result = await confirm('OK?', false, { input, output: output.stream });
      expect(result).toBe(false);
    });

    it('returns true for yes', async () => {
      const input = createMockInput(['yes']);
      const output = createMockOutput();
      const result = await confirm('OK?', false, { input, output: output.stream });
      expect(result).toBe(true);
    });
  });

  describe('multiSelect', () => {
    it('returns selected values', async () => {
      const input = createMockInput(['1,3']);
      const output = createMockOutput();
      const result = await multiSelect('Pick?', [
        { label: 'A', value: 'a' },
        { label: 'B', value: 'b' },
        { label: 'C', value: 'c' },
      ], { input, output: output.stream });
      expect(result).toEqual(['a', 'c']);
    });

    it('returns empty array for empty input', async () => {
      const input = createMockInput(['']);
      const output = createMockOutput();
      const result = await multiSelect('Pick?', [
        { label: 'A', value: 'a' },
      ], { input, output: output.stream });
      expect(result).toEqual([]);
    });
  });
});
