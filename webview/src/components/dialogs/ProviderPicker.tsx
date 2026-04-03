// webview/src/components/dialogs/ProviderPicker.tsx
// Provider selection dialog — submits via postMessage only.

import React, { useState, useEffect, useCallback } from 'react';
import { vscode } from '../../vscode';

interface ProviderDef {
  id: string;
  label: string;
  requiresApiKey: boolean;
  requiresBaseUrl: boolean;
  supportsModel: boolean;
  defaultBaseUrl?: string;
}

interface ProviderPickerProps {
  providers: ProviderDef[];
  currentProviderId: string;
  currentModel?: string;
  currentBaseUrl?: string;
  onClose: () => void;
}

export function ProviderPicker({
  providers,
  currentProviderId,
  currentModel,
  currentBaseUrl,
  onClose,
}: ProviderPickerProps) {
  const [selectedId, setSelectedId] = useState(currentProviderId);
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState(currentBaseUrl ?? '');
  const [model, setModel] = useState(currentModel ?? '');
  const [errors, setErrors] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  const selectedDef = providers.find((p) => p.id === selectedId) ?? providers[0];

  // Reset fields when provider changes
  useEffect(() => {
    setApiKey('');
    setBaseUrl(selectedDef?.defaultBaseUrl ?? '');
    setErrors([]);
  }, [selectedId, selectedDef]);

  const validate = useCallback((): string[] => {
    const errs: string[] = [];
    if (selectedDef?.requiresApiKey && !apiKey.trim()) {
      errs.push(`${selectedDef.label} requires an API key`);
    }
    if (selectedDef?.requiresBaseUrl && !baseUrl.trim()) {
      errs.push(`${selectedDef.label} requires a base URL`);
    }
    return errs;
  }, [selectedDef, apiKey, baseUrl]);

  const handleSubmit = useCallback(() => {
    const errs = validate();
    if (errs.length > 0) {
      setErrors(errs);
      return;
    }
    setIsSaving(true);
    vscode.postMessage({
      type: 'set_provider',
      providerId: selectedId,
      apiKey: apiKey.trim() || undefined,
      baseUrl: baseUrl.trim() || undefined,
      model: model.trim() || undefined,
    });
    onClose();
  }, [validate, selectedId, apiKey, baseUrl, model, onClose]);

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '4px 8px',
    fontSize: 12,
    background: 'var(--vscode-input-background)',
    color: 'var(--vscode-input-foreground)',
    border: '1px solid var(--vscode-input-border)',
    borderRadius: 3,
    outline: 'none',
    boxSizing: 'border-box',
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 11,
    color: 'var(--vscode-descriptionForeground)',
    marginBottom: 3,
    display: 'block',
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.4)',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          background: 'var(--vscode-editor-background)',
          border: '1px solid var(--vscode-panel-border)',
          borderRadius: 6,
          padding: 20,
          width: 360,
          maxWidth: '90vw',
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 600 }}>Select Provider</div>

        {/* Provider list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {providers.map((p) => (
            <button
              key={p.id}
              onClick={() => setSelectedId(p.id)}
              style={{
                textAlign: 'left',
                padding: '6px 10px',
                borderRadius: 4,
                border: selectedId === p.id
                  ? '1px solid var(--vscode-focusBorder)'
                  : '1px solid transparent',
                background: selectedId === p.id
                  ? 'var(--vscode-list-activeSelectionBackground)'
                  : 'transparent',
                color: selectedId === p.id
                  ? 'var(--vscode-list-activeSelectionForeground)'
                  : 'var(--vscode-foreground)',
                cursor: 'pointer',
                fontSize: 12,
              }}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Fields */}
        {selectedDef?.requiresApiKey && (
          <div>
            <label style={labelStyle}>API Key</label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Enter API key..."
              style={inputStyle}
            />
          </div>
        )}

        {(selectedDef?.requiresBaseUrl || selectedDef?.defaultBaseUrl) && (
          <div>
            <label style={labelStyle}>Base URL{selectedDef.requiresBaseUrl ? '' : ' (optional)'}</label>
            <input
              type="text"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder={selectedDef.defaultBaseUrl ?? 'https://...'}
              style={inputStyle}
            />
          </div>
        )}

        {selectedDef?.supportsModel && (
          <div>
            <label style={labelStyle}>Model (optional)</label>
            <input
              type="text"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="e.g. gpt-4o, llama3, gemini-1.5-pro"
              style={inputStyle}
            />
          </div>
        )}

        {/* Errors */}
        {errors.length > 0 && (
          <div style={{ fontSize: 11, color: 'var(--vscode-errorForeground)' }}>
            {errors.map((e, i) => <div key={i}>{e}</div>)}
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button
            onClick={onClose}
            style={{
              padding: '4px 12px',
              fontSize: 12,
              background: 'transparent',
              border: '1px solid var(--vscode-button-border, var(--vscode-panel-border))',
              color: 'var(--vscode-foreground)',
              borderRadius: 3,
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={isSaving}
            style={{
              padding: '4px 12px',
              fontSize: 12,
              background: 'var(--vscode-button-background)',
              color: 'var(--vscode-button-foreground)',
              border: 'none',
              borderRadius: 3,
              cursor: isSaving ? 'not-allowed' : 'pointer',
              opacity: isSaving ? 0.6 : 1,
            }}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
