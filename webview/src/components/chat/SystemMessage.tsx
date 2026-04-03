interface SystemMessageProps {
  text: string;
}

/**
 * Renders inline system messages (api_retry, compact_boundary, etc.)
 * Styled as subtle secondary text with a small icon — not a full message bubble.
 */
export function SystemMessage({ text }: SystemMessageProps) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '2px 0',
        color: 'var(--app-secondary-foreground)',
        fontSize: 11,
        opacity: 0.8,
        userSelect: 'none',
      }}
    >
      {/* Small info icon */}
      <svg
        width="12"
        height="12"
        viewBox="0 0 12 12"
        fill="currentColor"
        style={{ flexShrink: 0, opacity: 0.7 }}
      >
        <circle cx="6" cy="6" r="5" fill="none" stroke="currentColor" strokeWidth="1.2" />
        <rect x="5.4" y="5" width="1.2" height="4" rx="0.6" />
        <circle cx="6" cy="3.5" r="0.7" />
      </svg>
      <span>{text}</span>
    </div>
  );
}
