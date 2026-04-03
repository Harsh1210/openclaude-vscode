# Real Claude Code Protocol Reference

Extracted from: `~/.vscode/extensions/anthropic.claude-code-2.1.90-darwin-arm64/`

## Architecture: Channel-Based (NOT simple postMessage)

Claude Code uses a **channel-based** architecture, NOT a simple send_prompt/cli_output pattern.

### Webview → Extension (fromClient stream)

| Message type | Fields | Description |
|---|---|---|
| `launch_claude` | `channelId, resume?, cwd?, permissionMode?, thinkingLevel?` | Start a new CLI session on a channel |
| `close_channel` | `channelId` | End a CLI session |
| `interrupt_claude` | `channelId` | Send interrupt signal |
| `io_message` | `channelId, message, done` | Send user message to CLI (message is `{type:'user', message:{role:'user', content:text}}`) |
| `request` | `channelId, requestId, request:{type, ...}` | Request/response pattern |
| `response` | `requestId, response` | Response to a request from extension |
| `cancel_request` | `targetRequestId` | Cancel a pending request |

### Extension → Webview (send stream)

| Message type | Fields | Description |
|---|---|---|
| `io_message` | `channelId, message, done` | CLI stdout message forwarded to webview |
| `close_channel` | `channelId, error?` | CLI session ended |
| `request` | `channelId, requestId, request:{type,...}` | Extension asking webview for something |
| `response` | `requestId, response` | Response to webview's request |
| `cancel_request` | `targetRequestId` | Cancel a pending request |
| `file_updated` | `channelId, filePath, oldContent, newContent` | File changed by CLI |
| `plan_comment` | `channelId, ...` | Plan comment update |
| `speech_to_text_message` | `channelId, ...` | Speech to text result |

### Request types (webview → extension, inside `request` envelope)

| Request type | Key fields | Response type |
|---|---|---|
| `init` | `channelId?` | `init_response` with full state |
| `get_claude_state` | — | `get_claude_state_response` |
| `get_mcp_servers` | `channelId` | MCP server list |
| `get_context_usage` | `channelId` | Context usage stats |
| `set_mcp_server_enabled` | `channelId, serverName, enabled` | — |
| `reconnect_mcp_server` | `channelId, serverName` | — |
| `list_sessions_request` | — | Session list |
| `rename_session` | `sessionId, title, onlyIfNoCustomTitle` | — |
| `generate_session_title` | `channelId, description` | — |
| `delete_session` | `sessionId` | — |
| `open_file` | `filePath, location` | `open_file_response` |
| `open_diff` | `originalFilePath, newFilePath, edits, supportMultiEdits` | — |
| `open_markdown_preview` | `channelId, content, title, enableComments` | — |
| `get_plan_comments` | `channelId` | Plan comments |
| `remove_plan_comment` | `channelId, commentId` | — |
| `close_plan_preview` | `channelId` | — |
| `set_permission_mode` | `channelId, mode, userInitiated` | — |
| `set_model` | `channelId, model` | — |
| `set_thinking_level` | `channelId, thinkingLevel` | — |
| `apply_settings` | `channelId, settings` | — |
| `get_auth_status` | — | `get_auth_status_response` |
| `login` | `method` | `login_response` |
| `submit_oauth_code` | `code` | `submit_oauth_code_response` |
| `open_config_file` | `configType` | `open_config_file_response` |
| `open_claude_in_terminal` | `prompt, args, location` | `open_claude_in_terminal_response` |
| `open_url` | `url` | `open_url_response` |
| `exec` | `command, params` | — |
| `list_files_request` | `pattern` | `list_files_response` |
| `get_terminal_contents` | `terminalName` | `get_terminal_contents_response` |
| `teleport_session` | `sessionId` | — |
| `checkout_branch` | `branch` | — |
| `check_git_status` | — | — |

### Request types (extension → webview, inside `request` envelope)

| Request type | Key fields | Description |
|---|---|---|
| `tool_permission_request` | `toolName, inputs, suggestions` | Show permission dialog |
| `auth_url` | `url, method` | Show auth URL |
| `create_new_conversation` | — | Clear chat |
| `font_configuration_changed` | `fontConfig` | Font changed |
| `insert_at_mention` | — | Insert @-mention |
| `open_plugins_dialog` | `pluginName, marketplace` | Open plugin manager |
| `proactive_suggestions_update` | — | Update prompt suggestions |
| `selection_changed` | — | Editor selection changed |
| `session_states_update` | — | Session list changed |
| `toggle_dictation` | — | Toggle speech-to-text |
| `update_state` | — | State update |
| `usage_update` | — | Context usage update |
| `visibility_changed` | — | Panel visibility changed |

## CLI Spawn Arguments (exact)

```
--output-format stream-json
--verbose
--input-format stream-json
[--thinking adaptive|disabled]
[--max-thinking-tokens N]
[--effort low|medium|high|max]
[--max-turns N]
[--max-budget-usd N]
[--model MODEL]
[--permission-prompt-tool stdio]  (when canUseTool callback is used)
[--continue]
[--resume SESSION_ID]
[--allowedTools tool1,tool2]
[--disallowedTools tool1,tool2]
[--debug]
[--debug-file PATH]
```

## Permission Response Structure

```typescript
// canUseTool callback receives:
{
  signal: AbortSignal,
  suggestions: PermissionUpdate[],
  blockedPath: string | undefined,
  decisionReason: string | undefined,
  title: string | undefined,
  displayName: string | undefined,
  description: string | undefined,
  toolUseID: string,
  agentID: string | undefined,
}

// canUseTool callback returns:
{
  behavior: 'allow' | 'deny',
  toolUseID: string,
  updatedPermissions?: PermissionUpdate[],
  message?: string,  // for deny
}
```

## Worktree Implementation (exact)

```typescript
// Path: <repoRoot>/.claude/worktrees/<name>
// Branch: worktree-<name>
// Git commands:
git fetch origin <mainBranch>
git worktree prune
git branch -D worktree-<name>  // clean up old branch
git worktree add -b worktree-<name> <path> origin/<mainBranch>
```

## Session JSONL Location

```
~/.claude/projects/<project-dir>/<uuid>.jsonl
```
Where `<project-dir>` is derived from the workspace path.

## CSS Design Tokens (exact values)

```css
--app-claude-orange: #d97757
--app-claude-clay-button-orange: #c6613f
--app-spacing-small: 4px
--app-spacing-medium: 8px
--app-spacing-large: 12px
--app-spacing-xlarge: 16px
--corner-radius-small: 4px
--corner-radius-medium: 6px
--corner-radius-large: 8px
--app-monospace-font-size: var(--vscode-editor-font-size, 12px)
--app-warning-accent: #e5a54b
--app-banner-tint: #4a63af
--app-modal-background: #000000bf
--app-transparent-inner-border: #ffffff1a (dark) / #00000012 (light)
```

## Input Container Focus Ring (exact)

```css
/* Default: orange */
:focus-within {
  --focus-ring-color: var(--app-claude-orange);
  border-color: var(--focus-ring-color);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--focus-ring-color) 12%, transparent),
              0 1px 2px color-mix(in srgb, var(--focus-ring-color), transparent 80%);
}
/* acceptEdits mode: white/foreground */
[data-permission-mode=acceptEdits]:focus-within { --focus-ring-color: var(--app-primary-foreground); }
/* plan mode: blue */
[data-permission-mode=plan]:focus-within { --focus-ring-color: var(--vscode-focusBorder, var(--app-button-background)); }
/* bypass/auto mode: red */
[data-permission-mode=bypassPermissions]:focus-within,
[data-permission-mode=auto]:focus-within { --focus-ring-color: var(--app-error-foreground); }
```

## User Message Bubble (exact)

```css
.userMessage {
  white-space: pre-wrap;
  word-break: break-word;
  border: 1px solid var(--app-input-border);
  border-radius: 6px;  /* corner-radius-medium */
  background-color: var(--app-input-background);
  display: inline-block;
  padding: 4px 6px;
  max-width: 100%;
}
```

## Thinking Block (exact)

```html
<!-- Uses native <details>/<summary> -->
<details class="thinking">
  <summary class="thinkingSummary">
    <svg class="thinkingToggle" />  <!-- rotates 90deg when open -->
    Thinking...
  </summary>
  <div class="thinkingContent">...</div>
</details>
```

```css
.thinkingSummary {
  cursor: pointer;
  color: var(--app-secondary-foreground);
  opacity: 0.8;
  user-select: none;
  list-style: none;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.thinkingSummary::-webkit-details-marker { display: none; }
details[open] .thinkingSummary, .thinkingSummary:hover { opacity: 1; }
.thinkingToggle { width: 16px; height: 16px; transition: transform 0.15s; }
.thinkingToggleOpen { transform: rotate(90deg); }
.thinkingContent { color: var(--app-secondary-foreground); margin-top: 4px; font-weight: 400; }
```

## Scrollbars (exact)

```css
::-webkit-scrollbar { display: none; }
* { scrollbar-width: none; }
```

## Message Spacing (exact)

```css
.message { display: flex; align-items: flex-start; gap: 0; padding: 8px 0; }
.message:first-child { padding-top: 0; }
```
