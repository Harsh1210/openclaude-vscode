# Story 11: Provider Picker & Auth — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a provider selection UI that lets users pick from 8 supported LLM providers, configure API keys and endpoints, validate credentials, and inject the correct environment variables when spawning the CLI. Add an AuthManager for login/logout, a SettingsSync module that reads VS Code settings and maps them to CLI env vars, and a ProviderPicker dialog in the webview.

**Architecture:** The `AuthManager` (extension host) manages provider credentials via VS Code's `SecretStorage` API for API keys and `workspace.getConfiguration` for non-sensitive settings. `SettingsSync` reads the selected provider + credentials and produces an `env` record that `ProcessManager` injects at spawn. The webview `ProviderPicker` dialog renders all 8 providers with their required fields, validates keys with a test request, and saves via `postMessage` to the host. The `/provider` slash command is handled entirely by the CLI; the extension just renders the CLI output.

**Tech Stack:** TypeScript 5.x, VS Code Extension API (`SecretStorage`, `workspace.getConfiguration`), React 18, Tailwind CSS 3, Vitest

**Spec:** [2026-04-02-openclaude-vscode-extension-design.md](../specs/2026-04-02-openclaude-vscode-extension-design.md) — Story 11, Sections 2.2, 4.3

**CLI Provider Source:** `openclaude/src/utils/model/providers.ts` — `APIProvider` type and `getAPIProvider()` logic

**Depends on:** Story 4 (chat UI), Story 2 (ProcessManager with env injection)

---

## File Structure

| File | Responsibility |
|---|---|
| `src/auth/authManager.ts` | Manage provider credentials (SecretStorage for keys, settings for provider selection) |
| `src/settings/settingsSync.ts` | Map VS Code settings + credentials to CLI env vars for spawn |
| `test/unit/authManager.test.ts` | Unit tests for AuthManager |
| `test/unit/settingsSync.test.ts` | Unit tests for SettingsSync env var building |
| `webview/src/components/dialogs/ProviderPicker.tsx` | Provider selection dialog with API key input, validation, Ollama detection |
| `src/webview/types.ts` | Add provider-related postMessage types (modify existing) |
| `src/extension.ts` | Wire AuthManager, SettingsSync, and provider commands (modify existing) |
| `src/process/processManager.ts` | Consume SettingsSync env output (modify existing, minimal) |

---

## Task 1: Define Provider Configuration Types

**Files:**
- Modify: `src/webview/types.ts` (or create `src/types/providers.ts` if types.ts doesn't exist yet)

- [ ] **Step 1: Create provider type definitions**

Create `src/types/providers.ts`:

```typescript
// src/types/providers.ts
//
// Provider configuration types for the 8 supported LLM providers.
//
// Source of truth for env var names: openclaude/src/utils/model/providers.ts
// The CLI reads these env vars at startup to determine the provider.

// ============================================================================
// Provider Registry
// ============================================================================

/**
 * Supported provider IDs.
 * Maps to the CLI's APIProvider type + OpenClaude's OpenAI-compatible shim.
 */
export type ProviderId =
  | 'anthropic'    // firstParty — Anthropic API direct
  | 'openai'       // openai — OpenAI API (GPT-4o, etc.)
  | 'gemini'       // gemini — Google Gemini API
  | 'bedrock'      // bedrock — AWS Bedrock
  | 'vertex'       // vertex — Google Cloud Vertex AI
  | 'ollama'       // openai shim with Ollama base URL
  | 'openrouter'   // openai shim with OpenRouter base URL
  | 'custom'       // openai shim with user-specified base URL
  ;

/**
 * Environment variables required for each provider.
 * The SettingsSync module reads these and injects them into ProcessManager.spawn().
 */
export interface ProviderEnvConfig {
  /** The toggle env var that tells the CLI which provider to use */
  toggleVar?: string;
  /** The value to set for the toggle var (default: '1') */
  toggleValue?: string;
  /** API key env var name */
  apiKeyVar?: string;
  /** Model env var name */
  modelVar?: string;
  /** Base URL env var name */
  baseUrlVar?: string;
  /** Additional env vars */
  extraVars?: Record<string, string>;
}

export interface ProviderDefinition {
  id: ProviderId;
  name: string;
  description: string;
  /** URL of the provider's API key page */
  apiKeyUrl?: string;
  /** Env var configuration */
  env: ProviderEnvConfig;
  /** Fields the user needs to fill in */
  requiredFields: ProviderField[];
  /** Default model suggestion */
  defaultModel?: string;
  /** Whether this provider supports auto-detection (e.g., Ollama) */
  autoDetectable?: boolean;
  /** Icon codicon name or inline SVG */
  icon?: string;
}

export interface ProviderField {
  key: string;
  label: string;
  type: 'apiKey' | 'text' | 'url';
  placeholder: string;
  required: boolean;
  /** Help text shown below the field */
  helpText?: string;
}

/**
 * User's saved credentials for a provider.
 * API keys are stored in VS Code SecretStorage (encrypted).
 * Other fields are stored in VS Code settings.
 */
export interface ProviderCredentials {
  providerId: ProviderId;
  apiKey?: string;
  model?: string;
  baseUrl?: string;
  extraVars?: Record<string, string>;
}

/**
 * Validation result from testing an API key.
 */
export interface ProviderValidationResult {
  valid: boolean;
  error?: string;
  modelName?: string;
}

// ============================================================================
// Provider Registry — All 8 Providers
// ============================================================================

export const PROVIDER_REGISTRY: ProviderDefinition[] = [
  {
    id: 'anthropic',
    name: 'Anthropic',
    description: 'Claude models via the Anthropic API',
    apiKeyUrl: 'https://console.anthropic.com/settings/keys',
    env: {
      // No toggle var — firstParty is the default
      apiKeyVar: 'ANTHROPIC_API_KEY',
    },
    requiredFields: [
      {
        key: 'apiKey',
        label: 'API Key',
        type: 'apiKey',
        placeholder: 'sk-ant-...',
        required: true,
        helpText: 'Get your key at console.anthropic.com',
      },
      {
        key: 'model',
        label: 'Model',
        type: 'text',
        placeholder: 'claude-sonnet-4-20250514',
        required: false,
        helpText: 'Leave empty for default model',
      },
    ],
    defaultModel: 'claude-sonnet-4-20250514',
    icon: 'sparkle',
  },
  {
    id: 'openai',
    name: 'OpenAI',
    description: 'GPT-4o, GPT-4.1, and other OpenAI models',
    apiKeyUrl: 'https://platform.openai.com/api-keys',
    env: {
      toggleVar: 'CLAUDE_CODE_USE_OPENAI',
      apiKeyVar: 'OPENAI_API_KEY',
      modelVar: 'OPENAI_MODEL',
      baseUrlVar: 'OPENAI_BASE_URL',
    },
    requiredFields: [
      {
        key: 'apiKey',
        label: 'API Key',
        type: 'apiKey',
        placeholder: 'sk-...',
        required: true,
        helpText: 'Get your key at platform.openai.com',
      },
      {
        key: 'model',
        label: 'Model',
        type: 'text',
        placeholder: 'gpt-4o',
        required: false,
      },
    ],
    defaultModel: 'gpt-4o',
    icon: 'robot',
  },
  {
    id: 'gemini',
    name: 'Google Gemini',
    description: 'Gemini 2.5 Pro, Flash, and other Google models',
    apiKeyUrl: 'https://aistudio.google.com/apikey',
    env: {
      toggleVar: 'CLAUDE_CODE_USE_GEMINI',
      apiKeyVar: 'GEMINI_API_KEY',
      modelVar: 'GEMINI_MODEL',
    },
    requiredFields: [
      {
        key: 'apiKey',
        label: 'API Key',
        type: 'apiKey',
        placeholder: 'AIza...',
        required: true,
        helpText: 'Get your key at aistudio.google.com',
      },
      {
        key: 'model',
        label: 'Model',
        type: 'text',
        placeholder: 'gemini-2.5-pro',
        required: false,
      },
    ],
    defaultModel: 'gemini-2.5-pro',
    icon: 'beaker',
  },
  {
    id: 'bedrock',
    name: 'AWS Bedrock',
    description: 'Claude via AWS Bedrock (uses AWS credentials)',
    env: {
      toggleVar: 'CLAUDE_CODE_USE_BEDROCK',
      extraVars: {
        ANTHROPIC_BEDROCK_HOSTNAME: '',
      },
    },
    requiredFields: [
      {
        key: 'baseUrl',
        label: 'Bedrock Hostname',
        type: 'url',
        placeholder: 'bedrock-runtime.us-east-1.amazonaws.com',
        required: false,
        helpText: 'Uses AWS SDK credentials (AWS_ACCESS_KEY_ID, etc.)',
      },
      {
        key: 'model',
        label: 'Model',
        type: 'text',
        placeholder: 'anthropic.claude-sonnet-4-20250514-v1:0',
        required: false,
      },
    ],
    defaultModel: 'anthropic.claude-sonnet-4-20250514-v1:0',
    icon: 'cloud',
  },
  {
    id: 'vertex',
    name: 'Google Vertex AI',
    description: 'Claude via Google Cloud Vertex AI',
    env: {
      toggleVar: 'CLAUDE_CODE_USE_VERTEX',
      extraVars: {
        CLOUD_ML_REGION: '',
        ANTHROPIC_VERTEX_PROJECT_ID: '',
      },
    },
    requiredFields: [
      {
        key: 'extraVars.CLOUD_ML_REGION',
        label: 'Region',
        type: 'text',
        placeholder: 'us-east5',
        required: true,
        helpText: 'Google Cloud region for Vertex AI',
      },
      {
        key: 'extraVars.ANTHROPIC_VERTEX_PROJECT_ID',
        label: 'Project ID',
        type: 'text',
        placeholder: 'my-project-123',
        required: true,
      },
      {
        key: 'model',
        label: 'Model',
        type: 'text',
        placeholder: 'claude-sonnet-4@20250514',
        required: false,
      },
    ],
    defaultModel: 'claude-sonnet-4@20250514',
    icon: 'cloud',
  },
  {
    id: 'ollama',
    name: 'Ollama',
    description: 'Local models via Ollama (auto-detected)',
    env: {
      toggleVar: 'CLAUDE_CODE_USE_OPENAI',
      apiKeyVar: 'OPENAI_API_KEY',
      modelVar: 'OPENAI_MODEL',
      baseUrlVar: 'OPENAI_BASE_URL',
    },
    requiredFields: [
      {
        key: 'baseUrl',
        label: 'Ollama URL',
        type: 'url',
        placeholder: 'http://localhost:11434/v1',
        required: false,
        helpText: 'Default: http://localhost:11434/v1',
      },
      {
        key: 'model',
        label: 'Model',
        type: 'text',
        placeholder: 'qwen2.5-coder:32b',
        required: true,
        helpText: 'Must be pulled first: ollama pull <model>',
      },
    ],
    defaultModel: 'qwen2.5-coder:32b',
    autoDetectable: true,
    icon: 'server',
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    description: 'Access 200+ models via OpenRouter',
    apiKeyUrl: 'https://openrouter.ai/keys',
    env: {
      toggleVar: 'CLAUDE_CODE_USE_OPENAI',
      apiKeyVar: 'OPENAI_API_KEY',
      modelVar: 'OPENAI_MODEL',
      baseUrlVar: 'OPENAI_BASE_URL',
    },
    requiredFields: [
      {
        key: 'apiKey',
        label: 'API Key',
        type: 'apiKey',
        placeholder: 'sk-or-...',
        required: true,
        helpText: 'Get your key at openrouter.ai',
      },
      {
        key: 'model',
        label: 'Model',
        type: 'text',
        placeholder: 'anthropic/claude-sonnet-4',
        required: false,
      },
    ],
    defaultModel: 'anthropic/claude-sonnet-4',
    icon: 'globe',
  },
  {
    id: 'custom',
    name: 'Custom (OpenAI-compatible)',
    description: 'Any OpenAI-compatible API endpoint',
    env: {
      toggleVar: 'CLAUDE_CODE_USE_OPENAI',
      apiKeyVar: 'OPENAI_API_KEY',
      modelVar: 'OPENAI_MODEL',
      baseUrlVar: 'OPENAI_BASE_URL',
    },
    requiredFields: [
      {
        key: 'baseUrl',
        label: 'Base URL',
        type: 'url',
        placeholder: 'https://api.example.com/v1',
        required: true,
        helpText: 'OpenAI-compatible API endpoint',
      },
      {
        key: 'apiKey',
        label: 'API Key',
        type: 'apiKey',
        placeholder: 'sk-...',
        required: false,
        helpText: 'Leave empty if not required',
      },
      {
        key: 'model',
        label: 'Model',
        type: 'text',
        placeholder: 'my-model',
        required: true,
      },
    ],
    icon: 'settings-gear',
  },
];

/**
 * Look up a provider definition by ID.
 */
export function getProviderDefinition(id: ProviderId): ProviderDefinition | undefined {
  return PROVIDER_REGISTRY.find((p) => p.id === id);
}
```

- [ ] **Step 2: Verify build**

Run: `cd /Users/harshagarwal/Documents/workspace/openclaude-vscode && npm run build:extension`

Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/types/providers.ts
git commit -m "feat(provider): add provider type definitions and registry for 8 providers"
```

---

## Task 2: AuthManager — Tests First

**Files:**
- Create: `test/unit/authManager.test.ts`

- [ ] **Step 1: Write failing tests for AuthManager**

```typescript
// test/unit/authManager.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AuthManager } from '../../src/auth/authManager';
import type { ProviderId, ProviderCredentials } from '../../src/types/providers';

// Mock VS Code SecretStorage
function createMockSecretStorage() {
  const store = new Map<string, string>();
  return {
    get: vi.fn(async (key: string) => store.get(key)),
    store: vi.fn(async (key: string, value: string) => { store.set(key, value); }),
    delete: vi.fn(async (key: string) => { store.delete(key); }),
    onDidChange: vi.fn(),
    _store: store,
  };
}

// Mock VS Code workspace.getConfiguration
function createMockConfiguration() {
  const settings = new Map<string, unknown>();
  return {
    get: vi.fn(<T>(key: string, defaultValue?: T) => settings.get(key) ?? defaultValue),
    update: vi.fn(async (key: string, value: unknown) => { settings.set(key, value); }),
    has: vi.fn((key: string) => settings.has(key)),
    inspect: vi.fn(),
    _settings: settings,
  };
}

describe('AuthManager', () => {
  let authManager: AuthManager;
  let secretStorage: ReturnType<typeof createMockSecretStorage>;
  let configuration: ReturnType<typeof createMockConfiguration>;

  beforeEach(() => {
    secretStorage = createMockSecretStorage();
    configuration = createMockConfiguration();
    authManager = new AuthManager(secretStorage as any, configuration as any);
  });

  // =========================================================================
  // Provider selection
  // =========================================================================

  describe('getSelectedProvider / setSelectedProvider', () => {
    it('returns default provider when none set', async () => {
      const provider = authManager.getSelectedProvider();
      expect(provider).toBe('openai'); // Default per spec
    });

    it('saves selected provider to VS Code settings', async () => {
      await authManager.setSelectedProvider('gemini');
      expect(configuration.update).toHaveBeenCalledWith(
        'selectedProvider',
        'gemini',
        expect.anything(),
      );
    });

    it('reads selected provider from VS Code settings', () => {
      configuration._settings.set('selectedProvider', 'ollama');
      expect(authManager.getSelectedProvider()).toBe('ollama');
    });
  });

  // =========================================================================
  // Credential storage
  // =========================================================================

  describe('saveCredentials / getCredentials', () => {
    it('stores API key in SecretStorage', async () => {
      await authManager.saveCredentials({
        providerId: 'openai',
        apiKey: 'sk-test-key',
        model: 'gpt-4o',
      });
      expect(secretStorage.store).toHaveBeenCalledWith(
        'openclaude.apiKey.openai',
        'sk-test-key',
      );
    });

    it('stores non-sensitive fields in VS Code settings', async () => {
      await authManager.saveCredentials({
        providerId: 'openai',
        apiKey: 'sk-test-key',
        model: 'gpt-4o',
        baseUrl: 'https://api.example.com/v1',
      });
      expect(configuration.update).toHaveBeenCalledWith(
        'providerModel.openai',
        'gpt-4o',
        expect.anything(),
      );
      expect(configuration.update).toHaveBeenCalledWith(
        'providerBaseUrl.openai',
        'https://api.example.com/v1',
        expect.anything(),
      );
    });

    it('retrieves stored credentials', async () => {
      await authManager.saveCredentials({
        providerId: 'openai',
        apiKey: 'sk-test-key',
        model: 'gpt-4o',
      });
      const creds = await authManager.getCredentials('openai');
      expect(creds).toBeDefined();
      expect(creds!.apiKey).toBe('sk-test-key');
      expect(creds!.model).toBe('gpt-4o');
    });
  });

  // =========================================================================
  // Credential deletion (logout)
  // =========================================================================

  describe('clearCredentials', () => {
    it('removes API key from SecretStorage', async () => {
      await authManager.saveCredentials({
        providerId: 'openai',
        apiKey: 'sk-test-key',
      });
      await authManager.clearCredentials('openai');
      expect(secretStorage.delete).toHaveBeenCalledWith('openclaude.apiKey.openai');
    });
  });

  // =========================================================================
  // Ollama detection
  // =========================================================================

  describe('detectOllama', () => {
    it('returns true when Ollama is reachable', async () => {
      // This test requires a mock of the HTTP check — see implementation
      const result = await authManager.detectOllama('http://localhost:11434');
      // Result depends on whether Ollama is actually running, so we just
      // verify the method exists and returns a boolean
      expect(typeof result).toBe('boolean');
    });
  });

  // =========================================================================
  // API key validation
  // =========================================================================

  describe('validateApiKey', () => {
    it('returns valid result structure', async () => {
      const result = await authManager.validateApiKey('openai', 'sk-test');
      expect(result).toHaveProperty('valid');
      expect(typeof result.valid).toBe('boolean');
    });
  });

  // =========================================================================
  // hasCredentials
  // =========================================================================

  describe('hasCredentials', () => {
    it('returns false when no credentials stored', async () => {
      const has = await authManager.hasCredentials('openai');
      expect(has).toBe(false);
    });

    it('returns true when API key is stored', async () => {
      await authManager.saveCredentials({
        providerId: 'openai',
        apiKey: 'sk-test-key',
      });
      const has = await authManager.hasCredentials('openai');
      expect(has).toBe(true);
    });

    it('returns true for Ollama without API key (only needs base URL)', async () => {
      await authManager.saveCredentials({
        providerId: 'ollama',
        model: 'qwen2.5-coder:32b',
      });
      const has = await authManager.hasCredentials('ollama');
      expect(has).toBe(true);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/harshagarwal/Documents/workspace/openclaude-vscode && npx vitest run test/unit/authManager.test.ts`

Expected: FAIL — module `../../src/auth/authManager` does not exist.

- [ ] **Step 3: Commit test file**

```bash
git add test/unit/authManager.test.ts
git commit -m "test(auth): add failing tests for AuthManager"
```

---

## Task 3: Implement AuthManager

**Files:**
- Create: `src/auth/authManager.ts`

- [ ] **Step 1: Create AuthManager**

```typescript
// src/auth/authManager.ts
//
// Manages provider credentials using VS Code's SecretStorage (for API keys)
// and workspace.getConfiguration (for non-sensitive provider settings).
//
// Credentials are scoped per provider, so switching providers doesn't lose keys.
// The AuthManager does NOT spawn the CLI — it provides credentials to SettingsSync,
// which produces env vars for ProcessManager.

import type {
  ProviderId,
  ProviderCredentials,
  ProviderValidationResult,
} from '../types/providers';
import { getProviderDefinition, PROVIDER_REGISTRY } from '../types/providers';

// ============================================================================
// Types
// ============================================================================

/**
 * Subset of vscode.SecretStorage needed by AuthManager.
 * Defined as an interface so we can mock it in tests.
 */
export interface SecretStorageLike {
  get(key: string): Thenable<string | undefined>;
  store(key: string, value: string): Thenable<void>;
  delete(key: string): Thenable<void>;
}

/**
 * Subset of vscode.WorkspaceConfiguration needed by AuthManager.
 */
export interface ConfigurationLike {
  get<T>(key: string, defaultValue?: T): T | undefined;
  update(key: string, value: unknown, target?: unknown): Thenable<void>;
}

// Secret key prefix for VS Code SecretStorage
const SECRET_KEY_PREFIX = 'openclaude.apiKey.';

// ============================================================================
// AuthManager
// ============================================================================

export class AuthManager {
  private secrets: SecretStorageLike;
  private config: ConfigurationLike;

  constructor(secrets: SecretStorageLike, config: ConfigurationLike) {
    this.secrets = secrets;
    this.config = config;
  }

  // --------------------------------------------------------------------------
  // Provider selection
  // --------------------------------------------------------------------------

  /**
   * Get the currently selected provider ID.
   * Reads from VS Code setting `openclaudeCode.selectedProvider`.
   */
  getSelectedProvider(): ProviderId {
    const saved = this.config.get<string>('selectedProvider');
    if (saved && PROVIDER_REGISTRY.some((p) => p.id === saved)) {
      return saved as ProviderId;
    }
    return 'openai'; // Default per spec
  }

  /**
   * Set the selected provider. Saves to VS Code settings (global scope).
   */
  async setSelectedProvider(providerId: ProviderId): Promise<void> {
    // ConfigurationTarget.Global = 1
    await this.config.update('selectedProvider', providerId, 1);
  }

  // --------------------------------------------------------------------------
  // Credential storage
  // --------------------------------------------------------------------------

  /**
   * Save provider credentials.
   * API keys go to SecretStorage (encrypted). Other fields go to VS Code settings.
   */
  async saveCredentials(credentials: ProviderCredentials): Promise<void> {
    const { providerId, apiKey, model, baseUrl, extraVars } = credentials;

    // Store API key in encrypted SecretStorage
    if (apiKey) {
      await this.secrets.store(`${SECRET_KEY_PREFIX}${providerId}`, apiKey);
    }

    // Store non-sensitive fields in VS Code settings (global scope)
    if (model !== undefined) {
      await this.config.update(`providerModel.${providerId}`, model, 1);
    }
    if (baseUrl !== undefined) {
      await this.config.update(`providerBaseUrl.${providerId}`, baseUrl, 1);
    }
    if (extraVars) {
      await this.config.update(`providerExtraVars.${providerId}`, extraVars, 1);
    }
  }

  /**
   * Retrieve stored credentials for a provider.
   */
  async getCredentials(providerId: ProviderId): Promise<ProviderCredentials | undefined> {
    const apiKey = await this.secrets.get(`${SECRET_KEY_PREFIX}${providerId}`);
    const model = this.config.get<string>(`providerModel.${providerId}`);
    const baseUrl = this.config.get<string>(`providerBaseUrl.${providerId}`);
    const extraVars = this.config.get<Record<string, string>>(
      `providerExtraVars.${providerId}`,
    );

    // Return undefined only if absolutely nothing is stored
    if (!apiKey && !model && !baseUrl && !extraVars) {
      // Special case: Ollama and Bedrock/Vertex don't require API keys
      if (providerId === 'ollama' || providerId === 'bedrock' || providerId === 'vertex') {
        if (model) {
          return { providerId, model, baseUrl, extraVars };
        }
      }
      return undefined;
    }

    return {
      providerId,
      apiKey: apiKey ?? undefined,
      model: model ?? undefined,
      baseUrl: baseUrl ?? undefined,
      extraVars: extraVars ?? undefined,
    };
  }

  /**
   * Check if credentials exist for a provider.
   */
  async hasCredentials(providerId: ProviderId): Promise<boolean> {
    const apiKey = await this.secrets.get(`${SECRET_KEY_PREFIX}${providerId}`);

    // Ollama, Bedrock, Vertex don't always require API keys
    if (providerId === 'ollama') {
      const model = this.config.get<string>(`providerModel.${providerId}`);
      return !!model; // Ollama just needs a model name
    }
    if (providerId === 'bedrock' || providerId === 'vertex') {
      return true; // These use IAM/gcloud auth, not API keys
    }

    return !!apiKey;
  }

  /**
   * Clear all credentials for a provider (logout).
   */
  async clearCredentials(providerId: ProviderId): Promise<void> {
    await this.secrets.delete(`${SECRET_KEY_PREFIX}${providerId}`);
    await this.config.update(`providerModel.${providerId}`, undefined, 1);
    await this.config.update(`providerBaseUrl.${providerId}`, undefined, 1);
    await this.config.update(`providerExtraVars.${providerId}`, undefined, 1);
  }

  // --------------------------------------------------------------------------
  // Ollama detection
  // --------------------------------------------------------------------------

  /**
   * Check if Ollama is running at the given URL.
   * Makes a GET request to the Ollama API root endpoint.
   */
  async detectOllama(url = 'http://localhost:11434'): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);

      const response = await fetch(url, {
        method: 'GET',
        signal: controller.signal,
      });

      clearTimeout(timeout);
      return response.ok;
    } catch {
      return false;
    }
  }

  // --------------------------------------------------------------------------
  // API key validation
  // --------------------------------------------------------------------------

  /**
   * Validate an API key by making a lightweight test request.
   * Each provider has a different validation approach.
   */
  async validateApiKey(
    providerId: ProviderId,
    apiKey: string,
    baseUrl?: string,
  ): Promise<ProviderValidationResult> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      let url: string;
      let headers: Record<string, string>;
      let result: ProviderValidationResult;

      switch (providerId) {
        case 'anthropic': {
          // Test with Anthropic's /v1/messages endpoint (minimal request)
          url = 'https://api.anthropic.com/v1/messages';
          headers = {
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json',
          };
          const response = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify({
              model: 'claude-sonnet-4-20250514',
              max_tokens: 1,
              messages: [{ role: 'user', content: 'hi' }],
            }),
            signal: controller.signal,
          });
          clearTimeout(timeout);
          // 200 or 400 (invalid request but valid key) both mean the key works
          // 401 means invalid key
          if (response.status === 401) {
            result = { valid: false, error: 'Invalid API key' };
          } else {
            result = { valid: true };
          }
          break;
        }

        case 'openai':
        case 'openrouter':
        case 'custom': {
          // Test with /v1/models endpoint (list models — no generation cost)
          const baseEndpoint =
            providerId === 'openrouter'
              ? 'https://openrouter.ai/api'
              : baseUrl || 'https://api.openai.com';
          url = `${baseEndpoint}/v1/models`;
          headers = { Authorization: `Bearer ${apiKey}` };
          const response = await fetch(url, {
            method: 'GET',
            headers,
            signal: controller.signal,
          });
          clearTimeout(timeout);
          if (response.status === 401) {
            result = { valid: false, error: 'Invalid API key' };
          } else if (response.ok) {
            result = { valid: true };
          } else {
            result = { valid: false, error: `HTTP ${response.status}: ${response.statusText}` };
          }
          break;
        }

        case 'gemini': {
          // Test with Gemini's models list endpoint
          url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
          const response = await fetch(url, {
            method: 'GET',
            signal: controller.signal,
          });
          clearTimeout(timeout);
          if (response.status === 400 || response.status === 403) {
            result = { valid: false, error: 'Invalid API key' };
          } else if (response.ok) {
            result = { valid: true };
          } else {
            result = { valid: false, error: `HTTP ${response.status}` };
          }
          break;
        }

        case 'ollama': {
          // Ollama doesn't use API keys — just check if it's running
          clearTimeout(timeout);
          const isRunning = await this.detectOllama(baseUrl || 'http://localhost:11434');
          result = isRunning
            ? { valid: true }
            : { valid: false, error: 'Ollama not detected. Is it running?' };
          break;
        }

        case 'bedrock':
        case 'vertex': {
          // These use IAM/service account auth, not API keys
          // We can't easily validate without the full AWS/GCP SDK
          clearTimeout(timeout);
          result = { valid: true };
          break;
        }

        default:
          clearTimeout(timeout);
          result = { valid: false, error: `Unknown provider: ${providerId}` };
      }

      return result;
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        return { valid: false, error: 'Request timed out' };
      }
      return { valid: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  // --------------------------------------------------------------------------
  // Summary for UI
  // --------------------------------------------------------------------------

  /**
   * Get a summary of all providers with their credential status.
   * Used by the ProviderPicker dialog and the ProviderBadge component.
   */
  async getProviderSummaries(): Promise<
    Array<{
      id: ProviderId;
      name: string;
      hasCredentials: boolean;
      isSelected: boolean;
      model?: string;
    }>
  > {
    const selected = this.getSelectedProvider();
    const summaries = await Promise.all(
      PROVIDER_REGISTRY.map(async (provider) => ({
        id: provider.id,
        name: provider.name,
        hasCredentials: await this.hasCredentials(provider.id),
        isSelected: provider.id === selected,
        model: this.config.get<string>(`providerModel.${provider.id}`) ?? provider.defaultModel,
      })),
    );
    return summaries;
  }
}
```

- [ ] **Step 2: Run tests**

Run: `cd /Users/harshagarwal/Documents/workspace/openclaude-vscode && npx vitest run test/unit/authManager.test.ts`

Expected: Most tests PASS (Ollama detection and API validation tests may be environment-dependent).

- [ ] **Step 3: Commit**

```bash
git add src/auth/authManager.ts
git commit -m "feat(auth): implement AuthManager with SecretStorage and provider credentials"
```

---

## Task 4: SettingsSync — Tests First

**Files:**
- Create: `test/unit/settingsSync.test.ts`

- [ ] **Step 1: Write failing tests for SettingsSync**

```typescript
// test/unit/settingsSync.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SettingsSync } from '../../src/settings/settingsSync';
import type { ProviderId, ProviderCredentials } from '../../src/types/providers';

// Mock AuthManager
function createMockAuthManager(
  selectedProvider: ProviderId = 'openai',
  credentials: Partial<Record<ProviderId, ProviderCredentials>> = {},
) {
  return {
    getSelectedProvider: vi.fn(() => selectedProvider),
    getCredentials: vi.fn(async (id: ProviderId) => credentials[id] ?? undefined),
    hasCredentials: vi.fn(async (id: ProviderId) => !!credentials[id]),
  };
}

// Mock VS Code configuration for custom env vars
function createMockConfig(envVars: Record<string, string> = {}) {
  return {
    get: vi.fn(<T>(key: string, defaultValue?: T) => {
      if (key === 'environmentVariables') return envVars;
      return defaultValue;
    }),
  };
}

describe('SettingsSync', () => {
  // =========================================================================
  // OpenAI provider
  // =========================================================================

  describe('buildEnv — OpenAI', () => {
    it('sets CLAUDE_CODE_USE_OPENAI and OPENAI_API_KEY', async () => {
      const authManager = createMockAuthManager('openai', {
        openai: { providerId: 'openai', apiKey: 'sk-test', model: 'gpt-4o' },
      });
      const config = createMockConfig();
      const sync = new SettingsSync(authManager as any, config as any);

      const env = await sync.buildEnv();
      expect(env.CLAUDE_CODE_USE_OPENAI).toBe('1');
      expect(env.OPENAI_API_KEY).toBe('sk-test');
      expect(env.OPENAI_MODEL).toBe('gpt-4o');
    });

    it('includes OPENAI_BASE_URL when set', async () => {
      const authManager = createMockAuthManager('openai', {
        openai: {
          providerId: 'openai',
          apiKey: 'sk-test',
          model: 'gpt-4o',
          baseUrl: 'https://custom.api.com/v1',
        },
      });
      const config = createMockConfig();
      const sync = new SettingsSync(authManager as any, config as any);

      const env = await sync.buildEnv();
      expect(env.OPENAI_BASE_URL).toBe('https://custom.api.com/v1');
    });
  });

  // =========================================================================
  // Anthropic provider
  // =========================================================================

  describe('buildEnv — Anthropic', () => {
    it('sets ANTHROPIC_API_KEY only (no toggle var)', async () => {
      const authManager = createMockAuthManager('anthropic', {
        anthropic: { providerId: 'anthropic', apiKey: 'sk-ant-test' },
      });
      const config = createMockConfig();
      const sync = new SettingsSync(authManager as any, config as any);

      const env = await sync.buildEnv();
      expect(env.ANTHROPIC_API_KEY).toBe('sk-ant-test');
      expect(env.CLAUDE_CODE_USE_OPENAI).toBeUndefined();
      expect(env.CLAUDE_CODE_USE_GEMINI).toBeUndefined();
    });
  });

  // =========================================================================
  // Gemini provider
  // =========================================================================

  describe('buildEnv — Gemini', () => {
    it('sets CLAUDE_CODE_USE_GEMINI and GEMINI_API_KEY', async () => {
      const authManager = createMockAuthManager('gemini', {
        gemini: { providerId: 'gemini', apiKey: 'AIza-test', model: 'gemini-2.5-pro' },
      });
      const config = createMockConfig();
      const sync = new SettingsSync(authManager as any, config as any);

      const env = await sync.buildEnv();
      expect(env.CLAUDE_CODE_USE_GEMINI).toBe('1');
      expect(env.GEMINI_API_KEY).toBe('AIza-test');
      expect(env.GEMINI_MODEL).toBe('gemini-2.5-pro');
    });
  });

  // =========================================================================
  // Ollama provider
  // =========================================================================

  describe('buildEnv — Ollama', () => {
    it('sets OPENAI_BASE_URL to Ollama endpoint and dummy API key', async () => {
      const authManager = createMockAuthManager('ollama', {
        ollama: {
          providerId: 'ollama',
          model: 'qwen2.5-coder:32b',
          baseUrl: 'http://localhost:11434/v1',
        },
      });
      const config = createMockConfig();
      const sync = new SettingsSync(authManager as any, config as any);

      const env = await sync.buildEnv();
      expect(env.CLAUDE_CODE_USE_OPENAI).toBe('1');
      expect(env.OPENAI_BASE_URL).toBe('http://localhost:11434/v1');
      expect(env.OPENAI_MODEL).toBe('qwen2.5-coder:32b');
      // Ollama needs a dummy API key (OpenAI client requires one)
      expect(env.OPENAI_API_KEY).toBeDefined();
    });
  });

  // =========================================================================
  // Custom env vars merge
  // =========================================================================

  describe('buildEnv — custom env vars', () => {
    it('merges user-defined env vars from settings', async () => {
      const authManager = createMockAuthManager('openai', {
        openai: { providerId: 'openai', apiKey: 'sk-test' },
      });
      const config = createMockConfig({ MY_CUSTOM_VAR: 'hello' });
      const sync = new SettingsSync(authManager as any, config as any);

      const env = await sync.buildEnv();
      expect(env.MY_CUSTOM_VAR).toBe('hello');
    });

    it('provider vars take precedence over custom env vars', async () => {
      const authManager = createMockAuthManager('openai', {
        openai: { providerId: 'openai', apiKey: 'sk-real' },
      });
      const config = createMockConfig({ OPENAI_API_KEY: 'sk-custom' });
      const sync = new SettingsSync(authManager as any, config as any);

      const env = await sync.buildEnv();
      expect(env.OPENAI_API_KEY).toBe('sk-real'); // Provider wins
    });
  });

  // =========================================================================
  // Bedrock / Vertex providers
  // =========================================================================

  describe('buildEnv — Bedrock', () => {
    it('sets CLAUDE_CODE_USE_BEDROCK', async () => {
      const authManager = createMockAuthManager('bedrock', {
        bedrock: { providerId: 'bedrock' },
      });
      const config = createMockConfig();
      const sync = new SettingsSync(authManager as any, config as any);

      const env = await sync.buildEnv();
      expect(env.CLAUDE_CODE_USE_BEDROCK).toBe('1');
    });
  });

  describe('buildEnv — Vertex', () => {
    it('sets CLAUDE_CODE_USE_VERTEX and extra vars', async () => {
      const authManager = createMockAuthManager('vertex', {
        vertex: {
          providerId: 'vertex',
          extraVars: {
            CLOUD_ML_REGION: 'us-east5',
            ANTHROPIC_VERTEX_PROJECT_ID: 'proj-123',
          },
        },
      });
      const config = createMockConfig();
      const sync = new SettingsSync(authManager as any, config as any);

      const env = await sync.buildEnv();
      expect(env.CLAUDE_CODE_USE_VERTEX).toBe('1');
      expect(env.CLOUD_ML_REGION).toBe('us-east5');
      expect(env.ANTHROPIC_VERTEX_PROJECT_ID).toBe('proj-123');
    });
  });

  // =========================================================================
  // No credentials
  // =========================================================================

  describe('buildEnv — no credentials', () => {
    it('returns only base env when no credentials exist', async () => {
      const authManager = createMockAuthManager('openai', {});
      const config = createMockConfig();
      const sync = new SettingsSync(authManager as any, config as any);

      const env = await sync.buildEnv();
      // Toggle var should still be set so CLI knows the provider
      expect(env.CLAUDE_CODE_USE_OPENAI).toBe('1');
      // But no API key
      expect(env.OPENAI_API_KEY).toBeUndefined();
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/harshagarwal/Documents/workspace/openclaude-vscode && npx vitest run test/unit/settingsSync.test.ts`

Expected: FAIL — module `../../src/settings/settingsSync` does not exist.

- [ ] **Step 3: Commit test file**

```bash
git add test/unit/settingsSync.test.ts
git commit -m "test(settings): add failing tests for SettingsSync env var building"
```

---

## Task 5: Implement SettingsSync

**Files:**
- Create: `src/settings/settingsSync.ts`

- [ ] **Step 1: Create SettingsSync**

```typescript
// src/settings/settingsSync.ts
//
// Maps VS Code settings + provider credentials to environment variables
// for the CLI spawn. The ProcessManager calls settingsSync.buildEnv()
// and merges the result into its spawn env.
//
// Provider env var mapping is derived from:
// - openclaude/src/utils/model/providers.ts (getAPIProvider)
// - The PROVIDER_REGISTRY in src/types/providers.ts

import type { AuthManager } from '../auth/authManager';
import type { ConfigurationLike } from '../auth/authManager';
import { getProviderDefinition, type ProviderId } from '../types/providers';

// ============================================================================
// SettingsSync
// ============================================================================

export class SettingsSync {
  private authManager: AuthManager;
  private config: ConfigurationLike;

  constructor(authManager: AuthManager, config: ConfigurationLike) {
    this.authManager = authManager;
    this.config = config;
  }

  /**
   * Build the environment variable record to inject into the CLI spawn.
   *
   * Precedence (highest first):
   * 1. Provider-specific env vars (from AuthManager credentials)
   * 2. User-defined env vars (from openclaudeCode.environmentVariables setting)
   * 3. Existing process.env (handled by ProcessManager, not here)
   */
  async buildEnv(): Promise<Record<string, string>> {
    const env: Record<string, string> = {};

    // Layer 1: Custom env vars from VS Code settings
    const customEnvVars = this.config.get<Record<string, string>>(
      'environmentVariables',
      {},
    );
    if (customEnvVars && typeof customEnvVars === 'object') {
      Object.assign(env, customEnvVars);
    }

    // Layer 2: Provider-specific env vars (override custom vars)
    const providerId = this.authManager.getSelectedProvider();
    const providerDef = getProviderDefinition(providerId);

    if (providerDef) {
      // Set the toggle var (e.g., CLAUDE_CODE_USE_OPENAI=1)
      if (providerDef.env.toggleVar) {
        env[providerDef.env.toggleVar] = providerDef.env.toggleValue ?? '1';
      }

      // Get stored credentials
      const credentials = await this.authManager.getCredentials(providerId);

      if (credentials) {
        // API key
        if (credentials.apiKey && providerDef.env.apiKeyVar) {
          env[providerDef.env.apiKeyVar] = credentials.apiKey;
        }

        // Model
        if (credentials.model && providerDef.env.modelVar) {
          env[providerDef.env.modelVar] = credentials.model;
        }

        // Base URL
        if (credentials.baseUrl && providerDef.env.baseUrlVar) {
          env[providerDef.env.baseUrlVar] = credentials.baseUrl;
        }

        // Extra vars (e.g., CLOUD_ML_REGION for Vertex)
        if (credentials.extraVars) {
          Object.assign(env, credentials.extraVars);
        }
      }

      // Special case: Ollama needs a dummy API key for the OpenAI client
      if (providerId === 'ollama') {
        if (!env.OPENAI_API_KEY) {
          env.OPENAI_API_KEY = 'ollama'; // Dummy key — Ollama doesn't validate it
        }
        if (!env.OPENAI_BASE_URL) {
          env.OPENAI_BASE_URL = 'http://localhost:11434/v1'; // Default Ollama URL
        }
      }

      // Special case: OpenRouter always uses a fixed base URL
      if (providerId === 'openrouter') {
        env.OPENAI_BASE_URL = 'https://openrouter.ai/api/v1';
      }
    }

    return env;
  }

  /**
   * Get the display name and model for the current provider.
   * Used by the ProviderBadge component in the input footer.
   */
  getProviderDisplayInfo(): { providerName: string; model?: string } {
    const providerId = this.authManager.getSelectedProvider();
    const providerDef = getProviderDefinition(providerId);

    return {
      providerName: providerDef?.name ?? providerId,
      model: this.config.get<string>(`providerModel.${providerId}`) ?? providerDef?.defaultModel,
    };
  }
}
```

- [ ] **Step 2: Run tests**

Run: `cd /Users/harshagarwal/Documents/workspace/openclaude-vscode && npx vitest run test/unit/settingsSync.test.ts`

Expected: All tests PASS.

- [ ] **Step 3: Commit**

```bash
git add src/settings/settingsSync.ts
git commit -m "feat(settings): implement SettingsSync for provider env var injection"
```

---

## Task 6: Add Provider PostMessage Types

**Files:**
- Modify: `src/webview/types.ts`

- [ ] **Step 1: Add provider-related host-to-webview and webview-to-host message types**

Add to the existing `HostToWebviewMessage` union:

```typescript
// ============================================================================
// Provider Messages (Story 11)
// ============================================================================

/** Host → Webview: full provider state (sent on init and after changes) */
export interface ProviderStateMessage {
  type: 'provider_state';
  selectedProvider: string;
  providers: Array<{
    id: string;
    name: string;
    description: string;
    hasCredentials: boolean;
    isSelected: boolean;
    model?: string;
    icon?: string;
    apiKeyUrl?: string;
    requiredFields: Array<{
      key: string;
      label: string;
      type: 'apiKey' | 'text' | 'url';
      placeholder: string;
      required: boolean;
      helpText?: string;
    }>;
    autoDetectable?: boolean;
  }>;
}

/** Host → Webview: API key validation result */
export interface ProviderValidationResultMessage {
  type: 'provider_validation_result';
  providerId: string;
  valid: boolean;
  error?: string;
}

/** Host → Webview: Ollama detection result */
export interface OllamaDetectionResultMessage {
  type: 'ollama_detection_result';
  detected: boolean;
  url: string;
}

/** Host → Webview: current provider badge info (for ContextFooter) */
export interface ProviderBadgeMessage {
  type: 'provider_badge';
  providerName: string;
  model?: string;
}
```

Add to the existing `WebviewToHostMessage` union:

```typescript
/** Webview → Host: select a provider */
export interface SelectProviderMessage {
  type: 'select_provider';
  providerId: string;
}

/** Webview → Host: save provider credentials */
export interface SaveProviderCredentialsMessage {
  type: 'save_provider_credentials';
  providerId: string;
  apiKey?: string;
  model?: string;
  baseUrl?: string;
  extraVars?: Record<string, string>;
}

/** Webview → Host: validate an API key */
export interface ValidateApiKeyMessage {
  type: 'validate_api_key';
  providerId: string;
  apiKey: string;
  baseUrl?: string;
}

/** Webview → Host: clear provider credentials (logout) */
export interface ClearProviderCredentialsMessage {
  type: 'clear_provider_credentials';
  providerId: string;
}

/** Webview → Host: detect Ollama */
export interface DetectOllamaMessage {
  type: 'detect_ollama';
  url?: string;
}

/** Webview → Host: open provider picker dialog */
export interface OpenProviderPickerMessage {
  type: 'open_provider_picker';
}
```

- [ ] **Step 2: Verify build**

Run: `cd /Users/harshagarwal/Documents/workspace/openclaude-vscode && npm run build:extension`

Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/webview/types.ts
git commit -m "feat(provider): add provider postMessage types"
```

---

## Task 7: ProviderPicker Dialog Component

**Files:**
- Create: `webview/src/components/dialogs/ProviderPicker.tsx`

- [ ] **Step 1: Create the ProviderPicker dialog**

```tsx
// webview/src/components/dialogs/ProviderPicker.tsx
//
// Full-screen dialog for selecting and configuring an LLM provider.
// Shows all 8 providers as cards. Clicking a card expands it to show
// required fields (API key, model, base URL). Supports validation,
// Ollama auto-detection, and live provider badge updates.

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { vscode } from '../../vscode';

// ============================================================================
// Types (mirrors ProviderStateMessage from host)
// ============================================================================

interface ProviderField {
  key: string;
  label: string;
  type: 'apiKey' | 'text' | 'url';
  placeholder: string;
  required: boolean;
  helpText?: string;
}

interface ProviderInfo {
  id: string;
  name: string;
  description: string;
  hasCredentials: boolean;
  isSelected: boolean;
  model?: string;
  icon?: string;
  apiKeyUrl?: string;
  requiredFields: ProviderField[];
  autoDetectable?: boolean;
}

interface ValidationState {
  providerId: string;
  valid: boolean;
  error?: string;
}

export interface ProviderPickerProps {
  isOpen: boolean;
  providers: ProviderInfo[];
  onClose: () => void;
  /** Ollama detection result passed from parent state */
  ollamaDetected?: boolean;
  /** Validation result passed from parent state */
  validationResult?: ValidationState;
}

// ============================================================================
// Codicon map (fallback to text if VS Code codicons not available)
// ============================================================================

const PROVIDER_ICONS: Record<string, string> = {
  anthropic: '✦',
  openai: '⬡',
  gemini: '◆',
  bedrock: '☁',
  vertex: '△',
  ollama: '⚙',
  openrouter: '◎',
  custom: '⚡',
};

// ============================================================================
// Component
// ============================================================================

export const ProviderPicker: React.FC<ProviderPickerProps> = ({
  isOpen,
  providers,
  onClose,
  ollamaDetected,
  validationResult,
}) => {
  const [expandedProvider, setExpandedProvider] = useState<string | null>(null);
  const [fieldValues, setFieldValues] = useState<Record<string, Record<string, string>>>({});
  const [isValidating, setIsValidating] = useState(false);

  // Reset state when dialog opens
  useEffect(() => {
    if (isOpen) {
      setExpandedProvider(null);
      setFieldValues({});
      setIsValidating(false);
    }
  }, [isOpen]);

  // Handle validation result from host
  useEffect(() => {
    if (validationResult) {
      setIsValidating(false);
    }
  }, [validationResult]);

  // Auto-detect Ollama on dialog open
  useEffect(() => {
    if (isOpen) {
      vscode.postMessage({ type: 'detect_ollama' });
    }
  }, [isOpen]);

  const handleProviderClick = useCallback((providerId: string) => {
    setExpandedProvider((prev) => (prev === providerId ? null : providerId));
  }, []);

  const handleFieldChange = useCallback(
    (providerId: string, fieldKey: string, value: string) => {
      setFieldValues((prev) => ({
        ...prev,
        [providerId]: {
          ...(prev[providerId] || {}),
          [fieldKey]: value,
        },
      }));
    },
    [],
  );

  const handleSelectProvider = useCallback(
    (providerId: string) => {
      const values = fieldValues[providerId] || {};

      // Extract structured fields
      const extraVars: Record<string, string> = {};
      for (const [key, val] of Object.entries(values)) {
        if (key.startsWith('extraVars.')) {
          extraVars[key.replace('extraVars.', '')] = val;
        }
      }

      // Save credentials
      vscode.postMessage({
        type: 'save_provider_credentials',
        providerId,
        apiKey: values.apiKey || undefined,
        model: values.model || undefined,
        baseUrl: values.baseUrl || undefined,
        extraVars: Object.keys(extraVars).length > 0 ? extraVars : undefined,
      });

      // Select this provider
      vscode.postMessage({ type: 'select_provider', providerId });

      onClose();
    },
    [fieldValues, onClose],
  );

  const handleValidate = useCallback(
    (providerId: string) => {
      const values = fieldValues[providerId] || {};
      setIsValidating(true);
      vscode.postMessage({
        type: 'validate_api_key',
        providerId,
        apiKey: values.apiKey || '',
        baseUrl: values.baseUrl || undefined,
      });
    },
    [fieldValues],
  );

  const handleClearCredentials = useCallback((providerId: string) => {
    vscode.postMessage({ type: 'clear_provider_credentials', providerId });
  }, []);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div
        className={`
          w-full max-w-lg max-h-[80vh] overflow-y-auto
          bg-[var(--vscode-editor-background)]
          border border-[var(--vscode-widget-border)]
          rounded-lg shadow-xl
        `}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--vscode-widget-border)]">
          <h2 className="text-sm font-semibold text-[var(--vscode-foreground)]">
            Select Provider
          </h2>
          <button
            onClick={onClose}
            className="text-[var(--vscode-descriptionForeground)] hover:text-[var(--vscode-foreground)]"
            title="Close"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 8.707l3.646 3.647.708-.707L8.707 8l3.647-3.646-.707-.708L8 7.293 4.354 3.646l-.708.708L7.293 8l-3.647 3.646.708.708L8 8.707z" />
            </svg>
          </button>
        </div>

        {/* Provider list */}
        <div className="p-2">
          {providers.map((provider) => (
            <ProviderCard
              key={provider.id}
              provider={provider}
              isExpanded={expandedProvider === provider.id}
              fieldValues={fieldValues[provider.id] || {}}
              isValidating={isValidating && validationResult?.providerId === provider.id}
              validationResult={
                validationResult?.providerId === provider.id ? validationResult : undefined
              }
              ollamaDetected={provider.id === 'ollama' ? ollamaDetected : undefined}
              onClick={() => handleProviderClick(provider.id)}
              onFieldChange={(key, value) => handleFieldChange(provider.id, key, value)}
              onSelect={() => handleSelectProvider(provider.id)}
              onValidate={() => handleValidate(provider.id)}
              onClearCredentials={() => handleClearCredentials(provider.id)}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// ProviderCard (individual provider row)
// ============================================================================

interface ProviderCardProps {
  provider: ProviderInfo;
  isExpanded: boolean;
  fieldValues: Record<string, string>;
  isValidating?: boolean;
  validationResult?: ValidationState;
  ollamaDetected?: boolean;
  onClick: () => void;
  onFieldChange: (key: string, value: string) => void;
  onSelect: () => void;
  onValidate: () => void;
  onClearCredentials: () => void;
}

const ProviderCard: React.FC<ProviderCardProps> = ({
  provider,
  isExpanded,
  fieldValues,
  isValidating,
  validationResult,
  ollamaDetected,
  onClick,
  onFieldChange,
  onSelect,
  onValidate,
  onClearCredentials,
}) => {
  return (
    <div
      className={`
        mb-1 rounded-md border transition-colors
        ${provider.isSelected
          ? 'border-[var(--vscode-focusBorder)] bg-[var(--vscode-list-activeSelectionBackground)]'
          : 'border-transparent hover:bg-[var(--vscode-list-hoverBackground)]'
        }
      `}
    >
      {/* Card header — clickable */}
      <button
        className="w-full flex items-center gap-3 px-3 py-2 text-left"
        onClick={onClick}
      >
        {/* Provider icon */}
        <span className="text-lg w-6 text-center flex-shrink-0">
          {PROVIDER_ICONS[provider.id] || '?'}
        </span>

        {/* Provider info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-[var(--vscode-foreground)]">
              {provider.name}
            </span>
            {provider.isSelected && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--vscode-badge-background)] text-[var(--vscode-badge-foreground)]">
                Active
              </span>
            )}
            {provider.hasCredentials && !provider.isSelected && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--vscode-badge-background)] text-[var(--vscode-badge-foreground)] opacity-60">
                Configured
              </span>
            )}
            {provider.id === 'ollama' && ollamaDetected && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-600/20 text-green-400">
                Detected
              </span>
            )}
          </div>
          <div className="text-xs text-[var(--vscode-descriptionForeground)] truncate">
            {provider.description}
            {provider.model && (
              <span className="ml-1 opacity-70">({provider.model})</span>
            )}
          </div>
        </div>

        {/* Expand indicator */}
        <svg
          width="12"
          height="12"
          viewBox="0 0 16 16"
          fill="currentColor"
          className={`flex-shrink-0 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
        >
          <path d="M8 10.5l-4-4h8l-4 4z" />
        </svg>
      </button>

      {/* Expanded fields */}
      {isExpanded && (
        <div className="px-3 pb-3 pt-1 ml-9">
          {/* Required fields */}
          {provider.requiredFields.map((field) => (
            <div key={field.key} className="mb-2">
              <label className="block text-xs text-[var(--vscode-foreground)] mb-1">
                {field.label}
                {field.required && <span className="text-[var(--vscode-errorForeground)]"> *</span>}
              </label>
              <input
                type={field.type === 'apiKey' ? 'password' : 'text'}
                className={`
                  w-full px-2 py-1 text-xs rounded
                  bg-[var(--vscode-input-background)]
                  text-[var(--vscode-input-foreground)]
                  border border-[var(--vscode-input-border)]
                  placeholder-[var(--vscode-input-placeholderForeground)]
                  focus:outline-none focus:border-[var(--vscode-focusBorder)]
                `}
                placeholder={field.placeholder}
                value={fieldValues[field.key] || ''}
                onChange={(e) => onFieldChange(field.key, e.target.value)}
              />
              {field.helpText && (
                <div className="text-[10px] text-[var(--vscode-descriptionForeground)] mt-0.5">
                  {field.helpText}
                </div>
              )}
            </div>
          ))}

          {/* API key URL link */}
          {provider.apiKeyUrl && (
            <a
              href={provider.apiKeyUrl}
              className="text-xs text-[var(--vscode-textLink-foreground)] hover:underline block mb-2"
              title={`Get API key from ${provider.name}`}
            >
              Get API key &rarr;
            </a>
          )}

          {/* Validation result */}
          {validationResult && (
            <div
              className={`text-xs mb-2 ${
                validationResult.valid
                  ? 'text-green-400'
                  : 'text-[var(--vscode-errorForeground)]'
              }`}
            >
              {validationResult.valid ? 'API key is valid' : validationResult.error || 'Invalid'}
            </div>
          )}

          {/* Action buttons */}
          <div className="flex items-center gap-2 mt-3">
            <button
              className={`
                px-3 py-1 text-xs rounded
                bg-[var(--vscode-button-background)]
                text-[var(--vscode-button-foreground)]
                hover:bg-[var(--vscode-button-hoverBackground)]
              `}
              onClick={onSelect}
            >
              {provider.isSelected ? 'Update' : 'Select'}
            </button>

            <button
              className={`
                px-3 py-1 text-xs rounded
                bg-[var(--vscode-button-secondaryBackground)]
                text-[var(--vscode-button-secondaryForeground)]
                hover:bg-[var(--vscode-button-secondaryHoverBackground)]
                disabled:opacity-50
              `}
              onClick={onValidate}
              disabled={isValidating}
            >
              {isValidating ? 'Validating...' : 'Validate'}
            </button>

            {provider.hasCredentials && (
              <button
                className="px-3 py-1 text-xs rounded text-[var(--vscode-errorForeground)] hover:bg-[var(--vscode-errorForeground)]/10"
                onClick={onClearCredentials}
                title="Remove saved credentials"
              >
                Logout
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
```

- [ ] **Step 2: Build webview**

Run: `cd /Users/harshagarwal/Documents/workspace/openclaude-vscode && npm run build:webview`

Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add webview/src/components/dialogs/ProviderPicker.tsx
git commit -m "feat(provider): add ProviderPicker dialog with all 8 providers"
```

---

## Task 8: Wire AuthManager, SettingsSync, and Provider Commands Into Extension Host

**Files:**
- Modify: `src/extension.ts`
- Modify: `src/process/processManager.ts` (minimal — consume SettingsSync env)

- [ ] **Step 1: Import and instantiate AuthManager and SettingsSync**

Add to `src/extension.ts`:

```typescript
import { AuthManager } from './auth/authManager';
import { SettingsSync } from './settings/settingsSync';
import { PROVIDER_REGISTRY } from './types/providers';
import type { ProviderId } from './types/providers';
```

In the `activate` function:

```typescript
// Provider & Auth setup (Story 11)
const authManager = new AuthManager(
  context.secrets,
  vscode.workspace.getConfiguration('openclaudeCode'),
);
const settingsSync = new SettingsSync(
  authManager,
  vscode.workspace.getConfiguration('openclaudeCode'),
);
```

- [ ] **Step 2: Inject provider env vars into ProcessManager spawn**

Before spawning the ProcessManager, get the env from SettingsSync:

```typescript
// Build provider env vars before spawning CLI
const providerEnv = await settingsSync.buildEnv();

const processManager = new ProcessManager({
  cwd: workspaceFolder,
  env: providerEnv, // Injected into CLI spawn
  // ... other options
});
```

- [ ] **Step 3: Handle webview provider messages**

In the webview message handler:

```typescript
case 'select_provider': {
  const { providerId } = msg as { providerId: string };
  await authManager.setSelectedProvider(providerId as ProviderId);
  // Send updated provider state to webview
  await sendProviderState();
  // Send updated badge
  const displayInfo = settingsSync.getProviderDisplayInfo();
  webviewProvider.postMessage({
    type: 'provider_badge',
    providerName: displayInfo.providerName,
    model: displayInfo.model,
  });
  break;
}

case 'save_provider_credentials': {
  const { providerId, apiKey, model, baseUrl, extraVars } = msg as {
    providerId: string;
    apiKey?: string;
    model?: string;
    baseUrl?: string;
    extraVars?: Record<string, string>;
  };
  await authManager.saveCredentials({
    providerId: providerId as ProviderId,
    apiKey,
    model,
    baseUrl,
    extraVars,
  });
  await sendProviderState();
  break;
}

case 'validate_api_key': {
  const { providerId, apiKey, baseUrl } = msg as {
    providerId: string;
    apiKey: string;
    baseUrl?: string;
  };
  const result = await authManager.validateApiKey(
    providerId as ProviderId,
    apiKey,
    baseUrl,
  );
  webviewProvider.postMessage({
    type: 'provider_validation_result',
    providerId,
    valid: result.valid,
    error: result.error,
  });
  break;
}

case 'clear_provider_credentials': {
  const { providerId } = msg as { providerId: string };
  await authManager.clearCredentials(providerId as ProviderId);
  await sendProviderState();
  break;
}

case 'detect_ollama': {
  const { url } = (msg as { url?: string }) || {};
  const detected = await authManager.detectOllama(url);
  webviewProvider.postMessage({
    type: 'ollama_detection_result',
    detected,
    url: url || 'http://localhost:11434',
  });
  break;
}

case 'open_provider_picker': {
  await sendProviderState();
  break;
}
```

- [ ] **Step 4: Create sendProviderState helper**

```typescript
async function sendProviderState(): Promise<void> {
  const summaries = await authManager.getProviderSummaries();
  const selectedProvider = authManager.getSelectedProvider();

  webviewProvider.postMessage({
    type: 'provider_state',
    selectedProvider,
    providers: PROVIDER_REGISTRY.map((def) => {
      const summary = summaries.find((s) => s.id === def.id);
      return {
        id: def.id,
        name: def.name,
        description: def.description,
        hasCredentials: summary?.hasCredentials ?? false,
        isSelected: summary?.isSelected ?? false,
        model: summary?.model,
        icon: def.icon,
        apiKeyUrl: def.apiKeyUrl,
        requiredFields: def.requiredFields,
        autoDetectable: def.autoDetectable,
      };
    }),
  });
}
```

- [ ] **Step 5: Register the openclaude.selectProvider command**

```typescript
// Register provider picker command
const selectProviderCmd = vscode.commands.registerCommand(
  'openclaude.selectProvider',
  async () => {
    await sendProviderState();
    webviewProvider.postMessage({ type: 'open_provider_picker' as any });
  },
);
context.subscriptions.push(selectProviderCmd);
```

- [ ] **Step 6: Register the openclaude.logout command**

```typescript
// Register logout command
const logoutCmd = vscode.commands.registerCommand(
  'openclaude.logout',
  async () => {
    const selectedProvider = authManager.getSelectedProvider();
    const confirm = await vscode.window.showWarningMessage(
      `Remove saved credentials for ${selectedProvider}?`,
      { modal: true },
      'Logout',
    );
    if (confirm === 'Logout') {
      await authManager.clearCredentials(selectedProvider);
      await sendProviderState();
      vscode.window.showInformationMessage(`Logged out of ${selectedProvider}`);
    }
  },
);
context.subscriptions.push(logoutCmd);
```

- [ ] **Step 7: Send initial provider state and badge on webview init**

When the webview first loads (in the webview init handler):

```typescript
// Send initial provider state
await sendProviderState();

// Send provider badge
const displayInfo = settingsSync.getProviderDisplayInfo();
webviewProvider.postMessage({
  type: 'provider_badge',
  providerName: displayInfo.providerName,
  model: displayInfo.model,
});
```

- [ ] **Step 8: Listen for VS Code settings changes and update provider env**

```typescript
// Watch for settings changes that affect the provider
const settingsWatcher = vscode.workspace.onDidChangeConfiguration(async (event) => {
  if (
    event.affectsConfiguration('openclaudeCode.selectedProvider') ||
    event.affectsConfiguration('openclaudeCode.environmentVariables')
  ) {
    // Update the running CLI's environment via update_environment_variables message
    const newEnv = await settingsSync.buildEnv();
    processManager.write({
      type: 'update_environment_variables',
      variables: newEnv,
    });

    // Update webview badge
    const displayInfo = settingsSync.getProviderDisplayInfo();
    webviewProvider.postMessage({
      type: 'provider_badge',
      providerName: displayInfo.providerName,
      model: displayInfo.model,
    });
  }
});
context.subscriptions.push(settingsWatcher);
```

- [ ] **Step 9: Build full extension**

Run: `cd /Users/harshagarwal/Documents/workspace/openclaude-vscode && npm run build`

Expected: Both extension and webview build successfully.

- [ ] **Step 10: Commit**

```bash
git add src/extension.ts src/process/processManager.ts
git commit -m "feat(provider): wire AuthManager, SettingsSync, and provider commands"
```

---

## Final Verification

- [ ] Run: `cd /Users/harshagarwal/Documents/workspace/openclaude-vscode && npm run build`
- [ ] Run: `cd /Users/harshagarwal/Documents/workspace/openclaude-vscode && npx vitest run test/unit/authManager.test.ts`
- [ ] Run: `cd /Users/harshagarwal/Documents/workspace/openclaude-vscode && npx vitest run test/unit/settingsSync.test.ts`
- [ ] Manual: Launch Extension Development Host (F5), verify:
  - **Provider Picker opens** via command palette "OpenClaude: Select Provider"
  - **All 8 providers shown** with correct names, descriptions, icons
  - **Clicking a provider** expands it to show required fields
  - **API key validation** works for OpenAI (enter a test key, click Validate)
  - **Ollama detection** shows "Detected" badge if Ollama is running locally
  - **Selecting a provider** saves credentials and updates the badge in input footer
  - **CLI spawns** with correct env vars for the selected provider (check stderr output for provider detection)
  - **Logout** removes saved credentials and resets badge
  - **Settings change** live-updates the provider badge without restart
  - **/provider command** typed in chat is handled by CLI, output renders correctly
