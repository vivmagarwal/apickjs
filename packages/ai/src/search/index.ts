/**
 * Semantic Search Service.
 *
 * Provides keyword, semantic (vector), and hybrid search modes.
 * Hybrid uses Reciprocal Rank Fusion (RRF) to merge results.
 */

import type { AIProviderService } from '../provider/index.js';
import type { VectorFieldService } from '../vector/index.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SearchMode = 'keyword' | 'semantic' | 'hybrid';

export interface SearchOptions {
  query: string;
  mode?: SearchMode;
  limit?: number;
  offset?: number;
  locale?: string;
  threshold?: number;
}

export interface SearchResult {
  documentId: string;
  score: number;
  source: 'keyword' | 'semantic';
  data: Record<string, any>;
}

export interface SearchService {
  search(uid: string, options: SearchOptions): Promise<SearchResult[]>;
}

export interface SearchServiceConfig {
  aiProvider: AIProviderService;
  vectorService: VectorFieldService;
  /** Function to perform keyword search against the DB */
  keywordSearch: (uid: string, query: string, limit: number) => SearchResult[];
  /** Function to get all entries with vector data */
  vectorEntries: (uid: string) => Array<{ documentId: string; embedding: number[]; data: Record<string, any> }>;
}

// ---------------------------------------------------------------------------
// RRF merge
// ---------------------------------------------------------------------------

function reciprocalRankFusion(
  keywordResults: SearchResult[],
  semanticResults: SearchResult[],
  k: number = 60,
): SearchResult[] {
  const scores = new Map<string, { score: number; data: Record<string, any> }>();

  for (let i = 0; i < keywordResults.length; i++) {
    const r = keywordResults[i];
    const existing = scores.get(r.documentId);
    const rrf = 1 / (k + i + 1);
    if (existing) {
      existing.score += rrf;
    } else {
      scores.set(r.documentId, { score: rrf, data: r.data });
    }
  }

  for (let i = 0; i < semanticResults.length; i++) {
    const r = semanticResults[i];
    const existing = scores.get(r.documentId);
    const rrf = 1 / (k + i + 1);
    if (existing) {
      existing.score += rrf;
    } else {
      scores.set(r.documentId, { score: rrf, data: r.data });
    }
  }

  return Array.from(scores.entries())
    .map(([documentId, { score, data }]) => ({ documentId, score, source: 'keyword' as const, data }))
    .sort((a, b) => b.score - a.score);
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createSearchService(config: SearchServiceConfig): SearchService {
  const { aiProvider, vectorService, keywordSearch, vectorEntries } = config;

  async function semanticSearch(uid: string, query: string, limit: number, threshold: number): Promise<SearchResult[]> {
    const embedResult = await aiProvider.embed({ texts: [query] });
    const queryEmbedding = embedResult.embeddings[0];
    if (!queryEmbedding || queryEmbedding.length === 0) return [];

    const entries = vectorEntries(uid);
    const scored = entries
      .map(entry => ({
        documentId: entry.documentId,
        score: vectorService.cosineSimilarity(queryEmbedding, entry.embedding),
        source: 'semantic' as const,
        data: entry.data,
      }))
      .filter(r => r.score >= threshold)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    return scored;
  }

  return {
    async search(uid, options) {
      const { query, mode = 'keyword', limit = 10, threshold = 0.5 } = options;

      if (mode === 'keyword') {
        return keywordSearch(uid, query, limit);
      }

      if (mode === 'semantic') {
        return semanticSearch(uid, query, limit, threshold);
      }

      // Hybrid: RRF merge
      const [kw, sem] = await Promise.all([
        Promise.resolve(keywordSearch(uid, query, limit)),
        semanticSearch(uid, query, limit, threshold),
      ]);

      return reciprocalRankFusion(kw, sem).slice(0, limit);
    },
  };
}
