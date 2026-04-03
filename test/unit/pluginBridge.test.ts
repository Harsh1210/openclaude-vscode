import { describe, it, expect } from 'vitest';

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
