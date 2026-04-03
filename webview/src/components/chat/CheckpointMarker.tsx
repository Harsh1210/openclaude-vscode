// webview/src/components/chat/CheckpointMarker.tsx
//
// Hover affordance on assistant messages showing Fork/Rewind/Fork+Rewind actions.

import React, { useState, useCallback } from 'react';

export interface CheckpointInfo {
  messageUuid: string;
  fileCount: number;
  filenames: string[];
  canRewind: boolean;
}

export interface RewindPreview {
  canRewind: boolean;
  error?: string;
  filesChanged?: string[];
  insertions?: number;
  deletions?: number;
}

export interface CheckpointMarkerProps {
  checkpoint: CheckpointInfo;
  preview?: RewindPreview;
  isLoading?: boolean;
  onFork: (messageUuid: string) => void;
  onRewind: (messageUuid: string) => void;
  onForkAndRewind: (messageUuid: string) => void;
  onPreview: (messageUuid: string) => void;
}

export const CheckpointMarker: React.FC<CheckpointMarkerProps> = ({
  checkpoint,
  preview,
  isLoading = false,
  onFork,
  onRewind,
  onForkAndRewind,
  onPreview,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const handleMouseEnter = useCallback(() => {
    setIsExpanded(true);
    if (!preview && checkpoint.canRewind) {
      onPreview(checkpoint.messageUuid);
    }
  }, [preview, checkpoint, onPreview]);

  const handleMouseLeave = useCallback(() => {
    setIsExpanded(false);
  }, []);

  const handleFork = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onFork(checkpoint.messageUuid);
  }, [checkpoint.messageUuid, onFork]);

  const handleRewind = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onRewind(checkpoint.messageUuid);
  }, [checkpoint.messageUuid, onRewind]);

  const handleForkAndRewind = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onForkAndRewind(checkpoint.messageUuid);
  }, [checkpoint.messageUuid, onForkAndRewind]);

  return (
    <div className="group relative" onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}>
      <div
        className="flex items-center gap-1 px-1.5 py-0.5 rounded text-xs transition-opacity duration-150 opacity-0 group-hover:opacity-100 text-[var(--vscode-descriptionForeground)] hover:text-[var(--vscode-foreground)] cursor-pointer select-none"
        title="Checkpoint"
      >
        <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
          <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm0 12.5A5.5 5.5 0 1 1 8 2.5a5.5 5.5 0 0 1 0 11zM8 4v4l3 1.5-.5 1L7 9V4h1z" />
        </svg>
        <span>Checkpoint</span>
        {checkpoint.fileCount > 0 && (
          <span>({checkpoint.fileCount} file{checkpoint.fileCount !== 1 ? 's' : ''})</span>
        )}
      </div>

      {isExpanded && (
        <div className="absolute left-0 top-full mt-1 z-50 bg-[var(--vscode-menu-background)] border border-[var(--vscode-menu-border)] rounded-md shadow-lg py-1 min-w-[200px]">
          <ActionButton
            onClick={handleFork}
            disabled={isLoading}
            title="Start a new conversation branch (keeps code as-is)"
            label="Fork conversation"
            description="New branch, keep code"
            icon={<ForkIcon />}
          />
          <ActionButton
            onClick={handleRewind}
            disabled={isLoading || !checkpoint.canRewind}
            title="Revert files to this point (keep conversation history)"
            label="Rewind code"
            description="Revert files, keep conversation"
            icon={<RewindIcon />}
          />
          <ActionButton
            onClick={handleForkAndRewind}
            disabled={isLoading || !checkpoint.canRewind}
            title="Fork conversation AND revert files to this point"
            label="Fork + Rewind"
            description="New branch + revert files"
            icon={<ForkIcon />}
          />

          {preview && (
            <div className="px-3 py-1.5 border-t border-[var(--vscode-menu-separatorBackground,var(--vscode-menu-border))]">
              {preview.error ? (
                <div className="text-[10px] text-[var(--vscode-errorForeground)]">{preview.error}</div>
              ) : preview.filesChanged && preview.filesChanged.length > 0 ? (
                <div className="text-[10px] text-[var(--vscode-descriptionForeground)]">
                  <div className="font-medium mb-0.5">Would revert:</div>
                  {preview.filesChanged.map((file) => (
                    <div key={file} className="truncate pl-2">{file}</div>
                  ))}
                  {preview.insertions !== undefined && preview.deletions !== undefined && (
                    <div className="mt-0.5">
                      <span className="text-green-500">+{preview.insertions}</span>{' '}
                      <span className="text-red-500">-{preview.deletions}</span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-[10px] text-[var(--vscode-descriptionForeground)]">No file changes to revert</div>
              )}
            </div>
          )}

          {isLoading && (
            <div className="px-3 py-1 text-[10px] text-[var(--vscode-descriptionForeground)] italic">
              Processing...
            </div>
          )}
        </div>
      )}
    </div>
  );
};

interface ActionButtonProps {
  onClick: (e: React.MouseEvent) => void;
  disabled: boolean;
  title: string;
  label: string;
  description: string;
  icon: React.ReactNode;
}

function ActionButton({ onClick, disabled, title, label, description, icon }: ActionButtonProps) {
  return (
    <button
      className="w-full text-left px-3 py-1.5 text-xs text-[var(--vscode-menu-foreground)] hover:bg-[var(--vscode-menu-selectionBackground)] hover:text-[var(--vscode-menu-selectionForeground)] disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
      onClick={onClick}
      disabled={disabled}
      title={title}
    >
      {icon}
      <div>
        <div>{label}</div>
        <div className="text-[10px] text-[var(--vscode-descriptionForeground)]">{description}</div>
      </div>
    </button>
  );
}

function ForkIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
      <path d="M14 4a2 2 0 1 0-2.47 1.94L11 8.5a1.5 1.5 0 0 1-1.5 1.5h-3A1.5 1.5 0 0 1 5 8.5V5.94A2 2 0 1 0 3 4v4.5A3.5 3.5 0 0 0 6.5 12h3a3.5 3.5 0 0 0 3.5-3.5V5.94A2 2 0 0 0 14 4z" />
    </svg>
  );
}

function RewindIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
      <path d="M2.5 2v4.5H7L5.3 4.8A5 5 0 1 1 3 8H1.5a6.5 6.5 0 1 0 2.8-5.3L2.5 2z" />
    </svg>
  );
}
