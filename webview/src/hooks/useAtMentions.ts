import { useState, useCallback, useEffect, useRef } from 'react';
import { vscode } from '../vscode';

export interface AtMentionResult {
  type: 'file' | 'folder' | 'line_range' | 'terminal' | 'browser';
  label: string;
  detail: string;
  insertText: string;
  icon: string;
}

interface UseAtMentionsReturn {
  results: AtMentionResult[];
  isLoading: boolean;
  query: (text: string) => void;
  clear: () => void;
}

/**
 * Hook for @-mention search. Sends queries to extension host via postMessage,
 * receives results back. Debounces queries by 150ms.
 */
export function useAtMentions(): UseAtMentionsReturn {
  const [results, setResults] = useState<AtMentionResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestQuery = useRef<string>('');

  // Listen for results from extension host
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const message = event.data;
      if (message.type === 'at_mention_results') {
        // Only accept results for the latest query (prevent stale updates)
        if (message.query === latestQuery.current) {
          setResults(message.results);
          setIsLoading(false);
        }
      }
    };

    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const query = useCallback((text: string) => {
    latestQuery.current = text;

    // Clear previous debounce
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }

    setIsLoading(true);

    // Debounce the postMessage query
    debounceTimer.current = setTimeout(() => {
      vscode.postMessage({
        type: 'at_mention_query',
        query: text,
      });
    }, 150);
  }, []);

  const clear = useCallback(() => {
    latestQuery.current = '';
    setResults([]);
    setIsLoading(false);
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }
  }, []);

  return { results, isLoading, query, clear };
}
