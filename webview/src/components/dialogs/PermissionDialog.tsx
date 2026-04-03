// webview/src/components/dialogs/PermissionDialog.tsx
// Modal dialog showing a permission request with tool info and action buttons.

import { useEffect, useCallback } from 'react';
import type { PermissionRequest } from '../../hooks/usePermissions';

interface PermissionDialogProps {
  request: PermissionRequest;
  pendingCount: number;
  onAllow: (requestId: string) => void;
  onAlwaysAllow: (requestId: string) => void;
  onDeny: (requestId: string) => void;
}

/** Classify risk level for color coding */
function getRiskColor(riskLevel?: string): { bg: string; border: string; text: string; badge: string } {
  switch (riskLevel) {
    case 'high':
      return {
        bg: 'bg-red-500/10',
        border: 'border-red-500/40',
        text: 'text-red-400',
        badge: 'bg-red-500/20 text-red-300',
      };
    case 'medium':
      return {
        bg: 'bg-yellow-500/10',
        border: 'border-yellow-500/40',
        text: 'text-yellow-400',
        badge: 'bg-yellow-500/20 text-yellow-300',
      };
    default:
      return {
        bg: 'bg-blue-500/10',
        border: 'border-blue-500/40',
        text: 'text-blue-400',
        badge: 'bg-blue-500/20 text-blue-300',
      };
  }
}

/** Format tool input for display */
function formatToolInput(toolName: string, input: Record<string, unknown>): string {
  // Special formatting for bash/execute commands
  if (toolName.toLowerCase().includes('bash') || toolName.toLowerCase().includes('execute')) {
    const cmd = input.command ?? input.cmd ?? input.script;
    if (typeof cmd === 'string') return cmd;
  }

  // Special formatting for file read/search tools
  if (toolName.toLowerCase().includes('read') || toolName.toLowerCase().includes('search')) {
    const path = input.path ?? input.file ?? input.pattern;
    if (typeof path === 'string') return path;
  }

  // Special formatting for file edit tools
  if (toolName.toLowerCase().includes('write') || toolName.toLowerCase().includes('edit')) {
    const path = input.path ?? input.file_path ?? input.filename;
    if (typeof path === 'string') {
      const content = input.content ?? input.new_string ?? input.text;
      if (typeof content === 'string') {
        const preview = content.length > 200 ? content.substring(0, 200) + '...' : content;
        return `${path}\n\n${preview}`;
      }
      return String(path);
    }
  }

  // Default: JSON stringify
  try {
    return JSON.stringify(input, null, 2);
  } catch {
    return String(input);
  }
}

export function PermissionDialog({
  request,
  pendingCount,
  onAllow,
  onAlwaysAllow,
  onDeny,
}: PermissionDialogProps) {
  const colors = getRiskColor(request.riskLevel);

  // Keyboard shortcuts: Enter=Allow, Escape=Deny
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        onAllow(request.requestId);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onDeny(request.requestId);
      }
    },
    [request.requestId, onAllow, onDeny],
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const displayName = request.title || request.toolName;
  const formattedInput = formatToolInput(request.toolName, request.toolInput);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div
        className={`w-full max-w-lg mx-4 rounded-lg border ${colors.border} bg-[var(--vscode-editor-background)] shadow-xl`}
      >
        {/* Header */}
        <div className={`px-4 py-3 rounded-t-lg ${colors.bg} border-b ${colors.border}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className={`text-sm font-medium ${colors.text}`}>
                Permission Request
              </span>
              <span className={`text-xs px-1.5 py-0.5 rounded ${colors.badge}`}>
                {request.riskLevel ?? 'low'}
              </span>
            </div>
            {pendingCount > 1 && (
              <span className="text-xs text-[var(--vscode-descriptionForeground)]">
                +{pendingCount - 1} more
              </span>
            )}
          </div>
          <div className="mt-1 text-sm font-semibold text-[var(--vscode-editor-foreground)]">
            {displayName}
          </div>
          {request.description && (
            <div className="mt-0.5 text-xs text-[var(--vscode-descriptionForeground)]">
              {request.description}
            </div>
          )}
        </div>

        {/* Body */}
        <div className="px-4 py-3 max-h-64 overflow-y-auto">
          {/* Decision reason */}
          {request.decisionReason && (
            <div className="mb-2 text-xs text-[var(--vscode-descriptionForeground)] italic">
              {request.decisionReason}
            </div>
          )}

          {/* Blocked path warning */}
          {request.blockedPath && (
            <div className="mb-2 px-2 py-1.5 rounded text-xs bg-red-500/10 border border-red-500/30 text-red-400">
              ⚠ Blocked path: {request.blockedPath}
            </div>
          )}

          {/* Tool input */}
          <pre className="text-xs font-mono whitespace-pre-wrap break-all text-[var(--vscode-editor-foreground)] bg-[var(--vscode-input-background)] rounded p-2 border border-[var(--vscode-input-border)]">
            {formattedInput}
          </pre>

          {/* Agent ID */}
          {request.agentId && (
            <div className="mt-2 text-xs text-[var(--vscode-descriptionForeground)]">
              Agent: {request.agentId}
            </div>
          )}
        </div>

        {/* Footer with buttons */}
        <div className="px-4 py-3 border-t border-[var(--vscode-panel-border)] flex items-center justify-between">
          <span className="text-xs text-[var(--vscode-descriptionForeground)]">
            Enter=Allow · Esc=Deny
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => onDeny(request.requestId)}
              className="px-3 py-1.5 text-xs rounded border border-[var(--vscode-input-border)] text-[var(--vscode-editor-foreground)] hover:bg-[var(--vscode-input-background)] transition-colors"
            >
              Deny
            </button>
            <button
              onClick={() => onAlwaysAllow(request.requestId)}
              className="px-3 py-1.5 text-xs rounded border border-[var(--vscode-input-border)] text-[var(--vscode-editor-foreground)] hover:bg-[var(--vscode-input-background)] transition-colors"
            >
              Always Allow
            </button>
            <button
              onClick={() => onAllow(request.requestId)}
              className="px-3 py-1.5 text-xs rounded bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] hover:bg-[var(--vscode-button-hoverBackground)] transition-colors"
            >
              Allow
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
