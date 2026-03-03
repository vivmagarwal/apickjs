/**
 * @apick/mcp-server — Model Context Protocol Server Plugin.
 *
 * Auto-generates MCP tools (find, get, create, update, delete)
 * and resources (schema, content) from content type schemas.
 * Exposes SSE transport on `/mcp`.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MCPToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, any>;
}

export interface MCPResourceDefinition {
  uri: string;
  name: string;
  description: string;
  mimeType: string;
}

export interface MCPToolCall {
  name: string;
  arguments: Record<string, any>;
}

export interface MCPToolResult {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

export interface MCPConfig {
  /** Content types to expose (wildcard '*' or list of UIDs) */
  contentTypes: string[] | '*';
  /** Operations to expose */
  operations?: ('find' | 'get' | 'create' | 'update' | 'delete')[];
  /** Server name */
  serverName?: string;
  /** Server version */
  serverVersion?: string;
}

export interface ContentTypeSchema {
  uid: string;
  singularName: string;
  pluralName: string;
  displayName: string;
  attributes: Record<string, any>;
}

export interface ContentManager {
  find(uid: string, params?: any): Promise<any>;
  findOne(uid: string, documentId: string, params?: any): Promise<any>;
  create(uid: string, data: any, params?: any): Promise<any>;
  update(uid: string, documentId: string, data: any, params?: any): Promise<any>;
  delete(uid: string, documentId: string, params?: any): Promise<any>;
}

export interface MCPServer {
  /** Get all available tools */
  listTools(): MCPToolDefinition[];
  /** Get all available resources */
  listResources(): MCPResourceDefinition[];
  /** Execute a tool call */
  callTool(call: MCPToolCall): Promise<MCPToolResult>;
  /** Read a resource */
  readResource(uri: string): Promise<{ contents: Array<{ uri: string; mimeType: string; text: string }> }>;
  /** Get server info */
  getServerInfo(): { name: string; version: string };
  /** Handle a JSON-RPC request */
  handleRequest(request: JSONRPCRequest): Promise<JSONRPCResponse>;
}

export interface JSONRPCRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: Record<string, any>;
}

export interface JSONRPCResponse {
  jsonrpc: '2.0';
  id: string | number;
  result?: any;
  error?: { code: number; message: string; data?: any };
}

export interface MCPServerConfig {
  config: MCPConfig;
  contentTypes: ContentTypeSchema[];
  contentManager: ContentManager;
}

// ---------------------------------------------------------------------------
// Tool generation
// ---------------------------------------------------------------------------

function generateTools(
  contentTypes: ContentTypeSchema[],
  operations: string[],
): MCPToolDefinition[] {
  const tools: MCPToolDefinition[] = [];

  for (const ct of contentTypes) {
    if (operations.includes('find')) {
      tools.push({
        name: `find_${ct.pluralName}`,
        description: `Find ${ct.displayName} entries. Returns a list of ${ct.pluralName}.`,
        inputSchema: {
          type: 'object',
          properties: {
            limit: { type: 'integer', description: 'Maximum number of results', default: 25 },
            offset: { type: 'integer', description: 'Number of results to skip', default: 0 },
            sort: { type: 'string', description: 'Sort field and direction (e.g. "createdAt:desc")' },
            filters: { type: 'object', description: 'Query filters' },
          },
        },
      });
    }

    if (operations.includes('get')) {
      tools.push({
        name: `get_${ct.pluralName}`,
        description: `Get a single ${ct.displayName} by document ID.`,
        inputSchema: {
          type: 'object',
          required: ['documentId'],
          properties: {
            documentId: { type: 'string', description: 'The document ID' },
          },
        },
      });
    }

    if (operations.includes('create')) {
      tools.push({
        name: `create_${ct.pluralName}`,
        description: `Create a new ${ct.displayName} entry.`,
        inputSchema: {
          type: 'object',
          required: ['data'],
          properties: {
            data: { type: 'object', description: `The ${ct.displayName} data` },
          },
        },
      });
    }

    if (operations.includes('update')) {
      tools.push({
        name: `update_${ct.pluralName}`,
        description: `Update an existing ${ct.displayName} entry.`,
        inputSchema: {
          type: 'object',
          required: ['documentId', 'data'],
          properties: {
            documentId: { type: 'string', description: 'The document ID to update' },
            data: { type: 'object', description: `The updated ${ct.displayName} data` },
          },
        },
      });
    }

    if (operations.includes('delete')) {
      tools.push({
        name: `delete_${ct.pluralName}`,
        description: `Delete a ${ct.displayName} entry by document ID.`,
        inputSchema: {
          type: 'object',
          required: ['documentId'],
          properties: {
            documentId: { type: 'string', description: 'The document ID to delete' },
          },
        },
      });
    }
  }

  return tools;
}

// ---------------------------------------------------------------------------
// Resource generation
// ---------------------------------------------------------------------------

function generateResources(contentTypes: ContentTypeSchema[]): MCPResourceDefinition[] {
  const resources: MCPResourceDefinition[] = [];

  for (const ct of contentTypes) {
    resources.push({
      uri: `apick://schema/${ct.uid}`,
      name: `${ct.displayName} Schema`,
      description: `JSON Schema for the ${ct.displayName} content type.`,
      mimeType: 'application/json',
    });
    resources.push({
      uri: `apick://content/${ct.uid}`,
      name: `${ct.displayName} Content`,
      description: `List of all ${ct.displayName} entries.`,
      mimeType: 'application/json',
    });
  }

  return resources;
}

// ---------------------------------------------------------------------------
// Tool name to UID resolver
// ---------------------------------------------------------------------------

function resolveToolTarget(
  toolName: string,
  contentTypes: ContentTypeSchema[],
): { operation: string; uid: string; ct: ContentTypeSchema } | null {
  for (const ct of contentTypes) {
    const suffix = ct.pluralName;
    for (const op of ['find', 'get', 'create', 'update', 'delete']) {
      if (toolName === `${op}_${suffix}`) {
        return { operation: op, uid: ct.uid, ct };
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createMCPServer(serverConfig: MCPServerConfig): MCPServer {
  const { config, contentTypes, contentManager } = serverConfig;
  const operations = config.operations ?? ['find', 'get', 'create', 'update', 'delete'];
  const serverName = config.serverName ?? 'apick-mcp';
  const serverVersion = config.serverVersion ?? '0.1.0';

  // Filter content types based on config
  const exposedTypes = config.contentTypes === '*'
    ? contentTypes
    : contentTypes.filter(ct => (config.contentTypes as string[]).includes(ct.uid));

  const tools = generateTools(exposedTypes, operations);
  const resources = generateResources(exposedTypes);

  return {
    listTools() {
      return tools;
    },

    listResources() {
      return resources;
    },

    getServerInfo() {
      return { name: serverName, version: serverVersion };
    },

    async callTool(call) {
      const target = resolveToolTarget(call.name, exposedTypes);
      if (!target) {
        return { content: [{ type: 'text', text: `Unknown tool: ${call.name}` }], isError: true };
      }

      try {
        let result: any;
        const args = call.arguments;

        switch (target.operation) {
          case 'find':
            result = await contentManager.find(target.uid, {
              limit: args.limit,
              offset: args.offset,
              sort: args.sort,
              filters: args.filters,
            });
            break;
          case 'get':
            result = await contentManager.findOne(target.uid, args.documentId);
            if (!result) {
              return { content: [{ type: 'text', text: `${target.ct.displayName} not found: ${args.documentId}` }], isError: true };
            }
            break;
          case 'create':
            result = await contentManager.create(target.uid, args.data);
            break;
          case 'update':
            result = await contentManager.update(target.uid, args.documentId, args.data);
            break;
          case 'delete':
            result = await contentManager.delete(target.uid, args.documentId);
            break;
        }

        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true };
      }
    },

    async readResource(uri) {
      // Parse apick://schema/{uid} or apick://content/{uid}
      const schemaMatch = uri.match(/^apick:\/\/schema\/(.+)$/);
      if (schemaMatch) {
        const uid = schemaMatch[1];
        const ct = exposedTypes.find(c => c.uid === uid);
        if (!ct) {
          throw new Error(`Unknown content type: ${uid}`);
        }
        const schema = {
          $schema: 'http://json-schema.org/draft-07/schema#',
          title: ct.displayName,
          type: 'object',
          properties: Object.fromEntries(
            Object.entries(ct.attributes).map(([key, attr]: [string, any]) => [key, { type: attr.type || 'string' }]),
          ),
        };
        return {
          contents: [{
            uri,
            mimeType: 'application/json',
            text: JSON.stringify(schema, null, 2),
          }],
        };
      }

      const contentMatch = uri.match(/^apick:\/\/content\/(.+)$/);
      if (contentMatch) {
        const uid = contentMatch[1];
        const ct = exposedTypes.find(c => c.uid === uid);
        if (!ct) {
          throw new Error(`Unknown content type: ${uid}`);
        }
        const entries = await contentManager.find(uid, { limit: 100 });
        return {
          contents: [{
            uri,
            mimeType: 'application/json',
            text: JSON.stringify(entries, null, 2),
          }],
        };
      }

      throw new Error(`Unknown resource: ${uri}`);
    },

    async handleRequest(request) {
      const { id, method, params } = request;

      try {
        switch (method) {
          case 'initialize':
            return {
              jsonrpc: '2.0',
              id,
              result: {
                protocolVersion: '2024-11-05',
                capabilities: { tools: {}, resources: {} },
                serverInfo: { name: serverName, version: serverVersion },
              },
            };

          case 'tools/list':
            return { jsonrpc: '2.0', id, result: { tools: this.listTools() } };

          case 'tools/call':
            const toolResult = await this.callTool({
              name: params!.name,
              arguments: params!.arguments ?? {},
            });
            return { jsonrpc: '2.0', id, result: toolResult };

          case 'resources/list':
            return { jsonrpc: '2.0', id, result: { resources: this.listResources() } };

          case 'resources/read':
            const resourceResult = await this.readResource(params!.uri);
            return { jsonrpc: '2.0', id, result: resourceResult };

          case 'ping':
            return { jsonrpc: '2.0', id, result: {} };

          default:
            return {
              jsonrpc: '2.0',
              id,
              error: { code: -32601, message: `Method not found: ${method}` },
            };
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          jsonrpc: '2.0',
          id,
          error: { code: -32000, message },
        };
      }
    },
  };
}
