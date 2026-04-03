import * as vscode from 'vscode';

/**
 * Manages the OpenClaude integrated terminal instance.
 * When terminal mode is enabled, spawns the CLI in VS Code's terminal
 * instead of the webview panel.
 */
export class TerminalManager implements vscode.Disposable {
  private terminal: vscode.Terminal | undefined;
  private readonly disposables: vscode.Disposable[] = [];

  constructor() {
    this.disposables.push(
      vscode.window.onDidCloseTerminal((closed) => {
        if (closed === this.terminal) {
          this.terminal = undefined;
        }
      }),
    );
  }

  /**
   * Open or focus the OpenClaude terminal.
   * If a terminal already exists, just reveals it.
   */
  open(): void {
    if (this.terminal) {
      this.terminal.show();
      return;
    }

    const config = vscode.workspace.getConfiguration('openclaudeCode');
    const cliCommand = config.get<string>('claudeProcessWrapper', '') || 'openclaude';
    const cwd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

    const envVars = config.get<Array<{ name: string; value: string }>>(
      'environmentVariables',
      [],
    );
    const env: Record<string, string> = {};
    for (const v of envVars) {
      env[v.name] = v.value;
    }

    this.terminal = vscode.window.createTerminal({
      name: 'OpenClaude',
      cwd,
      env,
      iconPath: new vscode.ThemeIcon('sparkle'),
    });

    const flags: string[] = [];
    const model = config.get<string>('selectedModel', 'default');
    if (model && model !== 'default') {
      flags.push('--model', model);
    }
    const permMode = config.get<string>('initialPermissionMode', 'default');
    if (permMode && permMode !== 'default') {
      flags.push('--permission-mode', permMode);
    }

    this.terminal.sendText([cliCommand, ...flags].join(' '));
    this.terminal.show();
  }

  dispose(): void {
    this.terminal?.dispose();
    for (const d of this.disposables) {
      d.dispose();
    }
  }
}
