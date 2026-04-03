import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AuthManager, type ProviderUpdateInput } from '../../src/auth/authManager';
import type { SettingsSync } from '../../src/settings/settingsSync';

function makeSettings(overrides: Partial<SettingsSync> = {}): SettingsSync {
  return {
    selectedProvider: 'anthropic',
    selectedModel: undefined,
    apiKey: undefined,
    baseUrl: undefined,
    environmentVariables: [],
    setProvider: vi.fn().mockResolvedValue(undefined),
    setModel: vi.fn().mockResolvedValue(undefined),
    setApiKey: vi.fn().mockResolvedValue(undefined),
    setBaseUrl: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as SettingsSync;
}

describe('AuthManager', () => {
  describe('getAvailableProviders', () => {
    it('returns all supported providers', () => {
      const manager = new AuthManager(makeSettings());
      const providers = manager.getAvailableProviders();
      const ids = providers.map((p) => p.id);
      expect(ids).toContain('anthropic');
      expect(ids).toContain('openai');
      expect(ids).toContain('ollama');
      expect(ids).toContain('gemini');
      expect(ids).toContain('custom');
    });
  });

  describe('buildProcessEnv — anthropic', () => {
    it('sets ANTHROPIC_API_KEY', () => {
      const manager = new AuthManager(makeSettings({ selectedProvider: 'anthropic', apiKey: 'sk-ant-test' }));
      const env = manager.buildProcessEnv();
      expect(env['ANTHROPIC_API_KEY']).toBe('sk-ant-test');
      expect(env['CLAUDE_CODE_USE_OPENAI']).toBeUndefined();
    });
  });

  describe('buildProcessEnv — openai', () => {
    it('sets OPENAI_API_KEY and CLAUDE_CODE_USE_OPENAI', () => {
      const manager = new AuthManager(makeSettings({ selectedProvider: 'openai', apiKey: 'sk-openai-test' }));
      const env = manager.buildProcessEnv();
      expect(env['OPENAI_API_KEY']).toBe('sk-openai-test');
      expect(env['CLAUDE_CODE_USE_OPENAI']).toBe('1');
    });

    it('sets OPENAI_BASE_URL when provided', () => {
      const manager = new AuthManager(makeSettings({
        selectedProvider: 'openai',
        apiKey: 'sk-openai-test',
        baseUrl: 'https://api.openai.com/v1',
      }));
      const env = manager.buildProcessEnv();
      expect(env['OPENAI_BASE_URL']).toBe('https://api.openai.com/v1');
    });
  });

  describe('buildProcessEnv — ollama', () => {
    it('uses default localhost base URL and ollama api key', () => {
      const manager = new AuthManager(makeSettings({ selectedProvider: 'ollama' }));
      const env = manager.buildProcessEnv();
      expect(env['OPENAI_BASE_URL']).toBe('http://localhost:11434/v1');
      expect(env['OPENAI_API_KEY']).toBe('ollama');
      expect(env['CLAUDE_CODE_USE_OPENAI']).toBe('1');
    });

    it('allows custom base URL override', () => {
      const manager = new AuthManager(makeSettings({ selectedProvider: 'ollama', baseUrl: 'http://myhost:11434/v1' }));
      const env = manager.buildProcessEnv();
      expect(env['OPENAI_BASE_URL']).toBe('http://myhost:11434/v1');
    });
  });

  describe('buildProcessEnv — gemini', () => {
    it('sets OPENAI_API_KEY, OPENAI_BASE_URL, and CLAUDE_CODE_USE_OPENAI', () => {
      const manager = new AuthManager(makeSettings({
        selectedProvider: 'gemini',
        apiKey: 'gemini-key',
        baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
      }));
      const env = manager.buildProcessEnv();
      expect(env['OPENAI_API_KEY']).toBe('gemini-key');
      expect(env['OPENAI_BASE_URL']).toBe('https://generativelanguage.googleapis.com/v1beta/openai');
      expect(env['CLAUDE_CODE_USE_OPENAI']).toBe('1');
    });
  });

  describe('buildProcessEnv — custom', () => {
    it('sets OPENAI_API_KEY, OPENAI_BASE_URL, and CLAUDE_CODE_USE_OPENAI', () => {
      const manager = new AuthManager(makeSettings({
        selectedProvider: 'custom',
        apiKey: 'custom-key',
        baseUrl: 'https://my-llm.example.com/v1',
      }));
      const env = manager.buildProcessEnv();
      expect(env['OPENAI_API_KEY']).toBe('custom-key');
      expect(env['OPENAI_BASE_URL']).toBe('https://my-llm.example.com/v1');
      expect(env['CLAUDE_CODE_USE_OPENAI']).toBe('1');
    });
  });

  describe('buildProcessEnv — merges user env vars', () => {
    it('includes user-configured environment variables', () => {
      const manager = new AuthManager(makeSettings({
        selectedProvider: 'anthropic',
        apiKey: 'sk-ant-test',
        environmentVariables: [{ name: 'MY_VAR', value: 'hello' }],
      }));
      const env = manager.buildProcessEnv();
      expect(env['MY_VAR']).toBe('hello');
      expect(env['ANTHROPIC_API_KEY']).toBe('sk-ant-test');
    });
  });

  describe('validate', () => {
    it('passes for anthropic with api key', () => {
      const manager = new AuthManager(makeSettings());
      const result = manager.validate({ providerId: 'anthropic', apiKey: 'sk-ant-test' });
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('fails for anthropic without api key', () => {
      const manager = new AuthManager(makeSettings());
      const result = manager.validate({ providerId: 'anthropic', apiKey: '' });
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('passes for ollama without api key (not required)', () => {
      const manager = new AuthManager(makeSettings());
      const result = manager.validate({ providerId: 'ollama' });
      expect(result.valid).toBe(true);
    });

    it('fails for custom without base URL', () => {
      const manager = new AuthManager(makeSettings());
      const result = manager.validate({ providerId: 'custom', apiKey: 'key', baseUrl: '' });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => /base url/i.test(e))).toBe(true);
    });

    it('fails for unknown provider', () => {
      const manager = new AuthManager(makeSettings());
      const result = manager.validate({ providerId: 'unknown-provider' });
      expect(result.valid).toBe(false);
    });
  });

  describe('updateProvider', () => {
    it('calls settings setters with provided values', async () => {
      const settings = makeSettings();
      const manager = new AuthManager(settings);
      await manager.updateProvider({ providerId: 'openai', apiKey: 'sk-new', model: 'gpt-4o' });
      expect(settings.setProvider).toHaveBeenCalledWith('openai');
      expect(settings.setApiKey).toHaveBeenCalledWith('sk-new');
      expect(settings.setModel).toHaveBeenCalledWith('gpt-4o');
    });
  });
});
