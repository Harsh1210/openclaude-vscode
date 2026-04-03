import type { ChatMessage } from '../../types/chat';

interface UserMessageProps {
  message: ChatMessage;
}

export function UserMessage({ message }: UserMessageProps) {
  return (
    <div className="flex justify-end px-4 py-2">
      <div className="max-w-[85%]">
        {/* User label */}
        <div className="flex items-center justify-end gap-2 mb-1">
          <span className="text-xs opacity-50">You</span>
        </div>

        {/* Message bubble */}
        <div
          className="rounded-lg px-3 py-2 text-sm leading-relaxed
            bg-vscode-button-bg text-vscode-button-fg"
        >
          <p className="whitespace-pre-wrap break-words m-0">
            {message.text || ''}
          </p>
        </div>
      </div>
    </div>
  );
}
