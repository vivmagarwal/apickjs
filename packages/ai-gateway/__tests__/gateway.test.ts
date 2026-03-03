import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { createAIProviderService } from '../../ai/src/provider/index.js';
import { createGatewayService } from '../src/index.js';
import type { AIProvider } from '../../ai/src/provider/index.js';
import type { GatewayService } from '../src/index.js';

function createTestProvider(name: string = 'test'): AIProvider {
  return {
    name,
    async generateText(options) {
      return {
        text: `response: ${options.prompt}`,
        model: options.model ?? 'test-model',
        usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
        finishReason: 'stop',
      };
    },
    async embed(options) {
      return {
        embeddings: options.texts.map(() => [0.1, 0.2, 0.3]),
        model: 'test-embed',
        usage: { promptTokens: 5, completionTokens: 0, totalTokens: 5 },
      };
    },
    async *streamText(options) {
      yield { text: 'Hello', done: false };
      yield { text: ' world', done: false };
      yield { text: '', done: true, usage: { promptTokens: 5, completionTokens: 5, totalTokens: 10 } };
    },
  };
}

describe('AI Gateway', () => {
  let db: any;
  let gateway: GatewayService;

  beforeEach(() => {
    db = new Database(':memory:');
    const aiService = createAIProviderService({ provider: { provider: 'test' } });
    aiService.setProvider(createTestProvider());
    gateway = createGatewayService({
      rawDb: db,
      aiProvider: aiService,
      config: {
        cache: { enabled: true, ttl: 3600 },
        rateLimit: { maxRequests: 10, maxTokens: 1000, windowSeconds: 60 },
      },
    });
  });

  it('sends a chat request', async () => {
    const response = await gateway.chat({ prompt: 'Hello' });
    expect(response.text).toBe('response: Hello');
    expect(response.model).toBe('test-model');
    expect(response.provider).toBe('test');
    expect(response.cached).toBe(false);
    expect(response.latencyMs).toBeGreaterThanOrEqual(0);
    expect(response.usage.totalTokens).toBe(30);
  });

  it('returns cached response for same prompt', async () => {
    await gateway.chat({ prompt: 'cached query' });
    const second = await gateway.chat({ prompt: 'cached query' });
    expect(second.cached).toBe(true);
    expect(second.text).toBe('response: cached query');
  });

  it('sends an embed request', async () => {
    const response = await gateway.embed({ texts: ['hello', 'world'] });
    expect(response.embeddings).toHaveLength(2);
    expect(response.model).toBe('test-embed');
    expect(response.provider).toBe('test');
  });

  it('streams a chat request', async () => {
    const chunks: string[] = [];
    for await (const chunk of gateway.chatStream({ prompt: 'stream test' })) {
      chunks.push(chunk.text);
    }
    expect(chunks).toEqual(['Hello', ' world', '']);
  });

  it('enforces rate limits', async () => {
    // Send requests up to limit
    for (let i = 0; i < 10; i++) {
      await gateway.chat({ prompt: `request ${i}`, userId: 'user-1' });
    }
    // Next should be rate limited
    await expect(gateway.chat({ prompt: 'overflow', userId: 'user-1' })).rejects.toThrow('Rate limit exceeded');
  });

  it('checks rate limit status', () => {
    const status = gateway.checkRateLimit('user-2');
    expect(status.allowed).toBe(true);
  });

  it('tracks usage statistics', async () => {
    await gateway.chat({ prompt: 'stat test', userId: 'user-3' });
    await gateway.embed({ texts: ['embed stat'], userId: 'user-3' });

    const stats = gateway.getUsageStats({ userId: 'user-3' });
    expect(stats.totalRequests).toBe(2);
    expect(stats.totalTokens).toBeGreaterThan(0);
  });

  it('tracks cache hit rate', async () => {
    await gateway.chat({ prompt: 'unique-1' });
    await gateway.chat({ prompt: 'unique-1' }); // cache hit
    await gateway.chat({ prompt: 'unique-2' });

    const stats = gateway.getUsageStats();
    expect(stats.totalRequests).toBe(3);
    expect(stats.cacheHitRate).toBeCloseTo(1 / 3);
  });

  it('provides cost breakdown by model', async () => {
    await gateway.chat({ prompt: 'cost test' });
    const breakdown = gateway.getCostBreakdown();
    expect(Object.keys(breakdown)).toContain('test-model');
    expect(breakdown['test-model']).toBeGreaterThanOrEqual(0);
  });

  it('uses fallback provider when primary fails', async () => {
    const failingProvider = createAIProviderService({ provider: { provider: 'failing' } });
    failingProvider.setProvider({
      name: 'failing',
      async generateText() { throw new Error('Primary failed'); },
      async embed() { throw new Error('Primary failed'); },
    });

    const fallbackAiService = createAIProviderService({ provider: { provider: 'fallback' } });
    fallbackAiService.setProvider(createTestProvider('fallback'));

    const providers = new Map([['fallback', fallbackAiService]]);

    const gwWithFallback = createGatewayService({
      rawDb: db,
      aiProvider: failingProvider,
      config: { fallbackProviders: ['fallback'] },
      providers,
    });

    const response = await gwWithFallback.chat({ prompt: 'fallback test' });
    expect(response.provider).toBe('fallback');
    expect(response.text).toBe('response: fallback test');
  });

  it('usage stats filter by userId', async () => {
    await gateway.chat({ prompt: 'user-a', userId: 'a' });
    await gateway.chat({ prompt: 'user-b', userId: 'b' });

    const statsA = gateway.getUsageStats({ userId: 'a' });
    expect(statsA.totalRequests).toBe(1);

    const statsAll = gateway.getUsageStats();
    expect(statsAll.totalRequests).toBe(2);
  });

  it('logs usage with correct operation type', async () => {
    await gateway.chat({ prompt: 'chat' });
    await gateway.embed({ texts: ['embed'] });

    const rows = db.prepare('SELECT operation FROM "ai_gateway_usage"').all();
    const ops = rows.map((r: any) => r.operation);
    expect(ops).toContain('chat');
    expect(ops).toContain('embed');
  });
});
