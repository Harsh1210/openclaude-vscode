import { useState, useEffect } from 'react';

export type ProcessStatus =
  | 'idle'
  | 'starting'
  | 'running'
  | 'stopped'
  | 'crashed'
  | 'restarting'
  | 'rate_limited'
  | 'auth_error';

export interface RateLimitInfo {
  resetsAt: number; // Unix timestamp seconds
  rateLimitType: string;
  message: string;
}

export function useProcessState() {
  const [status, setStatus] = useState<ProcessStatus>('idle');
  const [rateLimitInfo, setRateLimitInfo] = useState<RateLimitInfo | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const data = event.data;
      if (!data || typeof data !== 'object') return;

      if (data.type === 'process_state') {
        setStatus(data.state as ProcessStatus);
        // Clear rate limit / auth error when process recovers
        if (data.state === 'running') {
          setRateLimitInfo(null);
          setAuthError(null);
        }
        return;
      }

      // Handle rate_limit_event from cli_output envelope
      if (data.type === 'cli_output' && data.data?.type === 'rate_limit_event') {
        const info = data.data.rate_limit_info as Record<string, unknown> | undefined;
        if (info) {
          const resetsAt = info.resetsAt as number;
          const rateLimitType = (info.rateLimitType as string) ?? 'unknown';
          setStatus('rate_limited');
          setRateLimitInfo({
            resetsAt,
            rateLimitType,
            message: `Rate limited (${rateLimitType}). Resets at ${new Date(resetsAt * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.`,
          });
        }
        return;
      }

      // Handle auth_status from cli_output envelope
      if (data.type === 'cli_output' && data.data?.type === 'auth_status') {
        const authData = data.data as Record<string, unknown>;
        if (authData.error) {
          setStatus('auth_error');
          setAuthError(authData.error as string);
        }
        return;
      }
    };

    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  return { status, rateLimitInfo, authError, setStatus };
}
