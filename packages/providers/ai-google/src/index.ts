/**
 * @apick/provider-ai-google — Google Gemini Provider.
 *
 * Supports Gemini 2.0 Flash, Gemini 2.5 Pro, text-embedding-004.
 * Uses the Google Generative AI REST API directly.
 */

// Inline types to avoid cross-package resolution issues
interface TokenUsage { promptTokens: number; completionTokens: number; totalTokens: number; }
interface GenerateTextOptions { prompt: string; systemPrompt?: string; model?: string; temperature?: number; maxTokens?: number; stopSequences?: string[]; }
interface GenerateTextResult { text: string; model: string; usage: TokenUsage; finishReason: 'stop' | 'length' | 'content-filter' | 'error'; }
interface EmbedOptions { texts: string[]; model?: string; dimensions?: number; }
interface EmbedResult { embeddings: number[][]; model: string; usage: TokenUsage; }
interface GenerateObjectOptions { prompt: string; systemPrompt?: string; model?: string; temperature?: number; maxTokens?: number; schema: Record<string, any>; }
interface GenerateObjectResult { data: Record<string, any>; text: string; model: string; usage: TokenUsage; }
interface StreamTextOptions { prompt: string; systemPrompt?: string; model?: string; temperature?: number; maxTokens?: number; }
interface StreamTextChunk { text: string; done: boolean; usage?: TokenUsage; }
export interface AIProvider { name: string; generateText(options: GenerateTextOptions): Promise<GenerateTextResult>; embed(options: EmbedOptions): Promise<EmbedResult>; generateObject?(options: GenerateObjectOptions): Promise<GenerateObjectResult>; streamText?(options: StreamTextOptions): AsyncIterable<StreamTextChunk>; }

export interface GoogleProviderConfig {
  apiKey: string;
  baseUrl?: string;
  defaultModel?: string;
  defaultEmbeddingModel?: string;
}

function getBaseUrl(config: GoogleProviderConfig): string {
  return config.baseUrl ?? 'https://generativelanguage.googleapis.com/v1beta';
}

async function googleRequest(config: GoogleProviderConfig, path: string, body: Record<string, any>): Promise<any> {
  const url = `${getBaseUrl(config)}${path}?key=${config.apiKey}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Google AI API error (${response.status}): ${error}`);
  }

  return response.json();
}

export function createGoogleProvider(config: GoogleProviderConfig): AIProvider {
  const defaultModel = config.defaultModel ?? 'gemini-2.0-flash';
  const defaultEmbedModel = config.defaultEmbeddingModel ?? 'text-embedding-004';

  return {
    name: 'google',

    async generateText(options: GenerateTextOptions): Promise<GenerateTextResult> {
      const model = options.model ?? defaultModel;
      const contents: any[] = [{ role: 'user', parts: [{ text: options.prompt }] }];

      const body: Record<string, any> = { contents };
      if (options.systemPrompt) {
        body.systemInstruction = { parts: [{ text: options.systemPrompt }] };
      }

      const generationConfig: Record<string, any> = {};
      if (options.temperature !== undefined) generationConfig.temperature = options.temperature;
      if (options.maxTokens !== undefined) generationConfig.maxOutputTokens = options.maxTokens;
      if (options.stopSequences) generationConfig.stopSequences = options.stopSequences;
      if (Object.keys(generationConfig).length > 0) body.generationConfig = generationConfig;

      const data = await googleRequest(config, `/models/${model}:generateContent`, body);
      const candidate = data.candidates?.[0];
      const text = candidate?.content?.parts?.map((p: any) => p.text).join('') ?? '';
      const usage = data.usageMetadata;

      return {
        text,
        model,
        usage: {
          promptTokens: usage?.promptTokenCount ?? 0,
          completionTokens: usage?.candidatesTokenCount ?? 0,
          totalTokens: usage?.totalTokenCount ?? 0,
        },
        finishReason: candidate?.finishReason === 'STOP' ? 'stop'
          : candidate?.finishReason === 'MAX_TOKENS' ? 'length'
          : candidate?.finishReason === 'SAFETY' ? 'content-filter'
          : 'stop',
      };
    },

    async embed(options: EmbedOptions): Promise<EmbedResult> {
      const model = options.model ?? defaultEmbedModel;
      const requests = options.texts.map(text => ({
        model: `models/${model}`,
        content: { parts: [{ text }] },
      }));

      const data = await googleRequest(config, `/models/${model}:batchEmbedContents`, { requests });

      return {
        embeddings: data.embeddings.map((e: any) => e.values),
        model,
        usage: {
          promptTokens: options.texts.length,
          completionTokens: 0,
          totalTokens: options.texts.length,
        },
      };
    },

    async generateObject(options: GenerateObjectOptions): Promise<GenerateObjectResult> {
      const model = options.model ?? defaultModel;
      const contents: any[] = [{ role: 'user', parts: [{ text: options.prompt }] }];

      const body: Record<string, any> = {
        contents,
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: options.schema,
        },
      };
      if (options.systemPrompt) {
        body.systemInstruction = { parts: [{ text: options.systemPrompt }] };
      }
      if (options.temperature !== undefined) body.generationConfig.temperature = options.temperature;
      if (options.maxTokens !== undefined) body.generationConfig.maxOutputTokens = options.maxTokens;

      const data = await googleRequest(config, `/models/${model}:generateContent`, body);
      const candidate = data.candidates?.[0];
      const text = candidate?.content?.parts?.map((p: any) => p.text).join('') ?? '{}';
      const parsed = JSON.parse(text);
      const usage = data.usageMetadata;

      return {
        data: parsed,
        text,
        model,
        usage: {
          promptTokens: usage?.promptTokenCount ?? 0,
          completionTokens: usage?.candidatesTokenCount ?? 0,
          totalTokens: usage?.totalTokenCount ?? 0,
        },
      };
    },

    async *streamText(options: StreamTextOptions): AsyncIterable<StreamTextChunk> {
      const model = options.model ?? defaultModel;
      const contents: any[] = [{ role: 'user', parts: [{ text: options.prompt }] }];

      const body: Record<string, any> = { contents };
      if (options.systemPrompt) {
        body.systemInstruction = { parts: [{ text: options.systemPrompt }] };
      }

      const generationConfig: Record<string, any> = {};
      if (options.temperature !== undefined) generationConfig.temperature = options.temperature;
      if (options.maxTokens !== undefined) generationConfig.maxOutputTokens = options.maxTokens;
      if (Object.keys(generationConfig).length > 0) body.generationConfig = generationConfig;

      const url = `${getBaseUrl(config)}/models/${model}:streamGenerateContent?alt=sse&key=${config.apiKey}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Google AI API error (${response.status}): ${error}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let buffer = '';
      let usage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (!data) continue;

          try {
            const parsed = JSON.parse(data);
            const text = parsed.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join('') ?? '';

            if (parsed.usageMetadata) {
              usage = {
                promptTokens: parsed.usageMetadata.promptTokenCount ?? 0,
                completionTokens: parsed.usageMetadata.candidatesTokenCount ?? 0,
                totalTokens: parsed.usageMetadata.totalTokenCount ?? 0,
              };
            }

            if (text) {
              yield { text, done: false };
            }
          } catch {
            // Skip malformed JSON
          }
        }
      }

      yield { text: '', done: true, usage };
    },
  };
}
