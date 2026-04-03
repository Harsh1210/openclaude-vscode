import { useState, useEffect } from 'react';
import { vscode } from '../vscode';

export type ThemeKind = 'dark' | 'light' | 'high-contrast';

/**
 * React hook for detecting the VS Code color theme.
 *
 * Reads the initial theme from the #root data attribute (set by htmlGenerator.ts),
 * and listens for 'theme_changed' messages from the extension host.
 *
 * VS Code injects CSS custom properties (--vscode-*) into the webview automatically,
 * but this hook provides the theme KIND (dark/light/high-contrast) for conditional
 * rendering (e.g., different icons, different placeholder text).
 *
 * The actual colors come from Tailwind classes that reference CSS custom properties:
 *   bg-vscode-bg, text-vscode-fg, border-vscode-border, etc.
 * These are defined in webview/tailwind.config.ts and work automatically because
 * VS Code injects the --vscode-* CSS variables into every webview.
 */
export function useTheme(): ThemeKind {
  const [theme, setTheme] = useState<ThemeKind>(() => {
    // Read initial theme from data attribute set by htmlGenerator.ts
    const root = document.getElementById('root');
    const dataTheme = root?.getAttribute('data-theme');
    if (dataTheme === 'light' || dataTheme === 'dark' || dataTheme === 'high-contrast') {
      return dataTheme;
    }

    // Fallback: detect from VS Code's body class
    // VS Code adds 'vscode-dark', 'vscode-light', or 'vscode-high-contrast' to <body>
    if (document.body.classList.contains('vscode-light')) return 'light';
    if (document.body.classList.contains('vscode-high-contrast')) return 'high-contrast';
    return 'dark';
  });

  useEffect(() => {
    const unsubscribe = vscode.onMessage('theme_changed', (message) => {
      const newTheme = (message as unknown as { theme: ThemeKind }).theme;
      if (newTheme) {
        setTheme(newTheme);
      }
    });

    // Also listen for VS Code body class changes (belt and suspenders)
    const observer = new MutationObserver(() => {
      if (document.body.classList.contains('vscode-light')) setTheme('light');
      else if (document.body.classList.contains('vscode-high-contrast')) setTheme('high-contrast');
      else setTheme('dark');
    });

    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ['class'],
    });

    return () => {
      unsubscribe();
      observer.disconnect();
    };
  }, []);

  return theme;
}
