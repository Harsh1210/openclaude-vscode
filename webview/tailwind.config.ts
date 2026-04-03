import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Claude Code exact tokens
        'app-primary': 'var(--app-primary-foreground)',
        'app-secondary': 'var(--app-secondary-foreground)',
        'app-bg': 'var(--app-primary-background)',
        'app-bg-secondary': 'var(--app-secondary-background)',
        'app-input-bg': 'var(--app-input-background)',
        'app-input-bg-secondary': 'var(--app-input-secondary-background)',
        'app-input-border': 'var(--app-input-border)',
        'app-input-fg': 'var(--app-input-foreground)',
        'app-input-placeholder': 'var(--app-input-placeholder-foreground)',
        'app-orange': 'var(--app-claude-orange)',
        'app-orange-clay': 'var(--app-claude-clay-button-orange)',
        'app-error': 'var(--app-error-foreground)',
        'app-success': 'var(--app-success-foreground)',
        'app-warning-accent': '#e5a54b',
        'app-status-busy': 'var(--app-status-busy)',
        'app-status-pending': 'var(--app-status-pending)',
        'app-button-bg': 'var(--app-button-background)',
        'app-button-fg': 'var(--app-button-foreground)',
        'app-button-hover': 'var(--app-button-hover-background)',
        'app-list-hover': 'var(--app-list-hover-background)',
        'app-list-active-bg': 'var(--app-list-active-background)',
        'app-list-active-fg': 'var(--app-list-active-foreground)',
        'app-menu-bg': 'var(--app-menu-background)',
        'app-menu-fg': 'var(--app-menu-foreground)',
        'app-menu-border': 'var(--app-menu-border)',
        'app-header-bg': 'var(--app-header-background)',
        'app-badge-bg': 'var(--app-badge-background)',
        'app-badge-fg': 'var(--app-badge-foreground)',
        'app-mention-bg': 'var(--app-mention-chip-background)',
        'app-mention-fg': 'var(--app-mention-chip-foreground)',
        'app-disabled': 'var(--app-disabled-foreground)',
        'app-spinner': 'var(--app-spinner-foreground)',
        // Legacy vscode- aliases (keep for backward compat)
        'vscode-bg': 'var(--vscode-editor-background)',
        'vscode-fg': 'var(--vscode-editor-foreground)',
        'vscode-input-bg': 'var(--vscode-input-background)',
        'vscode-input-fg': 'var(--vscode-input-foreground)',
        'vscode-input-border': 'var(--vscode-input-border)',
        'vscode-button-bg': 'var(--vscode-button-background)',
        'vscode-button-fg': 'var(--vscode-button-foreground)',
        'vscode-button-hover': 'var(--vscode-button-hoverBackground)',
        'vscode-border': 'var(--vscode-panel-border)',
        'vscode-link': 'var(--vscode-textLink-foreground)',
        'vscode-badge-bg': 'var(--vscode-badge-background)',
        'vscode-badge-fg': 'var(--vscode-badge-foreground)',
      },
      spacing: {
        'app-sm': 'var(--app-spacing-small)',   // 4px
        'app-md': 'var(--app-spacing-medium)',  // 8px
        'app-lg': 'var(--app-spacing-large)',   // 12px
        'app-xl': 'var(--app-spacing-xlarge)',  // 16px
      },
      borderRadius: {
        'app-sm': 'var(--corner-radius-small)',   // 4px
        'app-md': 'var(--corner-radius-medium)',  // 6px
        'app-lg': 'var(--corner-radius-large)',   // 8px
      },
      fontFamily: {
        mono: ['var(--app-monospace-font-family)', 'monospace'],
        chat: ['var(--vscode-chat-font-family)', 'sans-serif'],
      },
      fontSize: {
        'app-mono': 'var(--app-monospace-font-size)',
        'app-mono-sm': 'var(--app-monospace-font-size-small)',
        'app-chat': ['var(--vscode-chat-font-size, 13px)', { lineHeight: '1.5' }],
      },
      maxWidth: {
        'input': '680px',
      },
    },
  },
  plugins: [],
} satisfies Config;
