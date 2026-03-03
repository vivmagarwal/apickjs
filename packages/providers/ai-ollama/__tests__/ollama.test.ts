import { describe, it, expect } from 'vitest';
import { createOllamaProvider } from '../src/index.js';

describe('Ollama Provider', () => {
  it('creates a provider with correct name', () => {
    const provider = createOllamaProvider();
    expect(provider.name).toBe('ollama');
  });

  it('creates with custom config', () => {
    const provider = createOllamaProvider({
      baseUrl: 'http://localhost:11434',
      defaultModel: 'llama3.2',
      defaultEmbeddingModel: 'nomic-embed-text',
    });
    expect(provider.name).toBe('ollama');
  });

  it('has all required methods', () => {
    const provider = createOllamaProvider();
    expect(typeof provider.generateText).toBe('function');
    expect(typeof provider.embed).toBe('function');
    expect(typeof provider.generateObject).toBe('function');
    expect(typeof provider.streamText).toBe('function');
  });

  it('throws when Ollama is not running', async () => {
    const provider = createOllamaProvider({ baseUrl: 'http://localhost:1' });
    await expect(provider.generateText({ prompt: 'test' })).rejects.toThrow();
  });

  it('throws on embed when Ollama is not running', async () => {
    const provider = createOllamaProvider({ baseUrl: 'http://localhost:1' });
    await expect(provider.embed({ texts: ['test'] })).rejects.toThrow();
  });
});
