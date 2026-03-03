/**
 * @apick/provider-ai-openai — OpenAI Provider.
 *
 * Supports GPT-4o, GPT-4o-mini, text-embedding-3-small/large.
 * Uses the OpenAI REST API directly (no SDK dependency).
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

export interface OpenAIProviderConfig {
  apiKey: string;
  baseUrl?: string;
  defaultModel?: string;
  defaultEmbeddingModel?: string;
  organization?: string;
}

async function openaiRequest(config: OpenAIProviderConfig, path: string, body: Record<string, any>): Promise<any> {
  const baseUrl = config.baseUrl ?? 'https://api.openai.com/v1';
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${config.apiKey}`,
  };
  if (config.organization) {
    headers['OpenAI-Organization'] = config.organization;
  }

  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI API error (${response.status}): ${error}`);
  }

  return response.json();
}

export function createOpenAIProvider(config: OpenAIProviderConfig): AIProvider {
  const defaultModel = config.defaultModel ?? 'gpt-4o-mini';
  const defaultEmbedModel = config.defaultEmbeddingModel ?? 'text-embedding-3-small';

  return {
    name: 'openai',

    async generateText(options: GenerateTextOptions): Promise<GenerateTextResult> {
      const model = options.model ?? defaultModel;
      const messages: any[] = [];
      if (options.systemPrompt) {
        messages.push({ role: 'system', content: options.systemPrompt });
      }
      messages.push({ role: 'user', content: options.prompt });

      const body: Record<string, any> = { model, messages };
      if (options.temperature !== undefined) body.temperature = options.temperature;
      if (options.maxTokens !== undefined) body.max_tokens = options.maxTokens;
      if (options.stopSequences) body.stop = options.stopSequences;

      const data = await openaiRequest(config, '/chat/completions', body);
      const choice = data.choices[0];

      return {
        text: choice.message.content ?? '',
        model: data.model,
        usage: {
          promptTokens: data.usage?.prompt_tokens ?? 0,
          completionTokens: data.usage?.completion_tokens ?? 0,
          totalTokens: data.usage?.total_tokens ?? 0,
        },
        finishReason: choice.finish_reason === 'stop' ? 'stop'
          : choice.finish_reason === 'length' ? 'length'
          : choice.finish_reason === 'content_filter' ? 'content-filter'
          : 'stop',
      };
    },

    async embed(options: EmbedOptions): Promise<EmbedResult> {
      const model = options.model ?? defaultEmbedModel;
      const body: Record<string, any> = { model, input: options.texts };
      if (options.dimensions) body.dimensions = options.dimensions;

      const data = await openaiRequest(config, '/embeddings', body);

      return {
        embeddings: data.data.map((d: any) => d.embedding),
        model: data.model,
        usage: {
          promptTokens: data.usage?.prompt_tokens ?? 0,
          completionTokens: 0,
          totalTokens: data.usage?.total_tokens ?? 0,
        },
      };
    },

    async generateObject(options: GenerateObjectOptions): Promise<GenerateObjectResult> {
      const model = options.model ?? defaultModel;
      const messages: any[] = [];
      if (options.systemPrompt) {
        messages.push({ role: 'system', content: options.systemPrompt });
      }
      messages.push({ role: 'user', content: options.prompt });

      const body: Record<string, any> = {
        model,
        messages,
        response_format: {
          type: 'json_schema',
          json_schema: { name: 'response', schema: options.schema, strict: true },
        },
      };
      if (options.temperature !== undefined) body.temperature = options.temperature;
      if (options.maxTokens !== undefined) body.max_tokens = options.maxTokens;

      const data = await openaiRequest(config, '/chat/completions', body);
      const choice = data.choices[0];
      const text = choice.message.content ?? '{}';
      const parsed = JSON.parse(text);

      return {
        data: parsed,
        text,
        model: data.model,
        usage: {
          promptTokens: data.usage?.prompt_tokens ?? 0,
          completionTokens: data.usage?.completion_tokens ?? 0,
          totalTokens: data.usage?.total_tokens ?? 0,
        },
      };
    },

    async *streamText(options: StreamTextOptions): AsyncIterable<StreamTextChunk> {
      const model = options.model ?? defaultModel;
      const messages: any[] = [];
      if (options.systemPrompt) {
        messages.push({ role: 'system', content: options.systemPrompt });
      }
      messages.push({ role: 'user', content: options.prompt });

      const body: Record<string, any> = { model, messages, stream: true, stream_options: { include_usage: true } };
      if (options.temperature !== undefined) body.temperature = options.temperature;
      if (options.maxTokens !== undefined) body.max_tokens = options.maxTokens;

      const baseUrl = config.baseUrl ?? 'https://api.openai.com/v1';
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      };

      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`OpenAI API error (${response.status}): ${error}`);
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
          if (data === '[DONE]') {
            yield { text: '', done: true, usage };
            return;
          }

          try {
            const parsed = JSON.parse(data);
            const delta = parsed.choices?.[0]?.delta;
            if (parsed.usage) {
              usage = {
                promptTokens: parsed.usage.prompt_tokens ?? 0,
                completionTokens: parsed.usage.completion_tokens ?? 0,
                totalTokens: parsed.usage.total_tokens ?? 0,
              };
            }
            if (delta?.content) {
              yield { text: delta.content, done: false };
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
