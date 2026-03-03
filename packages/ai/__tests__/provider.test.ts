import { describe, it, expect } from 'vitest';
import { createAIProviderService } from '../src/provider/index.js';
import type { AIProvider, AIPluginConfig } from '../src/provider/index.js';

function createMockProvider(overrides: Partial<AIProvider> = {}): AIProvider {
  return {
    name: 'mock',
    async generateText(options) {
      return {
        text: `response to: ${options.prompt}`,
        model: 'mock-model',
        usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
        finishReason: 'stop',
      };
    },
    async embed(options) {
      return {
        embeddings: options.texts.map(() => [0.1, 0.2, 0.3]),
        model: 'mock-embed',
        usage: { promptTokens: 5, completionTokens: 0, totalTokens: 5 },
      };
    },
    ...overrides,
  };
}

describe('AI Provider Service', () => {
  const baseConfig: AIPluginConfig = {
    provider: { provider: 'mock' },
    features: { vectorField: true, semanticSearch: true, enrichment: false },
  };

  it('throws when no provider is set', () => {
    const service = createAIProviderService(baseConfig);
    expect(() => service.getProvider()).toThrow('No AI provider configured');
  });

  it('sets and gets a provider', () => {
    const service = createAIProviderService(baseConfig);
    const provider = createMockProvider();
    service.setProvider(provider);
    expect(service.getProvider().name).toBe('mock');
  });

  it('delegates generateText to the active provider', async () => {
    const service = createAIProviderService(baseConfig);
    service.setProvider(createMockProvider());
    const result = await service.generateText({ prompt: 'hello' });
    expect(result.text).toBe('response to: hello');
    expect(result.usage.totalTokens).toBe(30);
    expect(result.finishReason).toBe('stop');
  });

  it('delegates embed to the active provider', async () => {
    const service = createAIProviderService(baseConfig);
    service.setProvider(createMockProvider());
    const result = await service.embed({ texts: ['a', 'b'] });
    expect(result.embeddings).toHaveLength(2);
    expect(result.embeddings[0]).toEqual([0.1, 0.2, 0.3]);
  });

  it('delegates generateObject to the provider if supported', async () => {
    const service = createAIProviderService(baseConfig);
    service.setProvider(createMockProvider({
      async generateObject(options) {
        return {
          data: { title: 'Generated' },
          text: '{"title":"Generated"}',
          model: 'mock-model',
          usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 },
        };
      },
    }));
    const result = await service.generateObject({ prompt: 'test', schema: {} });
    expect(result.data.title).toBe('Generated');
  });

  it('throws if generateObject is not supported', async () => {
    const service = createAIProviderService(baseConfig);
    service.setProvider(createMockProvider());
    await expect(service.generateObject({ prompt: 'test', schema: {} }))
      .rejects.toThrow('does not support generateObject');
  });

  it('delegates streamText to the provider if supported', async () => {
    const service = createAIProviderService(baseConfig);
    const chunks = [
      { text: 'Hello', done: false },
      { text: ' world', done: true, usage: { promptTokens: 5, completionTokens: 5, totalTokens: 10 } },
    ];
    service.setProvider(createMockProvider({
      async *streamText() {
        for (const chunk of chunks) {
          yield chunk;
        }
      },
    }));
    const collected: string[] = [];
    for await (const chunk of service.streamText({ prompt: 'hi' })) {
      collected.push(chunk.text);
    }
    expect(collected).toEqual(['Hello', ' world']);
  });

  it('throws if streamText is not supported', () => {
    const service = createAIProviderService(baseConfig);
    service.setProvider(createMockProvider());
    expect(() => service.streamText({ prompt: 'hi' })).toThrow('does not support streamText');
  });

  it('checks feature flags correctly', () => {
    const service = createAIProviderService(baseConfig);
    expect(service.isFeatureEnabled('vectorField')).toBe(true);
    expect(service.isFeatureEnabled('semanticSearch')).toBe(true);
    expect(service.isFeatureEnabled('enrichment')).toBe(false);
    expect(service.isFeatureEnabled('rag')).toBe(false); // undefined → false
  });

  it('defaults all features to false when no features config', () => {
    const service = createAIProviderService({ provider: { provider: 'mock' } });
    expect(service.isFeatureEnabled('vectorField')).toBe(false);
    expect(service.isFeatureEnabled('prompts')).toBe(false);
  });

  it('can replace the active provider', async () => {
    const service = createAIProviderService(baseConfig);
    service.setProvider(createMockProvider({ name: 'provider-a' }));
    expect(service.getProvider().name).toBe('provider-a');

    service.setProvider(createMockProvider({ name: 'provider-b' }));
    expect(service.getProvider().name).toBe('provider-b');
  });
});
