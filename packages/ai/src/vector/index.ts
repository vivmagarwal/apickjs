/**
 * Vector Field & Auto-Embedding.
 *
 * Registers a custom vector field type with auto-embedding via
 * lifecycle hooks and the job queue.
 */

import type { AIProviderService } from '../provider/index.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface VectorFieldConfig {
  sourceFields: string[];
  model?: string;
  dimensions?: number;
}

export interface VectorFieldService {
  /** Compute embedding for a content entry's source fields */
  computeEmbedding(entry: Record<string, any>, config: VectorFieldConfig): Promise<number[]>;
  /** Check if source fields have changed between old and new entry */
  hasSourceChanged(oldEntry: Record<string, any>, newEntry: Record<string, any>, sourceFields: string[]): boolean;
  /** Compute cosine similarity between two vectors */
  cosineSimilarity(a: number[], b: number[]): number;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createVectorFieldService(aiProvider: AIProviderService): VectorFieldService {
  return {
    async computeEmbedding(entry, config) {
      const texts = config.sourceFields
        .map(field => entry[field])
        .filter(v => typeof v === 'string' && v.length > 0);

      if (texts.length === 0) return [];

      const combined = texts.join(' ');
      const result = await aiProvider.embed({
        texts: [combined],
        model: config.model,
        dimensions: config.dimensions,
      });

      return result.embeddings[0] ?? [];
    },

    hasSourceChanged(oldEntry, newEntry, sourceFields) {
      for (const field of sourceFields) {
        if (oldEntry[field] !== newEntry[field]) return true;
      }
      return false;
    },

    cosineSimilarity(a, b) {
      if (a.length !== b.length || a.length === 0) return 0;

      let dotProduct = 0;
      let normA = 0;
      let normB = 0;

      for (let i = 0; i < a.length; i++) {
        dotProduct += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
      }

      const denominator = Math.sqrt(normA) * Math.sqrt(normB);
      if (denominator === 0) return 0;

      return dotProduct / denominator;
    },
  };
}
