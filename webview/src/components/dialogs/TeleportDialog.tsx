// webview/src/components/dialogs/TeleportDialog.tsx
import React from 'react';
import type { TeleportInfo } from '../../types/interactions';

interface TeleportDialogProps {
  info: TeleportInfo;
  onAccept: () => void;
  onReject: () => void;
}

export const TeleportDialog: React.FC<TeleportDialogProps> = ({
  info,
  onAccept,
  onReject,
}) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-[var(--vscode-editor-background)] border border-[var(--vscode-panel-border)] rounded-lg shadow-xl max-w-md w-full mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--vscode-panel-border)] bg-[var(--vscode-input-background)]">
          <svg className="w-5 h-5 text-[var(--vscode-textLink-foreground)] flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" />
          </svg>
          <h2 className="text-sm font-semibold text-[var(--vscode-editor-foreground)]">Incoming Session Transfer</h2>
        </div>

        {/* Body */}
        <div className="px-4 py-4">
          <p className="text-sm text-[var(--vscode-descriptionForeground)] mb-4">
            A session is being transferred to this device. Would you like to accept it?
          </p>

          <div className="space-y-2 text-xs bg-[var(--vscode-input-background)] rounded p-3 border border-[var(--vscode-input-border)]">
            <div className="flex justify-between">
              <span className="text-[var(--vscode-descriptionForeground)]">Source device</span>
              <span className="text-[var(--vscode-editor-foreground)] font-mono">{info.sourceDevice}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--vscode-descriptionForeground)]">Branch</span>
              <span className="text-[var(--vscode-editor-foreground)] font-mono">{info.branch}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--vscode-descriptionForeground)]">Messages</span>
              <span className="text-[var(--vscode-editor-foreground)]">{info.messageCount}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--vscode-descriptionForeground)]">Session ID</span>
              <span className="text-[var(--vscode-editor-foreground)] font-mono text-[10px] truncate max-w-[180px]">
                {info.remoteSessionId}
              </span>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2 px-4 py-3 border-t border-[var(--vscode-panel-border)] bg-[var(--vscode-input-background)]">
          <button
            className="px-3 py-1.5 text-xs rounded border border-[var(--vscode-input-border)] text-[var(--vscode-editor-foreground)] bg-transparent hover:bg-[var(--vscode-input-background)] cursor-pointer"
            onClick={onReject}
          >
            Reject
          </button>
          <button
            className="px-3 py-1.5 text-xs rounded bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] hover:bg-[var(--vscode-button-hoverBackground)] cursor-pointer border-none"
            onClick={onAccept}
            autoFocus
          >
            Accept Transfer
          </button>
        </div>
      </div>
    </div>
  );
};
