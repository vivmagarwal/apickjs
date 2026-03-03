import { describe, it, expect } from 'vitest';
import { createAIProviderService } from '../src/provider/index.js';
import { createVectorFieldService } from '../src/vector/index.js';
import { createSearchService } from '../src/search/index.js';
import type { AIProvider } from '../src/provider/index.js';
import type { SearchResult } from '../src/search/index.js';

// Deterministic embeddings: encode text as a simple vector based on char codes
function textToVector(text: string): number[] {
  const vec = [0, 0, 0, 0];
  for (let i = 0; i < text.length; i++) {
    vec[i % 4] += text.charCodeAt(i) / 1000;
  }
  // Normalize
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
  return norm > 0 ? vec.map(v => v / norm) : vec;
}

function createTestProvider(): AIProvider {
  return {
    name: 'search-test',
    async generateText(options) {
      return { text: '', model: 'test', usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 }, finishReason: 'stop' };
    },
    async embed(options) {
      return {
        embeddings: options.texts.map(textToVector),
        model: 'test',
        usage: { promptTokens: 1, completionTokens: 0, totalTokens: 1 },
      };
    },
  };
}

describe('Semantic Search Service', () => {
  function setup() {
    const aiService = createAIProviderService({ provider: { provider: 'test' } });
    aiService.setProvider(createTestProvider());
    const vectorService = createVectorFieldService(aiService);

    const entries = [
      { documentId: 'doc-1', embedding: textToVector('typescript programming language'), data: { title: 'TypeScript' } },
      { documentId: 'doc-2', embedding: textToVector('cooking recipes food'), data: { title: 'Cooking' } },
      { documentId: 'doc-3', embedding: textToVector('javascript programming web'), data: { title: 'JavaScript' } },
    ];

    const keywordResults: SearchResult[] = [
      { documentId: 'doc-1', score: 1.0, source: 'keyword', data: { title: 'TypeScript' } },
    ];

    const searchService = createSearchService({
      aiProvider: aiService,
      vectorService,
      keywordSearch: (_uid, _query, _limit) => keywordResults,
      vectorEntries: (_uid) => entries,
    });

    return { searchService };
  }

  it('performs keyword search', async () => {
    const { searchService } = setup();
    const results = await searchService.search('api::article.article', {
      query: 'typescript',
      mode: 'keyword',
    });
    expect(results).toHaveLength(1);
    expect(results[0].documentId).toBe('doc-1');
    expect(results[0].source).toBe('keyword');
  });

  it('performs semantic search and ranks by similarity', async () => {
    const { searchService } = setup();
    const results = await searchService.search('api::article.article', {
      query: 'typescript programming language',
      mode: 'semantic',
      limit: 3,
      threshold: 0.0, // low threshold so all results pass
    });
    expect(results.length).toBeGreaterThanOrEqual(1);
    // Results should be sorted by score descending
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score);
    }
  });

  it('filters semantic results by threshold', async () => {
    const { searchService } = setup();
    const results = await searchService.search('api::article.article', {
      query: 'typescript programming language',
      mode: 'semantic',
      threshold: 0.99, // very high threshold
    });
    // With high threshold, only very similar results pass
    for (const r of results) {
      expect(r.score).toBeGreaterThanOrEqual(0.99);
    }
  });

  it('performs hybrid search with RRF merge', async () => {
    const { searchService } = setup();
    const results = await searchService.search('api::article.article', {
      query: 'typescript programming',
      mode: 'hybrid',
      limit: 5,
      threshold: 0.0,
    });
    // Hybrid should return results from both keyword and semantic
    expect(results.length).toBeGreaterThanOrEqual(1);
    // doc-1 should rank high (present in both keyword and semantic)
    const doc1 = results.find(r => r.documentId === 'doc-1');
    expect(doc1).toBeDefined();
  });

  it('defaults to keyword mode', async () => {
    const { searchService } = setup();
    const results = await searchService.search('api::article.article', {
      query: 'test',
    });
    // Default mode is keyword
    expect(results).toHaveLength(1);
    expect(results[0].source).toBe('keyword');
  });

  it('respects limit parameter', async () => {
    const { searchService } = setup();
    const results = await searchService.search('api::article.article', {
      query: 'programming',
      mode: 'semantic',
      limit: 1,
      threshold: 0.0,
    });
    expect(results.length).toBeLessThanOrEqual(1);
  });

  it('returns empty for semantic search when embedding fails', async () => {
    const aiService = createAIProviderService({ provider: { provider: 'test' } });
    aiService.setProvider({
      name: 'empty-embed',
      async generateText() {
        return { text: '', model: 'test', usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 }, finishReason: 'stop' };
      },
      async embed() {
        return { embeddings: [[]], model: 'test', usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 } };
      },
    });
    const vectorService = createVectorFieldService(aiService);
    const searchService = createSearchService({
      aiProvider: aiService,
      vectorService,
      keywordSearch: () => [],
      vectorEntries: () => [],
    });
    const results = await searchService.search('uid', { query: 'test', mode: 'semantic' });
    expect(results).toEqual([]);
  });
});
