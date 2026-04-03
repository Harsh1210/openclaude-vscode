import * as vscode from 'vscode';
import { WebviewManager } from './webview/webviewManager';
import { OpenClaudeWebviewProvider, OpenClaudePanelSerializer } from './webview/webviewProvider';
import { ProcessManager, ProcessState } from './process/processManager';
import { createDiffContentProviders } from './diff/diffContentProvider';
import { DiffManager } from './diff/diffManager';
import { createCanUseToolHandler } from './diff/diffHandler';
import { PermissionRules } from './permissions/permissionRules';
import { PermissionHandler } from './permissions/permissionHandler';
import { SessionTracker } from './session/sessionTracker';
import { SessionsViewProvider } from './session/sessionsViewProvider';
import { StatusBarManager } from './statusbar/statusBarManager';
import { TerminalManager } from './commands/terminalManager';
import { CheckpointManager } from './checkpoint/checkpointManager';
import type { RewindFilesResponse } from './checkpoint/checkpointManager';
import { AuthManager } from './auth/authManager';
import { SettingsSync } from './settings/settingsSync';
import { McpIdeServer } from './mcp/mcpIdeServer';
import { normalizePluginState, buildToggleRequest, buildInstallCommand, buildReloadRequest } from './plugins/pluginBridge';
import { WorktreeManager } from './worktree/worktreeManager';
import { parseOpenClaudeUri } from './uriHandler';
import { AtMentionProvider } from './mentions/atMentionProvider';

let webviewManager: WebviewManager | undefined;
let diffManagerInstance: DiffManager | undefined;
let permissionHandlerInstance: PermissionHandler | undefined;

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

  // === Permission system: create rules store and handler ===
  const permissionRules = new PermissionRules(context);
  const permissionHandler = new PermissionHandler(webviewManager, permissionRules, output);
  context.subscriptions.push(permissionHandler);
  permissionHandlerInstance = permissionHandler;

  const provider = new OpenClaudeWebviewProvider(webviewManager);

  // === Session management: create tracker and initialize ===
  const sessionTracker = new SessionTracker();
  context.subscriptions.push(sessionTracker);
  // Initialize asynchronously (scan files + start watcher)
  sessionTracker.initialize().then(() => {
    output.info(`[OpenClaude] SessionTracker initialized, found ${sessionTracker.getSessionList().length} sessions`);
  });

  // Broadcast session changes to all webviews
  sessionTracker.onSessionsChanged(() => {
    const grouped = sessionTracker.getGroupedSessions();
    webviewManager!.broadcast({
      type: 'sessionsData',
      grouped: grouped.map((g) => ({
        group: g.group,
        sessions: g.sessions.map((s) => ({
          id: s.id,
          title: s.title,
          model: s.model,
          timestamp: s.timestamp.toISOString(),
          createdAt: s.createdAt.toISOString(),
          messageCount: s.messageCount,
          cwd: s.cwd,
          gitBranch: s.gitBranch,
        })),
      })),
    } as never);
  });

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

  // Register session list sidebar view with SessionsViewProvider
  const sessionsViewProvider = new SessionsViewProvider(context.extensionUri, sessionTracker);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      SessionsViewProvider.viewType,
      sessionsViewProvider,
    ),
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

  // Status bar manager (idle / pending-permission / completed-while-hidden)
  const statusBarManager = new StatusBarManager();
  context.subscriptions.push(statusBarManager);

  // Terminal manager for terminal mode
  const terminalManager = new TerminalManager();
  context.subscriptions.push(terminalManager);

  // === Checkpoint manager (Story 10) ===
  const checkpointManager = new CheckpointManager();

  // === Auth / provider manager (Story 11) ===
  const settingsSync = new SettingsSync();
  const authManager = new AuthManager(settingsSync);

  // === MCP IDE Server (Story 12) ===
  const mcpWorkspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || process.cwd();
  const mcpIdeServer = new McpIdeServer(mcpWorkspaceFolder);
  mcpIdeServer.start().then(({ port }) => {
    output.info(`[OpenClaude] MCP IDE server running on port ${port}`);
  }).catch((err: Error) => {
    output.warn(`[OpenClaude] Failed to start MCP IDE server: ${err.message}`);
  });
  context.subscriptions.push(mcpIdeServer);

  // === Worktree manager (Story 14) ===
  const worktreeManager = new WorktreeManager();
  context.subscriptions.push(worktreeManager);

  // === @-mention provider (Story 5) ===
  const atMentionProvider = new AtMentionProvider();
  context.subscriptions.push(atMentionProvider);

  if (preferredLocation === 'sidebar' && supportsSecondarySidebar) {
    statusBarManager.show();
  }

  // ==========================================
  // ProcessManager — spawned on first user message
  // ==========================================
  let processManager: ProcessManager | undefined;
  let isSpawning = false;
  let crashRestartCount = 0;
  let lastCrashTime = 0;
  let currentSessionId: string | undefined;

  /** Map effort level string to max_thinking_tokens value */
  function effortToTokens(level: string): number | null {
    switch (level) {
      case 'low': return 1000;
      case 'medium': return 8000;
      case 'high': return 16000;
      case 'max': return null;
      default: return null;
    }
  }

  /**
   * Ensure the CLI process is running. Spawns it if not already started.
   * Returns the ProcessManager instance.
   */
  async function ensureProcess(): Promise<ProcessManager | undefined> {
    if (processManager && processManager.state === ProcessState.Ready) {
      return processManager;
    }
    if (isSpawning) {
      // Wait for the in-flight spawn
      return new Promise((resolve) => {
        const check = setInterval(() => {
          if (!isSpawning) {
            clearInterval(check);
            resolve(processManager);
          }
        }, 100);
      });
    }

    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      vscode.window.showErrorMessage('OpenClaude: No workspace folder open');
      return undefined;
    }

    isSpawning = true;
    webviewManager!.broadcast({ type: 'process_state', state: 'starting' });

    const config = vscode.workspace.getConfiguration('openclaudeCode');
    const permissionMode = config.get<string>('initialPermissionMode') as
      | 'default' | 'acceptEdits' | 'plan' | 'bypassPermissions' | 'dontAsk' | undefined;

    // Use AuthManager to build env vars (merges provider env + user env vars)
    const env = authManager.buildProcessEnv();
    const model = settingsSync.selectedModel;

    processManager = new ProcessManager({
      cwd: workspaceFolder.uri.fsPath,
      model,
      permissionMode,
      env,
      sdkMcpServers: (() => {
        const meta = mcpIdeServer.getServerMetadata();
        if (!meta) return [];
        return [{
          name: 'openclaude-ide',
          type: 'streamable-http',
          url: `http://127.0.0.1:${meta.port}`,
          headers: { Authorization: `Bearer ${meta.token}` },
        }];
      })(),
    });
    // Register diff handler for can_use_tool requests (with permission handler for non-file-edit tools)
    processManager.registerControlHandler(
      'can_use_tool',
      createCanUseToolHandler(
        diffManager,
        () => processManager?.ndjsonTransport,
        output,
        permissionHandler,
      ),
    );

    // Register set_permission_mode handler
    processManager.registerControlHandler(
      'set_permission_mode',
      async (request) => {
        const modeRequest = request as import('./types/messages').ControlRequestSetPermissionMode;
        return permissionHandler.handleSetPermissionMode(modeRequest);
      },
    );

    // Register elicitation handler — forward to webview as show_elicitation
    processManager.registerControlHandler(
      'elicitation',
      async (request, signal, requestId) => {
        const req = request as Record<string, unknown>;
        webviewManager!.broadcast({
          type: 'show_elicitation',
          requestId,
          message: req.message,
          fields: (req.fields as unknown[]) ?? [],
        } as never);
        // Response is sent asynchronously when user submits/cancels the dialog
        const { SELF_HANDLED } = await import('./process/controlRouter');
        return SELF_HANDLED;
      },
    );

    // Wire permissionHandler's writeToStdin to the transport
    permissionHandler.setWriteToStdin((msg) => processManager?.ndjsonTransport?.write(msg));

    // Forward ALL CLI messages to the webview
    processManager.onMessage((msg) => {
      output.info(`[CLI→Webview] ${JSON.stringify(msg).substring(0, 300)}`);
      webviewManager!.broadcast({ type: 'cli_output', data: msg });

      // StatusBar: set pending permission on permission_request, clear on response
      const msgObj = msg as Record<string, unknown>;
      if (msgObj.type === 'control_request') {
        const req = msgObj.request as Record<string, unknown> | undefined;
        if (req?.subtype === 'can_use_tool') {
          statusBarManager.setPendingPermission(true);
        }
      }

      // StatusBar: detect result while panel is hidden → orange dot
      if (msgObj.type === 'result' || msgObj.subtype === 'result') {
        if (!webviewManager!.hasVisibleWebview()) {
          statusBarManager.setCompletedWhileHidden(true);
        }
      }

      // Track session ID for auto-restart
      if (typeof msgObj.session_id === 'string') {
        currentSessionId = msgObj.session_id;
      }

      // ai-title: update session tracker so the session list shows the new title
      if (msgObj.type === 'system' && msgObj.subtype === 'ai-title' && typeof msgObj.title === 'string' && typeof msgObj.session_id === 'string') {
        sessionTracker.updateSessionTitle(msgObj.session_id, msgObj.title);
      }

      // --- Checkpoint tracking (Story 10) ---
      if (msgObj.type === 'assistant' && typeof msgObj.uuid === 'string' && typeof msgObj.session_id === 'string') {
        checkpointManager.registerAssistantMessage(msgObj.uuid, msgObj.session_id);
        webviewManager!.broadcast({
          type: 'checkpoint_state',
          checkpoints: checkpointManager.getWebviewState(),
        });
      }

      if (msgObj.type === 'system' && msgObj.subtype === 'files_persisted' && typeof msgObj.uuid === 'string') {
        const files = (msgObj.files as Array<{ filename: string; file_id: string }>) ?? [];
        checkpointManager.markFilesPersisted(msgObj.uuid, files);
        webviewManager!.broadcast({
          type: 'checkpoint_state',
          checkpoints: checkpointManager.getWebviewState(),
        });
      }

      if (msgObj.type === 'system' && msgObj.subtype === 'session_state_changed') {
        const state = msgObj.state as 'idle' | 'running' | 'requires_action';
        const sessionId = msgObj.session_id as string;
        if (state && sessionId) {
          checkpointManager.handleSessionStateChanged(state, sessionId);
        }
      }
    });

    processManager.onError((err) => {
      output.error(`[OpenClaude] Error: ${err.message}`);
      webviewManager!.broadcast({ type: 'process_state', state: 'crashed' });
    });

    processManager.onExit((code, signal) => {
      output.info(`[OpenClaude] CLI exited: code=${code}, signal=${signal}`);
      isSpawning = false;

      // Auto-restart on non-zero exit if we have a session to resume
      if (code !== 0 && code !== null && currentSessionId) {
        const now = Date.now();
        if (now - lastCrashTime > 30_000) {
          crashRestartCount = 0;
        }
        crashRestartCount++;
        lastCrashTime = now;

        if (crashRestartCount <= 3) {
          output.warn(`[OpenClaude] CLI crashed (attempt ${crashRestartCount}/3), restarting with --resume...`);
          webviewManager!.broadcast({ type: 'process_state', state: 'restarting' as never });
          setTimeout(async () => {
            processManager = undefined;
            await ensureProcess();
          }, 1000);
          return;
        } else {
          output.error('[OpenClaude] CLI crashed too many times, giving up.');
          vscode.window.showErrorMessage('OpenClaude: CLI crashed repeatedly. Check the Output panel for logs.');
        }
      }

      webviewManager!.broadcast({ type: 'process_state', state: 'stopped' });
    });

    processManager.onStateChange((state) => {
      output.info(`[OpenClaude] State: ${state}`);
      if (state === ProcessState.Ready) {
        webviewManager!.broadcast({ type: 'process_state', state: 'running' });
      }
    });

    processManager.onStderr((line) => {
      output.warn(`[CLI stderr] ${line}`);
    });

    try {
      const response = await processManager.spawn();
      isSpawning = false;
      if (response) {
        // The response might be the InitializeResponse directly, or nested under .response
        const resp = response as Record<string, unknown>;
        const initData = (resp.response && typeof resp.response === 'object')
          ? resp.response as Record<string, unknown>  // double-nested: response.response
          : resp;                                      // direct: response itself

        output.info(`[OpenClaude] Connected! Init response keys: ${Object.keys(initData).join(', ')}`);

        // Broadcast slash commands to webview — ALWAYS broadcast (even if empty, for debugging)
        const commands = Array.isArray(initData.commands) ? initData.commands : [];
        webviewManager!.broadcast({
          type: 'slash_commands_available',
          commands: commands.map((c: Record<string, unknown>) => ({
            name: (c.name as string) || (c.command as string) || '',
            description: (c.description as string) || '',
            argumentHint: (c.argument_hint as string) || (c.argumentHint as string) || (c.args as string) || '',
          })),
        } as never);
        output.info(`[OpenClaude] Broadcast ${commands.length} slash commands`);

        // Broadcast a synthetic system/init — ALWAYS broadcast so webview gets models + fast_mode_state
        const models = Array.isArray(initData.models) ? initData.models : [];
        const fastModeState = initData.fast_mode_state ?? { enabled: false, canToggle: true };
        const account = initData.account as Record<string, unknown> | undefined;
        const permMode = initData.permission_mode ?? initData.permissionMode ?? permissionHandler.currentMode;
        webviewManager!.broadcast({
          type: 'cli_output',
          data: {
            type: 'system',
            subtype: 'init',
            session_id: processManager.sessionId ?? '',
            model: (models[0] as Record<string, unknown>)?.value ?? '',
            models: models,
            fast_mode_state: fastModeState,
            permissionMode: permMode,
            account: account ?? {},
          },
          } as never);
        output.info(`[OpenClaude] Broadcast init with ${models.length} models, permissionMode=${permMode}`);
      }
      return processManager;
    } catch (err) {
      isSpawning = false;
      const msg = err instanceof Error ? err.message : String(err);
      output.error(`[OpenClaude] Failed to start: ${msg}`);
      vscode.window.showErrorMessage(`OpenClaude failed to start: ${msg}`);
      webviewManager!.broadcast({ type: 'process_state', state: 'crashed' });
      return undefined;
    }
  }

  // ==========================================
  // Wire webview messages to ProcessManager
  // ==========================================

  // Handle user sending a prompt
  webviewManager.onMessage('send_prompt', async (message) => {
    output.info(`[Webview→CLI] send_prompt: ${message.text.substring(0, 100)}`);

    // OpenClaude-specific: /provider opens the provider picker dialog
    if (message.text.trim() === '/provider') {
      webviewManager!.broadcast({ type: 'open_provider_picker' } as never);
      return;
    }

    const pm = await ensureProcess();
    if (!pm) return;

    // Send as a user message to the CLI via NDJSON stdin
    pm.write({
      type: 'user',
      message: {
        role: 'user',
        content: message.text,
      },
    });
  });

  // Handle slash commands from webview
  webviewManager.onMessage('slash_command', async (message) => {
    const msg = message as unknown as { command: string; args?: string };
    output.info(`[Webview→CLI] slash_command: /${msg.command}`);

    // OpenClaude-specific: /provider opens the provider picker dialog
    if (msg.command === 'provider') {
      webviewManager!.broadcast({ type: 'open_provider_picker' } as never);
      return;
    }

    const pm = await ensureProcess();
    if (!pm) return;
    const content = msg.args ? `/${msg.command} ${msg.args}` : `/${msg.command}`;
    pm.write({ type: 'user', message: { role: 'user', content } });
  });

  // Handle set_model from webview
  webviewManager.onMessage('set_model', async (message) => {
    const msg = message as unknown as { model: string };
    output.info(`[Webview→CLI] set_model: ${msg.model}`);
    if (processManager) {
      processManager.write({
        type: 'control_request',
        request_id: `set-model-${Date.now()}`,
        request: { subtype: 'set_model', model: msg.model },
      });
    }
  });

  // Handle set_effort_level from webview
  webviewManager.onMessage('set_effort_level', async (message) => {
    const msg = message as unknown as { level: string };
    output.info(`[Webview→CLI] set_effort_level: ${msg.level}`);
    if (processManager) {
      processManager.write({
        type: 'control_request',
        request_id: `set-effort-${Date.now()}`,
        request: { subtype: 'set_max_thinking_tokens', max_thinking_tokens: effortToTokens(msg.level) },
      });
    }
  });

  // Handle toggle_fast_mode from webview
  webviewManager.onMessage('toggle_fast_mode', async (message) => {
    const msg = message as unknown as { enabled: boolean };
    output.info(`[Webview→CLI] toggle_fast_mode: ${msg.enabled}`);
    if (processManager) {
      processManager.write({
        type: 'control_request',
        request_id: `fast-mode-${Date.now()}`,
        request: { subtype: 'apply_flag_settings', settings: { fastMode: msg.enabled } },
      });
    }
  });

  // Handle interrupt/stop
  webviewManager.onMessage('interrupt', async () => {
    output.info('[Webview→CLI] interrupt');
    if (processManager) {
      processManager.kill('SIGINT');
    }
  });

  // Handle new conversation
  webviewManager.onMessage('new_conversation', async () => {
    output.info('[Webview] new_conversation');
    if (processManager) {
      processManager.dispose();
      processManager = undefined;
    }
    currentSessionId = undefined;
    crashRestartCount = 0;
    checkpointManager.clear();
    webviewManager!.broadcast({ type: 'clearMessages' } as never);
    webviewManager!.broadcast({ type: 'process_state', state: 'stopped' });
    webviewManager!.broadcast({ type: 'checkpoint_state', checkpoints: [] });
  });

  // Handle get sessions request
  webviewManager.onMessage('get_sessions', async (_message, panelId) => {
    output.info('[Webview] get_sessions');
    const grouped = sessionTracker.getGroupedSessions();
    const payload = {
      type: 'sessionsData',
      grouped: grouped.map((g) => ({
        group: g.group,
        sessions: g.sessions.map((s) => ({
          id: s.id,
          title: s.title,
          model: s.model,
          timestamp: s.timestamp.toISOString(),
          createdAt: s.createdAt.toISOString(),
          messageCount: s.messageCount,
          cwd: s.cwd,
          gitBranch: s.gitBranch,
        })),
      })),
    };
    webviewManager!.sendToPanel(panelId, payload as never);
  });

  // Handle resume session
  webviewManager.onMessage('resume_session', async (message) => {
    output.info(`[Webview] resume_session: ${message.sessionId}`);
    // Kill existing process and spawn with --resume
    if (processManager) {
      processManager.dispose();
      processManager = undefined;
    }

    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      vscode.window.showErrorMessage('OpenClaude: No workspace folder open');
      return;
    }

    const config = vscode.workspace.getConfiguration('openclaudeCode');
    const model = config.get<string>('selectedModel');
    const permissionMode = config.get<string>('initialPermissionMode') as
      | 'default' | 'acceptEdits' | 'plan' | 'bypassPermissions' | 'dontAsk' | undefined;

    const envVarSettings = config.get<Array<{ name: string; value: string }>>(
      'environmentVariables', [],
    );
    const env: Record<string, string> = {};
    for (const { name, value } of envVarSettings) {
      env[name] = value;
    }

    isSpawning = true;
    webviewManager!.broadcast({ type: 'process_state', state: 'starting' });

    processManager = new ProcessManager({
      cwd: workspaceFolder.uri.fsPath,
      model: model !== 'default' ? model : undefined,
      permissionMode,
      sessionId: message.sessionId,
      env,
    });

    // Re-register handlers on the new process
    processManager.registerControlHandler(
      'can_use_tool',
      createCanUseToolHandler(
        diffManager,
        () => processManager?.ndjsonTransport,
        output,
        permissionHandler,
      ),
    );
    processManager.registerControlHandler(
      'set_permission_mode',
      async (request) => {
        const modeRequest = request as import('./types/messages').ControlRequestSetPermissionMode;
        return permissionHandler.handleSetPermissionMode(modeRequest);
      },
    );
    permissionHandler.setWriteToStdin((msg) => processManager?.ndjsonTransport?.write(msg));

    processManager.onMessage((msg) => {
      output.info(`[CLI→Webview] ${JSON.stringify(msg).substring(0, 300)}`);
      webviewManager!.broadcast({ type: 'cli_output', data: msg });

      // StatusBar: set pending permission on permission_request, clear on response
      const msgObj = msg as Record<string, unknown>;
      if (msgObj.type === 'control_request') {
        const req = msgObj.request as Record<string, unknown> | undefined;
        if (req?.subtype === 'can_use_tool') {
          statusBarManager.setPendingPermission(true);
        }
      }

      // StatusBar: detect result while panel is hidden → orange dot
      if (msgObj.type === 'result' || msgObj.subtype === 'result') {
        if (!webviewManager!.hasVisibleWebview()) {
          statusBarManager.setCompletedWhileHidden(true);
        }
      }
    });
    processManager.onError((err) => {
      output.error(`[OpenClaude] Error: ${err.message}`);
      webviewManager!.broadcast({ type: 'process_state', state: 'crashed' });
    });
    processManager.onExit((code, signal) => {
      output.info(`[OpenClaude] CLI exited: code=${code}, signal=${signal}`);
      webviewManager!.broadcast({ type: 'process_state', state: 'stopped' });
      isSpawning = false;
    });
    processManager.onStateChange((state) => {
      output.info(`[OpenClaude] State: ${state}`);
      if (state === ProcessState.Ready) {
        webviewManager!.broadcast({ type: 'process_state', state: 'running' });
      }
    });
    processManager.onStderr((line) => {
      output.warn(`[CLI stderr] ${line}`);
    });

    try {
      await processManager.spawn();
      isSpawning = false;
      const session = sessionTracker.getSession(message.sessionId);
      webviewManager!.broadcast({
        type: 'sessionResumed',
        sessionId: message.sessionId,
        title: session?.title || 'Resumed Session',
      } as never);
    } catch (err) {
      isSpawning = false;
      const msg = err instanceof Error ? err.message : String(err);
      output.error(`[OpenClaude] Failed to resume: ${msg}`);
      vscode.window.showErrorMessage(`OpenClaude failed to resume session: ${msg}`);
      webviewManager!.broadcast({ type: 'process_state', state: 'crashed' });
    }
  });

  // Handle delete session
  webviewManager.onMessage('delete_session', async (message, panelId) => {
    output.info(`[Webview] delete_session: ${message.sessionId}`);
    const ok = await sessionTracker.deleteSession(message.sessionId);
    webviewManager!.sendToPanel(panelId, {
      type: 'sessionDeleted',
      sessionId: message.sessionId,
      success: ok,
    } as never);
  });

  // ==========================================
  // Checkpoint handlers (Story 10)
  // ==========================================

  webviewManager.onMessage('rewind', async (message) => {
    const msg = message as unknown as { messageUuid: string; dryRun: boolean };
    output.info(`[Webview] rewind: ${msg.messageUuid} dryRun=${msg.dryRun}`);
    if (!processManager) return;
    try {
      const request = checkpointManager.buildRewindRequest(msg.messageUuid, msg.dryRun);
      const response = await processManager.sendControlRequest(request as unknown as Record<string, unknown>);
      const rewindResponse = response as unknown as RewindFilesResponse;
      if (msg.dryRun) {
        webviewManager!.broadcast({
          type: 'rewind_preview',
          messageUuid: msg.messageUuid,
          canRewind: rewindResponse?.canRewind ?? false,
          error: rewindResponse?.error,
          filesChanged: rewindResponse?.filesChanged,
          insertions: rewindResponse?.insertions,
          deletions: rewindResponse?.deletions,
        });
      } else {
        webviewManager!.broadcast({
          type: 'rewind_result',
          messageUuid: msg.messageUuid,
          success: (rewindResponse?.canRewind ?? false) && !rewindResponse?.error,
          error: rewindResponse?.error,
          filesChanged: rewindResponse?.filesChanged,
          insertions: rewindResponse?.insertions,
          deletions: rewindResponse?.deletions,
        });
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      webviewManager!.broadcast({
        type: msg.dryRun ? 'rewind_preview' : 'rewind_result',
        messageUuid: msg.messageUuid,
        canRewind: false,
        success: false,
        error: errMsg,
      } as never);
    }
  });

  webviewManager.onMessage('fork_session', async (message) => {
    const msg = message as unknown as { messageUuid: string };
    output.info(`[Webview] fork_session: ${msg.messageUuid}`);
    try {
      const forkOptions = checkpointManager.buildForkOptions(msg.messageUuid);
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (!workspaceFolder) return;
      const forkPm = new ProcessManager({
        cwd: workspaceFolder.uri.fsPath,
        sessionId: forkOptions.sessionId,
        forkSession: forkOptions.forkSession,
        env: authManager.buildProcessEnv(),
      });
      await forkPm.spawn();
      vscode.commands.executeCommand('openclaude.editor.open');
    } catch (err) {
      vscode.window.showErrorMessage(`Fork failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  });

  webviewManager.onMessage('fork_and_rewind', async (message) => {
    const msg = message as unknown as { messageUuid: string };
    output.info(`[Webview] fork_and_rewind: ${msg.messageUuid}`);
    try {
      const forkOptions = checkpointManager.buildForkOptions(msg.messageUuid);
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (!workspaceFolder) return;
      const forkPm = new ProcessManager({
        cwd: workspaceFolder.uri.fsPath,
        sessionId: forkOptions.sessionId,
        forkSession: forkOptions.forkSession,
        env: authManager.buildProcessEnv(),
      });
      await forkPm.spawn();

      if (processManager) {
        const request = checkpointManager.buildRewindRequest(msg.messageUuid, false);
        const response = await processManager.sendControlRequest(request as unknown as Record<string, unknown>);
        const rewindResponse = response as unknown as RewindFilesResponse;
        webviewManager!.broadcast({
          type: 'rewind_result',
          messageUuid: msg.messageUuid,
          success: (rewindResponse?.canRewind ?? false) && !rewindResponse?.error,
          error: rewindResponse?.error,
          filesChanged: rewindResponse?.filesChanged,
        });
      }
      vscode.commands.executeCommand('openclaude.editor.open');
    } catch (err) {
      vscode.window.showErrorMessage(`Fork+Rewind failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  });

  // ==========================================
  // Provider handlers (Story 11)
  // ==========================================

  webviewManager.onMessage('get_provider_state', async (_message, panelId) => {
    const providers = authManager.getAvailableProviders();
    const current = authManager.getCurrentProvider();
    webviewManager!.sendToPanel(panelId, {
      type: 'provider_state',
      providers: providers.map((p) => ({
        id: p.id,
        label: p.label,
        requiresApiKey: p.requiresApiKey,
        requiresBaseUrl: p.requiresBaseUrl,
        supportsModel: p.supportsModel,
        defaultBaseUrl: p.defaultBaseUrl,
      })),
      currentProviderId: current.id,
      currentModel: current.model,
      currentBaseUrl: settingsSync.baseUrl,
    } as never);
  });

  webviewManager.onMessage('set_provider', async (message) => {
    const msg = message as unknown as {
      providerId: string;
      apiKey?: string;
      baseUrl?: string;
      model?: string;
    };
    const validation = authManager.validate({
      providerId: msg.providerId,
      apiKey: msg.apiKey,
      baseUrl: msg.baseUrl,
    });
    if (!validation.valid) {
      webviewManager!.broadcast({
        type: 'provider_state',
        providers: authManager.getAvailableProviders(),
        currentProviderId: settingsSync.selectedProvider,
        error: validation.errors.join('; '),
      } as never);
      return;
    }
    await authManager.updateProvider({
      providerId: msg.providerId,
      apiKey: msg.apiKey,
      baseUrl: msg.baseUrl,
      model: msg.model,
    });
    // Broadcast updated state to all panels
    const providers = authManager.getAvailableProviders();
    const current = authManager.getCurrentProvider();
    webviewManager!.broadcast({
      type: 'provider_state',
      providers: providers.map((p) => ({
        id: p.id,
        label: p.label,
        requiresApiKey: p.requiresApiKey,
        requiresBaseUrl: p.requiresBaseUrl,
        supportsModel: p.supportsModel,
        defaultBaseUrl: p.defaultBaseUrl,
      })),
      currentProviderId: current.id,
      currentModel: current.model,
      currentBaseUrl: settingsSync.baseUrl,
    } as never);
  });

  // ==========================================
  // MCP handlers (Story 12)
  // ==========================================

  webviewManager.onMessage('mcp_refresh_status', async (_message, panelId) => {
    const meta = mcpIdeServer.getServerMetadata();
    webviewManager!.sendToPanel(panelId, {
      type: 'mcp_servers_state',
      servers: [],
      ideServer: {
        running: mcpIdeServer.isRunning(),
        port: meta?.port ?? null,
        toolCount: meta?.tools.length ?? 0,
      },
    } as never);
  });

  webviewManager.onMessage('mcp_reconnect', async (message) => {
    const msg = message as unknown as { serverName: string };
    output.info(`[Webview] mcp_reconnect: ${msg.serverName}`);
    if (processManager) {
      processManager.write({
        type: 'control_request',
        request_id: `mcp-reconnect-${Date.now()}`,
        request: { subtype: 'mcp_reconnect', serverName: msg.serverName },
      });
    }
  });

  webviewManager.onMessage('mcp_toggle', async (message) => {
    const msg = message as unknown as { serverName: string; enabled: boolean };
    output.info(`[Webview] mcp_toggle: ${msg.serverName} enabled=${msg.enabled}`);
    if (processManager) {
      processManager.write({
        type: 'control_request',
        request_id: `mcp-toggle-${Date.now()}`,
        request: { subtype: 'mcp_toggle', serverName: msg.serverName, enabled: msg.enabled },
      });
    }
  });

  webviewManager.onMessage('mcp_add_server', async (message) => {
    const msg = message as unknown as { name: string; config: Record<string, unknown> };
    output.info(`[Webview] mcp_add_server: ${msg.name}`);
    if (processManager) {
      processManager.write({
        type: 'control_request',
        request_id: `mcp-add-${Date.now()}`,
        request: { subtype: 'mcp_set_servers', servers: { [msg.name]: msg.config } },
      });
    }
  });

  webviewManager.onMessage('mcp_remove_server', async (message) => {
    const msg = message as unknown as { serverName: string };
    output.info(`[Webview] mcp_remove_server: ${msg.serverName}`);
    if (processManager) {
      processManager.write({
        type: 'control_request',
        request_id: `mcp-remove-${Date.now()}`,
        request: { subtype: 'mcp_toggle', serverName: msg.serverName, enabled: false },
      });
    }
  });

  // Handle workspace folder changes — restart CLI with new cwd
  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      if (processManager) {
        output.info('[OpenClaude] Workspace folder changed, disposing CLI process');
        processManager.dispose();
        processManager = undefined;
        currentSessionId = undefined;
        crashRestartCount = 0;
        webviewManager!.broadcast({ type: 'process_state', state: 'stopped' });
      }
    }),
  );

  // ==========================================
  // Command Registration
  // ==========================================

  // Open in New Tab
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'openclaude.editor.open',
      async (sessionId?: string, prompt?: string, viewColumn?: vscode.ViewColumn) => {
        if (viewColumn !== vscode.ViewColumn.Active) {
          preferredLocation = 'panel';
        }
        const { startedInNewColumn } = webviewManager!.createPanel(
          sessionId, prompt, viewColumn,
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
        await vscode.commands.executeCommand('openclaudeSidebar.focus');
        return;
      }
      await vscode.commands.executeCommand('openclaudeSidebarSecondary.focus');
      statusBarManager.show();
    }),
  );

  // Open in New Window
  context.subscriptions.push(
    vscode.commands.registerCommand('openclaude.window.open', async () => {
      await webviewManager!.createPanelInNewWindow();
      statusBarManager.hide();
    }),
  );

  // New Conversation
  context.subscriptions.push(
    vscode.commands.registerCommand('openclaude.newConversation', async () => {
      if (processManager) {
        processManager.dispose();
        processManager = undefined;
      }
      currentSessionId = undefined;
      crashRestartCount = 0;
      checkpointManager.clear();
      webviewManager!.broadcast({ type: 'clearMessages' } as never);
      webviewManager!.broadcast({ type: 'process_state', state: 'stopped' });
      webviewManager!.broadcast({ type: 'checkpoint_state', checkpoints: [] });
    }),
  );

  // Focus input
  context.subscriptions.push(
    vscode.commands.registerCommand('openclaude.focus', async () => {
      if (!webviewManager!.hasVisibleWebview()) {
        await vscode.commands.executeCommand('openclaude.editor.openLast');
      }
      const editor = vscode.window.activeTextEditor;
      if (editor) {
        const doc = editor.document;
        const relativePath = vscode.workspace.asRelativePath(doc.fileName);
        const selection = editor.selection;
        if (!selection.isEmpty) {
          const startLine = selection.start.line + 1;
          const endLine = selection.end.line + 1;
          const mention = startLine !== endLine
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
        mention = startLine !== endLine
          ? `@${relativePath}#${startLine}-${endLine}`
          : `@${relativePath}#${startLine}`;
      }
      webviewManager!.broadcast({ type: 'at_mention_inserted', text: mention });
    }),
  );

  // Show Logs
  context.subscriptions.push(
    vscode.commands.registerCommand('openclaude.showLogs', () => output.show()),
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

  // Diff commands
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

  // installPlugin command — opens the plugin manager in the active webview
  context.subscriptions.push(
    vscode.commands.registerCommand('openclaude.installPlugin', () => {
      webviewManager!.broadcast({ type: 'open_plugin_manager' } as never);
    }),
  );

  // Plugin webview message handlers
  webviewManager.onMessage('plugin_refresh', async () => {
    if (processManager) {
      processManager.write({
        type: 'control_request',
        request_id: `plugin-state-${Date.now()}`,
        request: { subtype: 'get_settings' },
      });
    }
  });

  webviewManager.onMessage('plugin_toggle', async (message) => {
    const msg = message as unknown as { name: string; enabled: boolean };
    if (processManager) {
      processManager.write(buildToggleRequest(msg.name, msg.enabled) as unknown as Record<string, unknown>);
      processManager.write(buildReloadRequest() as unknown as Record<string, unknown>);
    }
  });

  webviewManager.onMessage('plugin_install', async (message) => {
    const msg = message as unknown as { name: string; scope: 'user' | 'project' | 'local' };
    const pm = await ensureProcess();
    if (pm) {
      pm.write({
        type: 'user',
        message: { role: 'user', content: buildInstallCommand(msg.name, msg.scope) },
      });
    }
  });

  webviewManager.onMessage('plugin_uninstall', async (message) => {
    const msg = message as unknown as { name: string };
    const pm = await ensureProcess();
    if (pm) {
      pm.write({
        type: 'user',
        message: { role: 'user', content: `/plugin uninstall ${msg.name}` },
      });
    }
  });

  webviewManager.onMessage('plugin_browse_marketplace', async () => {
    const pm = await ensureProcess();
    if (pm) {
      pm.write({ type: 'user', message: { role: 'user', content: '/plugins' } });
    }
  });

  webviewManager.onMessage('plugin_add_source', async () => {
    vscode.commands.executeCommand('workbench.action.openSettingsJson');
  });

  // Remaining commands (not yet implemented)
  const noopCommands = [
    'openclaude.update',
    'openclaude.logout',
    'openclaude.insertAtMentioned',
  ];
  for (const id of noopCommands) {
    context.subscriptions.push(
      vscode.commands.registerCommand(id, () => {
        vscode.window.showInformationMessage('OpenClaude: Coming soon!');
      }),
    );
  }

  // Create Worktree (Story 14)
  context.subscriptions.push(
    vscode.commands.registerCommand('openclaude.createWorktree', () => {
      worktreeManager.createWorktree();
    }),
  );

  // URI handler (Story 15)
  context.subscriptions.push(
    vscode.window.registerUriHandler({
      handleUri(uri: vscode.Uri): void {
        try {
          const parsed = parseOpenClaudeUri(uri);
          if (uri.path !== '/open') {
            vscode.window.showWarningMessage(`OpenClaude: Unknown URI path "${uri.path}"`);
            return;
          }
          vscode.commands.executeCommand(
            'openclaude.editor.open',
            parsed.session,
            parsed.prompt,
          );
        } catch {
          vscode.window.showWarningMessage('OpenClaude: Malformed URI — could not open.');
        }
      },
    }),
  );

  // Terminal mode commands
  context.subscriptions.push(
    vscode.commands.registerCommand('openclaude.terminal.open', () => {
      terminalManager.open();
    }),
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('openclaude.terminal.open.keyboard', () => {
      terminalManager.open();
    }),
  );

  // ==========================================
  // StatusBar event wiring
  // ==========================================

  // Clear pending permission indicator when user responds to a permission request
  webviewManager.onMessage('permission_response', () => {
    statusBarManager.setPendingPermission(false);
  });

  // Handle elicitation response from webview → forward to CLI
  webviewManager.onMessage('elicitation_response', async (message) => {
    const msg = message as unknown as { requestId: string; values: Record<string, unknown> };
    output.info(`[Webview→CLI] elicitation_response: ${msg.requestId}`);
    if (processManager) {
      processManager.write({
        type: 'control_response',
        response: {
          subtype: 'success',
          request_id: msg.requestId,
          response: msg.values,
        },
      });
    }
  });

  // Handle elicitation cancel from webview → forward error response to CLI
  webviewManager.onMessage('elicitation_cancel', async (message) => {
    const msg = message as unknown as { requestId: string };
    output.info(`[Webview→CLI] elicitation_cancel: ${msg.requestId}`);
    if (processManager) {
      processManager.write({
        type: 'control_response',
        response: {
          subtype: 'error',
          request_id: msg.requestId,
          error: 'User cancelled elicitation',
        },
      });
    }
  });

  // Handle copy_message — write text to clipboard
  webviewManager.onMessage('copy_message', async (message) => {
    const msg = message as unknown as { content: string };
    await vscode.env.clipboard.writeText(msg.content);
  });

  // Handle copy_to_clipboard (alias used by some components)
  webviewManager.onMessage('copy_to_clipboard', async (message) => {
    await vscode.env.clipboard.writeText(message.text);
  });

  // Handle at_mention_query — search workspace files and return results
  webviewManager.onMessage('at_mention_query', async (message, panelId) => {
    const msg = message as unknown as { query: string };
    try {
      const results = await atMentionProvider.search(msg.query ?? '');
      webviewManager!.sendToPanel(panelId, {
        type: 'at_mention_results',
        query: msg.query ?? '',
        results,
      } as never);
    } catch (err) {
      output.warn(`[OpenClaude] at_mention_query error: ${err}`);
      webviewManager!.sendToPanel(panelId, {
        type: 'at_mention_results',
        query: msg.query ?? '',
        results: [],
      } as never);
    }
  });

  // Track active editor file and notify all webviews
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '';
      if (editor) {
        const fsPath = editor.document.uri.fsPath;
        const relativePath = fsPath.startsWith(workspaceRoot)
          ? fsPath.slice(workspaceRoot.length).replace(/^[/\\]/, '')
          : fsPath;
        webviewManager!.broadcast({
          type: 'active_file_changed',
          filePath: relativePath,
          fileName: editor.document.fileName.split('/').pop() ?? null,
          languageId: editor.document.languageId,
        } as never);
      } else {
        webviewManager!.broadcast({
          type: 'active_file_changed',
          filePath: null,
          fileName: null,
          languageId: null,
        } as never);
      }
    }),
  );

  // Handle open_file — open a file in the editor at a specific line
  webviewManager.onMessage('open_file', async (message) => {
    try {
      const uri = vscode.Uri.file(message.filePath);
      const doc = await vscode.workspace.openTextDocument(uri);
      const editor = await vscode.window.showTextDocument(doc, { preview: false });
      if (message.line !== undefined) {
        const line = Math.max(0, (message.line as number) - 1);
        const col = message.column !== undefined ? Math.max(0, (message.column as number) - 1) : 0;
        const pos = new vscode.Position(line, col);
        editor.selection = new vscode.Selection(pos, pos);
        editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);
      }
    } catch (err) {
      output.error(`[OpenClaude] Failed to open file ${message.filePath}: ${err}`);
    }
  });

  // Handle plan_review_submit — forward review decision to CLI
  webviewManager.onMessage('plan_review_submit', async (message) => {
    const msg = message as unknown as {
      requestId: string;
      action: {
        type: 'approve' | 'approve_with_comments' | 'request_revision';
        clearContext?: boolean;
        comments?: Array<{ number: number; anchorText: string; text: string }>;
        revisionNote?: string;
      };
    };
    output.info(`[Webview→CLI] plan_review_submit: ${msg.requestId} action=${msg.action.type}`);
    if (!processManager) return;

    const { action } = msg;
    if (action.type === 'approve') {
      processManager.write({
        type: 'control_response',
        response: {
          subtype: 'success',
          request_id: msg.requestId,
          response: { decision: 'approve', clearContext: action.clearContext ?? false },
        },
      });
    } else if (action.type === 'approve_with_comments') {
      const commentSummary = (action.comments ?? [])
        .map((c) => `[${c.number}] "${c.anchorText}" — ${c.text}`)
        .join('\n');
      processManager.write({
        type: 'control_response',
        response: {
          subtype: 'success',
          request_id: msg.requestId,
          response: {
            decision: 'approve',
            feedback: commentSummary,
            clearContext: action.clearContext ?? false,
          },
        },
      });
    } else if (action.type === 'request_revision') {
      const commentSummary = (action.comments ?? [])
        .map((c) => `[${c.number}] "${c.anchorText}" — ${c.text}`)
        .join('\n');
      const fullFeedback = action.revisionNote
        ? `${action.revisionNote}\n\nInline comments:\n${commentSummary}`
        : commentSummary;
      processManager.write({
        type: 'control_response',
        response: {
          subtype: 'error',
          request_id: msg.requestId,
          error: fullFeedback || 'User requested revision',
        },
      });
    }
  });

  // Clear completed-while-hidden indicator when a webview becomes visible
  // (The webview sends 'ready' when it becomes visible/re-renders)
  // Also eagerly spawn the CLI so slash commands are available immediately.
  webviewManager.onMessage('ready', () => {
    statusBarManager.clearCompletedWhileHidden();
    // Spawn eagerly so slash commands + models are available before first message
    ensureProcess().catch((err) => {
      output.warn(`[OpenClaude] Eager spawn failed: ${err}`);
    });
  });

  // Handle file_picker_request — open VS Code file picker and return selected files
  webviewManager.onMessage('file_picker_request', async (_message, panelId) => {
    output.info('[Webview] file_picker_request');
    const uris = await vscode.window.showOpenDialog({
      canSelectMany: true,
      canSelectFiles: true,
      canSelectFolders: false,
      openLabel: 'Attach',
    });
    if (!uris || uris.length === 0) return;
    const files = uris.map((uri) => ({
      type: 'file' as const,
      name: uri.fsPath.split('/').pop() ?? uri.fsPath,
      content: uri.fsPath,
    }));
    webviewManager!.sendToPanel(panelId, { type: 'file_picker_result', files } as never);
  });

  // Handle retry_connection — re-spawn the CLI process
  webviewManager.onMessage('retry_connection', async () => {
    output.info('[Webview] retry_connection');
    if (processManager) {
      processManager.dispose();
      processManager = undefined;
    }
    crashRestartCount = 0;
    await ensureProcess();
  });

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
  // Kill CLI process gracefully, then force after 2s
  if (processManager) {
    processManager.kill('SIGTERM');
    setTimeout(() => processManager?.kill('SIGKILL'), 2000);
  }
  diffManagerInstance = undefined;
  webviewManager = undefined;
}
