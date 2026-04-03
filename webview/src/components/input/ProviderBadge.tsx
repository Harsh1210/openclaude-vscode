// webview/src/components/input/ProviderBadge.tsx
// Shows current provider + model. Clicking opens the ProviderPicker dialog.
// This is OpenClaude-specific (Claude Code only supports Anthropic).

import { useState, useEffect } from 'react';
import { vscode } from '../../vscode';
import { ProviderPicker } from '../dialogs/ProviderPicker';

// All providers OpenClaude supports (from openclaude/src/utils/model/providers.ts)
const BUILTIN_PROVIDERS = [
  { id: 'anthropic', label: 'Anthropic', requiresApiKey: true, requiresBaseUrl: false, supportsModel: true },
  { id: 'openai', label: 'OpenAI', requiresApiKey: true, requiresBaseUrl: false, supportsModel: true, defaultBaseUrl: 'https://api.openai.com/v1' },
  { id: 'gemini', label: 'Google Gemini', requiresApiKey: true, requiresBaseUrl: false, supportsModel: true },
  { id: 'ollama', label: 'Ollama (Local)', requiresApiKey: false, requiresBaseUrl: false, supportsModel: true, defaultBaseUrl: 'http://localhost:11434/v1' },
  { id: 'codex', label: 'Codex (ChatGPT)', requiresApiKey: true, requiresBaseUrl: false, supportsModel: true, defaultBaseUrl: 'https://api.codex.openai.com/v1' },
  { id: 'bedrock', label: 'AWS Bedrock', requiresApiKey: false, requiresBaseUrl: false, supportsModel: true },
  { id: 'vertex', label: 'Google Vertex AI', requiresApiKey: false, requiresBaseUrl: false, supportsModel: true },
  { id: 'github', label: 'GitHub Models', requiresApiKey: true, requiresBaseUrl: false, supportsModel: true },
  { id: 'custom', label: 'Custom (OpenAI-compatible)', requiresApiKey: true, requiresBaseUrl: true, supportsModel: true },
];

export function ProviderBadge() {
  const [currentProviderId, setCurrentProviderId] = useState('anthropic');
  const [currentLabel, setCurrentLabel] = useState('Anthropic');
  const [currentModel, setCurrentModel] = useState<string | undefined>();
  const [currentBaseUrl, setCurrentBaseUrl] = useState<string | undefined>();
  const [isPickerOpen, setPickerOpen] = useState(false);
  const [providers, setProviders] = useState(BUILTIN_PROVIDERS);

  // Request provider state on mount
  useEffect(() => {
    vscode.postMessage({ type: 'get_provider_state' });
  }, []);

  // Listen for open_provider_picker message (e.g. from /provider command)
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.data?.type === 'open_provider_picker') {
        setPickerOpen(true);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  // Listen for provider_state messages from extension host
  useEffect(() => {
    return vscode.onMessage('provider_state', (msg) => {
      const data = msg as unknown as {
        providers?: Array<{ id: string; label: string; requiresApiKey?: boolean; requiresBaseUrl?: boolean; supportsModel?: boolean; defaultBaseUrl?: string }>;
        currentProviderId: string;
        currentModel?: string;
        currentBaseUrl?: string;
      };
      setCurrentProviderId(data.currentProviderId ?? 'anthropic');
      setCurrentModel(data.currentModel);
      setCurrentBaseUrl(data.currentBaseUrl);
      if (data.providers && data.providers.length > 0) {
        setProviders(data.providers.map(p => ({
          ...p,
          requiresApiKey: p.requiresApiKey ?? true,
          requiresBaseUrl: p.requiresBaseUrl ?? false,
          supportsModel: p.supportsModel ?? true,
        })));
      }
      const providerDef = (data.providers ?? BUILTIN_PROVIDERS).find((p) => p.id === data.currentProviderId);
      setCurrentLabel(providerDef?.label ?? data.currentProviderId ?? 'Anthropic');
    });
  }, []);

  // Re-request state after picker closes (to refresh)
  const handlePickerClose = () => {
    setPickerOpen(false);
    vscode.postMessage({ type: 'get_provider_state' });
  };

  const modelLabel = currentModel ? ` · ${currentModel}` : '';

  return (
    <>
      <button
        onClick={() => setPickerOpen(true)}
        title="Change provider"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          padding: '2px 6px',
          fontSize: 11,
          background: 'transparent',
          border: '1px solid var(--app-input-border)',
          borderRadius: 'var(--corner-radius-small)',
          color: 'var(--app-secondary-foreground)',
          cursor: 'pointer',
          whiteSpace: 'nowrap',
        }}
      >
        <ProviderIcon providerId={currentProviderId} />
        <span>{currentLabel}{modelLabel}</span>
        <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor" style={{ opacity: 0.6 }}>
          <path d="M1 2.5l3 3 3-3" stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinecap="round" />
        </svg>
      </button>

      {isPickerOpen && (
        <ProviderPicker
          providers={providers}
          currentProviderId={currentProviderId}
          currentModel={currentModel}
          currentBaseUrl={currentBaseUrl}
          onClose={handlePickerClose}
        />
      )}
    </>
  );
}

function ProviderIcon({ providerId }: { providerId: string }) {
  const icons: Record<string, string> = {
    anthropic: '◆',
    openai: '⬡',
    ollama: '🦙',
    gemini: '✦',
    codex: '⬡',
    bedrock: '☁',
    vertex: '▲',
    github: '⬢',
    custom: '⚙',
  };
  return <span style={{ fontSize: 10 }}>{icons[providerId] ?? '◆'}</span>;
}
