import { useState, useEffect, useRef } from 'react';
import type { AtMentionResult } from '../../hooks/useAtMentions';

export interface AtMentionPickerProps {
  results: AtMentionResult[];
  isLoading: boolean;
  isVisible: boolean;
  onSelect: (result: AtMentionResult) => void;
  onDismiss: () => void;
}

/**
 * Floating dropdown picker for @-mentions.
 * Positioned above the input area. Supports keyboard navigation.
 */
export function AtMentionPicker({
  results,
  isLoading,
  isVisible,
  onSelect,
  onDismiss,
}: AtMentionPickerProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  // Reset selection when results change
  useEffect(() => {
    setSelectedIndex(0);
  }, [results]);

  // Scroll selected item into view
  useEffect(() => {
    if (!listRef.current) return;
    const items = listRef.current.querySelectorAll('[data-mention-item]');
    if (items[selectedIndex]) {
      (items[selectedIndex] as HTMLElement).scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  // Keyboard navigation (captured at window level when picker is visible)
  useEffect(() => {
    if (!isVisible) return;

    const handler = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          e.stopPropagation();
          setSelectedIndex((prev) => Math.min(prev + 1, results.length - 1));
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
          if (results[selectedIndex]) {
            onSelect(results[selectedIndex]);
          }
          break;
        case 'Escape':
          e.preventDefault();
          e.stopPropagation();
          onDismiss();
          break;
      }
    };

    // Use capture phase to intercept before textarea
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [isVisible, results, selectedIndex, onSelect, onDismiss]);

  if (!isVisible) return null;

  return (
    <div
      ref={listRef}
      style={{
        position: 'absolute',
        bottom: '100%',
        left: 0,
        marginBottom: 4,
        width: 320,
        maxHeight: 256,
        overflowY: 'auto',
        borderRadius: 'var(--corner-radius-medium)',
        border: '1px solid var(--app-input-border)',
        background: 'var(--app-menu-background)',
        boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
        zIndex: 50,
      }}
    >
      {isLoading && results.length === 0 && (
        <div style={{ padding: '8px 12px', fontSize: 12, color: 'var(--app-secondary-foreground)' }}>
          Searching...
        </div>
      )}

      {!isLoading && results.length === 0 && (
        <div style={{ padding: '8px 12px', fontSize: 12, color: 'var(--app-secondary-foreground)' }}>
          No matches found
        </div>
      )}

      {results.map((result, index) => (
        <div
          key={`${result.type}-${result.detail}`}
          data-mention-item="true"
          onClick={() => onSelect(result)}
          onMouseEnter={() => setSelectedIndex(index)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '6px 12px',
            cursor: 'pointer',
            fontSize: 13,
            background: index === selectedIndex
              ? 'var(--app-list-active-background)'
              : 'transparent',
            color: index === selectedIndex
              ? 'var(--app-list-active-foreground)'
              : 'var(--app-primary-foreground)',
          }}
        >
          <FileIcon icon={result.icon} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500 }}>
              {result.label}
            </div>
            <div style={{
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              fontSize: 11,
              opacity: 0.6,
            }}>
              {result.detail}
            </div>
          </div>
          <span style={{ fontSize: 11, opacity: 0.4, textTransform: 'capitalize', flexShrink: 0 }}>
            {result.type}
          </span>
        </div>
      ))}
    </div>
  );
}

function FileIcon({ icon }: { icon: string }) {
  const icons: Record<string, string> = {
    file: '📄',
    'file-code': '📝',
    'file-text': '📃',
    'file-media': '🖼️',
    'file-pdf': '📕',
    folder: '📁',
    terminal: '⬛',
    globe: '🌐',
    'symbol-number': '#',
  };
  return (
    <span style={{ fontSize: 14, flexShrink: 0, width: 18, textAlign: 'center' }}>
      {icons[icon] || icons['file']}
    </span>
  );
}
