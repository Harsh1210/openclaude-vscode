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
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const data = event.data;
      if (!data || typeof data !== 'object') return;

      if (data.type === 'process_state') {
        setStatus(data.state as ProcessStatus);
        // Clear auth error when process recovers
        if (data.state === 'running') {
          setAuthError(null);
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

  return { status, authError, setStatus };
}
