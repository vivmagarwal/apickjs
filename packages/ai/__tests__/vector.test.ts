import { describe, it, expect } from 'vitest';
import { createAIProviderService } from '../src/provider/index.js';
import { createVectorFieldService } from '../src/vector/index.js';
import type { AIProvider } from '../src/provider/index.js';

function createTestProvider(): AIProvider {
  return {
    name: 'test-embed',
    async generateText(options) {
      return { text: '', model: 'test', usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 }, finishReason: 'stop' };
    },
    async embed(options) {
      // Return deterministic embeddings based on text length
      const embeddings = options.texts.map(t => {
        const len = t.length;
        return [len / 100, (len % 50) / 50, (len % 25) / 25];
      });
      return { embeddings, model: 'test-embed', usage: { promptTokens: 5, completionTokens: 0, totalTokens: 5 } };
    },
  };
}

describe('Vector Field Service', () => {
  function setup() {
    const aiService = createAIProviderService({ provider: { provider: 'test' } });
    aiService.setProvider(createTestProvider());
    const vectorService = createVectorFieldService(aiService);
    return { vectorService };
  }

  it('computes embeddings from source fields', async () => {
    const { vectorService } = setup();
    const entry = { title: 'Hello World', content: 'Some content here' };
    const embedding = await vectorService.computeEmbedding(entry, {
      sourceFields: ['title', 'content'],
    });
    expect(embedding).toBeInstanceOf(Array);
    expect(embedding.length).toBeGreaterThan(0);
    expect(embedding.every(v => typeof v === 'number')).toBe(true);
  });

  it('returns empty array when no source fields have content', async () => {
    const { vectorService } = setup();
    const entry = { title: '', content: '' };
    const embedding = await vectorService.computeEmbedding(entry, {
      sourceFields: ['title', 'content'],
    });
    expect(embedding).toEqual([]);
  });

  it('skips missing and non-string fields', async () => {
    const { vectorService } = setup();
    const entry = { title: 'Hello', count: 42 };
    const embedding = await vectorService.computeEmbedding(entry, {
      sourceFields: ['title', 'content', 'count'],
    });
    expect(embedding.length).toBeGreaterThan(0);
  });

  it('detects source field changes', () => {
    const { vectorService } = setup();
    const oldEntry = { title: 'Old Title', content: 'Same content' };
    const newEntry = { title: 'New Title', content: 'Same content' };
    expect(vectorService.hasSourceChanged(oldEntry, newEntry, ['title', 'content'])).toBe(true);
  });

  it('detects no change when fields are identical', () => {
    const { vectorService } = setup();
    const entry = { title: 'Same', content: 'Same' };
    expect(vectorService.hasSourceChanged(entry, entry, ['title', 'content'])).toBe(false);
  });

  it('computes cosine similarity of identical vectors as 1', () => {
    const { vectorService } = setup();
    const vec = [1, 2, 3];
    expect(vectorService.cosineSimilarity(vec, vec)).toBeCloseTo(1.0, 5);
  });

  it('computes cosine similarity of orthogonal vectors as 0', () => {
    const { vectorService } = setup();
    expect(vectorService.cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0.0, 5);
  });

  it('computes cosine similarity of opposite vectors as -1', () => {
    const { vectorService } = setup();
    expect(vectorService.cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1.0, 5);
  });

  it('returns 0 for empty vectors', () => {
    const { vectorService } = setup();
    expect(vectorService.cosineSimilarity([], [])).toBe(0);
  });

  it('returns 0 for mismatched vector lengths', () => {
    const { vectorService } = setup();
    expect(vectorService.cosineSimilarity([1, 2], [1, 2, 3])).toBe(0);
  });

  it('passes model and dimensions to embed call', async () => {
    const aiService = createAIProviderService({ provider: { provider: 'test' } });
    let capturedModel: string | undefined;
    let capturedDimensions: number | undefined;
    aiService.setProvider({
      name: 'spy',
      async generateText() {
        return { text: '', model: 'spy', usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 }, finishReason: 'stop' };
      },
      async embed(options) {
        capturedModel = options.model;
        capturedDimensions = options.dimensions;
        return { embeddings: [[0.5]], model: 'spy', usage: { promptTokens: 1, completionTokens: 0, totalTokens: 1 } };
      },
    });
    const vectorService = createVectorFieldService(aiService);
    await vectorService.computeEmbedding({ text: 'hi' }, {
      sourceFields: ['text'],
      model: 'text-embedding-3-small',
      dimensions: 256,
    });
    expect(capturedModel).toBe('text-embedding-3-small');
    expect(capturedDimensions).toBe(256);
  });
});
