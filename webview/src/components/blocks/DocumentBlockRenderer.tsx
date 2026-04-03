// webview/src/components/blocks/DocumentBlockRenderer.tsx
import React, { useState } from 'react';
import type { DocumentBlock } from '../../types/blocks';

interface DocumentBlockRendererProps {
  block: DocumentBlock;
}

export const DocumentBlockRenderer: React.FC<DocumentBlockRendererProps> = ({ block }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const isPdf =
    (block.source.type === 'base64' && block.source.media_type === 'application/pdf') ||
    (block.source.type === 'url' && block.source.url.endsWith('.pdf'));

  const hasInlineContent = block.source.type === 'content';

  return (
    <div className="my-2 border border-vscode-border rounded overflow-hidden">
      {/* Header */}
      <button
        className="w-full flex items-center gap-2 px-3 py-2 bg-vscode-input-bg text-left border-none cursor-pointer hover:bg-vscode-button-hover/10"
        onClick={() => setIsExpanded(!isExpanded)}
        aria-expanded={isExpanded}
      >
        <svg className="w-4 h-4 text-vscode-fg/60 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
          <path
            fillRule="evenodd"
            d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z"
            clipRule="evenodd"
          />
        </svg>
        <span className="text-sm text-vscode-fg font-medium truncate">
          {block.title ?? (isPdf ? 'PDF Document' : 'Document')}
        </span>
        <svg
          className={`w-3 h-3 ml-auto text-vscode-fg/40 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
          fill="currentColor"
          viewBox="0 0 16 16"
        >
          <path d="M6 4l4 4-4 4" />
        </svg>
      </button>

      {/* Content */}
      {isExpanded && (
        <div className="px-3 py-2 border-t border-vscode-border">
          {block.context && (
            <p className="text-xs text-vscode-fg/50 mb-2 italic">{block.context}</p>
          )}

          {hasInlineContent && (
            <pre className="text-xs whitespace-pre-wrap font-mono text-vscode-fg/80 max-h-96 overflow-y-auto">
              {(block.source as { type: 'content'; content: string }).content}
            </pre>
          )}

          {isPdf && block.source.type === 'base64' && (
            <div className="text-xs text-vscode-fg/50">
              PDF content ({Math.round(block.source.data.length * 0.75 / 1024)}KB)
              — content extracted by AI
            </div>
          )}

          {isPdf && block.source.type === 'url' && (
            <a
              href={block.source.url}
              className="text-xs text-vscode-link hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              Open PDF
            </a>
          )}

          {/* Citations */}
          {block.citations.length > 0 && (
            <div className="mt-2 pt-2 border-t border-vscode-border">
              <div className="text-xs text-vscode-fg/50 mb-1">Citations:</div>
              {block.citations.map((citation, i) => (
                <blockquote
                  key={i}
                  className="text-xs text-vscode-fg/60 border-l-2 border-vscode-link pl-2 my-1"
                >
                  &ldquo;{citation.cited_text}&rdquo;
                </blockquote>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
