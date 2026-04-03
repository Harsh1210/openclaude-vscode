import { useEffect } from 'react';
import type { ChatMessage } from '../../types/chat';
import { useAutoScroll } from '../../hooks/useAutoScroll';
import { UserMessage } from './UserMessage';
import { AssistantMessage } from './AssistantMessage';
import { StreamingIndicator } from './StreamingIndicator';

interface MessageListProps {
  messages: ChatMessage[];
  isStreaming: boolean;
}

export function MessageList({ messages, isStreaming }: MessageListProps) {
  const { containerRef, userScrolledUp, autoScroll, scrollToBottom } = useAutoScroll();

  // Auto-scroll when messages change or streaming content updates
  useEffect(() => {
    autoScroll();
  }, [messages, isStreaming, autoScroll]);

  if (messages.length === 0) {
    return (
      <div
        ref={containerRef}
        className="flex-1 flex items-center justify-center overflow-y-auto"
      >
        <EmptyState />
      </div>
    );
  }

  return (
    <div className="flex-1 relative">
      <div
        ref={containerRef}
        className="absolute inset-0 overflow-y-auto"
      >
        {/* Message list */}
        <div className="py-4">
          {messages.map((msg) => (
            <div key={msg.id}>
              {msg.role === 'user' ? (
                <UserMessage message={msg} />
              ) : (
                <AssistantMessage message={msg} />
              )}
            </div>
          ))}

          {/* Streaming indicator — shown when waiting for first content block */}
          <StreamingIndicator
            visible={isStreaming && !hasStreamingBlocks(messages)}
          />
        </div>
      </div>

      {/* Scroll-to-bottom button when user has scrolled up */}
      {userScrolledUp && (
        <button
          onClick={() => scrollToBottom('smooth')}
          className="absolute bottom-4 right-4 z-10
            flex items-center gap-1.5 px-3 py-1.5 rounded-full
            bg-vscode-button-bg text-vscode-button-fg text-xs
            shadow-lg hover:bg-vscode-button-hover transition-colors"
          title="Scroll to bottom"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="6 9 12 15 18 9" />
          </svg>
          New content
        </button>
      )}
    </div>
  );
}

// ============================================================================
// Helpers
// ============================================================================

/** Check if the last message has any streaming blocks (meaning content is arriving) */
function hasStreamingBlocks(messages: ChatMessage[]): boolean {
  const last = messages[messages.length - 1];
  if (!last || last.role !== 'assistant') return false;
  return (last.blocks?.length ?? 0) > 0;
}

function EmptyState() {
  return (
    <div className="text-center opacity-40 px-8">
      <div className="text-3xl mb-3">{"{ }"}</div>
      <p className="text-sm font-medium mb-1">No messages yet</p>
      <p className="text-xs">Type a message below to start a conversation.</p>
    </div>
  );
}
