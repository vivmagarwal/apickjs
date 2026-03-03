/**
 * @apick/provider-ai-anthropic — Anthropic Provider.
 *
 * Supports Claude Sonnet, Opus, Haiku.
 * Uses the Anthropic Messages API directly (no SDK dependency).
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

export interface AnthropicProviderConfig {
  apiKey: string;
  baseUrl?: string;
  defaultModel?: string;
  apiVersion?: string;
}

async function anthropicRequest(config: AnthropicProviderConfig, path: string, body: Record<string, any>): Promise<any> {
  const baseUrl = config.baseUrl ?? 'https://api.anthropic.com/v1';
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.apiKey,
      'anthropic-version': config.apiVersion ?? '2023-06-01',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Anthropic API error (${response.status}): ${error}`);
  }

  return response.json();
}

export function createAnthropicProvider(config: AnthropicProviderConfig): AIProvider {
  const defaultModel = config.defaultModel ?? 'claude-3-haiku-20240307';

  return {
    name: 'anthropic',

    async generateText(options: GenerateTextOptions): Promise<GenerateTextResult> {
      const model = options.model ?? defaultModel;
      const body: Record<string, any> = {
        model,
        messages: [{ role: 'user', content: options.prompt }],
        max_tokens: options.maxTokens ?? 1024,
      };
      if (options.systemPrompt) body.system = options.systemPrompt;
      if (options.temperature !== undefined) body.temperature = options.temperature;
      if (options.stopSequences) body.stop_sequences = options.stopSequences;

      const data = await anthropicRequest(config, '/messages', body);

      const text = data.content
        .filter((c: any) => c.type === 'text')
        .map((c: any) => c.text)
        .join('');

      return {
        text,
        model: data.model,
        usage: {
          promptTokens: data.usage?.input_tokens ?? 0,
          completionTokens: data.usage?.output_tokens ?? 0,
          totalTokens: (data.usage?.input_tokens ?? 0) + (data.usage?.output_tokens ?? 0),
        },
        finishReason: data.stop_reason === 'end_turn' ? 'stop'
          : data.stop_reason === 'max_tokens' ? 'length'
          : 'stop',
      };
    },

    async embed(_options: EmbedOptions): Promise<EmbedResult> {
      throw new Error('Anthropic does not provide an embedding API. Use a separate embedding provider (e.g., OpenAI text-embedding-3-small).');
    },

    async generateObject(options: GenerateObjectOptions): Promise<GenerateObjectResult> {
      const model = options.model ?? defaultModel;
      const schemaStr = JSON.stringify(options.schema, null, 2);
      const prompt = `${options.prompt}\n\nGenerate a JSON object matching this schema:\n${schemaStr}\n\nRespond with ONLY the JSON object, no markdown or explanation.`;

      const body: Record<string, any> = {
        model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: options.maxTokens ?? 2048,
      };
      if (options.systemPrompt) body.system = options.systemPrompt;
      if (options.temperature !== undefined) body.temperature = options.temperature;

      const data = await anthropicRequest(config, '/messages', body);

      const text = data.content
        .filter((c: any) => c.type === 'text')
        .map((c: any) => c.text)
        .join('');

      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('Response did not contain valid JSON');
      const parsed = JSON.parse(jsonMatch[0]);

      return {
        data: parsed,
        text,
        model: data.model,
        usage: {
          promptTokens: data.usage?.input_tokens ?? 0,
          completionTokens: data.usage?.output_tokens ?? 0,
          totalTokens: (data.usage?.input_tokens ?? 0) + (data.usage?.output_tokens ?? 0),
        },
      };
    },

    async *streamText(options: StreamTextOptions): AsyncIterable<StreamTextChunk> {
      const model = options.model ?? defaultModel;
      const body: Record<string, any> = {
        model,
        messages: [{ role: 'user', content: options.prompt }],
        max_tokens: options.maxTokens ?? 1024,
        stream: true,
      };
      if (options.systemPrompt) body.system = options.systemPrompt;
      if (options.temperature !== undefined) body.temperature = options.temperature;

      const baseUrl = config.baseUrl ?? 'https://api.anthropic.com/v1';
      const response = await fetch(`${baseUrl}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': config.apiKey,
          'anthropic-version': config.apiVersion ?? '2023-06-01',
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Anthropic API error (${response.status}): ${error}`);
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

            if (parsed.type === 'content_block_delta' && parsed.delta?.type === 'text_delta') {
              yield { text: parsed.delta.text, done: false };
            }

            if (parsed.type === 'message_delta' && parsed.usage) {
              usage = {
                promptTokens: usage.promptTokens,
                completionTokens: parsed.usage.output_tokens ?? 0,
                totalTokens: usage.promptTokens + (parsed.usage.output_tokens ?? 0),
              };
            }

            if (parsed.type === 'message_start' && parsed.message?.usage) {
              usage.promptTokens = parsed.message.usage.input_tokens ?? 0;
            }

            if (parsed.type === 'message_stop') {
              yield { text: '', done: true, usage };
              return;
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
