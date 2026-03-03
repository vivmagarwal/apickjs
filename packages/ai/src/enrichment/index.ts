/**
 * AI Content Enrichment.
 *
 * Automatically generates content for fields using AI, triggered
 * by lifecycle events or manual admin actions.
 */

import type { AIProviderService } from '../provider/index.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type BuiltinGenerator =
  | 'summarize'
  | 'extract-tags'
  | 'seo-description'
  | 'image-alt-text'
  | 'sentiment-score'
  | 'classify'
  | 'translate';

export interface EnrichmentFieldConfig {
  generate: BuiltinGenerator | string;
  sourceFields?: string[];
  regenerateOn?: 'create' | 'update' | 'both' | 'manual';
  options?: Record<string, any>;
}

export interface EnrichmentService {
  /** Enrich a single field using its generator */
  enrichField(entry: Record<string, any>, fieldConfig: EnrichmentFieldConfig): Promise<any>;
  /** Enrich all configured fields on an entry */
  enrichEntry(entry: Record<string, any>, fieldsConfig: Record<string, EnrichmentFieldConfig>): Promise<Record<string, any>>;
  /** Register a custom generator */
  registerGenerator(name: string, generator: CustomGenerator): void;
  /** Check if enrichment should run for a given event */
  shouldEnrich(fieldConfig: EnrichmentFieldConfig, event: 'create' | 'update'): boolean;
}

export interface CustomGenerator {
  prompt: string | ((entry: Record<string, any>, options?: Record<string, any>) => string);
  outputTransform?: (result: string) => any;
}

// ---------------------------------------------------------------------------
// Built-in prompts
// ---------------------------------------------------------------------------

const builtinPrompts: Record<BuiltinGenerator, (entry: Record<string, any>, sourceFields?: string[]) => string> = {
  summarize: (entry, fields) => {
    const content = (fields ?? ['content']).map(f => entry[f]).filter(Boolean).join('\n');
    return `Summarize the following content in 2-3 sentences:\n\n${content}`;
  },
  'extract-tags': (entry, fields) => {
    const content = (fields ?? ['title', 'content']).map(f => entry[f]).filter(Boolean).join('\n');
    return `Extract 3-7 relevant tags from the following content. Return as a JSON array of strings:\n\n${content}`;
  },
  'seo-description': (entry, fields) => {
    const content = (fields ?? ['title', 'content']).map(f => entry[f]).filter(Boolean).join('\n');
    return `Write an SEO meta description (150-160 characters) for the following content:\n\n${content}`;
  },
  'image-alt-text': (entry) => {
    return `Describe this image in 1-2 sentences for accessibility alt text: ${entry.name || entry.url || 'image'}`;
  },
  'sentiment-score': (entry, fields) => {
    const content = (fields ?? ['content']).map(f => entry[f]).filter(Boolean).join('\n');
    return `Analyze the sentiment of this text and return a single number from -1 (very negative) to 1 (very positive):\n\n${content}`;
  },
  classify: (entry, fields) => {
    const content = (fields ?? ['title', 'content']).map(f => entry[f]).filter(Boolean).join('\n');
    return `Classify this content into one category. Return just the category name:\n\n${content}`;
  },
  translate: (entry, fields) => {
    const content = (fields ?? ['content']).map(f => entry[f]).filter(Boolean).join('\n');
    const targetLang = entry._targetLanguage || 'English';
    return `Translate the following text to ${targetLang}:\n\n${content}`;
  },
};

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createEnrichmentService(aiProvider: AIProviderService): EnrichmentService {
  const customGenerators = new Map<string, CustomGenerator>();

  return {
    async enrichField(entry, fieldConfig) {
      const { generate, sourceFields, options } = fieldConfig;

      // Check custom generators first
      const custom = customGenerators.get(generate);
      if (custom) {
        const prompt = typeof custom.prompt === 'function'
          ? custom.prompt(entry, options)
          : custom.prompt;
        const result = await aiProvider.generateText({ prompt, maxTokens: 500 });
        return custom.outputTransform ? custom.outputTransform(result.text) : result.text;
      }

      // Built-in generator
      const builtinFn = builtinPrompts[generate as BuiltinGenerator];
      if (!builtinFn) {
        throw new Error(`Unknown enrichment generator: ${generate}`);
      }

      const prompt = builtinFn(entry, sourceFields);
      const result = await aiProvider.generateText({ prompt, maxTokens: 500 });
      let output = result.text.trim();

      // Post-process based on generator type
      if (generate === 'extract-tags') {
        try {
          output = JSON.parse(output);
        } catch {
          output = output.split(',').map((s: string) => s.trim()) as any;
        }
      } else if (generate === 'sentiment-score') {
        const num = parseFloat(output);
        return isNaN(num) ? 0 : Math.max(-1, Math.min(1, num));
      }

      return output;
    },

    async enrichEntry(entry, fieldsConfig) {
      const enriched: Record<string, any> = {};
      for (const [fieldName, config] of Object.entries(fieldsConfig)) {
        enriched[fieldName] = await this.enrichField(entry, config);
      }
      return enriched;
    },

    registerGenerator(name, generator) {
      customGenerators.set(name, generator);
    },

    shouldEnrich(fieldConfig, event) {
      const trigger = fieldConfig.regenerateOn ?? 'both';
      if (trigger === 'manual') return false;
      if (trigger === 'both') return true;
      return trigger === event;
    },
  };
}
