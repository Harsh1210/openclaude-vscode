// webview/src/components/blocks/ImageBlockRenderer.tsx
import React, { useState } from 'react';
import type { ImageBlock } from '../../types/blocks';

interface ImageBlockRendererProps {
  block: ImageBlock;
}

export const ImageBlockRenderer: React.FC<ImageBlockRendererProps> = ({ block }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [hasError, setHasError] = useState(false);

  const src =
    block.source.type === 'base64'
      ? `data:${block.source.media_type};base64,${block.source.data}`
      : block.source.url;

  if (hasError) {
    return (
      <div className="my-2 p-3 border border-vscode-border rounded bg-vscode-input-bg text-xs text-vscode-fg/50 flex items-center gap-2">
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
          <path
            fillRule="evenodd"
            d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z"
            clipRule="evenodd"
          />
        </svg>
        <span>Failed to load image</span>
      </div>
    );
  }

  return (
    <div className="my-2">
      <button
        className="bg-transparent border-none p-0 cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
        aria-label={isExpanded ? 'Collapse image' : 'Expand image'}
      >
        <img
          src={src}
          alt="AI-generated or referenced image"
          className={`rounded border border-vscode-border transition-all ${
            isExpanded ? 'max-w-full max-h-[600px]' : 'max-w-[300px] max-h-[200px]'
          } object-contain`}
          onError={() => setHasError(true)}
          loading="lazy"
        />
      </button>
      {block.source.type === 'base64' && (
        <div className="text-xs text-vscode-fg/40 mt-1">
          {block.source.media_type} ({Math.round(block.source.data.length * 0.75 / 1024)}KB)
        </div>
      )}
    </div>
  );
};
