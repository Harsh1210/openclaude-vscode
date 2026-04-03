import React from 'react';

interface FastModeToggleProps {
  isEnabled: boolean;
  canToggle: boolean;
  onToggle?: () => void;
}

export const FastModeToggle: React.FC<FastModeToggleProps> = ({ isEnabled, canToggle, onToggle }) => {
  const handleToggle = () => {
    if (!canToggle) return;
    if (onToggle) {
      onToggle();
    }
  };

  return (
    <button
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border cursor-pointer transition-colors ${
        isEnabled
          ? 'bg-yellow-500/15 border-yellow-500/40 text-yellow-500 hover:bg-yellow-500/25'
          : 'bg-transparent border-vscode-border text-vscode-fg/50 hover:border-vscode-fg/40 hover:text-vscode-fg/70'
      } ${!canToggle ? 'opacity-50 cursor-not-allowed' : ''}`}
      onClick={handleToggle}
      disabled={!canToggle}
      title={
        !canToggle
          ? 'Fast mode is controlled by managed settings'
          : isEnabled
            ? 'Disable fast mode'
            : 'Enable fast mode'
      }
      aria-pressed={isEnabled}
      aria-label="Fast mode toggle"
    >
      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 16 16">
        <path d="M8.5 1.5l-5 7h4l-1 6 5-7h-4l1-6z" />
      </svg>
      <span>Fast</span>
      {isEnabled && (
        <span className="w-1.5 h-1.5 rounded-full bg-yellow-500 animate-pulse" />
      )}
    </button>
  );
};
