import { vscode } from '../../vscode';

interface ChatHeaderProps {
  sessionTitle: string | null;
  model: string | null;
}

export function ChatHeader({ sessionTitle, model }: ChatHeaderProps) {
  const handleNewConversation = () => {
    vscode.postMessage({ type: 'newConversation' });
  };

  const handleOpenSessionList = () => {
    vscode.postMessage({ type: 'openSessionList' });
  };

  return (
    <div className="flex items-center justify-between px-4 py-2 border-b border-vscode-border shrink-0">
      {/* Left: session title */}
      <div className="flex items-center gap-2 min-w-0">
        <h1 className="text-sm font-semibold truncate">
          {sessionTitle || 'OpenClaude'}
        </h1>
        {model && (
          <span className="text-xs opacity-40 shrink-0">{model}</span>
        )}
      </div>

      {/* Right: action buttons */}
      <div className="flex items-center gap-1 shrink-0">
        {/* Past conversations */}
        <button
          onClick={handleOpenSessionList}
          className="p-1.5 rounded hover:bg-[var(--vscode-toolbar-hoverBackground)] transition-colors"
          title="Past conversations"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 8v4l3 3" />
            <circle cx="12" cy="12" r="10" />
          </svg>
        </button>

        {/* New conversation */}
        <button
          onClick={handleNewConversation}
          className="p-1.5 rounded hover:bg-[var(--vscode-toolbar-hoverBackground)] transition-colors"
          title="New conversation"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
      </div>
    </div>
  );
}
