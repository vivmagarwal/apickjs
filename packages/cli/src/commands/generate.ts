/**
 * Generate commands — interactive scaffolding for APIs, controllers, services,
 * policies, middlewares, and plugins.
 */

import { join } from 'node:path';
import type { CliCommand, ParsedArgs, CliContext } from '../cli.js';
import { text, select, confirm, multiSelect } from '../prompts.js';
import { success, info, error as logError, colors } from '../colors.js';
import {
  generateApi, generateController, generateService,
  generatePolicy, generateMiddleware, generatePlugin,
  writeGeneratedFiles,
} from '@apick/generators';
import type { GeneratorOptions } from '@apick/generators';

// ---------------------------------------------------------------------------
// Field type definitions
// ---------------------------------------------------------------------------

const FIELD_TYPES = [
  { value: 'string', label: 'string', hint: 'Short text (title, name)' },
  { value: 'text', label: 'text', hint: 'Long text (description, body)' },
  { value: 'richtext', label: 'richtext', hint: 'Rich text with formatting' },
  { value: 'blocks', label: 'blocks', hint: 'Block-based structured content' },
  { value: 'integer', label: 'integer', hint: 'Whole number' },
  { value: 'float', label: 'float', hint: 'Decimal number (float)' },
  { value: 'decimal', label: 'decimal', hint: 'Precise decimal number' },
  { value: 'boolean', label: 'boolean', hint: 'True or false' },
  { value: 'date', label: 'date', hint: 'Date only (YYYY-MM-DD)' },
  { value: 'time', label: 'time', hint: 'Time only (HH:mm:ss)' },
  { value: 'datetime', label: 'datetime', hint: 'Date and time' },
  { value: 'email', label: 'email', hint: 'Email address' },
  { value: 'password', label: 'password', hint: 'Hashed password' },
  { value: 'uid', label: 'uid', hint: 'URL-friendly identifier (slug)' },
  { value: 'enumeration', label: 'enumeration', hint: 'One of a fixed set of values' },
  { value: 'json', label: 'json', hint: 'Arbitrary JSON data' },
  { value: 'media', label: 'media', hint: 'File upload (images, videos, etc.)' },
  { value: 'relation', label: 'relation', hint: 'Link to another content type' },
  { value: 'component', label: 'component', hint: 'Reusable component reference' },
  { value: 'dynamiczone', label: 'dynamiczone', hint: 'Multiple component types' },
  { value: 'customField', label: 'customField', hint: 'Plugin-defined custom field' },
];

// ---------------------------------------------------------------------------
// Attribute builder helpers
// ---------------------------------------------------------------------------

async function promptTypeSpecificOptions(fieldType: string, existingStringFields: string[]): Promise<Record<string, any>> {
  const opts: Record<string, any> = {};

  switch (fieldType) {
    case 'string':
    case 'text':
    case 'richtext':
    case 'password': {
      const req = await confirm('Required?', false);
      if (req) opts.required = true;
      const min = await text('Min length? (press Enter to skip)');
      if (min) opts.minLength = parseInt(min, 10);
      const max = await text('Max length? (press Enter to skip)');
      if (max) opts.maxLength = parseInt(max, 10);
      break;
    }
    case 'uid': {
      if (existingStringFields.length > 0) {
        const target = await select('Target field for slug generation?', [
          { value: '', label: '(none)', hint: 'Manual UID' },
          ...existingStringFields.map(f => ({ value: f, label: f, hint: '' })),
        ]);
        if (target) opts.targetField = target;
      }
      break;
    }
    case 'integer':
    case 'float':
    case 'decimal': {
      const req = await confirm('Required?', false);
      if (req) opts.required = true;
      const min = await text('Min value? (press Enter to skip)');
      if (min) opts.min = parseFloat(min);
      const max = await text('Max value? (press Enter to skip)');
      if (max) opts.max = parseFloat(max);
      const def = await text('Default value? (press Enter to skip)');
      if (def) opts.default = parseFloat(def);
      break;
    }
    case 'boolean': {
      const def = await select('Default value?', [
        { value: '', label: '(none)', hint: 'No default' },
        { value: 'true', label: 'true', hint: '' },
        { value: 'false', label: 'false', hint: '' },
      ]);
      if (def) opts.default = def === 'true';
      break;
    }
    case 'enumeration': {
      const vals = await text('Enum values (comma-separated)', {
        validate: (v) => v.trim() ? true : 'At least one value is required',
      });
      opts.enum = vals.split(',').map(v => v.trim()).filter(Boolean);
      const req = await confirm('Required?', false);
      if (req) opts.required = true;
      break;
    }
    case 'media': {
      const multi = await confirm('Allow multiple files?', false);
      if (multi) opts.multiple = true;
      const allowed = await multiSelect('Allowed types?', [
        { value: 'images', label: 'images', hint: '' },
        { value: 'videos', label: 'videos', hint: '' },
        { value: 'audios', label: 'audios', hint: '' },
        { value: 'files', label: 'files', hint: '' },
      ]);
      if (allowed.length > 0) opts.allowedTypes = allowed;
      break;
    }
    case 'relation': {
      const relType = await select('Relation type?', [
        { value: 'oneToOne', label: 'oneToOne', hint: '' },
        { value: 'oneToMany', label: 'oneToMany', hint: '' },
        { value: 'manyToOne', label: 'manyToOne', hint: '' },
        { value: 'manyToMany', label: 'manyToMany', hint: '' },
      ]);
      opts.relation = relType;
      const target = await text('Target UID (e.g. api::article.article)', {
        validate: (v) => v.trim() ? true : 'Target UID is required',
      });
      opts.target = target;
      break;
    }
    case 'component': {
      const uid = await text('Component UID', {
        validate: (v) => v.trim() ? true : 'Component UID is required',
      });
      opts.component = uid;
      const repeatable = await confirm('Repeatable?', false);
      if (repeatable) opts.repeatable = true;
      break;
    }
    case 'dynamiczone': {
      const uids = await text('Component UIDs (comma-separated)', {
        validate: (v) => v.trim() ? true : 'At least one component UID is required',
      });
      opts.components = uids.split(',').map(v => v.trim()).filter(Boolean);
      break;
    }
    default: {
      const req = await confirm('Required?', false);
      if (req) opts.required = true;
      break;
    }
  }

  return opts;
}

// ---------------------------------------------------------------------------
// generate:api command
// ---------------------------------------------------------------------------

export const generateApiCommand: CliCommand = {
  name: 'generate:api',
  description: 'Generate a new API with content type, controller, service, and routes',
  options: [
    { name: 'name', alias: 'n', description: 'API name', type: 'string' },
  ],
  action: async (args, ctx) => {
    try {
      // 1. Prompt for basic info
      const name = (args.flags.name as string) || (args.flags.n as string) || await text('API name', {
        validate: (v) => v.trim() ? true : 'Name is required',
      });

      const kind = await select('Content type kind?', [
        { value: 'collectionType', label: 'Collection Type', hint: 'Multiple entries (articles, products)' },
        { value: 'singleType', label: 'Single Type', hint: 'One entry (homepage, settings)' },
      ]) as 'collectionType' | 'singleType';

      const displayName = await text('Display name', { default: name.charAt(0).toUpperCase() + name.slice(1) });

      const kebab = name.replace(/([a-z])([A-Z])/g, '$1-$2').replace(/[\s_]+/g, '-').toLowerCase();
      const defaultPlural = kebab.endsWith('s') ? kebab + 'es' : kebab.endsWith('y') ? kebab.slice(0, -1) + 'ies' : kebab + 's';
      const pluralName = await text('Plural name', { default: defaultPlural });

      // 2. Interactive attribute builder
      const attributes: Record<string, any> = {};
      const stringFields: string[] = [];

      info('Add attributes to your content type (press Enter with empty name to finish)');

      let addMore = true;
      while (addMore) {
        const attrName = await text('Attribute name (empty to finish)');
        if (!attrName) break;

        const fieldType = await select(`Type for "${attrName}"?`, FIELD_TYPES);
        const typeOpts = await promptTypeSpecificOptions(fieldType, stringFields);

        attributes[attrName] = { type: fieldType, ...typeOpts };

        if (['string', 'text'].includes(fieldType)) {
          stringFields.push(attrName);
        }

        addMore = await confirm('Add another attribute?', true);
      }

      // If no attributes were added, use defaults
      const finalAttrs = Object.keys(attributes).length > 0 ? attributes : undefined;

      const options: GeneratorOptions = {
        name: kebab,
        singularName: kebab,
        pluralName,
        displayName,
        kind,
        draftAndPublish: false,
        attributes: finalAttrs,
      };

      // 3. Preview
      const files = generateApi(options);
      console.log('');
      info('Files to generate:');
      for (const f of files) {
        console.log(`  ${colors.green('+')} ${f.path}`);
      }

      const apiPrefix = '/api';
      console.log('');
      info('REST endpoints:');
      console.log(`  ${colors.cyan('GET')}    ${apiPrefix}/${pluralName}`);
      console.log(`  ${colors.cyan('GET')}    ${apiPrefix}/${pluralName}/:id`);
      console.log(`  ${colors.cyan('POST')}   ${apiPrefix}/${pluralName}`);
      console.log(`  ${colors.cyan('PUT')}    ${apiPrefix}/${pluralName}/:id`);
      console.log(`  ${colors.cyan('DELETE')} ${apiPrefix}/${pluralName}/:id`);

      // 4. Confirm
      const ok = await confirm('Generate these files?', true);
      if (!ok) {
        info('Cancelled.');
        return;
      }

      // 5. Write files
      writeGeneratedFiles(files, ctx.cwd);

      console.log('');
      success(`API "${name}" generated!`);
      info('Next steps:');
      console.log(`  1. Review generated files in src/api/${kebab}/`);
      console.log(`  2. Run ${colors.cyan('npx apick develop')} to start the server`);
      console.log(`  3. Access your API at ${colors.cyan(`http://localhost:1337/api/${pluralName}`)}`);
    } catch (err: any) {
      logError(err.message || 'Failed to generate API');
    }
  },
};

// ---------------------------------------------------------------------------
// generate:controller command
// ---------------------------------------------------------------------------

export const generateControllerCommand: CliCommand = {
  name: 'generate:controller',
  description: 'Generate a new controller',
  options: [{ name: 'name', alias: 'n', description: 'Controller name', type: 'string' }],
  action: async (args, ctx) => {
    try {
      const name = (args.flags.name as string) || (args.flags.n as string) || await text('Controller name', {
        validate: (v) => v.trim() ? true : 'Name is required',
      });
      const files = generateController({ name });
      writeGeneratedFiles(files, ctx.cwd);
      success(`Controller "${name}" generated at ${files[0].path}`);
    } catch (err: any) {
      logError(err.message || 'Failed to generate controller');
    }
  },
};

// ---------------------------------------------------------------------------
// generate:service command
// ---------------------------------------------------------------------------

export const generateServiceCommand: CliCommand = {
  name: 'generate:service',
  description: 'Generate a new service',
  options: [{ name: 'name', alias: 'n', description: 'Service name', type: 'string' }],
  action: async (args, ctx) => {
    try {
      const name = (args.flags.name as string) || (args.flags.n as string) || await text('Service name', {
        validate: (v) => v.trim() ? true : 'Name is required',
      });
      const files = generateService({ name });
      writeGeneratedFiles(files, ctx.cwd);
      success(`Service "${name}" generated at ${files[0].path}`);
    } catch (err: any) {
      logError(err.message || 'Failed to generate service');
    }
  },
};

// ---------------------------------------------------------------------------
// generate:policy command
// ---------------------------------------------------------------------------

export const generatePolicyCommand: CliCommand = {
  name: 'generate:policy',
  description: 'Generate a new policy',
  options: [{ name: 'name', alias: 'n', description: 'Policy name', type: 'string' }],
  action: async (args, ctx) => {
    try {
      const name = (args.flags.name as string) || (args.flags.n as string) || await text('Policy name', {
        validate: (v) => v.trim() ? true : 'Name is required',
      });
      const files = generatePolicy({ name });
      writeGeneratedFiles(files, ctx.cwd);
      success(`Policy "${name}" generated at ${files[0].path}`);
    } catch (err: any) {
      logError(err.message || 'Failed to generate policy');
    }
  },
};

// ---------------------------------------------------------------------------
// generate:middleware command
// ---------------------------------------------------------------------------

export const generateMiddlewareCommand: CliCommand = {
  name: 'generate:middleware',
  description: 'Generate a new middleware',
  options: [{ name: 'name', alias: 'n', description: 'Middleware name', type: 'string' }],
  action: async (args, ctx) => {
    try {
      const name = (args.flags.name as string) || (args.flags.n as string) || await text('Middleware name', {
        validate: (v) => v.trim() ? true : 'Name is required',
      });
      const files = generateMiddleware({ name });
      writeGeneratedFiles(files, ctx.cwd);
      success(`Middleware "${name}" generated at ${files[0].path}`);
    } catch (err: any) {
      logError(err.message || 'Failed to generate middleware');
    }
  },
};

// ---------------------------------------------------------------------------
// generate:plugin command
// ---------------------------------------------------------------------------

export const generatePluginCommand: CliCommand = {
  name: 'generate:plugin',
  description: 'Generate a new plugin',
  options: [{ name: 'name', alias: 'n', description: 'Plugin name', type: 'string' }],
  action: async (args, ctx) => {
    try {
      const name = (args.flags.name as string) || (args.flags.n as string) || await text('Plugin name', {
        validate: (v) => v.trim() ? true : 'Name is required',
      });
      const files = generatePlugin({ name });
      writeGeneratedFiles(files, ctx.cwd);
      success(`Plugin "${name}" generated with ${files.length} files`);
      info(`Plugin files are in src/plugins/${name.replace(/([a-z])([A-Z])/g, '$1-$2').replace(/[\s_]+/g, '-').toLowerCase()}/`);
    } catch (err: any) {
      logError(err.message || 'Failed to generate plugin');
    }
  },
};

export const generateCommands: CliCommand[] = [
  generateApiCommand,
  generateControllerCommand,
  generateServiceCommand,
  generatePolicyCommand,
  generateMiddlewareCommand,
  generatePluginCommand,
];
