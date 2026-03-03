/**
 * Server-Sent Events (SSE) streaming helper.
 *
 * Provides `createSSEStream()` which sets up SSE headers and returns
 * a writer for sending events. Supports heartbeats, error handling,
 * and async iterable piping.
 */

import type { ServerResponse } from 'node:http';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SSEWriter {
  /** Send an SSE event */
  send(options: SSEEventOptions): void;
  /** Close the SSE stream */
  close(): void;
  /** Pipe an async iterable as SSE events */
  pipe(iterable: AsyncIterable<SSEEventOptions | string>): Promise<void>;
  /** Whether the stream is still open */
  readonly open: boolean;
}

export interface SSEEventOptions {
  /** Event type (optional, default: 'message') */
  event?: string;
  /** Event data (string or JSON-serializable object) */
  data: string | Record<string, any>;
  /** Event ID (optional) */
  id?: string;
  /** Retry interval in ms (optional) */
  retry?: number;
}

export interface SSEConfig {
  /** Heartbeat interval in ms (default: 15000) */
  heartbeatInterval?: number;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createSSEStream(res: ServerResponse, config: SSEConfig = {}): SSEWriter {
  const heartbeatMs = config.heartbeatInterval ?? 15000;
  let isOpen = true;
  let heartbeatTimer: ReturnType<typeof setInterval> | undefined;

  // Set SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  // Start heartbeat
  heartbeatTimer = setInterval(() => {
    if (isOpen) {
      res.write(':ping\n\n');
    }
  }, heartbeatMs);

  // Detect client disconnect
  res.on('close', () => {
    isOpen = false;
    if (heartbeatTimer) clearInterval(heartbeatTimer);
  });

  function formatEvent(options: SSEEventOptions): string {
    const lines: string[] = [];
    if (options.id) lines.push(`id: ${options.id}`);
    if (options.event) lines.push(`event: ${options.event}`);
    if (options.retry) lines.push(`retry: ${options.retry}`);

    const data = typeof options.data === 'string'
      ? options.data
      : JSON.stringify(options.data);

    // Split multi-line data
    for (const line of data.split('\n')) {
      lines.push(`data: ${line}`);
    }
    lines.push('');
    lines.push('');
    return lines.join('\n');
  }

  const writer: SSEWriter = {
    get open() {
      return isOpen;
    },

    send(options) {
      if (!isOpen) return;
      res.write(formatEvent(options));
    },

    close() {
      if (!isOpen) return;
      isOpen = false;
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      res.end();
    },

    async pipe(iterable) {
      try {
        for await (const item of iterable) {
          if (!isOpen) break;
          if (typeof item === 'string') {
            writer.send({ data: item });
          } else {
            writer.send(item);
          }
        }
      } catch (err) {
        if (isOpen) {
          writer.send({
            event: 'error',
            data: { message: err instanceof Error ? err.message : 'Stream error' },
          });
        }
      } finally {
        if (isOpen) {
          writer.send({ event: 'done', data: '' });
          writer.close();
        }
      }
    },
  };

  return writer;
}
