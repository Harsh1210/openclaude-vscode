# Story 2: Process Manager, NDJSON Transport & Initialize Handshake — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Spawn the OpenClaude CLI as a child process, communicate over NDJSON (newline-delimited JSON) on stdin/stdout, perform the initialize handshake, and route incoming control requests to handlers — with full TypeScript type coverage for every SDK message variant.

**Architecture:** Three core classes — `NdjsonTransport` (line-buffered parser/writer), `ProcessManager` (spawn, lifecycle, crash recovery), and `ControlRouter` (route incoming control_request subtypes to handlers). TypeScript interfaces mirror every Zod schema in `controlSchemas.ts` and `coreSchemas.ts` from the OpenClaude CLI. The ProcessManager owns a single CLI child process, restarts on crash with `--resume`, and emits events via VS Code's `EventEmitter`. The ControlRouter receives parsed control_requests from stdout and dispatches to registered handlers (permission, elicitation, hook, MCP).

**Tech Stack:** TypeScript 5.x, Node.js `child_process.spawn`, VS Code Extension API (`vscode.EventEmitter`, `vscode.Disposable`), Vitest for unit tests

**Spec:** [2026-04-02-openclaude-vscode-extension-design.md](../specs/2026-04-02-openclaude-vscode-extension-design.md) — Story 2 (Section 2.2, 2.3)

**CLI Protocol Source:** `openclaude/src/entrypoints/sdk/controlSchemas.ts` and `coreSchemas.ts`

**Claude Code extension (deminify reference):** `~/.vscode/extensions/anthropic.claude-code-2.1.85-darwin-arm64/extension.js` — `Qm` class (ProcessTransport), `fm` class (Query/message router)

---

## File Structure

| File | Responsibility |
|---|---|
| `src/types/messages.ts` | TypeScript types for ALL StdoutMessage and StdinMessage variants (mirrors Zod schemas) |
| `src/types/protocol.ts` | Control request/response envelope types, initialize request/response |
| `src/types/session.ts` | Session info, result types, account/model/command info |
| `src/process/ndjsonTransport.ts` | Line-buffered NDJSON parser for stdout, JSON+newline writer for stdin |
| `src/process/processManager.ts` | Spawn `openclaude` CLI, handle lifecycle, crash recovery, env setup |
| `src/process/controlRouter.ts` | Route incoming `control_request` subtypes to registered handlers |
| `test/unit/ndjsonTransport.test.ts` | Unit tests for NDJSON parsing edge cases |
| `test/unit/processManager.test.ts` | Unit tests for ProcessManager spawn/crash/restart |
| `test/unit/controlRouter.test.ts` | Unit tests for ControlRouter dispatch |
| `vitest.config.ts` | Vitest configuration for unit tests |

---

## Task 1: Test Infrastructure (Vitest Setup)

**Files:**
- Create: `vitest.config.ts`
- Modify: `package.json` (add vitest dep + test script)

- [ ] **Step 1: Add vitest to devDependencies and add test script**

In `package.json`, add to `devDependencies`:

```json
"vitest": "^1.6.0"
```

And add to `scripts`:

```json
"test": "vitest run",
"test:watch": "vitest"
```

Run: `cd /Users/harshagarwal/Documents/workspace/openclaude-vscode && npm install`

Expected: `added X packages`

- [ ] **Step 2: Create vitest.config.ts**

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['test/**/*.test.ts'],
    coverage: {
      include: ['src/**/*.ts'],
      exclude: ['src/types/**'],
    },
  },
  resolve: {
    alias: {
      vscode: './test/__mocks__/vscode.ts',
    },
  },
});
```

- [ ] **Step 3: Create VS Code mock for unit tests**

Create `test/__mocks__/vscode.ts`:

```typescript
// Minimal VS Code API mock for unit testing outside Extension Development Host

export class EventEmitter<T> {
  private listeners: Array<(e: T) => void> = [];

  event = (listener: (e: T) => void) => {
    this.listeners.push(listener);
    return { dispose: () => { this.listeners = this.listeners.filter(l => l !== listener); } };
  };

  fire(data: T): void {
    for (const listener of this.listeners) {
      listener(data);
    }
  }

  dispose(): void {
    this.listeners = [];
  }
}

export class Disposable {
  private callOnDispose: () => void;
  constructor(callOnDispose: () => void) {
    this.callOnDispose = callOnDispose;
  }
  dispose(): void {
    this.callOnDispose();
  }
  static from(...disposables: { dispose: () => void }[]): Disposable {
    return new Disposable(() => {
      for (const d of disposables) {
        d.dispose();
      }
    });
  }
}

export const workspace = {
  getConfiguration: (section?: string) => ({
    get: <T>(key: string, defaultValue?: T): T | undefined => defaultValue,
    has: (key: string) => false,
    inspect: (key: string) => undefined,
    update: async (key: string, value: unknown) => {},
  }),
  workspaceFolders: undefined as { uri: { fsPath: string } }[] | undefined,
};

export const window = {
  showErrorMessage: async (message: string) => undefined,
  showWarningMessage: async (message: string) => undefined,
  showInformationMessage: async (message: string) => undefined,
  createOutputChannel: (name: string) => ({
    appendLine: (value: string) => {},
    append: (value: string) => {},
    show: () => {},
    dispose: () => {},
  }),
};

export enum LogLevel {
  Off = 0,
  Trace = 1,
  Debug = 2,
  Info = 3,
  Warning = 4,
  Error = 5,
}

export const Uri = {
  file: (path: string) => ({ fsPath: path, scheme: 'file' }),
  parse: (value: string) => ({ fsPath: value, scheme: 'file' }),
};
```

- [ ] **Step 4: Verify vitest runs (no tests yet — should report 0)**

Run: `cd /Users/harshagarwal/Documents/workspace/openclaude-vscode && npx vitest run 2>&1 | head -20`

Expected: `No test files found` or similar (no tests exist yet)

- [ ] **Step 5: Commit**

```bash
cd /Users/harshagarwal/Documents/workspace/openclaude-vscode
git add vitest.config.ts test/__mocks__/vscode.ts package.json package-lock.json
git commit -m "chore: add vitest test infrastructure with VS Code mocks"
```

---

## Task 2: TypeScript Type Definitions — Session & Model Types

**Files:**
- Create: `src/types/session.ts`

These types mirror `coreSchemas.ts`: ModelUsage, SlashCommand, AgentInfo, ModelInfo, AccountInfo, FastModeState, PermissionMode, SessionInfo, etc.

- [ ] **Step 1: Create src/types/session.ts**

```typescript
// src/types/session.ts
// TypeScript types mirroring coreSchemas.ts from the OpenClaude CLI.
// These represent the serializable data structures used across the SDK.

// ============================================================================
// Usage & Model Types
// ============================================================================

export interface ModelUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens: number;
  cacheCreationInputTokens: number;
  webSearchRequests: number;
  costUSD: number;
  contextWindow: number;
  maxOutputTokens: number;
}

// ============================================================================
// Permission Types
// ============================================================================

export type PermissionMode =
  | 'default'
  | 'acceptEdits'
  | 'bypassPermissions'
  | 'plan'
  | 'dontAsk';

export type PermissionBehavior = 'allow' | 'deny' | 'ask';

export type PermissionUpdateDestination =
  | 'userSettings'
  | 'projectSettings'
  | 'localSettings'
  | 'session'
  | 'cliArg';

export interface PermissionRuleValue {
  toolName: string;
  ruleContent?: string;
}

export type PermissionUpdate =
  | {
      type: 'addRules';
      rules: PermissionRuleValue[];
      behavior: PermissionBehavior;
      destination: PermissionUpdateDestination;
    }
  | {
      type: 'replaceRules';
      rules: PermissionRuleValue[];
      behavior: PermissionBehavior;
      destination: PermissionUpdateDestination;
    }
  | {
      type: 'removeRules';
      rules: PermissionRuleValue[];
      behavior: PermissionBehavior;
      destination: PermissionUpdateDestination;
    }
  | {
      type: 'setMode';
      mode: PermissionMode;
      destination: PermissionUpdateDestination;
    }
  | {
      type: 'addDirectories';
      directories: string[];
      destination: PermissionUpdateDestination;
    }
  | {
      type: 'removeDirectories';
      directories: string[];
      destination: PermissionUpdateDestination;
    };

export type PermissionDecisionClassification =
  | 'user_temporary'
  | 'user_permanent'
  | 'user_reject';

export type PermissionResult =
  | {
      behavior: 'allow';
      updatedInput?: Record<string, unknown>;
      updatedPermissions?: PermissionUpdate[];
      toolUseID?: string;
      decisionClassification?: PermissionDecisionClassification;
    }
  | {
      behavior: 'deny';
      message: string;
      interrupt?: boolean;
      toolUseID?: string;
      decisionClassification?: PermissionDecisionClassification;
    };

// ============================================================================
// Skill/Command Types
// ============================================================================

export interface SlashCommand {
  name: string;
  description: string;
  argumentHint: string;
}

export interface AgentInfo {
  name: string;
  description: string;
  model?: string;
}

export interface ModelInfo {
  value: string;
  displayName: string;
  description: string;
  supportsEffort?: boolean;
  supportedEffortLevels?: Array<'low' | 'medium' | 'high' | 'max'>;
  supportsAdaptiveThinking?: boolean;
  supportsFastMode?: boolean;
  supportsAutoMode?: boolean;
}

export interface AccountInfo {
  email?: string;
  organization?: string;
  subscriptionType?: string;
  tokenSource?: string;
  apiKeySource?: string;
  apiProvider?: 'firstParty' | 'bedrock' | 'vertex' | 'foundry';
}

export type FastModeState = 'off' | 'cooldown' | 'on';

export type ApiKeySource = 'user' | 'project' | 'org' | 'temporary' | 'oauth';

// ============================================================================
// MCP Server Types
// ============================================================================

export interface McpStdioServerConfig {
  type?: 'stdio';
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

export interface McpSSEServerConfig {
  type: 'sse';
  url: string;
  headers?: Record<string, string>;
}

export interface McpHttpServerConfig {
  type: 'http';
  url: string;
  headers?: Record<string, string>;
}

export interface McpSdkServerConfig {
  type: 'sdk';
  name: string;
}

export type McpServerConfigForProcessTransport =
  | McpStdioServerConfig
  | McpSSEServerConfig
  | McpHttpServerConfig
  | McpSdkServerConfig;

export interface McpServerToolAnnotations {
  readOnly?: boolean;
  destructive?: boolean;
  openWorld?: boolean;
}

export interface McpServerTool {
  name: string;
  description?: string;
  annotations?: McpServerToolAnnotations;
}

export interface McpServerStatus {
  name: string;
  status: 'connected' | 'failed' | 'needs-auth' | 'pending' | 'disabled';
  serverInfo?: { name: string; version: string };
  error?: string;
  config?: McpServerConfigForProcessTransport;
  scope?: string;
  tools?: McpServerTool[];
  capabilities?: { experimental?: Record<string, unknown> };
}

// ============================================================================
// Agent Definition Types
// ============================================================================

export interface AgentDefinition {
  description: string;
  tools?: string[];
  disallowedTools?: string[];
  prompt: string;
  model?: string;
  mcpServers?: Array<string | Record<string, McpServerConfigForProcessTransport>>;
  skills?: string[];
  initialPrompt?: string;
  maxTurns?: number;
  background?: boolean;
  memory?: 'user' | 'project' | 'local';
  effort?: 'low' | 'medium' | 'high' | 'max' | number;
  permissionMode?: PermissionMode;
}

// ============================================================================
// Hook Types
// ============================================================================

export type HookEvent =
  | 'PreToolUse'
  | 'PostToolUse'
  | 'PostToolUseFailure'
  | 'Notification'
  | 'UserPromptSubmit'
  | 'SessionStart'
  | 'SessionEnd'
  | 'Stop'
  | 'StopFailure'
  | 'SubagentStart'
  | 'SubagentStop'
  | 'PreCompact'
  | 'PostCompact'
  | 'PermissionRequest'
  | 'PermissionDenied'
  | 'Setup'
  | 'TeammateIdle'
  | 'TaskCreated'
  | 'TaskCompleted'
  | 'Elicitation'
  | 'ElicitationResult'
  | 'ConfigChange'
  | 'WorktreeCreate'
  | 'WorktreeRemove'
  | 'InstructionsLoaded'
  | 'CwdChanged'
  | 'FileChanged';

export interface HookCallbackMatcher {
  matcher?: string;
  hookCallbackIds: string[];
  timeout?: number;
}

// ============================================================================
// Session Info
// ============================================================================

export interface SessionInfo {
  sessionId: string;
  summary: string;
  lastModified: number;
  fileSize?: number;
  customTitle?: string;
  firstPrompt?: string;
  gitBranch?: string;
  cwd?: string;
  tag?: string;
  createdAt?: number;
}

// ============================================================================
// Error Types
// ============================================================================

export type AssistantMessageError =
  | 'authentication_failed'
  | 'billing_error'
  | 'rate_limit'
  | 'invalid_request'
  | 'server_error'
  | 'unknown'
  | 'max_output_tokens';
```

- [ ] **Step 2: Verify it compiles**

Run: `cd /Users/harshagarwal/Documents/workspace/openclaude-vscode && npx tsc --noEmit --strict src/types/session.ts 2>&1 | head -20`

Expected: No errors

- [ ] **Step 3: Commit**

```bash
cd /Users/harshagarwal/Documents/workspace/openclaude-vscode
git add src/types/session.ts
git commit -m "feat: add TypeScript types for session, model, permission, MCP, and hook schemas"
```

---

## Task 3: TypeScript Type Definitions — SDK Message Types (StdoutMessage)

**Files:**
- Create: `src/types/messages.ts`

These types mirror every variant in `SDKMessageSchema` union from `coreSchemas.ts`, plus the control/keepalive/streamlined types from `controlSchemas.ts` that compose `StdoutMessageSchema`.

- [ ] **Step 1: Create src/types/messages.ts**

```typescript
// src/types/messages.ts
// TypeScript types for ALL StdoutMessage and StdinMessage variants.
// Mirrors controlSchemas.ts StdoutMessageSchema and StdinMessageSchema unions.

import type {
  AccountInfo,
  AgentDefinition,
  AgentInfo,
  ApiKeySource,
  AssistantMessageError,
  FastModeState,
  HookCallbackMatcher,
  HookEvent,
  McpServerConfigForProcessTransport,
  McpServerStatus,
  ModelInfo,
  ModelUsage,
  PermissionMode,
  PermissionUpdate,
  SlashCommand,
} from './session';

// ============================================================================
// SDK Core Messages (type field discriminates at top level)
// ============================================================================

/** Complete assistant turn */
export interface SDKAssistantMessage {
  type: 'assistant';
  message: unknown; // APIAssistantMessage from Anthropic SDK
  parent_tool_use_id: string | null;
  error?: AssistantMessageError;
  uuid: string;
  session_id: string;
}

/** User message (sent or echoed/replayed) */
export interface SDKUserMessage {
  type: 'user';
  message: unknown; // APIUserMessage from Anthropic SDK
  parent_tool_use_id: string | null;
  isSynthetic?: boolean;
  tool_use_result?: unknown;
  priority?: 'now' | 'next' | 'later';
  timestamp?: string;
  uuid?: string;
  session_id?: string;
}

/** User message replay (from session resume) */
export interface SDKUserMessageReplay {
  type: 'user';
  message: unknown;
  parent_tool_use_id: string | null;
  isSynthetic?: boolean;
  tool_use_result?: unknown;
  priority?: 'now' | 'next' | 'later';
  timestamp?: string;
  uuid: string;
  session_id: string;
  isReplay: true;
}

/** Successful turn result */
export interface SDKResultSuccess {
  type: 'result';
  subtype: 'success';
  duration_ms: number;
  duration_api_ms: number;
  is_error: boolean;
  num_turns: number;
  result: string;
  stop_reason: string | null;
  total_cost_usd: number;
  usage: unknown; // NonNullableUsage
  modelUsage: Record<string, ModelUsage>;
  permission_denials: Array<{
    tool_name: string;
    tool_use_id: string;
    tool_input: Record<string, unknown>;
  }>;
  structured_output?: unknown;
  fast_mode_state?: FastModeState;
  uuid: string;
  session_id: string;
}

/** Error turn result */
export interface SDKResultError {
  type: 'result';
  subtype:
    | 'error_during_execution'
    | 'error_max_turns'
    | 'error_max_budget_usd'
    | 'error_max_structured_output_retries';
  duration_ms: number;
  duration_api_ms: number;
  is_error: boolean;
  num_turns: number;
  stop_reason: string | null;
  total_cost_usd: number;
  usage: unknown;
  modelUsage: Record<string, ModelUsage>;
  permission_denials: Array<{
    tool_name: string;
    tool_use_id: string;
    tool_input: Record<string, unknown>;
  }>;
  errors: string[];
  fast_mode_state?: FastModeState;
  uuid: string;
  session_id: string;
}

export type SDKResultMessage = SDKResultSuccess | SDKResultError;

/** Streaming event wrapper (Anthropic-format stream events) */
export interface SDKPartialAssistantMessage {
  type: 'stream_event';
  event: unknown; // RawMessageStreamEvent from Anthropic SDK
  parent_tool_use_id: string | null;
  uuid: string;
  session_id: string;
}

/** Tool progress during long-running tool execution */
export interface SDKToolProgressMessage {
  type: 'tool_progress';
  tool_use_id: string;
  tool_name: string;
  parent_tool_use_id: string | null;
  elapsed_time_seconds: number;
  task_id?: string;
  uuid: string;
  session_id: string;
}

/** Tool use summary */
export interface SDKToolUseSummaryMessage {
  type: 'tool_use_summary';
  summary: string;
  preceding_tool_use_ids: string[];
  uuid: string;
  session_id: string;
}

/** Auth status change */
export interface SDKAuthStatusMessage {
  type: 'auth_status';
  isAuthenticating: boolean;
  output: string[];
  error?: string;
  uuid: string;
  session_id: string;
}

/** Rate limit event */
export interface SDKRateLimitEvent {
  type: 'rate_limit_event';
  rate_limit_info: {
    status: 'allowed' | 'allowed_warning' | 'rejected';
    resetsAt?: number;
    rateLimitType?: string;
    utilization?: number;
    overageStatus?: 'allowed' | 'allowed_warning' | 'rejected';
    overageResetsAt?: number;
    overageDisabledReason?: string;
    isUsingOverage?: boolean;
    surpassedThreshold?: number;
  };
  uuid: string;
  session_id: string;
}

/** Prompt suggestion from AI */
export interface SDKPromptSuggestionMessage {
  type: 'prompt_suggestion';
  suggestion: string;
  uuid: string;
  session_id: string;
}

// ============================================================================
// System Messages (type: 'system', discriminated by subtype)
// ============================================================================

/** Session init system message */
export interface SDKSystemInitMessage {
  type: 'system';
  subtype: 'init';
  agents?: string[];
  apiKeySource: ApiKeySource;
  betas?: string[];
  claude_code_version: string;
  cwd: string;
  tools: string[];
  mcp_servers: Array<{ name: string; status: string }>;
  model: string;
  permissionMode: PermissionMode;
  slash_commands: string[];
  output_style: string;
  skills: string[];
  plugins: Array<{ name: string; path: string; source?: string }>;
  fast_mode_state?: FastModeState;
  uuid: string;
  session_id: string;
}

/** Status update */
export interface SDKStatusMessage {
  type: 'system';
  subtype: 'status';
  status: 'compacting' | null;
  permissionMode?: PermissionMode;
  uuid: string;
  session_id: string;
}

/** Context compaction boundary */
export interface SDKCompactBoundaryMessage {
  type: 'system';
  subtype: 'compact_boundary';
  compact_metadata: {
    trigger: 'manual' | 'auto';
    pre_tokens: number;
    preserved_segment?: {
      head_uuid: string;
      anchor_uuid: string;
      tail_uuid: string;
    };
  };
  uuid: string;
  session_id: string;
}

/** API retry event */
export interface SDKAPIRetryMessage {
  type: 'system';
  subtype: 'api_retry';
  attempt: number;
  max_retries: number;
  retry_delay_ms: number;
  error_status: number | null;
  error: AssistantMessageError;
  uuid: string;
  session_id: string;
}

/** Local command output */
export interface SDKLocalCommandOutputMessage {
  type: 'system';
  subtype: 'local_command_output';
  content: string;
  uuid: string;
  session_id: string;
}

/** Hook started */
export interface SDKHookStartedMessage {
  type: 'system';
  subtype: 'hook_started';
  hook_id: string;
  hook_name: string;
  hook_event: string;
  uuid: string;
  session_id: string;
}

/** Hook progress */
export interface SDKHookProgressMessage {
  type: 'system';
  subtype: 'hook_progress';
  hook_id: string;
  hook_name: string;
  hook_event: string;
  stdout: string;
  stderr: string;
  output: string;
  uuid: string;
  session_id: string;
}

/** Hook response */
export interface SDKHookResponseMessage {
  type: 'system';
  subtype: 'hook_response';
  hook_id: string;
  hook_name: string;
  hook_event: string;
  output: string;
  stdout: string;
  stderr: string;
  exit_code?: number;
  outcome: 'success' | 'error' | 'cancelled';
  uuid: string;
  session_id: string;
}

/** Session state changed */
export interface SDKSessionStateChangedMessage {
  type: 'system';
  subtype: 'session_state_changed';
  state: 'idle' | 'running' | 'requires_action';
  uuid: string;
  session_id: string;
}

/** Files persisted event */
export interface SDKFilesPersistedEvent {
  type: 'system';
  subtype: 'files_persisted';
  files: Array<{ filename: string; file_id: string }>;
  failed: Array<{ filename: string; error: string }>;
  processed_at: string;
  uuid: string;
  session_id: string;
}

/** Task notification */
export interface SDKTaskNotificationMessage {
  type: 'system';
  subtype: 'task_notification';
  task_id: string;
  tool_use_id?: string;
  status: 'completed' | 'failed' | 'stopped';
  output_file: string;
  summary: string;
  usage?: { total_tokens: number; tool_uses: number; duration_ms: number };
  uuid: string;
  session_id: string;
}

/** Task started */
export interface SDKTaskStartedMessage {
  type: 'system';
  subtype: 'task_started';
  task_id: string;
  tool_use_id?: string;
  description: string;
  task_type?: string;
  workflow_name?: string;
  prompt?: string;
  uuid: string;
  session_id: string;
}

/** Task progress */
export interface SDKTaskProgressMessage {
  type: 'system';
  subtype: 'task_progress';
  task_id: string;
  tool_use_id?: string;
  description: string;
  usage: { total_tokens: number; tool_uses: number; duration_ms: number };
  last_tool_name?: string;
  summary?: string;
  uuid: string;
  session_id: string;
}

/** Elicitation complete */
export interface SDKElicitationCompleteMessage {
  type: 'system';
  subtype: 'elicitation_complete';
  mcp_server_name: string;
  elicitation_id: string;
  uuid: string;
  session_id: string;
}

/** Post-turn summary (background agent progress) */
export interface SDKPostTurnSummaryMessage {
  type: 'system';
  subtype: 'post_turn_summary';
  summarizes_uuid: string;
  status_category: 'blocked' | 'waiting' | 'completed' | 'review_ready' | 'failed';
  status_detail: string;
  is_noteworthy: boolean;
  title: string;
  description: string;
  recent_action: string;
  needs_action: string;
  artifact_urls: string[];
  uuid: string;
  session_id: string;
}

/** Union of all system message subtypes */
export type SDKSystemMessage =
  | SDKSystemInitMessage
  | SDKStatusMessage
  | SDKCompactBoundaryMessage
  | SDKAPIRetryMessage
  | SDKLocalCommandOutputMessage
  | SDKHookStartedMessage
  | SDKHookProgressMessage
  | SDKHookResponseMessage
  | SDKSessionStateChangedMessage
  | SDKFilesPersistedEvent
  | SDKTaskNotificationMessage
  | SDKTaskStartedMessage
  | SDKTaskProgressMessage
  | SDKElicitationCompleteMessage
  | SDKPostTurnSummaryMessage;

// ============================================================================
// Streamlined Messages (internal, for agent progress summaries)
// ============================================================================

export interface SDKStreamlinedTextMessage {
  type: 'streamlined_text';
  text: string;
  session_id: string;
  uuid: string;
}

export interface SDKStreamlinedToolUseSummaryMessage {
  type: 'streamlined_tool_use_summary';
  tool_summary: string;
  session_id: string;
  uuid: string;
}

// ============================================================================
// Control Messages (see protocol.ts for full details)
// ============================================================================

// Forward declaration — full types in protocol.ts
export interface SDKControlResponse {
  type: 'control_response';
  response: ControlResponseSuccess | ControlResponseError;
}

export interface ControlResponseSuccess {
  subtype: 'success';
  request_id: string;
  response?: Record<string, unknown>;
}

export interface ControlResponseError {
  subtype: 'error';
  request_id: string;
  error: string;
  pending_permission_requests?: SDKControlRequest[];
}

export interface SDKControlRequest {
  type: 'control_request';
  request_id: string;
  request: ControlRequestInner;
}

export interface SDKControlCancelRequest {
  type: 'control_cancel_request';
  request_id: string;
}

export interface SDKKeepAliveMessage {
  type: 'keep_alive';
}

// ============================================================================
// Control Request Inner Types (subtypes the CLI sends TO the extension)
// ============================================================================

export interface ControlRequestPermission {
  subtype: 'can_use_tool';
  tool_name: string;
  input: Record<string, unknown>;
  permission_suggestions?: PermissionUpdate[];
  blocked_path?: string;
  decision_reason?: string;
  title?: string;
  display_name?: string;
  tool_use_id: string;
  agent_id?: string;
  description?: string;
}

export interface ControlRequestElicitation {
  subtype: 'elicitation';
  mcp_server_name: string;
  message: string;
  mode?: 'form' | 'url';
  url?: string;
  elicitation_id?: string;
  requested_schema?: Record<string, unknown>;
}

export interface ControlRequestHookCallback {
  subtype: 'hook_callback';
  callback_id: string;
  input: unknown; // HookInput union
  tool_use_id?: string;
}

export interface ControlRequestMcpMessage {
  subtype: 'mcp_message';
  server_name: string;
  message: unknown; // JSON-RPC message
}

export interface ControlRequestSetPermissionMode {
  subtype: 'set_permission_mode';
  mode: PermissionMode;
  ultraplan?: boolean;
}

/** Union of control_request subtypes that the CLI sends to the extension */
export type ControlRequestInner =
  | ControlRequestPermission
  | ControlRequestElicitation
  | ControlRequestHookCallback
  | ControlRequestMcpMessage
  | ControlRequestSetPermissionMode;

// ============================================================================
// Aggregate Message Types (mirror StdoutMessageSchema / StdinMessageSchema)
// ============================================================================

/**
 * StdoutMessage — all possible messages the CLI can write to stdout.
 * Discriminated by `type` field at top level.
 */
export type StdoutMessage =
  | SDKAssistantMessage
  | SDKUserMessage
  | SDKUserMessageReplay
  | SDKResultMessage
  | SDKSystemMessage
  | SDKPartialAssistantMessage
  | SDKToolProgressMessage
  | SDKToolUseSummaryMessage
  | SDKAuthStatusMessage
  | SDKRateLimitEvent
  | SDKPromptSuggestionMessage
  | SDKStreamlinedTextMessage
  | SDKStreamlinedToolUseSummaryMessage
  | SDKPostTurnSummaryMessage
  | SDKControlResponse
  | SDKControlRequest
  | SDKControlCancelRequest
  | SDKKeepAliveMessage;

/**
 * StdinMessage — all possible messages the extension can write to stdin.
 */
export type StdinMessage =
  | SDKUserMessage
  | SDKControlRequest
  | SDKControlResponse
  | SDKKeepAliveMessage
  | SDKUpdateEnvironmentVariablesMessage;

export interface SDKUpdateEnvironmentVariablesMessage {
  type: 'update_environment_variables';
  variables: Record<string, string>;
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd /Users/harshagarwal/Documents/workspace/openclaude-vscode && npx tsc --noEmit --strict src/types/messages.ts 2>&1 | head -20`

Expected: No errors

- [ ] **Step 3: Commit**

```bash
cd /Users/harshagarwal/Documents/workspace/openclaude-vscode
git add src/types/messages.ts
git commit -m "feat: add TypeScript types for all StdoutMessage and StdinMessage variants"
```

---

## Task 4: TypeScript Type Definitions — Protocol Types

**Files:**
- Create: `src/types/protocol.ts`

These types represent the control request/response envelopes, initialize request/response, and all control_request subtypes the extension can send TO the CLI.

- [ ] **Step 1: Create src/types/protocol.ts**

```typescript
// src/types/protocol.ts
// Control protocol types — initialize handshake, control request/response
// envelopes, and all control_request subtypes the extension sends TO the CLI.

import type {
  AccountInfo,
  AgentDefinition,
  AgentInfo,
  FastModeState,
  HookCallbackMatcher,
  HookEvent,
  McpServerConfigForProcessTransport,
  McpServerStatus,
  ModelInfo,
  PermissionMode,
  SlashCommand,
} from './session';

// ============================================================================
// Initialize Handshake
// ============================================================================

/** Sent by extension to CLI immediately after spawn */
export interface InitializeRequest {
  subtype: 'initialize';
  hooks?: Record<string, HookCallbackMatcher[]>;
  sdkMcpServers?: string[];
  jsonSchema?: Record<string, unknown>;
  systemPrompt?: string;
  appendSystemPrompt?: string;
  agents?: Record<string, AgentDefinition>;
  promptSuggestions?: boolean;
  agentProgressSummaries?: boolean;
}

/** Returned by CLI in control_response after initialize */
export interface InitializeResponse {
  commands: SlashCommand[];
  agents: AgentInfo[];
  output_style: string;
  available_output_styles: string[];
  models: ModelInfo[];
  account: AccountInfo;
  pid?: number;
  fast_mode_state?: FastModeState;
}

// ============================================================================
// Control Request Subtypes (Extension → CLI)
// ============================================================================

export interface InterruptRequest {
  subtype: 'interrupt';
}

export interface SetPermissionModeRequest {
  subtype: 'set_permission_mode';
  mode: PermissionMode;
  ultraplan?: boolean;
}

export interface SetModelRequest {
  subtype: 'set_model';
  model?: string;
}

export interface SetMaxThinkingTokensRequest {
  subtype: 'set_max_thinking_tokens';
  max_thinking_tokens: number | null;
}

export interface McpStatusRequest {
  subtype: 'mcp_status';
}

export interface McpStatusResponse {
  mcpServers: McpServerStatus[];
}

export interface GetContextUsageRequest {
  subtype: 'get_context_usage';
}

export interface GetContextUsageResponse {
  categories: Array<{
    name: string;
    tokens: number;
    color: string;
    isDeferred?: boolean;
  }>;
  totalTokens: number;
  maxTokens: number;
  rawMaxTokens: number;
  percentage: number;
  gridRows: Array<
    Array<{
      color: string;
      isFilled: boolean;
      categoryName: string;
      tokens: number;
      percentage: number;
      squareFullness: number;
    }>
  >;
  model: string;
  memoryFiles: Array<{ path: string; type: string; tokens: number }>;
  mcpTools: Array<{
    name: string;
    serverName: string;
    tokens: number;
    isLoaded?: boolean;
  }>;
  deferredBuiltinTools?: Array<{
    name: string;
    tokens: number;
    isLoaded: boolean;
  }>;
  systemTools?: Array<{ name: string; tokens: number }>;
  systemPromptSections?: Array<{ name: string; tokens: number }>;
  agents: Array<{ agentType: string; source: string; tokens: number }>;
  slashCommands?: {
    totalCommands: number;
    includedCommands: number;
    tokens: number;
  };
  skills?: {
    totalSkills: number;
    includedSkills: number;
    tokens: number;
    skillFrontmatter: Array<{
      name: string;
      source: string;
      tokens: number;
    }>;
  };
  autoCompactThreshold?: number;
  isAutoCompactEnabled: boolean;
  messageBreakdown?: {
    toolCallTokens: number;
    toolResultTokens: number;
    attachmentTokens: number;
    assistantMessageTokens: number;
    userMessageTokens: number;
    toolCallsByType: Array<{
      name: string;
      callTokens: number;
      resultTokens: number;
    }>;
    attachmentsByType: Array<{ name: string; tokens: number }>;
  };
  apiUsage: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens: number;
    cache_read_input_tokens: number;
  } | null;
}

export interface RewindFilesRequest {
  subtype: 'rewind_files';
  user_message_id: string;
  dry_run?: boolean;
}

export interface RewindFilesResponse {
  canRewind: boolean;
  error?: string;
  filesChanged?: string[];
  insertions?: number;
  deletions?: number;
}

export interface CancelAsyncMessageRequest {
  subtype: 'cancel_async_message';
  message_uuid: string;
}

export interface CancelAsyncMessageResponse {
  cancelled: boolean;
}

export interface SeedReadStateRequest {
  subtype: 'seed_read_state';
  path: string;
  mtime: number;
}

export interface McpSetServersRequest {
  subtype: 'mcp_set_servers';
  servers: Record<string, McpServerConfigForProcessTransport>;
}

export interface McpSetServersResponse {
  added: string[];
  removed: string[];
  errors: Record<string, string>;
}

export interface ReloadPluginsRequest {
  subtype: 'reload_plugins';
}

export interface ReloadPluginsResponse {
  commands: SlashCommand[];
  agents: AgentInfo[];
  plugins: Array<{ name: string; path: string; source?: string }>;
  mcpServers: McpServerStatus[];
  error_count: number;
}

export interface McpReconnectRequest {
  subtype: 'mcp_reconnect';
  serverName: string;
}

export interface McpToggleRequest {
  subtype: 'mcp_toggle';
  serverName: string;
  enabled: boolean;
}

export interface StopTaskRequest {
  subtype: 'stop_task';
  task_id: string;
}

export interface ApplyFlagSettingsRequest {
  subtype: 'apply_flag_settings';
  settings: Record<string, unknown>;
}

export interface GetSettingsRequest {
  subtype: 'get_settings';
}

export interface GetSettingsResponse {
  effective: Record<string, unknown>;
  sources: Array<{
    source:
      | 'userSettings'
      | 'projectSettings'
      | 'localSettings'
      | 'flagSettings'
      | 'policySettings';
    settings: Record<string, unknown>;
  }>;
  applied?: {
    model: string;
    effort: 'low' | 'medium' | 'high' | 'max' | null;
  };
}

export interface ElicitationResponse {
  action: 'accept' | 'decline' | 'cancel';
  content?: Record<string, unknown>;
}

/** Union of all control_request inner types the extension can send */
export type ExtensionControlRequestInner =
  | InitializeRequest
  | InterruptRequest
  | SetPermissionModeRequest
  | SetModelRequest
  | SetMaxThinkingTokensRequest
  | McpStatusRequest
  | GetContextUsageRequest
  | RewindFilesRequest
  | CancelAsyncMessageRequest
  | SeedReadStateRequest
  | McpSetServersRequest
  | ReloadPluginsRequest
  | McpReconnectRequest
  | McpToggleRequest
  | StopTaskRequest
  | ApplyFlagSettingsRequest
  | GetSettingsRequest;

// ============================================================================
// Control Request/Response Envelopes
// ============================================================================

/** Envelope for sending a control_request on stdin */
export interface ControlRequestEnvelope {
  type: 'control_request';
  request_id: string;
  request: ExtensionControlRequestInner;
}

/** Success response envelope */
export interface ControlResponseSuccessEnvelope {
  type: 'control_response';
  response: {
    subtype: 'success';
    request_id: string;
    response?: Record<string, unknown>;
  };
}

/** Error response envelope */
export interface ControlResponseErrorEnvelope {
  type: 'control_response';
  response: {
    subtype: 'error';
    request_id: string;
    error: string;
  };
}

export type ControlResponseEnvelope =
  | ControlResponseSuccessEnvelope
  | ControlResponseErrorEnvelope;
```

- [ ] **Step 2: Verify it compiles**

Run: `cd /Users/harshagarwal/Documents/workspace/openclaude-vscode && npx tsc --noEmit --strict src/types/protocol.ts 2>&1 | head -20`

Expected: No errors

- [ ] **Step 3: Create src/types/index.ts barrel export**

```typescript
// src/types/index.ts
export * from './session';
export * from './messages';
export * from './protocol';
```

- [ ] **Step 4: Commit**

```bash
cd /Users/harshagarwal/Documents/workspace/openclaude-vscode
git add src/types/protocol.ts src/types/index.ts
git commit -m "feat: add control protocol types and initialize handshake types"
```

---

## Task 5: NdjsonTransport — Failing Tests First

**Files:**
- Create: `test/unit/ndjsonTransport.test.ts`

Write tests FIRST (TDD). The transport must handle: complete lines, partial lines buffered across chunks, empty lines, unicode line separators (U+2028, U+2029), multiple messages in one chunk, JSON parse errors, and writing JSON+newline to a writable stream.

- [ ] **Step 1: Write failing tests for NdjsonTransport**

```typescript
// test/unit/ndjsonTransport.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PassThrough } from 'node:stream';
import { NdjsonTransport } from '../../src/process/ndjsonTransport';

describe('NdjsonTransport', () => {
  let stdout: PassThrough;
  let stdin: PassThrough;
  let transport: NdjsonTransport;

  beforeEach(() => {
    stdout = new PassThrough();
    stdin = new PassThrough();
    transport = new NdjsonTransport(stdout, stdin);
  });

  describe('reading (stdout parsing)', () => {
    it('should parse a complete JSON line', async () => {
      const messages: unknown[] = [];
      transport.onMessage((msg) => messages.push(msg));

      stdout.write('{"type":"keep_alive"}\n');

      // Give the readline a tick to process
      await new Promise((r) => setTimeout(r, 10));
      expect(messages).toEqual([{ type: 'keep_alive' }]);
    });

    it('should handle partial lines buffered across chunks', async () => {
      const messages: unknown[] = [];
      transport.onMessage((msg) => messages.push(msg));

      stdout.write('{"type":');
      stdout.write('"assistant"}\n');

      await new Promise((r) => setTimeout(r, 10));
      expect(messages).toEqual([{ type: 'assistant' }]);
    });

    it('should handle multiple messages in one chunk', async () => {
      const messages: unknown[] = [];
      transport.onMessage((msg) => messages.push(msg));

      stdout.write('{"type":"keep_alive"}\n{"type":"result","subtype":"success"}\n');

      await new Promise((r) => setTimeout(r, 10));
      expect(messages).toHaveLength(2);
      expect(messages[0]).toEqual({ type: 'keep_alive' });
      expect(messages[1]).toEqual({ type: 'result', subtype: 'success' });
    });

    it('should skip empty lines', async () => {
      const messages: unknown[] = [];
      transport.onMessage((msg) => messages.push(msg));

      stdout.write('\n\n{"type":"keep_alive"}\n\n');

      await new Promise((r) => setTimeout(r, 10));
      expect(messages).toEqual([{ type: 'keep_alive' }]);
    });

    it('should skip whitespace-only lines', async () => {
      const messages: unknown[] = [];
      transport.onMessage((msg) => messages.push(msg));

      stdout.write('   \n{"type":"keep_alive"}\n  \t  \n');

      await new Promise((r) => setTimeout(r, 10));
      expect(messages).toEqual([{ type: 'keep_alive' }]);
    });

    it('should emit error on invalid JSON', async () => {
      const messages: unknown[] = [];
      const errors: Error[] = [];
      transport.onMessage((msg) => messages.push(msg));
      transport.onError((err) => errors.push(err));

      stdout.write('not valid json\n');

      await new Promise((r) => setTimeout(r, 10));
      expect(messages).toHaveLength(0);
      expect(errors).toHaveLength(1);
      expect(errors[0].message).toContain('not valid json');
    });

    it('should handle unicode line separators U+2028 and U+2029 in values', async () => {
      const messages: unknown[] = [];
      transport.onMessage((msg) => messages.push(msg));

      // JSON with escaped unicode line separators inside string values
      // These should NOT split the line — they are inside the JSON string
      stdout.write('{"type":"assistant","text":"hello\\u2028world"}\n');

      await new Promise((r) => setTimeout(r, 10));
      expect(messages).toHaveLength(1);
      expect((messages[0] as Record<string, unknown>).text).toBe('hello\u2028world');
    });

    it('should handle large JSON objects', async () => {
      const messages: unknown[] = [];
      transport.onMessage((msg) => messages.push(msg));

      const largeContent = 'x'.repeat(100_000);
      stdout.write(`{"type":"assistant","content":"${largeContent}"}\n`);

      await new Promise((r) => setTimeout(r, 50));
      expect(messages).toHaveLength(1);
      expect((messages[0] as Record<string, unknown>).content).toBe(largeContent);
    });

    it('should handle stream close gracefully', async () => {
      const closeFn = vi.fn();
      transport.onClose(closeFn);

      stdout.end();

      await new Promise((r) => setTimeout(r, 10));
      expect(closeFn).toHaveBeenCalled();
    });
  });

  describe('writing (stdin)', () => {
    it('should write JSON followed by newline', () => {
      const chunks: Buffer[] = [];
      stdin.on('data', (chunk) => chunks.push(chunk));

      transport.write({ type: 'keep_alive' });

      const written = Buffer.concat(chunks).toString();
      expect(written).toBe('{"type":"keep_alive"}\n');
    });

    it('should write complex objects correctly', () => {
      const chunks: Buffer[] = [];
      stdin.on('data', (chunk) => chunks.push(chunk));

      transport.write({
        type: 'control_request',
        request_id: 'init-001',
        request: {
          subtype: 'initialize',
          hooks: {},
          promptSuggestions: true,
        },
      });

      const written = Buffer.concat(chunks).toString();
      const parsed = JSON.parse(written.trimEnd());
      expect(parsed.type).toBe('control_request');
      expect(parsed.request_id).toBe('init-001');
      expect(parsed.request.subtype).toBe('initialize');
    });

    it('should handle unicode in written values', () => {
      const chunks: Buffer[] = [];
      stdin.on('data', (chunk) => chunks.push(chunk));

      transport.write({ type: 'user', message: 'hello \u2028 world' });

      const written = Buffer.concat(chunks).toString();
      // JSON.stringify escapes U+2028 in strings
      expect(written).toContain('hello');
      expect(written.endsWith('\n')).toBe(true);
    });
  });

  describe('dispose', () => {
    it('should clean up listeners on dispose', () => {
      transport.dispose();
      // Should not throw when writing after dispose
      expect(() => transport.write({ type: 'keep_alive' })).not.toThrow();
    });
  });
});
```

- [ ] **Step 2: Run tests — they should all FAIL (module not found)**

Run: `cd /Users/harshagarwal/Documents/workspace/openclaude-vscode && npx vitest run test/unit/ndjsonTransport.test.ts 2>&1 | tail -20`

Expected: `Error: Cannot find module '../../src/process/ndjsonTransport'` or similar

- [ ] **Step 3: Commit the failing tests**

```bash
cd /Users/harshagarwal/Documents/workspace/openclaude-vscode
git add test/unit/ndjsonTransport.test.ts
git commit -m "test: add failing tests for NdjsonTransport (TDD red phase)"
```

---

## Task 6: NdjsonTransport — Implementation

**Files:**
- Create: `src/process/ndjsonTransport.ts`

Line-buffered NDJSON parser using Node.js `readline.createInterface` on the stdout readable stream. Writer serializes JSON + `\n` to the stdin writable stream. Pattern extracted from Claude Code extension's `readMessages` generator (line 142 of extension.js: `du.createInterface({input:this.processStdout})` with `Xq(V)` JSON parse).

- [ ] **Step 1: Create src/process/ndjsonTransport.ts**

```typescript
// src/process/ndjsonTransport.ts
// Line-buffered NDJSON transport for communication with the OpenClaude CLI.
// Reads line-delimited JSON from a readable stream (CLI stdout).
// Writes JSON + newline to a writable stream (CLI stdin).

import * as readline from 'node:readline';
import type { Readable, Writable } from 'node:stream';

type MessageCallback = (message: unknown) => void;
type ErrorCallback = (error: Error) => void;
type CloseCallback = () => void;

export class NdjsonTransport {
  private readonly rl: readline.Interface;
  private readonly stdinStream: Writable | undefined;
  private messageCallbacks: MessageCallback[] = [];
  private errorCallbacks: ErrorCallback[] = [];
  private closeCallbacks: CloseCallback[] = [];
  private disposed = false;

  constructor(stdout: Readable, stdin?: Writable) {
    this.stdinStream = stdin;

    // Use readline to get line-buffered parsing.
    // This handles partial chunks automatically — readline only emits
    // complete lines (delimited by \n).
    this.rl = readline.createInterface({
      input: stdout,
      crlfDelay: Infinity, // Treat \r\n as single line break
    });

    this.rl.on('line', (line: string) => {
      this.handleLine(line);
    });

    this.rl.on('close', () => {
      for (const cb of this.closeCallbacks) {
        cb();
      }
    });

    this.rl.on('error', (err: Error) => {
      for (const cb of this.errorCallbacks) {
        cb(err);
      }
    });
  }

  private handleLine(line: string): void {
    const trimmed = line.trim();
    if (trimmed.length === 0) {
      return; // Skip empty/whitespace-only lines
    }

    try {
      const parsed = JSON.parse(trimmed);
      for (const cb of this.messageCallbacks) {
        cb(parsed);
      }
    } catch (err) {
      const error = new Error(
        `Failed to parse NDJSON line: ${trimmed.substring(0, 200)}${trimmed.length > 200 ? '...' : ''}`,
      );
      for (const cb of this.errorCallbacks) {
        cb(error);
      }
    }
  }

  /**
   * Register a callback for parsed messages from stdout.
   */
  onMessage(callback: MessageCallback): void {
    this.messageCallbacks.push(callback);
  }

  /**
   * Register a callback for parse errors.
   */
  onError(callback: ErrorCallback): void {
    this.errorCallbacks.push(callback);
  }

  /**
   * Register a callback for when the stdout stream closes.
   */
  onClose(callback: CloseCallback): void {
    this.closeCallbacks.push(callback);
  }

  /**
   * Write a JSON message to stdin, followed by a newline.
   */
  write(message: unknown): void {
    if (this.disposed || !this.stdinStream) {
      return;
    }

    const serialized = JSON.stringify(message) + '\n';
    this.stdinStream.write(serialized);
  }

  /**
   * End the stdin stream (signals CLI to exit gracefully).
   */
  endInput(): void {
    if (this.stdinStream) {
      this.stdinStream.end();
    }
  }

  /**
   * Clean up all resources.
   */
  dispose(): void {
    this.disposed = true;
    this.rl.close();
    this.messageCallbacks = [];
    this.errorCallbacks = [];
    this.closeCallbacks = [];
  }
}
```

- [ ] **Step 2: Run the tests — they should all PASS**

Run: `cd /Users/harshagarwal/Documents/workspace/openclaude-vscode && npx vitest run test/unit/ndjsonTransport.test.ts 2>&1`

Expected: All tests pass (12/12 or similar)

```
 ✓ test/unit/ndjsonTransport.test.ts (12)
   ✓ NdjsonTransport > reading (stdout parsing) > should parse a complete JSON line
   ✓ NdjsonTransport > reading (stdout parsing) > should handle partial lines buffered across chunks
   ...
```

- [ ] **Step 3: Commit**

```bash
cd /Users/harshagarwal/Documents/workspace/openclaude-vscode
git add src/process/ndjsonTransport.ts
git commit -m "feat: implement NdjsonTransport with line-buffered NDJSON parsing"
```

---

## Task 7: ControlRouter — Failing Tests First

**Files:**
- Create: `test/unit/controlRouter.test.ts`

The ControlRouter receives parsed `control_request` messages from stdout and dispatches them to registered handlers based on `request.subtype`. It also handles `control_cancel_request` to abort in-flight handlers. It sends `control_response` (success or error) back through the transport.

- [ ] **Step 1: Write failing tests for ControlRouter**

```typescript
// test/unit/controlRouter.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ControlRouter } from '../../src/process/controlRouter';
import type { SDKControlRequest, SDKControlCancelRequest } from '../../src/types/messages';

describe('ControlRouter', () => {
  let writeFn: ReturnType<typeof vi.fn>;
  let router: ControlRouter;

  beforeEach(() => {
    writeFn = vi.fn();
    router = new ControlRouter(writeFn);
  });

  it('should route can_use_tool requests to the registered handler', async () => {
    const handler = vi.fn().mockResolvedValue({ behavior: 'allow' });
    router.registerHandler('can_use_tool', handler);

    const request: SDKControlRequest = {
      type: 'control_request',
      request_id: 'req-001',
      request: {
        subtype: 'can_use_tool',
        tool_name: 'Bash',
        input: { command: 'ls' },
        tool_use_id: 'tu-001',
      },
    };

    await router.handleControlRequest(request);

    expect(handler).toHaveBeenCalledWith(
      request.request,
      expect.any(AbortSignal),
    );

    // Should have written a success response
    expect(writeFn).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'control_response',
        response: expect.objectContaining({
          subtype: 'success',
          request_id: 'req-001',
          response: { behavior: 'allow' },
        }),
      }),
    );
  });

  it('should route elicitation requests to the registered handler', async () => {
    const handler = vi.fn().mockResolvedValue({ action: 'accept', content: { answer: 'yes' } });
    router.registerHandler('elicitation', handler);

    const request: SDKControlRequest = {
      type: 'control_request',
      request_id: 'req-002',
      request: {
        subtype: 'elicitation',
        mcp_server_name: 'my-mcp',
        message: 'Do you want to proceed?',
      },
    };

    await router.handleControlRequest(request);

    expect(handler).toHaveBeenCalled();
    expect(writeFn).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'control_response',
        response: expect.objectContaining({
          subtype: 'success',
          request_id: 'req-002',
        }),
      }),
    );
  });

  it('should send error response when no handler is registered', async () => {
    const request: SDKControlRequest = {
      type: 'control_request',
      request_id: 'req-003',
      request: {
        subtype: 'can_use_tool',
        tool_name: 'Bash',
        input: { command: 'rm -rf /' },
        tool_use_id: 'tu-002',
      },
    };

    await router.handleControlRequest(request);

    expect(writeFn).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'control_response',
        response: expect.objectContaining({
          subtype: 'error',
          request_id: 'req-003',
          error: expect.stringContaining('No handler registered'),
        }),
      }),
    );
  });

  it('should send error response when handler throws', async () => {
    const handler = vi.fn().mockRejectedValue(new Error('Permission denied by user'));
    router.registerHandler('can_use_tool', handler);

    const request: SDKControlRequest = {
      type: 'control_request',
      request_id: 'req-004',
      request: {
        subtype: 'can_use_tool',
        tool_name: 'Bash',
        input: { command: 'ls' },
        tool_use_id: 'tu-003',
      },
    };

    await router.handleControlRequest(request);

    expect(writeFn).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'control_response',
        response: expect.objectContaining({
          subtype: 'error',
          request_id: 'req-004',
          error: 'Permission denied by user',
        }),
      }),
    );
  });

  it('should abort handler when cancel request arrives', async () => {
    let capturedSignal: AbortSignal | undefined;
    const handler = vi.fn().mockImplementation(async (_req, signal) => {
      capturedSignal = signal;
      // Simulate a long-running handler
      await new Promise((resolve) => setTimeout(resolve, 5000));
      return { behavior: 'allow' };
    });
    router.registerHandler('can_use_tool', handler);

    const request: SDKControlRequest = {
      type: 'control_request',
      request_id: 'req-005',
      request: {
        subtype: 'can_use_tool',
        tool_name: 'Bash',
        input: { command: 'ls' },
        tool_use_id: 'tu-004',
      },
    };

    // Start handling (don't await — it's long-running)
    const handlePromise = router.handleControlRequest(request);

    // Give it a tick to start
    await new Promise((r) => setTimeout(r, 10));

    // Cancel it
    const cancel: SDKControlCancelRequest = {
      type: 'control_cancel_request',
      request_id: 'req-005',
    };
    router.handleControlCancelRequest(cancel);

    expect(capturedSignal?.aborted).toBe(true);

    // Wait for the handle promise to settle
    await handlePromise;
  });

  it('should handle multiple concurrent requests', async () => {
    const handler = vi.fn().mockImplementation(async (req) => {
      return { handled: req.subtype };
    });
    router.registerHandler('can_use_tool', handler);

    const req1: SDKControlRequest = {
      type: 'control_request',
      request_id: 'req-a',
      request: {
        subtype: 'can_use_tool',
        tool_name: 'Read',
        input: { file: 'a.ts' },
        tool_use_id: 'tu-a',
      },
    };
    const req2: SDKControlRequest = {
      type: 'control_request',
      request_id: 'req-b',
      request: {
        subtype: 'can_use_tool',
        tool_name: 'Write',
        input: { file: 'b.ts' },
        tool_use_id: 'tu-b',
      },
    };

    await Promise.all([
      router.handleControlRequest(req1),
      router.handleControlRequest(req2),
    ]);

    expect(handler).toHaveBeenCalledTimes(2);
    expect(writeFn).toHaveBeenCalledTimes(2);

    // Verify each got its own response with correct request_id
    const calls = writeFn.mock.calls.map(
      (c: unknown[]) => (c[0] as { response: { request_id: string } }).response.request_id,
    );
    expect(calls).toContain('req-a');
    expect(calls).toContain('req-b');
  });

  it('should allow unregistering handlers', async () => {
    const handler = vi.fn().mockResolvedValue({ behavior: 'allow' });
    router.registerHandler('can_use_tool', handler);
    router.unregisterHandler('can_use_tool');

    const request: SDKControlRequest = {
      type: 'control_request',
      request_id: 'req-006',
      request: {
        subtype: 'can_use_tool',
        tool_name: 'Bash',
        input: { command: 'ls' },
        tool_use_id: 'tu-005',
      },
    };

    await router.handleControlRequest(request);

    expect(handler).not.toHaveBeenCalled();
    // Should get error response (no handler)
    expect(writeFn).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'control_response',
        response: expect.objectContaining({
          subtype: 'error',
        }),
      }),
    );
  });
});
```

- [ ] **Step 2: Run tests — should FAIL**

Run: `cd /Users/harshagarwal/Documents/workspace/openclaude-vscode && npx vitest run test/unit/controlRouter.test.ts 2>&1 | tail -10`

Expected: `Error: Cannot find module '../../src/process/controlRouter'`

- [ ] **Step 3: Commit**

```bash
cd /Users/harshagarwal/Documents/workspace/openclaude-vscode
git add test/unit/controlRouter.test.ts
git commit -m "test: add failing tests for ControlRouter (TDD red phase)"
```

---

## Task 8: ControlRouter — Implementation

**Files:**
- Create: `src/process/controlRouter.ts`

Routes incoming `control_request` messages to registered async handlers by `subtype`. Manages AbortControllers per request_id for cancellation. Sends `control_response` (success/error) back through a write function.

- [ ] **Step 1: Create src/process/controlRouter.ts**

```typescript
// src/process/controlRouter.ts
// Routes incoming control_request messages from the CLI to registered handlers.
// Manages AbortControllers per request for cancellation via control_cancel_request.

import type {
  ControlRequestInner,
  SDKControlCancelRequest,
  SDKControlRequest,
} from '../types/messages';

/** Handler function signature — receives the request inner and an abort signal */
export type ControlRequestHandler = (
  request: ControlRequestInner,
  signal: AbortSignal,
) => Promise<unknown>;

/** Function to write a message to the CLI's stdin */
export type WriteFn = (message: unknown) => void;

export class ControlRouter {
  private handlers = new Map<string, ControlRequestHandler>();
  private activeRequests = new Map<string, AbortController>();
  private writeFn: WriteFn;

  constructor(writeFn: WriteFn) {
    this.writeFn = writeFn;
  }

  /**
   * Register a handler for a specific control_request subtype.
   * Only one handler per subtype is allowed — later registrations replace earlier ones.
   */
  registerHandler(subtype: string, handler: ControlRequestHandler): void {
    this.handlers.set(subtype, handler);
  }

  /**
   * Unregister the handler for a subtype.
   */
  unregisterHandler(subtype: string): void {
    this.handlers.delete(subtype);
  }

  /**
   * Handle an incoming control_request from the CLI.
   * Dispatches to the registered handler, sends success or error response.
   */
  async handleControlRequest(request: SDKControlRequest): Promise<void> {
    const { request_id } = request;
    const subtype = request.request.subtype;
    const handler = this.handlers.get(subtype);

    if (!handler) {
      this.sendErrorResponse(
        request_id,
        `No handler registered for control_request subtype: ${subtype}`,
      );
      return;
    }

    const abortController = new AbortController();
    this.activeRequests.set(request_id, abortController);

    try {
      const result = await handler(request.request, abortController.signal);
      this.sendSuccessResponse(request_id, result as Record<string, unknown>);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : String(err);
      this.sendErrorResponse(request_id, message);
    } finally {
      this.activeRequests.delete(request_id);
    }
  }

  /**
   * Handle a control_cancel_request — aborts the in-flight handler for that request_id.
   */
  handleControlCancelRequest(cancel: SDKControlCancelRequest): void {
    const controller = this.activeRequests.get(cancel.request_id);
    if (controller) {
      controller.abort();
      this.activeRequests.delete(cancel.request_id);
    }
  }

  private sendSuccessResponse(
    requestId: string,
    response?: Record<string, unknown>,
  ): void {
    this.writeFn({
      type: 'control_response',
      response: {
        subtype: 'success',
        request_id: requestId,
        response,
      },
    });
  }

  private sendErrorResponse(requestId: string, error: string): void {
    this.writeFn({
      type: 'control_response',
      response: {
        subtype: 'error',
        request_id: requestId,
        error,
      },
    });
  }

  /**
   * Clean up all active requests.
   */
  dispose(): void {
    for (const controller of this.activeRequests.values()) {
      controller.abort();
    }
    this.activeRequests.clear();
    this.handlers.clear();
  }
}
```

- [ ] **Step 2: Run ControlRouter tests — should all PASS**

Run: `cd /Users/harshagarwal/Documents/workspace/openclaude-vscode && npx vitest run test/unit/controlRouter.test.ts 2>&1`

Expected: All tests pass (7/7 or similar)

```
 ✓ test/unit/controlRouter.test.ts (7)
   ✓ ControlRouter > should route can_use_tool requests to the registered handler
   ✓ ControlRouter > should route elicitation requests to the registered handler
   ...
```

- [ ] **Step 3: Commit**

```bash
cd /Users/harshagarwal/Documents/workspace/openclaude-vscode
git add src/process/controlRouter.ts
git commit -m "feat: implement ControlRouter for dispatching control_request subtypes"
```

---

## Task 9: ProcessManager — Failing Tests First

**Files:**
- Create: `test/unit/processManager.test.ts`

The ProcessManager spawns the `openclaude` CLI, wires up NdjsonTransport, performs the initialize handshake, handles crash recovery with `--resume`, and emits typed events.

- [ ] **Step 1: Write failing tests for ProcessManager**

```typescript
// test/unit/processManager.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter as NodeEventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';

// Mock child_process.spawn before importing ProcessManager
const mockSpawn = vi.fn();
vi.mock('node:child_process', () => ({
  spawn: (...args: unknown[]) => mockSpawn(...args),
}));

// Import after mocking
import { ProcessManager, ProcessState } from '../../src/process/processManager';

function createMockProcess(exitCode: number | null = null) {
  const proc = new NodeEventEmitter() as NodeEventEmitter & {
    stdin: PassThrough;
    stdout: PassThrough;
    stderr: PassThrough;
    pid: number;
    killed: boolean;
    kill: ReturnType<typeof vi.fn>;
    exitCode: number | null;
  };
  proc.stdin = new PassThrough();
  proc.stdout = new PassThrough();
  proc.stderr = new PassThrough();
  proc.pid = 12345;
  proc.killed = false;
  proc.exitCode = exitCode;
  proc.kill = vi.fn(() => {
    proc.killed = true;
    proc.emit('exit', 0, null);
  });
  return proc;
}

describe('ProcessManager', () => {
  let manager: ProcessManager;
  let mockProc: ReturnType<typeof createMockProcess>;

  beforeEach(() => {
    mockProc = createMockProcess();
    mockSpawn.mockReturnValue(mockProc);
    manager = new ProcessManager({
      cwd: '/tmp/test-project',
      executable: 'openclaude',
    });
  });

  afterEach(() => {
    manager.dispose();
    vi.clearAllMocks();
  });

  describe('spawn', () => {
    it('should spawn openclaude with correct flags', async () => {
      const spawnPromise = manager.spawn();

      // Simulate initialize response from CLI
      setTimeout(() => {
        mockProc.stdout.write(
          JSON.stringify({
            type: 'control_response',
            response: {
              subtype: 'success',
              request_id: expect.any(String),
              response: {
                commands: [],
                agents: [],
                output_style: 'concise',
                available_output_styles: ['concise', 'verbose'],
                models: [],
                account: {},
              },
            },
          }) + '\n',
        );
      }, 10);

      // Read what was written to stdin (the initialize request)
      const stdinChunks: Buffer[] = [];
      mockProc.stdin.on('data', (chunk: Buffer) => stdinChunks.push(chunk));

      // Wait a bit for the init request to be written
      await new Promise((r) => setTimeout(r, 50));

      expect(mockSpawn).toHaveBeenCalledWith(
        'openclaude',
        expect.arrayContaining([
          '--output-format',
          'stream-json',
          '--input-format',
          'stream-json',
          '--verbose',
        ]),
        expect.objectContaining({
          cwd: '/tmp/test-project',
          stdio: ['pipe', 'pipe', 'pipe'],
        }),
      );

      // Verify the initialize request was sent to stdin
      const written = Buffer.concat(stdinChunks).toString();
      if (written.length > 0) {
        const initReq = JSON.parse(written.trim());
        expect(initReq.type).toBe('control_request');
        expect(initReq.request.subtype).toBe('initialize');
      }
    });

    it('should pass environment variables from options', () => {
      manager = new ProcessManager({
        cwd: '/tmp/test-project',
        executable: 'openclaude',
        env: {
          OPENAI_API_KEY: 'sk-test',
          OPENAI_BASE_URL: 'http://localhost:11434/v1',
        },
      });

      manager.spawn();

      expect(mockSpawn).toHaveBeenCalledWith(
        'openclaude',
        expect.any(Array),
        expect.objectContaining({
          env: expect.objectContaining({
            OPENAI_API_KEY: 'sk-test',
            OPENAI_BASE_URL: 'http://localhost:11434/v1',
          }),
        }),
      );
    });

    it('should pass --model flag when model is specified', () => {
      manager = new ProcessManager({
        cwd: '/tmp/test-project',
        executable: 'openclaude',
        model: 'gpt-4o',
      });

      manager.spawn();

      expect(mockSpawn).toHaveBeenCalledWith(
        'openclaude',
        expect.arrayContaining(['--model', 'gpt-4o']),
        expect.any(Object),
      );
    });

    it('should pass --permission-mode flag when permissionMode is specified', () => {
      manager = new ProcessManager({
        cwd: '/tmp/test-project',
        executable: 'openclaude',
        permissionMode: 'plan',
      });

      manager.spawn();

      expect(mockSpawn).toHaveBeenCalledWith(
        'openclaude',
        expect.arrayContaining(['--permission-mode', 'plan']),
        expect.any(Object),
      );
    });

    it('should pass --resume flag when sessionId is specified', () => {
      manager = new ProcessManager({
        cwd: '/tmp/test-project',
        executable: 'openclaude',
        sessionId: 'abc-123',
      });

      manager.spawn();

      expect(mockSpawn).toHaveBeenCalledWith(
        'openclaude',
        expect.arrayContaining(['--resume', 'abc-123']),
        expect.any(Object),
      );
    });
  });

  describe('state management', () => {
    it('should start in idle state', () => {
      expect(manager.state).toBe(ProcessState.Idle);
    });

    it('should transition to spawning on spawn()', () => {
      manager.spawn();
      expect(manager.state).toBe(ProcessState.Spawning);
    });
  });

  describe('crash recovery', () => {
    it('should emit exit event on process exit with code 0', async () => {
      const exitFn = vi.fn();
      manager.onExit(exitFn);

      manager.spawn();
      mockProc.emit('exit', 0, null);

      await new Promise((r) => setTimeout(r, 10));
      expect(exitFn).toHaveBeenCalledWith(0, null);
    });

    it('should emit error event on process error', async () => {
      const errorFn = vi.fn();
      manager.onError(errorFn);

      manager.spawn();
      mockProc.emit('error', new Error('ENOENT: openclaude not found'));

      await new Promise((r) => setTimeout(r, 10));
      expect(errorFn).toHaveBeenCalledWith(
        expect.objectContaining({ message: expect.stringContaining('ENOENT') }),
      );
    });

    it('should capture stderr for debug logging', async () => {
      const stderrLines: string[] = [];
      manager.onStderr((line) => stderrLines.push(line));

      manager.spawn();
      mockProc.stderr.write('Debug: loading config\n');

      await new Promise((r) => setTimeout(r, 10));
      expect(stderrLines).toContain('Debug: loading config');
    });
  });

  describe('write', () => {
    it('should write messages to the transport', () => {
      manager.spawn();

      const stdinChunks: Buffer[] = [];
      mockProc.stdin.on('data', (chunk: Buffer) => stdinChunks.push(chunk));

      manager.write({ type: 'keep_alive' });

      const written = Buffer.concat(stdinChunks).toString();
      expect(written).toContain('"type":"keep_alive"');
    });
  });

  describe('kill', () => {
    it('should kill the child process', () => {
      manager.spawn();
      manager.kill();

      expect(mockProc.kill).toHaveBeenCalled();
    });

    it('should transition to idle state after kill', async () => {
      manager.spawn();
      manager.kill();

      await new Promise((r) => setTimeout(r, 10));
      expect(manager.state).toBe(ProcessState.Idle);
    });
  });

  describe('dispose', () => {
    it('should clean up all resources', () => {
      manager.spawn();
      manager.dispose();

      expect(mockProc.kill).toHaveBeenCalled();
      expect(manager.state).toBe(ProcessState.Idle);
    });
  });
});
```

- [ ] **Step 2: Run tests — should FAIL**

Run: `cd /Users/harshagarwal/Documents/workspace/openclaude-vscode && npx vitest run test/unit/processManager.test.ts 2>&1 | tail -10`

Expected: `Error: Cannot find module '../../src/process/processManager'`

- [ ] **Step 3: Commit**

```bash
cd /Users/harshagarwal/Documents/workspace/openclaude-vscode
git add test/unit/processManager.test.ts
git commit -m "test: add failing tests for ProcessManager (TDD red phase)"
```

---

## Task 10: ProcessManager — Implementation

**Files:**
- Create: `src/process/processManager.ts`

Spawns the `openclaude` CLI with the correct flags, wires up NdjsonTransport and ControlRouter, performs the initialize handshake, handles lifecycle events (crash, exit, error), and provides an EventEmitter-based API. Pattern extracted from Claude Code extension's `Qm` class (ProcessTransport) and `fm` class (Query).

- [ ] **Step 1: Create src/process/processManager.ts**

```typescript
// src/process/processManager.ts
// Spawns and manages the OpenClaude CLI child process.
// Wires NdjsonTransport for communication, ControlRouter for control_request dispatch.
// Performs the initialize handshake on spawn.
//
// Reference: Claude Code extension.js class `Qm` (ProcessTransport) and `fm` (Query)

import { spawn, type ChildProcess } from 'node:child_process';
import * as readline from 'node:readline';
import { NdjsonTransport } from './ndjsonTransport';
import { ControlRouter, type ControlRequestHandler } from './controlRouter';
import type { InitializeResponse } from '../types/protocol';
import type {
  SDKControlRequest,
  SDKControlCancelRequest,
  SDKKeepAliveMessage,
  StdoutMessage,
} from '../types/messages';
import type { PermissionMode } from '../types/session';

// ============================================================================
// Types
// ============================================================================

export enum ProcessState {
  Idle = 'idle',
  Spawning = 'spawning',
  Initializing = 'initializing',
  Ready = 'ready',
  Restarting = 'restarting',
}

export interface ProcessManagerOptions {
  /** Working directory for the CLI */
  cwd: string;
  /** Path to the openclaude executable (default: 'openclaude') */
  executable?: string;
  /** Model to use */
  model?: string;
  /** Permission mode */
  permissionMode?: PermissionMode;
  /** Session ID to resume */
  sessionId?: string;
  /** Continue last session */
  continueSession?: boolean;
  /** Additional environment variables */
  env?: Record<string, string>;
  /** Initialize request options */
  promptSuggestions?: boolean;
  agentProgressSummaries?: boolean;
  /** Auto-restart on crash */
  autoRestart?: boolean;
  /** Keep-alive interval in ms (default: 30000) */
  keepAliveIntervalMs?: number;
}

type MessageCallback = (message: StdoutMessage) => void;
type ErrorCallback = (error: Error) => void;
type ExitCallback = (code: number | null, signal: string | null) => void;
type StderrCallback = (line: string) => void;
type StateCallback = (state: ProcessState) => void;

// ============================================================================
// ProcessManager
// ============================================================================

export class ProcessManager {
  private options: ProcessManagerOptions;
  private process: ChildProcess | undefined;
  private transport: NdjsonTransport | undefined;
  private router: ControlRouter | undefined;
  private stderrRl: readline.Interface | undefined;
  private keepAliveTimer: ReturnType<typeof setInterval> | undefined;

  private _state: ProcessState = ProcessState.Idle;
  private _sessionId: string | undefined;
  private _initializeResponse: InitializeResponse | undefined;

  // Pending initialize handshake resolution
  private pendingInitResolve:
    | ((response: InitializeResponse) => void)
    | undefined;
  private pendingInitReject: ((error: Error) => void) | undefined;
  private initRequestId: string | undefined;

  // Callbacks
  private messageCallbacks: MessageCallback[] = [];
  private errorCallbacks: ErrorCallback[] = [];
  private exitCallbacks: ExitCallback[] = [];
  private stderrCallbacks: StderrCallback[] = [];
  private stateCallbacks: StateCallback[] = [];

  constructor(options: ProcessManagerOptions) {
    this.options = options;
  }

  // ============================================================================
  // Public API
  // ============================================================================

  get state(): ProcessState {
    return this._state;
  }

  get sessionId(): string | undefined {
    return this._sessionId;
  }

  get initializeResponse(): InitializeResponse | undefined {
    return this._initializeResponse;
  }

  /**
   * Spawn the CLI process and perform the initialize handshake.
   * Returns the InitializeResponse on success.
   */
  spawn(): Promise<InitializeResponse> | void {
    if (this._state !== ProcessState.Idle && this._state !== ProcessState.Restarting) {
      return;
    }

    this.setState(ProcessState.Spawning);

    const executable = this.options.executable ?? 'openclaude';
    const args = this.buildArgs();
    const env = this.buildEnv();

    try {
      this.process = spawn(executable, args, {
        cwd: this.options.cwd,
        stdio: ['pipe', 'pipe', 'pipe'],
        env,
        windowsHide: true,
      });
    } catch (err) {
      this.setState(ProcessState.Idle);
      const error =
        err instanceof Error ? err : new Error(String(err));
      this.emitError(error);
      return;
    }

    // Wire up transport
    if (this.process.stdout && this.process.stdin) {
      this.transport = new NdjsonTransport(
        this.process.stdout,
        this.process.stdin,
      );

      // Create router that writes through transport
      this.router = new ControlRouter((msg) => this.transport?.write(msg));

      // Handle parsed messages from stdout
      this.transport.onMessage((msg) => this.handleMessage(msg as StdoutMessage));
      this.transport.onError((err) => this.emitError(err));
      this.transport.onClose(() => {
        // Stream closed — process is exiting
      });
    }

    // Wire up stderr for debug logging
    if (this.process.stderr) {
      this.stderrRl = readline.createInterface({
        input: this.process.stderr,
      });
      this.stderrRl.on('line', (line) => {
        for (const cb of this.stderrCallbacks) {
          cb(line);
        }
      });
    }

    // Handle process lifecycle
    this.process.on('error', (err) => {
      this.setState(ProcessState.Idle);
      this.emitError(err);
      if (this.pendingInitReject) {
        this.pendingInitReject(err);
        this.pendingInitResolve = undefined;
        this.pendingInitReject = undefined;
      }
    });

    this.process.on('exit', (code, signal) => {
      this.cleanup();
      this.setState(ProcessState.Idle);

      for (const cb of this.exitCallbacks) {
        cb(code, signal);
      }

      // Auto-restart on non-zero exit if enabled
      if (
        this.options.autoRestart &&
        code !== 0 &&
        code !== null &&
        this._sessionId
      ) {
        this.restartWithResume();
      }
    });

    // Send initialize handshake
    this.setState(ProcessState.Initializing);
    return this.sendInitialize();
  }

  /**
   * Write a message to the CLI's stdin via the transport.
   */
  write(message: unknown): void {
    this.transport?.write(message);
  }

  /**
   * Send a control_request to the CLI and return a promise for the response.
   */
  async sendControlRequest(
    request: Record<string, unknown>,
  ): Promise<Record<string, unknown> | undefined> {
    const requestId = this.generateRequestId();
    const envelope = {
      type: 'control_request',
      request_id: requestId,
      request,
    };

    return new Promise((resolve, reject) => {
      // Store resolver indexed by request_id so handleMessage can resolve it
      this.pendingControlRequests.set(requestId, { resolve, reject });
      this.transport?.write(envelope);
    });
  }

  private pendingControlRequests = new Map<
    string,
    {
      resolve: (response: Record<string, unknown> | undefined) => void;
      reject: (error: Error) => void;
    }
  >();

  /**
   * Register a handler for an incoming control_request subtype from the CLI.
   */
  registerControlHandler(
    subtype: string,
    handler: ControlRequestHandler,
  ): void {
    this.router?.registerHandler(subtype, handler);
  }

  /**
   * Kill the CLI process.
   */
  kill(signal: NodeJS.Signals = 'SIGTERM'): void {
    if (this.process && !this.process.killed) {
      this.process.kill(signal);
    }
  }

  /**
   * Clean up all resources.
   */
  dispose(): void {
    this.stopKeepAlive();
    this.kill();
    this.transport?.dispose();
    this.router?.dispose();
    this.stderrRl?.close();
    this.messageCallbacks = [];
    this.errorCallbacks = [];
    this.exitCallbacks = [];
    this.stderrCallbacks = [];
    this.stateCallbacks = [];
  }

  // ============================================================================
  // Event Registration
  // ============================================================================

  onMessage(callback: MessageCallback): void {
    this.messageCallbacks.push(callback);
  }

  onError(callback: ErrorCallback): void {
    this.errorCallbacks.push(callback);
  }

  onExit(callback: ExitCallback): void {
    this.exitCallbacks.push(callback);
  }

  onStderr(callback: StderrCallback): void {
    this.stderrCallbacks.push(callback);
  }

  onStateChange(callback: StateCallback): void {
    this.stateCallbacks.push(callback);
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private buildArgs(): string[] {
    const args: string[] = [
      '--output-format',
      'stream-json',
      '--verbose',
      '--input-format',
      'stream-json',
    ];

    if (this.options.model) {
      args.push('--model', this.options.model);
    }

    if (this.options.permissionMode) {
      args.push('--permission-mode', this.options.permissionMode);
    }

    if (this.options.sessionId) {
      args.push('--resume', this.options.sessionId);
    }

    if (this.options.continueSession) {
      args.push('--continue');
    }

    return args;
  }

  private buildEnv(): NodeJS.ProcessEnv {
    const env: NodeJS.ProcessEnv = { ...process.env };

    // Merge custom env vars
    if (this.options.env) {
      Object.assign(env, this.options.env);
    }

    // Set entrypoint marker
    if (!env.CLAUDE_CODE_ENTRYPOINT) {
      env.CLAUDE_CODE_ENTRYPOINT = 'openclaude-vscode';
    }

    // Remove NODE_OPTIONS to avoid conflicts (pattern from Claude Code extension)
    delete env.NODE_OPTIONS;

    return env;
  }

  private sendInitialize(): Promise<InitializeResponse> {
    return new Promise<InitializeResponse>((resolve, reject) => {
      this.pendingInitResolve = resolve;
      this.pendingInitReject = reject;

      this.initRequestId = this.generateRequestId();

      const initRequest = {
        type: 'control_request',
        request_id: this.initRequestId,
        request: {
          subtype: 'initialize',
          hooks: {},
          sdkMcpServers: [],
          promptSuggestions: this.options.promptSuggestions ?? true,
          agentProgressSummaries: this.options.agentProgressSummaries ?? true,
        },
      };

      this.transport?.write(initRequest);
    });
  }

  private handleMessage(message: StdoutMessage): void {
    // Handle control_response (may be initialize response or response to our requests)
    if (message.type === 'control_response') {
      const response = message.response;
      const requestId = response.request_id;

      // Check if this is the initialize response
      if (requestId === this.initRequestId && this.pendingInitResolve) {
        if (response.subtype === 'success') {
          const initResponse = response.response as unknown as InitializeResponse;
          this._initializeResponse = initResponse;
          this._sessionId = (initResponse as Record<string, unknown>).pid
            ? undefined
            : undefined;
          this.setState(ProcessState.Ready);
          this.startKeepAlive();
          this.pendingInitResolve(initResponse);
        } else {
          this.pendingInitReject?.(
            new Error(`Initialize failed: ${response.error}`),
          );
        }
        this.pendingInitResolve = undefined;
        this.pendingInitReject = undefined;
        this.initRequestId = undefined;
        return;
      }

      // Check if it matches a pending control request
      const pending = this.pendingControlRequests.get(requestId);
      if (pending) {
        this.pendingControlRequests.delete(requestId);
        if (response.subtype === 'success') {
          pending.resolve(response.response);
        } else {
          pending.reject(new Error(response.error));
        }
        return;
      }
    }

    // Handle incoming control_request from CLI (permission, elicitation, etc.)
    if (message.type === 'control_request') {
      this.router?.handleControlRequest(message as SDKControlRequest);
      return;
    }

    // Handle cancel requests
    if (message.type === 'control_cancel_request') {
      this.router?.handleControlCancelRequest(
        message as SDKControlCancelRequest,
      );
      return;
    }

    // Handle keep_alive (no-op, just acknowledge receipt)
    if (message.type === 'keep_alive') {
      return;
    }

    // Extract session_id from messages that carry it
    if ('session_id' in message && typeof (message as Record<string, unknown>).session_id === 'string') {
      this._sessionId = (message as Record<string, unknown>).session_id as string;
    }

    // Forward all other messages to listeners
    for (const cb of this.messageCallbacks) {
      cb(message);
    }
  }

  private startKeepAlive(): void {
    const interval = this.options.keepAliveIntervalMs ?? 30_000;
    this.keepAliveTimer = setInterval(() => {
      this.transport?.write({ type: 'keep_alive' } satisfies SDKKeepAliveMessage);
    }, interval);
  }

  private stopKeepAlive(): void {
    if (this.keepAliveTimer) {
      clearInterval(this.keepAliveTimer);
      this.keepAliveTimer = undefined;
    }
  }

  private restartWithResume(): void {
    this.setState(ProcessState.Restarting);

    // Update options to resume the session
    if (this._sessionId) {
      this.options = { ...this.options, sessionId: this._sessionId };
    }

    // Delay slightly before restart to avoid tight restart loops
    setTimeout(() => {
      this.spawn();
    }, 1000);
  }

  private cleanup(): void {
    this.stopKeepAlive();
    this.transport?.dispose();
    this.transport = undefined;
    this.router?.dispose();
    this.router = undefined;
    this.stderrRl?.close();
    this.stderrRl = undefined;
    this.process = undefined;
  }

  private setState(state: ProcessState): void {
    this._state = state;
    for (const cb of this.stateCallbacks) {
      cb(state);
    }
  }

  private emitError(error: Error): void {
    for (const cb of this.errorCallbacks) {
      cb(error);
    }
  }

  private generateRequestId(): string {
    return Math.random().toString(36).substring(2, 15);
  }
}
```

- [ ] **Step 2: Run ProcessManager tests**

Run: `cd /Users/harshagarwal/Documents/workspace/openclaude-vscode && npx vitest run test/unit/processManager.test.ts 2>&1`

Expected: Most tests pass. Some may need adjustments based on exact mock wiring.

- [ ] **Step 3: Fix any failing tests, then re-run**

Run: `cd /Users/harshagarwal/Documents/workspace/openclaude-vscode && npx vitest run test/unit/processManager.test.ts 2>&1`

Expected: All tests pass

- [ ] **Step 4: Commit**

```bash
cd /Users/harshagarwal/Documents/workspace/openclaude-vscode
git add src/process/processManager.ts
git commit -m "feat: implement ProcessManager with spawn, lifecycle, and initialize handshake"
```

---

## Task 11: Run All Tests Together

Verify all three test files pass together.

- [ ] **Step 1: Run complete test suite**

Run: `cd /Users/harshagarwal/Documents/workspace/openclaude-vscode && npx vitest run 2>&1`

Expected:

```
 ✓ test/unit/ndjsonTransport.test.ts (12)
 ✓ test/unit/controlRouter.test.ts (7)
 ✓ test/unit/processManager.test.ts (8)

 Test Files  3 passed (3)
 Tests       27 passed (27)
```

- [ ] **Step 2: Run the extension build to make sure types and code compile together**

Run: `cd /Users/harshagarwal/Documents/workspace/openclaude-vscode && node esbuild.config.mjs 2>&1`

Expected: `Extension built successfully`

- [ ] **Step 3: Commit (if any fixes were needed)**

```bash
cd /Users/harshagarwal/Documents/workspace/openclaude-vscode
git add -A
git commit -m "fix: ensure all tests pass and build succeeds"
```

---

## Task 12: Wire ProcessManager into Extension Entry Point

**Files:**
- Modify: `src/extension.ts`

Connect ProcessManager to the extension lifecycle so it spawns on activation and disposes on deactivation.

- [ ] **Step 1: Update src/extension.ts to create ProcessManager**

Add the following imports and wiring to the existing `src/extension.ts`. The ProcessManager is instantiated but NOT auto-spawned — spawning happens when the user opens a panel (Story 3+). For now, register a test command that spawns it.

Add at the top:

```typescript
import { ProcessManager, ProcessState } from './process/processManager';
```

Inside `activate()`, after existing command registrations, add:

```typescript
  // ProcessManager — will be spawned when a chat panel opens
  let processManager: ProcessManager | undefined;

  // Register a debug command to test spawning
  const testSpawn = vscode.commands.registerCommand('openclaude.debug.testSpawn', async () => {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      vscode.window.showErrorMessage('OpenClaude: No workspace folder open');
      return;
    }

    const config = vscode.workspace.getConfiguration('openclaudeCode');
    const model = config.get<string>('selectedModel');
    const permissionMode = config.get<string>('initialPermissionMode') as
      | 'default'
      | 'acceptEdits'
      | 'plan'
      | 'bypassPermissions'
      | 'dontAsk'
      | undefined;

    // Build env vars from settings
    const envVarSettings = config.get<Array<{ name: string; value: string }>>(
      'environmentVariables',
      [],
    );
    const env: Record<string, string> = {};
    for (const { name, value } of envVarSettings) {
      env[name] = value;
    }

    processManager = new ProcessManager({
      cwd: workspaceFolder.uri.fsPath,
      model: model !== 'default' ? model : undefined,
      permissionMode,
      env,
    });

    processManager.onMessage((msg) => {
      console.log('[OpenClaude] Message:', JSON.stringify(msg).substring(0, 200));
    });

    processManager.onError((err) => {
      console.error('[OpenClaude] Error:', err.message);
      vscode.window.showErrorMessage(`OpenClaude CLI error: ${err.message}`);
    });

    processManager.onExit((code, signal) => {
      console.log(`[OpenClaude] CLI exited: code=${code}, signal=${signal}`);
    });

    processManager.onStateChange((state) => {
      console.log(`[OpenClaude] State: ${state}`);
    });

    try {
      const response = await processManager.spawn();
      if (response) {
        vscode.window.showInformationMessage(
          `OpenClaude connected! Models: ${response.models?.length ?? 0}, Commands: ${response.commands?.length ?? 0}`,
        );
      }
    } catch (err) {
      vscode.window.showErrorMessage(
        `OpenClaude failed to start: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  });

  context.subscriptions.push(testSpawn);

  // Dispose ProcessManager on extension deactivation
  context.subscriptions.push({
    dispose: () => {
      processManager?.dispose();
    },
  });
```

- [ ] **Step 2: Build the extension**

Run: `cd /Users/harshagarwal/Documents/workspace/openclaude-vscode && node esbuild.config.mjs 2>&1`

Expected: `Extension built successfully`

- [ ] **Step 3: Verify dist/extension.js contains ProcessManager code**

Run: `cd /Users/harshagarwal/Documents/workspace/openclaude-vscode && grep -c "ProcessManager\|NdjsonTransport\|ControlRouter" dist/extension.js`

Expected: Non-zero count (the classes are bundled)

- [ ] **Step 4: Commit**

```bash
cd /Users/harshagarwal/Documents/workspace/openclaude-vscode
git add src/extension.ts
git commit -m "feat: wire ProcessManager into extension entry point with debug spawn command"
```

---

## Task 13: Final Verification

- [ ] **Step 1: Run the complete test suite one last time**

Run: `cd /Users/harshagarwal/Documents/workspace/openclaude-vscode && npx vitest run 2>&1`

Expected: All tests pass

- [ ] **Step 2: Run the full build**

Run: `cd /Users/harshagarwal/Documents/workspace/openclaude-vscode && npm run build 2>&1`

Expected: Both extension and webview build successfully

- [ ] **Step 3: Verify the .vsix can be packaged**

Run: `cd /Users/harshagarwal/Documents/workspace/openclaude-vscode && npx @vscode/vsce package --no-dependencies 2>&1 | tail -5`

Expected: `.vsix` file created successfully

- [ ] **Step 4: Final commit with all files**

```bash
cd /Users/harshagarwal/Documents/workspace/openclaude-vscode
git add -A
git commit -m "feat: Story 2 complete — ProcessManager, NDJSON Transport, Initialize Handshake"
```

---

## Summary: Files Created

| File | Lines (est.) | Purpose |
|---|---|---|
| `vitest.config.ts` | 20 | Test runner configuration |
| `test/__mocks__/vscode.ts` | 60 | VS Code API mock for unit tests |
| `src/types/session.ts` | 250 | Session, model, permission, MCP, hook types |
| `src/types/messages.ts` | 450 | All StdoutMessage + StdinMessage variants |
| `src/types/protocol.ts` | 300 | Control request/response envelopes, initialize handshake |
| `src/types/index.ts` | 5 | Barrel export |
| `src/process/ndjsonTransport.ts` | 100 | Line-buffered NDJSON parser + writer |
| `src/process/processManager.ts` | 350 | CLI spawn, lifecycle, initialize handshake, keep-alive |
| `src/process/controlRouter.ts` | 100 | Route control_request subtypes to handlers |
| `test/unit/ndjsonTransport.test.ts` | 150 | 12 tests for NDJSON edge cases |
| `test/unit/processManager.test.ts` | 200 | 8 tests for ProcessManager spawn/crash/restart |
| `test/unit/controlRouter.test.ts` | 180 | 7 tests for ControlRouter dispatch |

**Total: ~2,165 lines across 12 files, 27 unit tests**
