// webview/src/components/blocks/WebSearchResultBlock.tsx
import React, { useState } from 'react';
import type { WebSearchResultBlock as WebSearchResultBlockType } from '../../types/blocks';

interface WebSearchResultBlockProps {
  block: WebSearchResultBlockType;
}

export const WebSearchResultBlock: React.FC<WebSearchResultBlockProps> = ({ block }) => {
  const [isExpanded, setIsExpanded] = useState(true);

  return (
    <div className="my-2 border border-vscode-border rounded overflow-hidden">
      <button
        className="w-full flex items-center gap-2 px-3 py-2 bg-vscode-input-bg text-left border-none cursor-pointer hover:bg-vscode-button-hover/10"
        onClick={() => setIsExpanded(!isExpanded)}
        aria-expanded={isExpanded}
      >
        <svg className="w-4 h-4 text-vscode-link flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
          <path
            fillRule="evenodd"
            d="M4.083 9h1.946c.089-1.546.383-2.97.837-4.118A6.004 6.004 0 004.083 9zM10 2a8 8 0 100 16 8 8 0 000-16zm0 2c-.076 0-.232.032-.465.262-.238.234-.497.623-.737 1.182-.389.907-.673 2.142-.766 3.556h3.936c-.093-1.414-.377-2.649-.766-3.556-.24-.56-.5-.948-.737-1.182C10.232 4.032 10.076 4 10 4z"
            clipRule="evenodd"
          />
        </svg>
        <span className="text-sm text-vscode-fg">
          Web search: <span className="text-vscode-fg/70">&ldquo;{block.query}&rdquo;</span>
        </span>
        <span className="ml-auto text-xs text-vscode-fg/40">
          {block.results.length} result{block.results.length !== 1 ? 's' : ''}
        </span>
      </button>

      {isExpanded && (
        <div className="border-t border-vscode-border">
          {block.results.map((result, i) => (
            <div
              key={i}
              className={`px-3 py-2 ${i > 0 ? 'border-t border-vscode-border/50' : ''}`}
            >
              <a
                href={result.url}
                className="text-sm text-vscode-link hover:underline font-medium"
                target="_blank"
                rel="noopener noreferrer"
              >
                {result.title}
              </a>
              <div className="text-xs text-vscode-fg/40 truncate mt-0.5">{result.url}</div>
              <p className="text-xs text-vscode-fg/70 mt-1 line-clamp-2">{result.snippet}</p>
              {result.page_age && (
                <span className="text-xs text-vscode-fg/30 mt-0.5 inline-block">
                  {result.page_age}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
