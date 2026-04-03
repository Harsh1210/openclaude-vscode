import React, { useState } from 'react';
import type { SessionData } from '../../hooks/useSession';

interface SessionCardProps {
  session: SessionData;
  isActive: boolean;
  onResume: (id: string) => void;
  onDelete: (id: string) => void;
}

/** Format ISO timestamp as a human-readable relative string. */
function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days = Math.floor(diff / 86_400_000);

  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export const SessionCard: React.FC<SessionCardProps> = ({
  session,
  isActive,
  onResume,
  onDelete,
}) => {
  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirmDelete) {
      onDelete(session.id);
      setConfirmDelete(false);
    } else {
      setConfirmDelete(true);
      setTimeout(() => setConfirmDelete(false), 3000);
    }
  };

  return (
    <div
      className={`group flex items-start gap-2 px-3 py-2 cursor-pointer rounded transition-colors ${
        isActive
          ? 'bg-[var(--vscode-list-activeSelectionBackground)] text-[var(--vscode-list-activeSelectionForeground)]'
          : 'hover:bg-[var(--vscode-list-hoverBackground)]'
      }`}
      onClick={() => onResume(session.id)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onResume(session.id);
      }}
    >
      {/* Session info */}
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium truncate" title={session.title}>
          {session.title}
        </div>
        <div className="flex items-center gap-2 mt-0.5 text-[10px] opacity-60">
          <span className="truncate max-w-[100px]" title={session.model}>
            {session.model}
          </span>
          <span>&middot;</span>
          <span>{formatRelativeTime(session.timestamp)}</span>
          <span>&middot;</span>
          <span>{session.messageCount} msg{session.messageCount !== 1 ? 's' : ''}</span>
        </div>
      </div>

      {/* Delete button — visible on hover, red on confirm */}
      <button
        className={`flex-shrink-0 p-1 rounded transition-all ${
          confirmDelete
            ? 'opacity-100 text-[var(--vscode-errorForeground)]'
            : 'opacity-0 group-hover:opacity-60 hover:!opacity-100'
        } hover:bg-[var(--vscode-toolbar-hoverBackground)]`}
        onClick={handleDeleteClick}
        title={confirmDelete ? 'Click again to confirm' : 'Delete session'}
        aria-label={confirmDelete ? 'Confirm delete' : 'Delete session'}
      >
        {confirmDelete ? (
          <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
            <path d="M14.431 3.323l-8.47 10-.79-.036-3.35-4.77.818-.574 2.978 4.24 8.051-9.506.763.646z"/>
          </svg>
        ) : (
          <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
            <path d="M10 3h3v1h-1v9l-1 1H4l-1-1V4H2V3h3V2a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v1zM9 2H6v1h3V2zM4 13h7V4H4v9zm2-8H5v7h1V5zm1 0h1v7H7V5zm2 0h1v7H9V5z"/>
          </svg>
        )}
      </button>
    </div>
  );
};
