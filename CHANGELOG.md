# Changelog

All notable changes to OpenClaude VS Code are documented here.

## [0.1.0] — 2026-04-02

### Added

**Core infrastructure (Stories 1–3)**
- Project scaffolding: TypeScript + esbuild + Vitest setup
- Process manager with NDJSON transport for streaming AI output
- Protocol update handler for Claude CLI message format

**Chat UI (Stories 4–5)**
- Streaming chat panel with React + Tailwind webview
- Markdown rendering, code blocks, and tool-use visualization
- `@`-mention picker for files, folders, and symbols
- Toolbar with model selector and action buttons

**Diff viewer (Story 6)**
- Side-by-side diff for AI-proposed file changes
- Accept / Reject buttons in the editor title bar
- `openclaude.viewingProposedDiff` context key

**Permissions (Story 7)**
- Permission rule engine with `default`, `acceptEdits`, `plan`, and `bypassPermissions` modes
- Per-action prompts with remember-choice support

**Session management (Story 8)**
- Session tracker persisting conversation history to disk
- Sessions list webview with resume and fork actions
- `/resume` slash command

**Status bar & commands (Story 9)**
- Status bar item showing model name and token count
- Command palette entries for all major actions
- Keyboard shortcuts for focus, blur, open, and new conversation

**Checkpoint / rewind (Story 10)**
- Snapshot and restore conversation state
- Checkpoint manager with diff-based storage

**Provider auth (Story 11)**
- Auth manager supporting Anthropic, OpenAI, Ollama, Gemini, and custom endpoints
- Secure credential storage via VS Code `SecretStorage`
- Login / logout commands

**MCP IDE server (Story 12)**
- Model Context Protocol server exposing VS Code workspace context
- Tools: `read_file`, `list_directory`, `get_diagnostics`, `run_terminal_command`

**Plugin manager (Story 13)**
- Install, enable, disable, and remove MCP plugins from the UI
- Plugin bridge for inter-process communication

**Git worktree support (Story 14)**
- Create and switch git worktrees from the command palette
- Isolated AI sessions per worktree

**Onboarding & URI handler (Story 15)**
- Four-step walkthrough on first launch
- `vscode://openclaude/...` URI handler for deep links

**Content block renderers (Story 16)**
- Rich rendering for text, code, tool-use, tool-result, and thinking blocks
- Collapsible tool-use sections with status indicators

**Teleport & elicitation (Story 17)**
- Teleport command to jump to AI-referenced code locations
- Elicitation UI for structured AI-requested user input

**Settings, fast mode & prompt suggestions (Story 18)**
- Settings sync between VS Code config and Claude settings files
- Fast mode toggle for cached system prompts
- Prompt suggestion chips in the input area

**Plan review & inline comments (Story 19)**
- Plan mode with inline comment annotations
- Comment thread UI in the webview

**Polish, testing & packaging (Story 20)**
- Comprehensive unit test suite (21 test files)
- CI workflow (GitHub Actions)
- Publish workflow with vsce and GitHub Releases
- Final README, CHANGELOG, and `.vscodeignore` cleanup
