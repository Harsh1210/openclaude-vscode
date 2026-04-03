import { useState, useCallback } from 'react';
import { ModeSelector, type PermissionModeValue } from './ModeSelector';
import { vscode } from '../../vscode';

// Colors matching Claude Code's permission mode badge
const MODE_CONFIG: Record<PermissionModeValue, { label: string; color: string }> = {
  default:           { label: 'Default',      color: 'var(--vscode-charts-blue, #4fc3f7)' },
  plan:              { label: 'Plan',          color: 'var(--vscode-charts-purple, #ce93d8)' },
  acceptEdits:       { label: 'Accept Edits', color: 'var(--vscode-charts-yellow, #fff176)' },
  bypassPermissions: { label: 'Bypass',       color: 'var(--vscode-charts-red, #ef9a9a)' },
  dontAsk:           { label: "Don't Ask",    color: 'var(--vscode-charts-orange, #ffcc80)' },
};

interface PermissionModeIndicatorProps {
  currentMode: PermissionModeValue;
  onModeChange: (mode: PermissionModeValue) => void;
}

export function PermissionModeIndicator({ currentMode, onModeChange }: PermissionModeIndicatorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const cfg = MODE_CONFIG[currentMode] ?? MODE_CONFIG.default;

  const handleSelectMode = useCallback((mode: PermissionModeValue) => {
    onModeChange(mode);
    vscode.postMessage({ type: 'set_permission_mode', mode });
  }, [onModeChange]);

  return (
    <div style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        title="Change permission mode"
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          padding: '2px 6px', fontSize: 11,
          background: 'transparent', border: 'none',
          borderRadius: 'var(--corner-radius-small)',
          cursor: 'pointer',
          color: cfg.color,
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background = 'var(--vscode-toolbar-hoverBackground, rgba(255,255,255,0.07))';
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
        }}
      >
        <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor" style={{ opacity: 0.8 }}>
          <path d="M8 1l6 2.5v4C14 11 11.5 14 8 15 4.5 14 2 11 2 7.5v-4L8 1z"/>
        </svg>
        <span>{cfg.label}</span>
        <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor" style={{ opacity: 0.6 }}>
          <path d="M1 2.5l3 3 3-3" stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinecap="round"/>
        </svg>
      </button>

      {isOpen && (
        <ModeSelector
          currentMode={currentMode}
          onSelectMode={handleSelectMode}
          onClose={() => setIsOpen(false)}
        />
      )}
    </div>
  );
}
