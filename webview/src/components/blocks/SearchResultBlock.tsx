// webview/src/components/blocks/SearchResultBlock.tsx
import React from 'react';
import type { SearchResultBlock as SearchResultBlockType } from '../../types/blocks';

interface SearchResultBlockProps {
  block: SearchResultBlockType;
}

export const SearchResultBlock: React.FC<SearchResultBlockProps> = ({ block }) => {
  return (
    <div className="my-2 border border-vscode-border rounded p-3 bg-vscode-input-bg/50">
      <div className="flex items-start gap-2">
        <svg className="w-4 h-4 text-vscode-fg/40 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
          <path
            fillRule="evenodd"
            d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z"
            clipRule="evenodd"
          />
        </svg>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-vscode-fg">{block.title}</div>
          {block.source && (
            <div className="text-xs text-vscode-fg/40 mt-0.5">{block.source}</div>
          )}
          <p className="text-xs text-vscode-fg/70 mt-1 line-clamp-3">{block.content}</p>
          {block.url && (
            <a
              href={block.url}
              className="text-xs text-vscode-link hover:underline mt-1 inline-block"
              target="_blank"
              rel="noopener noreferrer"
            >
              {block.url}
            </a>
          )}
        </div>
      </div>
    </div>
  );
};
