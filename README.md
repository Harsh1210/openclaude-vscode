# OpenClaude VS Code

**AI coding assistant for VS Code powered by any LLM** — OpenAI GPT-4o, Google Gemini, DeepSeek, Ollama, Codex, AWS Bedrock, and 200+ models via OpenAI-compatible APIs.

OpenClaude wraps the [OpenClaude CLI](https://gitlawb.com/node/repos/z6MkqDnb/openclaude) in a full-featured VS Code extension with a chat interface, diff viewer, @-mentions, slash commands, session management, and more.

---

## Features

### Chat Interface
- Streaming chat panel with markdown rendering and syntax-highlighted code blocks
- Tool call visualization (collapsible blocks showing what the AI is doing)
- Session history — browse, resume, and fork past conversations
- Stop/interrupt generation at any time

### Code Editing
- Native VS Code diff viewer for AI-proposed changes (accept/reject)
- @-mention files, folders, and line ranges for context
- Checkpoint/rewind — snapshot and restore to any point in conversation

### Multi-Provider Support
Switch between LLM providers with `/provider` or the provider badge:

| Provider | Models |
|---|---|
| **OpenAI** | GPT-4o, GPT-4 Turbo, GPT-4o-mini |
| **Codex (ChatGPT)** | gpt-5.4, codexplan, codexspark |
| **Google Gemini** | Gemini 2.0 Flash, Pro |
| **Ollama** | Llama 3, Mistral, CodeLlama (local) |
| **Anthropic** | Claude Sonnet, Opus, Haiku |
| **AWS Bedrock** | Claude via Bedrock |
| **Google Vertex AI** | Claude via Vertex |
| **GitHub Models** | Various via GitHub Marketplace |
| **Custom** | Any OpenAI-compatible endpoint |

### Developer Tools
- 5 permission modes (Default, Plan, Accept Edits, Bypass, Don't Ask)
- MCP (Model Context Protocol) server integration
- Plugin manager for MCP plugins
- Git worktree support for parallel AI sessions
- Status bar with live token count and cost
- Onboarding walkthrough for new users

---

## Installation

### From the VS Code Marketplace

Search for **OpenClaude** in the Extensions panel (`Ctrl+Shift+X`) and click Install.

### From a `.vsix` file

```bash
code --install-extension openclaude-vscode-0.1.0.vsix
```

### Prerequisites

Install the OpenClaude CLI first:

```bash
npm install -g @gitlawb/openclaude
```

---

## Quick Start

### 1. Install the CLI

```bash
npm install -g @gitlawb/openclaude
```

### 2. Configure a provider

**OpenAI (recommended):**
```bash
export CLAUDE_CODE_USE_OPENAI=1
export OPENAI_API_KEY=sk-your-key-here
export OPENAI_MODEL=gpt-4o
```

**Ollama (local, free):**
```bash
ollama serve  # start Ollama first
export CLAUDE_CODE_USE_OPENAI=1
export OPENAI_API_KEY=ollama
export OPENAI_BASE_URL=http://localhost:11434/v1
export OPENAI_MODEL=llama3
```

**Gemini:**
```bash
export CLAUDE_CODE_USE_GEMINI=1
export GOOGLE_API_KEY=AIza-your-key
export GEMINI_MODEL=gemini-2.0-flash
```

**Codex (ChatGPT):**
```bash
export CLAUDE_CODE_USE_OPENAI=1
export OPENAI_API_KEY=sk-your-key
export OPENAI_BASE_URL=https://api.codex.openai.com/v1
export OPENAI_MODEL=gpt-5.4
```

Or use the `/provider` command in the chat to set up providers interactively.

### 3. Open OpenClaude

- Press `Cmd+Escape` (Mac) / `Ctrl+Escape` (Windows/Linux)
- Or click the OpenClaude icon in the sidebar
- Or run `OpenClaude: Open in New Tab` from the Command Palette

### 4. Start coding

Type a message and press Enter. Use `@` to mention files, `/` for slash commands.

---

## Keyboard Shortcuts

| Action | Mac | Windows/Linux |
|---|---|---|
| Open / Focus | `Cmd+Escape` | `Ctrl+Escape` |
| Open in new tab | `Cmd+Shift+Escape` | `Ctrl+Shift+Escape` |
| Insert @-mention | `Alt+K` | `Alt+K` |
| New conversation | `Cmd+N` | `Ctrl+N` (opt-in) |

---

## Slash Commands

Type `/` in the chat input to see all available commands. Key commands include:

| Command | Description |
|---|---|
| `/provider` | Set up and switch LLM providers |
| `/model` | Switch models |
| `/compact` | Compact conversation context |
| `/resume` | Browse and resume past sessions |
| `/diff` | Show git diff |
| `/commit` | Create a git commit |
| `/review` | Review code or PR |
| `/mcp` | Manage MCP servers |
| `/plugins` | Manage plugins |
| `/help` | Show all commands |

---

## Settings

| Setting | Type | Default | Description |
|---|---|---|---|
| `openclaudeCode.selectedModel` | string | `"default"` | AI model to use |
| `openclaudeCode.initialPermissionMode` | enum | `"default"` | Starting permission mode |
| `openclaudeCode.useCtrlEnterToSend` | boolean | `false` | Require Ctrl+Enter to send |
| `openclaudeCode.preferredLocation` | enum | `"panel"` | Default panel location |
| `openclaudeCode.autosave` | boolean | `true` | Auto-save before AI reads/writes |
| `openclaudeCode.respectGitIgnore` | boolean | `true` | Honor .gitignore in searches |
| `openclaudeCode.useTerminal` | boolean | `false` | Launch in terminal mode |
| `openclaudeCode.environmentVariables` | array | `[]` | Extra env vars for the AI process |
| `openclaudeCode.hideOnboarding` | boolean | `false` | Hide the onboarding checklist |
| `openclaudeCode.enableNewConversationShortcut` | boolean | `false` | Enable Cmd/Ctrl+N |

---

## Contributing

```bash
git clone https://github.com/Harsh1210/openclaude-vscode
cd openclaude-vscode
npm install
cd webview && npm install && cd ..
npm run build
```

Development (watch mode):
```bash
npm run watch
# Press F5 in VS Code to launch Extension Development Host
```

Package:
```bash
npx @vscode/vsce package --no-dependencies --allow-missing-repository
```

---

## Architecture

```
Webview (React + Tailwind)
  |  postMessage
Extension Host (TypeScript)
  |  stdin/stdout NDJSON
OpenClaude CLI (child process)
  |  OpenAI Chat Completions API
Any LLM Provider
```

The extension is a thin UI wrapper. All intelligence (tools, providers, slash commands, MCP, plugins) lives in the CLI.

---

## License

MIT
