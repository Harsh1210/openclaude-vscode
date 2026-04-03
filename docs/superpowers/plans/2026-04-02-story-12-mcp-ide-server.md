# Story 12: MCP IDE Server & Integration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a local MCP IDE server that exposes VS Code tools (diagnostics, code execution) to the OpenClaude CLI, plus a webview McpServerManager dialog for viewing/managing all connected MCP servers.

**Architecture:** The `McpIdeServer` runs a localhost-only HTTP server on a random port, generates an auth token, and writes a lockfile to `~/.claude/ide/` so the CLI can auto-discover it. It exposes two tools: `getDiagnostics` (reads VS Code Problems panel) and `executeCode` (runs Python via Jupyter kernel with user confirmation). The webview `McpServerManager` dialog displays all MCP servers from CLI state with status indicators and reconnect/toggle controls. The host bridges webview actions to CLI control requests (`mcp_set_servers`, `mcp_reconnect`, `mcp_toggle`).

**Tech Stack:** TypeScript 5.x, Node.js `http` + `crypto` + `fs`, VS Code Extension API, React 18, Tailwind CSS 3, Vitest

**Spec:** [2026-04-02-openclaude-vscode-extension-design.md](../specs/2026-04-02-openclaude-vscode-extension-design.md) — Story 12, Sections 2.1, 2.3.3, 3.4, 5.2

**Claude Code extension (reference):** `~/.vscode/extensions/anthropic.claude-code-2.1.85-darwin-arm64/`

**Depends on:** Story 2 (ProcessManager, NdjsonTransport, control request plumbing)

---

## File Structure

| File | Responsibility |
|---|---|
| `src/mcp/mcpIdeServer.ts` | Localhost HTTP server, auth token, lockfile, getDiagnostics + executeCode tools |
| `src/mcp/types.ts` | MCP protocol types (JSON-RPC, tool definitions, server status) |
| `test/unit/mcpIdeServer.test.ts` | Unit tests for lockfile, auth, tool routing, server lifecycle |
| `webview/src/components/dialogs/McpServerManager.tsx` | MCP server list dialog with status indicators and actions |
| `src/extension.ts` | Instantiate McpIdeServer, wire webview MCP actions to CLI control requests |

---

## Task 1: MCP Protocol Types

**Files:**
- Create: `src/mcp/types.ts`

- [ ] **Step 1: Create MCP type definitions**

```typescript
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
```

- [ ] **Step 2: Commit**

```bash
git add src/mcp/types.ts
git commit -m "feat(mcp): add MCP protocol and IDE server types"
```

---

## Task 2: Build McpIdeServer

**Files:**
- Create: `src/mcp/mcpIdeServer.ts`
- Create: `test/unit/mcpIdeServer.test.ts`

- [ ] **Step 1: Write unit tests**

```typescript
// test/unit/mcpIdeServer.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// We test the pure helper functions and server behavior
// The actual VS Code API calls are mocked

describe('McpIdeServer', () => {
  const lockfileDir = path.join(os.homedir(), '.claude', 'ide');

  describe('lockfile generation', () => {
    it('should generate a lockfile with required fields', async () => {
      // Import the helper directly
      const { generateLockfile } = await import('../../src/mcp/mcpIdeServer');

      const lockfile = generateLockfile(12345, 8080, '/workspace/project');

      expect(lockfile.pid).toBe(12345);
      expect(lockfile.port).toBe(8080);
      expect(lockfile.workspaceFolder).toBe('/workspace/project');
      expect(lockfile.token).toMatch(/^[a-f0-9]{64}$/); // 32 bytes hex
      expect(lockfile.createdAt).toBeDefined();
    });

    it('should generate unique tokens on each call', async () => {
      const { generateLockfile } = await import('../../src/mcp/mcpIdeServer');

      const a = generateLockfile(1, 80, '/a');
      const b = generateLockfile(1, 80, '/a');

      expect(a.token).not.toBe(b.token);
    });
  });

  describe('auth validation', () => {
    it('should reject requests without Authorization header', async () => {
      const { validateAuth } = await import('../../src/mcp/mcpIdeServer');

      expect(validateAuth(undefined, 'valid-token')).toBe(false);
      expect(validateAuth('', 'valid-token')).toBe(false);
    });

    it('should reject requests with wrong token', async () => {
      const { validateAuth } = await import('../../src/mcp/mcpIdeServer');

      expect(validateAuth('Bearer wrong-token', 'valid-token')).toBe(false);
    });

    it('should accept requests with correct Bearer token', async () => {
      const { validateAuth } = await import('../../src/mcp/mcpIdeServer');

      expect(validateAuth('Bearer valid-token', 'valid-token')).toBe(true);
    });
  });

  describe('JSON-RPC routing', () => {
    it('should handle tools/list method', async () => {
      const { routeRequest } = await import('../../src/mcp/mcpIdeServer');

      const result = await routeRequest(
        { jsonrpc: '2.0', id: 1, method: 'tools/list' },
        { getDiagnostics: vi.fn(), executeCode: vi.fn() },
      );

      expect(result.result).toBeDefined();
      const tools = (result.result as { tools: Array<{ name: string }> }).tools;
      expect(tools).toHaveLength(2);
      expect(tools[0].name).toBe('getDiagnostics');
      expect(tools[1].name).toBe('executeCode');
    });

    it('should handle tools/call for getDiagnostics', async () => {
      const mockGetDiagnostics = vi.fn().mockResolvedValue([
        { file: 'test.ts', line: 10, message: 'Type error', severity: 'error' },
      ]);

      const { routeRequest } = await import('../../src/mcp/mcpIdeServer');

      const result = await routeRequest(
        {
          jsonrpc: '2.0',
          id: 2,
          method: 'tools/call',
          params: { name: 'getDiagnostics', arguments: {} },
        },
        { getDiagnostics: mockGetDiagnostics, executeCode: vi.fn() },
      );

      expect(mockGetDiagnostics).toHaveBeenCalled();
      expect(result.error).toBeUndefined();
    });

    it('should return error for unknown tool', async () => {
      const { routeRequest } = await import('../../src/mcp/mcpIdeServer');

      const result = await routeRequest(
        {
          jsonrpc: '2.0',
          id: 3,
          method: 'tools/call',
          params: { name: 'nonexistent', arguments: {} },
        },
        { getDiagnostics: vi.fn(), executeCode: vi.fn() },
      );

      expect(result.error).toBeDefined();
      expect(result.error!.code).toBe(-32601);
    });

    it('should return error for unknown method', async () => {
      const { routeRequest } = await import('../../src/mcp/mcpIdeServer');

      const result = await routeRequest(
        { jsonrpc: '2.0', id: 4, method: 'unknown/method' },
        { getDiagnostics: vi.fn(), executeCode: vi.fn() },
      );

      expect(result.error).toBeDefined();
      expect(result.error!.code).toBe(-32601);
    });
  });
});
```

- [ ] **Step 2: Run tests and confirm they fail (no implementation yet)**

Run: `cd /Users/harshagarwal/Documents/workspace/openclaude-vscode && npx vitest run test/unit/mcpIdeServer.test.ts 2>&1 | head -20`

Expected: Failures (module not found)

- [ ] **Step 3: Implement McpIdeServer**

```typescript
// src/mcp/mcpIdeServer.ts
import * as http from 'http';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as vscode from 'vscode';
import type { IdeLockfile, JsonRpcRequest, JsonRpcResponse } from './types';
import { IDE_TOOLS } from './types';

// ── Pure helpers (exported for testing) ──────────────────────────

export function generateLockfile(
  pid: number,
  port: number,
  workspaceFolder: string,
): IdeLockfile {
  return {
    pid,
    port,
    token: crypto.randomBytes(32).toString('hex'),
    workspaceFolder,
    createdAt: new Date().toISOString(),
  };
}

export function validateAuth(
  authHeader: string | undefined,
  expectedToken: string,
): boolean {
  if (!authHeader) return false;
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') return false;
  return parts[1] === expectedToken;
}

export type ToolHandlers = {
  getDiagnostics: (args: Record<string, unknown>) => Promise<unknown>;
  executeCode: (args: Record<string, unknown>) => Promise<unknown>;
};

export async function routeRequest(
  request: JsonRpcRequest,
  handlers: ToolHandlers,
): Promise<JsonRpcResponse> {
  const base = { jsonrpc: '2.0' as const, id: request.id };

  switch (request.method) {
    case 'initialize':
      return {
        ...base,
        result: {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: { name: 'openclaude-ide', version: '0.1.0' },
        },
      };

    case 'tools/list':
      return {
        ...base,
        result: {
          tools: IDE_TOOLS.map((t) => ({
            name: t.name,
            description: t.description,
            inputSchema: t.inputSchema,
          })),
        },
      };

    case 'tools/call': {
      const params = request.params as { name: string; arguments?: Record<string, unknown> } | undefined;
      if (!params?.name) {
        return { ...base, error: { code: -32602, message: 'Missing tool name' } };
      }
      const handler = handlers[params.name as keyof ToolHandlers];
      if (!handler) {
        return { ...base, error: { code: -32601, message: `Unknown tool: ${params.name}` } };
      }
      try {
        const result = await handler(params.arguments ?? {});
        return {
          ...base,
          result: { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] },
        };
      } catch (err) {
        return {
          ...base,
          result: {
            content: [{ type: 'text', text: `Error: ${(err as Error).message}` }],
            isError: true,
          },
        };
      }
    }

    default:
      return { ...base, error: { code: -32601, message: `Unknown method: ${request.method}` } };
  }
}

// ── VS Code-specific implementation ──────────────────────────────

export class McpIdeServer implements vscode.Disposable {
  private server: http.Server | null = null;
  private lockfilePath: string | null = null;
  private token: string = '';
  private port: number = 0;
  private disposables: vscode.Disposable[] = [];

  constructor(private readonly workspaceFolder: string) {}

  /** Start the server on a random localhost port */
  async start(): Promise<{ port: number; token: string }> {
    const lockfile = generateLockfile(process.pid, 0, this.workspaceFolder);
    this.token = lockfile.token;

    const handlers: ToolHandlers = {
      getDiagnostics: this.handleGetDiagnostics.bind(this),
      executeCode: this.handleExecuteCode.bind(this),
    };

    this.server = http.createServer(async (req, res) => {
      // Only accept localhost connections
      if (req.socket.remoteAddress !== '127.0.0.1' && req.socket.remoteAddress !== '::1') {
        res.writeHead(403);
        res.end('Forbidden');
        return;
      }

      // Validate auth token
      if (!validateAuth(req.headers.authorization, this.token)) {
        res.writeHead(401);
        res.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32000, message: 'Unauthorized' } }));
        return;
      }

      // Only accept POST
      if (req.method !== 'POST') {
        res.writeHead(405);
        res.end('Method Not Allowed');
        return;
      }

      // Read body
      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        chunks.push(chunk as Buffer);
      }

      try {
        const body = JSON.parse(Buffer.concat(chunks).toString('utf-8')) as JsonRpcRequest;
        const response = await routeRequest(body, handlers);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(response));
      } catch {
        res.writeHead(400);
        res.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32700, message: 'Parse error' } }));
      }
    });

    // Listen on random port, localhost only
    await new Promise<void>((resolve, reject) => {
      this.server!.listen(0, '127.0.0.1', () => resolve());
      this.server!.on('error', reject);
    });

    const addr = this.server.address() as { port: number };
    this.port = addr.port;
    lockfile.port = this.port;

    // Write lockfile
    await this.writeLockfile(lockfile);

    console.log(`[McpIdeServer] Started on 127.0.0.1:${this.port}`);
    return { port: this.port, token: this.token };
  }

  /** Write lockfile to ~/.claude/ide/<workspace-hash>.json */
  private async writeLockfile(lockfile: IdeLockfile): Promise<void> {
    const ideDir = path.join(os.homedir(), '.claude', 'ide');
    await fs.promises.mkdir(ideDir, { recursive: true });

    // Use workspace folder hash as filename to avoid collisions
    const hash = crypto.createHash('sha256').update(this.workspaceFolder).digest('hex').slice(0, 12);
    this.lockfilePath = path.join(ideDir, `${hash}.json`);

    await fs.promises.writeFile(this.lockfilePath, JSON.stringify(lockfile, null, 2), 'utf-8');
  }

  /** Remove lockfile on shutdown */
  private async removeLockfile(): Promise<void> {
    if (this.lockfilePath) {
      try {
        await fs.promises.unlink(this.lockfilePath);
      } catch {
        // Ignore — file may already be gone
      }
    }
  }

  // ── Tool handlers ──────────────────────────────────────────────

  /** getDiagnostics: read VS Code Problems panel */
  private async handleGetDiagnostics(args: Record<string, unknown>): Promise<unknown> {
    const allDiagnostics: Array<{
      file: string;
      line: number;
      column: number;
      message: string;
      severity: string;
      source?: string;
    }> = [];

    const severityMap: Record<number, string> = {
      [vscode.DiagnosticSeverity.Error]: 'error',
      [vscode.DiagnosticSeverity.Warning]: 'warning',
      [vscode.DiagnosticSeverity.Information]: 'information',
      [vscode.DiagnosticSeverity.Hint]: 'hint',
    };

    const severityOrder: Record<string, number> = {
      error: 0,
      warning: 1,
      information: 2,
      hint: 3,
    };

    const minSeverity = (args.severity as string) || 'hint';
    const minSeverityOrder = severityOrder[minSeverity] ?? 3;

    // Filter by URI if provided
    let diagnosticEntries: [vscode.Uri, readonly vscode.Diagnostic[]][];
    if (args.uri) {
      const uri = vscode.Uri.parse(args.uri as string);
      diagnosticEntries = [[uri, vscode.languages.getDiagnostics(uri)]];
    } else {
      diagnosticEntries = vscode.languages.getDiagnostics() as [vscode.Uri, vscode.Diagnostic[]][];
    }

    for (const [uri, diagnostics] of diagnosticEntries) {
      for (const diag of diagnostics) {
        const severity = severityMap[diag.severity] || 'hint';
        if (severityOrder[severity]! <= minSeverityOrder) {
          allDiagnostics.push({
            file: vscode.workspace.asRelativePath(uri),
            line: diag.range.start.line + 1,
            column: diag.range.start.character + 1,
            message: diag.message,
            severity,
            source: diag.source,
          });
        }
      }
    }

    return {
      diagnostics: allDiagnostics,
      totalCount: allDiagnostics.length,
    };
  }

  /** executeCode: run Python in Jupyter kernel with confirmation */
  private async handleExecuteCode(args: Record<string, unknown>): Promise<unknown> {
    const code = args.code as string;
    if (!code) {
      throw new Error('Missing required argument: code');
    }

    // Show confirmation dialog — user must approve before execution
    const choice = await vscode.window.showWarningMessage(
      `OpenClaude wants to execute code in a Jupyter kernel:\n\n${code.slice(0, 200)}${code.length > 200 ? '...' : ''}`,
      { modal: true },
      'Execute',
      'Cancel',
    );

    if (choice !== 'Execute') {
      return { status: 'cancelled', message: 'User cancelled code execution' };
    }

    // Check if Jupyter extension is available
    const jupyterExt = vscode.extensions.getExtension('ms-toolsai.jupyter');
    if (!jupyterExt) {
      // Fallback: run in terminal
      const terminal = vscode.window.createTerminal('OpenClaude Code Execution');
      terminal.show();
      terminal.sendText(`python3 -c ${JSON.stringify(code)}`);
      return {
        status: 'executed_in_terminal',
        message: 'Jupyter extension not available — executed in terminal. Check terminal for output.',
      };
    }

    // Use Jupyter kernel execution via notebook API
    try {
      // Create a temporary notebook cell and execute it
      const notebook = await vscode.workspace.openNotebookDocument('jupyter-notebook', {
        cells: [
          {
            kind: vscode.NotebookCellKind.Code,
            languageId: 'python',
            value: code,
            metadata: {},
          },
        ],
      });

      const editor = await vscode.window.showNotebookDocument(notebook);
      // Execute the cell
      await vscode.commands.executeCommand('notebook.cell.execute', {
        ranges: [{ start: 0, end: 1 }],
        document: notebook.uri,
      });

      return {
        status: 'executed',
        message: 'Code executed in Jupyter kernel. Check the notebook for output.',
      };
    } catch (err) {
      throw new Error(`Jupyter execution failed: ${(err as Error).message}`);
    }
  }

  // ── Metadata for CLI discovery ─────────────────────────────────

  /** Get server metadata for passing to CLI via initialize handshake */
  getServerMetadata(): { port: number; token: string; tools: string[] } | null {
    if (!this.server || !this.port) return null;
    return {
      port: this.port,
      token: this.token,
      tools: IDE_TOOLS.map((t) => t.name),
    };
  }

  /** Check if server is running */
  isRunning(): boolean {
    return this.server !== null && this.server.listening;
  }

  /** Dispose: stop server and clean up lockfile */
  dispose(): void {
    if (this.server) {
      this.server.close();
      this.server = null;
    }
    // Fire and forget lockfile removal
    this.removeLockfile();
    for (const d of this.disposables) {
      d.dispose();
    }
  }
}
```

- [ ] **Step 4: Run tests and confirm PASS**

Run: `cd /Users/harshagarwal/Documents/workspace/openclaude-vscode && npx vitest run test/unit/mcpIdeServer.test.ts`

Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add src/mcp/mcpIdeServer.ts test/unit/mcpIdeServer.test.ts
git commit -m "feat(mcp): implement MCP IDE server with getDiagnostics and executeCode tools"
```

---

## Task 3: Build McpServerManager Dialog

**Files:**
- Create: `webview/src/components/dialogs/McpServerManager.tsx`

- [ ] **Step 1: Implement the McpServerManager dialog**

```tsx
// webview/src/components/dialogs/McpServerManager.tsx
import React, { useState, useEffect } from 'react';
import type { McpServerInfo } from '../../../src/mcp/types';
import { vscode } from '../../vscode';

interface McpServerManagerProps {
  isOpen: boolean;
  onClose: () => void;
}

/** Status badge colors and labels */
const STATUS_CONFIG: Record<string, { color: string; bg: string; label: string }> = {
  connected: { color: 'text-green-400', bg: 'bg-green-400/20', label: 'Connected' },
  failed: { color: 'text-red-400', bg: 'bg-red-400/20', label: 'Failed' },
  pending: { color: 'text-yellow-400', bg: 'bg-yellow-400/20', label: 'Pending' },
  disabled: { color: 'text-zinc-500', bg: 'bg-zinc-500/20', label: 'Disabled' },
  'needs-auth': { color: 'text-orange-400', bg: 'bg-orange-400/20', label: 'Needs Auth' },
};

function StatusBadge({ status }: { status: string }) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.pending;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${config.bg} ${config.color}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${status === 'connected' ? 'bg-green-400' : status === 'failed' ? 'bg-red-400' : status === 'pending' ? 'bg-yellow-400 animate-pulse' : status === 'disabled' ? 'bg-zinc-500' : 'bg-orange-400'}`} />
      {config.label}
    </span>
  );
}

function ServerTypeIcon({ type }: { type: string }) {
  switch (type) {
    case 'stdio':
      return <span title="stdio" className="text-zinc-500">&#9654;</span>;
    case 'sse':
      return <span title="SSE" className="text-zinc-500">&#8644;</span>;
    case 'streamable-http':
      return <span title="HTTP" className="text-zinc-500">&#8645;</span>;
    default:
      return <span className="text-zinc-500">?</span>;
  }
}

export function McpServerManager({ isOpen, onClose }: McpServerManagerProps) {
  const [servers, setServers] = useState<McpServerInfo[]>([]);
  const [ideServer, setIdeServer] = useState<{ running: boolean; port: number | null; toolCount: number }>({
    running: false,
    port: null,
    toolCount: 0,
  });
  const [expandedServer, setExpandedServer] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newServerName, setNewServerName] = useState('');
  const [newServerCommand, setNewServerCommand] = useState('');

  // Listen for MCP state updates from host
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const msg = event.data;
      if (msg.type === 'mcp_servers_state') {
        setServers(msg.servers);
        setIdeServer(msg.ideServer);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  // Request fresh status when dialog opens
  useEffect(() => {
    if (isOpen) {
      vscode.postMessage({ type: 'mcp_refresh_status' });
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleReconnect = (serverName: string) => {
    vscode.postMessage({ type: 'mcp_reconnect', serverName });
  };

  const handleToggle = (serverName: string, currentlyEnabled: boolean) => {
    vscode.postMessage({ type: 'mcp_toggle', serverName, enabled: !currentlyEnabled });
  };

  const handleRemove = (serverName: string) => {
    vscode.postMessage({ type: 'mcp_remove_server', serverName });
  };

  const handleAdd = () => {
    if (!newServerName.trim() || !newServerCommand.trim()) return;
    vscode.postMessage({
      type: 'mcp_add_server',
      name: newServerName.trim(),
      config: { command: newServerCommand.trim() },
    });
    setNewServerName('');
    setNewServerCommand('');
    setShowAddForm(false);
  };

  const connectedCount = servers.filter((s) => s.status === 'connected').length;
  const totalToolCount = servers.reduce((sum, s) => sum + (s.tools?.length || 0), 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-[var(--vscode-editor-background)] border border-[var(--vscode-panel-border)] rounded-lg shadow-xl w-[560px] max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--vscode-panel-border)]">
          <div>
            <h2 className="text-sm font-semibold text-[var(--vscode-foreground)]">MCP Servers</h2>
            <p className="text-xs text-[var(--vscode-descriptionForeground)] mt-0.5">
              {connectedCount} connected &middot; {totalToolCount} tools available
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-[var(--vscode-foreground)] hover:text-[var(--vscode-errorForeground)] text-lg leading-none px-1"
          >
            &times;
          </button>
        </div>

        {/* IDE Server Banner */}
        <div className="px-4 py-2 bg-[var(--vscode-textBlockQuote-background)] border-b border-[var(--vscode-panel-border)]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-[var(--vscode-foreground)]">IDE Server</span>
              <StatusBadge status={ideServer.running ? 'connected' : 'disabled'} />
            </div>
            {ideServer.running && (
              <span className="text-xs text-[var(--vscode-descriptionForeground)]">
                Port {ideServer.port} &middot; {ideServer.toolCount} tools
              </span>
            )}
          </div>
        </div>

        {/* Server List */}
        <div className="flex-1 overflow-y-auto">
          {servers.length === 0 ? (
            <div className="px-4 py-8 text-center text-xs text-[var(--vscode-descriptionForeground)]">
              No MCP servers configured. Add one below or configure in .claude/settings.json.
            </div>
          ) : (
            <ul className="divide-y divide-[var(--vscode-panel-border)]">
              {servers.map((server) => {
                const isExpanded = expandedServer === server.name;
                const isDisabled = server.status === 'disabled';

                return (
                  <li key={server.name} className="px-4 py-2.5">
                    {/* Server row */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <ServerTypeIcon type={server.type} />
                        <button
                          className="text-xs font-medium text-[var(--vscode-foreground)] truncate text-left hover:underline"
                          onClick={() => setExpandedServer(isExpanded ? null : server.name)}
                        >
                          {server.name}
                        </button>
                        <StatusBadge status={server.status} />
                        {server.tools && (
                          <span className="text-[10px] text-[var(--vscode-descriptionForeground)]">
                            {server.tools.length} tools
                          </span>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-1.5 ml-2 shrink-0">
                        {server.status === 'failed' && (
                          <button
                            onClick={() => handleReconnect(server.name)}
                            className="text-[10px] px-2 py-0.5 rounded bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] hover:bg-[var(--vscode-button-hoverBackground)]"
                          >
                            Reconnect
                          </button>
                        )}
                        <button
                          onClick={() => handleToggle(server.name, !isDisabled)}
                          className="text-[10px] px-2 py-0.5 rounded border border-[var(--vscode-panel-border)] text-[var(--vscode-foreground)] hover:bg-[var(--vscode-list-hoverBackground)]"
                        >
                          {isDisabled ? 'Enable' : 'Disable'}
                        </button>
                        <button
                          onClick={() => handleRemove(server.name)}
                          className="text-[10px] px-1.5 py-0.5 rounded text-[var(--vscode-errorForeground)] hover:bg-[var(--vscode-errorForeground)]/10"
                          title="Remove server"
                        >
                          &times;
                        </button>
                      </div>
                    </div>

                    {/* Expanded details */}
                    {isExpanded && (
                      <div className="mt-2 ml-5 text-[11px] text-[var(--vscode-descriptionForeground)] space-y-1">
                        <div>Type: {server.type}</div>
                        {server.command && <div>Command: <code className="bg-[var(--vscode-textCodeBlock-background)] px-1 rounded">{server.command} {server.args?.join(' ')}</code></div>}
                        {server.url && <div>URL: <code className="bg-[var(--vscode-textCodeBlock-background)] px-1 rounded">{server.url}</code></div>}
                        {server.error && <div className="text-[var(--vscode-errorForeground)]">Error: {server.error}</div>}
                        {server.tools && server.tools.length > 0 && (
                          <div>
                            <div className="font-medium mt-1 mb-0.5">Tools:</div>
                            <ul className="ml-2 space-y-0.5">
                              {server.tools.map((tool) => (
                                <li key={tool.name}>
                                  <span className="font-mono">{tool.name}</span>
                                  {tool.description && <span className="ml-1 text-[var(--vscode-descriptionForeground)]">— {tool.description}</span>}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Add Server Form */}
        {showAddForm ? (
          <div className="px-4 py-3 border-t border-[var(--vscode-panel-border)] space-y-2">
            <input
              type="text"
              placeholder="Server name"
              value={newServerName}
              onChange={(e) => setNewServerName(e.target.value)}
              className="w-full px-2 py-1 text-xs rounded bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] border border-[var(--vscode-input-border)] placeholder-[var(--vscode-input-placeholderForeground)]"
            />
            <input
              type="text"
              placeholder="Command (e.g., npx -y @modelcontextprotocol/server-filesystem)"
              value={newServerCommand}
              onChange={(e) => setNewServerCommand(e.target.value)}
              className="w-full px-2 py-1 text-xs rounded bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] border border-[var(--vscode-input-border)] placeholder-[var(--vscode-input-placeholderForeground)]"
            />
            <div className="flex gap-2">
              <button
                onClick={handleAdd}
                className="text-xs px-3 py-1 rounded bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] hover:bg-[var(--vscode-button-hoverBackground)]"
              >
                Add Server
              </button>
              <button
                onClick={() => setShowAddForm(false)}
                className="text-xs px-3 py-1 rounded border border-[var(--vscode-panel-border)] text-[var(--vscode-foreground)] hover:bg-[var(--vscode-list-hoverBackground)]"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="px-4 py-2.5 border-t border-[var(--vscode-panel-border)] flex justify-between items-center">
            <button
              onClick={() => setShowAddForm(true)}
              className="text-xs px-3 py-1 rounded bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] hover:bg-[var(--vscode-button-hoverBackground)]"
            >
              + Add Server
            </button>
            <button
              onClick={() => vscode.postMessage({ type: 'mcp_refresh_status' })}
              className="text-xs px-3 py-1 rounded border border-[var(--vscode-panel-border)] text-[var(--vscode-foreground)] hover:bg-[var(--vscode-list-hoverBackground)]"
            >
              Refresh
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Build webview to verify**

Run: `cd /Users/harshagarwal/Documents/workspace/openclaude-vscode && npm run build:webview`

Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add webview/src/components/dialogs/McpServerManager.tsx
git commit -m "feat(mcp): add MCP server manager dialog with status indicators"
```

---

## Task 4: Wire MCP Server Into Extension Host

**Files:**
- Modify: `src/extension.ts`
- Modify: `src/process/processManager.ts` (if exists)

- [ ] **Step 1: Instantiate McpIdeServer during activation and handle webview MCP actions**

Add to `src/extension.ts`:

```typescript
// ── In activate() ────────────────────────────────────────────────

import { McpIdeServer } from './mcp/mcpIdeServer';

// Get workspace folder
const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || os.homedir();

// Start IDE MCP server
const mcpServer = new McpIdeServer(workspaceFolder);
try {
  const { port, token } = await mcpServer.start();
  console.log(`[OpenClaude] MCP IDE server running on port ${port}`);
} catch (err) {
  console.error('[OpenClaude] Failed to start MCP IDE server:', err);
}
context.subscriptions.push(mcpServer);

// ── Handle MCP webview messages ──────────────────────────────────

// Inside your webview message handler (wherever postMessage is received):
function handleMcpWebviewMessage(
  message: { type: string; [key: string]: unknown },
  processManager: { sendControlRequest: (req: unknown) => void } | null,
  webview: vscode.Webview,
) {
  switch (message.type) {
    case 'mcp_refresh_status': {
      // Request MCP status from CLI
      processManager?.sendControlRequest({
        type: 'control_request',
        request_id: `mcp-status-${Date.now()}`,
        request: { subtype: 'mcp_status' },
      });
      // Also include IDE server status
      const meta = mcpServer.getServerMetadata();
      webview.postMessage({
        type: 'mcp_servers_state',
        servers: [], // Will be populated by CLI response
        ideServer: {
          running: mcpServer.isRunning(),
          port: meta?.port ?? null,
          toolCount: meta?.tools.length ?? 0,
        },
      });
      break;
    }
    case 'mcp_reconnect': {
      processManager?.sendControlRequest({
        type: 'control_request',
        request_id: `mcp-reconnect-${Date.now()}`,
        request: { subtype: 'mcp_reconnect', serverName: message.serverName },
      });
      break;
    }
    case 'mcp_toggle': {
      processManager?.sendControlRequest({
        type: 'control_request',
        request_id: `mcp-toggle-${Date.now()}`,
        request: { subtype: 'mcp_toggle', serverName: message.serverName, enabled: message.enabled },
      });
      break;
    }
    case 'mcp_add_server': {
      processManager?.sendControlRequest({
        type: 'control_request',
        request_id: `mcp-set-${Date.now()}`,
        request: { subtype: 'mcp_set_servers', servers: { [message.name as string]: message.config } },
      });
      break;
    }
    case 'mcp_remove_server': {
      // Remove by setting server to null/disabled via CLI control
      processManager?.sendControlRequest({
        type: 'control_request',
        request_id: `mcp-remove-${Date.now()}`,
        request: { subtype: 'mcp_toggle', serverName: message.serverName, enabled: false },
      });
      break;
    }
  }
}
```

- [ ] **Step 2: Pass IDE server metadata to CLI initialize handshake**

In ProcessManager or wherever the initialize control_request is built, include the IDE MCP server:

```typescript
// When building the initialize control_request:
const ideServerMeta = mcpServer.getServerMetadata();

const initRequest = {
  type: 'control_request',
  request_id: 'init-001',
  request: {
    subtype: 'initialize',
    hooks: {},
    sdkMcpServers: ideServerMeta
      ? [
          {
            name: 'openclaude-ide',
            type: 'streamable-http',
            url: `http://127.0.0.1:${ideServerMeta.port}`,
            headers: { Authorization: `Bearer ${ideServerMeta.token}` },
          },
        ]
      : [],
    promptSuggestions: true,
    agentProgressSummaries: true,
  },
};
```

- [ ] **Step 3: Handle mcp_message control_request from CLI**

When the CLI sends a `control_request` with `subtype: mcp_message`, forward it to the IDE server:

```typescript
// In your control request router (from Story 2):
case 'mcp_message': {
  const rpcRequest = controlRequest.request.message as JsonRpcRequest;
  const response = await routeRequest(rpcRequest, {
    getDiagnostics: mcpServer['handleGetDiagnostics'].bind(mcpServer),
    executeCode: mcpServer['handleExecuteCode'].bind(mcpServer),
  });
  // Send control_response back to CLI
  processManager.sendControlResponse({
    type: 'control_response',
    response: {
      subtype: 'success',
      request_id: controlRequest.request_id,
      response: response,
    },
  });
  break;
}
```

- [ ] **Step 4: Build and verify**

Run: `cd /Users/harshagarwal/Documents/workspace/openclaude-vscode && npm run build`

Expected: Build succeeds

- [ ] **Step 5: Commit**

```bash
git add src/extension.ts src/process/processManager.ts
git commit -m "feat(mcp): wire MCP IDE server into extension host and CLI handshake"
```

---

## Final Verification

- [ ] Run: `npm run build`
- [ ] Run: `npx vitest run test/unit/mcpIdeServer.test.ts`
- [ ] Manual: F5 launch → verify lockfile appears in `~/.claude/ide/`
- [ ] Manual: verify MCP Server Manager dialog opens and shows IDE server status
- [ ] Manual: verify `/mcp` slash command output renders in chat
- [ ] Check: lockfile is removed on extension deactivation
