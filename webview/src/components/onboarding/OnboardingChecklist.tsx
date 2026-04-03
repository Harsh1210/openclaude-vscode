import React from 'react';

interface OnboardingChecklistProps {
  visible: boolean;
  onDismiss: () => void;
  onOpenWalkthrough: () => void;
}

const steps = [
  { label: 'Open OpenClaude', description: 'Click the icon in the toolbar or press Ctrl/Cmd+Escape.' },
  { label: 'Send a message', description: 'Type a question or request and press Enter.' },
  { label: 'Try @-mentions', description: 'Use @ to reference files or folders for context.' },
  { label: 'Browse past sessions', description: 'Click Past Conversations or type /resume.' },
];

export function OnboardingChecklist({ visible, onDismiss, onOpenWalkthrough }: OnboardingChecklistProps) {
  if (!visible) return null;

  return (
    <div
      style={{
        border: '1px solid var(--vscode-panel-border, #444)',
        borderRadius: 6,
        padding: '12px 16px',
        marginBottom: 12,
        background: 'var(--vscode-editor-background)',
        fontSize: 13,
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: 8 }}>Get started with OpenClaude</div>
      <ol style={{ margin: 0, paddingLeft: 20 }}>
        {steps.map((step) => (
          <li key={step.label} style={{ marginBottom: 4 }}>
            <span style={{ fontWeight: 500 }}>{step.label}</span>
            {' — '}
            <span style={{ opacity: 0.8 }}>{step.description}</span>
          </li>
        ))}
      </ol>
      <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
        <button
          onClick={onOpenWalkthrough}
          style={{
            cursor: 'pointer',
            padding: '4px 10px',
            background: 'var(--vscode-button-background)',
            color: 'var(--vscode-button-foreground)',
            border: 'none',
            borderRadius: 3,
            fontSize: 12,
          }}
        >
          Open Walkthrough
        </button>
        <button
          onClick={onDismiss}
          style={{
            cursor: 'pointer',
            padding: '4px 10px',
            background: 'transparent',
            color: 'var(--vscode-foreground)',
            border: '1px solid var(--vscode-button-border, #555)',
            borderRadius: 3,
            fontSize: 12,
          }}
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
