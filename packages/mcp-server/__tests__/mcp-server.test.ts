import { describe, it, expect, beforeEach } from 'vitest';
import { createMCPServer } from '../src/index.js';
import type { MCPServer, ContentTypeSchema, ContentManager, MCPConfig } from '../src/index.js';

function createTestContentTypes(): ContentTypeSchema[] {
  return [
    {
      uid: 'api::article.article',
      singularName: 'article',
      pluralName: 'articles',
      displayName: 'Article',
      attributes: {
        title: { type: 'string', required: true },
        content: { type: 'text' },
        published: { type: 'boolean' },
      },
    },
    {
      uid: 'api::page.page',
      singularName: 'page',
      pluralName: 'pages',
      displayName: 'Page',
      attributes: {
        title: { type: 'string', required: true },
        slug: { type: 'string' },
        body: { type: 'richtext' },
      },
    },
  ];
}

function createTestContentManager(): ContentManager {
  const store = new Map<string, Map<string, Record<string, any>>>();

  function getStore(uid: string): Map<string, Record<string, any>> {
    if (!store.has(uid)) store.set(uid, new Map());
    return store.get(uid)!;
  }

  return {
    async find(uid, params) {
      const entries = Array.from(getStore(uid).values());
      const limit = params?.limit ?? 25;
      return entries.slice(0, limit);
    },
    async findOne(uid, documentId) {
      return getStore(uid).get(documentId) ?? null;
    },
    async create(uid, data) {
      const id = `doc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const entry = { documentId: id, ...data };
      getStore(uid).set(id, entry);
      return entry;
    },
    async update(uid, documentId, data) {
      const existing = getStore(uid).get(documentId);
      if (!existing) return null;
      const updated = { ...existing, ...data };
      getStore(uid).set(documentId, updated);
      return updated;
    },
    async delete(uid, documentId) {
      const existed = getStore(uid).has(documentId);
      getStore(uid).delete(documentId);
      return { deleted: existed };
    },
  };
}

describe('MCP Server', () => {
  let server: MCPServer;
  let contentManager: ContentManager;
  const contentTypes = createTestContentTypes();

  beforeEach(() => {
    contentManager = createTestContentManager();
    server = createMCPServer({
      config: { contentTypes: '*' },
      contentTypes,
      contentManager,
    });
  });

  it('returns server info', () => {
    const info = server.getServerInfo();
    expect(info.name).toBe('apick-mcp');
    expect(info.version).toBe('0.1.0');
  });

  it('lists tools for all content types and operations', () => {
    const tools = server.listTools();
    // 2 content types × 5 operations = 10 tools
    expect(tools).toHaveLength(10);
    expect(tools.find(t => t.name === 'find_articles')).toBeDefined();
    expect(tools.find(t => t.name === 'get_articles')).toBeDefined();
    expect(tools.find(t => t.name === 'create_articles')).toBeDefined();
    expect(tools.find(t => t.name === 'update_articles')).toBeDefined();
    expect(tools.find(t => t.name === 'delete_articles')).toBeDefined();
    expect(tools.find(t => t.name === 'find_pages')).toBeDefined();
  });

  it('lists resources for all content types', () => {
    const resources = server.listResources();
    // 2 content types × 2 resources (schema + content) = 4
    expect(resources).toHaveLength(4);
    expect(resources.find(r => r.uri === 'apick://schema/api::article.article')).toBeDefined();
    expect(resources.find(r => r.uri === 'apick://content/api::article.article')).toBeDefined();
  });

  it('filters content types by UID list', () => {
    const filtered = createMCPServer({
      config: { contentTypes: ['api::article.article'] },
      contentTypes,
      contentManager,
    });
    expect(filtered.listTools()).toHaveLength(5); // 1 content type × 5 operations
    expect(filtered.listResources()).toHaveLength(2);
  });

  it('restricts operations', () => {
    const limited = createMCPServer({
      config: { contentTypes: '*', operations: ['find', 'get'] },
      contentTypes,
      contentManager,
    });
    expect(limited.listTools()).toHaveLength(4); // 2 CTs × 2 ops
    expect(limited.listTools().every(t => t.name.startsWith('find_') || t.name.startsWith('get_'))).toBe(true);
  });

  it('calls find tool', async () => {
    await contentManager.create('api::article.article', { title: 'Article 1' });
    await contentManager.create('api::article.article', { title: 'Article 2' });

    const result = await server.callTool({ name: 'find_articles', arguments: {} });
    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data).toHaveLength(2);
  });

  it('calls get tool', async () => {
    const created = await contentManager.create('api::article.article', { title: 'Test' });

    const result = await server.callTool({ name: 'get_articles', arguments: { documentId: created.documentId } });
    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data.title).toBe('Test');
  });

  it('returns error for get on non-existent document', async () => {
    const result = await server.callTool({ name: 'get_articles', arguments: { documentId: 'nonexistent' } });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('not found');
  });

  it('calls create tool', async () => {
    const result = await server.callTool({ name: 'create_articles', arguments: { data: { title: 'New Article' } } });
    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data.title).toBe('New Article');
    expect(data.documentId).toBeDefined();
  });

  it('calls update tool', async () => {
    const created = await contentManager.create('api::article.article', { title: 'Old' });
    const result = await server.callTool({
      name: 'update_articles',
      arguments: { documentId: created.documentId, data: { title: 'New' } },
    });
    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data.title).toBe('New');
  });

  it('calls delete tool', async () => {
    const created = await contentManager.create('api::article.article', { title: 'Delete Me' });
    const result = await server.callTool({ name: 'delete_articles', arguments: { documentId: created.documentId } });
    expect(result.isError).toBeUndefined();
  });

  it('returns error for unknown tool', async () => {
    const result = await server.callTool({ name: 'unknown_tool', arguments: {} });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Unknown tool');
  });

  it('reads schema resource', async () => {
    const result = await server.readResource('apick://schema/api::article.article');
    expect(result.contents).toHaveLength(1);
    expect(result.contents[0].mimeType).toBe('application/json');
    const schema = JSON.parse(result.contents[0].text);
    expect(schema.title).toBe('Article');
    expect(schema.properties.title).toBeDefined();
  });

  it('reads content resource', async () => {
    await contentManager.create('api::article.article', { title: 'Test Article' });
    const result = await server.readResource('apick://content/api::article.article');
    const data = JSON.parse(result.contents[0].text);
    expect(data).toHaveLength(1);
  });

  it('throws for unknown resource URI', async () => {
    await expect(server.readResource('apick://unknown/resource')).rejects.toThrow('Unknown resource');
  });

  it('handles JSON-RPC initialize', async () => {
    const response = await server.handleRequest({
      jsonrpc: '2.0', id: 1, method: 'initialize',
    });
    expect(response.result.protocolVersion).toBe('2024-11-05');
    expect(response.result.serverInfo.name).toBe('apick-mcp');
  });

  it('handles JSON-RPC tools/list', async () => {
    const response = await server.handleRequest({
      jsonrpc: '2.0', id: 2, method: 'tools/list',
    });
    expect(response.result.tools).toHaveLength(10);
  });

  it('handles JSON-RPC tools/call', async () => {
    await contentManager.create('api::article.article', { title: 'RPC Test' });
    const response = await server.handleRequest({
      jsonrpc: '2.0', id: 3, method: 'tools/call',
      params: { name: 'find_articles', arguments: {} },
    });
    expect(response.error).toBeUndefined();
    const data = JSON.parse(response.result.content[0].text);
    expect(data).toHaveLength(1);
  });

  it('handles JSON-RPC resources/list', async () => {
    const response = await server.handleRequest({
      jsonrpc: '2.0', id: 4, method: 'resources/list',
    });
    expect(response.result.resources).toHaveLength(4);
  });

  it('handles JSON-RPC resources/read', async () => {
    const response = await server.handleRequest({
      jsonrpc: '2.0', id: 5, method: 'resources/read',
      params: { uri: 'apick://schema/api::article.article' },
    });
    expect(response.error).toBeUndefined();
    const schema = JSON.parse(response.result.contents[0].text);
    expect(schema.title).toBe('Article');
  });

  it('handles JSON-RPC ping', async () => {
    const response = await server.handleRequest({ jsonrpc: '2.0', id: 6, method: 'ping' });
    expect(response.result).toEqual({});
  });

  it('handles JSON-RPC unknown method', async () => {
    const response = await server.handleRequest({ jsonrpc: '2.0', id: 7, method: 'unknown' });
    expect(response.error).toBeDefined();
    expect(response.error!.code).toBe(-32601);
  });

  it('uses custom server name and version', () => {
    const custom = createMCPServer({
      config: { contentTypes: '*', serverName: 'my-cms', serverVersion: '2.0.0' },
      contentTypes,
      contentManager,
    });
    const info = custom.getServerInfo();
    expect(info.name).toBe('my-cms');
    expect(info.version).toBe('2.0.0');
  });
});
