import React from 'react';

interface ChatHeaderProps {
  sessionTitle: string;
  isSessionListOpen: boolean;
  onToggleSessionList: () => void;
  onNewConversation: () => void;
}

export const ChatHeader: React.FC<ChatHeaderProps> = ({
  sessionTitle,
  isSessionListOpen,
  onToggleSessionList,
  onNewConversation,
}) => {
  return (
    <div style={{
      display: 'flex',
      borderBottom: '1px solid var(--app-primary-border-color)',
      backgroundColor: 'var(--app-header-background)',
      userSelect: 'none',
      justifyContent: 'flex-start',
      gap: 4,
      padding: 6,
      alignItems: 'center',
      minHeight: 40,
    }}>
      {/* History button */}
      <button
        onClick={onToggleSessionList}
        className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors hover:bg-[var(--vscode-toolbar-hoverBackground)] ${
          isSessionListOpen ? 'bg-[var(--vscode-toolbar-activeBackground)]' : ''
        }`}
        title="Past Conversations"
        aria-label="Past Conversations"
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
          <path d="M13.507 12.324a7 7 0 0 0 .065-8.56A7 7 0 0 0 2 4.393V2H1v3.5l.5.5H5V5H2.811a6.008 6.008 0 1 1-.135 5.77l-.887.462a7 7 0 0 0 11.718 1.092zM8 4v4.5l.5.5H11v-1H9V4H8z"/>
        </svg>
        <span className="hidden sm:inline">History</span>
      </button>

      {/* Session title */}
      <div className="flex-1 text-center truncate px-2">
        <span className="text-xs font-medium opacity-80" title={sessionTitle}>
          {sessionTitle}
        </span>
      </div>

      {/* New conversation button */}
      <button
        onClick={onNewConversation}
        className="flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors hover:bg-[var(--vscode-toolbar-hoverBackground)]"
        title="New Conversation"
        aria-label="New Conversation"
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
          <path d="M14 7v1H8v6H7V8H1V7h6V1h1v6h6z"/>
        </svg>
        <span className="hidden sm:inline">New</span>
      </button>
    </div>
  );
};
