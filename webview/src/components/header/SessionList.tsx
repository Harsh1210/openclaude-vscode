import React, { useRef, useEffect } from 'react';
import { SessionCard } from './SessionCard';
import type { SessionData, GroupedSessionData } from '../../hooks/useSession';

interface SessionListProps {
  groupedSessions: GroupedSessionData[];
  filteredSessions: SessionData[];
  searchQuery: string;
  onSearchChange: (query: string) => void;
  activeSessionId: string | null;
  onResumeSession: (id: string) => void;
  onDeleteSession: (id: string) => void;
  onClose: () => void;
}

export const SessionList: React.FC<SessionListProps> = ({
  groupedSessions,
  filteredSessions,
  searchQuery,
  onSearchChange,
  activeSessionId,
  onResumeSession,
  onDeleteSession,
  onClose,
}) => {
  const searchRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const isSearching = searchQuery.trim().length > 0;

  // Auto-focus search input on mount
  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  // Close on click outside (with brief delay to avoid catching the opening click)
  useEffect(() => {
    let cleanup: (() => void) | undefined;
    const timer = setTimeout(() => {
      const handler = (e: MouseEvent) => {
        if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
          onClose();
        }
      };
      document.addEventListener('mousedown', handler);
      cleanup = () => document.removeEventListener('mousedown', handler);
    }, 100);
    return () => {
      clearTimeout(timer);
      cleanup?.();
    };
  }, [onClose]);

  return (
    <div
      ref={panelRef}
      className="absolute top-[40px] left-0 right-0 z-50 bg-[var(--vscode-sideBar-background)] border border-vscode-border rounded-b shadow-lg max-h-[400px] flex flex-col"
    >
      {/* Search */}
      <div className="px-3 py-2 border-b border-vscode-border">
        <div className="relative">
          <svg
            className="absolute left-2 top-1/2 -translate-y-1/2 opacity-50"
            width="12" height="12" viewBox="0 0 16 16" fill="currentColor"
          >
            <path d="M15.25 15.02l-4.625-4.625a5.5 5.5 0 1 0-.707.707l4.625 4.625.707-.707zM6.5 11a4.5 4.5 0 1 1 0-9 4.5 4.5 0 0 1 0 9z"/>
          </svg>
          <input
            ref={searchRef}
            type="text"
            placeholder="Search past conversations..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full pl-7 pr-7 py-1.5 text-xs bg-vscode-input-bg text-vscode-input-fg border border-vscode-input-border rounded focus:outline-none focus:border-[var(--vscode-focusBorder)]"
          />
          {searchQuery && (
            <button
              onClick={() => onSearchChange('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 opacity-50 hover:opacity-100"
              aria-label="Clear search"
            >
              <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 8.707l3.646 3.647.708-.707L8.707 8l3.647-3.646-.707-.708L8 7.293 4.354 3.646l-.707.708L7.293 8l-3.646 3.646.707.708L8 8.707z"/>
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Session list body */}
      <div className="overflow-y-auto flex-1 py-1">
        {isSearching ? (
          filteredSessions.length > 0 ? (
            filteredSessions.map((s) => (
              <SessionCard
                key={s.id}
                session={s}
                isActive={s.id === activeSessionId}
                onResume={onResumeSession}
                onDelete={onDeleteSession}
              />
            ))
          ) : (
            <div className="px-3 py-6 text-center text-xs opacity-50">
              No sessions matching &ldquo;{searchQuery}&rdquo;
            </div>
          )
        ) : groupedSessions.length > 0 ? (
          groupedSessions.map((group) => (
            <div key={group.group}>
              <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider opacity-50">
                {group.group}
              </div>
              {group.sessions.map((s) => (
                <SessionCard
                  key={s.id}
                  session={s}
                  isActive={s.id === activeSessionId}
                  onResume={onResumeSession}
                  onDelete={onDeleteSession}
                />
              ))}
            </div>
          ))
        ) : (
          <div className="px-3 py-6 text-center text-xs opacity-50">
            No past conversations yet
          </div>
        )}
      </div>
    </div>
  );
};
