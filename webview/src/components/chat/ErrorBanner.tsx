import { useState, useEffect } from 'react';
import type { ProcessStatus, RateLimitInfo } from '../../hooks/useProcessState';
import { vscode } from '../../vscode';

interface ErrorBannerProps {
  status: ProcessStatus;
  rateLimitInfo: RateLimitInfo | null;
  authError: string | null;
  error?: string | null;
  onRetry?: () => void;
  onOpenSettings?: () => void;
}

export function ErrorBanner({
  status,
  rateLimitInfo,
  authError,
  error,
  onRetry,
  onOpenSettings,
}: ErrorBannerProps) {
  const [countdown, setCountdown] = useState<string | null>(null);
  // Track dismissed per unique rate-limit key (like Claude Code's dismissedRateLimitKey)
  const [dismissedKey, setDismissedKey] = useState<string | null>(null);

  // Compute a unique key for the current error state
  const currentKey = rateLimitInfo
    ? `${rateLimitInfo.rateLimitType}:${rateLimitInfo.resetsAt}`
    : error
      ? `error:${error.slice(0, 50)}`
      : status === 'crashed'
        ? 'crashed'
        : null;

  const dismissed = currentKey !== null && currentKey === dismissedKey;

  // Rate limit countdown timer
  useEffect(() => {
    if (!rateLimitInfo?.resetsAt) {
      setCountdown(null);
      return;
    }
    const update = () => {
      const now = Math.floor(Date.now() / 1000);
      const remaining = rateLimitInfo.resetsAt - now;
      if (remaining <= 0) {
        setCountdown(null);
        return;
      }
      const mins = Math.floor(remaining / 60);
      const secs = remaining % 60;
      setCountdown(mins > 0 ? `${mins}m ${secs}s` : `${secs}s`);
    };
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [rateLimitInfo]);

  const isVisible =
    !dismissed &&
    (status === 'crashed' ||
      status === 'rate_limited' ||
      status === 'auth_error' ||
      (!!error && status !== 'running' && status !== 'starting' && status !== 'idle'));

  if (!isVisible) return null;

  const isRateLimit = status === 'rate_limited' || !!rateLimitInfo;
  const isAuthError = status === 'auth_error' || !!authError;
  const isCrash = status === 'crashed';

  const bgColor = isRateLimit
    ? 'color-mix(in srgb, var(--app-warning-accent) 12%, transparent)'
    : 'color-mix(in srgb, var(--app-error-foreground) 10%, transparent)';
  const textColor = isRateLimit ? 'var(--app-warning-accent)' : 'var(--app-error-foreground)';

  let message: string;
  if (isRateLimit) {
    message = rateLimitInfo?.message ?? 'Rate limited.';
  } else if (isAuthError) {
    message = authError ?? 'Authentication failed.';
  } else if (isCrash) {
    message = error ?? 'Connection lost.';
  } else {
    message = error ?? 'An error occurred.';
  }

  return (
    <div
      style={{
        padding: '8px 16px',
        fontSize: 12,
        borderTop: '1px solid var(--app-input-border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
        backgroundColor: bgColor,
        color: textColor,
        animation: 'slideDown 0.15s ease-out',
      }}
      role="alert"
    >
      <span style={{ flex: 1 }}>
        {message}
        {countdown && (
          <span style={{ marginLeft: 8, fontVariantNumeric: 'tabular-nums' }}>
            Resets in {countdown}
          </span>
        )}
      </span>

      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
        {isAuthError && (
          <button
            onClick={() => {
              onOpenSettings?.();
              vscode.postMessage({ type: 'open_provider_picker' });
            }}
            style={actionButtonStyle}
          >
            Open Settings
          </button>
        )}
        {(isCrash || isRateLimit) && !isAuthError && (
          <button
            onClick={() => {
              onRetry?.();
              vscode.postMessage({ type: 'retry_connection' });
            }}
            style={actionButtonStyle}
          >
            {isCrash ? 'Reconnect' : 'Retry'}
          </button>
        )}
        <button
          onClick={() => setDismissedKey(currentKey)}
          title="Dismiss"
          style={{
            ...actionButtonStyle,
            padding: '2px 4px',
            opacity: 0.7,
          }}
        >
          ✕
        </button>
      </div>
    </div>
  );
}

const actionButtonStyle: React.CSSProperties = {
  padding: '2px 8px',
  fontSize: 11,
  borderRadius: 'var(--corner-radius-small)',
  border: '1px solid currentColor',
  background: 'transparent',
  color: 'inherit',
  cursor: 'pointer',
};
