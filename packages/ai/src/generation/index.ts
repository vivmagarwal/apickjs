/**
 * Structured Output Generation.
 *
 * Uses JSON Schema to guide LLM output, validates with schema,
 * and retries on validation failure.
 */

import type { AIProviderService } from '../provider/index.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GenerateContentOptions {
  prompt: string;
  fields?: string[];
  locale?: string;
  save?: boolean;
  publish?: boolean;
  maxRetries?: number;
}

export interface GenerateContentResult {
  data: Record<string, any>;
  usage: { promptTokens: number; completionTokens: number; totalTokens: number };
  attempts: number;
}

export interface StructuredOutputService {
  /** Generate content matching a JSON Schema */
  generateContent(schema: Record<string, any>, options: GenerateContentOptions): Promise<GenerateContentResult>;
  /** Validate data against a JSON Schema (basic) */
  validate(data: Record<string, any>, schema: Record<string, any>): { valid: boolean; errors: string[] };
}

// ---------------------------------------------------------------------------
// Basic JSON Schema validator
// ---------------------------------------------------------------------------

function validateAgainstSchema(data: Record<string, any>, schema: Record<string, any>): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (schema.type === 'object' && schema.properties) {
    if (typeof data !== 'object' || data === null || Array.isArray(data)) {
      errors.push('Expected an object');
      return { valid: false, errors };
    }

    // Check required fields
    if (schema.required) {
      for (const field of schema.required) {
        if (data[field] === undefined || data[field] === null) {
          errors.push(`Missing required field: ${field}`);
        }
      }
    }

    // Check property types
    for (const [key, propSchema] of Object.entries(schema.properties) as [string, any][]) {
      if (data[key] === undefined) continue;

      if (propSchema.type === 'string' && typeof data[key] !== 'string') {
        errors.push(`Field "${key}" should be a string`);
      }
      if (propSchema.type === 'number' && typeof data[key] !== 'number') {
        errors.push(`Field "${key}" should be a number`);
      }
      if (propSchema.type === 'integer' && (!Number.isInteger(data[key]))) {
        errors.push(`Field "${key}" should be an integer`);
      }
      if (propSchema.type === 'boolean' && typeof data[key] !== 'boolean') {
        errors.push(`Field "${key}" should be a boolean`);
      }
      if (propSchema.type === 'array' && !Array.isArray(data[key])) {
        errors.push(`Field "${key}" should be an array`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createStructuredOutputService(aiProvider: AIProviderService): StructuredOutputService {
  return {
    async generateContent(schema, options) {
      const maxRetries = options.maxRetries ?? 3;
      let lastErrors: string[] = [];
      let totalUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        const schemaStr = JSON.stringify(schema, null, 2);
        const retryHint = attempt > 1
          ? `\n\nPrevious attempt had errors: ${lastErrors.join(', ')}. Fix these issues.`
          : '';

        const prompt = `${options.prompt}\n\nGenerate a JSON object matching this schema:\n${schemaStr}${retryHint}\n\nRespond with ONLY the JSON object, no markdown or explanation.`;

        try {
          // Try generateObject if available
          if (aiProvider.getProvider().generateObject) {
            const result = await aiProvider.generateObject({ prompt: options.prompt, schema });
            totalUsage.promptTokens += result.usage.promptTokens;
            totalUsage.completionTokens += result.usage.completionTokens;
            totalUsage.totalTokens += result.usage.totalTokens;

            const validation = validateAgainstSchema(result.data, schema);
            if (validation.valid) {
              return { data: result.data, usage: totalUsage, attempts: attempt };
            }
            lastErrors = validation.errors;
          } else {
            // Fall back to generateText + parse
            const result = await aiProvider.generateText({ prompt, maxTokens: 2000 });
            totalUsage.promptTokens += result.usage.promptTokens;
            totalUsage.completionTokens += result.usage.completionTokens;
            totalUsage.totalTokens += result.usage.totalTokens;

            // Extract JSON from response
            const jsonMatch = result.text.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
              lastErrors = ['Response did not contain valid JSON'];
              continue;
            }

            const data = JSON.parse(jsonMatch[0]);
            const validation = validateAgainstSchema(data, schema);
            if (validation.valid) {
              return { data, usage: totalUsage, attempts: attempt };
            }
            lastErrors = validation.errors;
          }
        } catch (err) {
          lastErrors = [err instanceof Error ? err.message : String(err)];
        }
      }

      throw new Error(`Failed to generate valid content after ${maxRetries} attempts. Errors: ${lastErrors.join(', ')}`);
    },

    validate: validateAgainstSchema,
  };
}
