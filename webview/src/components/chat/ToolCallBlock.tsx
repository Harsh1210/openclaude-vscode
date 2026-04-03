import { useState } from 'react';
import type { ToolUseBlock, ServerToolUseBlock } from '../../types/messages';

interface ToolCallBlockProps {
  /** The tool_use or server_tool_use content block */
  block: ToolUseBlock | ServerToolUseBlock;
  /** Whether the tool is still being invoked */
  isStreaming: boolean;
}

export function ToolCallBlock({ block, isStreaming }: ToolCallBlockProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const toolName = block.name;
  const input = block.input;
  const hasInput = Object.keys(input).length > 0;

  return (
    <div className="my-2 rounded-md border border-vscode-border overflow-hidden">
      {/* Collapsible header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-2 w-full px-3 py-2 text-left text-sm
          bg-[var(--vscode-editorGroupHeader-tabsBackground)]
          hover:bg-[var(--vscode-list-hoverBackground)]
          transition-colors"
      >
        {/* Chevron */}
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className={`transition-transform ${isExpanded ? 'rotate-90' : ''}`}
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>

        {/* Tool icon */}
        <ToolIcon />

        {/* Tool name */}
        <span className="font-mono text-xs font-medium">{toolName}</span>

        {/* Status indicator */}
        {isStreaming && (
          <span className="ml-auto flex items-center gap-1 text-xs opacity-50">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse" />
            Running
          </span>
        )}
        {!isStreaming && (
          <span className="ml-auto text-xs opacity-40">
            Done
          </span>
        )}
      </button>

      {/* Expandable content */}
      {isExpanded && (
        <div className="px-3 py-2 border-t border-vscode-border">
          {hasInput ? (
            <div>
              <div className="text-xs opacity-50 mb-1 font-semibold">Input</div>
              <pre className="text-xs font-mono overflow-x-auto p-2 rounded bg-[var(--vscode-editor-background)] whitespace-pre-wrap break-all">
                {formatToolInput(input)}
              </pre>
            </div>
          ) : (
            <div className="text-xs opacity-40 italic">No input</div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Helpers
// ============================================================================

function formatToolInput(input: Record<string, unknown>): string {
  try {
    return JSON.stringify(input, null, 2);
  } catch {
    return String(input);
  }
}

function ToolIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="opacity-60"
    >
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
    </svg>
  );
}
