import { describe, it, expect } from 'vitest';
import { createAnthropicProvider } from '../src/index.js';

describe('Anthropic Provider', () => {
  it('creates a provider with correct name', () => {
    const provider = createAnthropicProvider({ apiKey: 'test-key' });
    expect(provider.name).toBe('anthropic');
  });

  it('has all required methods', () => {
    const provider = createAnthropicProvider({ apiKey: 'test-key' });
    expect(typeof provider.generateText).toBe('function');
    expect(typeof provider.embed).toBe('function');
    expect(typeof provider.generateObject).toBe('function');
    expect(typeof provider.streamText).toBe('function');
  });

  it('throws on embed (not supported by Anthropic)', async () => {
    const provider = createAnthropicProvider({ apiKey: 'test-key' });
    await expect(provider.embed({ texts: ['test'] })).rejects.toThrow('Anthropic does not provide an embedding API');
  });

  it('throws on API error for generateText', async () => {
    const provider = createAnthropicProvider({ apiKey: 'invalid-key', baseUrl: 'http://localhost:1/v1' });
    await expect(provider.generateText({ prompt: 'test' })).rejects.toThrow();
  });

  it('uses custom default model', () => {
    const provider = createAnthropicProvider({
      apiKey: 'test-key',
      defaultModel: 'claude-sonnet-4-20250514',
    });
    expect(provider.name).toBe('anthropic');
  });
});
