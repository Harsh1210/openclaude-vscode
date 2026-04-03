import { useState, useCallback } from 'react';

interface CodeBlockProps {
  /** The code content */
  children: string;
  /** Language identifier (from markdown fence) */
  language?: string;
  /** Pre-highlighted HTML from rehype-highlight (if available) */
  className?: string;
}

export function CodeBlock({ children, language, className }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  // Extract language from className if not explicitly provided
  // rehype-highlight sets className to "language-xxx"
  const lang = language || extractLanguage(className);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(children);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for environments without clipboard API
      console.warn('Failed to copy to clipboard');
    }
  }, [children]);

  return (
    <div className="group relative my-2 rounded-md border border-vscode-border overflow-hidden">
      {/* Header bar with language label and copy button */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-[var(--vscode-editorGroupHeader-tabsBackground)] border-b border-vscode-border text-xs">
        <span className="opacity-60 font-mono">
          {lang || 'text'}
        </span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 px-2 py-0.5 rounded text-xs
            opacity-0 group-hover:opacity-100 transition-opacity
            hover:bg-[var(--vscode-toolbar-hoverBackground)]
            text-vscode-fg"
          title="Copy code"
        >
          {copied ? (
            <>
              <CheckIcon />
              <span>Copied!</span>
            </>
          ) : (
            <>
              <CopyIcon />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>

      {/* Code content — rehype-highlight adds syntax classes to <code> children */}
      <pre className="overflow-x-auto p-3 m-0 text-sm leading-relaxed bg-[var(--vscode-editor-background)]">
        <code className={className}>
          {children}
        </code>
      </pre>
    </div>
  );
}

// ============================================================================
// Helpers
// ============================================================================

function extractLanguage(className?: string): string | undefined {
  if (!className) return undefined;
  // rehype-highlight sets className to "hljs language-xxx" or "language-xxx"
  const match = className.match(/language-(\S+)/);
  return match?.[1];
}

// ============================================================================
// Inline SVG Icons (avoids external icon dependency)
// ============================================================================

function CopyIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
