/**
 * HTTP server built on node:http + find-my-way.
 *
 * Provides:
 *   - Trie-based routing via find-my-way
 *   - Middleware pipeline (global + route-level)
 *   - Context object (ctx) with request data, response helpers, and state
 *   - server.inject() for testing (bypasses network)
 *   - Health check at GET /_health → 204
 *   - SSE streaming via ctx.sse()
 */

import http from 'node:http';
import { Readable } from 'node:stream';
import Router from 'find-my-way';
import sjp from 'secure-json-parse';
import type {
  Server,
  InjectOptions,
  InjectResponse,
  ApickContext,
  MiddlewareHandler,
  RequestHandler,
  RouteOptions,
  SSEWriter,
  Logger,
} from '@apick/types';
import {
  ApplicationError,
  NotFoundError,
  ValidationError,
  PayloadTooLargeError,
} from '@apick/utils/errors';

// ---------------------------------------------------------------------------
// Body parsing helpers
// ---------------------------------------------------------------------------

const MAX_JSON_SIZE = 1024 * 1024; // 1 MB default

async function readBody(req: http.IncomingMessage, maxSize = MAX_JSON_SIZE): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';
    let size = 0;

    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > maxSize) {
        req.destroy();
        reject(new PayloadTooLargeError(`Request body exceeds ${maxSize} bytes`));
        return;
      }
      body += chunk.toString();
    });

    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function parseJsonBody(raw: string): any {
  if (!raw || raw.length === 0) return undefined;
  try {
    return sjp.parse(raw);
  } catch {
    throw new ValidationError('Invalid JSON body');
  }
}

// ---------------------------------------------------------------------------
// Query string parser
// ---------------------------------------------------------------------------

/**
 * Parses a URL query string into a nested object.
 *
 * Supports bracket notation for nested keys:
 *   pagination[page]=1         → { pagination: { page: '1' } }
 *   filters[title][$eq]=hello  → { filters: { title: { $eq: 'hello' } } }
 *   sort=title:asc             → { sort: 'title:asc' }
 *
 * Repeated flat keys are collected into arrays.
 */
function parseQuery(url: string): Record<string, any> {
  const idx = url.indexOf('?');
  if (idx === -1) return {};

  const params = new URLSearchParams(url.slice(idx + 1));
  const result: Record<string, any> = {};

  for (const [rawKey, value] of params) {
    const firstBracket = rawKey.indexOf('[');

    if (firstBracket === -1) {
      // Simple flat key — collect duplicates into arrays
      if (rawKey in result) {
        const existing = result[rawKey];
        if (Array.isArray(existing)) {
          existing.push(value);
        } else {
          result[rawKey] = [existing, value];
        }
      } else {
        result[rawKey] = value;
      }
      continue;
    }

    // Bracket notation — parse key[sub1][sub2] into path segments
    const root = rawKey.slice(0, firstBracket);
    const segments: string[] = [root];
    const bracketRe = /\[([^\]]*)\]/g;
    let match: RegExpExecArray | null;
    while ((match = bracketRe.exec(rawKey)) !== null) {
      segments.push(match[1]);
    }

    // Walk the segments and build nested objects
    let current: any = result;
    for (let i = 0; i < segments.length - 1; i++) {
      const seg = segments[i];
      if (!(seg in current) || typeof current[seg] !== 'object' || current[seg] === null) {
        current[seg] = {};
      }
      current = current[seg];
    }
    current[segments[segments.length - 1]] = value;
  }

  return result;
}

// ---------------------------------------------------------------------------
// SSE writer
// ---------------------------------------------------------------------------

function createSSEWriter(res: http.ServerResponse): SSEWriter {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });

  // Heartbeat
  const heartbeat = setInterval(() => {
    if (!res.destroyed) {
      res.write(':ping\n\n');
    }
  }, 15_000);

  return {
    send({ event, data, id, retry }) {
      if (res.destroyed) return;
      let message = '';
      if (id) message += `id: ${id}\n`;
      if (event) message += `event: ${event}\n`;
      if (retry) message += `retry: ${retry}\n`;
      const dataStr = typeof data === 'string' ? data : JSON.stringify(data);
      message += `data: ${dataStr}\n\n`;
      res.write(message);
    },
    close() {
      clearInterval(heartbeat);
      if (!res.destroyed) {
        res.end();
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Context factory
// ---------------------------------------------------------------------------

function createContext(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  params: Record<string, string>,
  logger: Logger,
  proxyEnabled: boolean,
): ApickContext {
  const headers: Record<string, string | undefined> = {};
  for (const [key, val] of Object.entries(req.headers)) {
    headers[key] = Array.isArray(val) ? val.join(', ') : val;
  }

  const url = req.url || '/';
  const method = req.method || 'GET';

  // Proxy-aware IP
  let ip = req.socket.remoteAddress || '127.0.0.1';
  if (proxyEnabled && headers['x-forwarded-for']) {
    ip = headers['x-forwarded-for'].split(',')[0]!.trim();
  }

  // Protocol
  let protocol = 'http';
  if (proxyEnabled && headers['x-forwarded-proto']) {
    protocol = headers['x-forwarded-proto'];
  }

  let _status = 200;
  let _body: any = undefined;
  let _headersSent = false;

  const ctx: ApickContext = {
    request: {
      body: undefined,
      headers,
      method,
      url,
    },
    params,
    query: parseQuery(url),
    ip,
    protocol,
    state: {},
    log: logger,

    // Response helpers
    send(data: any) {
      _status = 200;
      _body = { data, meta: {} };
    },
    created(data: any) {
      _status = 201;
      _body = { data, meta: {} };
    },
    deleted(data?: any) {
      _status = 200;
      _body = { data: data ?? null, meta: {} };
    },
    badRequest(message?: string, details?: any): never {
      throw new ApplicationError(message || 'Bad Request', details);
    },
    unauthorized(message?: string, details?: any): never {
      const err = new ApplicationError(message || 'Unauthorized', details);
      err.name = 'UnauthorizedError';
      err.statusCode = 401;
      throw err;
    },
    forbidden(message?: string, details?: any): never {
      const err = new ApplicationError(message || 'Forbidden', details);
      err.name = 'ForbiddenError';
      err.statusCode = 403;
      throw err;
    },
    notFound(message?: string, details?: any): never {
      throw new NotFoundError(message || 'Not Found');
    },
    payloadTooLarge(message?: string, details?: any): never {
      throw new PayloadTooLargeError(message || 'Payload Too Large');
    },
    tooManyRequests(message?: string, details?: any): never {
      const err = new ApplicationError(message || 'Too Many Requests', details);
      err.name = 'RateLimitError';
      err.statusCode = 429;
      throw err;
    },
    internalServerError(message?: string, details?: any): never {
      const err = new ApplicationError(message || 'Internal Server Error', details);
      err.name = 'InternalServerError';
      err.statusCode = 500;
      throw err;
    },

    get status() {
      return _status;
    },
    set status(code: number) {
      _status = code;
    },
    get body() {
      return _body;
    },
    set body(val: any) {
      _body = val;
    },
    set(name: string, value: string) {
      if (!_headersSent) {
        res.setHeader(name, value);
      }
    },
    get(name: string) {
      return headers[name.toLowerCase()];
    },

    sse() {
      _headersSent = true;
      return createSSEWriter(res);
    },

    raw: { req, res },
  };

  return ctx;
}

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

export function createServer(opts: {
  logger: Logger;
  proxyEnabled?: boolean;
}): Server {
  const { logger, proxyEnabled = false } = opts;

  const router = Router({
    caseSensitive: true,
    ignoreDuplicateSlashes: true,
    defaultRoute: (_req, res) => {
      res.statusCode = 404;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({
        data: null,
        error: { status: 404, name: 'NotFoundError', message: 'Not Found' },
      }));
    },
  });

  const globalMiddlewares: MiddlewareHandler[] = [];
  const registeredRoutes: RouteOptions[] = [];

  // Map controller UIDs to handler functions (set by Apick lifecycle)
  let controllerResolver: ((uid: string) => RequestHandler | undefined) | null = null;

  // Health check — always registered, bypasses everything
  router.on('GET', '/_health', (_req, res) => {
    res.statusCode = 204;
    res.end();
  });

  function sendJson(res: http.ServerResponse, statusCode: number, body: any): void {
    res.statusCode = statusCode;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(body));
  }

  /**
   * Handles an incoming request: builds context, runs middleware pipeline, executes handler.
   */
  async function handleRequest(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    handler: RequestHandler,
    routeParams: Record<string, string>,
    routeMiddlewares?: MiddlewareHandler[],
  ): Promise<void> {
    const ctx = createContext(req, res, routeParams, logger, proxyEnabled);

    try {
      // Parse body for methods that typically carry one
      if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
        const contentType = req.headers['content-type'] || '';
        if (contentType.includes('application/json')) {
          const rawBody = await readBody(req);
          ctx.request.body = parseJsonBody(rawBody);
        }
      }

      // Build combined middleware chain: global → route-level → handler
      const allMiddlewares = [
        ...globalMiddlewares,
        ...(routeMiddlewares || []),
      ];

      // Execute middleware chain
      let index = 0;
      const next = async (): Promise<void> => {
        if (index < allMiddlewares.length) {
          const mw = allMiddlewares[index++]!;
          await mw(ctx, next);
        } else {
          // End of chain: call the controller handler
          const result = await handler(ctx);
          // If handler returned a value (instead of calling ctx.send), use it
          if (result !== undefined && ctx.body === undefined) {
            ctx.body = { data: result, meta: {} };
          }
        }
      };

      await next();

      // Send response if not already sent (SSE sends its own)
      if (!res.writableEnded) {
        if (ctx.body !== undefined) {
          sendJson(res, ctx.status, ctx.body);
        } else {
          res.statusCode = ctx.status || 204;
          res.end();
        }
      }
    } catch (error: any) {
      if (res.writableEnded) return;

      if (error instanceof ApplicationError) {
        sendJson(res, error.statusCode, error.toJSON());
      } else {
        logger.error({ err: error }, 'Unhandled error in request handler');
        const isProduction = process.env.NODE_ENV === 'production';
        sendJson(res, 500, {
          data: null,
          error: {
            status: 500,
            name: 'InternalServerError',
            message: isProduction ? 'Internal Server Error' : (error.message || 'Internal Server Error'),
            ...(isProduction ? {} : { details: { stack: error.stack } }),
          },
        });
      }
    }
  }

  // The underlying Node.js HTTP server
  let httpServer: http.Server | null = null;

  const server: Server & {
    setControllerResolver: (resolver: (uid: string) => RequestHandler | undefined) => void;
  } = {
    setControllerResolver(resolver) {
      controllerResolver = resolver;
    },

    route(options: RouteOptions) {
      registeredRoutes.push(options);

      const { method, path, handler: handlerRef, config } = options;
      const routeMiddlewares: MiddlewareHandler[] = []; // Route-level middlewares resolved at registration time

      // Resolve handler
      let handlerFn: RequestHandler;
      if (typeof handlerRef === 'function') {
        handlerFn = handlerRef;
      } else {
        // UID string like 'api::article.article.find'
        handlerFn = (ctx) => {
          if (!controllerResolver) {
            throw new NotFoundError(`No controller resolver configured`);
          }
          const resolved = controllerResolver(handlerRef);
          if (!resolved) {
            throw new NotFoundError(`Handler not found: ${handlerRef}`);
          }
          return resolved(ctx);
        };
      }

      const httpMethod = method.toUpperCase() as Router.HTTPMethod;

      router.on(httpMethod, path, (req, res, params) => {
        const routeParams: Record<string, string> = {};
        if (params) {
          for (const [k, v] of Object.entries(params)) {
            if (typeof v === 'string') routeParams[k] = v;
          }
        }
        handleRequest(req, res, handlerFn, routeParams, routeMiddlewares);
      });
    },

    use(middleware: MiddlewareHandler) {
      globalMiddlewares.push(middleware);
    },

    async listen(port = 1337, host = '0.0.0.0') {
      return new Promise<void>((resolve, reject) => {
        httpServer = http.createServer((req, res) => {
          router.lookup(req, res);
        });

        httpServer.requestTimeout = 30_000;
        httpServer.keepAliveTimeout = 72_000;

        httpServer.on('error', reject);
        httpServer.listen(port, host, () => {
          logger.info({ port, host }, 'Server listening');
          resolve();
        });
      });
    },

    async close() {
      return new Promise<void>((resolve, reject) => {
        if (!httpServer) {
          resolve();
          return;
        }
        httpServer.close((err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    },

    async inject(options: InjectOptions): Promise<InjectResponse> {
      const { method, url, headers: reqHeaders = {}, body: reqBody, query: reqQuery } = options;

      // Build full URL with query params
      let fullUrl = url;
      if (reqQuery && Object.keys(reqQuery).length > 0) {
        const qs = new URLSearchParams(reqQuery).toString();
        fullUrl += (url.includes('?') ? '&' : '?') + qs;
      }

      // Create a fake IncomingMessage-like readable stream
      const bodyStr = reqBody !== undefined ? JSON.stringify(reqBody) : '';
      const fakeReq = new Readable({
        read() {
          if (bodyStr) this.push(Buffer.from(bodyStr));
          this.push(null);
        },
      }) as any;

      fakeReq.method = method.toUpperCase();
      fakeReq.url = fullUrl;
      fakeReq.headers = {
        ...(bodyStr ? { 'content-type': 'application/json', 'content-length': String(Buffer.byteLength(bodyStr)) } : {}),
        ...Object.fromEntries(Object.entries(reqHeaders).map(([k, v]) => [k.toLowerCase(), v])),
      };
      fakeReq.socket = { remoteAddress: '127.0.0.1' } as any;
      fakeReq.connection = fakeReq.socket;

      // Create a fake ServerResponse
      let responseStatusCode = 200;
      const responseHeaders: Record<string, string | string[] | undefined> = {};
      const responseChunks: Buffer[] = [];

      const fakeRes = {
        statusCode: 200,
        headersSent: false,
        writableEnded: false,
        destroyed: false,
        setHeader(name: string, value: string) {
          responseHeaders[name.toLowerCase()] = value;
        },
        getHeader(name: string) {
          return responseHeaders[name.toLowerCase()];
        },
        writeHead(statusCode: number, headers?: Record<string, string>) {
          fakeRes.statusCode = statusCode;
          if (headers) {
            for (const [k, v] of Object.entries(headers)) {
              responseHeaders[k.toLowerCase()] = v;
            }
          }
        },
        write(chunk: string | Buffer) {
          if (typeof chunk === 'string') {
            responseChunks.push(Buffer.from(chunk));
          } else {
            responseChunks.push(chunk);
          }
          return true;
        },
        end(chunk?: string | Buffer) {
          if (chunk !== undefined) {
            if (typeof chunk === 'string') {
              responseChunks.push(Buffer.from(chunk));
            } else if (chunk) {
              responseChunks.push(chunk);
            }
          }
          fakeRes.writableEnded = true;
          responseStatusCode = fakeRes.statusCode;
        },
      } as any;

      // Route the fake request
      return new Promise<InjectResponse>((resolve) => {
        // We need to wait for the response to complete
        const originalEnd = fakeRes.end.bind(fakeRes);
        fakeRes.end = (chunk?: string | Buffer) => {
          originalEnd(chunk);

          const rawBody = Buffer.concat(responseChunks).toString('utf8');
          let body: any;
          try {
            body = JSON.parse(rawBody);
          } catch {
            body = rawBody;
          }

          resolve({
            statusCode: responseStatusCode,
            headers: responseHeaders,
            body,
            rawBody,
          });
        };

        router.lookup(fakeReq, fakeRes);
      });
    },
  };

  return server;
}
