import React from 'react';

interface PromptSuggestionsProps {
  suggestions: string[];
  onSelect: (suggestion: string) => void;
  isVisible: boolean;
}

export const PromptSuggestions: React.FC<PromptSuggestionsProps> = ({
  suggestions,
  onSelect,
  isVisible,
}) => {
  if (!isVisible || suggestions.length === 0) return null;

  return (
    <div className="px-3 py-2">
      <div className="text-xs text-vscode-fg/40 mb-1.5">Suggested prompts:</div>
      <div className="flex flex-wrap gap-1.5">
        {suggestions.map((suggestion, i) => (
          <button
            key={i}
            className="px-2.5 py-1 text-xs rounded-full border border-vscode-border text-vscode-fg/70 bg-transparent hover:bg-vscode-input-bg hover:text-vscode-fg hover:border-vscode-fg/40 cursor-pointer transition-colors"
            onClick={() => onSelect(suggestion)}
            title={suggestion}
          >
            {suggestion.length > 60 ? suggestion.slice(0, 57) + '...' : suggestion}
          </button>
        ))}
      </div>
    </div>
  );
};
