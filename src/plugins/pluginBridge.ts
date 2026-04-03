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
