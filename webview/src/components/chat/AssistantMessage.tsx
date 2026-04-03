import { useState } from 'react';
import type { ChatMessage, RenderableBlock } from '../../types/chat';
import type { TextBlock, ThinkingBlock, ToolUseBlock, ServerToolUseBlock } from '../../types/messages';
import { MarkdownRenderer } from '../shared/MarkdownRenderer';
import { ToolCallBlock } from './ToolCallBlock';

interface AssistantMessageProps {
  message: ChatMessage;
}

export function AssistantMessage({ message }: AssistantMessageProps) {
  const blocks = message.blocks || [];

  return (
    <div className="px-4 py-2">
      {/* Assistant label */}
      <div className="flex items-center gap-2 mb-1">
        <AssistantIcon />
        <span className="text-xs font-medium opacity-70">Assistant</span>
        {message.model && (
          <span className="text-xs opacity-40">{message.model}</span>
        )}
      </div>

      {/* Content blocks */}
      <div className="pl-0">
        {blocks.map((renderableBlock) => (
          <BlockRenderer
            key={renderableBlock.index}
            renderableBlock={renderableBlock}
            isMessageStreaming={message.isStreaming}
          />
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// Block Renderer — dispatches to the right renderer per block type
// ============================================================================

interface BlockRendererProps {
  renderableBlock: RenderableBlock;
  isMessageStreaming: boolean;
}

function BlockRenderer({ renderableBlock, isMessageStreaming: _isMessageStreaming }: BlockRendererProps) {
  const { block, isStreaming } = renderableBlock;

  switch (block.type) {
    case 'text':
      return (
        <MarkdownRenderer
          content={(block as TextBlock).text}
          isStreaming={isStreaming}
        />
      );

    case 'thinking':
      return (
        <ThinkingBlockDisplay
          thinking={(block as ThinkingBlock).thinking}
          isStreaming={isStreaming}
        />
      );

    case 'redacted_thinking':
      return (
        <div className="my-2 text-xs opacity-40 italic px-3 py-1.5 rounded border border-vscode-border">
          Thinking...
        </div>
      );

    case 'tool_use':
    case 'server_tool_use':
      return (
        <ToolCallBlock
          block={block as ToolUseBlock | ServerToolUseBlock}
          isStreaming={isStreaming}
        />
      );

    case 'image':
      return (
        <div className="my-2">
          <img
            src={`data:${block.source.media_type};base64,${block.source.data}`}
            alt="Generated image"
            className="max-w-full rounded border border-vscode-border"
          />
        </div>
      );

    default:
      // Unknown block type — show raw JSON as fallback
      return (
        <div className="my-2 text-xs font-mono opacity-40 px-3 py-1.5 rounded border border-vscode-border overflow-x-auto">
          <pre>{JSON.stringify(block, null, 2)}</pre>
        </div>
      );
  }
}

// ============================================================================
// Thinking Block — Collapsible
// ============================================================================

interface ThinkingBlockDisplayProps {
  thinking: string;
  isStreaming: boolean;
}

function ThinkingBlockDisplay({ thinking, isStreaming }: ThinkingBlockDisplayProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!thinking && !isStreaming) return null;

  // Show a short summary (first 100 chars) when collapsed
  const summary = thinking.length > 100
    ? thinking.slice(0, 100) + '...'
    : thinking;

  return (
    <div className="my-2 rounded-md border border-vscode-border overflow-hidden opacity-70">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-2 w-full px-3 py-1.5 text-left text-xs
          bg-[var(--vscode-editorGroupHeader-tabsBackground)]
          hover:bg-[var(--vscode-list-hoverBackground)]
          transition-colors"
      >
        <svg
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className={`transition-transform ${isExpanded ? 'rotate-90' : ''}`}
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>
        <span className="font-medium">Thinking</span>
        {isStreaming && (
          <span className="ml-1 inline-block w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse" />
        )}
        {!isExpanded && (
          <span className="ml-2 opacity-50 truncate">{summary}</span>
        )}
      </button>

      {isExpanded && (
        <div className="px-3 py-2 border-t border-vscode-border text-xs font-mono whitespace-pre-wrap leading-relaxed max-h-64 overflow-y-auto">
          {thinking}
          {isStreaming && (
            <span className="inline-block w-1.5 h-3 bg-vscode-fg animate-pulse ml-0.5" />
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Icons
// ============================================================================

function AssistantIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      className="opacity-60"
    >
      <path d="M12 2a7 7 0 0 1 7 7v1a7 7 0 0 1-14 0V9a7 7 0 0 1 7-7z" />
      <path d="M5.4 17.3A9 9 0 0 0 12 20a9 9 0 0 0 6.6-2.7" />
      <circle cx="9" cy="10" r="1" fill="currentColor" />
      <circle cx="15" cy="10" r="1" fill="currentColor" />
    </svg>
  );
}
