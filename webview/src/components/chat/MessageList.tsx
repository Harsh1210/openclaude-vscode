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
        className="messages-container"
        style={{ justifyContent: 'center', alignItems: 'center' }}
      >
        <EmptyState />
      </div>
    );
  }

  return (
    <div className="flex-1 relative">
      <div
        ref={containerRef}
        className="messages-container"
        style={{ position: 'absolute', inset: 0 }}
      >
        {/* Message list */}
        <div>
          {messages.map((msg) => (
            <div key={msg.id} className="message">
              {msg.role === 'user' ? (
                <UserMessage message={msg} />
              ) : msg.role === 'system' ? (
                <SystemMessage text={msg.text ?? ''} />
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
    <div className="empty-state">
      <div className="empty-state-content" style={{ opacity: 0.4, padding: '0 20px' }}>
        <div style={{ fontSize: '2em', marginBottom: 12 }}>{"{ }"}</div>
        <p style={{ fontSize: '0.85em', fontWeight: 500, marginBottom: 4 }}>No messages yet</p>
        <p style={{ fontSize: '0.75em' }}>Type a message below to start a conversation.</p>
      </div>
    </div>
  );
}

/** Inline system message (api_retry, compact_boundary, tool_use_summary) */
function SystemMessage({ text }: { text: string }) {
  return (
    <div
      style={{
        color: 'var(--app-secondary-foreground)',
        fontSize: 11,
        fontStyle: 'italic',
        padding: '2px 0',
        opacity: 0.7,
      }}
    >
      {text}
    </div>
  );
}
