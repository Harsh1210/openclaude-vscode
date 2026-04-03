import { useState, useRef, useEffect } from 'react';
import { vscode } from '../../vscode';

interface ModelSelectorProps {
  currentModel: string | null;
  availableModels: Array<{ value: string; displayName: string }>;
}

export function ModelSelector({ currentModel, availableModels }: ModelSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen]);

  const displayName = availableModels.find((m) => m.value === currentModel)?.displayName || currentModel || 'Model';
  const shortName = displayName.length > 20 ? displayName.slice(0, 18) + '…' : displayName;

  if (availableModels.length === 0) return null;

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        title={`Model: ${displayName}`}
        style={{
          display: 'flex', alignItems: 'center', gap: 4,
          padding: '2px 6px', fontSize: 11,
          background: 'transparent',
          border: '1px solid var(--app-input-border)',
          borderRadius: 'var(--corner-radius-small)',
          color: 'var(--app-secondary-foreground)',
          cursor: 'pointer', whiteSpace: 'nowrap',
        }}
      >
        <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor" style={{ opacity: 0.6 }}>
          <path d="M8 1a7 7 0 100 14A7 7 0 008 1zm0 1.5a5.5 5.5 0 110 11 5.5 5.5 0 010-11zM7 5v4.5l.5.5H11v-1H8V5H7z"/>
        </svg>
        <span>{shortName}</span>
        <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor" style={{ opacity: 0.6 }}>
          <path d="M1 2.5l3 3 3-3" stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinecap="round"/>
        </svg>
      </button>
      {isOpen && (
        <div style={{
          position: 'absolute', bottom: '100%', left: 0, marginBottom: 4,
          minWidth: 200, maxHeight: 300, overflowY: 'auto',
          background: 'var(--app-menu-background)',
          border: '1px solid var(--app-input-border)',
          borderRadius: 'var(--corner-radius-medium)',
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)', zIndex: 50,
        }}>
          <div style={{ padding: '6px 12px', fontSize: 11, fontWeight: 600, color: 'var(--app-secondary-foreground)', borderBottom: '1px solid var(--app-input-border)' }}>
            Select Model
          </div>
          {availableModels.map((m) => (
            <button
              key={m.value}
              onClick={() => {
                vscode.postMessage({ type: 'set_model', model: m.value });
                setIsOpen(false);
              }}
              style={{
                display: 'block', width: '100%', textAlign: 'left',
                padding: '8px 12px', fontSize: 12,
                background: m.value === currentModel ? 'var(--app-list-active-background)' : 'transparent',
                color: m.value === currentModel ? 'var(--app-list-active-foreground)' : 'var(--app-primary-foreground)',
                border: 'none', cursor: 'pointer',
              }}
              onMouseEnter={(e) => {
                if (m.value !== currentModel) (e.currentTarget as HTMLButtonElement).style.background = 'var(--app-list-hover-background)';
              }}
              onMouseLeave={(e) => {
                if (m.value !== currentModel) (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
              }}
            >
              {m.displayName}
              {m.value === currentModel && <span style={{ marginLeft: 8, opacity: 0.5 }}>✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
