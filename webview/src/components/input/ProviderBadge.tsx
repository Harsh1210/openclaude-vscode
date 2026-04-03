// webview/src/components/input/ProviderBadge.tsx
// Shows current provider + model. Clicking sends /provider slash command to CLI.

import { useState, useEffect } from 'react';
import { vscode } from '../../vscode';

export function ProviderBadge() {
  const [currentProviderId, setCurrentProviderId] = useState('anthropic');
  const [currentLabel, setCurrentLabel] = useState('Anthropic');
  const [currentModel, setCurrentModel] = useState<string | undefined>();

  // Request provider state on mount
  useEffect(() => {
    vscode.postMessage({ type: 'get_provider_state' });
  }, []);

  // Listen for provider_state messages
  useEffect(() => {
    return vscode.onMessage('provider_state', (msg) => {
      const data = msg as {
        providers: Array<{ id: string; label: string }>;
        currentProviderId: string;
        currentModel?: string;
      };
      setCurrentProviderId(data.currentProviderId ?? 'anthropic');
      setCurrentModel(data.currentModel);
      const providerDef = (data.providers ?? []).find((p) => p.id === data.currentProviderId);
      setCurrentLabel(providerDef?.label ?? data.currentProviderId ?? 'anthropic');
    });
  }, []);

  const modelLabel = currentModel ? ` · ${currentModel}` : '';

  const handleClick = () => {
    // Send /provider as a slash command to the CLI
    vscode.postMessage({ type: 'send_prompt', text: '/provider' });
  };

  return (
    <button
      onClick={handleClick}
      title="Change provider (/provider)"
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
  );
}

function ProviderIcon({ providerId }: { providerId: string }) {
  // Simple text-based icons
  const icons: Record<string, string> = {
    anthropic: '◆',
    openai: '⬡',
    ollama: '🦙',
    gemini: '✦',
    custom: '⚙',
  };
  return <span style={{ fontSize: 10 }}>{icons[providerId] ?? '◆'}</span>;
}
