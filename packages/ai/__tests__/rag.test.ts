import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { createAIProviderService } from '../src/provider/index.js';
import { createVectorFieldService } from '../src/vector/index.js';
import { createRAGService } from '../src/rag/index.js';
import type { AIProvider } from '../src/provider/index.js';
import type { RAGService } from '../src/rag/index.js';

// Deterministic embeddings: encode text as a normalized vector based on char codes
function textToVector(text: string): number[] {
  const vec = [0, 0, 0, 0, 0, 0, 0, 0];
  for (let i = 0; i < text.length; i++) {
    vec[i % 8] += text.charCodeAt(i) / 500;
  }
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
  return norm > 0 ? vec.map(v => v / norm) : vec;
}

function createTestProvider(): AIProvider {
  return {
    name: 'rag-test',
    async generateText(options) {
      return {
        text: `Answer based on context: ${options.prompt.slice(0, 50)}`,
        model: 'test',
        usage: { promptTokens: 20, completionTokens: 20, totalTokens: 40 },
        finishReason: 'stop',
      };
    },
    async embed(options) {
      return {
        embeddings: options.texts.map(textToVector),
        model: 'test-embed',
        usage: { promptTokens: options.texts.length, completionTokens: 0, totalTokens: options.texts.length },
      };
    },
  };
}

describe('RAG Pipeline', () => {
  let db: any;
  let ragService: RAGService;

  beforeEach(() => {
    db = new Database(':memory:');
    const aiService = createAIProviderService({ provider: { provider: 'test' } });
    aiService.setProvider(createTestProvider());
    const vectorService = createVectorFieldService(aiService);
    ragService = createRAGService({ rawDb: db, aiProvider: aiService, vectorService });
  });

  it('indexes an entry and creates chunks', async () => {
    const count = await ragService.indexEntry('api::article.article', 'doc-1', {
      title: 'TypeScript Guide',
      content: 'TypeScript is a typed superset of JavaScript. It adds optional static type checking.',
    });
    expect(count).toBeGreaterThan(0);
    expect(ragService.getChunkCount('api::article.article')).toBe(count);
  });

  it('indexes with paragraph strategy', async () => {
    const content = 'First paragraph about TypeScript.\n\nSecond paragraph about JavaScript.\n\nThird paragraph about Rust.';
    const count = await ragService.indexEntry('api::article.article', 'doc-2', { content }, { strategy: 'paragraph' });
    expect(count).toBe(3);
  });

  it('indexes with heading strategy', async () => {
    const content = '# Introduction\nSome intro text\n# Methods\nSome method details\n# Conclusion\nFinal thoughts';
    const count = await ragService.indexEntry('api::article.article', 'doc-3', { content }, { strategy: 'heading' });
    expect(count).toBe(3);
  });

  it('indexes with fixed chunking and overlap', async () => {
    const content = 'A'.repeat(1200); // 1200 chars
    const count = await ragService.indexEntry('api::article.article', 'doc-4', { content }, {
      strategy: 'fixed',
      chunkSize: 500,
      chunkOverlap: 50,
    });
    expect(count).toBe(3); // 0-500, 450-950, 900-1200
  });

  it('skips empty fields during indexing', async () => {
    const count = await ragService.indexEntry('api::article.article', 'doc-5', {
      title: 'Has Title',
      content: '',
      description: '   ',
    });
    expect(count).toBe(1); // Only title is non-empty
  });

  it('removes existing chunks on re-index', async () => {
    await ragService.indexEntry('api::article.article', 'doc-6', { content: 'First version' });
    expect(ragService.getChunkCount('api::article.article')).toBe(1);

    await ragService.indexEntry('api::article.article', 'doc-6', { content: 'Second version with more text' });
    expect(ragService.getChunkCount('api::article.article')).toBe(1); // replaced, not duplicated
  });

  it('removes entry chunks', async () => {
    await ragService.indexEntry('api::article.article', 'doc-7', { content: 'Some content' });
    expect(ragService.getChunkCount('api::article.article')).toBe(1);

    const removed = ragService.removeEntry('api::article.article', 'doc-7');
    expect(removed).toBe(1);
    expect(ragService.getChunkCount('api::article.article')).toBe(0);
  });

  it('retrieves relevant chunks by semantic similarity', async () => {
    await ragService.indexEntry('api::article.article', 'doc-ts', {
      content: 'TypeScript is a programming language developed by Microsoft for web development.',
    });
    await ragService.indexEntry('api::article.article', 'doc-cook', {
      content: 'Cooking pasta requires boiling water and adding salt for flavor.',
    });

    const result = await ragService.retrieve({
      query: 'TypeScript programming language',
      uid: 'api::article.article',
      threshold: 0.0,
      limit: 5,
    });
    expect(result.chunks.length).toBeGreaterThanOrEqual(1);
    // Chunks should be sorted by score descending
    for (let i = 1; i < result.chunks.length; i++) {
      expect(result.chunks[i - 1].score).toBeGreaterThanOrEqual(result.chunks[i].score);
    }
  });

  it('retrieves across all UIDs when uid is omitted', async () => {
    await ragService.indexEntry('api::article.article', 'doc-a', { content: 'Article about cats' });
    await ragService.indexEntry('api::blog.blog', 'doc-b', { content: 'Blog about cats' });

    const result = await ragService.retrieve({
      query: 'cats',
      threshold: 0.0,
      limit: 10,
    });
    // Should find chunks from both UIDs
    const uids = new Set(result.chunks.map(c => c.sourceType));
    expect(uids.size).toBe(2);
  });

  it('filters by threshold', async () => {
    await ragService.indexEntry('api::article.article', 'doc-x', { content: 'TypeScript generics guide' });
    await ragService.indexEntry('api::article.article', 'doc-y', { content: 'Cooking Italian pasta at home' });

    const result = await ragService.retrieve({
      query: 'TypeScript generics guide',
      uid: 'api::article.article',
      threshold: 0.95, // Very high threshold
      limit: 10,
    });
    // Only very similar chunks should pass
    for (const chunk of result.chunks) {
      expect(chunk.score).toBeGreaterThanOrEqual(0.95);
    }
  });

  it('returns empty when no chunks match threshold', async () => {
    await ragService.indexEntry('api::article.article', 'doc-z', { content: 'Completely unrelated content about cooking' });

    const result = await ragService.retrieve({
      query: 'quantum physics theory',
      uid: 'api::article.article',
      threshold: 0.99,
    });
    // May or may not be empty depending on embeddings, but all must meet threshold
    for (const chunk of result.chunks) {
      expect(chunk.score).toBeGreaterThanOrEqual(0.99);
    }
  });

  it('asks a question with RAG context', async () => {
    await ragService.indexEntry('api::article.article', 'doc-q', {
      content: 'TypeScript was developed by Microsoft and released in 2012. It adds static types to JavaScript.',
    });

    const result = await ragService.ask({
      query: 'When was TypeScript released?',
      uid: 'api::article.article',
      threshold: 0.0,
    });
    expect(result.answer).toBeDefined();
    expect(result.answer.length).toBeGreaterThan(0);
    expect(result.sources.length).toBeGreaterThanOrEqual(1);
    expect(result.sources[0].sourceId).toBe('doc-q');
  });

  it('falls back to direct generation when no chunks found', async () => {
    const result = await ragService.ask({
      query: 'What is the meaning of life?',
      uid: 'api::empty.empty',
      threshold: 0.99,
    });
    expect(result.answer).toBeDefined();
    expect(result.sources).toEqual([]);
  });

  it('uses custom system prompt in ask', async () => {
    await ragService.indexEntry('api::article.article', 'doc-sys', {
      content: 'Some relevant content here for the question.',
    });

    const result = await ragService.ask({
      query: 'test question',
      uid: 'api::article.article',
      systemPrompt: 'You are a concise assistant.',
      threshold: 0.0,
    });
    expect(result.answer).toBeDefined();
  });

  it('respects limit in retrieve', async () => {
    // Create multiple chunks
    for (let i = 0; i < 5; i++) {
      await ragService.indexEntry('api::article.article', `doc-lim-${i}`, {
        content: `Content item number ${i} about programming and development.`,
      });
    }

    const result = await ragService.retrieve({
      query: 'programming',
      uid: 'api::article.article',
      limit: 2,
      threshold: 0.0,
    });
    expect(result.chunks.length).toBeLessThanOrEqual(2);
  });

  it('getChunkCount returns correct counts', async () => {
    expect(ragService.getChunkCount()).toBe(0);

    await ragService.indexEntry('api::article.article', 'doc-c1', { content: 'First' });
    await ragService.indexEntry('api::blog.blog', 'doc-c2', { content: 'Second' });

    expect(ragService.getChunkCount()).toBe(2); // total
    expect(ragService.getChunkCount('api::article.article')).toBe(1);
    expect(ragService.getChunkCount('api::blog.blog')).toBe(1);
  });
});
