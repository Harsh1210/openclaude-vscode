# Story 15: Onboarding, Walkthrough & URI Handler — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the onboarding experience with a 4-step walkthrough in package.json, an in-webview OnboardingChecklist on first open, a URI handler for deep links (`vscode://harsh1210.openclaude-vscode/open?prompt=...&session=...`), and JSON schema validation for `.claude/settings.json`.

**Architecture:** The walkthrough is declarative (package.json `contributes.walkthroughs`). The OnboardingChecklist is a React component shown on first open when `openclaudeCode.hideOnboarding` is false. The URI handler is a VS Code `UriHandler` registered during activation that parses query params and routes to session open/prompt flows. The settings schema is a JSON file contributed via `contributes.jsonValidation`.

**Tech Stack:** TypeScript 5.x, VS Code Extension API, React 18, Tailwind CSS 3, Vitest

**Spec:** [2026-04-02-openclaude-vscode-extension-design.md](../specs/2026-04-02-openclaude-vscode-extension-design.md) — Story 15, Sections 4.6, 4.7, 5.2

**Depends on:** Story 3 (Webview shell, postMessage bridge)

---

## File Structure

| File | Responsibility |
|---|---|
| `resources/walkthrough/step1.md` | Walkthrough step 1: "Your AI coding partner" |
| `resources/walkthrough/step2.md` | Walkthrough step 2: "Open OpenClaude" |
| `resources/walkthrough/step3.md` | Walkthrough step 3: "Chat with OpenClaude" |
| `resources/walkthrough/step4.md` | Walkthrough step 4: "Past conversations" |
| `webview/src/components/onboarding/OnboardingChecklist.tsx` | In-webview first-run checklist |
| `src/uri/uriHandler.ts` | URI handler: parse and route deep links |
| `test/unit/uriHandler.test.ts` | Unit tests for URI parsing |
| `openclaude-settings.schema.json` | JSON schema for .claude/settings.json validation |
| `src/extension.ts` | Register URI handler, manage onboarding visibility |
| `package.json` | Walkthrough contribution, jsonValidation contribution |

---

## Task 1: Walkthrough Markdown Files

**Files:**
- Create/Overwrite: `resources/walkthrough/step1.md`
- Create/Overwrite: `resources/walkthrough/step2.md`
- Create/Overwrite: `resources/walkthrough/step3.md`
- Create/Overwrite: `resources/walkthrough/step4.md`

- [ ] **Step 1: Create the four walkthrough markdown files**

`resources/walkthrough/step1.md`:
```markdown
**OpenClaude helps you write, edit, and understand code right in VS Code.**

OpenClaude can read your files, make edits, run terminal commands, and help you navigate complex codebases using any LLM — GPT-4o, Gemini, DeepSeek, Ollama, and 200+ models.

Prefer a terminal experience? Run **OpenClaude: Open in Terminal** from the Command Palette, or enable it permanently in Settings.
```

`resources/walkthrough/step2.md`:
```markdown
**Click the OpenClaude icon in the sidebar or editor toolbar.**

You can also use the keyboard shortcut **Ctrl+Escape** (Windows/Linux) or **Cmd+Escape** (Mac) to quickly open or focus OpenClaude.

Other ways to open:
- **Command Palette** → "OpenClaude: Open in New Tab"
- **Cmd+Shift+Escape** / **Ctrl+Shift+Escape** → Open in new tab
- **Activity Bar** → Click the OpenClaude icon
```

`resources/walkthrough/step3.md`:
```markdown
**Ask questions, request changes, or get help understanding your code.**

Type your message in the input field and press Enter. OpenClaude can help you:

- Explain what code does
- Fix bugs and errors
- Write new features
- Refactor existing code
- Run terminal commands

Use **@** to mention specific files or folders for context. You can also highlight text in your editor and ask about your selection.

Try a **slash command** like `/help` to see all available commands, or `/model` to switch your AI provider.
```

`resources/walkthrough/step4.md`:
```markdown
**Access your chat history and start new conversations anytime.**

Your conversations are saved automatically. Click the **Past Conversations** button at the top or type **/resume** to browse past sessions and pick up where you left off.

To start a fresh conversation, click the **New Chat** button. You can also enable the **Ctrl+N** / **Cmd+N** shortcut in settings (`openclaudeCode.enableNewConversationShortcut`).

**Checkpoints:** Hover over any assistant message to see rewind/fork options. You can branch conversations or revert file changes to any point.
```

- [ ] **Step 2: Verify walkthrough contribution exists in package.json**

The walkthrough should already be in `package.json` from Story 1. Verify it has the correct structure:

```json
{
  "contributes": {
    "walkthroughs": [
      {
        "id": "openclaude-walkthrough",
        "title": "Get Started with OpenClaude",
        "description": "Learn to use OpenClaude, your AI coding assistant powered by any LLM.",
        "steps": [
          {
            "id": "openclaude-step1",
            "title": "Your AI Coding Partner",
            "description": "$(openclaude-logo) OpenClaude can read, edit, and understand your code using any LLM.",
            "media": {
              "markdown": "resources/walkthrough/step1.md"
            }
          },
          {
            "id": "openclaude-step2",
            "title": "Open OpenClaude",
            "description": "Click the sidebar icon or use Cmd+Escape to open.",
            "media": {
              "markdown": "resources/walkthrough/step2.md"
            },
            "completionEvents": [
              "onCommand:openclaude.sidebar.open"
            ]
          },
          {
            "id": "openclaude-step3",
            "title": "Chat with OpenClaude",
            "description": "Ask questions, request changes, use @-mentions and /commands.",
            "media": {
              "markdown": "resources/walkthrough/step3.md"
            }
          },
          {
            "id": "openclaude-step4",
            "title": "Past Conversations",
            "description": "Your sessions are saved. Resume anytime.",
            "media": {
              "markdown": "resources/walkthrough/step4.md"
            },
            "completionEvents": [
              "onCommand:openclaude.newConversation"
            ]
          }
        ]
      }
    ]
  }
}
```

If not present, add it to `package.json` under `contributes`.

- [ ] **Step 3: Commit**

```bash
git add resources/walkthrough/step1.md resources/walkthrough/step2.md resources/walkthrough/step3.md resources/walkthrough/step4.md
git commit -m "feat(onboarding): finalize walkthrough step markdown files"
```

---

## Task 2: OnboardingChecklist Component

**Files:**
- Create: `webview/src/components/onboarding/OnboardingChecklist.tsx`

- [ ] **Step 1: Implement the OnboardingChecklist component**

```tsx
// webview/src/components/onboarding/OnboardingChecklist.tsx
import React, { useState, useEffect } from 'react';
import { vscode } from '../../vscode';

interface OnboardingChecklistProps {
  /** Whether the checklist should be shown (controlled by host based on hideOnboarding setting) */
  visible: boolean;
}

interface ChecklistItem {
  id: string;
  title: string;
  description: string;
  action: string;
  actionLabel: string;
  completed: boolean;
}

const INITIAL_CHECKLIST: ChecklistItem[] = [
  {
    id: 'provider',
    title: 'Choose your AI provider',
    description: 'Select from OpenAI, Gemini, Ollama, or 200+ models.',
    action: 'select_provider',
    actionLabel: 'Select Provider',
    completed: false,
  },
  {
    id: 'first-message',
    title: 'Send your first message',
    description: 'Type a question or request in the input field below.',
    action: 'focus_input',
    actionLabel: 'Focus Input',
    completed: false,
  },
  {
    id: 'mention',
    title: 'Reference a file with @',
    description: 'Type @ in the input to mention a file for context.',
    action: 'focus_input',
    actionLabel: 'Try @-Mention',
    completed: false,
  },
  {
    id: 'command',
    title: 'Try a slash command',
    description: 'Type / to see all available commands like /help, /model, /compact.',
    action: 'focus_input',
    actionLabel: 'Try /Command',
    completed: false,
  },
];

export function OnboardingChecklist({ visible }: OnboardingChecklistProps) {
  const [items, setItems] = useState<ChecklistItem[]>(() => {
    // Try to restore from webview state
    const saved = vscode.getState()?.onboardingChecklist as ChecklistItem[] | undefined;
    return saved || INITIAL_CHECKLIST;
  });
  const [isDismissed, setIsDismissed] = useState(false);

  // Persist checklist state
  useEffect(() => {
    const currentState = vscode.getState() || {};
    vscode.setState({ ...currentState, onboardingChecklist: items });
  }, [items]);

  // Listen for completion events from host
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const msg = event.data;
      if (msg.type === 'onboarding_item_completed') {
        setItems((prev) =>
          prev.map((item) =>
            item.id === msg.itemId ? { ...item, completed: true } : item,
          ),
        );
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  if (!visible || isDismissed) return null;

  const completedCount = items.filter((i) => i.completed).length;
  const allCompleted = completedCount === items.length;

  const handleAction = (item: ChecklistItem) => {
    vscode.postMessage({ type: 'onboarding_action', action: item.action, itemId: item.id });
  };

  const handleDismiss = () => {
    setIsDismissed(true);
    vscode.postMessage({ type: 'onboarding_dismiss' });
  };

  const handleOpenWalkthrough = () => {
    vscode.postMessage({ type: 'onboarding_open_walkthrough' });
  };

  return (
    <div className="mx-3 mt-3 mb-2 rounded-lg border border-[var(--vscode-panel-border)] bg-[var(--vscode-textBlockQuote-background)] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--vscode-panel-border)]">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-[var(--vscode-foreground)]">
            {allCompleted ? 'Setup Complete!' : 'Get Started'}
          </span>
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--vscode-badge-background)] text-[var(--vscode-badge-foreground)]">
            {completedCount}/{items.length}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={handleOpenWalkthrough}
            className="text-[10px] text-[var(--vscode-textLink-foreground)] hover:underline"
          >
            Full Walkthrough
          </button>
          <button
            onClick={handleDismiss}
            className="text-[var(--vscode-foreground)] hover:text-[var(--vscode-errorForeground)] text-sm leading-none px-1"
            title="Dismiss (can re-enable in settings)"
          >
            &times;
          </button>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-0.5 bg-[var(--vscode-panel-border)]">
        <div
          className="h-full bg-[var(--vscode-progressBar-background)] transition-all duration-300"
          style={{ width: `${(completedCount / items.length) * 100}%` }}
        />
      </div>

      {/* Checklist items */}
      <ul className="divide-y divide-[var(--vscode-panel-border)]">
        {items.map((item) => (
          <li
            key={item.id}
            className={`flex items-start gap-2.5 px-3 py-2 ${
              item.completed ? 'opacity-60' : ''
            }`}
          >
            {/* Checkbox */}
            <span className={`mt-0.5 flex-shrink-0 w-4 h-4 rounded border flex items-center justify-center text-[10px] ${
              item.completed
                ? 'bg-green-400/20 border-green-400/50 text-green-400'
                : 'border-[var(--vscode-panel-border)]'
            }`}>
              {item.completed && '\u2713'}
            </span>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium text-[var(--vscode-foreground)]">
                {item.title}
              </div>
              <div className="text-[11px] text-[var(--vscode-descriptionForeground)] mt-0.5">
                {item.description}
              </div>
            </div>

            {/* Action button */}
            {!item.completed && (
              <button
                onClick={() => handleAction(item)}
                className="flex-shrink-0 text-[10px] px-2 py-0.5 rounded bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] hover:bg-[var(--vscode-button-hoverBackground)]"
              >
                {item.actionLabel}
              </button>
            )}
          </li>
        ))}
      </ul>

      {/* All done message */}
      {allCompleted && (
        <div className="px-3 py-2 border-t border-[var(--vscode-panel-border)] text-center">
          <p className="text-[11px] text-[var(--vscode-descriptionForeground)]">
            You&apos;re all set! This checklist will dismiss automatically, or{' '}
            <button onClick={handleDismiss} className="text-[var(--vscode-textLink-foreground)] hover:underline">
              hide it now
            </button>.
          </p>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Build webview to verify**

Run: `cd /Users/harshagarwal/Documents/workspace/openclaude-vscode && npm run build:webview`

Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add webview/src/components/onboarding/OnboardingChecklist.tsx
git commit -m "feat(onboarding): add in-webview OnboardingChecklist component"
```

---

## Task 3: URI Handler

**Files:**
- Create: `src/uri/uriHandler.ts`
- Create: `test/unit/uriHandler.test.ts`

- [ ] **Step 1: Write unit tests for URI parsing**

```typescript
// test/unit/uriHandler.test.ts
import { describe, it, expect } from 'vitest';

describe('URI Handler', () => {
  describe('parseOpenClaudeUri', () => {
    it('should parse prompt parameter', async () => {
      const { parseOpenClaudeUri } = await import('../../src/uri/uriHandler');

      const result = parseOpenClaudeUri('/open?prompt=fix%20the%20bug');

      expect(result.action).toBe('open');
      expect(result.prompt).toBe('fix the bug');
      expect(result.session).toBeUndefined();
    });

    it('should parse session parameter', async () => {
      const { parseOpenClaudeUri } = await import('../../src/uri/uriHandler');

      const result = parseOpenClaudeUri('/open?session=abc-123');

      expect(result.action).toBe('open');
      expect(result.session).toBe('abc-123');
    });

    it('should parse both prompt and session', async () => {
      const { parseOpenClaudeUri } = await import('../../src/uri/uriHandler');

      const result = parseOpenClaudeUri('/open?prompt=hello&session=xyz');

      expect(result.prompt).toBe('hello');
      expect(result.session).toBe('xyz');
    });

    it('should handle unknown paths gracefully', async () => {
      const { parseOpenClaudeUri } = await import('../../src/uri/uriHandler');

      const result = parseOpenClaudeUri('/unknown?foo=bar');

      expect(result.action).toBe('unknown');
      expect(result.error).toBe('Unknown URI path: /unknown');
    });

    it('should handle empty/missing query parameters', async () => {
      const { parseOpenClaudeUri } = await import('../../src/uri/uriHandler');

      const result = parseOpenClaudeUri('/open');

      expect(result.action).toBe('open');
      expect(result.prompt).toBeUndefined();
      expect(result.session).toBeUndefined();
    });

    it('should decode URI-encoded prompt text', async () => {
      const { parseOpenClaudeUri } = await import('../../src/uri/uriHandler');

      const result = parseOpenClaudeUri('/open?prompt=fix%20bug%20in%20auth.ts%20%26%20add%20tests');

      expect(result.prompt).toBe('fix bug in auth.ts & add tests');
    });
  });
});
```

- [ ] **Step 2: Run tests and confirm failure**

Run: `cd /Users/harshagarwal/Documents/workspace/openclaude-vscode && npx vitest run test/unit/uriHandler.test.ts 2>&1 | head -15`

Expected: Failures (module not found)

- [ ] **Step 3: Implement the URI handler**

```typescript
// src/uri/uriHandler.ts
import * as vscode from 'vscode';

// ── Pure URI parsing (exported for testing) ──────────────────────

export interface ParsedOpenClaudeUri {
  action: 'open' | 'unknown';
  prompt?: string;
  session?: string;
  error?: string;
}

export function parseOpenClaudeUri(pathAndQuery: string): ParsedOpenClaudeUri {
  // Split path from query
  const questionMark = pathAndQuery.indexOf('?');
  const path = questionMark >= 0 ? pathAndQuery.slice(0, questionMark) : pathAndQuery;
  const queryString = questionMark >= 0 ? pathAndQuery.slice(questionMark + 1) : '';

  // Parse query parameters
  const params = new URLSearchParams(queryString);

  if (path === '/open') {
    const result: ParsedOpenClaudeUri = { action: 'open' };

    const prompt = params.get('prompt');
    if (prompt) result.prompt = prompt;

    const session = params.get('session');
    if (session) result.session = session;

    return result;
  }

  return {
    action: 'unknown',
    error: `Unknown URI path: ${path}`,
  };
}

// ── VS Code URI Handler ──────────────────────────────────────────

export class OpenClaudeUriHandler implements vscode.UriHandler {
  private onOpenCallback: ((parsed: ParsedOpenClaudeUri) => void) | null = null;

  /**
   * Register a callback for when a valid URI is received.
   * The callback receives the parsed URI data so the extension
   * can open panels, start sessions, or send prompts.
   */
  onOpen(callback: (parsed: ParsedOpenClaudeUri) => void): void {
    this.onOpenCallback = callback;
  }

  /**
   * Called by VS Code when a URI like
   * vscode://harsh1210.openclaude-vscode/open?prompt=...&session=...
   * is opened.
   */
  handleUri(uri: vscode.Uri): vscode.ProviderResult<void> {
    console.log(`[OpenClaude] URI received: ${uri.toString()}`);

    const pathAndQuery = uri.path + (uri.query ? `?${uri.query}` : '');
    const parsed = parseOpenClaudeUri(pathAndQuery);

    if (parsed.action === 'unknown') {
      vscode.window.showWarningMessage(
        `OpenClaude: ${parsed.error || 'Unrecognized URI'}. Expected: vscode://harsh1210.openclaude-vscode/open?prompt=...`,
      );
      return;
    }

    if (this.onOpenCallback) {
      this.onOpenCallback(parsed);
    } else {
      // Fallback: show info message with what we received
      const parts: string[] = [];
      if (parsed.prompt) parts.push(`Prompt: "${parsed.prompt}"`);
      if (parsed.session) parts.push(`Session: ${parsed.session}`);
      vscode.window.showInformationMessage(
        `OpenClaude URI received. ${parts.join(', ')}`,
      );
    }
  }
}
```

- [ ] **Step 4: Run tests and confirm PASS**

Run: `cd /Users/harshagarwal/Documents/workspace/openclaude-vscode && npx vitest run test/unit/uriHandler.test.ts`

Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add src/uri/uriHandler.ts test/unit/uriHandler.test.ts
git commit -m "feat(uri): add URI handler for deep links with prompt and session params"
```

---

## Task 4: Settings Schema Contribution

**Files:**
- Create: `openclaude-settings.schema.json`
- Modify: `package.json` (jsonValidation contribution)

- [ ] **Step 1: Create the settings JSON schema**

This is a comprehensive schema covering the 70+ CLI settings properties. It provides autocomplete and validation in VS Code for `.claude/settings.json` files.

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "https://openclaude.dev/schemas/settings.json",
  "title": "OpenClaude Settings",
  "description": "Configuration for the OpenClaude CLI. Used in .claude/settings.json, .claude/settings.local.json, and managed settings.",
  "type": "object",
  "properties": {
    "permissions": {
      "type": "object",
      "description": "Permission rules for tool execution",
      "properties": {
        "allow": {
          "type": "array",
          "items": { "type": "string" },
          "description": "Tool patterns to always allow (e.g., 'Bash(git *)', 'Read')"
        },
        "deny": {
          "type": "array",
          "items": { "type": "string" },
          "description": "Tool patterns to always deny"
        },
        "ask": {
          "type": "array",
          "items": { "type": "string" },
          "description": "Tool patterns to always ask about"
        },
        "defaultMode": {
          "type": "string",
          "enum": ["default", "acceptEdits", "plan", "bypassPermissions", "dontAsk"],
          "description": "Default permission mode"
        },
        "disableBypassPermissionsMode": {
          "type": "boolean",
          "description": "Disable the bypassPermissions mode entirely"
        },
        "disableAutoMode": {
          "type": "boolean",
          "description": "Disable auto mode"
        },
        "additionalDirectories": {
          "type": "array",
          "items": { "type": "string" },
          "description": "Additional directories the CLI can access"
        }
      }
    },
    "allowManagedPermissionRulesOnly": {
      "type": "boolean",
      "description": "Only allow permission rules from managed settings"
    },
    "model": {
      "type": "string",
      "description": "Default model to use"
    },
    "availableModels": {
      "type": "array",
      "items": { "type": "string" },
      "description": "List of available models to show in model picker"
    },
    "modelOverrides": {
      "type": "object",
      "additionalProperties": { "type": "string" },
      "description": "Model overrides by context"
    },
    "fastMode": {
      "type": "boolean",
      "description": "Enable fast mode for quicker responses"
    },
    "fastModePerSessionOptIn": {
      "type": "boolean",
      "description": "Require per-session opt-in for fast mode"
    },
    "advisorModel": {
      "type": "string",
      "description": "Model used for advisory/planning tasks"
    },
    "effortLevel": {
      "type": "string",
      "enum": ["low", "medium", "high", "max"],
      "description": "Default effort level"
    },
    "alwaysThinkingEnabled": {
      "type": "boolean",
      "description": "Always enable extended thinking"
    },
    "apiKeyHelper": {
      "type": "string",
      "description": "Command to run to get API key dynamically"
    },
    "hooks": {
      "type": "object",
      "description": "Lifecycle hooks (PreToolUse, PostToolUse, Notification, etc.)",
      "additionalProperties": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "matcher": { "type": "string" },
            "hooks": {
              "type": "array",
              "items": {
                "type": "object",
                "properties": {
                  "type": { "type": "string", "enum": ["command", "http"] },
                  "command": { "type": "string" },
                  "url": { "type": "string" },
                  "timeout": { "type": "number" }
                }
              }
            }
          }
        }
      }
    },
    "disableAllHooks": {
      "type": "boolean",
      "description": "Disable all hooks"
    },
    "allowManagedHooksOnly": {
      "type": "boolean",
      "description": "Only allow hooks from managed settings"
    },
    "allowedHttpHookUrls": {
      "type": "array",
      "items": { "type": "string" },
      "description": "Allowed URLs for HTTP hooks"
    },
    "httpHookAllowedEnvVars": {
      "type": "array",
      "items": { "type": "string" },
      "description": "Env vars allowed in HTTP hook payloads"
    },
    "attribution": {
      "type": "object",
      "description": "Git attribution settings",
      "properties": {
        "commit": { "type": "boolean", "description": "Add co-author to commits" },
        "pr": { "type": "boolean", "description": "Add co-author to PRs" }
      }
    },
    "includeGitInstructions": {
      "type": "boolean",
      "description": "Include git-specific instructions in system prompt"
    },
    "worktree": {
      "type": "object",
      "description": "Worktree configuration",
      "properties": {
        "symlinkDirectories": {
          "type": "array",
          "items": { "type": "string" },
          "description": "Directories to symlink into worktrees"
        },
        "sparsePaths": {
          "type": "array",
          "items": { "type": "string" },
          "description": "Sparse checkout paths for worktrees"
        },
        "mainBranch": {
          "type": "string",
          "description": "Main branch name (default: auto-detect)"
        },
        "baseDir": {
          "type": "string",
          "description": "Base directory for worktrees"
        }
      }
    },
    "enableAllProjectMcpServers": {
      "type": "boolean",
      "description": "Enable all MCP servers defined in project .mcp.json"
    },
    "enabledMcpjsonServers": {
      "type": "array",
      "items": { "type": "string" },
      "description": "Explicitly enabled MCP servers from .mcp.json"
    },
    "disabledMcpjsonServers": {
      "type": "array",
      "items": { "type": "string" },
      "description": "Explicitly disabled MCP servers from .mcp.json"
    },
    "allowedMcpServers": {
      "type": "array",
      "items": { "type": "string" },
      "description": "Allowed MCP server patterns"
    },
    "deniedMcpServers": {
      "type": "array",
      "items": { "type": "string" },
      "description": "Denied MCP server patterns"
    },
    "allowManagedMcpServersOnly": {
      "type": "boolean",
      "description": "Only allow MCP servers from managed settings"
    },
    "enabledPlugins": {
      "type": "object",
      "additionalProperties": { "type": "boolean" },
      "description": "Plugin enable/disable map"
    },
    "extraKnownMarketplaces": {
      "type": "array",
      "items": { "type": "string" },
      "description": "Additional plugin marketplace URLs"
    },
    "strictKnownMarketplaces": {
      "type": "boolean",
      "description": "Only allow plugins from known marketplaces"
    },
    "strictDeniedMarketplaces": {
      "type": "array",
      "items": { "type": "string" },
      "description": "Denied marketplace URLs"
    },
    "strictPluginOnlyCustomization": {
      "type": "boolean",
      "description": "Strict plugin-only customization mode"
    },
    "pluginConfigs": {
      "type": "object",
      "additionalProperties": true,
      "description": "Per-plugin configuration"
    },
    "pluginTrustMessage": {
      "type": "string",
      "description": "Message shown when trusting a new plugin"
    },
    "sandbox": {
      "type": "object",
      "description": "Sandbox configuration for command execution",
      "properties": {
        "enabled": { "type": "boolean" },
        "failIfUnavailable": { "type": "boolean" },
        "autoAllowBashIfSandboxed": { "type": "boolean" },
        "allowUnsandboxedCommands": { "type": "array", "items": { "type": "string" } },
        "network": {
          "type": "object",
          "properties": {
            "allowedHosts": { "type": "array", "items": { "type": "string" } },
            "deniedHosts": { "type": "array", "items": { "type": "string" } }
          }
        },
        "filesystem": {
          "type": "object",
          "properties": {
            "readOnly": { "type": "array", "items": { "type": "string" } },
            "readWrite": { "type": "array", "items": { "type": "string" } },
            "denied": { "type": "array", "items": { "type": "string" } }
          }
        },
        "excludedCommands": { "type": "array", "items": { "type": "string" } }
      }
    },
    "respectGitignore": {
      "type": "boolean",
      "description": "Respect .gitignore when listing files"
    },
    "cleanupPeriodDays": {
      "type": "number",
      "description": "Days to keep old session data"
    },
    "fileSuggestion": {
      "type": "object",
      "properties": {
        "command": { "type": "string", "enum": ["git", "find", "auto"] }
      }
    },
    "claudeMdExcludes": {
      "type": "array",
      "items": { "type": "string" },
      "description": "Glob patterns to exclude from CLAUDE.md search"
    },
    "outputStyle": {
      "type": "string",
      "description": "Output formatting style"
    },
    "language": {
      "type": "string",
      "description": "Response language"
    },
    "statusLine": {
      "type": "string",
      "description": "Custom status line format"
    },
    "promptSuggestionEnabled": {
      "type": "boolean",
      "description": "Enable AI-generated prompt suggestions"
    },
    "showClearContextOnPlanAccept": {
      "type": "boolean",
      "description": "Show clear context option when accepting a plan"
    },
    "showThinkingSummaries": {
      "type": "boolean",
      "description": "Show summaries of thinking blocks"
    },
    "prefersReducedMotion": {
      "type": "boolean",
      "description": "Reduce animations for accessibility"
    },
    "syntaxHighlightingDisabled": {
      "type": "boolean",
      "description": "Disable syntax highlighting"
    },
    "spinnerTipsEnabled": {
      "type": "boolean",
      "description": "Show tips during spinner"
    },
    "spinnerVerbs": {
      "type": "array",
      "items": { "type": "string" },
      "description": "Custom spinner verb phrases"
    },
    "spinnerTipsOverride": {
      "type": "array",
      "items": { "type": "string" },
      "description": "Custom spinner tips"
    },
    "terminalTitleFromRename": {
      "type": "boolean",
      "description": "Update terminal title from session rename"
    },
    "agent": {
      "type": "string",
      "description": "Default agent to use"
    },
    "plansDirectory": {
      "type": "string",
      "description": "Directory for plan files"
    },
    "channelsEnabled": {
      "type": "boolean",
      "description": "Enable channels"
    },
    "allowedChannelPlugins": {
      "type": "array",
      "items": { "type": "string" },
      "description": "Allowed plugins for channels"
    },
    "autoMemoryEnabled": {
      "type": "boolean",
      "description": "Enable automatic memory"
    },
    "autoMemoryDirectory": {
      "type": "string",
      "description": "Directory for auto-memory files"
    },
    "autoDreamEnabled": {
      "type": "boolean",
      "description": "Enable auto-dream (background processing)"
    },
    "remote": {
      "type": "object",
      "properties": {
        "defaultEnvironmentId": { "type": "string" }
      }
    },
    "sshConfigs": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "host": { "type": "string" },
          "port": { "type": "number" },
          "identityFile": { "type": "string" },
          "startDirectory": { "type": "string" }
        }
      }
    },
    "companyAnnouncements": {
      "type": "array",
      "items": { "type": "string" },
      "description": "Company announcements shown on startup"
    },
    "feedbackSurveyRate": {
      "type": "number",
      "minimum": 0,
      "maximum": 1,
      "description": "Probability of showing feedback survey (0-1)"
    },
    "skipDangerousModePermissionPrompt": {
      "type": "boolean"
    },
    "minimumVersion": {
      "type": "string",
      "description": "Minimum required CLI version"
    },
    "autoUpdatesChannel": {
      "type": "string",
      "enum": ["stable", "beta", "nightly", "disabled"],
      "description": "Auto-update channel"
    },
    "skipWebFetchPreflight": {
      "type": "boolean"
    },
    "env": {
      "type": "object",
      "additionalProperties": { "type": "string" },
      "description": "Environment variables to set"
    },
    "defaultShell": {
      "type": "string",
      "description": "Default shell for command execution"
    },
    "awsCredentialExport": {
      "type": "string",
      "description": "Command to export AWS credentials"
    },
    "awsAuthRefresh": {
      "type": "string",
      "description": "Command to refresh AWS auth"
    },
    "gcpAuthRefresh": {
      "type": "string",
      "description": "Command to refresh GCP auth"
    },
    "xaaIdp": {
      "type": "object",
      "description": "OIDC identity provider config",
      "properties": {
        "issuer": { "type": "string" },
        "clientId": { "type": "string" },
        "callbackPort": { "type": "number" }
      }
    },
    "forceLoginMethod": {
      "type": "string"
    },
    "forceLoginOrgUUID": {
      "type": "string"
    },
    "otelHeadersHelper": {
      "type": "string",
      "description": "Command to generate OpenTelemetry headers"
    }
  },
  "additionalProperties": true
}
```

- [ ] **Step 2: Ensure package.json has jsonValidation contribution**

Verify or add to `package.json`:

```json
{
  "contributes": {
    "jsonValidation": [
      {
        "fileMatch": "**/.claude/settings.json",
        "url": "./openclaude-settings.schema.json"
      },
      {
        "fileMatch": "**/.claude/settings.local.json",
        "url": "./openclaude-settings.schema.json"
      },
      {
        "fileMatch": "**/OpenClaude/managed-settings.json",
        "url": "./openclaude-settings.schema.json"
      }
    ]
  }
}
```

- [ ] **Step 3: Validate the schema file is valid JSON**

Run: `cd /Users/harshagarwal/Documents/workspace/openclaude-vscode && node -e "JSON.parse(require('fs').readFileSync('openclaude-settings.schema.json','utf8')); console.log('Valid JSON schema')"`

Expected: `Valid JSON schema`

- [ ] **Step 4: Commit**

```bash
git add openclaude-settings.schema.json package.json
git commit -m "feat(schema): add JSON schema for .claude/settings.json validation"
```

---

## Task 5: Wire Everything Into Extension Host

**Files:**
- Modify: `src/extension.ts`

- [ ] **Step 1: Register the URI handler and onboarding logic in activate()**

```typescript
// ── In activate() ────────────────────────────────────────────────

import { OpenClaudeUriHandler, ParsedOpenClaudeUri } from './uri/uriHandler';

// ── URI Handler ──────────────────────────────────────────────────

const uriHandler = new OpenClaudeUriHandler();
context.subscriptions.push(vscode.window.registerUriHandler(uriHandler));

uriHandler.onOpen((parsed: ParsedOpenClaudeUri) => {
  console.log(`[OpenClaude] URI action: ${parsed.action}`, parsed);

  if (parsed.session) {
    // Resume a specific session
    // This calls into ProcessManager to spawn CLI with --resume <session>
    vscode.commands.executeCommand('openclaude.sidebar.open');
    // Send resume request to the active webview/process
    activeWebview?.postMessage({
      type: 'resume_session',
      sessionId: parsed.session,
    });
  } else {
    // Open panel (create new session if needed)
    vscode.commands.executeCommand('openclaude.sidebar.open');
  }

  if (parsed.prompt) {
    // Send the prompt to the active webview input
    activeWebview?.postMessage({
      type: 'prefill_prompt',
      prompt: parsed.prompt,
    });
  }
});

// ── Onboarding Visibility ────────────────────────────────────────

const config = vscode.workspace.getConfiguration('openclaudeCode');
const hideOnboarding = config.get<boolean>('hideOnboarding', false);

// Tell the webview whether to show onboarding
function sendOnboardingState(webview: vscode.Webview) {
  const hidden = vscode.workspace.getConfiguration('openclaudeCode').get<boolean>('hideOnboarding', false);
  webview.postMessage({ type: 'onboarding_visibility', visible: !hidden });
}

// Handle onboarding dismiss from webview
function handleOnboardingMessages(message: { type: string; [key: string]: unknown }) {
  switch (message.type) {
    case 'onboarding_dismiss':
      // Persist the dismiss — update the setting
      vscode.workspace.getConfiguration('openclaudeCode').update(
        'hideOnboarding',
        true,
        vscode.ConfigurationTarget.Global,
      );
      break;

    case 'onboarding_open_walkthrough':
      vscode.commands.executeCommand(
        'workbench.action.openWalkthrough',
        'Harsh1210.openclaude-vscode#openclaude-walkthrough',
        false,
      );
      break;

    case 'onboarding_action':
      switch (message.action) {
        case 'select_provider':
          vscode.commands.executeCommand('openclaude.selectProvider');
          break;
        case 'focus_input':
          vscode.commands.executeCommand('openclaude.focus');
          break;
      }
      break;
  }
}

// ── Open Walkthrough Command ─────────────────────────────────────

// Replace the placeholder openclaude.openWalkthrough command
const openWalkthroughCmd = vscode.commands.registerCommand('openclaude.openWalkthrough', () => {
  vscode.commands.executeCommand(
    'workbench.action.openWalkthrough',
    'Harsh1210.openclaude-vscode#openclaude-walkthrough',
    false,
  );
});
context.subscriptions.push(openWalkthroughCmd);
```

- [ ] **Step 2: Build and verify**

Run: `cd /Users/harshagarwal/Documents/workspace/openclaude-vscode && npm run build`

Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add src/extension.ts src/uri/uriHandler.ts
git commit -m "feat(onboarding): wire URI handler, onboarding visibility, and walkthrough command"
```

---

## Final Verification

- [ ] Run: `npm run build`
- [ ] Run: `npx vitest run test/unit/uriHandler.test.ts`
- [ ] Manual: F5 launch → verify walkthrough appears under "Get Started" (Help > Get Started)
- [ ] Manual: verify OnboardingChecklist shows on first open
- [ ] Manual: click dismiss → verify `openclaudeCode.hideOnboarding` is set to true
- [ ] Manual: test URI: open terminal, run `code --open-url "vscode://harsh1210.openclaude-vscode/open?prompt=hello"` → verify OpenClaude opens with "hello" prefilled
- [ ] Manual: test URI with session: `code --open-url "vscode://harsh1210.openclaude-vscode/open?session=abc-123"` → verify resume attempt
- [ ] Manual: open any `.claude/settings.json` file → verify autocomplete and validation from the schema
- [ ] Manual: verify invalid properties show warnings in `.claude/settings.json`
