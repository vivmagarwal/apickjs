/**
 * RAG (Retrieval-Augmented Generation) Pipeline.
 *
 * Chunks content, embeds chunks, and provides retrieval + Q&A.
 */

import type { AIProviderService } from '../provider/index.js';
import type { VectorFieldService } from '../vector/index.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ChunkStrategy = 'fixed' | 'paragraph' | 'heading' | 'field-boundary';

export interface RAGConfig {
  chunkSize?: number;
  chunkOverlap?: number;
  strategy?: ChunkStrategy;
}

export interface Chunk {
  id?: number;
  sourceType: string;
  sourceId: string;
  sourceField: string;
  content: string;
  embedding: number[];
  chunkIndex: number;
  metadata: Record<string, any>;
  createdAt: string;
}

export interface RetrieveOptions {
  query: string;
  uid?: string;
  limit?: number;
  threshold?: number;
}

export interface RetrieveResult {
  chunks: Array<{ content: string; score: number; sourceType: string; sourceId: string; metadata: Record<string, any> }>;
}

export interface AskOptions extends RetrieveOptions {
  systemPrompt?: string;
  maxTokens?: number;
}

export interface AskResult {
  answer: string;
  sources: Array<{ sourceType: string; sourceId: string; content: string; score: number }>;
}

export interface RAGService {
  /** Chunk and embed content from an entry */
  indexEntry(uid: string, documentId: string, fields: Record<string, string>, config?: RAGConfig): Promise<number>;
  /** Remove all chunks for an entry */
  removeEntry(uid: string, documentId: string): number;
  /** Retrieve relevant chunks for a query */
  retrieve(options: RetrieveOptions): Promise<RetrieveResult>;
  /** Ask a question with RAG context */
  ask(options: AskOptions): Promise<AskResult>;
  /** Get chunk count */
  getChunkCount(uid?: string): number;
}

export interface RAGServiceConfig {
  rawDb: any;
  aiProvider: AIProviderService;
  vectorService: VectorFieldService;
}

// ---------------------------------------------------------------------------
// Chunking
// ---------------------------------------------------------------------------

function chunkText(text: string, config: RAGConfig = {}): string[] {
  const { chunkSize = 500, chunkOverlap = 50, strategy = 'fixed' } = config;

  if (strategy === 'paragraph') {
    return text.split(/\n\n+/).filter(p => p.trim().length > 0);
  }

  if (strategy === 'heading') {
    const sections = text.split(/(?=^#{1,6}\s)/m).filter(s => s.trim().length > 0);
    return sections.length > 0 ? sections : [text];
  }

  // Fixed-size chunking
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    chunks.push(text.slice(start, end));
    if (end >= text.length) break;
    const next = end - chunkOverlap;
    start = next <= start ? start + 1 : next;
  }
  return chunks;
}

// ---------------------------------------------------------------------------
// Table setup
// ---------------------------------------------------------------------------

function ensureTables(db: any): void {
  db.exec(`CREATE TABLE IF NOT EXISTS "ai_chunks" (
    "id" INTEGER PRIMARY KEY AUTOINCREMENT,
    "source_type" VARCHAR(255) NOT NULL,
    "source_id" VARCHAR(255) NOT NULL,
    "source_field" VARCHAR(255) NOT NULL,
    "content" TEXT NOT NULL,
    "embedding" TEXT NOT NULL DEFAULT '[]',
    "chunk_index" INTEGER NOT NULL DEFAULT 0,
    "metadata" TEXT NOT NULL DEFAULT '{}',
    "created_at" TEXT NOT NULL
  )`);
  db.exec(`CREATE INDEX IF NOT EXISTS "idx_chunks_source" ON "ai_chunks" ("source_type", "source_id")`);
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createRAGService(config: RAGServiceConfig): RAGService {
  const { rawDb, aiProvider, vectorService } = config;
  ensureTables(rawDb);

  return {
    async indexEntry(uid, documentId, fields, ragConfig) {
      // Remove existing chunks
      this.removeEntry(uid, documentId);

      let totalChunks = 0;
      const now = new Date().toISOString();

      for (const [fieldName, content] of Object.entries(fields)) {
        if (!content || content.trim().length === 0) continue;

        const chunks = chunkText(content, ragConfig);
        if (chunks.length === 0) continue;

        // Batch embed
        const embedResult = await aiProvider.embed({ texts: chunks });

        const stmt = rawDb.prepare(`
          INSERT INTO "ai_chunks" (source_type, source_id, source_field, content, embedding, chunk_index, metadata, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);

        for (let i = 0; i < chunks.length; i++) {
          stmt.run(
            uid, documentId, fieldName, chunks[i],
            JSON.stringify(embedResult.embeddings[i] ?? []),
            i, JSON.stringify({ field: fieldName }), now,
          );
          totalChunks++;
        }
      }

      return totalChunks;
    },

    removeEntry(uid, documentId) {
      return rawDb.prepare('DELETE FROM "ai_chunks" WHERE source_type = ? AND source_id = ?')
        .run(uid, documentId).changes;
    },

    async retrieve(options) {
      const { query, uid, limit = 5, threshold = 0.5 } = options;

      const embedResult = await aiProvider.embed({ texts: [query] });
      const queryEmbedding = embedResult.embeddings[0];
      if (!queryEmbedding) return { chunks: [] };

      let rows: any[];
      if (uid) {
        rows = rawDb.prepare('SELECT * FROM "ai_chunks" WHERE source_type = ?').all(uid);
      } else {
        rows = rawDb.prepare('SELECT * FROM "ai_chunks"').all();
      }

      const scored = rows
        .map((row: any) => {
          const embedding = JSON.parse(row.embedding);
          const score = vectorService.cosineSimilarity(queryEmbedding, embedding);
          return {
            content: row.content,
            score,
            sourceType: row.source_type,
            sourceId: row.source_id,
            metadata: JSON.parse(row.metadata),
          };
        })
        .filter(r => r.score >= threshold)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);

      return { chunks: scored };
    },

    async ask(options) {
      const { query, systemPrompt, maxTokens = 500 } = options;

      const retrieved = await this.retrieve(options);
      if (retrieved.chunks.length === 0) {
        const result = await aiProvider.generateText({ prompt: query, maxTokens });
        return { answer: result.text, sources: [] };
      }

      const context = retrieved.chunks.map(c => c.content).join('\n\n---\n\n');
      const prompt = `Based on the following context, answer the question.\n\nContext:\n${context}\n\nQuestion: ${query}`;

      const result = await aiProvider.generateText({
        prompt,
        systemPrompt: systemPrompt ?? 'Answer based on the provided context. If the context does not contain relevant information, say so.',
        maxTokens,
      });

      return {
        answer: result.text,
        sources: retrieved.chunks.map(c => ({
          sourceType: c.sourceType,
          sourceId: c.sourceId,
          content: c.content,
          score: c.score,
        })),
      };
    },

    getChunkCount(uid) {
      if (uid) {
        return rawDb.prepare('SELECT COUNT(*) as cnt FROM "ai_chunks" WHERE source_type = ?').get(uid).cnt;
      }
      return rawDb.prepare('SELECT COUNT(*) as cnt FROM "ai_chunks"').get().cnt;
    },
  };
}
