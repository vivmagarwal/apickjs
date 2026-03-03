/**
 * @apick/ai — AI Plugin for APICK CMS.
 *
 * Provides AI provider abstraction, vector fields, semantic search,
 * content enrichment, prompt registry, structured output, and RAG pipeline.
 */

// Provider
export {
  createAIProviderService,
  type AIProvider,
  type AIProviderService,
  type AIProviderConfig,
  type AIPluginConfig,
  type AIFeatureFlags,
  type TokenUsage,
  type GenerateTextOptions,
  type GenerateTextResult,
  type EmbedOptions,
  type EmbedResult,
  type GenerateObjectOptions,
  type GenerateObjectResult,
  type StreamTextOptions,
  type StreamTextChunk,
} from './provider/index.js';

// Vector
export {
  createVectorFieldService,
  type VectorFieldService,
  type VectorFieldConfig,
} from './vector/index.js';

// Search
export {
  createSearchService,
  type SearchService,
  type SearchServiceConfig,
  type SearchOptions,
  type SearchResult,
  type SearchMode,
} from './search/index.js';

// Enrichment
export {
  createEnrichmentService,
  type EnrichmentService,
  type EnrichmentFieldConfig,
  type CustomGenerator,
  type BuiltinGenerator,
} from './enrichment/index.js';

// Prompts
export {
  createPromptService,
  type PromptService,
  type PromptServiceConfig,
  type PromptTemplate,
} from './prompts/index.js';

// Structured Output / Generation
export {
  createStructuredOutputService,
  type StructuredOutputService,
  type GenerateContentOptions,
  type GenerateContentResult,
} from './generation/index.js';

// RAG
export {
  createRAGService,
  type RAGService,
  type RAGServiceConfig,
  type RAGConfig,
  type Chunk,
  type ChunkStrategy,
  type RetrieveOptions,
  type RetrieveResult,
  type AskOptions,
  type AskResult,
} from './rag/index.js';
