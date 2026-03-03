import { describe, it, expect } from 'vitest';
import { createAIProviderService } from '../src/provider/index.js';
import { createEnrichmentService } from '../src/enrichment/index.js';
import type { AIProvider } from '../src/provider/index.js';

function createTestProvider(): AIProvider {
  return {
    name: 'enrichment-test',
    async generateText(options) {
      const prompt = options.prompt;
      // Return deterministic results based on prompt content
      if (prompt.includes('Summarize')) {
        return { text: 'This is a summary of the content.', model: 'test', usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 }, finishReason: 'stop' };
      }
      if (prompt.includes('Extract')) {
        return { text: '["typescript", "programming", "tutorial"]', model: 'test', usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 }, finishReason: 'stop' };
      }
      if (prompt.includes('SEO meta')) {
        return { text: 'Learn TypeScript programming with this comprehensive guide covering types, interfaces, and advanced patterns.', model: 'test', usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 }, finishReason: 'stop' };
      }
      if (prompt.includes('alt text')) {
        return { text: 'A scenic mountain landscape at sunset.', model: 'test', usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 }, finishReason: 'stop' };
      }
      if (prompt.includes('sentiment')) {
        return { text: '0.75', model: 'test', usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 }, finishReason: 'stop' };
      }
      if (prompt.includes('Classify')) {
        return { text: 'Technology', model: 'test', usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 }, finishReason: 'stop' };
      }
      if (prompt.includes('Translate')) {
        return { text: 'Hola mundo', model: 'test', usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 }, finishReason: 'stop' };
      }
      return { text: 'generic response', model: 'test', usage: { promptTokens: 5, completionTokens: 5, totalTokens: 10 }, finishReason: 'stop' };
    },
    async embed(options) {
      return { embeddings: options.texts.map(() => [0.1]), model: 'test', usage: { promptTokens: 1, completionTokens: 0, totalTokens: 1 } };
    },
  };
}

describe('AI Content Enrichment', () => {
  function setup() {
    const aiService = createAIProviderService({ provider: { provider: 'test' } });
    aiService.setProvider(createTestProvider());
    const enrichmentService = createEnrichmentService(aiService);
    return { enrichmentService };
  }

  it('enriches with summarize generator', async () => {
    const { enrichmentService } = setup();
    const result = await enrichmentService.enrichField(
      { content: 'A long article about TypeScript...' },
      { generate: 'summarize', sourceFields: ['content'] },
    );
    expect(result).toBe('This is a summary of the content.');
  });

  it('enriches with extract-tags generator (parses JSON array)', async () => {
    const { enrichmentService } = setup();
    const result = await enrichmentService.enrichField(
      { title: 'TypeScript Guide', content: 'Learn TypeScript' },
      { generate: 'extract-tags', sourceFields: ['title', 'content'] },
    );
    expect(result).toEqual(['typescript', 'programming', 'tutorial']);
  });

  it('enriches with seo-description generator', async () => {
    const { enrichmentService } = setup();
    const result = await enrichmentService.enrichField(
      { title: 'TypeScript Guide', content: 'A guide about TypeScript' },
      { generate: 'seo-description' },
    );
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('enriches with image-alt-text generator', async () => {
    const { enrichmentService } = setup();
    const result = await enrichmentService.enrichField(
      { name: 'mountain.jpg', url: '/uploads/mountain.jpg' },
      { generate: 'image-alt-text' },
    );
    expect(typeof result).toBe('string');
    expect(result).toContain('mountain');
  });

  it('enriches with sentiment-score generator (returns number)', async () => {
    const { enrichmentService } = setup();
    const result = await enrichmentService.enrichField(
      { content: 'This is a great product!' },
      { generate: 'sentiment-score', sourceFields: ['content'] },
    );
    expect(typeof result).toBe('number');
    expect(result).toBeGreaterThanOrEqual(-1);
    expect(result).toBeLessThanOrEqual(1);
    expect(result).toBeCloseTo(0.75);
  });

  it('enriches with classify generator', async () => {
    const { enrichmentService } = setup();
    const result = await enrichmentService.enrichField(
      { title: 'Node.js Tutorial', content: 'Learn Node.js' },
      { generate: 'classify' },
    );
    expect(result).toBe('Technology');
  });

  it('enriches with translate generator', async () => {
    const { enrichmentService } = setup();
    const result = await enrichmentService.enrichField(
      { content: 'Hello world', _targetLanguage: 'Spanish' },
      { generate: 'translate', sourceFields: ['content'] },
    );
    expect(result).toBe('Hola mundo');
  });

  it('enriches multiple fields on an entry', async () => {
    const { enrichmentService } = setup();
    const entry = { title: 'Test', content: 'Some content about TypeScript' };
    const result = await enrichmentService.enrichEntry(entry, {
      summary: { generate: 'summarize', sourceFields: ['content'] },
      category: { generate: 'classify', sourceFields: ['title', 'content'] },
    });
    expect(result.summary).toBe('This is a summary of the content.');
    expect(result.category).toBe('Technology');
  });

  it('registers and uses a custom generator', async () => {
    const { enrichmentService } = setup();
    enrichmentService.registerGenerator('word-count', {
      prompt: (entry) => `Count the words in: ${entry.content}`,
      outputTransform: (result) => parseInt(result) || 0,
    });
    const result = await enrichmentService.enrichField(
      { content: 'one two three' },
      { generate: 'word-count' },
    );
    // The mock provider returns 'generic response' which parseInt gives 0
    expect(typeof result).toBe('number');
  });

  it('throws for unknown generator', async () => {
    const { enrichmentService } = setup();
    await expect(
      enrichmentService.enrichField({ content: 'test' }, { generate: 'nonexistent' as any }),
    ).rejects.toThrow('Unknown enrichment generator');
  });

  it('shouldEnrich returns true for create when regenerateOn is create', () => {
    const { enrichmentService } = setup();
    expect(enrichmentService.shouldEnrich({ generate: 'summarize', regenerateOn: 'create' }, 'create')).toBe(true);
    expect(enrichmentService.shouldEnrich({ generate: 'summarize', regenerateOn: 'create' }, 'update')).toBe(false);
  });

  it('shouldEnrich returns true for update when regenerateOn is update', () => {
    const { enrichmentService } = setup();
    expect(enrichmentService.shouldEnrich({ generate: 'summarize', regenerateOn: 'update' }, 'update')).toBe(true);
    expect(enrichmentService.shouldEnrich({ generate: 'summarize', regenerateOn: 'update' }, 'create')).toBe(false);
  });

  it('shouldEnrich returns true for both events when regenerateOn is both', () => {
    const { enrichmentService } = setup();
    expect(enrichmentService.shouldEnrich({ generate: 'summarize', regenerateOn: 'both' }, 'create')).toBe(true);
    expect(enrichmentService.shouldEnrich({ generate: 'summarize', regenerateOn: 'both' }, 'update')).toBe(true);
  });

  it('shouldEnrich returns false when regenerateOn is manual', () => {
    const { enrichmentService } = setup();
    expect(enrichmentService.shouldEnrich({ generate: 'summarize', regenerateOn: 'manual' }, 'create')).toBe(false);
    expect(enrichmentService.shouldEnrich({ generate: 'summarize', regenerateOn: 'manual' }, 'update')).toBe(false);
  });

  it('shouldEnrich defaults to both when regenerateOn is undefined', () => {
    const { enrichmentService } = setup();
    expect(enrichmentService.shouldEnrich({ generate: 'summarize' }, 'create')).toBe(true);
    expect(enrichmentService.shouldEnrich({ generate: 'summarize' }, 'update')).toBe(true);
  });
});
