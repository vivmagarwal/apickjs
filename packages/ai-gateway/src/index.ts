/**
 * @apick/ai-gateway — AI Gateway Plugin.
 *
 * Proxies AI calls with semantic caching, rate limiting,
 * cost tracking, fallback chains, and usage logging.
 */

// Re-declare minimal types to avoid cross-package dependency resolution issues
interface TokenUsage { promptTokens: number; completionTokens: number; totalTokens: number; }
interface GenerateTextResult { text: string; model: string; usage: TokenUsage; finishReason: string; }
interface EmbedResult { embeddings: number[][]; model: string; usage: TokenUsage; }
interface StreamTextChunk { text: string; done: boolean; usage?: TokenUsage; }
interface AIProvider { name: string; generateText(opts: any): Promise<GenerateTextResult>; embed(opts: any): Promise<EmbedResult>; streamText?(opts: any): AsyncIterable<StreamTextChunk>; }
interface AIProviderService { getProvider(): AIProvider; generateText(opts: any): Promise<GenerateTextResult>; embed(opts: any): Promise<EmbedResult>; streamText(opts: any): AsyncIterable<StreamTextChunk>; }

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GatewayConfig {
  /** Cache config */
  cache?: {
    enabled?: boolean;
    ttl?: number; // seconds, default 3600
    similarityThreshold?: number; // default 0.95
  };
  /** Rate limiting */
  rateLimit?: {
    /** Max requests per window */
    maxRequests?: number;
    /** Max tokens per window */
    maxTokens?: number;
    /** Window in seconds */
    windowSeconds?: number;
  };
  /** Cost limits */
  costLimits?: {
    dailyUsd?: number;
    monthlyUsd?: number;
  };
  /** Fallback chain of provider names */
  fallbackProviders?: string[];
}

export interface GatewayRequest {
  prompt: string;
  systemPrompt?: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  userId?: string;
  tokenId?: string;
}

export interface GatewayResponse {
  text: string;
  model: string;
  provider: string;
  cached: boolean;
  latencyMs: number;
  usage: { promptTokens: number; completionTokens: number; totalTokens: number };
}

export interface GatewayEmbedRequest {
  texts: string[];
  model?: string;
  userId?: string;
}

export interface GatewayEmbedResponse {
  embeddings: number[][];
  model: string;
  provider: string;
  cached: boolean;
  latencyMs: number;
}

export interface UsageLog {
  id: number;
  userId: string | null;
  tokenId: string | null;
  provider: string;
  model: string;
  operation: 'chat' | 'embed' | 'stream';
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cached: boolean;
  latencyMs: number;
  estimatedCostUsd: number;
  createdAt: string;
}

export interface UsageStats {
  totalRequests: number;
  totalTokens: number;
  totalCostUsd: number;
  cacheHitRate: number;
  byModel: Record<string, { requests: number; tokens: number; costUsd: number }>;
}

export interface RateLimitState {
  requests: number;
  tokens: number;
  windowStart: number;
}

export interface CacheEntry {
  response: GatewayResponse;
  embedding: number[];
  createdAt: number;
}

export interface GatewayService {
  /** Send a chat request through the gateway */
  chat(request: GatewayRequest): Promise<GatewayResponse>;
  /** Send an embed request through the gateway */
  embed(request: GatewayEmbedRequest): Promise<GatewayEmbedResponse>;
  /** Stream a chat request */
  chatStream(request: GatewayRequest): AsyncIterable<StreamTextChunk & { cached?: boolean }>;
  /** Get usage statistics */
  getUsageStats(filters?: { userId?: string; since?: string }): UsageStats;
  /** Get cost breakdown by model */
  getCostBreakdown(filters?: { since?: string }): Record<string, number>;
  /** Check rate limit status */
  checkRateLimit(userId?: string, tokenId?: string): { allowed: boolean; retryAfterMs?: number };
}

export interface GatewayServiceConfig {
  rawDb: any;
  aiProvider: AIProviderService;
  config: GatewayConfig;
  /** Map of provider names to AIProviderService instances for fallback */
  providers?: Map<string, AIProviderService>;
}

// ---------------------------------------------------------------------------
// Cost estimation (approximate per 1K tokens)
// ---------------------------------------------------------------------------

const MODEL_COSTS: Record<string, { input: number; output: number }> = {
  'gpt-4o': { input: 0.0025, output: 0.01 },
  'gpt-4o-mini': { input: 0.00015, output: 0.0006 },
  'claude-3-5-sonnet': { input: 0.003, output: 0.015 },
  'claude-3-haiku': { input: 0.00025, output: 0.00125 },
  'gemini-2.0-flash': { input: 0.0001, output: 0.0004 },
  'text-embedding-3-small': { input: 0.00002, output: 0 },
  'text-embedding-3-large': { input: 0.00013, output: 0 },
};

function estimateCost(model: string, promptTokens: number, completionTokens: number): number {
  const costs = MODEL_COSTS[model] ?? { input: 0.001, output: 0.002 }; // default fallback
  return (promptTokens / 1000) * costs.input + (completionTokens / 1000) * costs.output;
}

// ---------------------------------------------------------------------------
// Table setup
// ---------------------------------------------------------------------------

function ensureTables(db: any): void {
  db.exec(`CREATE TABLE IF NOT EXISTS "ai_gateway_usage" (
    "id" INTEGER PRIMARY KEY AUTOINCREMENT,
    "user_id" VARCHAR(255),
    "token_id" VARCHAR(255),
    "provider" VARCHAR(100) NOT NULL,
    "model" VARCHAR(100) NOT NULL,
    "operation" VARCHAR(20) NOT NULL,
    "prompt_tokens" INTEGER NOT NULL DEFAULT 0,
    "completion_tokens" INTEGER NOT NULL DEFAULT 0,
    "total_tokens" INTEGER NOT NULL DEFAULT 0,
    "cached" INTEGER NOT NULL DEFAULT 0,
    "latency_ms" INTEGER NOT NULL DEFAULT 0,
    "estimated_cost_usd" REAL NOT NULL DEFAULT 0,
    "created_at" TEXT NOT NULL
  )`);
}

function logUsage(db: any, log: Omit<UsageLog, 'id'>): void {
  db.prepare(`
    INSERT INTO "ai_gateway_usage" (user_id, token_id, provider, model, operation, prompt_tokens, completion_tokens, total_tokens, cached, latency_ms, estimated_cost_usd, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    log.userId, log.tokenId, log.provider, log.model, log.operation,
    log.promptTokens, log.completionTokens, log.totalTokens,
    log.cached ? 1 : 0, log.latencyMs, log.estimatedCostUsd, log.createdAt,
  );
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createGatewayService(serviceConfig: GatewayServiceConfig): GatewayService {
  const { rawDb, aiProvider, config, providers } = serviceConfig;
  ensureTables(rawDb);

  const cacheEnabled = config.cache?.enabled ?? true;
  const cacheTtl = (config.cache?.ttl ?? 3600) * 1000; // ms
  const cache = new Map<string, CacheEntry>();

  const rateLimits = new Map<string, RateLimitState>();
  const rlConfig = config.rateLimit ?? {};
  const maxRequests = rlConfig.maxRequests ?? 100;
  const maxTokens = rlConfig.maxTokens ?? 100000;
  const windowMs = (rlConfig.windowSeconds ?? 60) * 1000;

  function getRateLimitKey(userId?: string, tokenId?: string): string {
    return `${userId ?? 'global'}:${tokenId ?? 'global'}`;
  }

  function checkRL(userId?: string, tokenId?: string): { allowed: boolean; retryAfterMs?: number } {
    const key = getRateLimitKey(userId, tokenId);
    const now = Date.now();
    let state = rateLimits.get(key);

    if (!state || now - state.windowStart > windowMs) {
      state = { requests: 0, tokens: 0, windowStart: now };
      rateLimits.set(key, state);
    }

    if (state.requests >= maxRequests) {
      return { allowed: false, retryAfterMs: windowMs - (now - state.windowStart) };
    }
    if (state.tokens >= maxTokens) {
      return { allowed: false, retryAfterMs: windowMs - (now - state.windowStart) };
    }

    return { allowed: true };
  }

  function recordUsage(userId?: string, tokenId?: string, tokens: number = 0): void {
    const key = getRateLimitKey(userId, tokenId);
    const state = rateLimits.get(key);
    if (state) {
      state.requests++;
      state.tokens += tokens;
    }
  }

  function getCacheKey(prompt: string, systemPrompt?: string, model?: string): string {
    return `${model ?? 'default'}:${systemPrompt ?? ''}:${prompt}`;
  }

  async function tryWithFallback(
    fn: (provider: AIProviderService) => Promise<GenerateTextResult>,
  ): Promise<{ result: GenerateTextResult; providerName: string }> {
    // Try primary first
    try {
      const result = await fn(aiProvider);
      return { result, providerName: aiProvider.getProvider().name };
    } catch (primaryErr) {
      // Try fallbacks
      if (config.fallbackProviders && providers) {
        for (const name of config.fallbackProviders) {
          const fallback = providers.get(name);
          if (!fallback) continue;
          try {
            const result = await fn(fallback);
            return { result, providerName: name };
          } catch {
            continue;
          }
        }
      }
      throw primaryErr;
    }
  }

  return {
    async chat(request) {
      const rl = checkRL(request.userId, request.tokenId);
      if (!rl.allowed) {
        throw Object.assign(new Error('Rate limit exceeded'), { retryAfterMs: rl.retryAfterMs });
      }

      const start = Date.now();

      // Check cache
      if (cacheEnabled) {
        const cacheKey = getCacheKey(request.prompt, request.systemPrompt, request.model);
        const cached = cache.get(cacheKey);
        if (cached && Date.now() - cached.createdAt < cacheTtl) {
          const latencyMs = Date.now() - start;
          recordUsage(request.userId, request.tokenId, 0);
          logUsage(rawDb, {
            userId: request.userId ?? null, tokenId: request.tokenId ?? null,
            provider: cached.response.provider, model: cached.response.model,
            operation: 'chat', promptTokens: 0, completionTokens: 0, totalTokens: 0,
            cached: true, latencyMs, estimatedCostUsd: 0, createdAt: new Date().toISOString(),
          });
          return { ...cached.response, cached: true, latencyMs };
        }
      }

      const { result, providerName } = await tryWithFallback((provider) =>
        provider.generateText({
          prompt: request.prompt,
          systemPrompt: request.systemPrompt,
          model: request.model,
          maxTokens: request.maxTokens,
          temperature: request.temperature,
        }),
      );

      const latencyMs = Date.now() - start;
      const cost = estimateCost(result.model, result.usage.promptTokens, result.usage.completionTokens);

      recordUsage(request.userId, request.tokenId, result.usage.totalTokens);

      const response: GatewayResponse = {
        text: result.text,
        model: result.model,
        provider: providerName,
        cached: false,
        latencyMs,
        usage: result.usage,
      };

      // Store in cache
      if (cacheEnabled) {
        const cacheKey = getCacheKey(request.prompt, request.systemPrompt, request.model);
        cache.set(cacheKey, { response, embedding: [], createdAt: Date.now() });
      }

      logUsage(rawDb, {
        userId: request.userId ?? null, tokenId: request.tokenId ?? null,
        provider: providerName, model: result.model, operation: 'chat',
        promptTokens: result.usage.promptTokens, completionTokens: result.usage.completionTokens,
        totalTokens: result.usage.totalTokens, cached: false, latencyMs, estimatedCostUsd: cost,
        createdAt: new Date().toISOString(),
      });

      return response;
    },

    async embed(request) {
      const rl = checkRL(request.userId);
      if (!rl.allowed) {
        throw Object.assign(new Error('Rate limit exceeded'), { retryAfterMs: rl.retryAfterMs });
      }

      const start = Date.now();
      const result = await aiProvider.embed({ texts: request.texts, model: request.model });
      const latencyMs = Date.now() - start;

      recordUsage(request.userId, undefined, result.usage.totalTokens);

      logUsage(rawDb, {
        userId: request.userId ?? null, tokenId: null,
        provider: aiProvider.getProvider().name, model: result.model, operation: 'embed',
        promptTokens: result.usage.promptTokens, completionTokens: 0,
        totalTokens: result.usage.totalTokens, cached: false, latencyMs,
        estimatedCostUsd: estimateCost(result.model, result.usage.promptTokens, 0),
        createdAt: new Date().toISOString(),
      });

      return {
        embeddings: result.embeddings,
        model: result.model,
        provider: aiProvider.getProvider().name,
        cached: false,
        latencyMs,
      };
    },

    async *chatStream(request) {
      const rl = checkRL(request.userId, request.tokenId);
      if (!rl.allowed) {
        throw Object.assign(new Error('Rate limit exceeded'), { retryAfterMs: rl.retryAfterMs });
      }

      const start = Date.now();
      const stream = aiProvider.streamText({
        prompt: request.prompt,
        systemPrompt: request.systemPrompt,
        model: request.model,
        maxTokens: request.maxTokens,
        temperature: request.temperature,
      });

      let totalUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

      for await (const chunk of stream) {
        if (chunk.usage) {
          totalUsage = chunk.usage;
        }
        yield { ...chunk, cached: false };
      }

      const latencyMs = Date.now() - start;
      recordUsage(request.userId, request.tokenId, totalUsage.totalTokens);

      logUsage(rawDb, {
        userId: request.userId ?? null, tokenId: request.tokenId ?? null,
        provider: aiProvider.getProvider().name, model: request.model ?? 'default', operation: 'stream',
        promptTokens: totalUsage.promptTokens, completionTokens: totalUsage.completionTokens,
        totalTokens: totalUsage.totalTokens, cached: false, latencyMs,
        estimatedCostUsd: estimateCost(request.model ?? 'default', totalUsage.promptTokens, totalUsage.completionTokens),
        createdAt: new Date().toISOString(),
      });
    },

    getUsageStats(filters) {
      let query = 'SELECT * FROM "ai_gateway_usage"';
      const conditions: string[] = [];
      const params: any[] = [];

      if (filters?.userId) {
        conditions.push('user_id = ?');
        params.push(filters.userId);
      }
      if (filters?.since) {
        conditions.push('created_at >= ?');
        params.push(filters.since);
      }

      if (conditions.length > 0) {
        query += ` WHERE ${conditions.join(' AND ')}`;
      }

      const rows = rawDb.prepare(query).all(...params) as any[];

      let totalRequests = 0;
      let totalTokens = 0;
      let totalCostUsd = 0;
      let cacheHits = 0;
      const byModel: Record<string, { requests: number; tokens: number; costUsd: number }> = {};

      for (const row of rows) {
        totalRequests++;
        totalTokens += row.total_tokens;
        totalCostUsd += row.estimated_cost_usd;
        if (row.cached) cacheHits++;

        if (!byModel[row.model]) {
          byModel[row.model] = { requests: 0, tokens: 0, costUsd: 0 };
        }
        byModel[row.model].requests++;
        byModel[row.model].tokens += row.total_tokens;
        byModel[row.model].costUsd += row.estimated_cost_usd;
      }

      return {
        totalRequests,
        totalTokens,
        totalCostUsd,
        cacheHitRate: totalRequests > 0 ? cacheHits / totalRequests : 0,
        byModel,
      };
    },

    getCostBreakdown(filters) {
      let query = 'SELECT model, SUM(estimated_cost_usd) as total_cost FROM "ai_gateway_usage"';
      const conditions: string[] = [];
      const params: any[] = [];

      if (filters?.since) {
        conditions.push('created_at >= ?');
        params.push(filters.since);
      }

      if (conditions.length > 0) {
        query += ` WHERE ${conditions.join(' AND ')}`;
      }
      query += ' GROUP BY model';

      const rows = rawDb.prepare(query).all(...params) as any[];
      const breakdown: Record<string, number> = {};
      for (const row of rows) {
        breakdown[row.model] = row.total_cost;
      }
      return breakdown;
    },

    checkRateLimit(userId, tokenId) {
      return checkRL(userId, tokenId);
    },
  };
}
