interface ToolProgressProps {
  toolName: string;
  progress?: string;
  isComplete?: boolean;
  summary?: string;
}

/**
 * Renders tool_progress and tool_use_summary as inline indicators.
 * Shows spinner + tool name + progress text during execution.
 * Collapses to summary after completion.
 */
export function ToolProgress({ toolName, progress, isComplete, summary }: ToolProgressProps) {
  if (isComplete && summary) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '2px 0',
          color: 'var(--app-secondary-foreground)',
          fontSize: 11,
          opacity: 0.75,
        }}
      >
        {/* Checkmark */}
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ flexShrink: 0 }}>
          <path
            d="M2 6l3 3 5-5"
            stroke="var(--app-success-foreground)"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <span>
          <span style={{ fontWeight: 500 }}>{toolName}</span>
          {summary && <span style={{ marginLeft: 4, opacity: 0.8 }}>{summary}</span>}
        </span>
      </div>
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '2px 0',
        color: 'var(--app-secondary-foreground)',
        fontSize: 11,
      }}
    >
      {/* Spinning indicator */}
      <svg
        width="12"
        height="12"
        viewBox="0 0 12 12"
        fill="none"
        style={{
          flexShrink: 0,
          animation: 'spin 1s linear infinite',
        }}
      >
        <circle
          cx="6"
          cy="6"
          r="4.5"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeDasharray="14 8"
          strokeLinecap="round"
        />
      </svg>
      <span>
        <span style={{ fontWeight: 500 }}>{toolName}</span>
        {progress && <span style={{ marginLeft: 4, opacity: 0.8 }}>{progress}</span>}
      </span>
    </div>
  );
}
