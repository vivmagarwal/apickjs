import { describe, it, expect } from 'vitest';
import { createAIProviderService } from '../src/provider/index.js';
import { createStructuredOutputService } from '../src/generation/index.js';
import type { AIProvider } from '../src/provider/index.js';

describe('Structured Output / Generation', () => {
  const articleSchema = {
    type: 'object',
    required: ['title', 'tags'],
    properties: {
      title: { type: 'string' },
      content: { type: 'string' },
      tags: { type: 'array' },
      published: { type: 'boolean' },
    },
  };

  function createTextProvider(response: string): AIProvider {
    return {
      name: 'text-gen',
      async generateText() {
        return {
          text: response,
          model: 'test',
          usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
          finishReason: 'stop',
        };
      },
      async embed(options) {
        return { embeddings: options.texts.map(() => [0.1]), model: 'test', usage: { promptTokens: 1, completionTokens: 0, totalTokens: 1 } };
      },
    };
  }

  function createObjectProvider(data: Record<string, any>): AIProvider {
    return {
      name: 'object-gen',
      async generateText() {
        return { text: JSON.stringify(data), model: 'test', usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 }, finishReason: 'stop' };
      },
      async embed(options) {
        return { embeddings: options.texts.map(() => [0.1]), model: 'test', usage: { promptTokens: 1, completionTokens: 0, totalTokens: 1 } };
      },
      async generateObject() {
        return {
          data,
          text: JSON.stringify(data),
          model: 'test',
          usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
        };
      },
    };
  }

  it('generates valid structured output via generateObject', async () => {
    const aiService = createAIProviderService({ provider: { provider: 'test' } });
    aiService.setProvider(createObjectProvider({ title: 'Node.js Streams', tags: ['nodejs', 'streams'], published: true }));
    const service = createStructuredOutputService(aiService);

    const result = await service.generateContent(articleSchema, {
      prompt: 'Write about Node.js streams',
    });
    expect(result.data.title).toBe('Node.js Streams');
    expect(result.data.tags).toEqual(['nodejs', 'streams']);
    expect(result.attempts).toBe(1);
    expect(result.usage.totalTokens).toBeGreaterThan(0);
  });

  it('generates valid structured output via text parsing', async () => {
    const aiService = createAIProviderService({ provider: { provider: 'test' } });
    aiService.setProvider(createTextProvider('{"title":"Hello","tags":["a","b"],"published":false}'));
    const service = createStructuredOutputService(aiService);

    const result = await service.generateContent(articleSchema, {
      prompt: 'Generate an article',
    });
    expect(result.data.title).toBe('Hello');
    expect(result.data.tags).toEqual(['a', 'b']);
    expect(result.data.published).toBe(false);
  });

  it('retries on invalid JSON response', async () => {
    const aiService = createAIProviderService({ provider: { provider: 'test' } });
    let attempt = 0;
    aiService.setProvider({
      name: 'retry-test',
      async generateText() {
        attempt++;
        const text = attempt < 2
          ? 'not valid json at all'
          : '{"title":"Retry OK","tags":["retry"]}';
        return { text, model: 'test', usage: { promptTokens: 5, completionTokens: 5, totalTokens: 10 }, finishReason: 'stop' };
      },
      async embed(options) {
        return { embeddings: options.texts.map(() => [0.1]), model: 'test', usage: { promptTokens: 1, completionTokens: 0, totalTokens: 1 } };
      },
    });
    const service = createStructuredOutputService(aiService);

    const result = await service.generateContent(articleSchema, {
      prompt: 'Generate',
      maxRetries: 3,
    });
    expect(result.data.title).toBe('Retry OK');
    expect(result.attempts).toBe(2);
  });

  it('retries on schema validation failure', async () => {
    const aiService = createAIProviderService({ provider: { provider: 'test' } });
    let attempt = 0;
    aiService.setProvider({
      name: 'validation-retry',
      async generateText() {
        attempt++;
        // First attempt: missing required 'tags' field
        const text = attempt < 2
          ? '{"title":"No Tags"}'
          : '{"title":"With Tags","tags":["ok"]}';
        return { text, model: 'test', usage: { promptTokens: 5, completionTokens: 5, totalTokens: 10 }, finishReason: 'stop' };
      },
      async embed(options) {
        return { embeddings: options.texts.map(() => [0.1]), model: 'test', usage: { promptTokens: 1, completionTokens: 0, totalTokens: 1 } };
      },
    });
    const service = createStructuredOutputService(aiService);

    const result = await service.generateContent(articleSchema, {
      prompt: 'Generate',
      maxRetries: 3,
    });
    expect(result.data.tags).toEqual(['ok']);
    expect(result.attempts).toBe(2);
  });

  it('throws after exhausting retries', async () => {
    const aiService = createAIProviderService({ provider: { provider: 'test' } });
    aiService.setProvider(createTextProvider('always invalid'));
    const service = createStructuredOutputService(aiService);

    await expect(
      service.generateContent(articleSchema, { prompt: 'Generate', maxRetries: 2 }),
    ).rejects.toThrow('Failed to generate valid content after 2 attempts');
  });

  it('accumulates token usage across retries', async () => {
    const aiService = createAIProviderService({ provider: { provider: 'test' } });
    let attempt = 0;
    aiService.setProvider({
      name: 'usage-test',
      async generateText() {
        attempt++;
        const text = attempt < 3
          ? '{"title":"No Tags"}'
          : '{"title":"OK","tags":["final"]}';
        return { text, model: 'test', usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 }, finishReason: 'stop' };
      },
      async embed(options) {
        return { embeddings: options.texts.map(() => [0.1]), model: 'test', usage: { promptTokens: 1, completionTokens: 0, totalTokens: 1 } };
      },
    });
    const service = createStructuredOutputService(aiService);

    const result = await service.generateContent(articleSchema, { prompt: 'Generate', maxRetries: 5 });
    expect(result.attempts).toBe(3);
    expect(result.usage.totalTokens).toBe(60); // 20 * 3 attempts
  });

  it('validates data against schema', () => {
    const aiService = createAIProviderService({ provider: { provider: 'test' } });
    aiService.setProvider(createTextProvider(''));
    const service = createStructuredOutputService(aiService);

    const valid = service.validate({ title: 'Hello', tags: ['a'] }, articleSchema);
    expect(valid.valid).toBe(true);
    expect(valid.errors).toHaveLength(0);

    const invalid = service.validate({ title: 123 as any, tags: 'not-array' as any }, articleSchema);
    expect(invalid.valid).toBe(false);
    expect(invalid.errors.length).toBeGreaterThan(0);
  });

  it('validates required fields', () => {
    const aiService = createAIProviderService({ provider: { provider: 'test' } });
    aiService.setProvider(createTextProvider(''));
    const service = createStructuredOutputService(aiService);

    const result = service.validate({ content: 'no title or tags' }, articleSchema);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Missing required field: title');
    expect(result.errors).toContain('Missing required field: tags');
  });

  it('validates type checking for all basic types', () => {
    const aiService = createAIProviderService({ provider: { provider: 'test' } });
    aiService.setProvider(createTextProvider(''));
    const service = createStructuredOutputService(aiService);

    const schema = {
      type: 'object',
      properties: {
        name: { type: 'string' },
        age: { type: 'integer' },
        score: { type: 'number' },
        active: { type: 'boolean' },
        items: { type: 'array' },
      },
    };

    // All correct types
    expect(service.validate({ name: 'test', age: 25, score: 9.5, active: true, items: [] }, schema).valid).toBe(true);

    // Wrong types
    const result = service.validate({ name: 123, age: 1.5, score: 'high', active: 'yes', items: {} }, schema);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBe(5);
  });

  it('defaults maxRetries to 3', async () => {
    const aiService = createAIProviderService({ provider: { provider: 'test' } });
    let attempts = 0;
    aiService.setProvider({
      name: 'count-attempts',
      async generateText() {
        attempts++;
        return { text: 'bad', model: 'test', usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 }, finishReason: 'stop' };
      },
      async embed(options) {
        return { embeddings: options.texts.map(() => [0.1]), model: 'test', usage: { promptTokens: 1, completionTokens: 0, totalTokens: 1 } };
      },
    });
    const service = createStructuredOutputService(aiService);

    await expect(service.generateContent(articleSchema, { prompt: 'Generate' })).rejects.toThrow();
    expect(attempts).toBe(3);
  });
});
