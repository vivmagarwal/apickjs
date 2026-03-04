/**
 * Stub for @apick/generators used during CLI unit tests.
 */

export interface GeneratorOptions {
  name: string;
  baseDir?: string;
  singularName?: string;
  pluralName?: string;
  displayName?: string;
  kind?: 'collectionType' | 'singleType';
  draftAndPublish?: boolean;
  attributes?: Record<string, any>;
}

export interface ProjectOptions {
  name: string;
  database?: 'sqlite' | 'postgres' | 'mysql';
  port?: number;
}

export interface GeneratedFile {
  path: string;
  content: string;
}

export function generateApi(options: GeneratorOptions): GeneratedFile[] {
  const singular = options.singularName || options.name;
  return [
    { path: `src/api/${singular}/content-type.ts`, content: 'export default {};' },
    { path: `src/api/${singular}/controllers/${singular}.ts`, content: 'export default {};' },
    { path: `src/api/${singular}/services/${singular}.ts`, content: 'export default {};' },
    { path: `src/api/${singular}/routes/${singular}.ts`, content: 'export default {};' },
  ];
}

export function generateController(options: GeneratorOptions): GeneratedFile[] {
  return [{ path: `src/api/${options.name}/controllers/${options.name}.ts`, content: '' }];
}

export function generateService(options: GeneratorOptions): GeneratedFile[] {
  return [{ path: `src/api/${options.name}/services/${options.name}.ts`, content: '' }];
}

export function generatePolicy(options: GeneratorOptions): GeneratedFile[] {
  return [{ path: `src/policies/${options.name}.ts`, content: '' }];
}

export function generateMiddleware(options: GeneratorOptions): GeneratedFile[] {
  return [{ path: `src/middlewares/${options.name}.ts`, content: '' }];
}

export function generatePlugin(options: GeneratorOptions): GeneratedFile[] {
  return [{ path: `src/plugins/${options.name}/package.json`, content: '{}' }];
}

export function generateProject(options: ProjectOptions): GeneratedFile[] {
  return [
    { path: 'package.json', content: '{}' },
    { path: 'config/server.ts', content: '' },
    { path: 'config/database.ts', content: '' },
  ];
}

export function writeGeneratedFiles(_files: GeneratedFile[], _rootDir: string): void {
  // no-op in tests
}
