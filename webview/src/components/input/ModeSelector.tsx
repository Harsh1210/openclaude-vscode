// webview/src/components/input/ModeSelector.tsx
// Dropdown for switching permission modes with 5 options.
// Uses inline styles consistent with the rest of the extension.

import { useState, useEffect, useRef } from 'react';

export type PermissionModeValue = 'default' | 'plan' | 'acceptEdits' | 'bypassPermissions' | 'dontAsk';

interface ModeOption {
  value: PermissionModeValue;
  label: string;
  description: string;
  color: string;
}

const MODE_OPTIONS: ModeOption[] = [
  {
    value: 'default',
    label: 'Default',
    description: 'Ask before each tool use',
    color: 'var(--vscode-charts-blue, #4fc3f7)',
  },
  {
    value: 'plan',
    label: 'Plan',
    description: 'Review plan before execution',
    color: 'var(--vscode-charts-purple, #ce93d8)',
  },
  {
    value: 'acceptEdits',
    label: 'Accept Edits',
    description: 'Auto-approve file edits',
    color: 'var(--vscode-charts-yellow, #fff176)',
  },
  {
    value: 'bypassPermissions',
    label: 'Bypass',
    description: 'Skip all permission checks (danger)',
    color: 'var(--vscode-charts-red, #ef9a9a)',
  },
  {
    value: 'dontAsk',
    label: "Don't Ask",
    description: 'Auto-approve everything',
    color: 'var(--vscode-charts-orange, #ffcc80)',
  },
];

interface ModeSelectorProps {
  currentMode: PermissionModeValue;
  onSelectMode: (mode: PermissionModeValue) => void;
  onClose: () => void;
}

export function ModeSelector({ currentMode, onSelectMode, onClose }: ModeSelectorProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  // Close on click outside
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      style={{
        position: 'absolute',
        bottom: '100%',
        left: 0,
        marginBottom: 4,
        width: 256,
        borderRadius: 'var(--corner-radius-medium, 6px)',
        border: '1px solid var(--app-input-border)',
        background: 'var(--app-menu-background, var(--vscode-editor-background))',
        boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
        zIndex: 50,
        overflow: 'hidden',
      }}
    >
      <div style={{
        padding: '6px 12px',
        fontSize: 11,
        fontWeight: 600,
        color: 'var(--app-secondary-foreground)',
        borderBottom: '1px solid var(--app-input-border)',
      }}>
        Permission Mode
      </div>
      {MODE_OPTIONS.map((option, index) => {
        const isActive = option.value === currentMode;
        const isHovered = hoveredIndex === index;
        return (
          <button
            key={option.value}
            onClick={() => {
              onSelectMode(option.value);
              onClose();
            }}
            onMouseEnter={() => setHoveredIndex(index)}
            onMouseLeave={() => setHoveredIndex(null)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              width: '100%',
              padding: '8px 12px',
              border: 'none',
              textAlign: 'left',
              cursor: 'pointer',
              background: isActive
                ? 'var(--app-list-active-background)'
                : isHovered
                  ? 'var(--vscode-list-hoverBackground, rgba(255,255,255,0.05))'
                  : 'transparent',
              color: isActive
                ? 'var(--app-list-active-foreground)'
                : 'var(--app-primary-foreground)',
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 500, color: option.color }}>
                {option.label}
              </div>
              <div style={{
                fontSize: 11,
                color: 'var(--app-secondary-foreground)',
                marginTop: 1,
                lineHeight: 1.3,
              }}>
                {option.description}
              </div>
            </div>
            {isActive && (
              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" style={{ flexShrink: 0, opacity: 0.9 }}>
                <path d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z" />
              </svg>
            )}
          </button>
        );
      })}
    </div>
  );
}
