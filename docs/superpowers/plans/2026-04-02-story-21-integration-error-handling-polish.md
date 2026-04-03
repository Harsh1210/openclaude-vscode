# Story 21: Integration Wiring, Error Handling & Visual Polish — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close all integration gaps that fall between Stories 5–20. Wire every module into `extension.ts` as a single cohesive system, handle all CLI message types the webview currently ignores, add robust error/rate-limit UX, match Claude Code's visual design, and ensure the extension works end-to-end without manual debug commands.

**Why this story exists:** Each story (5–20) builds its module in isolation. The "Step 6: wire into extension.ts" in each plan is an afterthought that assumes prior stories are already integrated. In practice, the integration surface is where bugs live. This story is the explicit integration + error-handling + polish pass.

**Architecture:** No new modules. This story modifies `extension.ts`, `useChat.ts`, `ChatPanel.tsx`, `App.tsx`, CSS, and the webview message router to connect everything that Stories 5–20 built.

**Tech Stack:** TypeScript 5.x, React 18, Tailwind CSS 3, VS Code Extension API, Vitest

**Spec:** [2026-04-02-openclaude-vscode-extension-design.md](../specs/2026-04-02-openclaude-vscode-extension-design.md) — Sections 2.3.2, 2.3.5, 3.1, 5.2

**Depends on:** Stories 1–20 (all must be implemented first)

---

## Problem Statement

After implementing Stories 1–20, the following gaps remain:

1. **extension.ts wiring** — Each story adds modules but the central `activate()` function needs a single coherent composition that connects ProcessManager ↔ WebviewBridge ↔ all managers (Permission, Session, Checkpoint, Auth, MCP, Plugin, Worktree, StatusBar, Commands).

2. **Unhandled CLI message types** — The webview's `useChat` hook only handles `stream_event`, `user`, `assistant`, `result`, and `system` (init). The CLI also sends: `rate_limit_event`, `tool_progress`, `tool_use_summary`, `auth_status`, `prompt_suggestion`, and 15+ system subtypes (`api_retry`, `compact_boundary`, `session_state_changed`, `files_persisted`, `hook_started`, `hook_response`, `task_notification`, etc.).

3. **Error UX** — Rate limits, auth failures, CLI crashes, and network errors need user-facing banners with retry timers, not just a red text string.

4. **Visual parity with Claude Code** — Font sizes, spacing, border radii, animation timings, scrollbar styling, and color usage need to match the reference implementation.

5. **Process lifecycle edge cases** — CLI crash → auto-restart, clean shutdown on extension deactivate, multiple panels sharing one process, process state broadcast to all panels.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/extension.ts` | **Major rewrite**: single coherent `activate()` that composes all managers |
| `webview/src/hooks/useChat.ts` | Handle all CLI message types, not just the 5 currently supported |
| `webview/src/hooks/useProcessState.ts` | New hook: track CLI process state (starting/running/stopped/crashed/rate-limited) |
| `webview/src/components/chat/ChatPanel.tsx` | Integrate error banners, rate limit UI, process state indicators |
| `webview/src/components/chat/ErrorBanner.tsx` | Rate limit countdown, auth error, crash recovery UI |
| `webview/src/components/chat/SystemMessage.tsx` | Render system messages (api_retry, compact_boundary, hook events, etc.) |
| `webview/src/components/chat/ToolProgress.tsx` | Render tool_progress and tool_use_summary inline |
| `webview/src/styles/index.css` | Visual polish: match Claude Code fonts, spacing, scrollbars, animations |
| `webview/tailwind.config.ts` | Extend theme with Claude Code's exact color tokens and spacing scale |
| `test/unit/integration.test.ts` | Integration tests for the full message flow |

---

## Task 1: Extension Host — Unified Manager Composition

**Files:**
- Rewrite: `src/extension.ts`

Wire all managers from Stories 5–20 into a single coherent `activate()`. The current `extension.ts` has placeholder stubs and a debug-only ProcessManager. Replace with production wiring.

- [ ] **Step 1: Create a manager registry pattern**

Instead of ad-hoc variables, create a typed registry:

```typescript
interface ExtensionManagers {
  output: vscode.OutputChannel;
  webview: WebviewManager;
  process: ProcessManager | undefined;
  diff: DiffManager;
  statusBar: StatusBarManager;
  commands: CommandRegistry;
  terminal: TerminalManager;
  session: SessionTracker;
  checkpoint: CheckpointManager;
  auth: AuthManager;
  mcp: McpIdeServer;
  worktree: WorktreeManager;
  permission: PermissionHandler;
}
```

- [ ] **Step 2: Wire ProcessManager auto-spawn on first webview interaction**

The ProcessManager should spawn lazily when the first `send_prompt`, `resume_session`, or panel open occurs. Not on extension activation (too early — no workspace context yet).

```typescript
async function ensureProcess(managers: ExtensionManagers): Promise<ProcessManager> {
  if (managers.process?.state === ProcessState.Ready) return managers.process;
  // ... spawn logic with all manager connections
}
```

- [ ] **Step 3: Wire all webview message handlers**

Register handlers for every `WebviewToHostMessage` type:

| Webview Message | Handler |
|---|---|
| `send_prompt` | Forward to CLI as `user` message via ProcessManager.write() |
| `interrupt` | Send SIGINT to CLI process |
| `new_conversation` | Kill process, clear state, broadcast to all panels |
| `resume_session` | Kill process, respawn with `--resume <sessionId>` |
| `permission_response` | Forward to PermissionHandler → CLI control_response |
| `elicitation_response` | Forward to CLI control_response |
| `set_model` | Update AuthManager, restart process if needed |
| `set_permission_mode` | Forward to CLI control_request |
| `get_context_usage` | Forward to CLI control_request, relay response |
| `copy_to_clipboard` | `vscode.env.clipboard.writeText()` |
| `open_file` | `vscode.window.showTextDocument()` with line/column |
| `diff_response` | Forward to DiffManager |
| `get_sessions` | Query SessionTracker, send session_list to webview |
| `slash_command` | Forward to CLI as user message with command prefix |
| `set_effort_level` | Forward to CLI control_request |
| `rewind` | Forward to CheckpointManager → CLI control_request |

- [ ] **Step 4: Wire all CLI message forwarding**

Forward CLI stdout messages to the webview, but also intercept specific types for host-side processing:

```typescript
processManager.onMessage((msg) => {
  // Host-side processing
  switch (msg.type) {
    case 'system':
      if (msg.subtype === 'init') managers.session.handleInit(msg);
      if (msg.subtype === 'session_state_changed') managers.checkpoint.handleSessionStateChanged(...);
      if (msg.subtype === 'files_persisted') managers.checkpoint.markFilesPersisted(...);
      if (msg.subtype === 'ai-title') managers.session.updateSessionTitle(...);
      break;
    case 'assistant':
      managers.checkpoint.registerAssistantMessage(msg.uuid, msg.session_id);
      break;
    case 'result':
      managers.statusBar.setCompletedWhileHidden(!webviewVisible);
      break;
  }

  // Always forward to webview
  managers.webview.broadcast({ type: 'cli_output', data: msg });
});
```

- [ ] **Step 5: Wire process lifecycle events**

```typescript
processManager.onError((err) => {
  managers.statusBar.setPendingPermission(false);
  managers.webview.broadcast({ type: 'process_state', state: 'crashed' });
  // Show VS Code notification for non-recoverable errors
});

processManager.onExit((code, signal) => {
  if (code !== 0 && code !== null) {
    managers.webview.broadcast({ type: 'process_state', state: 'crashed' });
  } else {
    managers.webview.broadcast({ type: 'process_state', state: 'stopped' });
  }
});
```

- [ ] **Step 6: Verify all commands delegate to real managers (no more noopCommands)**

Replace every `'Coming soon!'` stub with the actual manager call from the corresponding story.

- [ ] **Step 7: Run build and verify no TypeScript errors**

Run: `npm run build:extension`

- [ ] **Step 8: Commit**

```bash
git add src/extension.ts
git commit -m "feat(integration): unified manager composition in extension.ts"
```

---

## Task 2: Webview — Handle All CLI Message Types

**Files:**
- Modify: `webview/src/hooks/useChat.ts`
- Create: `webview/src/hooks/useProcessState.ts`

The `useChat` hook currently handles 5 message types. The CLI sends 15+. Add routing for all of them.

- [ ] **Step 1: Create useProcessState hook**

```typescript
// webview/src/hooks/useProcessState.ts
export type ProcessStatus = 'idle' | 'starting' | 'running' | 'stopped' | 'crashed' | 'rate_limited' | 'auth_error';

export interface RateLimitInfo {
  resetsAt: number; // Unix timestamp
  rateLimitType: string;
  message: string;
}

export function useProcessState() {
  const [status, setStatus] = useState<ProcessStatus>('idle');
  const [rateLimitInfo, setRateLimitInfo] = useState<RateLimitInfo | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const data = event.data;
      if (data.type === 'process_state') {
        setStatus(data.state);
      }
      // Handle rate_limit_event from cli_output
      if (data.type === 'cli_output' && data.data?.type === 'rate_limit_event') {
        const info = data.data.rate_limit_info;
        setStatus('rate_limited');
        setRateLimitInfo({
          resetsAt: info.resetsAt,
          rateLimitType: info.rateLimitType,
          message: `Rate limited (${info.rateLimitType}). Resets at ${new Date(info.resetsAt * 1000).toLocaleTimeString()}.`,
        });
      }
      // Handle auth_status
      if (data.type === 'cli_output' && data.data?.type === 'auth_status') {
        if (data.data.error) {
          setStatus('auth_error');
          setAuthError(data.data.error);
        }
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  return { status, rateLimitInfo, authError, setStatus };
}
```

- [ ] **Step 2: Extend useChat to handle all message types**

Add cases to the message router in `useChat.ts`:

```typescript
// Inside the useEffect message handler, after the existing switch:

case 'rate_limit_event':
  // Handled by useProcessState — but also set error in chat
  setError(msg.rate_limit_info?.status === 'rejected'
    ? `Rate limited. Resets at ${new Date(msg.rate_limit_info.resetsAt * 1000).toLocaleTimeString()}.`
    : 'Rate limit warning');
  break;

case 'tool_progress':
  // Update the last assistant message with progress info
  setMessages(prev => {
    const last = prev[prev.length - 1];
    if (last?.role === 'assistant') {
      return [...prev.slice(0, -1), { ...last, toolProgress: msg }];
    }
    return prev;
  });
  break;

case 'tool_use_summary':
  // Append as a system-style message in the chat
  setMessages(prev => [...prev, {
    id: `tool-summary-${Date.now()}`,
    role: 'system',
    text: `Tool: ${msg.tool_name} — ${msg.summary || 'completed'}`,
    isStreaming: false,
    timestamp: Date.now(),
    parentToolUseId: null,
  }]);
  break;

case 'prompt_suggestion':
  setPromptSuggestions(prev => [...prev.filter(s => s !== msg.suggestion), msg.suggestion].slice(-5));
  break;

case 'system':
  switch (msg.subtype) {
    case 'init':
      handleSystemInit(msg);
      break;
    case 'api_retry':
      // Show transient "Retrying API call..." indicator
      setMessages(prev => [...prev, {
        id: `retry-${Date.now()}`,
        role: 'system',
        text: `Retrying API call (attempt ${msg.attempt || '?'})...`,
        isStreaming: false,
        timestamp: Date.now(),
        parentToolUseId: null,
      }]);
      break;
    case 'compact_boundary':
      setMessages(prev => [...prev, {
        id: `compact-${Date.now()}`,
        role: 'system',
        text: 'Context compacted to fit within limits.',
        isStreaming: false,
        timestamp: Date.now(),
        parentToolUseId: null,
      }]);
      break;
    case 'ai-title':
      if (msg.title) handleSessionTitle(msg.title);
      break;
    // hook_started, hook_response — ignore in chat UI (debug only)
    // session_state_changed, files_persisted — handled by host
  }
  break;
```

- [ ] **Step 3: Add `promptSuggestions` state to useChat return value**

- [ ] **Step 4: Run webview build**

Run: `npm run build:webview`

- [ ] **Step 5: Commit**

```bash
git add webview/src/hooks/useChat.ts webview/src/hooks/useProcessState.ts
git commit -m "feat(integration): handle all CLI message types in webview"
```

---

## Task 3: Error Banner & Rate Limit UI

**Files:**
- Create: `webview/src/components/chat/ErrorBanner.tsx`
- Modify: `webview/src/components/chat/ChatPanel.tsx`

- [ ] **Step 1: Create ErrorBanner component**

```typescript
// webview/src/components/chat/ErrorBanner.tsx
// Renders:
// - Rate limit: countdown timer showing "Resets in X:XX", retry button
// - Auth error: "Authentication failed" with link to provider settings
// - CLI crash: "Connection lost" with reconnect button
// - Generic error: red banner with error text
```

Features:
- Rate limit countdown timer (live updating every second)
- Retry button that triggers `ensureProcess()` via postMessage
- Auth error with "Open Settings" button
- CLI crash with "Reconnect" button
- Dismissible for non-blocking errors
- Matches Claude Code's error banner styling (yellow for rate limit, red for errors)

- [ ] **Step 2: Create SystemMessage component**

```typescript
// webview/src/components/chat/SystemMessage.tsx
// Renders inline system messages (api_retry, compact_boundary, etc.)
// Styled as subtle gray text with icon, not a full message bubble
```

- [ ] **Step 3: Create ToolProgress component**

```typescript
// webview/src/components/chat/ToolProgress.tsx
// Renders tool_progress and tool_use_summary as inline indicators
// Shows spinner + tool name + progress text during execution
// Collapses to summary after completion
```

- [ ] **Step 4: Integrate into ChatPanel**

```tsx
// In ChatPanel.tsx:
const { status, rateLimitInfo, authError } = useProcessState();

// Above the message list:
<ErrorBanner
  status={status}
  rateLimitInfo={rateLimitInfo}
  authError={authError}
  onRetry={() => vscode.postMessage({ type: 'retry_connection' })}
  onOpenSettings={() => vscode.postMessage({ type: 'open_provider_picker' })}
/>

// In the message list, render SystemMessage for system-role messages
// In the message list, render ToolProgress for tool progress messages
```

- [ ] **Step 5: Handle `result` messages with `is_error: true`**

When the CLI sends a `result` with `is_error: true`, extract the error message and display it prominently. For rate limits specifically, parse the `result.result` string ("You've hit your limit · resets 3am") and show the countdown.

- [ ] **Step 6: Build and verify**

Run: `npm run build`

- [ ] **Step 7: Commit**

```bash
git add webview/src/components/chat/ErrorBanner.tsx webview/src/components/chat/SystemMessage.tsx webview/src/components/chat/ToolProgress.tsx webview/src/components/chat/ChatPanel.tsx
git commit -m "feat(integration): add error banners, rate limit UI, system messages"
```

---

## Task 4: Visual Polish — Match Claude Code's Design

**Files:**
- Modify: `webview/src/styles/index.css`
- Modify: `webview/tailwind.config.ts`
- Modify: Various component files for spacing/font fixes

Reference: `~/.vscode/extensions/anthropic.claude-code-2.1.85-darwin-arm64/`

- [ ] **Step 1: Extract Claude Code's exact CSS variables and Tailwind tokens**

Deminify the Claude Code webview CSS and extract:
- Font family: `var(--vscode-editor-font-family)` for code, system font for UI text
- Font sizes: 13px base, 12px for secondary, 11px for tertiary
- Spacing scale: 4px, 8px, 12px, 16px, 24px
- Border radius: 6px for cards, 4px for inputs, 8px for dialogs
- Message bubble max-width, padding, margin
- Scrollbar styling (thin, VS Code themed)
- Code block styling (background, border, padding, font-size)
- Input area height, padding, border styling

- [ ] **Step 2: Update Tailwind config with Claude Code tokens**

```typescript
// webview/tailwind.config.ts
export default {
  theme: {
    extend: {
      fontSize: {
        'chat-base': '13px',
        'chat-sm': '12px',
        'chat-xs': '11px',
        'chat-code': '12px',
      },
      spacing: {
        'msg-px': '16px',
        'msg-py': '12px',
        'msg-gap': '8px',
      },
      borderRadius: {
        'card': '6px',
        'input': '4px',
        'dialog': '8px',
      },
      maxWidth: {
        'message': '768px',
      },
    },
  },
};
```

- [ ] **Step 3: Style the scrollbar**

```css
/* webview/src/styles/index.css */
::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}
::-webkit-scrollbar-track {
  background: transparent;
}
::-webkit-scrollbar-thumb {
  background: var(--vscode-scrollbarSlider-background);
  border-radius: 3px;
}
::-webkit-scrollbar-thumb:hover {
  background: var(--vscode-scrollbarSlider-hoverBackground);
}
```

- [ ] **Step 4: Fix message bubble styling**

- User messages: right-aligned, blue-ish background, rounded corners
- Assistant messages: left-aligned, no background (or subtle), full-width
- Code blocks: monospace font, dark background, copy button, language label
- Match Claude Code's exact padding, margin, and max-width

- [ ] **Step 5: Fix input area styling**

- Match Claude Code's input height (min 40px, auto-grow to 200px)
- Border styling: 1px solid, focus ring
- Placeholder text color and font
- Button styling in toolbar area

- [ ] **Step 6: Fix header styling**

- Session title font size and weight
- Model badge styling
- New conversation / history button styling

- [ ] **Step 7: Add animations**

- Streaming indicator: pulsing dots (match Claude Code's exact animation)
- Message appear: subtle fade-in
- Error banner: slide-down
- Reduce motion: respect `prefers-reduced-motion`

- [ ] **Step 8: Build and visual comparison**

Run: `npm run build`
Compare side-by-side with Claude Code extension.

- [ ] **Step 9: Commit**

```bash
git add webview/src/styles/index.css webview/tailwind.config.ts webview/src/components/
git commit -m "feat(polish): match Claude Code visual design — fonts, spacing, animations"
```

---

## Task 5: Process Lifecycle Edge Cases

**Files:**
- Modify: `src/extension.ts`
- Modify: `src/process/processManager.ts`

- [ ] **Step 1: Handle CLI crash → auto-restart with --resume**

When the CLI exits with non-zero code and we have a session ID, auto-restart with `--resume`. Show a transient "Reconnecting..." banner in the webview. Cap restart attempts at 3 within 30 seconds to avoid restart loops.

```typescript
let restartCount = 0;
let lastRestartTime = 0;

processManager.onExit((code, signal) => {
  if (code !== 0 && code !== null && sessionId) {
    const now = Date.now();
    if (now - lastRestartTime < 30000) {
      restartCount++;
    } else {
      restartCount = 1;
    }
    lastRestartTime = now;

    if (restartCount <= 3) {
      webviewManager.broadcast({ type: 'process_state', state: 'restarting' });
      // Respawn with --resume
      setTimeout(() => ensureProcess(managers, { resume: sessionId }), 1000);
    } else {
      webviewManager.broadcast({ type: 'process_state', state: 'crashed' });
      vscode.window.showErrorMessage('OpenClaude: CLI crashed repeatedly. Check logs.');
    }
  }
});
```

- [ ] **Step 2: Handle multiple panels sharing one process**

All panels share a single ProcessManager. Messages are broadcast to all panels. When a panel sends `send_prompt`, it goes to the shared process. When a panel sends `new_conversation`, ALL panels are cleared and the process is restarted.

- [ ] **Step 3: Handle extension deactivation cleanly**

```typescript
export function deactivate() {
  // Kill CLI process gracefully
  processManager?.kill('SIGTERM');
  // Wait up to 2 seconds for clean exit, then SIGKILL
  setTimeout(() => processManager?.kill('SIGKILL'), 2000);
  // Clean up MCP lockfile
  mcpServer?.dispose();
}
```

- [ ] **Step 4: Handle workspace folder changes**

When the user opens a different folder, the CLI needs to be restarted with the new cwd.

```typescript
vscode.workspace.onDidChangeWorkspaceFolders(() => {
  if (processManager) {
    processManager.dispose();
    processManager = undefined;
    // Next interaction will spawn with new cwd
  }
});
```

- [ ] **Step 5: Commit**

```bash
git add src/extension.ts src/process/processManager.ts
git commit -m "feat(integration): handle CLI crash recovery, multi-panel, clean shutdown"
```

---

## Task 6: Integration Tests

**Files:**
- Create: `test/unit/integration.test.ts`

- [ ] **Step 1: Test the full message flow**

```typescript
describe('Integration: CLI message → webview rendering', () => {
  it('routes stream_event through cli_output to useChat', () => { ... });
  it('routes rate_limit_event to error banner', () => { ... });
  it('routes result with is_error to error state', () => { ... });
  it('routes system/init to session state', () => { ... });
  it('routes system/ai-title to session title', () => { ... });
  it('routes tool_progress to progress indicator', () => { ... });
  it('routes prompt_suggestion to suggestions list', () => { ... });
});

describe('Integration: webview action → CLI message', () => {
  it('send_prompt → user message on stdin', () => { ... });
  it('interrupt → SIGINT to process', () => { ... });
  it('new_conversation → process kill + restart', () => { ... });
  it('resume_session → process restart with --resume', () => { ... });
  it('permission_response → control_response on stdin', () => { ... });
});

describe('Integration: process lifecycle', () => {
  it('auto-spawns on first send_prompt', () => { ... });
  it('auto-restarts on non-zero exit with --resume', () => { ... });
  it('caps restart attempts at 3 within 30 seconds', () => { ... });
  it('broadcasts process_state to all panels', () => { ... });
  it('cleans up on extension deactivate', () => { ... });
});
```

- [ ] **Step 2: Run tests**

Run: `npm test`

- [ ] **Step 3: Commit**

```bash
git add test/unit/integration.test.ts
git commit -m "test(integration): add end-to-end message flow and lifecycle tests"
```

---

## Task 7: Final Build, Package & Install Verification

- [ ] **Step 1: Full build**

Run: `npm run build`

- [ ] **Step 2: Run all tests**

Run: `npm test`

- [ ] **Step 3: Package**

Run: `npx @vscode/vsce package --no-dependencies --allow-missing-repository`

- [ ] **Step 4: Install and verify in VS Code**

Run: `code --install-extension openclaude-vscode-0.1.0.vsix --force`

Manual verification checklist:
- [ ] Extension activates without errors
- [ ] Panel opens in sidebar and editor tab
- [ ] Sending a message spawns the CLI and shows streaming response
- [ ] Rate limit error shows countdown banner (not just red text)
- [ ] Auth error shows "Open Settings" action
- [ ] CLI crash shows "Reconnect" action and auto-restarts
- [ ] Multiple panels share the same CLI session
- [ ] New conversation kills and restarts the CLI
- [ ] Fonts, spacing, and colors match Claude Code
- [ ] Scrollbar is thin and themed
- [ ] Streaming indicator animates correctly
- [ ] Error banner slides in/out smoothly

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "feat(story-21): integration wiring, error handling, and visual polish complete"
```

---

## Final Verification

- [ ] Run: `npm run build`
- [ ] Run: `npm test`
- [ ] Run: `npx @vscode/vsce package --no-dependencies`
- [ ] Manual: full end-to-end test with real CLI
- [ ] Visual: side-by-side comparison with Claude Code extension
