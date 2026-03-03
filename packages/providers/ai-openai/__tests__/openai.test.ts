import { describe, it, expect } from 'vitest';
import { createOpenAIProvider } from '../src/index.js';

describe('OpenAI Provider', () => {
  it('creates a provider with correct name', () => {
    const provider = createOpenAIProvider({ apiKey: 'test-key' });
    expect(provider.name).toBe('openai');
  });

  it('has all required methods', () => {
    const provider = createOpenAIProvider({ apiKey: 'test-key' });
    expect(typeof provider.generateText).toBe('function');
    expect(typeof provider.embed).toBe('function');
    expect(typeof provider.generateObject).toBe('function');
    expect(typeof provider.streamText).toBe('function');
  });

  it('throws on API error for generateText', async () => {
    const provider = createOpenAIProvider({ apiKey: 'invalid-key', baseUrl: 'http://localhost:1/v1' });
    await expect(provider.generateText({ prompt: 'test' })).rejects.toThrow();
  });

  it('throws on API error for embed', async () => {
    const provider = createOpenAIProvider({ apiKey: 'invalid-key', baseUrl: 'http://localhost:1/v1' });
    await expect(provider.embed({ texts: ['test'] })).rejects.toThrow();
  });

  it('uses custom default models', () => {
    const provider = createOpenAIProvider({
      apiKey: 'test-key',
      defaultModel: 'gpt-4o',
      defaultEmbeddingModel: 'text-embedding-3-large',
    });
    // Provider is created without error
    expect(provider.name).toBe('openai');
  });
});
