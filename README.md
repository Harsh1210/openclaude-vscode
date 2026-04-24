<div align="center">

<img src="resources/openclaude-logo.png" alt="OpenClaude VS Code" width="128" height="128">

# OpenClaude VS Code

**The open AI coding assistant for VS Code — powered by any LLM you choose.**

OpenAI · Anthropic · Google Gemini · DeepSeek · Ollama · AWS Bedrock · Vertex AI · GitHub Models · 200+ OpenAI-compatible endpoints.

[![VS Code Marketplace Version](https://img.shields.io/visual-studio-marketplace/v/HarshAgarwal1012.openclaude-vscode?label=marketplace&color=007ACC)](https://marketplace.visualstudio.com/items?itemName=HarshAgarwal1012.openclaude-vscode)
[![Installs](https://img.shields.io/visual-studio-marketplace/i/HarshAgarwal1012.openclaude-vscode)](https://marketplace.visualstudio.com/items?itemName=HarshAgarwal1012.openclaude-vscode)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Claude Code compatible](https://img.shields.io/badge/Claude%20Code-compatible-8a63d2.svg)](#multi-provider-support)

</div>

---

## Why OpenClaude?

Modern AI coding assistants are powerful — but they lock you into one provider, one billing account, one pricing tier. OpenClaude flips the model: **one polished VS Code UI, any LLM backend you want**.

- Already paying for OpenAI GPT-4o? Use it.
- Prefer Claude Sonnet via Anthropic's direct API? Use it.
- Running Ollama or LM Studio locally for privacy? Use it.
- On an enterprise plan with AWS Bedrock or Vertex AI? Use it.
- Hitting rate limits? Switch providers mid-session with `/provider`.

OpenClaude is a full-featured **VS Code extension** that wraps the open-source [OpenClaude CLI](https://www.npmjs.com/package/@gitlawb/openclaude). The CLI is where all the intelligence lives — tool use, provider routing, MCP, slash commands. The extension gives you a first-class editor experience on top: streaming chat panel, native diff viewer, @-mentions, session history, checkpoints, and more.

---

## Table of Contents

- [Features](#features)
- [Install](#install)
- [Quick Start](#quick-start)
- [Multi-Provider Support](#multi-provider-support)
- [Keyboard Shortcuts](#keyboard-shortcuts)
- [Slash Commands](#slash-commands)
- [Settings](#settings)
- [Architecture](#architecture)
- [Contributing](#contributing)
- [License](#license)

---

## Features

### Chat & Conversation
- **Streaming chat panel** with markdown rendering and syntax-highlighted code
- **Tool-call visualization** — collapsible blocks show what the AI is reading, editing, and running
- **Session history** — browse, resume, or fork any past conversation
- **Checkpoint / rewind** — snapshot the workspace and restore to any point
- **Stop / interrupt** generation at any time; no half-finished edits

### Native VS Code Integration
- **Diff viewer** — AI-proposed changes open in VS Code's built-in diff editor with Accept / Reject buttons in the editor title bar
- **@-mentions** — reference files, folders, symbols, and line ranges for precise context
- **Status bar** with live token count and cost
- **Git worktree support** — run parallel AI sessions on the same repo without conflicts
- **Onboarding walkthrough** for first-time users

### Multi-Provider Support
Switch between LLM providers on the fly via `/provider`, the provider badge, or env vars:

| Provider | Models | Setup |
|---|---|---|
| **OpenAI** | GPT-4o, GPT-4 Turbo, GPT-4o-mini | `OPENAI_API_KEY` |
| **Anthropic** | Claude Opus, Sonnet, Haiku | Claude Code OAuth or `ANTHROPIC_API_KEY` |
| **Google Gemini** | Gemini 2.0 Flash, Pro | `GOOGLE_API_KEY` |
| **Ollama** | Llama 3, Mistral, CodeLlama (local, free) | `OPENAI_BASE_URL=http://localhost:11434/v1` |
| **DeepSeek** | DeepSeek V3, R1 | OpenAI-compatible endpoint |
| **AWS Bedrock** | Claude via Bedrock | AWS credentials |
| **Google Vertex AI** | Claude via Vertex | GCP credentials |
| **GitHub Models** | Various via GitHub Marketplace | GitHub PAT |
| **Codex (ChatGPT)** | gpt-5.4, codexplan, codexspark | `OPENAI_BASE_URL=https://api.codex.openai.com/v1` |
| **Custom** | Any OpenAI-compatible endpoint | `OPENAI_BASE_URL` |

### Developer Tools
- **5 permission modes** — Default, Plan, Accept Edits, Bypass, Don't Ask
- **MCP (Model Context Protocol)** server integration — extend the AI with your own tools
- **Plugin manager** — install / update / manage MCP plugins from inside the editor
- **Slash commands** — `/commit`, `/review`, `/diff`, `/resume`, `/compact`, `/mcp`, and more
- **Environment variable injection** per workspace
- **Respects `.gitignore`** in file searches by default

---

## Install

### From the VS Code Marketplace (recommended)

Search for **OpenClaude** in the Extensions panel (`Ctrl+Shift+X` / `Cmd+Shift+X`) and click **Install**, or:

```bash
code --install-extension HarshAgarwal1012.openclaude-vscode
```

### From a `.vsix` file (latest dev build)

Download the latest `.vsix` from [Releases](https://github.com/Harsh1210/openclaude-vscode/releases), then:

```bash
code --install-extension openclaude-vscode-0.2.5.vsix
```

### Prerequisites

OpenClaude requires the underlying CLI:

```bash
npm install -g @gitlawb/openclaude
```

(The extension is a thin UI wrapper — all AI intelligence lives in the CLI.)

---

## Quick Start

### 1. Install the CLI

```bash
npm install -g @gitlawb/openclaude
```

### 2. Configure a provider

**OpenAI (simplest):**
```bash
export CLAUDE_CODE_USE_OPENAI=1
export OPENAI_API_KEY=sk-your-key-here
export OPENAI_MODEL=gpt-4o
```

**Anthropic (native Claude):**
```bash
export ANTHROPIC_API_KEY=sk-ant-your-key
# Claude Code OAuth also works if you're already signed in
```

**Google Gemini:**
```bash
export CLAUDE_CODE_USE_GEMINI=1
export GOOGLE_API_KEY=AIza-your-key
export GEMINI_MODEL=gemini-2.0-flash
```

**Ollama (local, free, private):**
```bash
ollama serve  # start Ollama first
export CLAUDE_CODE_USE_OPENAI=1
export OPENAI_API_KEY=ollama
export OPENAI_BASE_URL=http://localhost:11434/v1
export OPENAI_MODEL=llama3
```

**AWS Bedrock:**
```bash
export CLAUDE_CODE_USE_BEDROCK=1
export AWS_REGION=us-east-1
# Standard AWS credentials chain (env / ~/.aws / IAM role)
```

**Any OpenAI-compatible endpoint (DeepSeek, Together, Fireworks, OpenRouter, …):**
```bash
export CLAUDE_CODE_USE_OPENAI=1
export OPENAI_API_KEY=sk-your-key
export OPENAI_BASE_URL=https://api.deepseek.com/v1
export OPENAI_MODEL=deepseek-chat
```

Or just open OpenClaude and use `/provider` to set up providers interactively.

### 3. Open OpenClaude

- Press `Cmd+Escape` (macOS) / `Ctrl+Escape` (Windows/Linux), **or**
- Click the OpenClaude icon in the Activity Bar, **or**
- Run `OpenClaude: Open in New Tab` from the Command Palette

### 4. Start coding

Type your prompt. Use `@` to mention files, `/` for slash commands. The AI edits stream into a VS Code diff view — accept, reject, or let it keep going.

---

## Keyboard Shortcuts

| Action | macOS | Windows / Linux |
|---|---|---|
| Open / Focus OpenClaude | `Cmd+Escape` | `Ctrl+Escape` |
| Open in new tab | `Cmd+Shift+Escape` | `Ctrl+Shift+Escape` |
| Insert @-mention | `Alt+K` | `Alt+K` |
| New conversation | `Cmd+N` | `Ctrl+N` (opt-in, see settings) |

---

## Slash Commands

Type `/` in the chat input to browse all available commands. Highlights:

| Command | Description |
|---|---|
| `/provider` | Set up and switch LLM providers |
| `/model` | Switch between models for the current provider |
| `/compact` | Compact conversation context to save tokens |
| `/resume` | Browse and resume past sessions |
| `/diff` | Show current git diff in the chat |
| `/commit` | Ask the AI to create a git commit |
| `/review` | Review code, a diff, or a PR |
| `/mcp` | Manage MCP servers |
| `/plugins` | Manage OpenClaude plugins |
| `/help` | Show all commands |

---

## Settings

All settings live under `openclaudeCode.*` in VS Code settings:

| Setting | Type | Default | Description |
|---|---|---|---|
| `openclaudeCode.selectedModel` | string | `"default"` | AI model to use |
| `openclaudeCode.initialPermissionMode` | enum | `"default"` | Starting permission mode |
| `openclaudeCode.useCtrlEnterToSend` | boolean | `false` | Require Ctrl+Enter to send (vs plain Enter) |
| `openclaudeCode.preferredLocation` | enum | `"panel"` | Default panel location |
| `openclaudeCode.autosave` | boolean | `true` | Auto-save before AI reads or writes |
| `openclaudeCode.respectGitIgnore` | boolean | `true` | Honor `.gitignore` in file searches |
| `openclaudeCode.useTerminal` | boolean | `false` | Launch in terminal mode instead of webview |
| `openclaudeCode.environmentVariables` | array | `[]` | Extra env vars passed to the AI process |
| `openclaudeCode.hideOnboarding` | boolean | `false` | Hide the onboarding checklist |
| `openclaudeCode.enableNewConversationShortcut` | boolean | `false` | Enable Cmd/Ctrl+N to start a new conversation |

---

## Architecture

```
┌─────────────────────────────────┐
│  Webview (React + Tailwind)     │  ← UI: chat panel, diff, mentions
└───────────────┬─────────────────┘
                │ postMessage
┌───────────────▼─────────────────┐
│  Extension Host (TypeScript)    │  ← VS Code integration, permissions, sessions
└───────────────┬─────────────────┘
                │ stdin / stdout NDJSON
┌───────────────▼─────────────────┐
│  OpenClaude CLI (child process) │  ← Intelligence: tools, providers, MCP, plugins
└───────────────┬─────────────────┘
                │ OpenAI Chat Completions API
┌───────────────▼─────────────────┐
│  Any LLM provider               │  ← OpenAI / Anthropic / Gemini / Ollama / …
└─────────────────────────────────┘
```

The extension is deliberately thin. All provider logic, tool execution, MCP server plumbing, and slash-command handling happens inside the CLI — so upgrading the brain means `npm install -g @gitlawb/openclaude@latest` with no VS Code reinstall needed.

---

## Contributing

```bash
git clone https://github.com/Harsh1210/openclaude-vscode
cd openclaude-vscode
npm install
cd webview && npm install && cd ..
npm run build
```

**Development (watch mode):**
```bash
npm run watch
# Press F5 in VS Code to launch an Extension Development Host
```

**Run tests:**
```bash
npm test
```

**Package a `.vsix`:**
```bash
npx @vscode/vsce package --no-dependencies --allow-missing-repository
```

Issues and PRs welcome — see the [issue tracker](https://github.com/Harsh1210/openclaude-vscode/issues).

---

## License

MIT — see [LICENSE](LICENSE).

---

<div align="center">

**Keywords:** vscode extension · ai coding assistant · claude code alternative · openai gpt-4o · claude sonnet · gemini · ollama · aws bedrock · local llm · mcp · model context protocol · diff viewer · chat panel · typescript

</div>
