// webview/src/components/chat/MessageActions.tsx
import React, { useState, useCallback } from 'react';
import { vscode } from '../../vscode';

interface MessageActionsProps {
  /** Whether this is an assistant message (shows copy, retry on failure) or user message (shows edit) */
  messageRole: 'user' | 'assistant';
  /** The raw text content of the message (for copy/edit) */
  content: string;
  /** Message UUID */
  uuid: string;
  /** Whether this message failed (shows retry button) */
  isFailed?: boolean;
  /** Whether streaming is in progress (shows stop button) */
  isStreaming?: boolean;
  /** Whether this is the most recent assistant message */
  isLatest?: boolean;
  /** Callback when user edits their message */
  onEdit?: (uuid: string, newContent: string) => void;
  /** Callback for retry */
  onRetry?: (uuid: string) => void;
  /** Callback for stop */
  onStop?: () => void;
}

export const MessageActions: React.FC<MessageActionsProps> = ({
  messageRole,
  content,
  uuid,
  isFailed = false,
  isStreaming = false,
  isLatest = false,
  onEdit,
  onRetry,
  onStop,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(content);
  const [showCopied, setShowCopied] = useState(false);

  const handleCopy = useCallback(() => {
    vscode.postMessage({ type: 'copy_message', content });
    setShowCopied(true);
    setTimeout(() => setShowCopied(false), 2000);
  }, [content]);

  const handleEdit = useCallback(() => {
    setEditText(content);
    setIsEditing(true);
  }, [content]);

  const handleEditSubmit = useCallback(() => {
    if (editText.trim() && editText !== content) {
      onEdit?.(uuid, editText);
    }
    setIsEditing(false);
  }, [editText, content, uuid, onEdit]);

  const handleEditCancel = useCallback(() => {
    setIsEditing(false);
    setEditText(content);
  }, [content]);

  const handleEditKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleEditSubmit();
      }
      if (e.key === 'Escape') {
        handleEditCancel();
      }
    },
    [handleEditSubmit, handleEditCancel],
  );

  // Edit inline UI
  if (isEditing) {
    return (
      <div className="mt-2 border border-[var(--vscode-input-border)] rounded overflow-hidden">
        <textarea
          className="w-full px-3 py-2 text-sm bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] border-none outline-none resize-none min-h-[60px]"
          value={editText}
          onChange={(e) => setEditText(e.target.value)}
          onKeyDown={handleEditKeyDown}
          autoFocus
        />
        <div className="flex justify-end gap-1 px-2 py-1 bg-[var(--vscode-input-background)] border-t border-[var(--vscode-input-border)]">
          <button
            className="px-2 py-0.5 text-xs text-[var(--vscode-descriptionForeground)] hover:text-[var(--vscode-editor-foreground)] bg-transparent border-none cursor-pointer"
            onClick={handleEditCancel}
          >
            Cancel
          </button>
          <button
            className="px-2 py-0.5 text-xs bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] rounded cursor-pointer border-none hover:bg-[var(--vscode-button-hoverBackground)]"
            onClick={handleEditSubmit}
          >
            Send
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
      {/* Stop button — visible during streaming on latest assistant message */}
      {isStreaming && isLatest && messageRole === 'assistant' && (
        <ActionButton
          label="Stop generation"
          icon={
            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 16 16">
              <rect x="3" y="3" width="10" height="10" rx="1" />
            </svg>
          }
          onClick={onStop}
          variant="danger"
        />
      )}

      {/* Retry button — on failed assistant messages */}
      {isFailed && messageRole === 'assistant' && (
        <ActionButton
          label="Retry"
          icon={
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 16 16">
              <path d="M13.5 2v4h-4M2.5 14v-4h4" stroke="currentColor" strokeWidth="1.5" />
              <path d="M4.1 10.5A5 5 0 0113.5 6M11.9 5.5A5 5 0 002.5 10" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          }
          onClick={() => onRetry?.(uuid)}
        />
      )}

      {/* Copy button — on all assistant messages */}
      {messageRole === 'assistant' && (
        <ActionButton
          label={showCopied ? 'Copied!' : 'Copy message'}
          icon={
            showCopied ? (
              <svg className="w-3.5 h-3.5 text-green-500" fill="none" viewBox="0 0 16 16">
                <path d="M13 4L6 11 3 8" stroke="currentColor" strokeWidth="2" />
              </svg>
            ) : (
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 16 16">
                <rect x="5" y="5" width="8" height="8" rx="1" stroke="currentColor" />
                <path d="M3 11V3h8" stroke="currentColor" />
              </svg>
            )
          }
          onClick={handleCopy}
        />
      )}

      {/* Edit button — on user messages */}
      {messageRole === 'user' && (
        <ActionButton
          label="Edit message"
          icon={
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 16 16">
              <path d="M11.5 1.5l3 3-9 9H2.5v-3l9-9z" stroke="currentColor" strokeWidth="1" />
            </svg>
          }
          onClick={handleEdit}
        />
      )}
    </div>
  );
};

/** Small icon button used in the actions toolbar */
const ActionButton: React.FC<{
  label: string;
  icon: React.ReactNode;
  onClick?: () => void;
  variant?: 'default' | 'danger';
}> = ({ label, icon, onClick, variant = 'default' }) => (
  <button
    className={`p-1 rounded hover:bg-[var(--vscode-input-background)] cursor-pointer border-none bg-transparent ${
      variant === 'danger'
        ? 'text-red-400 hover:text-red-300'
        : 'text-[var(--vscode-descriptionForeground)] hover:text-[var(--vscode-editor-foreground)]'
    }`}
    onClick={onClick}
    title={label}
    aria-label={label}
  >
    {icon}
  </button>
);
