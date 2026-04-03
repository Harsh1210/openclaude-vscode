import * as vscode from 'vscode';
import { WebviewManager } from './webview/webviewManager';
import { OpenClaudeWebviewProvider, OpenClaudePanelSerializer } from './webview/webviewProvider';
import { ProcessManager, ProcessState } from './process/processManager';
import { createDiffContentProviders } from './diff/diffContentProvider';
import { DiffManager } from './diff/diffManager';

let webviewManager: WebviewManager | undefined;
let diffManagerInstance: DiffManager | undefined;

/** Get the active DiffManager instance (available after activation). */
export function getDiffManager(): DiffManager | undefined {
  return diffManagerInstance;
}

export function activate(context: vscode.ExtensionContext) {
  const output = vscode.window.createOutputChannel('OpenClaude', { log: true });
  context.subscriptions.push(output);

  output.info('OpenClaude VS Code extension activated');

  // === Diff system: register URI schemes and create DiffManager ===
  const { original, proposed, disposables: diffProviderDisposables } =
    createDiffContentProviders();
  context.subscriptions.push(...diffProviderDisposables);

  const diffManager = new DiffManager(original, proposed, output);
  context.subscriptions.push(diffManager);
  diffManagerInstance = diffManager;

  // Create the WebviewManager — central orchestrator for all panels
  webviewManager = new WebviewManager(context.extensionUri, context, output);
  context.subscriptions.push(webviewManager);

  const provider = new OpenClaudeWebviewProvider(webviewManager);

  // Check if secondary sidebar is supported (VS Code 1.106+)
  const [major, minor] = vscode.version.split('.').map(Number);
  const supportsSecondarySidebar = major > 1 || (major === 1 && minor >= 106);

  if (!supportsSecondarySidebar) {
    vscode.commands.executeCommand(
      'setContext',
      'openclaude:doesNotSupportSecondarySidebar',
      true,
    );
  }

  // Register sidebar webview providers
  // Pattern from Claude Code: register the same provider for both sidebar locations
  // with retainContextWhenHidden to preserve webview state when the sidebar is collapsed
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('openclaudeSidebar', provider, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
  );
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('openclaudeSidebarSecondary', provider, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
  );

  // Register session list sidebar view
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('openclaudeSessionsList', {
      resolveWebviewView(webviewView, _ctx, _token) {
        // Sessions list uses the same manager but with isSessionListOnly flag
        // Full implementation comes in Story 7 (Session Management)
        webviewManager!.resolveSidebarView(webviewView);
      },
    }, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
  );

  // Register panel serializer for restoring panels across VS Code restarts
  context.subscriptions.push(
    vscode.window.registerWebviewPanelSerializer(
      'openclaudePanel',
      new OpenClaudePanelSerializer(webviewManager),
    ),
  );

  // Track preferred location (sidebar vs panel)
  let preferredLocation: 'sidebar' | 'panel' = 'panel';

  // Status bar item — shows when sidebar is preferred
  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right);
  statusBar.text = '$(sparkle) OpenClaude';
  statusBar.command = 'openclaude.editor.openLast';
  statusBar.tooltip = 'Open OpenClaude';
  context.subscriptions.push(statusBar);

  if (preferredLocation === 'sidebar' && supportsSecondarySidebar) {
    statusBar.show();
  }

  // ==========================================
  // Command Registration
  // ==========================================

  // Open in New Tab (creates editor tab panel)
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'openclaude.editor.open',
      async (sessionId?: string, prompt?: string, viewColumn?: vscode.ViewColumn) => {
        if (viewColumn !== vscode.ViewColumn.Active) {
          preferredLocation = 'panel';
        }
        const { startedInNewColumn } = webviewManager!.createPanel(
          sessionId,
          prompt,
          viewColumn,
        );
        if (startedInNewColumn) {
          await vscode.commands.executeCommand('workbench.action.lockEditorGroup');
        }
      },
    ),
  );

  // Open in Primary Editor
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'openclaude.primaryEditor.open',
      async (sessionId?: string, prompt?: string) => {
        webviewManager!.createPanel(sessionId, prompt, vscode.ViewColumn.Active);
      },
    ),
  );

  // Open (remembers last location)
  context.subscriptions.push(
    vscode.commands.registerCommand('openclaude.editor.openLast', async () => {
      if (preferredLocation === 'sidebar') {
        await vscode.commands.executeCommand('openclaude.sidebar.open');
        return;
      }
      await vscode.commands.executeCommand('openclaude.editor.open');
    }),
  );

  // Open in Side Bar
  context.subscriptions.push(
    vscode.commands.registerCommand('openclaude.sidebar.open', async () => {
      preferredLocation = 'sidebar';
      if (!supportsSecondarySidebar) {
        vscode.window.showWarningMessage(
          'Secondary Sidebar not supported in this version of VS Code. Opening in Activity Bar instead.',
        );
        await vscode.commands.executeCommand('openclaudeSidebar.focus');
        return;
      }
      await vscode.commands.executeCommand('openclaudeSidebarSecondary.focus');
      statusBar.show();
    }),
  );

  // Open in New Window
  context.subscriptions.push(
    vscode.commands.registerCommand('openclaude.window.open', async () => {
      await webviewManager!.createPanelInNewWindow();
      statusBar.hide();
    }),
  );

  // New Conversation
  context.subscriptions.push(
    vscode.commands.registerCommand('openclaude.newConversation', async () => {
      webviewManager!.broadcast({ type: 'init_state' } as never);
      // Full implementation in Story 7
    }),
  );

  // Focus input
  context.subscriptions.push(
    vscode.commands.registerCommand('openclaude.focus', async () => {
      if (!webviewManager!.hasVisibleWebview()) {
        await vscode.commands.executeCommand('openclaude.editor.openLast');
      }
      // Send at-mention with current selection if available
      const editor = vscode.window.activeTextEditor;
      if (editor) {
        const doc = editor.document;
        const relativePath = vscode.workspace.asRelativePath(doc.fileName);
        const selection = editor.selection;

        if (!selection.isEmpty) {
          const startLine = selection.start.line + 1;
          const endLine = selection.end.line + 1;
          const mention =
            startLine !== endLine
              ? `@${relativePath}#${startLine}-${endLine}`
              : `@${relativePath}#${startLine}`;
          webviewManager!.broadcast({ type: 'at_mention_inserted', text: mention });
        } else {
          webviewManager!.broadcast({ type: 'at_mention_inserted', text: '' });
        }
      }
    }),
  );

  // Blur input
  context.subscriptions.push(
    vscode.commands.registerCommand('openclaude.blur', async () => {
      vscode.commands.executeCommand('workbench.action.focusFirstEditorGroup');
    }),
  );

  // Insert @-mention
  context.subscriptions.push(
    vscode.commands.registerCommand('openclaude.insertAtMention', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;

      const doc = editor.document;
      const relativePath = vscode.workspace.asRelativePath(doc.fileName);
      const selection = editor.selection;

      let mention: string;
      if (selection.isEmpty) {
        mention = `@${relativePath}`;
      } else {
        const startLine = selection.start.line + 1;
        const endLine = selection.end.line + 1;
        mention =
          startLine !== endLine
            ? `@${relativePath}#${startLine}-${endLine}`
            : `@${relativePath}#${startLine}`;
      }
      webviewManager!.broadcast({ type: 'at_mention_inserted', text: mention });
    }),
  );

  // Show Logs
  context.subscriptions.push(
    vscode.commands.registerCommand('openclaude.showLogs', () => {
      output.show();
    }),
  );

  // Open Walkthrough
  context.subscriptions.push(
    vscode.commands.registerCommand('openclaude.openWalkthrough', () => {
      const extensionId = context.extension.id;
      vscode.commands.executeCommand(
        'workbench.action.openWalkthrough',
        `${extensionId}#openclaude-walkthrough`,
        false,
      );
    }),
  );

  // === Diff commands (real implementations) ===
  context.subscriptions.push(
    vscode.commands.registerCommand('openclaude.acceptProposedDiff', () => {
      diffManager.acceptCurrentDiff();
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('openclaude.rejectProposedDiff', () => {
      diffManager.rejectCurrentDiff();
    }),
  );

  // Register remaining commands as no-ops (implementations come in later stories)
  const noopCommands = [
    'openclaude.terminal.open',
    'openclaude.terminal.open.keyboard',
    'openclaude.createWorktree',
    'openclaude.update',
    'openclaude.installPlugin',
    'openclaude.logout',
  ];

  for (const id of noopCommands) {
    context.subscriptions.push(
      vscode.commands.registerCommand(id, () => {
        vscode.window.showInformationMessage('OpenClaude: Coming soon!');
      }),
    );
  }

  // Log a webview message handler for debugging
  webviewManager.onMessage('send_prompt', (message, panelId) => {
    output.info(`[Panel ${panelId}] User prompt: ${JSON.stringify(message)}`);
    // Actual prompt sending to CLI comes in Story 2 (Process Manager)
  });

  // ==========================================
  // ProcessManager — will be spawned when a chat panel opens
  // ==========================================
  let processManager: ProcessManager | undefined;

  // Register a debug command to test spawning
  const testSpawn = vscode.commands.registerCommand('openclaude.debug.testSpawn', async () => {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      vscode.window.showErrorMessage('OpenClaude: No workspace folder open');
      return;
    }

    const config = vscode.workspace.getConfiguration('openclaudeCode');
    const model = config.get<string>('selectedModel');
    const permissionMode = config.get<string>('initialPermissionMode') as
      | 'default'
      | 'acceptEdits'
      | 'plan'
      | 'bypassPermissions'
      | 'dontAsk'
      | undefined;

    // Build env vars from settings
    const envVarSettings = config.get<Array<{ name: string; value: string }>>(
      'environmentVariables',
      [],
    );
    const env: Record<string, string> = {};
    for (const { name, value } of envVarSettings) {
      env[name] = value;
    }

    processManager = new ProcessManager({
      cwd: workspaceFolder.uri.fsPath,
      model: model !== 'default' ? model : undefined,
      permissionMode,
      env,
    });

    processManager.onMessage((msg) => {
      output.info(`[OpenClaude] Message: ${JSON.stringify(msg).substring(0, 200)}`);
    });

    processManager.onError((err) => {
      output.error(`[OpenClaude] Error: ${err.message}`);
      vscode.window.showErrorMessage(`OpenClaude CLI error: ${err.message}`);
    });

    processManager.onExit((code, signal) => {
      output.info(`[OpenClaude] CLI exited: code=${code}, signal=${signal}`);
    });

    processManager.onStateChange((state) => {
      output.info(`[OpenClaude] State: ${state}`);
    });

    try {
      const response = await processManager.spawn();
      if (response) {
        vscode.window.showInformationMessage(
          `OpenClaude connected! Models: ${response.models?.length ?? 0}, Commands: ${response.commands?.length ?? 0}`,
        );
      }
    } catch (err) {
      vscode.window.showErrorMessage(
        `OpenClaude failed to start: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  });

  context.subscriptions.push(testSpawn);

  // Dispose ProcessManager on extension deactivation
  context.subscriptions.push({
    dispose: () => {
      processManager?.dispose();
    },
  });

  // Set context for sidebar state
  vscode.commands.executeCommand('setContext', 'openclaude.sessionsListEnabled', true);
  vscode.commands.executeCommand('setContext', 'openclaude.primaryEditorEnabled', true);

  output.info('OpenClaude: All commands and providers registered');
}

export function deactivate() {
  console.log('OpenClaude VS Code extension deactivated');
  diffManagerInstance = undefined;
  webviewManager = undefined;
}
