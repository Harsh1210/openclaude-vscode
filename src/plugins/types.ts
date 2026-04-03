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
