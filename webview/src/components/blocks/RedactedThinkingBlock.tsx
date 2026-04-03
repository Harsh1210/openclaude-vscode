// webview/src/components/blocks/RedactedThinkingBlock.tsx
import React from 'react';
import type { RedactedThinkingBlock as RedactedThinkingBlockType } from '../../types/blocks';

interface RedactedThinkingBlockProps {
  block: RedactedThinkingBlockType;
}

export const RedactedThinkingBlock: React.FC<RedactedThinkingBlockProps> = () => {
  return (
    <div className="my-2 border-l-2 border-vscode-border pl-3 flex items-center gap-2 py-1">
      <svg
        className="w-4 h-4 text-vscode-fg/40"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
        />
      </svg>
      <span className="text-xs text-vscode-fg/50 italic">
        Thinking... (reasoning hidden)
      </span>
    </div>
  );
};
