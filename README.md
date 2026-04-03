# OpenClaude VS Code

AI coding assistant for VS Code powered by any LLM — Anthropic Claude, OpenAI, Ollama, Gemini, or a custom endpoint.

## Features

- **Chat UI** — Streaming chat panel with markdown rendering, code blocks, and tool-use visualization
- **@-mentions** — Reference files, symbols, and folders directly in your prompt
- **Diff viewer** — Review, accept, or reject AI-proposed file changes with a side-by-side diff
- **Permissions system** — Fine-grained control over what the AI can read, write, or execute
- **Session management** — Browse, resume, and fork past conversations
- **MCP IDE server** — Exposes VS Code context to the AI via the Model Context Protocol
- **Plugin manager** — Install and manage MCP plugins from the UI
- **Git worktree support** — Run parallel AI sessions in isolated worktrees
- **Checkpoint / rewind** — Snapshot and restore conversation state
- **Onboarding walkthrough** — Step-by-step guide on first launch
- **Status bar** — Live token count, model name, and quick-action buttons
- **Fast mode & prompt suggestions** — Reduce latency with cached system prompts

## Installation

### From the Marketplace

Search for **OpenClaude** in the VS Code Extensions panel (`Ctrl+Shift+X`) and click Install.

### From a `.vsix` file

```bash
code --install-extension openclaude-vscode-0.1.0.vsix
```

## Provider Setup

OpenClaude delegates to the `claude` CLI process. Configure your provider via environment variables or the settings UI.

### Anthropic (default)

```bash
export ANTHROPIC_API_KEY=sk-ant-...
```

### OpenAI

```bash
export OPENAI_API_KEY=sk-...
export ANTHROPIC_BASE_URL=https://api.openai.com/v1
```

### Ollama (local)

```bash
# Start Ollama first
ollama serve

export ANTHROPIC_BASE_URL=http://localhost:11434/v1
export ANTHROPIC_API_KEY=ollama
```

### Gemini

```bash
export GOOGLE_API_KEY=AIza...
```

### Custom endpoint

Set `openclaudeCode.environmentVariables` in your VS Code settings:

```json
{
  "openclaudeCode.environmentVariables": [
    { "name": "ANTHROPIC_BASE_URL", "value": "https://my-proxy.example.com/v1" },
    { "name": "ANTHROPIC_API_KEY", "value": "my-key" }
  ]
}
```

## Usage

### Opening the panel

| Action | Shortcut |
|---|---|
| Open in new tab | `Ctrl+Shift+Escape` / `Cmd+Shift+Escape` |
| Focus / blur input | `Ctrl+Escape` / `Cmd+Escape` |
| Open in sidebar | Command Palette → `OpenClaude: Open in Side Bar` |

### Chat

Type your message and press `Enter` to send. Use `Ctrl/Cmd+Enter` if you enable `openclaudeCode.useCtrlEnterToSend`.

### @-mentions

Type `@` in the input to open the mention picker. You can reference:

- `@file` — attach a file's contents
- `@folder` — attach all files in a directory
- `@symbol` — attach a specific code symbol

### Diff viewer

When the AI proposes a file change, a diff opens automatically. Use the toolbar buttons (✓ / ✗) or the command palette to **Accept** or **Reject** the change.

### Permissions

Control what the AI is allowed to do via `openclaudeCode.initialPermissionMode`:

| Mode | Description |
|---|---|
| `default` | Prompt for each sensitive action |
| `acceptEdits` | Auto-accept file edits, prompt for shell commands |
| `plan` | Read-only planning mode |
| `bypassPermissions` | Skip all prompts (sandboxes only) |

### Sessions

Click **Past Conversations** or type `/resume` to browse previous sessions. Sessions are stored locally and can be resumed at any time.

## Configuration Reference

| Setting | Type | Default | Description |
|---|---|---|---|
| `openclaudeCode.selectedModel` | string | `"default"` | AI model to use |
| `openclaudeCode.initialPermissionMode` | enum | `"default"` | Starting permission mode |
| `openclaudeCode.useCtrlEnterToSend` | boolean | `false` | Require Ctrl+Enter to send |
| `openclaudeCode.preferredLocation` | enum | `"panel"` | Default panel location (`sidebar` or `panel`) |
| `openclaudeCode.autosave` | boolean | `true` | Auto-save files before AI reads/writes |
| `openclaudeCode.respectGitIgnore` | boolean | `true` | Honour `.gitignore` in file searches |
| `openclaudeCode.allowDangerouslySkipPermissions` | boolean | — | Bypass all permission prompts |
| `openclaudeCode.useTerminal` | boolean | `false` | Launch in terminal instead of native UI |
| `openclaudeCode.environmentVariables` | array | `[]` | Extra env vars passed to the AI process |
| `openclaudeCode.disableLoginPrompt` | boolean | `false` | Suppress auth prompts (external auth) |
| `openclaudeCode.hideOnboarding` | boolean | `false` | Hide the onboarding checklist |
| `openclaudeCode.enableNewConversationShortcut` | boolean | `false` | Enable `Cmd/Ctrl+N` for new conversation |

## Contributing

```bash
git clone https://github.com/Harsh1210/openclaude-vscode
cd openclaude-vscode
npm install
npm run build
```

Run tests:

```bash
npm test
```

Run in development (watch mode):

```bash
npm run watch
# Press F5 in VS Code to launch the Extension Development Host
```

Lint and format:

```bash
npm run lint
npm run format
```

## License

MIT
