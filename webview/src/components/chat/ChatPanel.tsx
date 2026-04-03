import { useChat } from '../../hooks/useChat';
import { ChatHeader } from './ChatHeader';
import { MessageList } from './MessageList';
import { CostDisplay } from '../shared/CostDisplay';

export function ChatPanel() {
  const {
    messages,
    sessionTitle,
    cost,
    isStreaming,
    model,
    error,
    sendMessage,
    interrupt,
  } = useChat();

  return (
    <div className="flex flex-col h-screen bg-vscode-bg text-vscode-fg">
      {/* Header */}
      <ChatHeader sessionTitle={sessionTitle} model={model} />

      {/* Message list */}
      <MessageList messages={messages} isStreaming={isStreaming} />

      {/* Error banner */}
      {error && (
        <div className="px-4 py-2 bg-[var(--vscode-inputValidation-errorBackground)] text-[var(--vscode-inputValidation-errorForeground)] text-xs border-t border-[var(--vscode-inputValidation-errorBorder)]">
          <span className="font-semibold">Error: </span>
          {error}
        </div>
      )}

      {/* Input placeholder (full input component comes in Story 5) */}
      <div className="px-4 py-3 border-t border-vscode-border shrink-0">
        <InputPlaceholder
          isStreaming={isStreaming}
          onSend={sendMessage}
          onInterrupt={interrupt}
        />

        {/* Cost display */}
        <CostDisplay cost={cost} className="mt-2 px-1" />
      </div>
    </div>
  );
}

// ============================================================================
// Temporary input placeholder (replaced in Story 5 by full PromptInput)
// ============================================================================

interface InputPlaceholderProps {
  isStreaming: boolean;
  onSend: (text: string) => void;
  onInterrupt: () => void;
}

function InputPlaceholder({ isStreaming, onSend, onInterrupt }: InputPlaceholderProps) {
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const text = e.currentTarget.value.trim();
      if (text) {
        onSend(text);
        e.currentTarget.value = '';
      }
    }
  };

  return (
    <div className="relative">
      <textarea
        placeholder={isStreaming ? 'Generating...' : 'Type a message... (Enter to send, Shift+Enter for newline)'}
        disabled={isStreaming}
        onKeyDown={handleKeyDown}
        rows={1}
        className="w-full resize-none rounded-md border border-vscode-input-border
          bg-vscode-input-bg text-vscode-input-fg px-3 py-2 text-sm
          outline-none focus:border-[var(--vscode-focusBorder)]
          disabled:opacity-50 disabled:cursor-not-allowed"
      />
      {isStreaming && (
        <button
          onClick={onInterrupt}
          className="absolute right-2 top-1/2 -translate-y-1/2
            px-2 py-1 rounded text-xs
            bg-[var(--vscode-inputValidation-errorBackground)]
            text-[var(--vscode-inputValidation-errorForeground)]
            hover:opacity-80 transition-opacity"
          title="Stop generation"
        >
          Stop
        </button>
      )}
    </div>
  );
}
