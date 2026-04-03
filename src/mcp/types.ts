// src/mcp/types.ts

/** MCP server status as reported by CLI */
export type McpServerStatus = 'connected' | 'failed' | 'pending' | 'disabled' | 'needs-auth';

/** MCP server info from CLI mcp_status response */
export interface McpServerInfo {
  name: string;
  status: McpServerStatus;
  type: 'stdio' | 'sse' | 'streamable-http';
  url?: string;
  command?: string;
  args?: string[];
  tools?: McpToolInfo[];
  error?: string;
}

/** MCP tool info */
export interface McpToolInfo {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

/** JSON-RPC 2.0 request (MCP protocol) */
export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: Record<string, unknown>;
}

/** JSON-RPC 2.0 response (MCP protocol) */
export interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

/** Lockfile written to ~/.claude/ide/ for CLI discovery */
export interface IdeLockfile {
  pid: number;
  port: number;
  token: string;
  workspaceFolder: string;
  createdAt: string;
}

/** IDE MCP tool definitions */
export const IDE_TOOLS = [
  {
    name: 'getDiagnostics',
    description: 'Get diagnostics (errors, warnings) from the VS Code Problems panel for the current workspace or a specific file.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        uri: {
          type: 'string',
          description: 'Optional file URI to filter diagnostics. If omitted, returns all workspace diagnostics.',
        },
        severity: {
          type: 'string',
          enum: ['error', 'warning', 'information', 'hint'],
          description: 'Optional minimum severity filter.',
        },
      },
    },
  },
  {
    name: 'executeCode',
    description: 'Execute Python code in a Jupyter kernel. Requires user confirmation before execution.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        code: {
          type: 'string',
          description: 'Python code to execute.',
        },
        language: {
          type: 'string',
          default: 'python',
          description: 'Language of the code (currently only python supported).',
        },
      },
      required: ['code'],
    },
  },
] as const;

/** Host → Webview message types for MCP manager */
export interface McpServersStateMessage {
  type: 'mcp_servers_state';
  servers: McpServerInfo[];
  ideServer: {
    running: boolean;
    port: number | null;
    toolCount: number;
  };
}

/** Webview → Host message types for MCP manager */
export type McpManagerAction =
  | { type: 'mcp_open_manager' }
  | { type: 'mcp_reconnect'; serverName: string }
  | { type: 'mcp_toggle'; serverName: string; enabled: boolean }
  | { type: 'mcp_add_server'; name: string; config: Record<string, unknown> }
  | { type: 'mcp_remove_server'; serverName: string }
  | { type: 'mcp_refresh_status' };
