/**
 * Prompt Registry.
 *
 * Manages reusable prompt templates with variable substitution,
 * execute, and stream capabilities.
 */

import type { AIProviderService, StreamTextChunk } from '../provider/index.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PromptTemplate {
  id?: number;
  name: string;
  description: string;
  template: string;
  systemPrompt: string;
  model: string;
  temperature: number;
  maxTokens: number;
  variables: Record<string, { type: string; required?: boolean; description?: string }>;
  category: string;
  status: 'draft' | 'published';
  createdAt: string;
  updatedAt: string;
}

export interface PromptService {
  /** Create a prompt template */
  create(data: Omit<PromptTemplate, 'id' | 'createdAt' | 'updatedAt' | 'status'>): PromptTemplate;
  /** Find all prompts */
  findAll(): PromptTemplate[];
  /** Find a prompt by name */
  findByName(name: string): PromptTemplate | null;
  /** Find a prompt by ID */
  findOne(id: number): PromptTemplate | null;
  /** Update a prompt */
  updateById(id: number, data: Partial<PromptTemplate>): PromptTemplate | null;
  /** Delete a prompt */
  deleteById(id: number): boolean;
  /** Publish a prompt */
  publish(id: number): PromptTemplate | null;
  /** Render a template with variables */
  render(template: string, variables: Record<string, any>): string;
  /** Execute a prompt with variables */
  execute(name: string, variables: Record<string, any>): Promise<string>;
  /** Stream a prompt with variables */
  stream(name: string, variables: Record<string, any>): AsyncIterable<StreamTextChunk>;
}

export interface PromptServiceConfig {
  rawDb: any;
  aiProvider: AIProviderService;
}

// ---------------------------------------------------------------------------
// Table setup
// ---------------------------------------------------------------------------

function ensureTables(db: any): void {
  db.exec(`CREATE TABLE IF NOT EXISTS "ai_prompts" (
    "id" INTEGER PRIMARY KEY AUTOINCREMENT,
    "name" VARCHAR(255) NOT NULL UNIQUE,
    "description" TEXT NOT NULL DEFAULT '',
    "template" TEXT NOT NULL,
    "system_prompt" TEXT NOT NULL DEFAULT '',
    "model" VARCHAR(100) NOT NULL DEFAULT '',
    "temperature" REAL NOT NULL DEFAULT 0.7,
    "max_tokens" INTEGER NOT NULL DEFAULT 500,
    "variables" TEXT NOT NULL DEFAULT '{}',
    "category" VARCHAR(100) NOT NULL DEFAULT 'general',
    "status" VARCHAR(20) NOT NULL DEFAULT 'draft',
    "created_at" TEXT NOT NULL,
    "updated_at" TEXT NOT NULL
  )`);
}

function rowToPrompt(row: any): PromptTemplate {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    template: row.template,
    systemPrompt: row.system_prompt,
    model: row.model,
    temperature: row.temperature,
    maxTokens: row.max_tokens,
    variables: JSON.parse(row.variables || '{}'),
    category: row.category,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createPromptService(config: PromptServiceConfig): PromptService {
  const { rawDb, aiProvider } = config;
  ensureTables(rawDb);

  return {
    create(data) {
      const now = new Date().toISOString();
      const result = rawDb.prepare(`
        INSERT INTO "ai_prompts" (name, description, template, system_prompt, model, temperature, max_tokens, variables, category, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?)
      `).run(
        data.name, data.description, data.template, data.systemPrompt,
        data.model, data.temperature, data.maxTokens,
        JSON.stringify(data.variables), data.category, now, now,
      );
      return this.findOne(result.lastInsertRowid as number)!;
    },

    findAll() {
      return rawDb.prepare('SELECT * FROM "ai_prompts" ORDER BY id ASC').all().map(rowToPrompt);
    },

    findByName(name) {
      const row = rawDb.prepare('SELECT * FROM "ai_prompts" WHERE name = ?').get(name);
      return row ? rowToPrompt(row) : null;
    },

    findOne(id) {
      const row = rawDb.prepare('SELECT * FROM "ai_prompts" WHERE id = ?').get(id);
      return row ? rowToPrompt(row) : null;
    },

    updateById(id, data) {
      const existing = rawDb.prepare('SELECT * FROM "ai_prompts" WHERE id = ?').get(id);
      if (!existing) return null;

      const now = new Date().toISOString();
      const sets: string[] = ['updated_at = ?'];
      const values: any[] = [now];

      if (data.name !== undefined) { sets.push('name = ?'); values.push(data.name); }
      if (data.description !== undefined) { sets.push('description = ?'); values.push(data.description); }
      if (data.template !== undefined) { sets.push('template = ?'); values.push(data.template); }
      if (data.systemPrompt !== undefined) { sets.push('system_prompt = ?'); values.push(data.systemPrompt); }
      if (data.model !== undefined) { sets.push('model = ?'); values.push(data.model); }
      if (data.temperature !== undefined) { sets.push('temperature = ?'); values.push(data.temperature); }
      if (data.maxTokens !== undefined) { sets.push('max_tokens = ?'); values.push(data.maxTokens); }
      if (data.variables !== undefined) { sets.push('variables = ?'); values.push(JSON.stringify(data.variables)); }
      if (data.category !== undefined) { sets.push('category = ?'); values.push(data.category); }

      values.push(id);
      rawDb.prepare(`UPDATE "ai_prompts" SET ${sets.join(', ')} WHERE id = ?`).run(...values);
      return this.findOne(id);
    },

    deleteById(id) {
      return rawDb.prepare('DELETE FROM "ai_prompts" WHERE id = ?').run(id).changes > 0;
    },

    publish(id) {
      const existing = rawDb.prepare('SELECT * FROM "ai_prompts" WHERE id = ?').get(id);
      if (!existing) return null;
      rawDb.prepare('UPDATE "ai_prompts" SET status = ?, updated_at = ? WHERE id = ?')
        .run('published', new Date().toISOString(), id);
      return this.findOne(id);
    },

    render(template, variables) {
      return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
        return variables[key] !== undefined ? String(variables[key]) : `{{${key}}}`;
      });
    },

    async execute(name, variables) {
      const prompt = this.findByName(name);
      if (!prompt) throw new Error(`Prompt "${name}" not found`);
      if (prompt.status !== 'published') throw new Error(`Prompt "${name}" is not published`);

      const rendered = this.render(prompt.template, variables);
      const result = await aiProvider.generateText({
        prompt: rendered,
        systemPrompt: prompt.systemPrompt || undefined,
        model: prompt.model || undefined,
        temperature: prompt.temperature,
        maxTokens: prompt.maxTokens,
      });
      return result.text;
    },

    stream(name, variables) {
      const prompt = this.findByName(name);
      if (!prompt) throw new Error(`Prompt "${name}" not found`);
      if (prompt.status !== 'published') throw new Error(`Prompt "${name}" is not published`);

      const rendered = this.render(prompt.template, variables);
      return aiProvider.streamText({
        prompt: rendered,
        systemPrompt: prompt.systemPrompt || undefined,
        model: prompt.model || undefined,
        temperature: prompt.temperature,
        maxTokens: prompt.maxTokens,
      });
    },
  };
}
