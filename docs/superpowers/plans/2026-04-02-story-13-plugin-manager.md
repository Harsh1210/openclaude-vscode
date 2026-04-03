# Story 13: Plugin Manager UI — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a PluginManager dialog that shows installed plugins with enable/disable toggles, a marketplace browser, and plugin detail views. The CLI owns all plugin logic — the extension only renders state and relays actions.

**Architecture:** The PluginManager is a webview dialog that receives plugin state from the host (which queries the CLI). User actions (enable/disable, install, uninstall) are sent back to the host, which forwards them as CLI control requests (`reload_plugins`) or slash commands (`/plugins`, `/plugin`). Plugin install scopes (user, project, local) are presented as options in the install flow.

**Tech Stack:** TypeScript 5.x, React 18, Tailwind CSS 3, VS Code Extension API, Vitest

**Spec:** [2026-04-02-openclaude-vscode-extension-design.md](../specs/2026-04-02-openclaude-vscode-extension-design.md) — Story 13, Sections 3.4, 4.7 (plugins settings), 5.1

**Depends on:** Story 4 (Chat UI — webview infrastructure, postMessage bridge)

---

## File Structure

| File | Responsibility |
|---|---|
| `src/plugins/types.ts` | Plugin data types, install scopes, protocol messages |
| `src/plugins/pluginBridge.ts` | Host-side bridge: query CLI for plugin state, relay actions |
| `webview/src/components/dialogs/PluginManager.tsx` | Main dialog: tabs for Installed / Marketplace, detail panel |
| `test/unit/pluginBridge.test.ts` | Unit tests for plugin state normalization and action building |
| `src/extension.ts` | Register `openclaude.installPlugin` command, wire plugin messages |

---

## Task 1: Plugin Types and Host Bridge

**Files:**
- Create: `src/plugins/types.ts`
- Create: `src/plugins/pluginBridge.ts`
- Create: `test/unit/pluginBridge.test.ts`

- [ ] **Step 1: Create plugin type definitions**

```typescript
// src/plugins/types.ts

/** Plugin install scope */
export type PluginScope = 'user' | 'project' | 'local';

/** Plugin status */
export type PluginStatus = 'enabled' | 'disabled' | 'error' | 'not-installed';

/** Plugin info from CLI */
export interface PluginInfo {
  name: string;
  version: string;
  description: string;
  scope: PluginScope;
  status: PluginStatus;
  commands?: string[];
  agents?: string[];
  author?: string;
  homepage?: string;
  error?: string;
}

/** Marketplace plugin entry */
export interface MarketplacePlugin {
  name: string;
  version: string;
  description: string;
  author: string;
  downloads?: number;
  rating?: number;
  homepage?: string;
  installed: boolean;
}

/** Marketplace source */
export interface MarketplaceSource {
  name: string;
  url: string;
  enabled: boolean;
}

/** Host → Webview: plugin state */
export interface PluginsStateMessage {
  type: 'plugins_state';
  installed: PluginInfo[];
  marketplace: MarketplacePlugin[];
  sources: MarketplaceSource[];
}

/** Webview → Host: plugin actions */
export type PluginAction =
  | { type: 'plugin_open_manager' }
  | { type: 'plugin_refresh' }
  | { type: 'plugin_toggle'; name: string; enabled: boolean }
  | { type: 'plugin_install'; name: string; scope: PluginScope }
  | { type: 'plugin_uninstall'; name: string }
  | { type: 'plugin_browse_marketplace'; source?: string }
  | { type: 'plugin_add_source'; url: string };
```

- [ ] **Step 2: Write unit tests for the plugin bridge**

```typescript
// test/unit/pluginBridge.test.ts
import { describe, it, expect, vi } from 'vitest';

describe('PluginBridge', () => {
  describe('normalizePluginState', () => {
    it('should normalize raw CLI plugin data into PluginInfo[]', async () => {
      const { normalizePluginState } = await import('../../src/plugins/pluginBridge');

      const rawPlugins = {
        'my-plugin': { version: '1.0.0', description: 'Test plugin', enabled: true, scope: 'user' },
        'disabled-plugin': { version: '0.5.0', description: 'Off', enabled: false, scope: 'project' },
      };

      const result = normalizePluginState(rawPlugins);

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('my-plugin');
      expect(result[0].status).toBe('enabled');
      expect(result[0].scope).toBe('user');
      expect(result[1].name).toBe('disabled-plugin');
      expect(result[1].status).toBe('disabled');
    });

    it('should handle empty plugin map', async () => {
      const { normalizePluginState } = await import('../../src/plugins/pluginBridge');
      expect(normalizePluginState({})).toEqual([]);
    });

    it('should mark errored plugins', async () => {
      const { normalizePluginState } = await import('../../src/plugins/pluginBridge');

      const rawPlugins = {
        'broken': { version: '1.0.0', description: 'Broken', enabled: true, scope: 'user', error: 'Load failed' },
      };

      const result = normalizePluginState(rawPlugins);
      expect(result[0].status).toBe('error');
      expect(result[0].error).toBe('Load failed');
    });
  });

  describe('buildToggleRequest', () => {
    it('should build a control request to reload plugins after toggle', async () => {
      const { buildToggleRequest } = await import('../../src/plugins/pluginBridge');

      const req = buildToggleRequest('my-plugin', false);

      expect(req.request.subtype).toBe('apply_flag_settings');
      expect(req.request.settings.enabledPlugins).toBeDefined();
    });
  });

  describe('buildInstallCommand', () => {
    it('should format install command with scope', async () => {
      const { buildInstallCommand } = await import('../../src/plugins/pluginBridge');

      expect(buildInstallCommand('cool-plugin', 'user')).toBe('/plugin install cool-plugin --scope user');
      expect(buildInstallCommand('cool-plugin', 'project')).toBe('/plugin install cool-plugin --scope project');
      expect(buildInstallCommand('cool-plugin', 'local')).toBe('/plugin install cool-plugin --scope local');
    });
  });
});
```

- [ ] **Step 3: Run tests and confirm failure**

Run: `cd /Users/harshagarwal/Documents/workspace/openclaude-vscode && npx vitest run test/unit/pluginBridge.test.ts 2>&1 | head -15`

Expected: Failures (module not found)

- [ ] **Step 4: Implement the plugin bridge**

```typescript
// src/plugins/pluginBridge.ts
import type { PluginInfo, PluginScope } from './types';

/** Raw plugin data from CLI (key = plugin name) */
interface RawPluginData {
  version: string;
  description: string;
  enabled: boolean;
  scope: string;
  commands?: string[];
  agents?: string[];
  author?: string;
  homepage?: string;
  error?: string;
}

/** Normalize raw CLI plugin data into typed PluginInfo array */
export function normalizePluginState(
  raw: Record<string, RawPluginData>,
): PluginInfo[] {
  return Object.entries(raw).map(([name, data]) => ({
    name,
    version: data.version,
    description: data.description,
    scope: (data.scope || 'user') as PluginScope,
    status: data.error ? 'error' : data.enabled ? 'enabled' : 'disabled',
    commands: data.commands,
    agents: data.agents,
    author: data.author,
    homepage: data.homepage,
    error: data.error,
  }));
}

/** Build a control request to toggle a plugin */
export function buildToggleRequest(
  pluginName: string,
  enabled: boolean,
): {
  type: string;
  request_id: string;
  request: { subtype: string; settings: { enabledPlugins: Record<string, boolean> } };
} {
  return {
    type: 'control_request',
    request_id: `plugin-toggle-${Date.now()}`,
    request: {
      subtype: 'apply_flag_settings',
      settings: {
        enabledPlugins: { [pluginName]: enabled },
      },
    },
  };
}

/** Build a slash command string for plugin installation */
export function buildInstallCommand(pluginName: string, scope: PluginScope): string {
  return `/plugin install ${pluginName} --scope ${scope}`;
}

/** Build a control request to reload all plugins */
export function buildReloadRequest(): {
  type: string;
  request_id: string;
  request: { subtype: string };
} {
  return {
    type: 'control_request',
    request_id: `plugin-reload-${Date.now()}`,
    request: { subtype: 'reload_plugins' },
  };
}
```

- [ ] **Step 5: Run tests and confirm PASS**

Run: `cd /Users/harshagarwal/Documents/workspace/openclaude-vscode && npx vitest run test/unit/pluginBridge.test.ts`

Expected: All tests pass

- [ ] **Step 6: Commit**

```bash
git add src/plugins/types.ts src/plugins/pluginBridge.ts test/unit/pluginBridge.test.ts
git commit -m "feat(plugins): add plugin types and host bridge with tests"
```

---

## Task 2: Build PluginManager Dialog

**Files:**
- Create: `webview/src/components/dialogs/PluginManager.tsx`

- [ ] **Step 1: Implement the PluginManager dialog**

```tsx
// webview/src/components/dialogs/PluginManager.tsx
import React, { useState, useEffect } from 'react';
import { vscode } from '../../vscode';

/** Plugin data (matches PluginInfo from host) */
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

  // Listen for plugin state updates from host
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

  // Request plugin state when dialog opens
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
    vscode.postMessage({
      type: 'plugin_install',
      name,
      scope: installScope,
    });
  };

  const handleUninstall = (name: string) => {
    vscode.postMessage({ type: 'plugin_uninstall', name });
  };

  // Filter plugins by search
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
          {/* Plugin list */}
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
              /* Marketplace tab */
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
                            <span className="text-[10px] text-[var(--vscode-descriptionForeground)]">
                              v{plugin.version}
                            </span>
                            {plugin.author && (
                              <span className="text-[10px] text-[var(--vscode-descriptionForeground)]">
                                by {plugin.author}
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-[var(--vscode-descriptionForeground)] mt-0.5">
                            {plugin.description}
                          </p>
                        </div>
                        {plugin.installed ? (
                          <span className="text-[10px] px-2 py-0.5 rounded bg-green-400/20 text-green-400">
                            Installed
                          </span>
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

          {/* Detail panel (when a plugin is selected) */}
          {selectedPlugin && tab === 'installed' && (
            <div className="w-[220px] border-l border-[var(--vscode-panel-border)] p-3 overflow-y-auto">
              <h3 className="text-xs font-semibold text-[var(--vscode-foreground)] mb-2">{selectedPlugin.name}</h3>
              <div className="space-y-2 text-[11px] text-[var(--vscode-descriptionForeground)]">
                <div>
                  <span className="font-medium">Version:</span> {selectedPlugin.version}
                </div>
                <div>
                  <span className="font-medium">Scope:</span> <ScopeBadge scope={selectedPlugin.scope} />
                </div>
                <div>
                  <span className="font-medium">Status:</span>{' '}
                  <span className={selectedPlugin.status === 'enabled' ? 'text-green-400' : selectedPlugin.status === 'error' ? 'text-red-400' : ''}>
                    {selectedPlugin.status}
                  </span>
                </div>
                {selectedPlugin.author && (
                  <div>
                    <span className="font-medium">Author:</span> {selectedPlugin.author}
                  </div>
                )}
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
                  <a
                    href={selectedPlugin.homepage}
                    className="block mt-2 text-[10px] text-[var(--vscode-textLink-foreground)] hover:underline"
                  >
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

        {/* Footer with Add Source */}
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
```

- [ ] **Step 2: Build webview to verify**

Run: `cd /Users/harshagarwal/Documents/workspace/openclaude-vscode && npm run build:webview`

Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add webview/src/components/dialogs/PluginManager.tsx
git commit -m "feat(plugins): add plugin manager dialog with installed/marketplace tabs"
```

---

## Task 3: Wire Plugin Actions in Extension Host

**Files:**
- Modify: `src/extension.ts`

- [ ] **Step 1: Register the openclaude.installPlugin command and handle webview plugin messages**

Add to `src/extension.ts`:

```typescript
// ── In activate() ────────────────────────────────────────────────

import { normalizePluginState, buildToggleRequest, buildInstallCommand, buildReloadRequest } from './plugins/pluginBridge';

// Replace the placeholder openclaude.installPlugin command
const installPluginCmd = vscode.commands.registerCommand('openclaude.installPlugin', () => {
  // Tell the active webview to open the plugin manager
  activeWebview?.postMessage({ type: 'open_plugin_manager' });
});
context.subscriptions.push(installPluginCmd);

// ── Handle plugin webview messages ───────────────────────────────

function handlePluginWebviewMessage(
  message: { type: string; [key: string]: unknown },
  processManager: { sendControlRequest: (req: unknown) => void; sendUserMessage: (msg: string) => void } | null,
  webview: vscode.Webview,
) {
  switch (message.type) {
    case 'plugin_refresh': {
      // Request plugin state via CLI control request
      processManager?.sendControlRequest({
        type: 'control_request',
        request_id: `plugin-state-${Date.now()}`,
        request: { subtype: 'get_settings' },
      });
      // The response will contain enabledPlugins; normalize and post to webview
      // This is handled in the control_response handler below
      break;
    }

    case 'plugin_toggle': {
      const req = buildToggleRequest(message.name as string, message.enabled as boolean);
      processManager?.sendControlRequest(req);
      // Then reload plugins to apply
      processManager?.sendControlRequest(buildReloadRequest());
      break;
    }

    case 'plugin_install': {
      // Send as slash command — CLI handles all install logic
      const command = buildInstallCommand(message.name as string, message.scope as 'user' | 'project' | 'local');
      processManager?.sendUserMessage(command);
      break;
    }

    case 'plugin_uninstall': {
      // Send as slash command
      processManager?.sendUserMessage(`/plugin uninstall ${message.name}`);
      break;
    }

    case 'plugin_browse_marketplace': {
      // Send as slash command to list available plugins
      processManager?.sendUserMessage('/plugins');
      break;
    }

    case 'plugin_add_source': {
      // Open settings.json for manual editing (marketplace sources are in settings)
      vscode.commands.executeCommand('workbench.action.openSettingsJson');
      break;
    }
  }
}
```

- [ ] **Step 2: Handle CLI control_response to populate plugin state in webview**

```typescript
// In the control_response handler (from Story 2's ControlRouter):

// When we receive a get_settings response that contains plugin data:
function handlePluginSettingsResponse(
  response: Record<string, unknown>,
  webview: vscode.Webview,
) {
  const settings = response as { enabledPlugins?: Record<string, unknown> };
  if (settings.enabledPlugins) {
    const installed = normalizePluginState(settings.enabledPlugins as Record<string, {
      version: string;
      description: string;
      enabled: boolean;
      scope: string;
      commands?: string[];
      agents?: string[];
      author?: string;
      homepage?: string;
      error?: string;
    }>);

    webview.postMessage({
      type: 'plugins_state',
      installed,
      marketplace: [], // Marketplace data comes from /plugins command output
      sources: [],
    });
  }
}
```

- [ ] **Step 3: Build and verify**

Run: `cd /Users/harshagarwal/Documents/workspace/openclaude-vscode && npm run build`

Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add src/extension.ts
git commit -m "feat(plugins): wire plugin manager actions through extension host"
```

---

## Final Verification

- [ ] Run: `npm run build`
- [ ] Run: `npx vitest run test/unit/pluginBridge.test.ts`
- [ ] Manual: F5 launch → `openclaude.installPlugin` command opens Plugin Manager dialog
- [ ] Manual: verify Installed tab shows plugin list with enable/disable toggles
- [ ] Manual: verify Marketplace tab shows available plugins with scope selector
- [ ] Manual: verify `/plugins` and `/plugin` commands in chat output render correctly
