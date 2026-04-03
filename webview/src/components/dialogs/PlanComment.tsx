// webview/src/components/dialogs/PlanComment.tsx
import React, { useState, useRef, useEffect } from 'react';
import type { PlanComment as PlanCommentType } from '../../types/plan';

interface PlanCommentProps {
  comment: PlanCommentType;
  isActive: boolean;
  onActivate: () => void;
  onUpdate: (text: string) => void;
  onRemove: () => void;
}

export const PlanComment: React.FC<PlanCommentProps> = ({
  comment,
  isActive,
  onActivate,
  onUpdate,
  onRemove,
}) => {
  const [isEditing, setIsEditing] = useState(!comment.text);
  const [editText, setEditText] = useState(comment.text);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [isEditing]);

  const handleSave = () => {
    if (editText.trim()) {
      onUpdate(editText.trim());
      setIsEditing(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSave();
    }
    if (e.key === 'Escape') {
      if (!comment.text) {
        onRemove();
      } else {
        setEditText(comment.text);
        setIsEditing(false);
      }
    }
  };

  return (
    <div
      className={`border rounded-lg overflow-hidden transition-colors ${
        isActive
          ? 'border-[var(--vscode-focusBorder)] bg-[var(--vscode-list-activeSelectionBackground)]'
          : 'border-[var(--vscode-panel-border)] bg-[var(--vscode-editor-background)] hover:border-[var(--vscode-editor-foreground)]'
      }`}
      onClick={onActivate}
    >
      {/* Header with number badge and anchor text */}
      <div className="flex items-start gap-2 px-3 py-2 border-b border-[var(--vscode-panel-border)]">
        <span className="flex-shrink-0 w-5 h-5 rounded-full bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] text-xs font-bold flex items-center justify-center">
          {comment.number}
        </span>
        <blockquote className="text-xs text-[var(--vscode-descriptionForeground)] italic line-clamp-2 flex-1">
          "{comment.anchorText}"
        </blockquote>
        <button
          className="flex-shrink-0 p-0.5 text-[var(--vscode-descriptionForeground)] hover:text-red-400 bg-transparent border-none cursor-pointer"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          aria-label="Remove comment"
          title="Remove comment"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 16 16">
            <path d="M4.5 4.5l7 7M11.5 4.5l-7 7" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        </button>
      </div>

      {/* Comment body */}
      <div className="px-3 py-2">
        {isEditing ? (
          <div>
            <textarea
              ref={textareaRef}
              className="w-full px-2 py-1.5 text-xs rounded border border-[var(--vscode-input-border)] bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] outline-none resize-none focus:border-[var(--vscode-focusBorder)] min-h-[48px]"
              placeholder="Add your comment..."
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={2}
            />
            <div className="flex justify-end gap-1 mt-1">
              <button
                className="px-2 py-0.5 text-xs text-[var(--vscode-descriptionForeground)] hover:text-[var(--vscode-editor-foreground)] bg-transparent border-none cursor-pointer"
                onClick={() => {
                  if (!comment.text) onRemove();
                  else {
                    setEditText(comment.text);
                    setIsEditing(false);
                  }
                }}
              >
                Cancel
              </button>
              <button
                className="px-2 py-0.5 text-xs rounded bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] hover:bg-[var(--vscode-button-hoverBackground)] cursor-pointer border-none disabled:opacity-50"
                onClick={handleSave}
                disabled={!editText.trim()}
              >
                Save
              </button>
            </div>
            <div className="text-[10px] text-[var(--vscode-descriptionForeground)] mt-0.5">
              Cmd+Enter to save, Escape to cancel
            </div>
          </div>
        ) : (
          <div
            className="text-xs text-[var(--vscode-editor-foreground)] cursor-pointer hover:opacity-80"
            onClick={() => setIsEditing(true)}
            title="Click to edit"
          >
            {comment.text}
          </div>
        )}
      </div>
    </div>
  );
};
