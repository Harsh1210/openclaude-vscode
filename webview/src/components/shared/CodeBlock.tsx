import { useState, useCallback } from 'react';

interface CodeBlockProps {
  children: string;
  language?: string;
  className?: string;
}

export function CodeBlock({ children, language, className }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const lang = language || extractLanguage(className);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(children);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
  }, [children]);

  return (
    <div className="code-block-wrapper group">
      {lang && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '2px 8px', fontSize: 11,
          background: 'var(--vscode-editorGroupHeader-tabsBackground)',
          borderBottom: '1px solid var(--app-input-border)',
          color: 'var(--app-secondary-foreground)',
        }}>
          <span style={{ fontFamily: 'var(--app-monospace-font-family)' }}>{lang}</span>
          <button onClick={handleCopy} style={{
            background: 'transparent', border: 'none', cursor: 'pointer',
            color: 'inherit', fontSize: 11, opacity: 0.7, padding: '1px 4px',
          }}>
            {copied ? '✓ Copied' : 'Copy'}
          </button>
        </div>
      )}
      <pre style={{ margin: 0, padding: 8, overflowX: 'auto', fontSize: 'var(--app-monospace-font-size)', fontFamily: 'var(--app-monospace-font-family)' }}>
        <code className={className}>{children}</code>
      </pre>
    </div>
  );
}

function extractLanguage(className?: string): string | undefined {
  if (!className) return undefined;
  const match = className.match(/language-(\S+)/);
  return match?.[1];
}
