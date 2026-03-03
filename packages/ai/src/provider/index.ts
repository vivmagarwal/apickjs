/**
 * AI Provider System.
 *
 * Defines the AI provider interface and a registry for managing
 * AI providers (OpenAI, Anthropic, Google, Ollama, etc.).
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface GenerateTextOptions {
  prompt: string;
  systemPrompt?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  stopSequences?: string[];
}

export interface GenerateTextResult {
  text: string;
  model: string;
  usage: TokenUsage;
  finishReason: 'stop' | 'length' | 'content-filter' | 'error';
}

export interface EmbedOptions {
  texts: string[];
  model?: string;
  dimensions?: number;
}

export interface EmbedResult {
  embeddings: number[][];
  model: string;
  usage: TokenUsage;
}

export interface GenerateObjectOptions {
  prompt: string;
  systemPrompt?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  schema: Record<string, any>; // JSON Schema
}

export interface GenerateObjectResult {
  data: Record<string, any>;
  text: string;
  model: string;
  usage: TokenUsage;
}

export interface StreamTextOptions {
  prompt: string;
  systemPrompt?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface StreamTextChunk {
  text: string;
  done: boolean;
  usage?: TokenUsage;
}

export interface AIProvider {
  name: string;
  /** Generate text from a prompt */
  generateText(options: GenerateTextOptions): Promise<GenerateTextResult>;
  /** Generate embeddings for text */
  embed(options: EmbedOptions): Promise<EmbedResult>;
  /** Generate a structured object matching a JSON Schema */
  generateObject?(options: GenerateObjectOptions): Promise<GenerateObjectResult>;
  /** Stream text from a prompt */
  streamText?(options: StreamTextOptions): AsyncIterable<StreamTextChunk>;
}

export interface AIProviderConfig {
  provider: string;
  apiKey?: string;
  baseUrl?: string;
  defaultModel?: string;
  defaultEmbeddingModel?: string;
  options?: Record<string, any>;
}

export interface AIFeatureFlags {
  vectorField?: boolean;
  semanticSearch?: boolean;
  enrichment?: boolean;
  prompts?: boolean;
  structuredOutput?: boolean;
  rag?: boolean;
}

export interface AIPluginConfig {
  provider: AIProviderConfig;
  features?: AIFeatureFlags;
}

// ---------------------------------------------------------------------------
// AI Provider Service
// ---------------------------------------------------------------------------

export interface AIProviderService {
  /** Get the active AI provider */
  getProvider(): AIProvider;
  /** Set the active AI provider */
  setProvider(provider: AIProvider): void;
  /** Generate text */
  generateText(options: GenerateTextOptions): Promise<GenerateTextResult>;
  /** Generate embeddings */
  embed(options: EmbedOptions): Promise<EmbedResult>;
  /** Generate structured object */
  generateObject(options: GenerateObjectOptions): Promise<GenerateObjectResult>;
  /** Stream text */
  streamText(options: StreamTextOptions): AsyncIterable<StreamTextChunk>;
  /** Check if a feature is enabled */
  isFeatureEnabled(feature: keyof AIFeatureFlags): boolean;
}

export function createAIProviderService(config: AIPluginConfig): AIProviderService {
  let activeProvider: AIProvider | null = null;
  const features = config.features ?? {};

  return {
    getProvider() {
      if (!activeProvider) {
        throw new Error('No AI provider configured. Set a provider via config/plugins.ts');
      }
      return activeProvider;
    },

    setProvider(provider) {
      activeProvider = provider;
    },

    async generateText(options) {
      return this.getProvider().generateText(options);
    },

    async embed(options) {
      return this.getProvider().embed(options);
    },

    async generateObject(options) {
      const provider = this.getProvider();
      if (!provider.generateObject) {
        throw new Error(`Provider "${provider.name}" does not support generateObject`);
      }
      return provider.generateObject(options);
    },

    streamText(options) {
      const provider = this.getProvider();
      if (!provider.streamText) {
        throw new Error(`Provider "${provider.name}" does not support streamText`);
      }
      return provider.streamText(options);
    },

    isFeatureEnabled(feature) {
      return features[feature] ?? false;
    },
  };
}
