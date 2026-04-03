// webview/src/components/dialogs/PlanCommentIndicator.tsx
import React from 'react';

interface PlanCommentIndicatorProps {
  number: number;
  isActive: boolean;
  onClick: () => void;
}

/**
 * Small numbered badge that appears inline next to commented text in the plan.
 * Clicking it scrolls to / activates the corresponding comment in the sidebar.
 */
export const PlanCommentIndicator: React.FC<PlanCommentIndicatorProps> = ({
  number,
  isActive,
  onClick,
}) => {
  return (
    <button
      className={`inline-flex items-center justify-center w-4 h-4 rounded-full text-[9px] font-bold cursor-pointer border-none transition-colors mx-0.5 align-super ${
        isActive
          ? 'bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] scale-110'
          : 'bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] opacity-60 hover:opacity-100'
      }`}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      title={`Comment ${number}`}
      aria-label={`Go to comment ${number}`}
    >
      {number}
    </button>
  );
};
