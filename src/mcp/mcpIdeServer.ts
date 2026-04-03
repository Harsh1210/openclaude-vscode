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

      await vscode.window.showNotebookDocument(notebook);
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
