# Story 18: Settings Schema, Fast Mode & Prompt Suggestions — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fork and rebrand the Claude Code settings schema (70+ properties) for JSON validation of `.claude/settings.json` files, add a fast mode toggle in the webview, render AI-generated prompt suggestions, show company announcements on startup, add a feedback survey dialog, and support spinner customization during tool execution.

**Architecture:** The settings schema is a standalone JSON file contributed via `package.json` for IDE validation/autocomplete. Fast mode state comes from the CLI's initialize response and `result` messages. Prompt suggestions arrive via `prompt_suggestion` stdout messages. Company announcements come from managed settings. The feedback survey fires based on `feedbackSurveyRate` probability after session completion. Spinner customization reads `spinnerVerbs` and `spinnerTipsOverride` from settings.

**Tech Stack:** TypeScript 5.x, JSON Schema Draft-07, React 18, Tailwind CSS, VS Code Extension API

**Spec:** [2026-04-02-openclaude-vscode-extension-design.md](../specs/2026-04-02-openclaude-vscode-extension-design.md) — Story 18, Sections 2.3.1, 2.3.2, 4.7, 5.2

**Claude Code extension (reference):** `~/.vscode/extensions/anthropic.claude-code-2.1.85-darwin-arm64/claude-code-settings.schema.json`

**Depends on:** Story 1 (Project Scaffolding)

---

## File Structure

| File | Responsibility |
|---|---|
| `openclaude-settings.schema.json` | Full 70+ property JSON schema for CLI settings validation |
| `webview/src/components/input/FastModeToggle.tsx` | Toggle button + badge for fast mode |
| `webview/src/components/chat/PromptSuggestions.tsx` | Clickable prompt suggestions below the input |
| `webview/src/components/dialogs/FeedbackSurvey.tsx` | Post-session quality survey dialog |
| `webview/src/components/chat/CompanyAnnouncement.tsx` | Startup announcement banner |
| `webview/src/components/chat/SpinnerStatus.tsx` | Customizable spinner verbs/tips during tool execution |
| `webview/src/hooks/useChat.ts` | Extended with fast mode, suggestions, and announcement state |
| `test/unit/settings.test.ts` | Schema validation tests |

---

## Task 1: Fork and Rebrand the Settings Schema

**Files:**
- Create: `openclaude-settings.schema.json`
- Modify: `package.json` (verify jsonValidation contributions)

This is the largest single file in this story. We fork from `~/.vscode/extensions/anthropic.claude-code-2.1.85-darwin-arm64/claude-code-settings.schema.json` and rebrand.

- [ ] **Step 1: Create the full settings schema**

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "OpenClaude Settings",
  "description": "Configuration schema for OpenClaude CLI settings files (.claude/settings.json, .claude/settings.local.json)",
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "permissions": {
      "type": "object",
      "description": "Permission rules for tool execution",
      "properties": {
        "allow": {
          "type": "array",
          "items": { "type": "string" },
          "description": "Tool patterns to always allow (e.g., 'Bash(git *)', 'Read', 'Glob')"
        },
        "deny": {
          "type": "array",
          "items": { "type": "string" },
          "description": "Tool patterns to always deny"
        },
        "ask": {
          "type": "array",
          "items": { "type": "string" },
          "description": "Tool patterns that require user confirmation"
        },
        "defaultMode": {
          "type": "string",
          "enum": ["default", "plan", "acceptEdits", "bypassPermissions", "dontAsk", "auto"],
          "description": "Default permission mode for new sessions"
        },
        "disableBypassPermissionsMode": {
          "type": "boolean",
          "description": "Prevent users from enabling bypass mode"
        },
        "disableAutoMode": {
          "type": "boolean",
          "description": "Prevent users from enabling auto mode"
        },
        "additionalDirectories": {
          "type": "array",
          "items": { "type": "string" },
          "description": "Additional directories the CLI can access"
        }
      },
      "additionalProperties": false
    },
    "allowManagedPermissionRulesOnly": {
      "type": "boolean",
      "description": "Only use managed permission rules, ignore user-defined rules"
    },
    "model": {
      "type": "string",
      "description": "Default model identifier"
    },
    "availableModels": {
      "type": "array",
      "items": { "type": "string" },
      "description": "List of available model identifiers"
    },
    "modelOverrides": {
      "type": "object",
      "description": "Per-context model overrides",
      "additionalProperties": { "type": "string" }
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
      "description": "Model to use for plan/advisor features"
    },
    "effortLevel": {
      "type": "string",
      "enum": ["low", "medium", "high", "max"],
      "description": "Default effort level for AI responses"
    },
    "alwaysThinkingEnabled": {
      "type": "boolean",
      "description": "Always enable extended thinking"
    },
    "apiKeyHelper": {
      "type": "object",
      "description": "External API key helper command",
      "properties": {
        "command": { "type": "string" },
        "args": { "type": "array", "items": { "type": "string" } }
      }
    },
    "awsCredentialExport": {
      "type": "string",
      "description": "AWS credential export command"
    },
    "awsAuthRefresh": {
      "type": "string",
      "description": "AWS auth refresh command"
    },
    "gcpAuthRefresh": {
      "type": "string",
      "description": "GCP auth refresh command"
    },
    "xaaIdp": {
      "type": "object",
      "description": "OIDC identity provider configuration",
      "properties": {
        "issuer": { "type": "string" },
        "clientId": { "type": "string" },
        "callbackPort": { "type": "number" }
      }
    },
    "forceLoginMethod": {
      "type": "string",
      "description": "Force specific login method"
    },
    "forceLoginOrgUUID": {
      "type": "string",
      "description": "Force login to specific organization"
    },
    "otelHeadersHelper": {
      "type": "string",
      "description": "OpenTelemetry headers helper command"
    },
    "hooks": {
      "type": "object",
      "description": "Hook definitions for lifecycle events",
      "properties": {
        "PreToolUse": { "$ref": "#/definitions/hookArray" },
        "PostToolUse": { "$ref": "#/definitions/hookArray" },
        "PostToolUseFailure": { "$ref": "#/definitions/hookArray" },
        "Notification": { "$ref": "#/definitions/hookArray" },
        "UserPromptSubmit": { "$ref": "#/definitions/hookArray" },
        "SessionStart": { "$ref": "#/definitions/hookArray" },
        "SessionEnd": { "$ref": "#/definitions/hookArray" },
        "Stop": { "$ref": "#/definitions/hookArray" },
        "StopFailure": { "$ref": "#/definitions/hookArray" },
        "SubagentStart": { "$ref": "#/definitions/hookArray" },
        "SubagentStop": { "$ref": "#/definitions/hookArray" },
        "PreCompact": { "$ref": "#/definitions/hookArray" },
        "PostCompact": { "$ref": "#/definitions/hookArray" },
        "PermissionRequest": { "$ref": "#/definitions/hookArray" },
        "PermissionDenied": { "$ref": "#/definitions/hookArray" },
        "Setup": { "$ref": "#/definitions/hookArray" },
        "TeammateIdle": { "$ref": "#/definitions/hookArray" },
        "TaskCreated": { "$ref": "#/definitions/hookArray" },
        "TaskCompleted": { "$ref": "#/definitions/hookArray" },
        "Elicitation": { "$ref": "#/definitions/hookArray" },
        "ElicitationResult": { "$ref": "#/definitions/hookArray" },
        "ConfigChange": { "$ref": "#/definitions/hookArray" },
        "WorktreeCreate": { "$ref": "#/definitions/hookArray" },
        "WorktreeRemove": { "$ref": "#/definitions/hookArray" },
        "InstructionsLoaded": { "$ref": "#/definitions/hookArray" },
        "CwdChanged": { "$ref": "#/definitions/hookArray" },
        "FileChanged": { "$ref": "#/definitions/hookArray" }
      },
      "additionalProperties": false
    },
    "disableAllHooks": {
      "type": "boolean",
      "description": "Disable all hook execution"
    },
    "allowManagedHooksOnly": {
      "type": "boolean",
      "description": "Only allow managed hooks, ignore user-defined hooks"
    },
    "allowedHttpHookUrls": {
      "type": "array",
      "items": { "type": "string" },
      "description": "Allowed URLs for HTTP hooks"
    },
    "httpHookAllowedEnvVars": {
      "type": "array",
      "items": { "type": "string" },
      "description": "Env vars that HTTP hooks are allowed to access"
    },
    "respectGitignore": {
      "type": "boolean",
      "description": "Respect .gitignore when listing files"
    },
    "cleanupPeriodDays": {
      "type": "number",
      "description": "Days after which old sessions are cleaned up"
    },
    "fileSuggestion": {
      "type": "object",
      "properties": {
        "command": { "type": "string" }
      },
      "description": "Custom file suggestion command"
    },
    "claudeMdExcludes": {
      "type": "array",
      "items": { "type": "string" },
      "description": "Glob patterns to exclude from CLAUDE.md search"
    },
    "attribution": {
      "type": "object",
      "description": "Attribution settings for commits and PRs",
      "properties": {
        "commit": { "type": "boolean" },
        "pr": { "type": "boolean" }
      }
    },
    "includeGitInstructions": {
      "type": "boolean",
      "description": "Include git-related system instructions"
    },
    "worktree": {
      "type": "object",
      "description": "Git worktree configuration",
      "properties": {
        "symlinkDirectories": { "type": "array", "items": { "type": "string" } },
        "sparsePaths": { "type": "array", "items": { "type": "string" } },
        "mainBranch": { "type": "string" },
        "baseDir": { "type": "string" }
      }
    },
    "enableAllProjectMcpServers": {
      "type": "boolean",
      "description": "Auto-enable all project MCP servers"
    },
    "enabledMcpjsonServers": {
      "type": "array",
      "items": { "type": "string" },
      "description": "Enabled MCP JSON servers"
    },
    "disabledMcpjsonServers": {
      "type": "array",
      "items": { "type": "string" },
      "description": "Disabled MCP JSON servers"
    },
    "allowedMcpServers": {
      "type": "array",
      "items": { "type": "string" },
      "description": "Allowed MCP server names"
    },
    "deniedMcpServers": {
      "type": "array",
      "items": { "type": "string" },
      "description": "Denied MCP server names"
    },
    "allowManagedMcpServersOnly": {
      "type": "boolean",
      "description": "Only allow managed MCP servers"
    },
    "enabledPlugins": {
      "type": "array",
      "items": { "type": "string" },
      "description": "Enabled plugin identifiers"
    },
    "extraKnownMarketplaces": {
      "type": "array",
      "items": { "type": "string" },
      "description": "Additional plugin marketplaces"
    },
    "strictKnownMarketplaces": {
      "type": "boolean",
      "description": "Only allow known marketplaces"
    },
    "strictDeniedMarketplaces": {
      "type": "array",
      "items": { "type": "string" },
      "description": "Denied marketplace URLs"
    },
    "strictPluginOnlyCustomization": {
      "type": "boolean",
      "description": "Restrict customization to plugins only"
    },
    "pluginConfigs": {
      "type": "object",
      "description": "Per-plugin configuration",
      "additionalProperties": true
    },
    "pluginTrustMessage": {
      "type": "string",
      "description": "Message shown when trusting a new plugin"
    },
    "sandbox": {
      "type": "object",
      "description": "Sandbox configuration",
      "properties": {
        "enabled": { "type": "boolean" },
        "failIfUnavailable": { "type": "boolean" },
        "autoAllowBashIfSandboxed": { "type": "boolean" },
        "allowUnsandboxedCommands": { "type": "array", "items": { "type": "string" } },
        "network": {
          "type": "object",
          "properties": {
            "allowedDomains": { "type": "array", "items": { "type": "string" } },
            "blockedDomains": { "type": "array", "items": { "type": "string" } }
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
    "remote": {
      "type": "object",
      "description": "Remote environment configuration",
      "properties": {
        "defaultEnvironmentId": { "type": "string" }
      }
    },
    "sshConfigs": {
      "type": "array",
      "description": "SSH configuration for remote connections",
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
    "outputStyle": {
      "type": "string",
      "description": "Output display style"
    },
    "language": {
      "type": "string",
      "description": "UI language override"
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
      "description": "Show clear-context option when accepting plans"
    },
    "showThinkingSummaries": {
      "type": "boolean",
      "description": "Show thinking summaries instead of full traces"
    },
    "prefersReducedMotion": {
      "type": "boolean",
      "description": "Reduce animations for accessibility"
    },
    "syntaxHighlightingDisabled": {
      "type": "boolean",
      "description": "Disable syntax highlighting in code blocks"
    },
    "spinnerTipsEnabled": {
      "type": "boolean",
      "description": "Show tips during spinner/loading"
    },
    "spinnerVerbs": {
      "type": "array",
      "items": { "type": "string" },
      "description": "Custom spinner verb phrases (e.g., 'Analyzing...', 'Thinking...')"
    },
    "spinnerTipsOverride": {
      "type": "array",
      "items": { "type": "string" },
      "description": "Custom tip messages shown during loading"
    },
    "terminalTitleFromRename": {
      "type": "boolean",
      "description": "Use /rename value for terminal title"
    },
    "agent": {
      "type": "object",
      "description": "Agent configuration"
    },
    "plansDirectory": {
      "type": "string",
      "description": "Directory for storing plan files"
    },
    "channelsEnabled": {
      "type": "boolean",
      "description": "Enable communication channels"
    },
    "allowedChannelPlugins": {
      "type": "array",
      "items": { "type": "string" },
      "description": "Plugins allowed to create channels"
    },
    "autoMemoryEnabled": {
      "type": "boolean",
      "description": "Enable automatic memory creation"
    },
    "autoMemoryDirectory": {
      "type": "string",
      "description": "Directory for auto-generated memory files"
    },
    "autoDreamEnabled": {
      "type": "boolean",
      "description": "Enable auto-dream feature"
    },
    "companyAnnouncements": {
      "type": "array",
      "description": "Company announcements shown on startup",
      "items": {
        "type": "object",
        "properties": {
          "id": { "type": "string" },
          "message": { "type": "string" },
          "severity": { "type": "string", "enum": ["info", "warning", "error"] },
          "dismissible": { "type": "boolean" }
        },
        "required": ["id", "message"]
      }
    },
    "feedbackSurveyRate": {
      "type": "number",
      "minimum": 0,
      "maximum": 1,
      "description": "Probability (0-1) of showing feedback survey after a session"
    },
    "skipDangerousModePermissionPrompt": {
      "type": "boolean",
      "description": "Skip the safety prompt when enabling dangerous mode"
    },
    "minimumVersion": {
      "type": "string",
      "description": "Minimum required CLI version"
    },
    "autoUpdatesChannel": {
      "type": "string",
      "description": "Auto-update channel (stable, beta, etc.)"
    },
    "skipWebFetchPreflight": {
      "type": "boolean",
      "description": "Skip preflight checks for web fetch"
    },
    "env": {
      "type": "object",
      "description": "Environment variables to inject",
      "additionalProperties": { "type": "string" }
    },
    "defaultShell": {
      "type": "string",
      "description": "Default shell for command execution"
    }
  },
  "definitions": {
    "hookArray": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "type": {
            "type": "string",
            "enum": ["command", "http"]
          },
          "command": { "type": "string" },
          "url": { "type": "string" },
          "timeout": { "type": "number" },
          "matcher": { "type": "string" }
        },
        "required": ["type"]
      }
    }
  }
}
```

- [ ] **Step 2: Validate the schema is valid JSON**

Run: `cd /Users/harshagarwal/Documents/workspace/openclaude-vscode && node -e "JSON.parse(require('fs').readFileSync('openclaude-settings.schema.json','utf8')); console.log('Valid JSON schema')"`

Expected: `Valid JSON schema`

- [ ] **Step 3: Verify package.json jsonValidation contribution**

The `package.json` (from Story 1) should already contain:

```json
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
```

If not present, add it.

- [ ] **Step 4: Write a schema validation test**

```typescript
// test/unit/settings.test.ts
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('openclaude-settings.schema.json', () => {
  const schemaPath = path.resolve(__dirname, '../../openclaude-settings.schema.json');
  const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));

  it('is valid JSON', () => {
    expect(schema).toBeDefined();
    expect(schema.$schema).toBe('http://json-schema.org/draft-07/schema#');
  });

  it('has all required top-level properties', () => {
    const props = Object.keys(schema.properties);
    expect(props).toContain('permissions');
    expect(props).toContain('model');
    expect(props).toContain('hooks');
    expect(props).toContain('fastMode');
    expect(props).toContain('sandbox');
    expect(props).toContain('companyAnnouncements');
    expect(props).toContain('feedbackSurveyRate');
    expect(props).toContain('spinnerVerbs');
    expect(props).toContain('spinnerTipsOverride');
    expect(props).toContain('promptSuggestionEnabled');
    expect(props).toContain('showThinkingSummaries');
    expect(props).toContain('showClearContextOnPlanAccept');
  });

  it('has all 27 hook event types', () => {
    const hookProps = Object.keys(schema.properties.hooks.properties);
    expect(hookProps).toHaveLength(27);
    expect(hookProps).toContain('PreToolUse');
    expect(hookProps).toContain('PostToolUse');
    expect(hookProps).toContain('SessionStart');
    expect(hookProps).toContain('SessionEnd');
    expect(hookProps).toContain('FileChanged');
  });

  it('has at least 70 top-level properties', () => {
    const count = Object.keys(schema.properties).length;
    expect(count).toBeGreaterThanOrEqual(70);
  });

  it('permissions.defaultMode includes all modes', () => {
    const modes = schema.properties.permissions.properties.defaultMode.enum;
    expect(modes).toContain('default');
    expect(modes).toContain('plan');
    expect(modes).toContain('acceptEdits');
    expect(modes).toContain('bypassPermissions');
    expect(modes).toContain('dontAsk');
    expect(modes).toContain('auto');
  });
});
```

- [ ] **Step 5: Run the test**

Run: `cd /Users/harshagarwal/Documents/workspace/openclaude-vscode && npx vitest run test/unit/settings.test.ts`

Expected: All pass

- [ ] **Step 6: Commit**

```bash
git add openclaude-settings.schema.json test/unit/settings.test.ts
git commit -m "feat(settings): add full 70+ property OpenClaude settings schema with tests"
```

---

## Task 2: Fast Mode Toggle

**Files:**
- Create: `webview/src/components/input/FastModeToggle.tsx`

- [ ] **Step 1: Build the fast mode toggle component**

```tsx
// webview/src/components/input/FastModeToggle.tsx
import React from 'react';
import { useVSCode } from '../../hooks/useVSCode';

interface FastModeToggleProps {
  /** Whether fast mode is currently enabled */
  isEnabled: boolean;
  /** Whether fast mode can be toggled (not locked by managed settings) */
  canToggle: boolean;
}

export const FastModeToggle: React.FC<FastModeToggleProps> = ({
  isEnabled,
  canToggle,
}) => {
  const vscode = useVSCode();

  const handleToggle = () => {
    if (!canToggle) return;
    vscode.postMessage({
      type: 'control_request',
      request: {
        subtype: 'apply_flag_settings',
        settings: { fastMode: !isEnabled },
      },
    });
  };

  return (
    <button
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border cursor-pointer transition-colors ${
        isEnabled
          ? 'bg-yellow-500/15 border-yellow-500/40 text-yellow-500 hover:bg-yellow-500/25'
          : 'bg-transparent border-vscode-border text-vscode-fg/50 hover:border-vscode-fg/40 hover:text-vscode-fg/70'
      } ${!canToggle ? 'opacity-50 cursor-not-allowed' : ''}`}
      onClick={handleToggle}
      disabled={!canToggle}
      title={
        !canToggle
          ? 'Fast mode is controlled by managed settings'
          : isEnabled
            ? 'Disable fast mode'
            : 'Enable fast mode'
      }
      aria-pressed={isEnabled}
      aria-label="Fast mode toggle"
    >
      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 16 16">
        <path d="M8.5 1.5l-5 7h4l-1 6 5-7h-4l1-6z" />
      </svg>
      <span>Fast</span>
      {isEnabled && (
        <span className="w-1.5 h-1.5 rounded-full bg-yellow-500 animate-pulse" />
      )}
    </button>
  );
};
```

- [ ] **Step 2: Add fast mode state to the chat hook**

Add to `webview/src/hooks/useChat.ts`:

```typescript
// Add state for fast mode:
const [fastModeState, setFastModeState] = useState<{
  enabled: boolean;
  canToggle: boolean;
}>({ enabled: false, canToggle: true });

// In the initialize response handler (from Story 2), extract fast_mode_state:
// case 'control_response' when subtype === 'success' and from initialize:
if (msg.response?.fast_mode_state) {
  setFastModeState({
    enabled: msg.response.fast_mode_state.enabled ?? false,
    canToggle: msg.response.fast_mode_state.canToggle ?? true,
  });
}

// In the 'result' message handler, update fast_mode_state:
if (msg.type === 'result' && msg.fast_mode_state) {
  setFastModeState({
    enabled: msg.fast_mode_state.enabled ?? fastModeState.enabled,
    canToggle: msg.fast_mode_state.canToggle ?? fastModeState.canToggle,
  });
}

// Return from hook:
// fastModeState,
```

- [ ] **Step 3: Verify build**

Run: `cd /Users/harshagarwal/Documents/workspace/openclaude-vscode && npm run build:webview`

Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add webview/src/components/input/FastModeToggle.tsx webview/src/hooks/useChat.ts
git commit -m "feat(settings): add FastModeToggle component with CLI state sync"
```

---

## Task 3: Prompt Suggestions

**Files:**
- Create: `webview/src/components/chat/PromptSuggestions.tsx`

- [ ] **Step 1: Build the prompt suggestions component**

```tsx
// webview/src/components/chat/PromptSuggestions.tsx
import React from 'react';

interface PromptSuggestionsProps {
  suggestions: string[];
  onSelect: (suggestion: string) => void;
  isVisible: boolean;
}

export const PromptSuggestions: React.FC<PromptSuggestionsProps> = ({
  suggestions,
  onSelect,
  isVisible,
}) => {
  if (!isVisible || suggestions.length === 0) return null;

  return (
    <div className="px-3 py-2">
      <div className="text-xs text-vscode-fg/40 mb-1.5">Suggested prompts:</div>
      <div className="flex flex-wrap gap-1.5">
        {suggestions.map((suggestion, i) => (
          <button
            key={i}
            className="px-2.5 py-1 text-xs rounded-full border border-vscode-border text-vscode-fg/70 bg-transparent hover:bg-vscode-input-bg hover:text-vscode-fg hover:border-vscode-fg/40 cursor-pointer transition-colors"
            onClick={() => onSelect(suggestion)}
            title={suggestion}
          >
            {suggestion.length > 60 ? suggestion.slice(0, 57) + '...' : suggestion}
          </button>
        ))}
      </div>
    </div>
  );
};
```

- [ ] **Step 2: Add suggestion state to the chat hook**

Add to `webview/src/hooks/useChat.ts`:

```typescript
// Add state for prompt suggestions:
const [promptSuggestions, setPromptSuggestions] = useState<string[]>([]);

// In the message handler, handle prompt_suggestion messages:
if (msg.type === 'prompt_suggestion') {
  setPromptSuggestions((prev) => {
    // Deduplicate and keep latest 5
    const updated = [...prev.filter((s) => s !== msg.suggestion), msg.suggestion];
    return updated.slice(-5);
  });
}

// Clear suggestions when user sends a new message:
// (in the send message function)
// setPromptSuggestions([]);

// Return from hook:
// promptSuggestions,
```

- [ ] **Step 3: Wire into ChatPanel**

Add to the ChatPanel between the message list and input:

```tsx
// In webview/src/components/chat/ChatPanel.tsx:
import { PromptSuggestions } from './PromptSuggestions';

// Between MessageList and PromptInput:
<PromptSuggestions
  suggestions={promptSuggestions}
  onSelect={(suggestion) => {
    setInputText(suggestion);
    inputRef.current?.focus();
  }}
  isVisible={!isStreaming && messages.length > 0}
/>
```

- [ ] **Step 4: Commit**

```bash
git add webview/src/components/chat/PromptSuggestions.tsx webview/src/hooks/useChat.ts webview/src/components/chat/ChatPanel.tsx
git commit -m "feat(settings): add PromptSuggestions rendering from CLI events"
```

---

## Task 4: Company Announcements

**Files:**
- Create: `webview/src/components/chat/CompanyAnnouncement.tsx`

- [ ] **Step 1: Build the announcement banner component**

```tsx
// webview/src/components/chat/CompanyAnnouncement.tsx
import React, { useState } from 'react';

interface Announcement {
  id: string;
  message: string;
  severity?: 'info' | 'warning' | 'error';
  dismissible?: boolean;
}

interface CompanyAnnouncementProps {
  announcements: Announcement[];
  onDismiss: (id: string) => void;
}

const severityStyles: Record<string, string> = {
  info: 'bg-blue-500/10 border-blue-500/30 text-blue-400',
  warning: 'bg-yellow-500/10 border-yellow-500/30 text-yellow-400',
  error: 'bg-red-500/10 border-red-500/30 text-red-400',
};

const severityIcons: Record<string, React.ReactNode> = {
  info: (
    <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
    </svg>
  ),
  warning: (
    <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
      <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
    </svg>
  ),
  error: (
    <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
    </svg>
  ),
};

export const CompanyAnnouncement: React.FC<CompanyAnnouncementProps> = ({
  announcements,
  onDismiss,
}) => {
  if (announcements.length === 0) return null;

  return (
    <div className="space-y-1 px-3 pt-2">
      {announcements.map((announcement) => {
        const severity = announcement.severity ?? 'info';
        return (
          <div
            key={announcement.id}
            className={`flex items-start gap-2 px-3 py-2 rounded border text-xs ${severityStyles[severity]}`}
            role="alert"
          >
            {severityIcons[severity]}
            <span className="flex-1">{announcement.message}</span>
            {announcement.dismissible !== false && (
              <button
                className="flex-shrink-0 p-0.5 hover:bg-white/10 rounded bg-transparent border-none cursor-pointer text-current"
                onClick={() => onDismiss(announcement.id)}
                aria-label="Dismiss announcement"
              >
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 16 16">
                  <path d="M4.5 4.5l7 7M11.5 4.5l-7 7" stroke="currentColor" strokeWidth="1.5" fill="none" />
                </svg>
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
};
```

- [ ] **Step 2: Commit**

```bash
git add webview/src/components/chat/CompanyAnnouncement.tsx
git commit -m "feat(settings): add CompanyAnnouncement banner component"
```

---

## Task 5: Feedback Survey Dialog

**Files:**
- Create: `webview/src/components/dialogs/FeedbackSurvey.tsx`

- [ ] **Step 1: Build the feedback survey dialog**

```tsx
// webview/src/components/dialogs/FeedbackSurvey.tsx
import React, { useState, useCallback } from 'react';
import { useVSCode } from '../../hooks/useVSCode';

interface FeedbackSurveyProps {
  onDismiss: () => void;
}

export const FeedbackSurvey: React.FC<FeedbackSurveyProps> = ({ onDismiss }) => {
  const vscode = useVSCode();
  const [rating, setRating] = useState<number | null>(null);
  const [feedback, setFeedback] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = useCallback(() => {
    vscode.postMessage({
      type: 'feedback_survey',
      rating,
      feedback: feedback.trim() || null,
    });
    setSubmitted(true);
    setTimeout(onDismiss, 1500);
  }, [rating, feedback, vscode, onDismiss]);

  if (submitted) {
    return (
      <div className="fixed bottom-4 right-4 z-50 bg-vscode-bg border border-vscode-border rounded-lg shadow-xl p-4 max-w-sm">
        <div className="flex items-center gap-2 text-sm text-green-400">
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
          </svg>
          Thank you for your feedback!
        </div>
      </div>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 bg-vscode-bg border border-vscode-border rounded-lg shadow-xl max-w-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-vscode-border bg-vscode-input-bg flex items-center justify-between">
        <h3 className="text-sm font-medium text-vscode-fg">How was this session?</h3>
        <button
          className="p-0.5 text-vscode-fg/40 hover:text-vscode-fg bg-transparent border-none cursor-pointer"
          onClick={onDismiss}
          aria-label="Dismiss survey"
        >
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 16 16">
            <path d="M4.5 4.5l7 7M11.5 4.5l-7 7" stroke="currentColor" strokeWidth="1.5" fill="none" />
          </svg>
        </button>
      </div>

      <div className="px-4 py-3 space-y-3">
        {/* Star rating */}
        <div className="flex gap-1 justify-center">
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              className={`p-1 bg-transparent border-none cursor-pointer transition-colors ${
                rating !== null && star <= rating
                  ? 'text-yellow-400'
                  : 'text-vscode-fg/20 hover:text-yellow-400/60'
              }`}
              onClick={() => setRating(star)}
              aria-label={`Rate ${star} star${star > 1 ? 's' : ''}`}
            >
              <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
              </svg>
            </button>
          ))}
        </div>

        {/* Optional text feedback */}
        <textarea
          className="w-full px-2 py-1.5 text-xs rounded border border-vscode-input-border bg-vscode-input-bg text-vscode-input-fg outline-none resize-none focus:border-vscode-link"
          placeholder="Any additional feedback? (optional)"
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          rows={2}
        />

        <button
          className="w-full px-3 py-1.5 text-xs rounded bg-vscode-button-bg text-vscode-button-fg hover:bg-vscode-button-hover cursor-pointer border-none disabled:opacity-50 disabled:cursor-not-allowed"
          onClick={handleSubmit}
          disabled={rating === null}
        >
          Submit Feedback
        </button>
      </div>
    </div>
  );
};

/**
 * Determines whether to show the feedback survey based on configured rate.
 * Call this after a session completes (result message received).
 */
export function shouldShowSurvey(feedbackSurveyRate: number): boolean {
  if (feedbackSurveyRate <= 0) return false;
  if (feedbackSurveyRate >= 1) return true;
  return Math.random() < feedbackSurveyRate;
}
```

- [ ] **Step 2: Commit**

```bash
git add webview/src/components/dialogs/FeedbackSurvey.tsx
git commit -m "feat(settings): add FeedbackSurvey dialog with star rating and probability trigger"
```

---

## Task 6: Spinner Customization

**Files:**
- Create: `webview/src/components/chat/SpinnerStatus.tsx`

- [ ] **Step 1: Build the customizable spinner status component**

```tsx
// webview/src/components/chat/SpinnerStatus.tsx
import React, { useState, useEffect, useRef } from 'react';

interface SpinnerStatusProps {
  /** Whether a tool is currently executing */
  isActive: boolean;
  /** Custom spinner verbs from settings (e.g., ['Analyzing', 'Processing', 'Thinking']) */
  customVerbs: string[];
  /** Custom tips from settings */
  customTips: string[];
  /** Whether to show tips */
  tipsEnabled: boolean;
  /** Respect reduced motion preference */
  reducedMotion: boolean;
}

const DEFAULT_VERBS = ['Thinking', 'Working', 'Processing', 'Analyzing'];
const DEFAULT_TIPS = [
  'Tip: Use @file to reference specific files',
  'Tip: Use /help to see all commands',
  'Tip: Press Escape to cancel',
];

export const SpinnerStatus: React.FC<SpinnerStatusProps> = ({
  isActive,
  customVerbs,
  customTips,
  tipsEnabled,
  reducedMotion,
}) => {
  const verbs = customVerbs.length > 0 ? customVerbs : DEFAULT_VERBS;
  const tips = customTips.length > 0 ? customTips : DEFAULT_TIPS;

  const [verbIndex, setVerbIndex] = useState(0);
  const [tipIndex, setTipIndex] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!isActive) {
      setVerbIndex(0);
      setTipIndex(0);
      return;
    }

    // Rotate verbs every 3 seconds
    intervalRef.current = setInterval(() => {
      setVerbIndex((prev) => (prev + 1) % verbs.length);
    }, 3000);

    // Rotate tips every 8 seconds
    const tipInterval = setInterval(() => {
      setTipIndex((prev) => (prev + 1) % tips.length);
    }, 8000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      clearInterval(tipInterval);
    };
  }, [isActive, verbs.length, tips.length]);

  if (!isActive) return null;

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 text-xs text-vscode-fg/50">
      {/* Spinner animation */}
      <div
        className={`w-3 h-3 border-2 border-vscode-fg/20 border-t-vscode-link rounded-full ${
          reducedMotion ? '' : 'animate-spin'
        }`}
        role="status"
        aria-label="Loading"
      />

      {/* Verb */}
      <span className="text-vscode-fg/60">{verbs[verbIndex]}...</span>

      {/* Tip */}
      {tipsEnabled && (
        <span className="ml-auto text-vscode-fg/30 truncate max-w-[200px]">
          {tips[tipIndex]}
        </span>
      )}
    </div>
  );
};
```

- [ ] **Step 2: Commit**

```bash
git add webview/src/components/chat/SpinnerStatus.tsx
git commit -m "feat(settings): add SpinnerStatus with custom verbs and tips"
```

---

## Task 7: Wire All Components into the Chat UI

**Files:**
- Modify: `webview/src/App.tsx`
- Modify: `webview/src/components/chat/ChatPanel.tsx`
- Modify: `webview/src/components/input/PromptInput.tsx` or `InputToolbar.tsx`

- [ ] **Step 1: Add FastModeToggle to the input toolbar**

In the input area (likely `InputToolbar.tsx` or `ContextFooter.tsx` from Story 5):

```tsx
// Add to the input toolbar, near the mode selector:
import { FastModeToggle } from './FastModeToggle';

// Inside the toolbar JSX:
<FastModeToggle
  isEnabled={fastModeState.enabled}
  canToggle={fastModeState.canToggle}
/>
```

- [ ] **Step 2: Add CompanyAnnouncement to ChatPanel**

```tsx
// Add to ChatPanel, before the message list:
import { CompanyAnnouncement } from './CompanyAnnouncement';

// State for dismissed announcements:
const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
const visibleAnnouncements = announcements.filter((a) => !dismissedIds.has(a.id));

// JSX:
<CompanyAnnouncement
  announcements={visibleAnnouncements}
  onDismiss={(id) => setDismissedIds((prev) => new Set(prev).add(id))}
/>
```

- [ ] **Step 3: Add SpinnerStatus to ChatPanel**

```tsx
// Add to ChatPanel, between message list and input:
import { SpinnerStatus } from './SpinnerStatus';

<SpinnerStatus
  isActive={isToolExecuting}
  customVerbs={settings.spinnerVerbs ?? []}
  customTips={settings.spinnerTipsOverride ?? []}
  tipsEnabled={settings.spinnerTipsEnabled ?? true}
  reducedMotion={settings.prefersReducedMotion ?? false}
/>
```

- [ ] **Step 4: Add FeedbackSurvey trigger to App.tsx**

```tsx
// In App.tsx:
import { FeedbackSurvey, shouldShowSurvey } from './components/dialogs/FeedbackSurvey';

const [showSurvey, setShowSurvey] = useState(false);

// When a 'result' message with subtype 'success' arrives and turn is complete:
// if (shouldShowSurvey(feedbackSurveyRate)) setShowSurvey(true);

{showSurvey && <FeedbackSurvey onDismiss={() => setShowSurvey(false)} />}
```

- [ ] **Step 5: Build and verify**

Run: `cd /Users/harshagarwal/Documents/workspace/openclaude-vscode && npm run build`

Expected: Build succeeds

- [ ] **Step 6: Commit**

```bash
git add webview/src/App.tsx webview/src/components/chat/ChatPanel.tsx webview/src/components/input/
git commit -m "feat(settings): wire FastModeToggle, announcements, spinner, and survey into UI"
```

---

## Final Verification

- [ ] Run: `cd /Users/harshagarwal/Documents/workspace/openclaude-vscode && npm run build`
- [ ] Run: `cd /Users/harshagarwal/Documents/workspace/openclaude-vscode && npx vitest run test/unit/settings.test.ts`
- [ ] Manual verification checklist:
  - Open a `.claude/settings.json` file in VS Code — get autocomplete and validation from the schema
  - Fast mode toggle: click toggles state, sends control_request, badge shows when enabled
  - Prompt suggestions: appear after assistant response, clicking fills input
  - Company announcements: banner renders at top, dismissible, respects severity colors
  - Feedback survey: fires probabilistically after result, star rating + text input, submit works
  - Spinner: shows custom verbs, rotates, tips display when enabled, respects reduced motion
