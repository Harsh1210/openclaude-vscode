import { useState, useEffect, useRef } from 'react';
import type { SlashCommandDef } from '../../hooks/useSlashCommands';

export interface SlashCommandMenuProps {
  commands: SlashCommandDef[];
  isVisible: boolean;
  isLoaded: boolean;
  query: string;
  onSelect: (command: SlashCommandDef) => void;
  onDismiss: () => void;
}

export function SlashCommandMenu({
  commands,
  isVisible,
  isLoaded,
  query,
  onSelect,
  onDismiss,
}: SlashCommandMenuProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSelectedIndex(0);
  }, [commands, query]);

  useEffect(() => {
    if (!listRef.current) return;
    const items = listRef.current.querySelectorAll('[data-command-item]');
    if (items[selectedIndex]) {
      (items[selectedIndex] as HTMLElement).scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  useEffect(() => {
    if (!isVisible) return;
    const handler = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          e.stopPropagation();
          setSelectedIndex((prev) => Math.min(prev + 1, commands.length - 1));
          break;
        case 'ArrowUp':
          e.preventDefault();
          e.stopPropagation();
          setSelectedIndex((prev) => Math.max(prev - 1, 0));
          break;
        case 'Enter':
        case 'Tab':
          e.preventDefault();
          e.stopPropagation();
          if (commands[selectedIndex]) onSelect(commands[selectedIndex]);
          break;
        case 'Escape':
          e.preventDefault();
          e.stopPropagation();
          onDismiss();
          break;
      }
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [isVisible, commands, selectedIndex, onSelect, onDismiss]);

  if (!isVisible) return null;

  // Loading state — CLI not ready yet
  if (!isLoaded) {
    return (
      <div style={{
        position: 'absolute', bottom: '100%', left: 0, marginBottom: 4,
        width: 384, borderRadius: 'var(--corner-radius-medium)',
        border: '1px solid var(--app-input-border)',
        background: 'var(--app-menu-background)',
        boxShadow: '0 4px 12px rgba(0,0,0,0.3)', zIndex: 50,
        padding: '12px 16px',
        fontSize: 12, color: 'var(--app-secondary-foreground)',
      }}>
        Loading commands…
      </div>
    );
  }

  // No commands matched
  if (commands.length === 0) {
    return (
      <div style={{
        position: 'absolute', bottom: '100%', left: 0, marginBottom: 4,
        width: 384, borderRadius: 'var(--corner-radius-medium)',
        border: '1px solid var(--app-input-border)',
        background: 'var(--app-menu-background)',
        boxShadow: '0 4px 12px rgba(0,0,0,0.3)', zIndex: 50,
        padding: '12px 16px',
        fontSize: 12, color: 'var(--app-secondary-foreground)',
      }}>
        No commands found{query ? ` for "${query}"` : ''}.
      </div>
    );
  }

  return (
    <div
      ref={listRef}
      style={{
        position: 'absolute', bottom: '100%', left: 0, marginBottom: 4,
        width: 384, maxHeight: 288, overflowY: 'auto',
        borderRadius: 'var(--corner-radius-medium)',
        border: '1px solid var(--app-input-border)',
        background: 'var(--app-menu-background)',
        boxShadow: '0 4px 12px rgba(0,0,0,0.3)', zIndex: 50,
      }}
    >
      <div style={{
        padding: '6px 12px', fontSize: 11, fontWeight: 600,
        color: 'var(--app-secondary-foreground)',
        borderBottom: '1px solid var(--app-input-border)',
      }}>
        Slash Commands{query ? ` (${commands.length} matching)` : ''}
      </div>
      {commands.map((cmd, index) => (
        <div
          key={cmd.name}
          data-command-item="true"
          onClick={() => onSelect(cmd)}
          onMouseEnter={() => setSelectedIndex(index)}
          style={{
            display: 'flex', alignItems: 'flex-start', gap: 8,
            padding: '8px 12px', cursor: 'pointer',
            background: index === selectedIndex ? 'var(--app-list-active-background)' : 'transparent',
            color: index === selectedIndex ? 'var(--app-list-active-foreground)' : 'var(--app-primary-foreground)',
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontWeight: 500, fontSize: 13, fontFamily: 'monospace' }}>/{cmd.name}</span>
              {cmd.argumentHint && (
                <span style={{ fontSize: 11, opacity: 0.4, fontFamily: 'monospace' }}>{cmd.argumentHint}</span>
              )}
            </div>
            {cmd.description && (
              <div style={{
                fontSize: 11, opacity: 0.6, marginTop: 2,
                overflow: 'hidden', display: '-webkit-box',
                WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
              }}>
                {cmd.description}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
