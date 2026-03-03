/**
 * @apick/provider-ai-ollama — Ollama Provider.
 *
 * Supports local Ollama models for text generation and embedding.
 * Uses the Ollama REST API directly.
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

export interface OllamaProviderConfig {
  baseUrl?: string;
  defaultModel?: string;
  defaultEmbeddingModel?: string;
}

async function ollamaRequest(config: OllamaProviderConfig, path: string, body: Record<string, any>): Promise<any> {
  const baseUrl = config.baseUrl ?? 'http://localhost:11434';
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Ollama API error (${response.status}): ${error}`);
  }

  return response.json();
}

export function createOllamaProvider(config: OllamaProviderConfig = {}): AIProvider {
  const defaultModel = config.defaultModel ?? 'llama3.2';
  const defaultEmbedModel = config.defaultEmbeddingModel ?? 'nomic-embed-text';

  return {
    name: 'ollama',

    async generateText(options: GenerateTextOptions): Promise<GenerateTextResult> {
      const model = options.model ?? defaultModel;
      const messages: any[] = [];
      if (options.systemPrompt) {
        messages.push({ role: 'system', content: options.systemPrompt });
      }
      messages.push({ role: 'user', content: options.prompt });

      const body: Record<string, any> = { model, messages, stream: false };

      const optionsObj: Record<string, any> = {};
      if (options.temperature !== undefined) optionsObj.temperature = options.temperature;
      if (options.maxTokens !== undefined) optionsObj.num_predict = options.maxTokens;
      if (options.stopSequences) optionsObj.stop = options.stopSequences;
      if (Object.keys(optionsObj).length > 0) body.options = optionsObj;

      const data = await ollamaRequest(config, '/api/chat', body);

      return {
        text: data.message?.content ?? '',
        model: data.model ?? model,
        usage: {
          promptTokens: data.prompt_eval_count ?? 0,
          completionTokens: data.eval_count ?? 0,
          totalTokens: (data.prompt_eval_count ?? 0) + (data.eval_count ?? 0),
        },
        finishReason: data.done_reason === 'stop' ? 'stop'
          : data.done_reason === 'length' ? 'length'
          : 'stop',
      };
    },

    async embed(options: EmbedOptions): Promise<EmbedResult> {
      const model = options.model ?? defaultEmbedModel;
      const data = await ollamaRequest(config, '/api/embed', {
        model,
        input: options.texts,
      });

      return {
        embeddings: data.embeddings ?? [],
        model: data.model ?? model,
        usage: {
          promptTokens: data.prompt_eval_count ?? options.texts.length,
          completionTokens: 0,
          totalTokens: data.prompt_eval_count ?? options.texts.length,
        },
      };
    },

    async generateObject(options: GenerateObjectOptions): Promise<GenerateObjectResult> {
      const model = options.model ?? defaultModel;
      const schemaStr = JSON.stringify(options.schema, null, 2);
      const prompt = `${options.prompt}\n\nRespond ONLY with a JSON object matching this schema:\n${schemaStr}`;

      const messages: any[] = [];
      if (options.systemPrompt) {
        messages.push({ role: 'system', content: options.systemPrompt });
      }
      messages.push({ role: 'user', content: prompt });

      const body: Record<string, any> = {
        model,
        messages,
        stream: false,
        format: 'json',
      };

      const optionsObj: Record<string, any> = {};
      if (options.temperature !== undefined) optionsObj.temperature = options.temperature;
      if (options.maxTokens !== undefined) optionsObj.num_predict = options.maxTokens;
      if (Object.keys(optionsObj).length > 0) body.options = optionsObj;

      const data = await ollamaRequest(config, '/api/chat', body);
      const text = data.message?.content ?? '{}';

      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('Response did not contain valid JSON');
      const parsed = JSON.parse(jsonMatch[0]);

      return {
        data: parsed,
        text,
        model: data.model ?? model,
        usage: {
          promptTokens: data.prompt_eval_count ?? 0,
          completionTokens: data.eval_count ?? 0,
          totalTokens: (data.prompt_eval_count ?? 0) + (data.eval_count ?? 0),
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

      const body: Record<string, any> = { model, messages, stream: true };

      const optionsObj: Record<string, any> = {};
      if (options.temperature !== undefined) optionsObj.temperature = options.temperature;
      if (options.maxTokens !== undefined) optionsObj.num_predict = options.maxTokens;
      if (Object.keys(optionsObj).length > 0) body.options = optionsObj;

      const baseUrl = config.baseUrl ?? 'http://localhost:11434';
      const response = await fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Ollama API error (${response.status}): ${error}`);
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
          if (!line.trim()) continue;

          try {
            const parsed = JSON.parse(line);

            if (parsed.done) {
              usage = {
                promptTokens: parsed.prompt_eval_count ?? 0,
                completionTokens: parsed.eval_count ?? 0,
                totalTokens: (parsed.prompt_eval_count ?? 0) + (parsed.eval_count ?? 0),
              };
              yield { text: '', done: true, usage };
              return;
            }

            const text = parsed.message?.content ?? '';
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
