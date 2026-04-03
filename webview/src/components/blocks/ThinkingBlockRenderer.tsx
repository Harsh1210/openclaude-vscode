// webview/src/components/blocks/ThinkingBlockRenderer.tsx
import React from 'react';
import type { ThinkingBlock } from '../../types/blocks';

interface ThinkingBlockRendererProps {
  block: ThinkingBlock;
  showSummaries: boolean;
}

export const ThinkingBlockRenderer: React.FC<ThinkingBlockRendererProps> = ({ block, showSummaries }) => {
  const displayText = showSummaries && block.summary ? block.summary : block.thinking;
  const label = showSummaries && block.summary ? block.summary : 'Thinking…';

  if (block.isStreaming) {
    return (
      <div className="thinking-block">
        <div className="thinking-summary" style={{ fontStyle: 'italic' }}>
          <svg className="thinking-toggle" viewBox="0 0 16 16" fill="currentColor" style={{ animation: 'pulse 1.5s ease-in-out infinite' }}>
            <circle cx="8" cy="8" r="3"/>
          </svg>
          Thinking…
        </div>
        <div className="thinking-content" style={{ fontSize: 12 }}>
          {block.thinking}
        </div>
      </div>
    );
  }

  return (
    <details className="thinking-block">
      <summary className="thinking-summary">
        <svg className="thinking-toggle" viewBox="0 0 16 16" fill="currentColor">
          <path d="M6 4l4 4-4 4"/>
        </svg>
        <span style={{ fontStyle: 'italic' }}>{label}</span>
        <span style={{ opacity: 0.4, fontSize: 11, marginLeft: 4 }}>({block.thinking.length.toLocaleString()} chars)</span>
      </summary>
      <div className="thinking-content" style={{ fontSize: 12, whiteSpace: 'pre-wrap', fontFamily: 'var(--app-monospace-font-family)' }}>
        {displayText}
      </div>
    </details>
  );
};
