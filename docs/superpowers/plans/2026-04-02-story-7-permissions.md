# Story 7: Permission System & Dialogs — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the full permission lifecycle: the extension host receives `can_use_tool` control requests from the CLI, forwards them to the webview as permission dialogs, collects allow/deny/always-allow responses, sends `control_response` back to the CLI, and supports switching between permission modes (default/plan/acceptEdits/bypassPermissions/dontAsk). Also handle `control_cancel_request` for stale dialogs, auto-approve in auto mode, gate bypass mode behind a setting, and render plan documents in a basic PlanViewer.

**Architecture:** The PermissionHandler (extension host) is the single coordinator. It receives `control_request` messages with `subtype: 'can_use_tool'` from the NdjsonTransport, decides whether to auto-approve (based on current permission mode and always-allow rules), and if not, forwards to the webview via postMessage. The webview shows a PermissionDialog modal. User response flows back through postMessage to PermissionHandler, which constructs and sends a `control_response` on stdin. For mode changes, the webview sends `set_permission_mode` to the host, which sends a `control_request` with `subtype: 'set_permission_mode'` to the CLI.

**Tech Stack:** TypeScript 5.x, VS Code Extension API, React 18, Tailwind CSS 3

**Spec:** [2026-04-02-openclaude-vscode-extension-design.md](../specs/2026-04-02-openclaude-vscode-extension-design.md) — Story 7, Sections 2.3.4, 3.4, 4.3

**Depends on:** Story 4 (WebviewBridge + postMessage protocol, NdjsonTransport integration)

**Key protocol schemas (source of truth):**
- `openclaude/src/entrypoints/sdk/controlSchemas.ts` — `SDKControlPermissionRequestSchema`, `SDKControlSetPermissionModeRequestSchema`, `SDKControlCancelRequestSchema`
- `openclaude/src/entrypoints/sdk/coreSchemas.ts` — `PermissionModeSchema`, `PermissionResultSchema`, `PermissionUpdateSchema`, `PermissionDecisionClassificationSchema`

---

## File Structure

| File | Responsibility |
|---|---|
| `src/permissions/permissionHandler.ts` | Extension host coordinator — receives CLI permission requests, manages pending requests map, auto-approves in auto/bypass modes, forwards to webview, sends control_response back to CLI, handles cancel requests |
| `src/permissions/permissionRules.ts` | In-memory "always allow" rule store — tracks tool-level allow rules added during the session, persists to VS Code workspace state |
| `src/permissions/permissionRouter.ts` | Routes incoming control_request/control_cancel_request messages to the PermissionHandler by subtype |
| `webview/src/components/dialogs/PermissionDialog.tsx` | React modal — shows tool name, formatted input JSON, Allow/Deny/Always Allow buttons, risk-level coloring |
| `webview/src/components/dialogs/PlanViewer.tsx` | Basic plan document renderer — markdown plan from CLI in plan mode (full inline comment system is Story 19) |
| `webview/src/components/input/PermissionModeIndicator.tsx` | Footer badge showing current permission mode, clickable to open mode picker |
| `webview/src/components/input/ModeSelector.tsx` | Dropdown picker for switching permission modes |
| `webview/src/hooks/usePermissions.ts` | React hook — manages pending permission requests queue, dispatches responses to host |

---

## Task 1: Permission Rules Store

**Files:**
- Create: `src/permissions/permissionRules.ts`

A simple store that tracks "always allow" rules for the current session. Rules persist to VS Code workspace state so they survive extension restarts within the same workspace.

- [ ] **Step 1: Create the PermissionRules store**

```typescript
// src/permissions/permissionRules.ts
import * as vscode from 'vscode';

const STORAGE_KEY = 'openclaude.permissionRules.alwaysAllow';

/**
 * Manages session-scoped "always allow" permission rules.
 *
 * Rules are stored in VS Code workspace state (survives extension restart
 * but scoped to the workspace). They can also be promoted to project-level
 * settings via the CLI's permission_suggestions mechanism.
 */
export class PermissionRules {
  private readonly rules = new Set<string>();

  constructor(private readonly context: vscode.ExtensionContext) {
    // Restore from workspace state
    const stored = context.workspaceState.get<string[]>(STORAGE_KEY, []);
    for (const rule of stored) {
      this.rules.add(rule);
    }
  }

  /**
   * Check if a tool has an "always allow" rule.
   */
  has(toolName: string): boolean {
    return this.rules.has(toolName);
  }

  /**
   * Add an "always allow" rule for a tool.
   */
  add(toolName: string): void {
    this.rules.add(toolName);
    this.persist();
  }

  /**
   * Remove an "always allow" rule.
   */
  remove(toolName: string): void {
    this.rules.delete(toolName);
    this.persist();
  }

  /**
   * Get all current rules.
   */
  getAll(): string[] {
    return Array.from(this.rules);
  }

  /**
   * Clear all session rules.
   */
  clear(): void {
    this.rules.clear();
    this.persist();
  }

  private persist(): void {
    this.context.workspaceState.update(STORAGE_KEY, Array.from(this.rules));
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/permissions/permissionRules.ts
git commit -m "feat(permissions): add PermissionRules store with workspace state persistence"
```

---

## Task 2: Permission Handler (Extension Host)

**Files:**
- Create: `src/permissions/permissionHandler.ts`

This is the central coordinator on the extension host side. It sits between the NdjsonTransport (CLI messages) and the WebviewBridge (webview messages).

- [ ] **Step 1: Create the PermissionHandler class**

```typescript
// src/permissions/permissionHandler.ts
import * as vscode from 'vscode';
import type { WebviewBridge } from '../webview/webviewBridge';
import type {
  ControlRequestPermission,
  ControlRequestSetPermissionMode,
} from '../types/messages';
import type {
  PermissionMode,
  PermissionUpdate,
  PermissionDecisionClassification,
} from '../types/session';
import { PermissionRules } from './permissionRules';

/** Tracks a pending permission request awaiting user response */
interface PendingPermissionRequest {
  requestId: string;
  toolName: string;
  toolUseId: string;
  input: Record<string, unknown>;
  permissionSuggestions?: PermissionUpdate[];
  displayName?: string;
  title?: string;
  description?: string;
  decisionReason?: string;
  blockedPath?: string;
  agentId?: string;
  timestamp: number;
}

/**
 * PermissionHandler — coordinates the full permission lifecycle.
 *
 * Flow:
 * 1. CLI sends control_request { subtype: 'can_use_tool', ... }
 * 2. PermissionHandler checks current mode + always-allow rules:
 *    - bypassPermissions/dontAsk -> auto-allow, send control_response immediately
 *    - acceptEdits + file edit tool -> auto-allow
 *    - always-allow rule matches -> auto-allow
 *    - otherwise -> forward to webview as permission_request
 * 3. Webview shows PermissionDialog, user clicks Allow/Deny/Always Allow
 * 4. Webview sends permission_response postMessage back
 * 5. PermissionHandler constructs control_response and writes to CLI stdin
 * 6. CLI receives response and proceeds
 *
 * Also handles:
 * - control_cancel_request -> dismiss stale dialogs in webview
 * - set_permission_mode from CLI -> update local mode, notify webview
 * - set_permission_mode from webview -> send control_request to CLI
 */
export class PermissionHandler implements vscode.Disposable {
  private readonly disposables: vscode.Disposable[] = [];
  private readonly pendingRequests = new Map<string, PendingPermissionRequest>();
  private readonly rules: PermissionRules;
  private currentMode: PermissionMode = 'default';
  private bridge: WebviewBridge | null = null;

  /** Callback to write a JSON message to CLI stdin */
  private writeToStdin: ((message: unknown) => void) | null = null;

  constructor(private readonly context: vscode.ExtensionContext) {
    this.rules = new PermissionRules(context);
  }

  /**
   * Connect this handler to a WebviewBridge instance.
   * Registers message handlers for permission_response and set_permission_mode.
   */
  connectBridge(bridge: WebviewBridge): void {
    // Disconnect previous bridge if any
    this.bridge = bridge;

    // Listen for permission responses from webview
    this.disposables.push(
      bridge.onMessage('permission_response', (msg) => {
        this.handleWebviewPermissionResponse(
          msg.requestId,
          msg.allowed,
          msg.alwaysAllow,
        );
      }),
    );

    // Listen for permission mode changes from webview
    this.disposables.push(
      bridge.onMessage('set_permission_mode', (msg) => {
        this.handleWebviewModeChange(msg.mode as PermissionMode);
      }),
    );
  }

  /**
   * Set the stdin writer function (provided by ProcessManager/NdjsonTransport).
   */
  setStdinWriter(writer: (message: unknown) => void): void {
    this.writeToStdin = writer;
  }

  /**
   * Get the current permission mode.
   * Called by ProcessManager to pass --permission-mode flag to CLI on spawn.
   */
  getMode(): PermissionMode {
    return this.currentMode;
  }

  /**
   * Set the permission mode programmatically (called during initialization
   * from CLI init response or from system init message).
   */
  setMode(mode: PermissionMode): void {
    this.currentMode = mode;
    this.notifyWebviewModeChange(mode);
  }

  /**
   * Handle a can_use_tool control_request from the CLI.
   * This is the main entry point — called by PermissionRouter when it
   * receives a control_request with subtype 'can_use_tool'.
   */
  handlePermissionRequest(requestId: string, request: ControlRequestPermission): void {
    const pending: PendingPermissionRequest = {
      requestId,
      toolName: request.tool_name,
      toolUseId: request.tool_use_id,
      input: request.input,
      permissionSuggestions: request.permission_suggestions,
      displayName: request.display_name,
      title: request.title,
      description: request.description,
      decisionReason: request.decision_reason,
      blockedPath: request.blocked_path,
      agentId: request.agent_id,
      timestamp: Date.now(),
    };

    // Check if auto-approve applies
    if (this.shouldAutoApprove(request.tool_name)) {
      const classification: PermissionDecisionClassification =
        this.rules.has(request.tool_name) ? 'user_permanent' : 'user_temporary';
      this.sendAllowResponse(requestId, request.tool_use_id, classification);
      return;
    }

    // Store as pending
    this.pendingRequests.set(requestId, pending);

    // Forward to webview
    this.bridge?.postMessage({
      type: 'permission_request',
      requestId,
      toolName: request.display_name || request.tool_name,
      toolInput: request.input,
      title: request.title,
      description: request.description,
      decisionReason: request.decision_reason,
      blockedPath: request.blocked_path,
      permissionSuggestions: request.permission_suggestions,
      agentId: request.agent_id,
    });
  }

  /**
   * Handle a control_cancel_request from the CLI.
   * Dismisses the stale permission dialog in the webview.
   */
  handleCancelRequest(requestId: string): void {
    this.pendingRequests.delete(requestId);

    // Tell webview to dismiss the dialog
    this.bridge?.postMessage({
      type: 'cancel_request',
      requestId,
    });
  }

  /**
   * Handle a set_permission_mode control_request FROM the CLI.
   * The CLI can push mode changes (e.g., entering plan mode via /plan).
   */
  handleCliModeChange(request: ControlRequestSetPermissionMode, requestId: string): void {
    this.currentMode = request.mode;

    // Acknowledge the mode change back to CLI
    this.sendControlResponse(requestId, {});

    // Notify webview
    this.notifyWebviewModeChange(request.mode);
  }

  /**
   * Check whether a tool should be auto-approved based on current mode and rules.
   */
  private shouldAutoApprove(toolName: string): boolean {
    // Bypass mode: approve everything
    if (this.currentMode === 'bypassPermissions') {
      return true;
    }

    // dontAsk mode: the CLI handles deny logic — if we receive a can_use_tool
    // in dontAsk mode, the CLI is asking because it needs explicit user permission.
    // So we do NOT auto-approve in dontAsk. The CLI only sends permission requests
    // for tools that aren't pre-approved.

    // acceptEdits mode: auto-approve file edit tools
    if (this.currentMode === 'acceptEdits') {
      const editTools = [
        'Write',
        'Edit',
        'MultiEdit',
        'FileEditTool',
        'FileWriteTool',
        'NotebookEditTool',
      ];
      if (editTools.some((t) => toolName.includes(t))) {
        return true;
      }
    }

    // Session-scoped "always allow" rules
    if (this.rules.has(toolName)) {
      return true;
    }

    return false;
  }

  /**
   * Handle the webview user's response to a permission dialog.
   */
  private handleWebviewPermissionResponse(
    requestId: string,
    allowed: boolean,
    alwaysAllow?: boolean,
  ): void {
    const pending = this.pendingRequests.get(requestId);
    if (!pending) {
      console.warn(`Permission response for unknown request: ${requestId}`);
      return;
    }

    this.pendingRequests.delete(requestId);

    if (allowed) {
      // If "Always Allow" was clicked, add to session rules
      if (alwaysAllow) {
        this.rules.add(pending.toolName);
      }

      const classification: PermissionDecisionClassification =
        alwaysAllow ? 'user_permanent' : 'user_temporary';

      // If the CLI suggested permission updates and user clicked "Always Allow",
      // include those suggestions in the response
      const updatedPermissions: PermissionUpdate[] | undefined =
        alwaysAllow && pending.permissionSuggestions
          ? pending.permissionSuggestions
          : undefined;

      this.sendAllowResponse(
        requestId,
        pending.toolUseId,
        classification,
        updatedPermissions,
      );
    } else {
      this.sendDenyResponse(requestId, pending.toolUseId, 'User denied permission');
    }
  }

  /**
   * Handle webview user changing the permission mode via ModeSelector.
   */
  private handleWebviewModeChange(mode: PermissionMode): void {
    // Validate bypass mode requires setting
    if (mode === 'bypassPermissions') {
      const config = vscode.workspace.getConfiguration('openclaudeCode');
      const allowBypass = config.get<boolean>('allowDangerouslySkipPermissions', false);
      if (!allowBypass) {
        vscode.window.showWarningMessage(
          'OpenClaude: Bypass mode requires the "openclaudeCode.allowDangerouslySkipPermissions" ' +
          'setting to be enabled. Open Settings and search for "allowDangerouslySkipPermissions".',
        );
        return;
      }
    }

    this.currentMode = mode;

    // Send set_permission_mode control_request to CLI
    if (this.writeToStdin) {
      const requestId = `set-mode-${Date.now()}`;
      this.writeToStdin({
        type: 'control_request',
        request_id: requestId,
        request: {
          subtype: 'set_permission_mode',
          mode,
        },
      });
    }
  }

  /**
   * Notify the webview of a permission mode change via a system status message.
   */
  private notifyWebviewModeChange(mode: PermissionMode): void {
    this.bridge?.postMessage({
      type: 'cli_output',
      data: {
        type: 'system',
        subtype: 'status',
        permissionMode: mode,
        uuid: '',
        session_id: '',
      },
    });
  }

  /**
   * Send an "allow" control_response to the CLI.
   */
  private sendAllowResponse(
    requestId: string,
    toolUseId: string,
    classification: PermissionDecisionClassification,
    updatedPermissions?: PermissionUpdate[],
  ): void {
    const response: Record<string, unknown> = {
      behavior: 'allow',
      toolUseID: toolUseId,
      decisionClassification: classification,
    };
    if (updatedPermissions) {
      response.updatedPermissions = updatedPermissions;
    }
    this.sendControlResponse(requestId, response);
  }

  /**
   * Send a "deny" control_response to the CLI.
   */
  private sendDenyResponse(
    requestId: string,
    toolUseId: string,
    message: string,
  ): void {
    this.sendControlResponse(requestId, {
      behavior: 'deny',
      message,
      toolUseID: toolUseId,
      decisionClassification: 'user_reject',
    });
  }

  /**
   * Send a control_response envelope to the CLI via stdin.
   */
  private sendControlResponse(
    requestId: string,
    response: Record<string, unknown>,
  ): void {
    if (!this.writeToStdin) {
      console.error('PermissionHandler: cannot send control_response — no stdin writer');
      return;
    }
    this.writeToStdin({
      type: 'control_response',
      response: {
        subtype: 'success',
        request_id: requestId,
        response,
      },
    });
  }

  /**
   * Clear all pending requests (e.g., on CLI process restart).
   * Dismisses any open dialogs in the webview.
   */
  clearPending(): void {
    for (const [requestId] of this.pendingRequests) {
      this.bridge?.postMessage({
        type: 'cancel_request',
        requestId,
      });
    }
    this.pendingRequests.clear();
  }

  dispose(): void {
    this.clearPending();
    for (const d of this.disposables) {
      d.dispose();
    }
    this.disposables.length = 0;
    this.bridge = null;
    this.writeToStdin = null;
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd /Users/harshagarwal/Documents/workspace/openclaude-vscode && npx tsc --noEmit 2>&1 | grep -c 'permissionHandler' || echo "0 errors"`

Expected: No type errors in permissionHandler.ts

- [ ] **Step 3: Commit**

```bash
git add src/permissions/permissionHandler.ts
git commit -m "feat(permissions): add PermissionHandler — CLI permission request coordinator"
```

---

## Task 3: Permission Message Router

**Files:**
- Create: `src/permissions/permissionRouter.ts`

Routes incoming CLI messages to the PermissionHandler. Called by the main message dispatch loop in ProcessManager/NdjsonTransport (from Story 2).

- [ ] **Step 1: Create the permission message router**

```typescript
// src/permissions/permissionRouter.ts
import type { PermissionHandler } from './permissionHandler';
import type {
  SDKControlRequest,
  SDKControlCancelRequest,
  ControlRequestPermission,
  ControlRequestSetPermissionMode,
} from '../types/messages';

/**
 * Routes incoming CLI control messages to the PermissionHandler.
 *
 * Called by the main message dispatch loop when it receives
 * control_request or control_cancel_request messages from stdout.
 *
 * Usage in the message router:
 *   const permRouter = new PermissionRouter(permissionHandler);
 *
 *   // In message dispatch:
 *   if (msg.type === 'control_request') {
 *     if (permRouter.handleControlRequest(msg)) return; // handled
 *     // ... try other routers (elicitation, hooks, MCP)
 *   }
 *   if (msg.type === 'control_cancel_request') {
 *     permRouter.handleCancelRequest(msg);
 *   }
 */
export class PermissionRouter {
  constructor(private readonly handler: PermissionHandler) {}

  /**
   * Route a control_request message to the appropriate handler.
   * Returns true if the message was handled by permission logic,
   * false if it should be passed to other handlers.
   */
  handleControlRequest(message: SDKControlRequest): boolean {
    const { request_id, request } = message;

    switch (request.subtype) {
      case 'can_use_tool':
        this.handler.handlePermissionRequest(
          request_id,
          request as ControlRequestPermission,
        );
        return true;

      case 'set_permission_mode':
        this.handler.handleCliModeChange(
          request as ControlRequestSetPermissionMode,
          request_id,
        );
        return true;

      default:
        return false;
    }
  }

  /**
   * Route a control_cancel_request message.
   * Always handles it (cancel applies to permissions and elicitations).
   */
  handleCancelRequest(message: SDKControlCancelRequest): void {
    this.handler.handleCancelRequest(message.request_id);
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/permissions/permissionRouter.ts
git commit -m "feat(permissions): add PermissionRouter for CLI message dispatch"
```

---

## Task 4: Update WebviewBridge Types for Permission Messages

**Files:**
- Edit: `src/webview/types.ts`

The existing types have basic `PermissionRequestMessage`, `PermissionResponseMessage`, `CancelRequestMessage`, and `SetPermissionModeMessage`. We need to extend `PermissionRequestMessage` to carry the additional fields that PermissionHandler sends (title, description, suggestions, decisionReason, blockedPath, agentId).

- [ ] **Step 1: Extend PermissionRequestMessage with full fields**

In `src/webview/types.ts`, replace the existing `PermissionRequestMessage`:

Old:
```typescript
export interface PermissionRequestMessage {
  type: 'permission_request';
  requestId: string;
  toolName: string;
  toolInput: Record<string, unknown>;
  riskLevel?: string;
}
```

New:
```typescript
/** Permission request from CLI -> show dialog in webview */
export interface PermissionRequestMessage {
  type: 'permission_request';
  requestId: string;
  toolName: string;
  toolInput: Record<string, unknown>;
  title?: string;
  description?: string;
  decisionReason?: string;
  blockedPath?: string;
  permissionSuggestions?: Array<{
    type: string;
    rules?: Array<{ toolName: string; ruleContent?: string }>;
    behavior?: string;
    destination?: string;
    mode?: string;
    directories?: string[];
  }>;
  agentId?: string;
}
```

The `PermissionResponseMessage` already has `alwaysAllow?: boolean` — verify it is present and correct:

```typescript
export interface PermissionResponseMessage {
  type: 'permission_response';
  requestId: string;
  allowed: boolean;
  alwaysAllow?: boolean;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/webview/types.ts
git commit -m "feat(permissions): extend PermissionRequestMessage with full CLI fields"
```

---

## Task 5: Permission Dialog (React Component)

**Files:**
- Create: `webview/src/components/dialogs/PermissionDialog.tsx`

The modal that appears when the CLI requests tool permission. Shows tool name, formatted input, risk-level coloring, and three action buttons.

- [ ] **Step 1: Create the PermissionDialog component**

```tsx
// webview/src/components/dialogs/PermissionDialog.tsx
import React, { useCallback, useMemo } from 'react';
import { vscode } from '../../vscode';

export interface PermissionRequest {
  requestId: string;
  toolName: string;
  toolInput: Record<string, unknown>;
  title?: string;
  description?: string;
  decisionReason?: string;
  blockedPath?: string;
  agentId?: string;
}

interface PermissionDialogProps {
  request: PermissionRequest;
  onDismiss: (requestId: string) => void;
}

/**
 * PermissionDialog — modal shown when the CLI asks for tool permission.
 *
 * Layout (matches Claude Code extension):
 * +--------------------------------------+
 * | [Icon] Tool Permission               |
 * +--------------------------------------+
 * | Claude wants to use: ToolName        |
 * |                                      |
 * | { formatted JSON input }             |
 * |                                      |
 * | [Decision reason if present]         |
 * |                                      |
 * | [Deny]  [Always Allow]  [Allow]      |
 * +--------------------------------------+
 */
export const PermissionDialog: React.FC<PermissionDialogProps> = ({
  request,
  onDismiss,
}) => {
  const formattedInput = useMemo(() => {
    return formatToolInput(request.toolName, request.toolInput);
  }, [request.toolName, request.toolInput]);

  const handleAllow = useCallback(() => {
    vscode.postMessage({
      type: 'permission_response',
      requestId: request.requestId,
      allowed: true,
    });
    onDismiss(request.requestId);
  }, [request.requestId, onDismiss]);

  const handleAlwaysAllow = useCallback(() => {
    vscode.postMessage({
      type: 'permission_response',
      requestId: request.requestId,
      allowed: true,
      alwaysAllow: true,
    });
    onDismiss(request.requestId);
  }, [request.requestId, onDismiss]);

  const handleDeny = useCallback(() => {
    vscode.postMessage({
      type: 'permission_response',
      requestId: request.requestId,
      allowed: false,
    });
    onDismiss(request.requestId);
  }, [request.requestId, onDismiss]);

  // Keyboard shortcuts: Enter = Allow, Escape = Deny
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleAllow();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        handleDeny();
      }
    },
    [handleAllow, handleDeny],
  );

  // Determine risk level coloring based on tool name
  const riskColor = useMemo(() => {
    const destructiveTools = ['Bash', 'BashTool', 'Execute', 'rm', 'delete'];
    const editTools = ['Write', 'Edit', 'FileEditTool', 'FileWriteTool', 'MultiEdit'];
    const toolLower = request.toolName.toLowerCase();

    if (destructiveTools.some((t) => toolLower.includes(t.toLowerCase()))) {
      return 'text-red-400';
    }
    if (editTools.some((t) => toolLower.includes(t.toLowerCase()))) {
      return 'text-yellow-400';
    }
    return 'text-blue-400';
  }, [request.toolName]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center pb-4 sm:items-center sm:pb-0"
      onKeyDown={handleKeyDown}
      tabIndex={-1}
      ref={(el) => el?.focus()}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={handleDeny} />

      {/* Dialog */}
      <div className="relative bg-vscode-editor-bg border border-vscode-border rounded-lg shadow-xl max-w-lg w-full mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-vscode-border bg-vscode-sidebar-bg">
          <svg
            className={`w-4 h-4 flex-shrink-0 ${riskColor}`}
            viewBox="0 0 16 16"
            fill="currentColor"
          >
            <path d="M8 1.5a.5.5 0 01.424.235l6.5 10.5A.5.5 0 0114.5 13h-13a.5.5 0 01-.424-.765l6.5-10.5A.5.5 0 018 1.5zM7.25 9.5v-3h1.5v3h-1.5zm0 2.25v-1.5h1.5v1.5h-1.5z" />
          </svg>
          <span className="text-sm font-semibold text-vscode-fg">
            {request.title || 'Tool Permission'}
          </span>
          {request.agentId && (
            <span className="text-xs opacity-50 ml-auto font-mono">
              {request.agentId}
            </span>
          )}
        </div>

        {/* Body */}
        <div className="px-4 py-3 space-y-3 max-h-80 overflow-y-auto">
          {/* Tool name */}
          <div>
            <span className="text-[11px] opacity-50 uppercase tracking-wider">Tool</span>
            <p className={`text-sm font-mono font-semibold mt-0.5 ${riskColor}`}>
              {request.toolName}
            </p>
          </div>

          {/* Decision reason */}
          {request.decisionReason && (
            <div>
              <span className="text-[11px] opacity-50 uppercase tracking-wider">Reason</span>
              <p className="text-xs opacity-80 mt-0.5">{request.decisionReason}</p>
            </div>
          )}

          {/* Blocked path */}
          {request.blockedPath && (
            <div className="flex items-center gap-1.5 text-xs text-yellow-400 bg-yellow-400/10 rounded px-2 py-1">
              <span>Blocked path:</span>
              <code className="font-mono">{request.blockedPath}</code>
            </div>
          )}

          {/* Tool input */}
          <div>
            <span className="text-[11px] opacity-50 uppercase tracking-wider">Input</span>
            <pre className="mt-1 text-xs font-mono bg-vscode-input-bg border border-vscode-input-border rounded p-2.5 overflow-x-auto whitespace-pre-wrap max-h-40 overflow-y-auto leading-relaxed">
              {formattedInput}
            </pre>
          </div>

          {/* Description from CLI */}
          {request.description && (
            <p className="text-xs opacity-50 italic">{request.description}</p>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-vscode-border bg-vscode-sidebar-bg">
          <span className="text-[10px] opacity-30 mr-auto">
            Enter=Allow Esc=Deny
          </span>
          <button
            onClick={handleDeny}
            className="px-3 py-1.5 text-xs rounded border border-vscode-border text-vscode-fg hover:bg-vscode-list-hover-bg transition-colors"
          >
            Deny
          </button>
          <button
            onClick={handleAlwaysAllow}
            className="px-3 py-1.5 text-xs rounded border border-vscode-border text-vscode-fg hover:bg-vscode-list-hover-bg transition-colors"
          >
            Always Allow
          </button>
          <button
            onClick={handleAllow}
            className="px-3 py-1.5 text-xs rounded bg-vscode-button-bg text-vscode-button-fg hover:bg-vscode-button-hover-bg transition-colors font-medium"
            autoFocus
          >
            Allow
          </button>
        </div>
      </div>
    </div>
  );
};

/**
 * Format tool input for display.
 * For common tools, show a more human-readable format than raw JSON.
 */
function formatToolInput(
  toolName: string,
  input: Record<string, unknown>,
): string {
  const toolLower = toolName.toLowerCase();

  // Bash/Execute tools — show the command prominently
  if (toolLower.includes('bash') || toolLower.includes('execute')) {
    if (typeof input.command === 'string') {
      return input.command;
    }
  }

  // File edit tools — show file path and diff summary
  if (toolLower.includes('edit') || toolLower.includes('write')) {
    const parts: string[] = [];
    if (input.file_path || input.path) {
      parts.push(`File: ${input.file_path || input.path}`);
    }
    if (input.old_string && input.new_string) {
      parts.push(`Replace:\n  ${truncate(String(input.old_string), 120)}`);
      parts.push(`With:\n  ${truncate(String(input.new_string), 120)}`);
    }
    if (input.content) {
      parts.push(`Content:\n  ${truncate(String(input.content), 200)}`);
    }
    if (parts.length > 0) {
      return parts.join('\n\n');
    }
  }

  // Read/search tools — show the target
  if (
    toolLower.includes('read') ||
    toolLower.includes('glob') ||
    toolLower.includes('grep') ||
    toolLower.includes('search')
  ) {
    const target = input.file_path || input.path || input.pattern || input.query;
    if (typeof target === 'string') {
      return target;
    }
  }

  // Fallback: pretty-print JSON
  return JSON.stringify(input, null, 2);
}

function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen) + '...';
}
```

- [ ] **Step 2: Verify no syntax errors**

Run: `cd /Users/harshagarwal/Documents/workspace/openclaude-vscode/webview && npx tsc --noEmit 2>&1 | head -20`

- [ ] **Step 3: Commit**

```bash
git add webview/src/components/dialogs/PermissionDialog.tsx
git commit -m "feat(permissions): add PermissionDialog React component with tool input formatting"
```

---

## Task 6: usePermissions Hook

**Files:**
- Create: `webview/src/hooks/usePermissions.ts`

React hook that manages the queue of pending permission requests in the webview. Listens for incoming `permission_request` and `cancel_request` messages from the extension host.

- [ ] **Step 1: Create the usePermissions hook**

```typescript
// webview/src/hooks/usePermissions.ts
import { useState, useEffect, useCallback } from 'react';
import type { PermissionRequest } from '../components/dialogs/PermissionDialog';

/**
 * usePermissions — manages the queue of pending permission request dialogs.
 *
 * Listens for:
 * - 'permission_request' messages from extension host (add to queue)
 * - 'cancel_request' messages from extension host (remove from queue)
 *
 * Returns:
 * - pendingRequests: full array of pending requests
 * - currentRequest: the oldest pending request (FIFO), shown in the dialog
 * - dismissRequest: remove a request from the queue (after user responds)
 * - hasPending: boolean convenience flag
 */
export function usePermissions() {
  const [pendingRequests, setPendingRequests] = useState<PermissionRequest[]>([]);

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const message = event.data;

      if (message.type === 'permission_request') {
        const req: PermissionRequest = {
          requestId: message.requestId,
          toolName: message.toolName,
          toolInput: message.toolInput || {},
          title: message.title,
          description: message.description,
          decisionReason: message.decisionReason,
          blockedPath: message.blockedPath,
          agentId: message.agentId,
        };
        setPendingRequests((prev) => [...prev, req]);
      }

      if (message.type === 'cancel_request') {
        setPendingRequests((prev) =>
          prev.filter((r) => r.requestId !== message.requestId),
        );
      }
    };

    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const dismissRequest = useCallback((requestId: string) => {
    setPendingRequests((prev) =>
      prev.filter((r) => r.requestId !== requestId),
    );
  }, []);

  // FIFO: show the oldest pending request first
  const currentRequest = pendingRequests.length > 0 ? pendingRequests[0] : null;

  return {
    pendingRequests,
    currentRequest,
    dismissRequest,
    hasPending: pendingRequests.length > 0,
    pendingCount: pendingRequests.length,
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add webview/src/hooks/usePermissions.ts
git commit -m "feat(permissions): add usePermissions hook for managing dialog queue"
```

---

## Task 7: Permission Mode Indicator & Mode Selector

**Files:**
- Create: `webview/src/components/input/PermissionModeIndicator.tsx`
- Create: `webview/src/components/input/ModeSelector.tsx`

The PermissionModeIndicator is a small badge in the input footer. Clicking opens the ModeSelector dropdown. Selecting a mode sends `set_permission_mode` to the extension host.

- [ ] **Step 1: Create the ModeSelector dropdown component**

```tsx
// webview/src/components/input/ModeSelector.tsx
import React, { useCallback, useEffect, useRef } from 'react';
import { vscode } from '../../vscode';

export type PermissionMode =
  | 'default'
  | 'plan'
  | 'acceptEdits'
  | 'bypassPermissions'
  | 'dontAsk';

interface ModeSelectorProps {
  currentMode: PermissionMode;
  onClose: () => void;
}

interface ModeOption {
  mode: PermissionMode;
  label: string;
  shortcut?: string;
  description: string;
  color: string;
  dangerGated?: boolean;
}

const MODE_OPTIONS: ModeOption[] = [
  {
    mode: 'default',
    label: 'Default',
    description: 'Ask for permission on dangerous operations',
    color: 'text-blue-400',
  },
  {
    mode: 'plan',
    label: 'Plan',
    shortcut: '/plan',
    description: 'Planning mode — generates a plan document, no tool execution',
    color: 'text-purple-400',
  },
  {
    mode: 'acceptEdits',
    label: 'Accept Edits',
    description: 'Auto-accept file edits, still ask for other operations',
    color: 'text-green-400',
  },
  {
    mode: 'bypassPermissions',
    label: 'Bypass',
    description: 'Skip all permission checks (requires setting)',
    color: 'text-red-400',
    dangerGated: true,
  },
  {
    mode: 'dontAsk',
    label: "Don't Ask",
    description: 'Never prompt for permissions — deny anything not pre-approved',
    color: 'text-yellow-400',
  },
];

/**
 * ModeSelector — dropdown for switching permission modes.
 *
 * Opens above/below the PermissionModeIndicator. Clicking a mode sends
 * set_permission_mode to the extension host and closes the dropdown.
 */
export const ModeSelector: React.FC<ModeSelectorProps> = ({
  currentMode,
  onClose,
}) => {
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click or Escape
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  const handleSelect = useCallback(
    (mode: PermissionMode) => {
      vscode.postMessage({
        type: 'set_permission_mode',
        mode,
      });
      onClose();
    },
    [onClose],
  );

  return (
    <div
      ref={ref}
      className="absolute bottom-full left-0 mb-1 w-72 bg-vscode-editor-bg border border-vscode-border rounded-lg shadow-xl z-50 overflow-hidden"
    >
      <div className="px-3 py-2 border-b border-vscode-border">
        <span className="text-[11px] font-semibold opacity-50 uppercase tracking-wider">
          Permission Mode
        </span>
      </div>
      <div className="py-1">
        {MODE_OPTIONS.map((option) => {
          const isActive = currentMode === option.mode;
          return (
            <button
              key={option.mode}
              onClick={() => handleSelect(option.mode)}
              className={`w-full flex items-start gap-2.5 px-3 py-2 text-left hover:bg-vscode-list-hover-bg transition-colors ${
                isActive ? 'bg-vscode-list-active-bg' : ''
              }`}
            >
              {/* Colored dot indicator */}
              <div
                className={`w-2 h-2 rounded-full mt-1 flex-shrink-0 ${
                  isActive ? option.color.replace('text-', 'bg-') : 'bg-transparent border border-current opacity-30'
                }`}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span
                    className={`text-xs font-medium ${isActive ? option.color : 'text-vscode-fg'}`}
                  >
                    {option.label}
                  </span>
                  {option.shortcut && (
                    <code className="text-[10px] opacity-40 font-mono">
                      {option.shortcut}
                    </code>
                  )}
                  {isActive && (
                    <span className="text-[10px] opacity-40 ml-auto">current</span>
                  )}
                  {option.dangerGated && !isActive && (
                    <span className="text-[10px] text-red-400/70 ml-auto">
                      requires setting
                    </span>
                  )}
                </div>
                <p className="text-[11px] opacity-50 leading-snug mt-0.5">
                  {option.description}
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
```

- [ ] **Step 2: Create the PermissionModeIndicator component**

```tsx
// webview/src/components/input/PermissionModeIndicator.tsx
import React, { useState, useCallback } from 'react';
import { ModeSelector } from './ModeSelector';
import type { PermissionMode } from './ModeSelector';

interface PermissionModeIndicatorProps {
  mode: PermissionMode;
}

/** Human-readable labels */
const MODE_LABELS: Record<PermissionMode, string> = {
  default: 'Default',
  plan: 'Plan',
  acceptEdits: 'Accept Edits',
  bypassPermissions: 'Bypass',
  dontAsk: "Don't Ask",
};

/** Color per mode */
const MODE_COLORS: Record<PermissionMode, string> = {
  default: 'text-blue-400',
  plan: 'text-purple-400',
  acceptEdits: 'text-green-400',
  bypassPermissions: 'text-red-400',
  dontAsk: 'text-yellow-400',
};

/**
 * PermissionModeIndicator — small badge in the input footer showing the
 * current permission mode. Clicking opens the ModeSelector dropdown.
 */
export const PermissionModeIndicator: React.FC<PermissionModeIndicatorProps> = ({
  mode,
}) => {
  const [showPicker, setShowPicker] = useState(false);

  const togglePicker = useCallback(() => {
    setShowPicker((prev) => !prev);
  }, []);

  const closePicker = useCallback(() => {
    setShowPicker(false);
  }, []);

  return (
    <div className="relative inline-flex">
      <button
        onClick={togglePicker}
        className={`flex items-center gap-1.5 px-2 py-0.5 rounded text-xs hover:bg-vscode-list-hover-bg transition-colors ${MODE_COLORS[mode]}`}
        title={`Permission mode: ${MODE_LABELS[mode]}. Click to change.`}
      >
        {/* Shield icon */}
        <svg className="w-3 h-3" viewBox="0 0 16 16" fill="currentColor">
          <path d="M8 0L1 3v5c0 4.25 3 7.25 7 8 4-.75 7-3.75 7-8V3L8 0zm0 1.5l5.5 2.25V8c0 3.5-2.5 6-5.5 6.75C4.5 14 2 11.5 2 8V3.75L8 1.5z" />
        </svg>
        <span className="font-medium">{MODE_LABELS[mode]}</span>
        {/* Dropdown caret */}
        <svg className="w-2.5 h-2.5 opacity-50" viewBox="0 0 16 16" fill="currentColor">
          <path d="M4 6l4 4 4-4H4z" />
        </svg>
      </button>

      {showPicker && (
        <ModeSelector currentMode={mode} onClose={closePicker} />
      )}
    </div>
  );
};
```

- [ ] **Step 3: Commit**

```bash
git add webview/src/components/input/PermissionModeIndicator.tsx webview/src/components/input/ModeSelector.tsx
git commit -m "feat(permissions): add PermissionModeIndicator badge and ModeSelector dropdown"
```

---

## Task 8: Basic PlanViewer Component

**Files:**
- Create: `webview/src/components/dialogs/PlanViewer.tsx`

In plan mode, the CLI sends a plan document (markdown) as part of the assistant message. Story 7 provides a basic rendering with section parsing and approve/revise buttons. The full inline comment system is deferred to Story 19.

- [ ] **Step 1: Create the basic PlanViewer component**

```tsx
// webview/src/components/dialogs/PlanViewer.tsx
import React, { useCallback, useMemo, useState } from 'react';
import { vscode } from '../../vscode';

interface PlanViewerProps {
  /** The plan markdown content from the CLI */
  planContent: string;
  /** Session ID for context */
  sessionId?: string;
  /** Called when user approves or requests revision */
  onAction: (action: 'approve' | 'revise', feedback?: string) => void;
}

/** A parsed section of the plan */
interface PlanSection {
  heading: string | null;
  headingLevel: number;
  content: string;
}

/**
 * PlanViewer — renders a CLI-generated plan document.
 *
 * In plan mode, the CLI generates a plan instead of executing tools.
 * This component renders the plan as formatted sections and provides
 * approve/revise buttons.
 *
 * Story 7 scope: basic markdown section rendering + approve/revise actions.
 * Story 19 scope: text selection, inline comments, numbered indicators,
 *                 <mark> highlighting, clear-context option.
 */
export const PlanViewer: React.FC<PlanViewerProps> = ({
  planContent,
  sessionId,
  onAction,
}) => {
  const sections = useMemo(() => parsePlanSections(planContent), [planContent]);
  const [feedback, setFeedback] = useState('');
  const [showFeedback, setShowFeedback] = useState(false);

  const handleApprove = useCallback(() => {
    onAction('approve', feedback.trim() || undefined);
  }, [onAction, feedback]);

  const handleRevise = useCallback(() => {
    if (!showFeedback) {
      setShowFeedback(true);
      return;
    }
    if (feedback.trim()) {
      onAction('revise', feedback.trim());
    }
  }, [onAction, feedback, showFeedback]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        handleRevise();
      }
    },
    [handleRevise],
  );

  return (
    <div className="border border-purple-500/30 rounded-lg overflow-hidden my-2 bg-purple-500/5">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-purple-500/20">
        <svg className="w-4 h-4 text-purple-400 flex-shrink-0" viewBox="0 0 16 16" fill="currentColor">
          <path d="M4 1h8a1 1 0 011 1v12a1 1 0 01-1 1H4a1 1 0 01-1-1V2a1 1 0 011-1zm1 2v2h6V3H5zm0 3.5v1.5h6V6.5H5zm0 3v1.5h4V9.5H5z" />
        </svg>
        <span className="text-sm font-semibold text-purple-400">Plan</span>
        <span className="text-[11px] opacity-40 ml-auto">
          {sections.length} section{sections.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Plan content — scrollable */}
      <div className="px-4 py-3 space-y-4 max-h-[28rem] overflow-y-auto">
        {sections.map((section, index) => (
          <div key={index}>
            {section.heading && (
              <h3
                className={`font-semibold text-vscode-fg mb-1 ${
                  section.headingLevel === 1
                    ? 'text-sm'
                    : section.headingLevel === 2
                      ? 'text-[13px]'
                      : 'text-xs'
                }`}
              >
                {section.heading}
              </h3>
            )}
            {section.content && (
              <div className="text-xs text-vscode-fg/80 whitespace-pre-wrap font-mono leading-relaxed">
                {section.content}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Feedback textarea (shown when "Request Revision" is clicked first time) */}
      {showFeedback && (
        <div className="px-4 py-2 border-t border-purple-500/20">
          <label className="text-[11px] opacity-50 uppercase tracking-wider block mb-1">
            Revision feedback
          </label>
          <textarea
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Describe what you'd like changed..."
            className="w-full bg-vscode-input-bg border border-vscode-input-border rounded px-2.5 py-1.5 text-xs text-vscode-input-fg outline-none resize-none focus:border-purple-500/50"
            rows={3}
            autoFocus
          />
          <p className="text-[10px] opacity-30 mt-1">
            Cmd+Enter to send
          </p>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-end gap-2 px-4 py-2.5 border-t border-purple-500/20">
        <button
          onClick={handleRevise}
          className="px-3 py-1.5 text-xs rounded border border-vscode-border text-vscode-fg hover:bg-vscode-list-hover-bg transition-colors"
        >
          {showFeedback ? 'Send Revision' : 'Request Revision'}
        </button>
        <button
          onClick={handleApprove}
          className="px-3 py-1.5 text-xs rounded bg-purple-600 text-white hover:bg-purple-700 transition-colors font-medium"
        >
          Approve Plan
        </button>
      </div>
    </div>
  );
};

/**
 * Parse plan markdown into sections split on headings.
 */
function parsePlanSections(markdown: string): PlanSection[] {
  const lines = markdown.split('\n');
  const sections: PlanSection[] = [];
  let currentHeading: string | null = null;
  let currentLevel = 0;
  let currentContent: string[] = [];

  for (const line of lines) {
    const headingMatch = line.match(/^(#{1,4})\s+(.+)$/);
    if (headingMatch) {
      // Save previous section if it has content
      if (currentContent.length > 0 || currentHeading !== null) {
        sections.push({
          heading: currentHeading,
          headingLevel: currentLevel,
          content: currentContent.join('\n').trim(),
        });
      }
      currentHeading = headingMatch[2];
      currentLevel = headingMatch[1].length;
      currentContent = [];
    } else {
      currentContent.push(line);
    }
  }

  // Push the last section
  if (currentContent.length > 0 || currentHeading !== null) {
    sections.push({
      heading: currentHeading,
      headingLevel: currentLevel,
      content: currentContent.join('\n').trim(),
    });
  }

  // If nothing was parsed, return the whole content as one section
  if (sections.length === 0 && markdown.trim()) {
    sections.push({
      heading: null,
      headingLevel: 0,
      content: markdown.trim(),
    });
  }

  return sections;
}
```

- [ ] **Step 2: Commit**

```bash
git add webview/src/components/dialogs/PlanViewer.tsx
git commit -m "feat(permissions): add basic PlanViewer component for plan mode"
```

---

## Task 9: Integrate Permissions into Webview App.tsx

**Files:**
- Edit: `webview/src/App.tsx`

Wire the PermissionDialog, PermissionModeIndicator, and usePermissions hook into the main webview layout.

- [ ] **Step 1: Update App.tsx with permission UI**

Replace the full contents of `webview/src/App.tsx`:

```tsx
// webview/src/App.tsx
import { useState, useEffect } from 'react';
import { vscode } from './vscode';
import { usePermissions } from './hooks/usePermissions';
import { PermissionDialog } from './components/dialogs/PermissionDialog';
import { PermissionModeIndicator } from './components/input/PermissionModeIndicator';
import type { PermissionMode } from './components/input/ModeSelector';

function App() {
  const { currentRequest, dismissRequest, pendingCount } = usePermissions();
  const [permissionMode, setPermissionMode] = useState<PermissionMode>('default');

  // Listen for permission mode updates from the extension host.
  // Mode comes through cli_output system messages (init and status subtypes).
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const message = event.data;
      if (message.type !== 'cli_output' || !message.data) return;

      const data = message.data;
      if (
        data.type === 'system' &&
        (data.subtype === 'status' || data.subtype === 'init') &&
        data.permissionMode
      ) {
        setPermissionMode(data.permissionMode as PermissionMode);
      }
    };

    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  return (
    <div className="flex flex-col h-screen bg-vscode-bg text-vscode-fg">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-vscode-border">
        <h1 className="text-sm font-semibold">OpenClaude</h1>
        <span className="text-xs opacity-50">v0.1.0</span>
      </div>

      {/* Message area (placeholder — full implementation in Story 4) */}
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center opacity-50">
          <p className="text-lg font-semibold mb-2">OpenClaude</p>
          <p className="text-sm">AI coding assistant powered by any LLM</p>
          <p className="text-xs mt-4">Extension shell ready. Chat UI coming in Story 4.</p>
        </div>
      </div>

      {/* Input area (placeholder) */}
      <div className="px-4 py-3 border-t border-vscode-border">
        <div className="flex items-center rounded border border-vscode-input-border bg-vscode-input-bg px-3 py-2">
          <input
            type="text"
            placeholder="Type a message... (not connected yet)"
            className="flex-1 bg-transparent text-vscode-input-fg outline-none text-sm"
            disabled
          />
        </div>

        {/* Footer: permission mode indicator + version */}
        <div className="flex items-center justify-between mt-1.5 px-0.5">
          <PermissionModeIndicator mode={permissionMode} />
          <span className="text-[10px] opacity-25">OpenClaude v0.1.0</span>
        </div>
      </div>

      {/* Permission Dialog overlay — shown when CLI requests tool permission */}
      {currentRequest && (
        <PermissionDialog
          request={currentRequest}
          onDismiss={dismissRequest}
        />
      )}

      {/* Pending permission count badge (when multiple are queued) */}
      {pendingCount > 1 && (
        <div className="fixed bottom-20 right-4 bg-yellow-500 text-black text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center z-40">
          {pendingCount}
        </div>
      )}
    </div>
  );
}

export default App;
```

- [ ] **Step 2: Verify webview builds**

Run: `cd /Users/harshagarwal/Documents/workspace/openclaude-vscode/webview && npx vite build 2>&1 | tail -5`

Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add webview/src/App.tsx
git commit -m "feat(permissions): integrate PermissionDialog and ModeIndicator into App"
```

---

## Task 10: Wire PermissionHandler into Extension Activation

**Files:**
- Edit: `src/extension.ts`
- Edit: `src/webview/webviewProvider.ts`

Connect the PermissionHandler to the extension lifecycle: create it during activation, and expose a hook for connecting it to WebviewBridge instances.

- [ ] **Step 1: Add onBridgeCreated event to OpenClaudeWebviewProvider**

In `src/webview/webviewProvider.ts`, add an EventEmitter so external modules can react when a new WebviewBridge is created:

```typescript
// Add these to the class:
private readonly _onBridgeCreated = new vscode.EventEmitter<WebviewBridge>();
public readonly onBridgeCreated = this._onBridgeCreated.event;

// In resolveWebviewView() and createPanel(), after creating a WebviewBridge instance:
// this._onBridgeCreated.fire(bridge);

// In the dispose method, add:
// this._onBridgeCreated.dispose();
```

- [ ] **Step 2: Import and instantiate PermissionHandler in extension.ts**

```typescript
// src/extension.ts — updated
import * as vscode from 'vscode';
import { OpenClaudeWebviewProvider } from './webview/webviewProvider';
import { PermissionHandler } from './permissions/permissionHandler';

export function activate(context: vscode.ExtensionContext) {
  console.log('OpenClaude VS Code extension activated');

  // Create the permission handler
  const permissionHandler = new PermissionHandler(context);
  context.subscriptions.push(permissionHandler);

  const provider = new OpenClaudeWebviewProvider(context.extensionUri);

  // Register sidebar webview providers
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('openclaudeSidebarSecondary', provider),
  );
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('openclaudeSidebar', provider),
  );

  // Connect permission handler to new webview bridges
  context.subscriptions.push(
    provider.onBridgeCreated((bridge) => {
      permissionHandler.connectBridge(bridge);
    }),
  );

  // Open in New Tab
  context.subscriptions.push(
    vscode.commands.registerCommand('openclaude.editor.open', () => {
      provider.createPanel();
    }),
  );

  // Open (last location)
  context.subscriptions.push(
    vscode.commands.registerCommand('openclaude.editor.openLast', () => {
      provider.createPanel();
    }),
  );

  // Open in Primary Editor
  context.subscriptions.push(
    vscode.commands.registerCommand('openclaude.primaryEditor.open', () => {
      provider.createPanel();
    }),
  );

  // Register remaining commands as no-ops for now
  const noopCommands = [
    'openclaude.window.open',
    'openclaude.sidebar.open',
    'openclaude.terminal.open',
    'openclaude.terminal.open.keyboard',
    'openclaude.createWorktree',
    'openclaude.newConversation',
    'openclaude.focus',
    'openclaude.blur',
    'openclaude.insertAtMention',
    'openclaude.insertAtMentioned',
    'openclaude.acceptProposedDiff',
    'openclaude.rejectProposedDiff',
    'openclaude.showLogs',
    'openclaude.openWalkthrough',
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
}

export function deactivate() {
  console.log('OpenClaude VS Code extension deactivated');
}
```

- [ ] **Step 3: Commit**

```bash
git add src/extension.ts src/webview/webviewProvider.ts
git commit -m "feat(permissions): wire PermissionHandler into extension activation lifecycle"
```

---

## Task 11: Bypass Mode Setting in package.json

**Files:**
- Edit: `package.json`

Ensure the `allowDangerouslySkipPermissions` setting is declared in `contributes.configuration` so VS Code recognizes it.

- [ ] **Step 1: Verify or add the bypass setting**

Search `package.json` for `allowDangerouslySkipPermissions`. If missing, add to `contributes.configuration.properties`:

```json
"openclaudeCode.allowDangerouslySkipPermissions": {
  "type": "boolean",
  "default": false,
  "description": "Allow the 'Bypass Permissions' mode which skips all tool permission checks. Use with extreme caution — tools will execute without confirmation.",
  "scope": "window"
}
```

- [ ] **Step 2: Commit**

```bash
git add package.json
git commit -m "feat(permissions): declare allowDangerouslySkipPermissions setting"
```

---

## Task 12: CLI Spawn Flag Integration Note

**Files:**
- No new files (integration point for Story 2 ProcessManager)

When the ProcessManager (Story 2) spawns the CLI, it must pass `--permission-mode` as a flag. The PermissionHandler exposes `getMode(): PermissionMode` for this purpose.

- [ ] **Step 1: Document the integration pattern**

In `src/process/processManager.ts` (when it exists from Story 2), the spawn method should include:

```typescript
// In ProcessManager.spawn():
const permMode = this.permissionHandler.getMode();
const args = [
  '--output-format', 'stream-json',
  '--input-format', 'stream-json',
  '--permission-mode', permMode,
  // ... other flags
];
```

And the ProcessManager should call `permissionHandler.setStdinWriter(writer)` after spawning, so the PermissionHandler can write control_response messages to the CLI:

```typescript
// After spawn:
const writer = (msg: unknown) => {
  const line = JSON.stringify(msg) + '\n';
  childProcess.stdin.write(line);
};
permissionHandler.setStdinWriter(writer);
```

No code to commit in this task — it is documentation for the Story 2 integration.

---

## Task 13: End-to-End Verification

- [ ] **Step 1: Extension host compilation**

Run: `cd /Users/harshagarwal/Documents/workspace/openclaude-vscode && node esbuild.config.mjs 2>&1`

Expected: `Extension built successfully`

- [ ] **Step 2: Webview compilation**

Run: `cd /Users/harshagarwal/Documents/workspace/openclaude-vscode/webview && npx vite build 2>&1 | tail -5`

Expected: Build succeeds

- [ ] **Step 3: TypeScript type-check (extension host)**

Run: `cd /Users/harshagarwal/Documents/workspace/openclaude-vscode && npx tsc --noEmit 2>&1 | tail -20`

Expected: No type errors in permission-related files

- [ ] **Step 4: TypeScript type-check (webview)**

Run: `cd /Users/harshagarwal/Documents/workspace/openclaude-vscode/webview && npx tsc --noEmit 2>&1 | tail -20`

Expected: No type errors in permission-related files

- [ ] **Step 5: Verify all files exist**

Run:
```bash
ls -la src/permissions/permissionHandler.ts \
       src/permissions/permissionRules.ts \
       src/permissions/permissionRouter.ts \
       webview/src/components/dialogs/PermissionDialog.tsx \
       webview/src/components/dialogs/PlanViewer.tsx \
       webview/src/components/input/PermissionModeIndicator.tsx \
       webview/src/components/input/ModeSelector.tsx \
       webview/src/hooks/usePermissions.ts
```

Expected: All 8 files exist

- [ ] **Step 6: Manual smoke test in Extension Development Host**

1. Press F5 to launch the Extension Development Host
2. Open the OpenClaude sidebar
3. Verify the PermissionModeIndicator shows "Default" (blue shield) in the footer
4. Click the indicator — ModeSelector dropdown should appear with 5 options
5. Click "Plan" — indicator changes to purple "Plan"
6. Click "Accept Edits" — indicator changes to green "Accept Edits"
7. Click "Bypass" — should show VS Code warning about the setting not being enabled
8. Enable `openclaudeCode.allowDangerouslySkipPermissions` in settings
9. Click "Bypass" again — should succeed, indicator changes to red "Bypass"
10. Click "Default" to return to normal mode

- [ ] **Step 7: Final commit (if any uncommitted changes)**

```bash
git add -A
git commit -m "feat(permissions): Story 7 complete — permission system and dialogs"
```

---

## Acceptance Criteria Checklist

| # | Criteria | Implementation | Task |
|---|---|---|---|
| 1 | When CLI sends `control_request`, show PermissionDialog in webview | `PermissionHandler.handlePermissionRequest()` -> bridge.postMessage -> `usePermissions` hook -> `PermissionDialog` | T2, T5, T6 |
| 2 | Dialog shows: tool name, tool input (formatted), Allow/Deny/Always Allow | `PermissionDialog.tsx` with `formatToolInput()` for smart formatting, three action buttons with keyboard shortcuts | T5 |
| 3 | "Always Allow" adds to permission rules | `handleWebviewPermissionResponse()` -> `PermissionRules.add()` + sends `updatedPermissions` to CLI | T1, T2 |
| 4 | Permission mode indicator in footer | `PermissionModeIndicator.tsx` in App.tsx footer, color-coded per mode | T7, T9 |
| 5 | Clicking permission mode shows picker to switch | `ModeSelector.tsx` dropdown opened by PermissionModeIndicator click | T7 |
| 6 | Permission mode passed as `--permission-mode` flag to CLI | `PermissionHandler.getMode()` called by ProcessManager during spawn (documented in T12) | T12 |
| 7 | Auto mode: no dialogs, all tool_use auto-accepted | `shouldAutoApprove()` returns true for `bypassPermissions` mode; `acceptEdits` auto-approves file tools | T2 |
| 8 | Bypass mode: gated behind `allowDangerouslySkipPermissions` setting | `handleWebviewModeChange()` checks VS Code config; shows warning if not enabled | T2, T11 |
| 9 | Plan mode: CLI sends plan document, rendered in PlanViewer | `PlanViewer.tsx` with section parsing, approve/revise buttons, feedback textarea | T8 |
| 10 | `control_cancel_request` handling for stale dialogs | `PermissionHandler.handleCancelRequest()` -> bridge.postMessage `cancel_request` -> `usePermissions` removes from queue | T2, T3, T6 |

---

## Architecture Diagram

```
CLI Process (stdout NDJSON)
  |
  |-- control_request { subtype: 'can_use_tool', tool_name, input, tool_use_id, ... }
  |     |
  |     v
  |   PermissionRouter.handleControlRequest(message)
  |     |
  |     v
  |   PermissionHandler.handlePermissionRequest(requestId, request)
  |     |
  |     +-- shouldAutoApprove(toolName)?
  |     |     |
  |     |     yes --> sendAllowResponse() --> writeToStdin() --> CLI stdin
  |     |     |
  |     |     no  --> pendingRequests.set(requestId, ...)
  |     |             bridge.postMessage({ type: 'permission_request', ... })
  |     |               |
  |     |               v
  |     |             WEBVIEW
  |     |               |
  |     |             usePermissions() hook adds to queue
  |     |               |
  |     |               v
  |     |             PermissionDialog renders
  |     |             User clicks: [Deny] / [Always Allow] / [Allow]
  |     |               |
  |     |               v
  |     |             vscode.postMessage({ type: 'permission_response', ... })
  |     |               |
  |     |               v
  |     |             EXTENSION HOST
  |     |               |
  |     |             bridge.onMessage('permission_response', ...)
  |     |               |
  |     |               v
  |     |             PermissionHandler.handleWebviewPermissionResponse()
  |     |               |
  |     |               +-- allowed + alwaysAllow? --> PermissionRules.add()
  |     |               |
  |     |               v
  |     |             sendAllowResponse() or sendDenyResponse()
  |     |               |
  |     |               v
  |     |             writeToStdin({ type: 'control_response', ... })
  |     |               |
  |     |               v
  |     |             CLI stdin (JSON + newline)
  |
  |-- control_cancel_request { request_id }
  |     |
  |     v
  |   PermissionRouter.handleCancelRequest(message)
  |     --> PermissionHandler.handleCancelRequest(requestId)
  |           --> pendingRequests.delete(requestId)
  |           --> bridge.postMessage({ type: 'cancel_request', requestId })
  |                 --> usePermissions() removes from queue
  |                 --> PermissionDialog unmounts
  |
  |-- control_request { subtype: 'set_permission_mode', mode }
        |
        v
      PermissionRouter.handleControlRequest(message)
        --> PermissionHandler.handleCliModeChange(request, requestId)
              --> currentMode = request.mode
              --> sendControlResponse(requestId, {})  --> CLI stdin
              --> notifyWebviewModeChange(mode)
                    --> bridge.postMessage({ type: 'cli_output', data: { ... permissionMode } })
                          --> App.tsx useEffect updates permissionMode state
                          --> PermissionModeIndicator re-renders


WEBVIEW USER ACTIONS:

  ModeSelector click --> vscode.postMessage({ type: 'set_permission_mode', mode })
    --> bridge.onMessage('set_permission_mode', ...)
    --> PermissionHandler.handleWebviewModeChange(mode)
          +-- bypass? check allowDangerouslySkipPermissions setting
          |     no  --> vscode.window.showWarningMessage() --> STOP
          |     yes --> continue
          --> currentMode = mode
          --> writeToStdin({ type: 'control_request', subtype: 'set_permission_mode', mode })
          --> CLI applies new mode
```
