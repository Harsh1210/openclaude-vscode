interface StreamingIndicatorProps {
  /** Whether to show the indicator */
  visible: boolean;
}

export function StreamingIndicator({ visible }: StreamingIndicatorProps) {
  if (!visible) return null;

  return (
    <div className="flex items-center gap-1.5 px-4 py-2" role="status" aria-label="Generating response">
      <div className="flex gap-1">
        <Dot delay="0ms" />
        <Dot delay="150ms" />
        <Dot delay="300ms" />
      </div>
      <span className="text-xs opacity-50 ml-1">Generating...</span>
    </div>
  );
}

function Dot({ delay }: { delay: string }) {
  return (
    <span
      className="inline-block w-1.5 h-1.5 rounded-full bg-vscode-fg opacity-40 animate-bounce"
      style={{ animationDelay: delay, animationDuration: '1s' }}
    />
  );
}
