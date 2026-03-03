import { describe, it, expect } from 'vitest';
import { createGoogleProvider } from '../src/index.js';

describe('Google Gemini Provider', () => {
  it('creates a provider with correct name', () => {
    const provider = createGoogleProvider({ apiKey: 'test-key' });
    expect(provider.name).toBe('google');
  });

  it('has all required methods', () => {
    const provider = createGoogleProvider({ apiKey: 'test-key' });
    expect(typeof provider.generateText).toBe('function');
    expect(typeof provider.embed).toBe('function');
    expect(typeof provider.generateObject).toBe('function');
    expect(typeof provider.streamText).toBe('function');
  });

  it('throws on API error for generateText', async () => {
    const provider = createGoogleProvider({ apiKey: 'invalid-key', baseUrl: 'http://localhost:1/v1beta' });
    await expect(provider.generateText({ prompt: 'test' })).rejects.toThrow();
  });

  it('throws on API error for embed', async () => {
    const provider = createGoogleProvider({ apiKey: 'invalid-key', baseUrl: 'http://localhost:1/v1beta' });
    await expect(provider.embed({ texts: ['test'] })).rejects.toThrow();
  });

  it('uses custom default models', () => {
    const provider = createGoogleProvider({
      apiKey: 'test-key',
      defaultModel: 'gemini-2.5-pro',
      defaultEmbeddingModel: 'text-embedding-004',
    });
    expect(provider.name).toBe('google');
  });
});
