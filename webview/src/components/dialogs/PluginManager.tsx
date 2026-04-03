import React, { useState, useEffect } from 'react';
import { vscode } from '../../vscode';

interface PluginInfo {
  name: string;
  version: string;
  description: string;
  scope: 'user' | 'project' | 'local';
  status: 'enabled' | 'disabled' | 'error' | 'not-installed';
  commands?: string[];
  agents?: string[];
  author?: string;
  homepage?: string;
  error?: string;
}

interface MarketplacePlugin {
  name: string;
  version: string;
  description: string;
  author: string;
  downloads?: number;
  installed: boolean;
}

interface PluginManagerProps {
  isOpen: boolean;
  onClose: () => void;
}

type Tab = 'installed' | 'marketplace';
type InstallScope = 'user' | 'project' | 'local';

function ScopeBadge({ scope }: { scope: string }) {
  const colors: Record<string, string> = {
    user: 'bg-blue-400/20 text-blue-400',
    project: 'bg-purple-400/20 text-purple-400',
    local: 'bg-green-400/20 text-green-400',
  };
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${colors[scope] || 'bg-zinc-400/20 text-zinc-400'}`}>
      {scope}
    </span>
  );
}

function StatusIndicator({ status }: { status: string }) {
  if (status === 'enabled') return <span className="w-2 h-2 rounded-full bg-green-400" title="Enabled" />;
  if (status === 'disabled') return <span className="w-2 h-2 rounded-full bg-zinc-500" title="Disabled" />;
  if (status === 'error') return <span className="w-2 h-2 rounded-full bg-red-400" title="Error" />;
  return null;
}

export function PluginManager({ isOpen, onClose }: PluginManagerProps) {
  const [tab, setTab] = useState<Tab>('installed');
  const [plugins, setPlugins] = useState<PluginInfo[]>([]);
  const [marketplace, setMarketplace] = useState<MarketplacePlugin[]>([]);
  const [selectedPlugin, setSelectedPlugin] = useState<PluginInfo | null>(null);
  const [installScope, setInstallScope] = useState<InstallScope>('user');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const msg = event.data;
      if (msg.type === 'plugins_state') {
        setPlugins(msg.installed || []);
        setMarketplace(msg.marketplace || []);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  useEffect(() => {
    if (isOpen) {
      vscode.postMessage({ type: 'plugin_refresh' });
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleToggle = (name: string, currentStatus: string) => {
    vscode.postMessage({
      type: 'plugin_toggle',
      name,
      enabled: currentStatus !== 'enabled',
    });
  };

  const handleInstall = (name: string) => {
    vscode.postMessage({ type: 'plugin_install', name, scope: installScope });
  };

  const handleUninstall = (name: string) => {
    vscode.postMessage({ type: 'plugin_uninstall', name });
  };

  const filteredPlugins = plugins.filter(
    (p) =>
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.description.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const filteredMarketplace = marketplace.filter(
    (p) =>
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.description.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-[var(--vscode-editor-background)] border border-[var(--vscode-panel-border)] rounded-lg shadow-xl w-[600px] max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--vscode-panel-border)]">
          <h2 className="text-sm font-semibold text-[var(--vscode-foreground)]">Plugins</h2>
          <button
            onClick={onClose}
            className="text-[var(--vscode-foreground)] hover:text-[var(--vscode-errorForeground)] text-lg leading-none px-1"
          >
            &times;
          </button>
        </div>

        {/* Tabs + Search */}
        <div className="px-4 pt-2 pb-1 border-b border-[var(--vscode-panel-border)]">
          <div className="flex items-center gap-4 mb-2">
            <button
              onClick={() => setTab('installed')}
              className={`text-xs font-medium pb-1 border-b-2 transition-colors ${
                tab === 'installed'
                  ? 'border-[var(--vscode-focusBorder)] text-[var(--vscode-foreground)]'
                  : 'border-transparent text-[var(--vscode-descriptionForeground)] hover:text-[var(--vscode-foreground)]'
              }`}
            >
              Installed ({plugins.length})
            </button>
            <button
              onClick={() => setTab('marketplace')}
              className={`text-xs font-medium pb-1 border-b-2 transition-colors ${
                tab === 'marketplace'
                  ? 'border-[var(--vscode-focusBorder)] text-[var(--vscode-foreground)]'
                  : 'border-transparent text-[var(--vscode-descriptionForeground)] hover:text-[var(--vscode-foreground)]'
              }`}
            >
              Marketplace
            </button>
          </div>
          <input
            type="text"
            placeholder={tab === 'installed' ? 'Search installed plugins...' : 'Search marketplace...'}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-2 py-1.5 text-xs rounded bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] border border-[var(--vscode-input-border)] placeholder-[var(--vscode-input-placeholderForeground)]"
          />
        </div>

        {/* Content */}
        <div className="flex flex-1 overflow-hidden">
          <div className="flex-1 overflow-y-auto">
            {tab === 'installed' ? (
              filteredPlugins.length === 0 ? (
                <div className="px-4 py-8 text-center text-xs text-[var(--vscode-descriptionForeground)]">
                  {plugins.length === 0
                    ? 'No plugins installed. Browse the marketplace to get started.'
                    : 'No plugins match your search.'}
                </div>
              ) : (
                <ul className="divide-y divide-[var(--vscode-panel-border)]">
                  {filteredPlugins.map((plugin) => (
                    <li
                      key={plugin.name}
                      className={`px-4 py-2.5 cursor-pointer hover:bg-[var(--vscode-list-hoverBackground)] ${
                        selectedPlugin?.name === plugin.name ? 'bg-[var(--vscode-list-activeSelectionBackground)]' : ''
                      }`}
                      onClick={() => setSelectedPlugin(plugin)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 min-w-0">
                          <StatusIndicator status={plugin.status} />
                          <span className="text-xs font-medium text-[var(--vscode-foreground)] truncate">
                            {plugin.name}
                          </span>
                          <span className="text-[10px] text-[var(--vscode-descriptionForeground)]">
                            v{plugin.version}
                          </span>
                          <ScopeBadge scope={plugin.scope} />
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggle(plugin.name, plugin.status);
                          }}
                          className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${
                            plugin.status === 'enabled'
                              ? 'border-green-400/30 text-green-400 hover:bg-green-400/10'
                              : 'border-[var(--vscode-panel-border)] text-[var(--vscode-descriptionForeground)] hover:bg-[var(--vscode-list-hoverBackground)]'
                          }`}
                        >
                          {plugin.status === 'enabled' ? 'Enabled' : 'Disabled'}
                        </button>
                      </div>
                      <p className="text-[11px] text-[var(--vscode-descriptionForeground)] mt-0.5 truncate">
                        {plugin.description}
                      </p>
                      {plugin.error && (
                        <p className="text-[10px] text-[var(--vscode-errorForeground)] mt-0.5">{plugin.error}</p>
                      )}
                    </li>
                  ))}
                </ul>
              )
            ) : (
              filteredMarketplace.length === 0 ? (
                <div className="px-4 py-8 text-center text-xs text-[var(--vscode-descriptionForeground)]">
                  {marketplace.length === 0
                    ? 'No marketplace sources configured. Add one in .claude/settings.json (extraKnownMarketplaces).'
                    : 'No plugins match your search.'}
                </div>
              ) : (
                <ul className="divide-y divide-[var(--vscode-panel-border)]">
                  {filteredMarketplace.map((plugin) => (
                    <li key={plugin.name} className="px-4 py-2.5">
                      <div className="flex items-center justify-between">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-medium text-[var(--vscode-foreground)]">{plugin.name}</span>
                            <span className="text-[10px] text-[var(--vscode-descriptionForeground)]">v{plugin.version}</span>
                            {plugin.author && (
                              <span className="text-[10px] text-[var(--vscode-descriptionForeground)]">by {plugin.author}</span>
                            )}
                          </div>
                          <p className="text-[11px] text-[var(--vscode-descriptionForeground)] mt-0.5">{plugin.description}</p>
                        </div>
                        {plugin.installed ? (
                          <span className="text-[10px] px-2 py-0.5 rounded bg-green-400/20 text-green-400">Installed</span>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <select
                              value={installScope}
                              onChange={(e) => setInstallScope(e.target.value as InstallScope)}
                              className="text-[10px] px-1 py-0.5 rounded bg-[var(--vscode-dropdown-background)] text-[var(--vscode-dropdown-foreground)] border border-[var(--vscode-dropdown-border)]"
                            >
                              <option value="user">User</option>
                              <option value="project">Project</option>
                              <option value="local">Local</option>
                            </select>
                            <button
                              onClick={() => handleInstall(plugin.name)}
                              className="text-[10px] px-2 py-0.5 rounded bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] hover:bg-[var(--vscode-button-hoverBackground)]"
                            >
                              Install
                            </button>
                          </div>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )
            )}
          </div>

          {/* Detail panel */}
          {selectedPlugin && tab === 'installed' && (
            <div className="w-[220px] border-l border-[var(--vscode-panel-border)] p-3 overflow-y-auto">
              <h3 className="text-xs font-semibold text-[var(--vscode-foreground)] mb-2">{selectedPlugin.name}</h3>
              <div className="space-y-2 text-[11px] text-[var(--vscode-descriptionForeground)]">
                <div><span className="font-medium">Version:</span> {selectedPlugin.version}</div>
                <div><span className="font-medium">Scope:</span> <ScopeBadge scope={selectedPlugin.scope} /></div>
                <div>
                  <span className="font-medium">Status:</span>{' '}
                  <span className={selectedPlugin.status === 'enabled' ? 'text-green-400' : selectedPlugin.status === 'error' ? 'text-red-400' : ''}>
                    {selectedPlugin.status}
                  </span>
                </div>
                {selectedPlugin.author && <div><span className="font-medium">Author:</span> {selectedPlugin.author}</div>}
                <p className="mt-1">{selectedPlugin.description}</p>
                {selectedPlugin.commands && selectedPlugin.commands.length > 0 && (
                  <div className="mt-2">
                    <div className="font-medium mb-0.5">Commands:</div>
                    <ul className="ml-2 space-y-0.5">
                      {selectedPlugin.commands.map((cmd) => (
                        <li key={cmd} className="font-mono text-[10px]">/{cmd}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {selectedPlugin.agents && selectedPlugin.agents.length > 0 && (
                  <div className="mt-2">
                    <div className="font-medium mb-0.5">Agents:</div>
                    <ul className="ml-2 space-y-0.5">
                      {selectedPlugin.agents.map((agent) => (
                        <li key={agent} className="text-[10px]">{agent}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {selectedPlugin.homepage && (
                  <a href={selectedPlugin.homepage} className="block mt-2 text-[10px] text-[var(--vscode-textLink-foreground)] hover:underline">
                    Homepage
                  </a>
                )}
                <div className="mt-3 pt-2 border-t border-[var(--vscode-panel-border)]">
                  <button
                    onClick={() => handleUninstall(selectedPlugin.name)}
                    className="text-[10px] px-2 py-1 rounded border border-[var(--vscode-errorForeground)] text-[var(--vscode-errorForeground)] hover:bg-[var(--vscode-errorForeground)]/10 w-full"
                  >
                    Uninstall
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-[var(--vscode-panel-border)] flex justify-between items-center">
          <button
            onClick={() => vscode.postMessage({ type: 'plugin_browse_marketplace' })}
            className="text-xs text-[var(--vscode-textLink-foreground)] hover:underline"
          >
            Manage marketplace sources
          </button>
          <button
            onClick={() => vscode.postMessage({ type: 'plugin_refresh' })}
            className="text-xs px-3 py-1 rounded border border-[var(--vscode-panel-border)] text-[var(--vscode-foreground)] hover:bg-[var(--vscode-list-hoverBackground)]"
          >
            Refresh
          </button>
        </div>
      </div>
    </div>
  );
}
