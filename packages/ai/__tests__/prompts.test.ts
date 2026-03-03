import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { createAIProviderService } from '../src/provider/index.js';
import { createPromptService } from '../src/prompts/index.js';
import type { AIProvider } from '../src/provider/index.js';
import type { PromptService } from '../src/prompts/index.js';

function createTestProvider(): AIProvider {
  return {
    name: 'prompt-test',
    async generateText(options) {
      return {
        text: `Generated: ${options.prompt}`,
        model: options.model || 'test-model',
        usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
        finishReason: 'stop',
      };
    },
    async embed(options) {
      return { embeddings: options.texts.map(() => [0.1]), model: 'test', usage: { promptTokens: 1, completionTokens: 0, totalTokens: 1 } };
    },
    async *streamText(options) {
      const words = options.prompt.split(' ');
      for (let i = 0; i < words.length; i++) {
        yield { text: words[i] + ' ', done: i === words.length - 1 };
      }
    },
  };
}

describe('Prompt Registry', () => {
  let db: any;
  let service: PromptService;

  beforeEach(() => {
    db = new Database(':memory:');
    const aiService = createAIProviderService({ provider: { provider: 'test' } });
    aiService.setProvider(createTestProvider());
    service = createPromptService({ rawDb: db, aiProvider: aiService });
  });

  it('creates a prompt template', () => {
    const prompt = service.create({
      name: 'test-prompt',
      description: 'A test prompt',
      template: 'Hello {{name}}!',
      systemPrompt: 'You are helpful.',
      model: 'gpt-4',
      temperature: 0.7,
      maxTokens: 500,
      variables: { name: { type: 'string', required: true } },
      category: 'general',
    });
    expect(prompt.id).toBeDefined();
    expect(prompt.name).toBe('test-prompt');
    expect(prompt.status).toBe('draft');
    expect(prompt.variables).toEqual({ name: { type: 'string', required: true } });
  });

  it('finds all prompts', () => {
    service.create({ name: 'p1', description: '', template: '{{a}}', systemPrompt: '', model: '', temperature: 0.7, maxTokens: 500, variables: {}, category: 'general' });
    service.create({ name: 'p2', description: '', template: '{{b}}', systemPrompt: '', model: '', temperature: 0.7, maxTokens: 500, variables: {}, category: 'general' });
    const all = service.findAll();
    expect(all).toHaveLength(2);
    expect(all[0].name).toBe('p1');
    expect(all[1].name).toBe('p2');
  });

  it('finds a prompt by name', () => {
    service.create({ name: 'find-me', description: 'desc', template: 'hi', systemPrompt: '', model: '', temperature: 0.5, maxTokens: 100, variables: {}, category: 'test' });
    const found = service.findByName('find-me');
    expect(found).not.toBeNull();
    expect(found!.description).toBe('desc');
    expect(service.findByName('not-found')).toBeNull();
  });

  it('finds a prompt by ID', () => {
    const created = service.create({ name: 'by-id', description: '', template: 't', systemPrompt: '', model: '', temperature: 0.7, maxTokens: 500, variables: {}, category: 'general' });
    expect(service.findOne(created.id!)).not.toBeNull();
    expect(service.findOne(9999)).toBeNull();
  });

  it('updates a prompt by ID', () => {
    const created = service.create({ name: 'update-me', description: 'old', template: 'old template', systemPrompt: '', model: '', temperature: 0.5, maxTokens: 200, variables: {}, category: 'general' });
    const updated = service.updateById(created.id!, { description: 'new', temperature: 0.9 });
    expect(updated).not.toBeNull();
    expect(updated!.description).toBe('new');
    expect(updated!.temperature).toBe(0.9);
    expect(updated!.name).toBe('update-me'); // unchanged
  });

  it('returns null when updating non-existent prompt', () => {
    expect(service.updateById(9999, { description: 'x' })).toBeNull();
  });

  it('deletes a prompt by ID', () => {
    const created = service.create({ name: 'delete-me', description: '', template: 't', systemPrompt: '', model: '', temperature: 0.7, maxTokens: 500, variables: {}, category: 'general' });
    expect(service.deleteById(created.id!)).toBe(true);
    expect(service.findOne(created.id!)).toBeNull();
    expect(service.deleteById(9999)).toBe(false);
  });

  it('publishes a prompt', () => {
    const created = service.create({ name: 'publish-me', description: '', template: 't', systemPrompt: '', model: '', temperature: 0.7, maxTokens: 500, variables: {}, category: 'general' });
    expect(created.status).toBe('draft');
    const published = service.publish(created.id!);
    expect(published).not.toBeNull();
    expect(published!.status).toBe('published');
  });

  it('returns null when publishing non-existent prompt', () => {
    expect(service.publish(9999)).toBeNull();
  });

  it('renders a template with variables', () => {
    const result = service.render('Hello {{name}}, welcome to {{place}}!', { name: 'Alice', place: 'Wonderland' });
    expect(result).toBe('Hello Alice, welcome to Wonderland!');
  });

  it('preserves unmatched variables in render', () => {
    const result = service.render('Hello {{name}}, {{unknown}}!', { name: 'Bob' });
    expect(result).toBe('Hello Bob, {{unknown}}!');
  });

  it('executes a published prompt', async () => {
    const created = service.create({ name: 'exec-prompt', description: '', template: 'Tell me about {{topic}}', systemPrompt: 'Be concise.', model: 'test-model', temperature: 0.5, maxTokens: 100, variables: { topic: { type: 'string' } }, category: 'general' });
    service.publish(created.id!);

    const result = await service.execute('exec-prompt', { topic: 'TypeScript' });
    expect(result).toContain('Tell me about TypeScript');
  });

  it('throws when executing non-existent prompt', async () => {
    await expect(service.execute('nope', {})).rejects.toThrow('not found');
  });

  it('throws when executing a draft prompt', async () => {
    service.create({ name: 'draft-prompt', description: '', template: 'hi', systemPrompt: '', model: '', temperature: 0.7, maxTokens: 500, variables: {}, category: 'general' });
    await expect(service.execute('draft-prompt', {})).rejects.toThrow('not published');
  });

  it('streams a published prompt', async () => {
    const created = service.create({ name: 'stream-prompt', description: '', template: 'Count to three', systemPrompt: '', model: '', temperature: 0.7, maxTokens: 100, variables: {}, category: 'general' });
    service.publish(created.id!);

    const chunks: string[] = [];
    for await (const chunk of service.stream('stream-prompt', {})) {
      chunks.push(chunk.text);
    }
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks.join('')).toContain('Count');
  });

  it('throws when streaming non-existent prompt', () => {
    expect(() => service.stream('nope', {})).toThrow('not found');
  });

  it('throws when streaming a draft prompt', () => {
    service.create({ name: 'draft-stream', description: '', template: 'hi', systemPrompt: '', model: '', temperature: 0.7, maxTokens: 500, variables: {}, category: 'general' });
    expect(() => service.stream('draft-stream', {})).toThrow('not published');
  });
});
