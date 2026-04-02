# OpenClaude VS Code Extension — Design Specification

**Date:** 2026-04-02
**Author:** Harsh Agarwal + Claude
**Status:** Approved
**Repo:** github.com/Harsh1210/openclaude-vscode
**Extension ID:** `harsh1210.openclaude-vscode`
**Display Name:** OpenClaude VS Code

---

## 1. Overview

A VS Code extension that provides a full-featured AI coding assistant UI by wrapping the OpenClaude CLI (`@gitlawb/openclaude`). The extension replicates 100% of the Claude Code VS Code extension's features — chat interface, diff viewer, @-mentions, slash commands, session management, provider switching, MCP support, plugins, worktrees, and all other capabilities.

**Core principle:** The extension is a thin UI + process wrapper. ALL intelligence (tools, providers, slash commands, MCP, plugins) lives in the CLI. The extension renders what the CLI sends and relays user input back.

### What is OpenClaude?

OpenClaude is a fork of Claude Code that adds an OpenAI-compatible shim (786 lines, 6 files changed), enabling any LLM via the OpenAI Chat Completions API — GPT-4o, Gemini, DeepSeek, Ollama, and 200+ models. It has the same CLI interface, tools, and capabilities as Claude Code.

### 1.1 Reuse Strategy — Maximize Code Reuse from Claude Code Extension

**We do NOT rewrite from scratch.** We reuse as much as possible from the Claude Code VS Code extension, only writing new code where the existing code is minified beyond recovery. For every story: first check if the equivalent exists in Claude Code's extension and extract it.

**What we fork/copy directly (zero or minimal changes needed):**

| Asset | Source | Changes Needed |
|---|---|---|
| `package.json` | Claude Code extension | Rebrand names, IDs, icons. All commands, keybindings, settings, views, menus reused as-is. |
| `claude-code-settings.schema.json` | Claude Code extension (21KB, readable JSON) | Rebrand references from "claude" → "openclaude" |
| Walkthrough markdown | `resources/walkthrough/*.md` | Rebrand text and screenshots |
| SVG icons | `resources/*.svg` | Rebrand colors/logo |
| `.vscode/launch.json`, `tasks.json` | Standard VS Code extension scaffold | Reuse patterns |

**What we deminify and extract from extension.js (~101KB, 846 lines):**

The extension.js is minified but still readable with a formatter. We extract:

| Component | Approach |
|---|---|
| Process spawn logic | Deminify the `spawn(K,V,{cwd:B,shell:!1})` pattern — ~20 lines. Copy the exact flags, env var setup, and restart logic. |
| NDJSON line parser | Deminify the buffer/newline parser (`CO6`, `Ld` functions) — ~30 lines. Copy the exact parsing logic. |
| Diff provider | Deminify the `vscode.diff` setup and TextDocumentContentProvider — ~50 lines. Well-defined VS Code API pattern. |
| MCP IDE server | Deminify the HTTP server setup and tool registration — ~100 lines. Copy the auth token and lockfile pattern. |
| postMessage protocol | Deminify the message type switch statements — extract the exact message type enum and routing. |
| Plan review HTML | Lines 340-690 contain the plan review inline comment system as HTML strings — extractable as-is. |
| Status bar setup | Deminify the StatusBarItem creation, color indicators, click handler — ~20 lines. |
| Command registration | Deminify the `registerCommand` calls — extract the exact command wiring. |

**What we extract from the minified webview/index.js (~198KB, 2045 lines):**

| Component | Approach |
|---|---|
| CSS/Tailwind classes | Deminify and extract the exact class names and layout structure. Replicate the visual design pixel-for-pixel. |
| Component structure | Use the minified code as a reference implementation. Build clean React components that match the exact behavior. |
| Message rendering logic | Extract how each content block type is rendered (thinking, image, document, search, etc.). |
| Input toolbar layout | Extract the exact button arrangement, icons, and dropdown behavior. |
| Permission dialog | Extract the dialog layout, button labels, "Always Allow" logic. |
| Session list | Extract the grouping logic (Today, Yesterday, This Week, etc.), card layout. |

**What we build fresh (minified code is too tangled to extract):**

| Component | Reason |
|---|---|
| React component tree | The webview uses a bundled React app — easier to write clean components than untangle minified JSX with single-letter variable names |
| State management (hooks) | Internal state wiring in minified code uses single-letter variables — not extractable, but behavior is observable |
| Tailwind config | Start fresh with Tailwind, match the visual output by referencing extracted CSS classes |

**Reference implementation locations:**
- Claude Code extension: `~/.vscode/extensions/anthropic.claude-code-2.1.85-darwin-arm64/`
- OpenClaude CLI source: `~/Documents/workspace/openclaude/`
- SDK protocol schemas: `openclaude/src/entrypoints/sdk/controlSchemas.ts`

> **Rule:** Before writing any module, first deminify and check the equivalent in Claude Code's extension. Only write from scratch if extraction is impractical.

---

## 2. Architecture

```
┌─────────────────────────────────────────────────┐
│  Layer 1: Webview (React + Tailwind CSS)        │
│  - Chat UI, message rendering, @-mentions       │
│  - Slash command menu, provider picker          │
│  - Session list, settings UI                    │
│  ↕ postMessage API                              │
├─────────────────────────────────────────────────┤
│  Layer 2: Extension Host (TypeScript)           │
│  - Process manager (spawn/kill openclaude CLI)  │
│  - NDJSON stream parser/writer                  │
│  - Diff manager (VS Code native diff editor)    │
│  - MCP IDE server (localhost HTTP/SSE)          │
│  - Session tracker, status bar, commands        │
│  ↕ stdin/stdout (NDJSON)                        │
├─────────────────────────────────────────────────┤
│  Layer 3: OpenClaude CLI (child process)        │
│  - Spawned with: --output-format stream-json    │
│    --input-format stream-json --ide             │
│  - Handles ALL AI logic, tools, providers       │
│  - Connects back to IDE MCP server              │
└─────────────────────────────────────────────────┘
```

### 2.1 Extension Host Modules

| Module | File | Responsibility |
|---|---|---|
| ProcessManager | `src/process/processManager.ts` | Spawn `openclaude` with correct flags, restart on crash, handle lifecycle |
| NdjsonTransport | `src/process/ndjsonTransport.ts` | Parse NDJSON from stdout, write NDJSON to stdin, line-based buffer |
| WebviewManager | `src/webview/webviewManager.ts` | Create/destroy webview panels in sidebar, editor tabs, new windows |
| DiffManager | `src/diff/diffManager.ts` | Show VS Code native diffs for file edits, handle accept/reject |
| McpIdeServer | `src/mcp/mcpIdeServer.ts` | Local HTTP server exposing getDiagnostics and executeCode tools |
| SessionTracker | `src/session/sessionTracker.ts` | Read session JSONL files, list/resume/fork sessions |
| StatusBarManager | `src/statusbar/statusBarManager.ts` | Colored indicators (blue=waiting, orange=done while hidden) |
| AtMentionProvider | `src/mentions/atMentionProvider.ts` | File picker for @-mentions, fuzzy matching workspace files |
| PermissionHandler | `src/permissions/permissionHandler.ts` | Relay permission requests from CLI to webview, send responses back |
| CommandRegistry | `src/commands/commandRegistry.ts` | Register all VS Code commands |
| SettingsSync | `src/settings/settingsSync.ts` | Read VS Code settings, pass as env vars/flags to CLI |
| WorktreeManager | `src/worktree/worktreeManager.ts` | Create git worktrees, open in new windows |
| AuthManager | `src/auth/authManager.ts` | Handle login/logout, API key validation, provider auth |
| CheckpointManager | `src/checkpoint/checkpointManager.ts` | Track file states per message for rewind/fork |

### 2.2 CLI Spawn Protocol

**Spawn command:**
```bash
openclaude \
  --output-format stream-json \
  --input-format stream-json \
  --model <from settings> \
  --permission-mode <from settings>
```

> **Note:** `--ide` is NOT required for the structured protocol. It only means "auto-connect to IDE if one is available." The structured JSON protocol is activated by `--output-format stream-json --input-format stream-json`.

**Contextual flags:**
- `--resume <uuid>` — resuming a session
- `--continue` — reopening last session
- `--fork-session` — branching from checkpoint
- `--worktree <name>` — isolated worktree
- `--mcp-config <path>` — custom MCP configs
- `--plugin-dir <path>` — plugin directories

**Environment variables injected:**
- Provider-specific: `CLAUDE_CODE_USE_OPENAI=1`, `OPENAI_API_KEY`, `OPENAI_MODEL`, `OPENAI_BASE_URL`, etc.
- Custom env vars from VS Code settings (`openclaudeCode.environmentVariables`)
- Python environment activation if enabled

### 2.3 NDJSON Message Protocol

> **Source of truth:** `src/entrypoints/sdk/controlSchemas.ts` and `src/entrypoints/sdk/coreSchemas.ts` in the OpenClaude CLI repo.

Each line on stdin/stdout is a JSON object followed by `\n`. Unicode line terminators (U+2028, U+2029) are escaped.

#### 2.3.1 Initialize Handshake (REQUIRED — must happen first)

After spawning the CLI, the extension MUST send an `initialize` control_request before any user messages:

```json
{
  "type": "control_request",
  "request_id": "init-001",
  "request": {
    "subtype": "initialize",
    "hooks": {},
    "sdkMcpServers": [],
    "promptSuggestions": true,
    "agentProgressSummaries": true
  }
}
```

The CLI responds with:

```json
{
  "type": "control_response",
  "response": {
    "subtype": "success",
    "request_id": "init-001",
    "response": {
      "commands": [...],       // All available slash commands
      "agents": [...],         // Available agents
      "output_style": "...",   // Current output style
      "available_output_styles": [...],
      "models": [...],         // Available models
      "account": {...},        // Auth/account info
      "pid": 12345,            // CLI process PID
      "fast_mode_state": {...} // Fast mode status
    }
  }
}
```

This response populates the slash command menu, model picker, and account status.

#### 2.3.2 Stdout Messages (CLI → Extension)

The `StdoutMessageSchema` is a union of these top-level types:

**Core Message Types:**

| Type | Description | Key Fields |
|---|---|---|
| `assistant` | Complete assistant turn | `message`, `uuid`, `session_id` |
| `user` | Echoed/replayed user message | `message`, `uuid`, `session_id` |
| `result` | Turn completion (success or error) | `subtype` (success/error_*), `duration_ms`, `total_cost_usd`, `usage`, `modelUsage`, `num_turns`, `stop_reason`, `permission_denials`, `fast_mode_state` |
| `stream_event` | Wrapper for Anthropic streaming events | `event` (contains content_block_start/delta/stop, message_start/delta/stop) |
| `tool_progress` | Long-running tool progress | tool-specific progress data |
| `tool_use_summary` | Summary of tool invocation | tool name, input summary |
| `auth_status` | Auth state change | authentication details |
| `rate_limit_event` | Rate limit warning | limit info |
| `prompt_suggestion` | AI-generated next prompt suggestions | suggestion text |

**System Messages** (type: `system`, differentiated by `subtype`):

| Subtype | Description |
|---|---|
| `init` | Session initialization info |
| `status` | General status update |
| `compact_boundary` | Context compaction occurred |
| `api_retry` | API call being retried |
| `local_command_output` | Output from local command |
| `hook_started` | Hook execution started |
| `hook_progress` | Hook execution progress |
| `hook_response` | Hook execution result |
| `session_state_changed` | Session state transition |
| `files_persisted` | Files saved to disk |
| `task_notification` | Background task notification |
| `task_started` | Background task started |
| `task_progress` | Background task progress |
| `elicitation_complete` | Elicitation flow completed |

**Control Messages:**

| Type | Description |
|---|---|
| `control_request` | CLI asking extension for input (permission, elicitation, hook callback, MCP message) |
| `control_response` | CLI responding to extension's request (initialize, mcp_status, get_context_usage, etc.) |
| `control_cancel_request` | CLI canceling a pending control request (e.g., hook resolved permission) |
| `keep_alive` | Connection health ping |

**Streaming Events** (nested inside `stream_event.event`):

The `stream_event` wraps Anthropic-format streaming events:
```json
{
  "type": "stream_event",
  "event": { "type": "content_block_delta", "index": 0, "delta": { "type": "text_delta", "text": "..." } },
  "parent_tool_use_id": null,
  "uuid": "...",
  "session_id": "..."
}
```

Content block types within streaming events:
- `text` — Standard text response
- `tool_use` — Tool invocation
- `tool_result` — Tool output
- `thinking` — Extended thinking (visible reasoning)
- `redacted_thinking` — Redacted thinking (hidden)
- `image` — Inline image
- `document` — PDF/document content
- `search_result` — Search result
- `web_search_tool_result` — Web search output
- `server_tool_use` — Server-side tool invocation

#### 2.3.3 Stdin Messages (Extension → CLI)

The `StdinMessageSchema` accepts these types:

**User Message:**
```json
{
  "type": "user",
  "message": { "role": "user", "content": "fix the bug in auth.ts" },
  "parent_tool_use_id": null,
  "uuid": "msg-001",
  "session_id": "session-uuid"
}
```

**Control Requests (Extension → CLI):**

The extension actively sends control requests to manage the session:

| Subtype | Purpose | Key Fields |
|---|---|---|
| `initialize` | Start session handshake | `hooks`, `sdkMcpServers`, `promptSuggestions` |
| `interrupt` | Stop/cancel current generation | — |
| `set_permission_mode` | Switch permission mode | `mode` (default/plan/acceptEdits/bypassPermissions/dontAsk) |
| `set_model` | Switch model | `model` |
| `set_max_thinking_tokens` | Configure thinking depth | `max_thinking_tokens` |
| `mcp_status` | Query MCP server status | — |
| `get_context_usage` | Get context window usage (for ContextFooter) | — |
| `rewind_files` | Checkpoint/rewind to previous state | `user_message_id`, `dry_run` |
| `mcp_set_servers` | Configure MCP servers | `servers` |
| `mcp_reconnect` | Reconnect MCP server | `serverName` |
| `mcp_toggle` | Enable/disable MCP server | `serverName`, `enabled` |
| `reload_plugins` | Reload plugin system | — |
| `apply_flag_settings` | Update runtime settings | `settings` |
| `get_settings` | Query current settings | — |
| `stop_task` | Cancel background task | `task_id` |
| `cancel_async_message` | Cancel async message | `message_uuid` |
| `seed_read_state` | Seed file read state | `path`, `mtime` |

**Control Responses (Extension → CLI):**

When the CLI sends a `control_request`, the extension responds:

```json
{
  "type": "control_response",
  "response": {
    "subtype": "success",
    "request_id": "req-001",
    "response": { ... }
  }
}
```

Or error:
```json
{
  "type": "control_response",
  "response": {
    "subtype": "error",
    "request_id": "req-001",
    "error": "User denied permission"
  }
}
```

**Other Stdin Types:**
- `keep_alive` — Connection health pong
- `update_environment_variables` — Update env vars at runtime (`variables` record)

#### 2.3.4 Control Request Subtypes FROM CLI

The CLI sends these `control_request` subtypes that the extension must handle:

| Subtype | Description | Extension Action |
|---|---|---|
| `can_use_tool` | Permission request | Show PermissionDialog, respond allow/deny |
| `elicitation` | Structured user question (from MCP) | Show ElicitationDialog, return user response |
| `hook_callback` | Hook execution callback | Execute hook, return result |
| `mcp_message` | MCP JSON-RPC forwarding | Forward to IDE MCP server |

#### 2.3.5 Error Handling

- Exit code 0 → normal exit
- Exit code non-0 → crash → auto-restart with `--resume`
- stderr → debug logs (captured when `--debug` flag set)
- Stdin closed → CLI terminates gracefully
- `control_cancel_request` → cancel stale permission/elicitation dialogs
- `keep_alive` → send periodically to maintain connection health

---

## 3. Webview UI Components

### 3.1 Chat Core

| Component | Description |
|---|---|
| `ChatPanel` | Root container — message list + input + header |
| `MessageList` | Scrollable list with auto-scroll and lazy loading |
| `UserMessage` | User bubble with text, @-mentions, attachments |
| `AssistantMessage` | AI bubble with streaming markdown, code blocks, tool calls |
| `ToolCallBlock` | Collapsible block showing tool name, input, output |
| `DiffPreview` | Inline diff preview before accept/reject |
| `StreamingIndicator` | Animated typing indicator during streaming |
| `CheckpointMarker` | Hover button on each message — fork conversation, rewind code, or both |

### 3.2 Input Area

| Component | Description |
|---|---|
| `PromptInput` | Auto-resizing textarea, Shift+Enter for newlines |
| `AtMentionPicker` | Dropdown triggered by `@` — files, folders, line ranges, terminal |
| `SlashCommandMenu` | Dropdown triggered by `/` or clicking the `/` button — all commands with fuzzy search |
| `AttachmentBar` | Attached files with remove button |
| `ContextFooter` | Context window usage, line count, eye toggle, permission mode |
| `ProviderBadge` | Current provider + model display |

**Input Toolbar Buttons (bottom of input area, left-to-right):**

| Button | Icon | Action |
|---|---|---|
| `SlashCommandButton` | `/` | Opens slash command menu (same as typing `/`) |
| `FileUploadButton` | Paperclip | Opens file picker to attach images, PDFs, code files |
| `AddContentButton` | `+` | Paste text, URLs, or raw content as context |
| `BrowseWebButton` | Globe | Insert `@browser` reference for Chrome integration |
| `ModeSelector` | Shield | Dropdown: Default / Plan / Accept Edits / Auto / Bypass |
| `EffortSelector` | Gauge | Dropdown: Low / Medium / High / Max effort level |
| `ActiveFileIndicator` | File icon | Shows currently focused file in editor, clickable to reference it |

**Drag-and-drop:** Hold Shift while dragging files into the input area to add as attachments (images, PDFs, code files).

### 3.3 Header & Navigation

| Component | Description |
|---|---|
| `ChatHeader` | New conversation, session title, past conversations button |
| `SessionList` | Searchable past sessions grouped by time period |
| `SessionCard` | Title, model, timestamp, message count |

### 3.4 Overlays & Dialogs

| Component | Description |
|---|---|
| `PermissionDialog` | Modal for tool permission — Allow/Deny/Always Allow |
| `ElicitationDialog` | Structured question from Claude — renders options, text input, dropdowns |
| `ProviderPicker` | Provider setup — API keys, endpoints, model selection |
| `PluginManager` | Plugin list, enable/disable toggles, marketplace |
| `McpServerManager` | MCP server list with status, add/remove/reconnect |
| `PlanViewer` | Interactive plan viewer with inline comment system (see 3.6) |
| `OnboardingChecklist` | 4-step walkthrough |
| `TeleportDialog` | Session transfer confirmation when receiving from another device |
| `FeedbackSurvey` | Session quality survey (configurable probability) |

### 3.5 Content Block Renderers

The webview must render ALL content block types from the CLI stream:

| Renderer | Block Type | Description |
|---|---|---|
| `TextBlockRenderer` | `text` | Markdown with syntax highlighting |
| `ThinkingBlockRenderer` | `thinking` | Collapsible thinking trace (with summary toggle) |
| `RedactedThinkingBlock` | `redacted_thinking` | "Thinking..." indicator (content hidden) |
| `ImageBlockRenderer` | `image` | Inline image display (base64 or URL) |
| `DocumentBlockRenderer` | `document` | PDF/document content rendering |
| `SearchResultBlock` | `search_result` | Formatted search result cards |
| `WebSearchResultBlock` | `web_search_tool_result` | Web search results with URLs |
| `ServerToolUseBlock` | `server_tool_use` | Server-side tool invocation display |

### 3.6 Plan Review Inline Comment System

The PlanViewer is not a simple markdown renderer — it's an interactive annotation system:

1. Claude generates a plan as a markdown document
2. Plan renders in a rich HTML view with section headings detected
3. User can **select text** in the plan → "Add Comment" button appears
4. Clicking opens a **comment textarea** anchored to the selection
5. Comments appear as **numbered indicators** with `<mark>` highlighting
6. All comments sent back to CLI as feedback before execution begins
7. User can approve plan (with or without comments) or request revision

### 3.7 Additional UI Features

| Feature | Description |
|---|---|
| **Stop/Cancel Button** | Visible during streaming — sends interrupt signal to CLI |
| **Retry Button** | On failed assistant messages — resends last user message |
| **Copy Message** | Copy button on each assistant message |
| **Edit User Message** | Click to edit and re-send a previous user message |
| **Search Conversations** | Search within current conversation (Cmd+F in webview) |
| **Export Conversation** | Export session as markdown/JSON |
| **Prompt Suggestions** | AI-generated prompt suggestions (configurable) |
| **Fast Mode Toggle** | Toggle fast mode for quicker responses |
| **Thinking Summaries** | Show/hide thinking summaries in transcript |
| **Reduced Motion** | Accessibility: respect `prefersReducedMotion` setting |
| **Spinner Customization** | Custom spinner verbs and tips during tool execution |
| **Company Announcements** | Show managed announcements on startup |

### 3.5 Shared

| Component | Description |
|---|---|
| `MarkdownRenderer` | Code blocks with syntax highlighting, tables, lists |
| `CodeBlock` | Syntax-highlighted code with copy button |
| `FileReference` | Clickable file path → opens in VS Code |
| `CostDisplay` | Token count and cost |

---

## 4. VS Code Contributions (package.json)

### 4.1 Commands (22 total)

Rebranded from `claude-vscode.*` to `openclaude.*`:

| Command ID | Title |
|---|---|
| `openclaude.editor.open` | OpenClaude: Open in New Tab |
| `openclaude.editor.openLast` | OpenClaude: Open |
| `openclaude.primaryEditor.open` | OpenClaude: Open in Primary Editor |
| `openclaude.window.open` | OpenClaude: Open in New Window |
| `openclaude.sidebar.open` | OpenClaude: Open in Side Bar |
| `openclaude.terminal.open` | OpenClaude: Open in Terminal |
| `openclaude.createWorktree` | OpenClaude: Create Worktree |
| `openclaude.newConversation` | OpenClaude: New Conversation |
| `openclaude.focus` | OpenClaude: Focus Input |
| `openclaude.blur` | OpenClaude: Blur Input |
| `openclaude.insertAtMention` | OpenClaude: Insert @-Mention Reference |
| `openclaude.acceptProposedDiff` | OpenClaude: Accept Proposed Changes |
| `openclaude.rejectProposedDiff` | OpenClaude: Reject Proposed Changes |
| `openclaude.showLogs` | OpenClaude: Show Logs |
| `openclaude.openWalkthrough` | OpenClaude: Open Walkthrough |
| `openclaude.update` | OpenClaude: Update Extension |
| `openclaude.installPlugin` | OpenClaude: Install Plugin |
| `openclaude.logout` | OpenClaude: Logout |
| `openclaude.selectProvider` | OpenClaude: Select Provider |

### 4.2 Keybindings

| Shortcut (Mac) | Shortcut (Win/Linux) | Action | Context |
|---|---|---|---|
| `Cmd+Escape` | `Ctrl+Escape` | Toggle focus editor ↔ input | Not terminal mode |
| `Cmd+Shift+Escape` | `Ctrl+Shift+Escape` | Open in new tab | Not terminal mode |
| `Alt+K` | `Alt+K` | Insert @-mention | Editor focused |
| `Cmd+Alt+K` | `Ctrl+Alt+K` | Insert @-mention (terminal) | Editor focused |
| `Cmd+N` | `Ctrl+N` | New conversation | Panel focused + setting enabled |

### 4.3 Settings

| Setting | Type | Default | Description |
|---|---|---|---|
| `openclaudeCode.selectedModel` | string | `"default"` | AI model override |
| `openclaudeCode.selectedProvider` | string | `"openai"` | Default provider |
| `openclaudeCode.environmentVariables` | array | `[]` | Env vars for CLI |
| `openclaudeCode.useTerminal` | boolean | `false` | Terminal mode instead of native UI |
| `openclaudeCode.allowDangerouslySkipPermissions` | boolean | `false` | Allow bypass mode |
| `openclaudeCode.openclaudeProcessWrapper` | string | — | Custom process wrapper |
| `openclaudeCode.respectGitIgnore` | boolean | `true` | Respect .gitignore |
| `openclaudeCode.initialPermissionMode` | enum | `"default"` | default/acceptEdits/plan/bypassPermissions/dontAsk |
| `openclaudeCode.disableLoginPrompt` | boolean | `false` | Skip auth prompts |
| `openclaudeCode.autosave` | boolean | `true` | Auto-save before read/write |
| `openclaudeCode.useCtrlEnterToSend` | boolean | `false` | Ctrl+Enter to send |
| `openclaudeCode.preferredLocation` | enum | `"panel"` | sidebar or panel |
| `openclaudeCode.enableNewConversationShortcut` | boolean | `false` | Cmd+N shortcut |
| `openclaudeCode.hideOnboarding` | boolean | `false` | Hide walkthrough |
| `openclaudeCode.usePythonEnvironment` | boolean | `true` | Auto-activate Python env |

### 4.4 Views & Containers

- **Activity Bar**: OpenClaude icon (primary sidebar for older VS Code)
- **Secondary Sidebar**: OpenClaude panel (modern VS Code 1.94+)
- **Sessions Sidebar**: Dedicated session list view
- **Webview IDs**: `openclaudePanel`, `openclaudeSidebar`, `openclaudeSidebarSecondary`, `openclaudeSessionsList`

### 4.5 Menus

- **Editor title**: Accept/Reject diff buttons + Open OpenClaude button
- **Command palette**: All commands with appropriate `when` clauses

### 4.6 Walkthrough

4-step onboarding:
1. "Your AI coding partner" — introduction
2. "Open OpenClaude" — how to launch
3. "Chat with OpenClaude" — basic usage with @-mentions
4. "Past conversations" — session history

### 4.7 Settings Schema (CLI Settings Validation)

The extension contributes JSON schema validation for:
- `**/.claude/settings.json`
- `**/.claude/settings.local.json`
- `**/OpenClaude/managed-settings.json`

The schema covers ALL CLI settings (70+ properties). Key categories:

**Authentication & API:**
`apiKeyHelper`, `awsCredentialExport`, `awsAuthRefresh`, `gcpAuthRefresh`, `xaaIdp` (OIDC issuer, clientId, callbackPort), `forceLoginMethod`, `forceLoginOrgUUID`, `otelHeadersHelper`

**Model & Provider:**
`model`, `availableModels`, `modelOverrides`, `fastMode`, `fastModePerSessionOptIn`, `advisorModel`, `effortLevel`, `alwaysThinkingEnabled`

**Permissions:**
`permissions` (allow/deny/ask arrays, defaultMode including `dontAsk`, disableBypassPermissionsMode, disableAutoMode, additionalDirectories), `allowManagedPermissionRulesOnly`

**File Management:**
`respectGitignore`, `cleanupPeriodDays`, `fileSuggestion` (command type), `claudeMdExcludes`

**Hooks:**
`hooks` (27 events: PreToolUse, PostToolUse, PostToolUseFailure, Notification, UserPromptSubmit, SessionStart, SessionEnd, Stop, StopFailure, SubagentStart, SubagentStop, PreCompact, PostCompact, PermissionRequest, PermissionDenied, Setup, TeammateIdle, TaskCreated, TaskCompleted, Elicitation, ElicitationResult, ConfigChange, WorktreeCreate, WorktreeRemove, InstructionsLoaded, CwdChanged, FileChanged), `disableAllHooks`, `allowManagedHooksOnly`, `allowedHttpHookUrls`, `httpHookAllowedEnvVars`

**Git & Attribution:**
`attribution` (commit, PR), `includeGitInstructions`

**Worktree:**
`worktree` (symlinkDirectories, sparsePaths, mainBranch, baseDir)

**MCP:**
`enableAllProjectMcpServers`, `enabledMcpjsonServers`, `disabledMcpjsonServers`, `allowedMcpServers`, `deniedMcpServers`, `allowManagedMcpServersOnly`

**Plugins:**
`enabledPlugins`, `extraKnownMarketplaces`, `strictKnownMarketplaces`, `strictDeniedMarketplaces`, `strictPluginOnlyCustomization`, `pluginConfigs`, `pluginTrustMessage`

**Sandbox:**
`sandbox` (enabled, failIfUnavailable, autoAllowBashIfSandboxed, allowUnsandboxedCommands, network restrictions, filesystem restrictions, excludedCommands)

**Remote & Teleport:**
`remote` (defaultEnvironmentId), `sshConfigs` (host, port, identityFile, startDirectory)

**UI & Customization:**
`outputStyle`, `language`, `statusLine`, `promptSuggestionEnabled`, `showClearContextOnPlanAccept`, `showThinkingSummaries`, `prefersReducedMotion`, `syntaxHighlightingDisabled`, `spinnerTipsEnabled`, `spinnerVerbs`, `spinnerTipsOverride`, `terminalTitleFromRename`, `agent`, `plansDirectory`

**Channels & Notifications:**
`channelsEnabled`, `allowedChannelPlugins`

**Memory:**
`autoMemoryEnabled`, `autoMemoryDirectory`, `autoDreamEnabled`

**Enterprise:**
`companyAnnouncements`, `feedbackSurveyRate`, `skipDangerousModePermissionPrompt`, `minimumVersion`, `autoUpdatesChannel`, `skipWebFetchPreflight`, `env`, `defaultShell`

> **Implementation note:** We fork the Claude Code settings schema, rebrand "claude" → "openclaude", and contribute it in package.json. The CLI already validates these settings — the extension just provides IDE autocomplete and validation.

### 4.8 Teleport & Remote Session Transfer

The extension supports transferring sessions between devices/environments:

1. **Teleport In:** When a session is transferred TO this instance, the CLI sends a `teleported-from` message with `remoteSessionId`, `branch`, and `messageCount`. The extension shows a `TeleportDialog` confirming the transfer.
2. **Teleport Out:** `/teleport` command in CLI initiates transfer to another device. Extension shows QR code or link.
3. **Remote Control:** `/remote-control` enables phone-based control of the session.
4. **Desktop Handoff:** `/desktop` command hands off to desktop app.
5. **Session Portability:** Sessions can flow between CLI, VS Code, desktop app, web, and mobile.

### 4.9 Elicitation System

Claude can ask structured questions during tool execution:

1. CLI sends `elicitation` message with question text and response format (options, free text, dropdown)
2. Extension renders `ElicitationDialog` in webview
3. User responds → extension sends `elicitation_response` back to CLI
4. CLI continues execution with user's answer

---

## 5. Feature Parity Matrix

### 5.1 Features Handled Entirely by CLI (zero extension work)

- All 100+ slash commands
- All 50+ tools (bash, file read/write/edit, glob, grep, web, agents, etc.)
- All 8 providers (OpenAI, Gemini, GitHub, Ollama, Codex, Bedrock, Vertex, Anthropic)
- Plugin system (load, install, enable/disable)
- MCP server connections and tool execution
- Session storage (JSONL files)
- Context compaction (`/compact`)
- Extended thinking
- Memory system (`/memory`)
- Cost tracking
- Provider switching (`/provider`)

### 5.2 Features the Extension Must Implement

| Feature | Complexity | Implementation |
|---|---|---|
| Webview chat UI | High | React + Tailwind SPA in webview |
| All content block renderers | High | Text, thinking, image, document, search, tool_use, server_tool_use |
| NDJSON stream parser | Medium | Line-buffered stdin/stdout parser |
| Native diff viewer | Medium | `vscode.diff` API + TextDocumentContentProvider |
| @-mention file picker | Medium | `vscode.workspace.findFiles` + fuzzy match |
| Permission dialog | Medium | Webview modal rendering control_request |
| Elicitation dialog | Medium | Structured question rendering + response |
| Multiple panel locations | Medium | WebviewPanel + WebviewView providers |
| Session list UI | Medium | Read `~/.claude/projects/` JSONL files (all entry types) |
| Checkpoint/rewind | Medium | File snapshot tracking per assistant message |
| Plan mode inline comments | Medium | Rich HTML with text selection, comment anchoring, numbered indicators |
| Teleport/session transfer | Medium | Handle teleported-from messages, QR code display |
| Settings schema contribution | Medium | Fork + rebrand Claude Code's 70+ property schema |
| Input toolbar (7 buttons) | Medium | /, paperclip, +, globe, mode, effort, file indicator |
| Stop/cancel generation | Low | Interrupt signal to CLI process |
| Retry failed messages | Low | Re-send last user message |
| Edit user messages | Low | Inline edit + re-send |
| Copy messages | Low | Clipboard API |
| Fast mode toggle | Low | Setting + UI indicator |
| Prompt suggestions | Low | Render suggestions from CLI |
| Thinking block rendering | Low | Collapsible thinking trace with summary |
| Image block rendering | Low | Inline base64/URL image display |
| Status bar with colors | Low | `vscode.window.createStatusBarItem` |
| Onboarding walkthrough | Low | Declarative in package.json |
| Git worktree creation | Low | `git worktree add` + open new window |
| Terminal mode fallback | Low | `vscode.window.createTerminal` |
| Keyboard shortcuts | Low | Declarative in package.json |
| Auto-save before read/write | Low | `document.save()` on tool_use events |
| Python env activation | Low | Python extension API |
| URI handler | Low | `vscode://harsh1210.openclaude-vscode/open` |
| Drag-and-drop attachments | Low | Webview DragEvent handler |
| Jupyter cell execution | Low | Notebook API + confirmation QuickPick |
| Feedback survey | Low | Configurable probability dialog |
| Company announcements | Low | Render managed announcements on startup |
| Spinner customization | Low | Custom verbs/tips during tool execution |
| Reduced motion / a11y | Low | Respect `prefersReducedMotion` setting |
| Search within conversation | Low | Cmd+F in webview content |
| Export conversation | Low | Markdown/JSON export |

---

## 6. Tech Stack

| Layer | Technology |
|---|---|
| Extension Host | TypeScript 5.x, VS Code Extension API |
| Webview UI | React 18, Tailwind CSS, Vite (bundler) |
| Markdown Rendering | react-markdown + remark-gfm + rehype-highlight |
| Code Highlighting | Shiki (matches VS Code themes) |
| Build System | esbuild (extension host) + Vite (webview) |
| Testing | Vitest (unit) + @vscode/test-electron (integration) |
| Linting | ESLint + Prettier |
| Package Manager | npm |

---

## 7. Project Structure

```
openclaude-vscode/
├── .vscode/
│   ├── launch.json          # Debug configurations
│   └── tasks.json           # Build tasks
├── src/
│   ├── extension.ts         # Activation entry point
│   ├── commands/
│   │   └── commandRegistry.ts
│   ├── process/
│   │   ├── processManager.ts
│   │   └── ndjsonTransport.ts
│   ├── webview/
│   │   ├── webviewManager.ts
│   │   └── webviewProvider.ts
│   ├── diff/
│   │   ├── diffManager.ts
│   │   └── diffContentProvider.ts
│   ├── mcp/
│   │   └── mcpIdeServer.ts
│   ├── session/
│   │   └── sessionTracker.ts
│   ├── statusbar/
│   │   └── statusBarManager.ts
│   ├── mentions/
│   │   └── atMentionProvider.ts
│   ├── permissions/
│   │   └── permissionHandler.ts
│   ├── settings/
│   │   └── settingsSync.ts
│   ├── worktree/
│   │   └── worktreeManager.ts
│   ├── auth/
│   │   └── authManager.ts
│   ├── checkpoint/
│   │   └── checkpointManager.ts
│   └── types/
│       ├── messages.ts       # NDJSON message types
│       ├── settings.ts       # Extension settings
│       └── protocol.ts       # CLI protocol types
├── webview/
│   ├── src/
│   │   ├── App.tsx
│   │   ├── main.tsx          # Webview entry
│   │   ├── vscode.ts         # VS Code API bridge
│   │   ├── components/
│   │   │   ├── chat/
│   │   │   │   ├── ChatPanel.tsx
│   │   │   │   ├── MessageList.tsx
│   │   │   │   ├── UserMessage.tsx
│   │   │   │   ├── AssistantMessage.tsx
│   │   │   │   ├── ToolCallBlock.tsx
│   │   │   │   ├── DiffPreview.tsx
│   │   │   │   ├── StreamingIndicator.tsx
│   │   │   │   └── CheckpointMarker.tsx
│   │   │   ├── input/
│   │   │   │   ├── PromptInput.tsx
│   │   │   │   ├── AtMentionPicker.tsx
│   │   │   │   ├── SlashCommandMenu.tsx
│   │   │   │   ├── AttachmentBar.tsx
│   │   │   │   ├── ContextFooter.tsx
│   │   │   │   └── ProviderBadge.tsx
│   │   │   ├── header/
│   │   │   │   ├── ChatHeader.tsx
│   │   │   │   ├── SessionList.tsx
│   │   │   │   └── SessionCard.tsx
│   │   │   ├── dialogs/
│   │   │   │   ├── PermissionDialog.tsx
│   │   │   │   ├── ProviderPicker.tsx
│   │   │   │   ├── PluginManager.tsx
│   │   │   │   ├── McpServerManager.tsx
│   │   │   │   └── PlanViewer.tsx
│   │   │   ├── onboarding/
│   │   │   │   ├── OnboardingChecklist.tsx
│   │   │   │   └── WalkthroughStep.tsx
│   │   │   └── shared/
│   │   │       ├── MarkdownRenderer.tsx
│   │   │       ├── CodeBlock.tsx
│   │   │       ├── FileReference.tsx
│   │   │       └── CostDisplay.tsx
│   │   ├── hooks/
│   │   │   ├── useChat.ts
│   │   │   ├── useStream.ts
│   │   │   ├── useSession.ts
│   │   │   └── useVSCode.ts
│   │   └── styles/
│   │       └── index.css     # Tailwind imports
│   ├── index.html
│   ├── vite.config.ts
│   ├── tailwind.config.ts
│   └── tsconfig.json
├── resources/
│   ├── openclaude-logo.png
│   ├── openclaude-logo.svg
│   ├── openclaude-logo-done.svg
│   ├── openclaude-logo-pending.svg
│   └── walkthrough/
│       ├── step1.md
│       ├── step2.md
│       ├── step3.md
│       └── step4.md
├── test/
│   ├── unit/
│   │   ├── ndjsonTransport.test.ts
│   │   ├── processManager.test.ts
│   │   └── sessionTracker.test.ts
│   └── integration/
│       └── extension.test.ts
├── package.json
├── tsconfig.json
├── esbuild.config.mjs        # Extension host bundler
├── .eslintrc.json
├── .prettierrc
├── .vscodeignore
├── CHANGELOG.md
├── LICENSE
└── README.md
```

---

## 8. Sprint Plan (Asana Framework)

### Project: OpenClaude VS Code Extension
### Sprint 1: Foundation to Full Parity

Each story is scoped to be completable in **one session** (~2-4 hours of focused work).

---

### Story 1: Project Scaffolding & Extension Shell
**Points:** 3 | **Priority:** P0 | **Dependency:** None

**Acceptance Criteria:**
- [ ] Initialize npm project with TypeScript, ESLint, Prettier
- [ ] Set up esbuild for extension host bundling
- [ ] Set up Vite + React + Tailwind for webview bundling
- [ ] Create package.json with all 22 commands, keybindings, settings, views, menus (rebranded from Claude Code)
- [ ] Create extension.ts entry point that activates and logs "OpenClaude activated"
- [ ] Create minimal webview that renders "OpenClaude" text
- [ ] VS Code debug launch config working (F5 opens Extension Development Host)
- [ ] Extension appears in sidebar with icon
- [ ] `npm run build` produces working .vsix

**Files to create:**
- `package.json`, `tsconfig.json`, `esbuild.config.mjs`
- `src/extension.ts`
- `webview/` scaffold (Vite + React + Tailwind)
- `.vscode/launch.json`, `.vscode/tasks.json`
- Resources (logo SVGs — placeholder)

---

### Story 2: Process Manager, NDJSON Transport & Initialize Handshake
**Points:** 8 | **Priority:** P0 | **Dependency:** Story 1

**Acceptance Criteria:**
- [ ] ProcessManager spawns `openclaude` CLI with `--output-format stream-json --input-format stream-json`
- [ ] Resolves `openclaude` binary from PATH or npm global
- [ ] Passes environment variables from settings (provider keys, model, etc.)
- [ ] NdjsonTransport parses line-delimited JSON from stdout (handles partial lines, unicode escapes)
- [ ] NdjsonTransport writes JSON + newline to stdin
- [ ] **Initialize handshake**: sends `control_request` with `subtype: initialize` immediately after spawn
- [ ] Parses initialize response to populate: available commands, models, agents, account info, fast mode state
- [ ] **Full type system**: TypeScript types for ALL StdoutMessage and StdinMessage variants (see Section 2.3)
- [ ] **Control request router**: routes incoming `control_request` (can_use_tool, elicitation, hook_callback, mcp_message) to appropriate handlers
- [ ] **Control response sender**: sends `control_response` (success/error) back to CLI with matching `request_id`
- [ ] **Control cancel handler**: handles `control_cancel_request` to dismiss stale dialogs
- [ ] **Keep-alive**: periodic `keep_alive` messages to maintain connection
- [ ] Handles CLI crash → auto-restart with `--resume`
- [ ] Handles CLI exit code 0 → clean shutdown
- [ ] stderr captured for debug logging
- [ ] EventEmitter pattern: `onMessage`, `onError`, `onExit`, `onControlRequest`
- [ ] Unit tests for NDJSON parsing and initialize handshake

**Files to create:**
- `src/process/processManager.ts`
- `src/process/ndjsonTransport.ts`
- `src/process/controlRouter.ts` (routes control_request subtypes)
- `src/types/messages.ts` (ALL SDK message types from controlSchemas.ts)
- `src/types/protocol.ts` (control request/response types)
- `src/types/session.ts` (SDKSessionInfo, result types)
- `test/unit/ndjsonTransport.test.ts`
- `test/unit/processManager.test.ts`
- `test/unit/controlRouter.test.ts`

---

### Story 3: Webview Shell & PostMessage Bridge
**Points:** 5 | **Priority:** P0 | **Dependency:** Story 1

**Acceptance Criteria:**
- [ ] WebviewManager creates panels in 3 locations: sidebar, editor tab, new window
- [ ] Webview loads React app with Tailwind styling
- [ ] PostMessage bridge: webview → extension host → CLI
- [ ] PostMessage bridge: CLI → extension host → webview
- [ ] Content Security Policy configured correctly (nonce-based)
- [ ] Webview retains state when hidden and re-shown (`retainContextWhenHidden`)
- [ ] Multiple simultaneous panels supported (each with own CLI process)
- [ ] `vscode.getState()` / `vscode.setState()` for webview persistence
- [ ] Dark/light theme detection from VS Code

**Files to create:**
- `src/webview/webviewManager.ts`
- `src/webview/webviewProvider.ts`
- `webview/src/main.tsx`, `webview/src/App.tsx`
- `webview/src/vscode.ts` (VS Code API bridge)
- `webview/src/hooks/useVSCode.ts`

---

### Story 4: Chat UI — Message List & Streaming
**Points:** 8 | **Priority:** P0 | **Dependency:** Stories 2, 3

**Acceptance Criteria:**
- [ ] ChatPanel renders full chat interface (header + messages + input)
- [ ] MessageList displays user and assistant messages
- [ ] AssistantMessage streams text in real-time from `content_block_delta` events
- [ ] Markdown rendering with syntax-highlighted code blocks (Shiki)
- [ ] Code blocks have copy button and language label
- [ ] Auto-scroll to bottom on new content, pause on manual scroll-up
- [ ] StreamingIndicator (animated dots) while CLI is responding
- [ ] ToolCallBlock renders tool invocations with collapsible input/output
- [ ] Handles `message_start`, `content_block_start/delta/stop`, `message_delta`, `message_stop`
- [ ] Cost display (tokens used, estimated cost)
- [ ] Session title from `ai-title` message

**Files to create:**
- `webview/src/components/chat/ChatPanel.tsx`
- `webview/src/components/chat/MessageList.tsx`
- `webview/src/components/chat/UserMessage.tsx`
- `webview/src/components/chat/AssistantMessage.tsx`
- `webview/src/components/chat/ToolCallBlock.tsx`
- `webview/src/components/chat/StreamingIndicator.tsx`
- `webview/src/components/shared/MarkdownRenderer.tsx`
- `webview/src/components/shared/CodeBlock.tsx`
- `webview/src/components/shared/CostDisplay.tsx`
- `webview/src/hooks/useChat.ts`
- `webview/src/hooks/useStream.ts`

---

### Story 5: Prompt Input, @-Mentions, Slash Commands & Input Toolbar
**Points:** 8 | **Priority:** P0 | **Dependency:** Story 4

**Acceptance Criteria:**
- [ ] PromptInput auto-resizes, supports Shift+Enter for newlines
- [ ] Enter sends (or Ctrl+Enter if setting enabled)
- [ ] `@` triggers AtMentionPicker — fuzzy search across workspace files
- [ ] Supports @file, @folder, @file#L5-L10, @terminal:name, @browser
- [ ] `/` triggers SlashCommandMenu — all 100+ commands with fuzzy search
- [ ] Command descriptions shown in dropdown
- [ ] Slash command sent to CLI as user message (CLI handles execution)
- [ ] Drag-and-drop files onto input (Shift held) adds as attachments
- [ ] AttachmentBar shows attached files with remove button
- [ ] ContextFooter shows context window usage percentage
- [ ] Eye icon toggles whether Claude can see editor selection
- [ ] PermissionModeIndicator clickable to switch modes
- [ ] ProviderBadge shows current provider + model
- [ ] **Input toolbar buttons:**
  - [ ] `/` button opens slash command menu
  - [ ] Paperclip button opens file picker (images, PDFs, code files)
  - [ ] `+` button for adding text/URL content as context
  - [ ] Globe button inserts `@browser` reference
  - [ ] Mode selector dropdown (Default/Plan/Accept Edits/Auto/Bypass)
  - [ ] Effort selector dropdown (Low/Medium/High/Max)
  - [ ] Active file indicator showing currently focused editor file

**Files to create:**
- `webview/src/components/input/PromptInput.tsx`
- `webview/src/components/input/AtMentionPicker.tsx`
- `webview/src/components/input/SlashCommandMenu.tsx`
- `webview/src/components/input/AttachmentBar.tsx`
- `webview/src/components/input/ContextFooter.tsx`
- `webview/src/components/input/ProviderBadge.tsx`
- `webview/src/components/input/InputToolbar.tsx`
- `webview/src/components/input/ModeSelector.tsx`
- `webview/src/components/input/EffortSelector.tsx`
- `webview/src/components/input/FileUploadButton.tsx`
- `src/mentions/atMentionProvider.ts`

---

### Story 6: Native Diff Viewer — Accept/Reject
**Points:** 5 | **Priority:** P0 | **Dependency:** Story 2

**Acceptance Criteria:**
- [ ] When CLI sends tool_use for FileEditTool/FileWriteTool, show VS Code native diff
- [ ] DiffContentProvider serves original and proposed file content
- [ ] Accept button (checkmark icon) in editor title bar applies changes
- [ ] Reject button (discard icon) in editor title bar discards changes
- [ ] Context variable `openclaude.viewingProposedDiff` controls button visibility
- [ ] Multiple pending diffs supported (one per file)
- [ ] After accept/reject, send `control_response` back to CLI
- [ ] Diff editor closes after decision
- [ ] Auto-save target file after accepting changes

**Files to create:**
- `src/diff/diffManager.ts`
- `src/diff/diffContentProvider.ts`

---

### Story 7: Permission System & Dialogs
**Points:** 5 | **Priority:** P0 | **Dependency:** Story 4

**Acceptance Criteria:**
- [ ] When CLI sends `control_request`, show PermissionDialog in webview
- [ ] Dialog shows: tool name, tool input (formatted), Allow/Deny/Always Allow buttons
- [ ] "Always Allow" adds to permission rules
- [ ] Permission mode indicator in footer (default/plan/acceptEdits/auto/bypass)
- [ ] Clicking permission mode shows picker to switch
- [ ] Permission mode passed as `--permission-mode` flag to CLI
- [ ] Auto mode: no dialogs, all tool_use auto-accepted
- [ ] Bypass mode: gated behind `allowDangerouslySkipPermissions` setting
- [ ] Plan mode: CLI sends plan document, rendered in PlanViewer

**Files to create:**
- `src/permissions/permissionHandler.ts`
- `webview/src/components/dialogs/PermissionDialog.tsx`
- `webview/src/components/dialogs/PlanViewer.tsx`

---

### Story 8: Session Management
**Points:** 5 | **Priority:** P1 | **Dependency:** Story 4

**Acceptance Criteria:**
- [ ] SessionTracker reads JSONL files from `~/.claude/projects/`
- [ ] SessionList shows past sessions searchable by keyword
- [ ] Sessions grouped by: Today, Yesterday, This Week, This Month, Older
- [ ] SessionCard shows: title, model/provider, timestamp, message count
- [ ] Click session → resume (spawns CLI with `--resume <uuid>`)
- [ ] New Conversation button starts fresh CLI process
- [ ] Session title auto-updated from `ai-title` messages
- [ ] Sessions sidebar view (activity bar icon)
- [ ] Delete session removes JSONL file

**Files to create:**
- `src/session/sessionTracker.ts`
- `webview/src/components/header/ChatHeader.tsx`
- `webview/src/components/header/SessionList.tsx`
- `webview/src/components/header/SessionCard.tsx`
- `webview/src/hooks/useSession.ts`

---

### Story 9: Status Bar, Commands & Keyboard Shortcuts
**Points:** 3 | **Priority:** P1 | **Dependency:** Story 2

**Acceptance Criteria:**
- [ ] Status bar item "OpenClaude" with spark icon in bottom-right
- [ ] Blue dot when permission request is pending
- [ ] Orange dot when Claude finishes while tab is hidden
- [ ] Click status bar → opens OpenClaude panel
- [ ] All 22 commands registered and working in Command Palette
- [ ] Cmd+Escape toggles focus between editor and OpenClaude input
- [ ] Cmd+Shift+Escape opens new tab
- [ ] Alt+K inserts @-mention
- [ ] Cmd+N starts new conversation (when setting enabled)
- [ ] Terminal mode: `openclaudeCode.useTerminal` spawns CLI in integrated terminal

**Files to create:**
- `src/statusbar/statusBarManager.ts`
- `src/commands/commandRegistry.ts`

---

### Story 10: Checkpoint/Rewind System
**Points:** 5 | **Priority:** P1 | **Dependency:** Story 4

**Acceptance Criteria:**
- [ ] CheckpointManager tracks message UUIDs for rewind targets
- [ ] Hover on any assistant message shows rewind button
- [ ] Three options: Fork conversation (new branch, keep code), Rewind code (revert files, keep conversation), Fork + Rewind (both)
- [ ] Fork: spawns new CLI with `--fork-session` from that message's UUID
- [ ] **Rewind: sends `control_request` with `subtype: rewind_files` and `user_message_id`** (CLI handles file restoration server-side)
- [ ] Supports `dry_run` mode to preview what files will be reverted
- [ ] CheckpointMarker component renders hover UI
- [ ] Handles `SDKFilesPersistedEvent` and `session_state_changed` system messages

**Files to create:**
- `src/checkpoint/checkpointManager.ts`
- `webview/src/components/chat/CheckpointMarker.tsx`

---

### Story 11: Provider Picker & Auth
**Points:** 5 | **Priority:** P1 | **Dependency:** Story 4

**Acceptance Criteria:**
- [ ] ProviderPicker dialog shows all 8 providers
- [ ] Each provider shows required env vars (API key, base URL, model)
- [ ] Provider selection saves to VS Code settings
- [ ] Provider env vars injected into CLI spawn
- [ ] AuthManager handles login/logout
- [ ] API key validation (test request)
- [ ] Provider badge in input footer updates live
- [ ] `/provider` slash command works (handled by CLI, rendered in chat)
- [ ] Ollama detection (check `http://localhost:11434`)
- [ ] Custom OpenAI-compatible endpoint support

**Files to create:**
- `src/auth/authManager.ts`
- `src/settings/settingsSync.ts`
- `webview/src/components/dialogs/ProviderPicker.tsx`

---

### Story 12: MCP IDE Server & Integration
**Points:** 5 | **Priority:** P1 | **Dependency:** Story 2

**Acceptance Criteria:**
- [ ] McpIdeServer starts local HTTP server on random port (127.0.0.1 only)
- [ ] Generates auth token, writes lockfile to `~/.claude/ide/`
- [ ] Exposes `getDiagnostics` tool (reads VS Code Problems panel)
- [ ] Exposes `executeCode` tool (runs Python in Jupyter kernel with confirmation)
- [ ] CLI auto-discovers and connects to IDE MCP server
- [ ] McpServerManager UI shows all connected MCP servers
- [ ] Server status indicators: connected, failed, pending, disabled, needs-auth
- [ ] Add/remove/reconnect MCP servers via UI
- [ ] `/mcp` slash command works (CLI handles, UI renders)

**Files to create:**
- `src/mcp/mcpIdeServer.ts`
- `webview/src/components/dialogs/McpServerManager.tsx`

---

### Story 13: Plugin Manager UI
**Points:** 3 | **Priority:** P2 | **Dependency:** Story 4

**Acceptance Criteria:**
- [ ] PluginManager dialog shows installed plugins
- [ ] Enable/disable toggles per plugin
- [ ] Marketplace browser (add sources, browse, install)
- [ ] Plugin install scopes: user, project, local
- [ ] `/plugins` and `/plugin` commands work (CLI handles logic)
- [ ] `openclaude.installPlugin` command opens installer
- [ ] Show plugin details: name, version, description, commands, agents

**Files to create:**
- `webview/src/components/dialogs/PluginManager.tsx`

---

### Story 14: Git Worktree Support
**Points:** 3 | **Priority:** P2 | **Dependency:** Story 2

**Acceptance Criteria:**
- [ ] `openclaude.createWorktree` command creates git worktree
- [ ] Prompt for worktree name
- [ ] Run `git worktree add` in workspace
- [ ] Open new VS Code window in worktree directory
- [ ] Spawn separate OpenClaude session in worktree
- [ ] CLI `--worktree <name>` flag support

**Files to create:**
- `src/worktree/worktreeManager.ts`

---

### Story 15: Onboarding, Walkthrough & URI Handler
**Points:** 3 | **Priority:** P2 | **Dependency:** Story 3

**Acceptance Criteria:**
- [ ] 4-step walkthrough in package.json contribution
- [ ] OnboardingChecklist appears on first open
- [ ] Dismissable via `openclaudeCode.hideOnboarding` setting
- [ ] Walkthrough step markdown files with screenshots
- [ ] URI handler: `vscode://harsh1210.openclaude-vscode/open?prompt=...&session=...`
- [ ] JSON schema validation for `.claude/settings.json` and `.claude/settings.local.json`
- [ ] Settings schema file contributed

**Files to create:**
- `resources/walkthrough/step1.md` through `step4.md`
- `webview/src/components/onboarding/OnboardingChecklist.tsx`
- `openclaude-settings.schema.json`

---

### Story 16: Content Block Renderers (Thinking, Images, Documents, Search)
**Points:** 5 | **Priority:** P1 | **Dependency:** Story 4

**Acceptance Criteria:**
- [ ] ThinkingBlockRenderer: collapsible thinking trace, summary toggle (`showThinkingSummaries` setting)
- [ ] RedactedThinkingBlock: "Thinking..." indicator for hidden reasoning
- [ ] ImageBlockRenderer: inline display of base64 and URL images in responses
- [ ] DocumentBlockRenderer: PDF/document content display
- [ ] SearchResultBlock: formatted search result cards
- [ ] WebSearchResultBlock: web search results with clickable URLs
- [ ] ServerToolUseBlock: server-side tool invocation display
- [ ] All block types handle streaming (partial rendering during content_block_delta)

**Files to create:**
- `webview/src/components/blocks/ThinkingBlockRenderer.tsx`
- `webview/src/components/blocks/RedactedThinkingBlock.tsx`
- `webview/src/components/blocks/ImageBlockRenderer.tsx`
- `webview/src/components/blocks/DocumentBlockRenderer.tsx`
- `webview/src/components/blocks/SearchResultBlock.tsx`
- `webview/src/components/blocks/WebSearchResultBlock.tsx`
- `webview/src/components/blocks/ServerToolUseBlock.tsx`

---

### Story 17: Teleport, Elicitation & Advanced Interactions
**Points:** 5 | **Priority:** P2 | **Dependency:** Story 4

**Acceptance Criteria:**
- [ ] TeleportDialog renders when `teleported-from` message received
- [ ] Shows remote session info (branch, message count, source device)
- [ ] Accept/reject incoming teleport
- [ ] Elicitation system: render ElicitationDialog when CLI sends `elicitation` message
- [ ] Support structured responses: multiple choice, free text, dropdown
- [ ] Send `elicitation_response` back to CLI
- [ ] Stop/cancel button visible during streaming — sends SIGINT to CLI
- [ ] Retry button on failed assistant messages
- [ ] Edit user message — click to edit, re-send
- [ ] Copy message button on assistant messages

**Files to create:**
- `webview/src/components/dialogs/TeleportDialog.tsx`
- `webview/src/components/dialogs/ElicitationDialog.tsx`
- `webview/src/components/chat/MessageActions.tsx` (stop, retry, copy, edit)

---

### Story 18: Settings Schema, Fast Mode & Prompt Suggestions
**Points:** 3 | **Priority:** P2 | **Dependency:** Story 1

**Acceptance Criteria:**
- [ ] Fork Claude Code's settings schema, rebrand to OpenClaude
- [ ] Contribute JSON validation for `.claude/settings.json`, `.claude/settings.local.json`, managed settings
- [ ] All 70+ properties present and validated
- [ ] Fast mode toggle in webview UI (setting + badge)
- [ ] Prompt suggestions rendering (configurable via `promptSuggestionEnabled`)
- [ ] Company announcements shown on startup (from managed settings)
- [ ] Feedback survey dialog (configurable probability)
- [ ] Spinner customization (custom verbs/tips during tool execution)

**Files to create:**
- `openclaude-settings.schema.json` (forked + rebranded)
- `webview/src/components/input/FastModeToggle.tsx`
- `webview/src/components/chat/PromptSuggestions.tsx`
- `webview/src/components/dialogs/FeedbackSurvey.tsx`

---

### Story 19: Plan Review Inline Comment System
**Points:** 5 | **Priority:** P1 | **Dependency:** Story 7

**Acceptance Criteria:**
- [ ] Plan renders in rich HTML view (not just markdown)
- [ ] Section headings auto-detected
- [ ] Text selection triggers "Add Comment" button
- [ ] Comment textarea anchored to selected text
- [ ] Numbered comment indicators with `<mark>` highlighting
- [ ] Comments collected and sent back to CLI as feedback
- [ ] Approve plan (with/without comments) or request revision
- [ ] `showClearContextOnPlanAccept` setting for clear context option

**Files to create:**
- `webview/src/components/dialogs/PlanViewer.tsx` (enhanced)
- `webview/src/components/dialogs/PlanComment.tsx`
- `webview/src/components/dialogs/PlanCommentIndicator.tsx`

---

### Story 20: Polish, Testing & Marketplace Publish
**Points:** 5 | **Priority:** P2 | **Dependency:** All previous stories (1-19)

**Acceptance Criteria:**
- [ ] Integration tests with @vscode/test-electron
- [ ] Unit tests for all core modules (ProcessManager, NdjsonTransport, SessionTracker)
- [ ] Logo/branding assets finalized (SVG icons for all states)
- [ ] README with screenshots, installation instructions, provider setup guides
- [ ] CHANGELOG.md
- [ ] `.vscodeignore` optimized (exclude test/, docs/, etc.)
- [ ] `vsce package` produces clean .vsix
- [ ] Extension published to VS Code Marketplace
- [ ] GitHub Actions CI: build + test on push
- [ ] Performance: webview loads in <500ms, streaming renders at 60fps

**Files to create:**
- `test/integration/extension.test.ts`
- `.github/workflows/ci.yml`
- `.github/workflows/publish.yml`
- `README.md`
- `CHANGELOG.md`
- `.vscodeignore`

---

## 9. Sprint Summary

| Story | Title | Points | Priority | Dependency |
|---|---|---|---|---|
| 1 | Project Scaffolding & Extension Shell | 3 | P0 | — |
| 2 | Process Manager, NDJSON Transport & Initialize Handshake | 8 | P0 | Story 1 |
| 3 | Webview Shell & PostMessage Bridge | 5 | P0 | Story 1 |
| 4 | Chat UI — Message List & Streaming | 8 | P0 | Stories 2, 3 |
| 5 | Prompt Input, @-Mentions, Slash Commands & Toolbar | 8 | P0 | Story 4 |
| 6 | Native Diff Viewer — Accept/Reject | 5 | P0 | Story 2 |
| 7 | Permission System & Dialogs | 5 | P0 | Story 4 |
| 8 | Session Management | 5 | P1 | Story 4 |
| 9 | Status Bar, Commands & Keyboard Shortcuts | 3 | P1 | Story 2 |
| 10 | Checkpoint/Rewind System | 5 | P1 | Story 4 |
| 11 | Provider Picker & Auth | 5 | P1 | Story 4 |
| 12 | MCP IDE Server & Integration | 5 | P1 | Story 2 |
| 13 | Plugin Manager UI | 3 | P2 | Story 4 |
| 14 | Git Worktree Support | 3 | P2 | Story 2 |
| 15 | Onboarding, Walkthrough & URI Handler | 3 | P2 | Story 3 |
| 16 | Content Block Renderers (Thinking, Images, Docs, Search) | 5 | P1 | Story 4 |
| 17 | Teleport, Elicitation & Advanced Interactions | 5 | P2 | Story 4 |
| 18 | Settings Schema, Fast Mode & Prompt Suggestions | 3 | P2 | Story 1 |
| 19 | Plan Review Inline Comment System | 5 | P1 | Story 7 |
| 20 | Polish, Testing & Marketplace Publish | 5 | P2 | All (1-19) |
| **Total** | | **99** | | |

### Dependency Graph

```
Story 1 (Scaffold)
├── Story 2 (Process/NDJSON) ──→ Story 6 (Diff), Story 9 (StatusBar), Story 12 (MCP), Story 14 (Worktree)
├── Story 3 (Webview Shell) ──→ Story 15 (Onboarding)
├── Story 18 (Settings Schema)
└── Stories 2+3 ──→ Story 4 (Chat UI)
                    ├── Story 5 (Input/@/Slash/Toolbar)
                    ├── Story 7 (Permissions) ──→ Story 19 (Plan Comments)
                    ├── Story 8 (Sessions)
                    ├── Story 10 (Checkpoint)
                    ├── Story 11 (Provider)
                    ├── Story 13 (Plugins)
                    ├── Story 16 (Content Block Renderers)
                    └── Story 17 (Teleport/Elicitation)

All ──→ Story 20 (Polish & Publish)
```

### Recommended Execution Order (12 Sessions)

**Session 1:** Story 1 (Scaffold)
**Session 2:** Stories 2 + 3 in parallel (Process + Webview)
**Session 3:** Story 4 (Chat UI — biggest piece)
**Session 4:** Story 5 (Input — second biggest)
**Session 5:** Stories 6 + 7 in parallel (Diff + Permissions)
**Session 6:** Stories 8 + 9 in parallel (Sessions + StatusBar)
**Session 7:** Stories 10 + 11 in parallel (Checkpoint + Provider)
**Session 8:** Stories 12 + 16 in parallel (MCP + Content Blocks)
**Session 9:** Stories 13 + 18 in parallel (Plugins + Settings Schema)
**Session 10:** Stories 14 + 15 in parallel (Worktree + Onboarding)
**Session 11:** Stories 17 + 19 in parallel (Teleport/Elicitation + Plan Comments)
**Session 12:** Story 20 (Polish & Publish)

---

## 10. Risks & Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| NDJSON protocol differs from what we documented | High | Test against actual CLI output early (Story 2) |
| OpenClaude CLI doesn't support `--ide` flag | High | Check CLI source; may need to pass IDE info via env vars instead |
| Webview performance with large conversations | Medium | Virtual scrolling, lazy rendering, context compaction |
| Provider auth complexity (OAuth for MCP) | Medium | Delegate to CLI; extension just shows status |
| VS Code API changes across versions | Low | Target minimum 1.94.0, test on latest |
| OpenClaude CLI updates break protocol | Medium | Pin CLI version in docs, add protocol version negotiation |
