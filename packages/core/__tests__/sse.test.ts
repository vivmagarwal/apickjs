import { describe, it, expect, vi } from 'vitest';
import { createSSEStream } from '../src/server/sse.js';

function createMockResponse() {
  const chunks: string[] = [];
  let headers: any = {};
  let ended = false;
  const closeHandlers: (() => void)[] = [];

  return {
    mock: {
      writeHead(status: number, hdrs: any) { headers = { status, ...hdrs }; },
      write(chunk: string) { chunks.push(chunk); return true; },
      end() { ended = true; },
      on(event: string, handler: () => void) {
        if (event === 'close') closeHandlers.push(handler);
      },
    },
    getChunks() { return chunks; },
    getHeaders() { return headers; },
    isEnded() { return ended; },
    simulateClose() { closeHandlers.forEach(h => h()); },
  };
}

describe('SSE Streaming', () => {
  it('sets correct SSE headers', () => {
    const { mock, getHeaders } = createMockResponse();
    createSSEStream(mock as any, { heartbeatInterval: 60000 });
    const headers = getHeaders();
    expect(headers['Content-Type']).toBe('text/event-stream');
    expect(headers['Cache-Control']).toBe('no-cache');
    expect(headers['Connection']).toBe('keep-alive');
  });

  it('sends formatted SSE events', () => {
    const { mock, getChunks } = createMockResponse();
    const sse = createSSEStream(mock as any, { heartbeatInterval: 60000 });

    sse.send({ data: 'hello' });
    expect(getChunks()).toHaveLength(1);
    expect(getChunks()[0]).toContain('data: hello');
  });

  it('sends events with type and id', () => {
    const { mock, getChunks } = createMockResponse();
    const sse = createSSEStream(mock as any, { heartbeatInterval: 60000 });

    sse.send({ event: 'update', data: 'content', id: '42' });
    const output = getChunks()[0];
    expect(output).toContain('event: update');
    expect(output).toContain('data: content');
    expect(output).toContain('id: 42');
  });

  it('serializes object data as JSON', () => {
    const { mock, getChunks } = createMockResponse();
    const sse = createSSEStream(mock as any, { heartbeatInterval: 60000 });

    sse.send({ data: { key: 'value' } });
    expect(getChunks()[0]).toContain('data: {"key":"value"}');
  });

  it('closes the stream', () => {
    const { mock, isEnded } = createMockResponse();
    const sse = createSSEStream(mock as any, { heartbeatInterval: 60000 });

    expect(sse.open).toBe(true);
    sse.close();
    expect(sse.open).toBe(false);
    expect(isEnded()).toBe(true);
  });

  it('detects client disconnect', () => {
    const { mock, simulateClose } = createMockResponse();
    const sse = createSSEStream(mock as any, { heartbeatInterval: 60000 });

    expect(sse.open).toBe(true);
    simulateClose();
    expect(sse.open).toBe(false);
  });

  it('pipes an async iterable', async () => {
    const { mock, getChunks } = createMockResponse();
    const sse = createSSEStream(mock as any, { heartbeatInterval: 60000 });

    async function* generate() {
      yield 'chunk 1';
      yield 'chunk 2';
      yield { event: 'custom', data: 'chunk 3' };
    }

    await sse.pipe(generate());
    const chunks = getChunks();
    // 3 data chunks + 1 done event
    expect(chunks.length).toBeGreaterThanOrEqual(3);
    expect(chunks.some(c => c.includes('chunk 1'))).toBe(true);
    expect(chunks.some(c => c.includes('event: done'))).toBe(true);
  });

  it('handles pipe errors gracefully', async () => {
    const { mock, getChunks } = createMockResponse();
    const sse = createSSEStream(mock as any, { heartbeatInterval: 60000 });

    async function* generateWithError() {
      yield 'ok';
      throw new Error('stream broke');
    }

    await sse.pipe(generateWithError());
    const chunks = getChunks();
    expect(chunks.some(c => c.includes('event: error'))).toBe(true);
  });

  it('does not send after close', () => {
    const { mock, getChunks } = createMockResponse();
    const sse = createSSEStream(mock as any, { heartbeatInterval: 60000 });

    sse.send({ data: 'before' });
    sse.close();
    sse.send({ data: 'after' });

    expect(getChunks()).toHaveLength(1);
    expect(getChunks()[0]).toContain('before');
  });
});
