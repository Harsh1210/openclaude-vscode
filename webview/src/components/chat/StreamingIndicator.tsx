interface StreamingIndicatorProps {
  visible: boolean;
}

export function StreamingIndicator({ visible }: StreamingIndicatorProps) {
  if (!visible) return null;

  return (
    <div style={{ padding: '8px 0', display: 'flex', alignItems: 'center', gap: 4 }}>
      {[0, 1, 2].map((i) => (
        <span key={i} style={{
          display: 'inline-block',
          width: 6, height: 6,
          borderRadius: '50%',
          backgroundColor: 'var(--app-secondary-foreground)',
          animation: `streamingDot 1.4s ease-in-out ${i * 0.16}s infinite`,
        }} />
      ))}
    </div>
  );
}
