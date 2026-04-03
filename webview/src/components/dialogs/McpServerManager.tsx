// webview/src/components/dialogs/McpServerManager.tsx
import React, { useState, useEffect } from 'react';
import { vscode } from '../../vscode';

interface McpServerInfo {
  name: string;
  status: 'connected' | 'failed' | 'pending' | 'disabled' | 'needs-auth';
  type: 'stdio' | 'sse' | 'streamable-http';
  url?: string;
  command?: string;
  args?: string[];
  tools?: Array<{ name: string; description?: string }>;
  error?: string;
}

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
  const config = STATUS_CONFIG[status] || STATUS_CONFIG['pending'];
  const dotColor =
    status === 'connected' ? 'bg-green-400' :
    status === 'failed' ? 'bg-red-400' :
    status === 'pending' ? 'bg-yellow-400 animate-pulse' :
    status === 'disabled' ? 'bg-zinc-500' :
    'bg-orange-400';

  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${config.bg} ${config.color}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />
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
                        {server.command && (
                          <div>
                            Command:{' '}
                            <code className="bg-[var(--vscode-textCodeBlock-background)] px-1 rounded">
                              {server.command} {server.args?.join(' ')}
                            </code>
                          </div>
                        )}
                        {server.url && (
                          <div>
                            URL:{' '}
                            <code className="bg-[var(--vscode-textCodeBlock-background)] px-1 rounded">
                              {server.url}
                            </code>
                          </div>
                        )}
                        {server.error && (
                          <div className="text-[var(--vscode-errorForeground)]">Error: {server.error}</div>
                        )}
                        {server.tools && server.tools.length > 0 && (
                          <div>
                            <div className="font-medium mt-1 mb-0.5">Tools:</div>
                            <ul className="ml-2 space-y-0.5">
                              {server.tools.map((tool) => (
                                <li key={tool.name}>
                                  <span className="font-mono">{tool.name}</span>
                                  {tool.description && (
                                    <span className="ml-1 text-[var(--vscode-descriptionForeground)]">
                                      — {tool.description}
                                    </span>
                                  )}
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
