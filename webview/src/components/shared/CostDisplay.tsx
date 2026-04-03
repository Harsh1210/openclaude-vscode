import type { SessionCost } from '../../types/chat';

interface CostDisplayProps {
  cost: SessionCost;
  className?: string;
}

export function CostDisplay({ cost, className = '' }: CostDisplayProps) {
  if (cost.totalCostUSD === 0 && cost.inputTokens === 0) {
    return null;
  }

  return (
    <div
      className={`flex items-center gap-3 text-xs opacity-60 ${className}`}
      title={buildTooltip(cost)}
    >
      <span>{formatCost(cost.totalCostUSD)}</span>
      <span className="opacity-40">|</span>
      <span>{formatTokens(cost.inputTokens + cost.outputTokens)} tokens</span>
      {cost.numTurns > 0 && (
        <>
          <span className="opacity-40">|</span>
          <span>{cost.numTurns} {cost.numTurns === 1 ? 'turn' : 'turns'}</span>
        </>
      )}
      {cost.durationMs > 0 && (
        <>
          <span className="opacity-40">|</span>
          <span>{formatDuration(cost.durationMs)}</span>
        </>
      )}
    </div>
  );
}

// ============================================================================
// Formatters
// ============================================================================

function formatCost(usd: number): string {
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  if (usd < 1) return `$${usd.toFixed(3)}`;
  return `$${usd.toFixed(2)}`;
}

function formatTokens(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}k`;
  return String(count);
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

function buildTooltip(cost: SessionCost): string {
  const lines = [
    `Total cost: ${formatCost(cost.totalCostUSD)}`,
    `Input tokens: ${cost.inputTokens.toLocaleString()}`,
    `Output tokens: ${cost.outputTokens.toLocaleString()}`,
  ];
  if (cost.cacheReadTokens > 0) {
    lines.push(`Cache read: ${cost.cacheReadTokens.toLocaleString()}`);
  }
  if (cost.cacheCreationTokens > 0) {
    lines.push(`Cache creation: ${cost.cacheCreationTokens.toLocaleString()}`);
  }
  if (cost.numTurns > 0) {
    lines.push(`Turns: ${cost.numTurns}`);
  }
  if (cost.durationMs > 0) {
    lines.push(`Duration: ${formatDuration(cost.durationMs)}`);
  }
  return lines.join('\n');
}
