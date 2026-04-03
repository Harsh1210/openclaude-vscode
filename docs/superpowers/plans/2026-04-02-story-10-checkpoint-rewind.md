# Story 10: Checkpoint/Rewind System — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Track assistant message UUIDs as checkpoint/rewind targets, render a hover UI on assistant messages with Fork/Rewind/Fork+Rewind actions, send `rewind_files` control requests to the CLI, and handle `files_persisted` and `session_state_changed` system messages to keep checkpoint state current.

**Architecture:** A host-side `CheckpointManager` registers assistant message UUIDs as rewind targets whenever the CLI emits assistant messages or `files_persisted` events. The webview renders a `CheckpointMarker` component on hover over assistant messages. User actions (fork, rewind, fork+rewind) are relayed via `postMessage` to the extension host, which translates them into CLI control requests (`rewind_files` with `user_message_id` and optional `dry_run`) or spawns a new CLI process with `--resume <uuid>` for fork. The CLI handles all file restoration server-side; the extension never touches files directly.

**Tech Stack:** TypeScript 5.x, VS Code Extension API, React 18, Tailwind CSS 3, Vitest

**Spec:** [2026-04-02-openclaude-vscode-extension-design.md](../specs/2026-04-02-openclaude-vscode-extension-design.md) — Story 10, Sections 2.2, 2.3.3, 3.1

**CLI Protocol Source:** `openclaude/src/entrypoints/sdk/controlSchemas.ts` — `SDKControlRewindFilesRequestSchema`, `SDKControlRewindFilesResponseSchema`

**Depends on:** Story 4 (chat UI with assistant message rendering), Story 2 (ProcessManager, NDJSON transport)

---

## File Structure

| File | Responsibility |
|---|---|
| `src/checkpoint/checkpointManager.ts` | Track rewind targets, build rewind/fork requests, handle system events |
| `test/unit/checkpointManager.test.ts` | Unit tests for CheckpointManager |
| `webview/src/components/chat/CheckpointMarker.tsx` | Hover UI with Fork/Rewind/Fork+Rewind buttons and dry-run preview |
| `src/webview/types.ts` | Add checkpoint-related postMessage types (modify existing) |
| `src/extension.ts` | Wire CheckpointManager between CLI events and webview (modify existing) |
| `src/process/processManager.ts` | Add `forkSession` option to `ProcessManagerOptions.buildArgs()` (modify existing) |

---

## Task 1: CheckpointManager — Tests First

**Files:**
- Create: `test/unit/checkpointManager.test.ts`

- [ ] **Step 1: Write failing tests for CheckpointManager**

```typescript
// test/unit/checkpointManager.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import {
  CheckpointManager,
  type CheckpointEntry,
  type RewindFilesRequest,
  type RewindFilesResponse,
} from '../../src/checkpoint/checkpointManager';

describe('CheckpointManager', () => {
  let manager: CheckpointManager;

  beforeEach(() => {
    manager = new CheckpointManager();
  });

  // =========================================================================
  // Registration
  // =========================================================================

  describe('registerAssistantMessage', () => {
    it('registers a message UUID as a checkpoint', () => {
      manager.registerAssistantMessage('msg-001', 'session-abc');
      const entry = manager.getCheckpoint('msg-001');
      expect(entry).toBeDefined();
      expect(entry!.messageUuid).toBe('msg-001');
      expect(entry!.sessionId).toBe('session-abc');
      expect(entry!.persistedFiles).toEqual([]);
    });

    it('does not duplicate when registered twice', () => {
      manager.registerAssistantMessage('msg-001', 'session-abc');
      manager.registerAssistantMessage('msg-001', 'session-abc');
      expect(manager.getAllCheckpoints()).toHaveLength(1);
    });

    it('tracks multiple messages in order', () => {
      manager.registerAssistantMessage('msg-001', 'session-abc');
      manager.registerAssistantMessage('msg-002', 'session-abc');
      manager.registerAssistantMessage('msg-003', 'session-abc');
      const all = manager.getAllCheckpoints();
      expect(all).toHaveLength(3);
      expect(all.map((c) => c.messageUuid)).toEqual(['msg-001', 'msg-002', 'msg-003']);
    });
  });

  // =========================================================================
  // files_persisted handling
  // =========================================================================

  describe('markFilesPersisted', () => {
    it('attaches file list to existing checkpoint', () => {
      manager.registerAssistantMessage('msg-001', 'session-abc');
      manager.markFilesPersisted('msg-001', [
        { filename: 'src/main.ts', file_id: 'f-1' },
        { filename: 'src/utils.ts', file_id: 'f-2' },
      ]);
      const entry = manager.getCheckpoint('msg-001');
      expect(entry!.persistedFiles).toHaveLength(2);
      expect(entry!.persistedFiles[0].filename).toBe('src/main.ts');
    });

    it('accumulates files across multiple persist events', () => {
      manager.registerAssistantMessage('msg-001', 'session-abc');
      manager.markFilesPersisted('msg-001', [{ filename: 'a.ts', file_id: 'f-1' }]);
      manager.markFilesPersisted('msg-001', [{ filename: 'b.ts', file_id: 'f-2' }]);
      expect(manager.getCheckpoint('msg-001')!.persistedFiles).toHaveLength(2);
    });

    it('no-ops if message UUID is unknown', () => {
      // Should not throw
      manager.markFilesPersisted('unknown-uuid', [{ filename: 'x.ts', file_id: 'f-x' }]);
      expect(manager.getCheckpoint('unknown-uuid')).toBeUndefined();
    });
  });

  // =========================================================================
  // session_state_changed handling
  // =========================================================================

  describe('handleSessionStateChanged', () => {
    it('updates session state on the latest checkpoint', () => {
      manager.registerAssistantMessage('msg-001', 'session-abc');
      manager.handleSessionStateChanged('idle', 'session-abc');
      const entry = manager.getCheckpoint('msg-001');
      expect(entry!.lastSessionState).toBe('idle');
    });

    it('updates only the latest checkpoint for the given session', () => {
      manager.registerAssistantMessage('msg-001', 'session-abc');
      manager.registerAssistantMessage('msg-002', 'session-abc');
      manager.handleSessionStateChanged('idle', 'session-abc');
      expect(manager.getCheckpoint('msg-001')!.lastSessionState).toBeUndefined();
      expect(manager.getCheckpoint('msg-002')!.lastSessionState).toBe('idle');
    });
  });

  // =========================================================================
  // Rewind request building
  // =========================================================================

  describe('buildRewindRequest', () => {
    it('builds a rewind_files control request', () => {
      manager.registerAssistantMessage('msg-001', 'session-abc');
      const req = manager.buildRewindRequest('msg-001');
      expect(req).toEqual({
        subtype: 'rewind_files',
        user_message_id: 'msg-001',
        dry_run: false,
      });
    });

    it('builds a dry_run rewind request', () => {
      manager.registerAssistantMessage('msg-001', 'session-abc');
      const req = manager.buildRewindRequest('msg-001', true);
      expect(req).toEqual({
        subtype: 'rewind_files',
        user_message_id: 'msg-001',
        dry_run: true,
      });
    });

    it('throws if message UUID is unknown', () => {
      expect(() => manager.buildRewindRequest('nonexistent')).toThrow(
        /no checkpoint found/i,
      );
    });
  });

  // =========================================================================
  // Fork request building
  // =========================================================================

  describe('buildForkOptions', () => {
    it('returns ProcessManagerOptions overrides for fork', () => {
      manager.registerAssistantMessage('msg-001', 'session-abc');
      const opts = manager.buildForkOptions('msg-001');
      expect(opts.sessionId).toBe('msg-001');
      expect(opts.forkSession).toBe(true);
    });

    it('throws if message UUID is unknown', () => {
      expect(() => manager.buildForkOptions('nonexistent')).toThrow(
        /no checkpoint found/i,
      );
    });
  });

  // =========================================================================
  // Serialization for webview
  // =========================================================================

  describe('getWebviewState', () => {
    it('returns serializable checkpoint summaries', () => {
      manager.registerAssistantMessage('msg-001', 'session-abc');
      manager.markFilesPersisted('msg-001', [{ filename: 'a.ts', file_id: 'f-1' }]);
      const state = manager.getWebviewState();
      expect(state).toHaveLength(1);
      expect(state[0].messageUuid).toBe('msg-001');
      expect(state[0].fileCount).toBe(1);
      expect(state[0].canRewind).toBe(true);
    });
  });

  // =========================================================================
  // Clear on new session
  // =========================================================================

  describe('clear', () => {
    it('removes all checkpoints', () => {
      manager.registerAssistantMessage('msg-001', 'session-abc');
      manager.registerAssistantMessage('msg-002', 'session-abc');
      manager.clear();
      expect(manager.getAllCheckpoints()).toHaveLength(0);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/harshagarwal/Documents/workspace/openclaude-vscode && npx vitest run test/unit/checkpointManager.test.ts`

Expected: FAIL — module `../../src/checkpoint/checkpointManager` does not exist.

- [ ] **Step 3: Commit test file**

```bash
git add test/unit/checkpointManager.test.ts
git commit -m "test(checkpoint): add failing tests for CheckpointManager"
```

---

## Task 2: Implement CheckpointManager

**Files:**
- Create: `src/checkpoint/checkpointManager.ts`

- [ ] **Step 1: Create CheckpointManager**

```typescript
// src/checkpoint/checkpointManager.ts
//
// Tracks assistant message UUIDs as checkpoint/rewind targets.
// Does NOT touch files — the CLI handles file restoration via rewind_files.
//
// References:
// - controlSchemas.ts: SDKControlRewindFilesRequestSchema / ResponseSchema
// - coreSchemas.ts: SDKFilesPersistedEventSchema, SDKSessionStateChangedMessageSchema

// ============================================================================
// Types
// ============================================================================

export interface PersistedFile {
  filename: string;
  file_id: string;
}

export interface CheckpointEntry {
  /** The assistant message UUID this checkpoint is anchored to */
  messageUuid: string;
  /** Session ID at the time of registration */
  sessionId: string;
  /** Files persisted after this assistant message */
  persistedFiles: PersistedFile[];
  /** Last session state seen (from session_state_changed) */
  lastSessionState?: 'idle' | 'running' | 'requires_action';
  /** Timestamp of registration */
  registeredAt: number;
}

/** Matches SDKControlRewindFilesRequestSchema from controlSchemas.ts */
export interface RewindFilesRequest {
  subtype: 'rewind_files';
  user_message_id: string;
  dry_run: boolean;
}

/** Matches SDKControlRewindFilesResponseSchema from controlSchemas.ts */
export interface RewindFilesResponse {
  canRewind: boolean;
  error?: string;
  filesChanged?: string[];
  insertions?: number;
  deletions?: number;
}

/** Fork options — override fields for ProcessManagerOptions */
export interface ForkOptions {
  sessionId: string;
  forkSession: true;
}

/** Serializable summary sent to the webview */
export interface CheckpointSummary {
  messageUuid: string;
  sessionId: string;
  fileCount: number;
  filenames: string[];
  canRewind: boolean;
  lastSessionState?: string;
}

// ============================================================================
// CheckpointManager
// ============================================================================

export class CheckpointManager {
  private checkpoints: Map<string, CheckpointEntry> = new Map();
  /** Ordered list of message UUIDs (insertion order) */
  private order: string[] = [];

  // --------------------------------------------------------------------------
  // Registration
  // --------------------------------------------------------------------------

  /**
   * Register an assistant message UUID as a rewind target.
   * Called when the CLI emits an assistant message.
   */
  registerAssistantMessage(messageUuid: string, sessionId: string): void {
    if (this.checkpoints.has(messageUuid)) {
      return; // Already registered — no duplicates
    }

    const entry: CheckpointEntry = {
      messageUuid,
      sessionId,
      persistedFiles: [],
      registeredAt: Date.now(),
    };

    this.checkpoints.set(messageUuid, entry);
    this.order.push(messageUuid);
  }

  // --------------------------------------------------------------------------
  // System event handlers
  // --------------------------------------------------------------------------

  /**
   * Handle a files_persisted system event from the CLI.
   * Associates persisted files with the most recent checkpoint for the session,
   * or a specific message UUID if provided.
   *
   * CLI schema: SDKFilesPersistedEventSchema
   * { type: 'system', subtype: 'files_persisted', files: [{filename, file_id}], failed: [...], processed_at, uuid, session_id }
   */
  markFilesPersisted(
    messageUuid: string,
    files: PersistedFile[],
  ): void {
    const entry = this.checkpoints.get(messageUuid);
    if (!entry) {
      return; // Unknown UUID — no-op
    }

    for (const file of files) {
      // Avoid duplicates by file_id
      if (!entry.persistedFiles.some((f) => f.file_id === file.file_id)) {
        entry.persistedFiles.push(file);
      }
    }
  }

  /**
   * Handle a session_state_changed system event.
   * Updates the lastSessionState on the most recent checkpoint for that session.
   *
   * CLI schema: SDKSessionStateChangedMessageSchema
   * { type: 'system', subtype: 'session_state_changed', state: 'idle'|'running'|'requires_action', uuid, session_id }
   */
  handleSessionStateChanged(
    state: 'idle' | 'running' | 'requires_action',
    sessionId: string,
  ): void {
    // Find the most recent checkpoint for this session
    for (let i = this.order.length - 1; i >= 0; i--) {
      const entry = this.checkpoints.get(this.order[i]);
      if (entry && entry.sessionId === sessionId) {
        entry.lastSessionState = state;
        return;
      }
    }
  }

  // --------------------------------------------------------------------------
  // Lookup
  // --------------------------------------------------------------------------

  getCheckpoint(messageUuid: string): CheckpointEntry | undefined {
    return this.checkpoints.get(messageUuid);
  }

  getAllCheckpoints(): CheckpointEntry[] {
    return this.order
      .map((uuid) => this.checkpoints.get(uuid))
      .filter((entry): entry is CheckpointEntry => entry !== undefined);
  }

  // --------------------------------------------------------------------------
  // Request builders
  // --------------------------------------------------------------------------

  /**
   * Build a rewind_files control request payload.
   * The extension host wraps this in a control_request envelope and sends to CLI stdin.
   *
   * CLI schema: SDKControlRewindFilesRequestSchema
   * { subtype: 'rewind_files', user_message_id: string, dry_run?: boolean }
   */
  buildRewindRequest(messageUuid: string, dryRun = false): RewindFilesRequest {
    if (!this.checkpoints.has(messageUuid)) {
      throw new Error(`No checkpoint found for message UUID: ${messageUuid}`);
    }

    return {
      subtype: 'rewind_files',
      user_message_id: messageUuid,
      dry_run: dryRun,
    };
  }

  /**
   * Build ProcessManagerOptions overrides for forking from this checkpoint.
   * The extension host uses these to spawn a new CLI process with --resume <uuid>.
   *
   * CLI flag: --resume <uuid> (with fork-session behavior — spawns from that point)
   */
  buildForkOptions(messageUuid: string): ForkOptions {
    if (!this.checkpoints.has(messageUuid)) {
      throw new Error(`No checkpoint found for message UUID: ${messageUuid}`);
    }

    return {
      sessionId: messageUuid,
      forkSession: true,
    };
  }

  // --------------------------------------------------------------------------
  // Webview state
  // --------------------------------------------------------------------------

  /**
   * Return serializable checkpoint summaries for the webview.
   * Sent via postMessage so the CheckpointMarker component knows which
   * messages have rewind targets.
   */
  getWebviewState(): CheckpointSummary[] {
    return this.getAllCheckpoints().map((entry) => ({
      messageUuid: entry.messageUuid,
      sessionId: entry.sessionId,
      fileCount: entry.persistedFiles.length,
      filenames: entry.persistedFiles.map((f) => f.filename),
      canRewind: true, // All registered checkpoints are rewind-capable
      lastSessionState: entry.lastSessionState,
    }));
  }

  // --------------------------------------------------------------------------
  // Lifecycle
  // --------------------------------------------------------------------------

  /**
   * Clear all checkpoints. Called when starting a new session.
   */
  clear(): void {
    this.checkpoints.clear();
    this.order = [];
  }
}
```

- [ ] **Step 2: Run tests**

Run: `cd /Users/harshagarwal/Documents/workspace/openclaude-vscode && npx vitest run test/unit/checkpointManager.test.ts`

Expected: All tests PASS.

- [ ] **Step 3: Commit**

```bash
git add src/checkpoint/checkpointManager.ts
git commit -m "feat(checkpoint): implement CheckpointManager with rewind/fork support"
```

---

## Task 3: Add Checkpoint PostMessage Types

**Files:**
- Modify: `src/webview/types.ts`

- [ ] **Step 1: Add checkpoint-related host-to-webview and webview-to-host message types**

Add to the existing `HostToWebviewMessage` union in `src/webview/types.ts`:

```typescript
// ============================================================================
// Checkpoint Messages (Story 10)
// ============================================================================

/** Host → Webview: checkpoint state update (sent after each assistant message / files_persisted) */
export interface CheckpointStateMessage {
  type: 'checkpoint_state';
  checkpoints: Array<{
    messageUuid: string;
    sessionId: string;
    fileCount: number;
    filenames: string[];
    canRewind: boolean;
    lastSessionState?: string;
  }>;
}

/** Host → Webview: rewind preview result (from dry_run) */
export interface RewindPreviewMessage {
  type: 'rewind_preview';
  messageUuid: string;
  canRewind: boolean;
  error?: string;
  filesChanged?: string[];
  insertions?: number;
  deletions?: number;
}

/** Host → Webview: rewind completed result */
export interface RewindResultMessage {
  type: 'rewind_result';
  messageUuid: string;
  success: boolean;
  error?: string;
  filesChanged?: string[];
  insertions?: number;
  deletions?: number;
}
```

Add to the existing `WebviewToHostMessage` union:

```typescript
/** Webview → Host: request rewind to a checkpoint */
export interface RewindRequestMessage {
  type: 'rewind';
  messageUuid: string;
  dryRun: boolean;
}

/** Webview → Host: request fork from a checkpoint */
export interface ForkRequestMessage {
  type: 'fork_session';
  messageUuid: string;
}

/** Webview → Host: request fork + rewind from a checkpoint */
export interface ForkAndRewindRequestMessage {
  type: 'fork_and_rewind';
  messageUuid: string;
}
```

- [ ] **Step 2: Verify build**

Run: `cd /Users/harshagarwal/Documents/workspace/openclaude-vscode && npm run build:extension`

Expected: Build succeeds with no type errors.

- [ ] **Step 3: Commit**

```bash
git add src/webview/types.ts
git commit -m "feat(checkpoint): add checkpoint postMessage types"
```

---

## Task 4: Add Fork Support to ProcessManager

**Files:**
- Modify: `src/process/processManager.ts`

The existing `ProcessManagerOptions` has `sessionId` and `continueSession` but no `forkSession` flag. We need to add it so that `buildArgs()` emits `--resume <uuid>` for forks (the CLI uses `--resume` with a message UUID to fork from that point).

- [ ] **Step 1: Add forkSession to ProcessManagerOptions**

In `src/process/processManager.ts`, add to the `ProcessManagerOptions` interface:

```typescript
  /** Fork session from a checkpoint UUID (used with sessionId) */
  forkSession?: boolean;
```

- [ ] **Step 2: Update buildArgs() to handle fork**

In the `buildArgs()` method, after the existing `sessionId` handling:

```typescript
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

    // Fork session: spawn from a checkpoint message UUID
    // The CLI interprets --resume <messageUuid> as forking when given a message UUID
    // rather than a session UUID
    if (this.options.forkSession) {
      args.push('--fork-session');
    }

    if (this.options.continueSession) {
      args.push('--continue');
    }

    return args;
  }
```

- [ ] **Step 3: Verify build**

Run: `cd /Users/harshagarwal/Documents/workspace/openclaude-vscode && npm run build:extension`

Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/process/processManager.ts
git commit -m "feat(checkpoint): add forkSession flag to ProcessManager spawn args"
```

---

## Task 5: CheckpointMarker Component — Tests First

**Files:**
- Create: `webview/src/components/chat/CheckpointMarker.tsx`

- [ ] **Step 1: Create CheckpointMarker component**

```tsx
// webview/src/components/chat/CheckpointMarker.tsx
//
// Hover affordance on assistant messages showing Fork/Rewind/Fork+Rewind actions.
// This component is "dumb" — it emits callbacks only; the parent handles postMessage.
//
// Rendered inside AssistantMessage.tsx, positioned as a hover overlay.

import React, { useState, useCallback } from 'react';

// ============================================================================
// Types
// ============================================================================

export interface CheckpointInfo {
  messageUuid: string;
  fileCount: number;
  filenames: string[];
  canRewind: boolean;
}

export interface RewindPreview {
  canRewind: boolean;
  error?: string;
  filesChanged?: string[];
  insertions?: number;
  deletions?: number;
}

export interface CheckpointMarkerProps {
  checkpoint: CheckpointInfo;
  /** Preview data from a dry_run (undefined = not yet fetched) */
  preview?: RewindPreview;
  /** Whether a rewind/fork operation is currently in flight */
  isLoading?: boolean;
  /** Callbacks */
  onFork: (messageUuid: string) => void;
  onRewind: (messageUuid: string) => void;
  onForkAndRewind: (messageUuid: string) => void;
  onPreview: (messageUuid: string) => void;
}

// ============================================================================
// Component
// ============================================================================

export const CheckpointMarker: React.FC<CheckpointMarkerProps> = ({
  checkpoint,
  preview,
  isLoading = false,
  onFork,
  onRewind,
  onForkAndRewind,
  onPreview,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const handleMouseEnter = useCallback(() => {
    setIsExpanded(true);
    // Request dry-run preview on first hover if not already fetched
    if (!preview && checkpoint.canRewind) {
      onPreview(checkpoint.messageUuid);
    }
  }, [preview, checkpoint, onPreview]);

  const handleMouseLeave = useCallback(() => {
    setIsExpanded(false);
  }, []);

  const handleFork = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onFork(checkpoint.messageUuid);
    },
    [checkpoint.messageUuid, onFork],
  );

  const handleRewind = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onRewind(checkpoint.messageUuid);
    },
    [checkpoint.messageUuid, onRewind],
  );

  const handleForkAndRewind = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onForkAndRewind(checkpoint.messageUuid);
    },
    [checkpoint.messageUuid, onForkAndRewind],
  );

  return (
    <div
      className="group relative"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Checkpoint indicator dot — always visible on hover over assistant message */}
      <div
        className={`
          flex items-center gap-1 px-1.5 py-0.5 rounded text-xs
          transition-opacity duration-150
          opacity-0 group-hover:opacity-100
          text-[var(--vscode-descriptionForeground)]
          hover:text-[var(--vscode-foreground)]
          cursor-pointer select-none
        `}
        title="Checkpoint — click to rewind or fork"
      >
        {/* Clock/rewind icon */}
        <svg
          width="12"
          height="12"
          viewBox="0 0 16 16"
          fill="currentColor"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm0 12.5A5.5 5.5 0 1 1 8 2.5a5.5 5.5 0 0 1 0 11zM8 4v4l3 1.5-.5 1L7 9V4h1z" />
        </svg>
        <span>Checkpoint</span>
        {checkpoint.fileCount > 0 && (
          <span className="text-[var(--vscode-descriptionForeground)]">
            ({checkpoint.fileCount} file{checkpoint.fileCount !== 1 ? 's' : ''})
          </span>
        )}
      </div>

      {/* Expanded action menu */}
      {isExpanded && (
        <div
          className={`
            absolute left-0 top-full mt-1 z-50
            bg-[var(--vscode-menu-background)]
            border border-[var(--vscode-menu-border)]
            rounded-md shadow-lg
            py-1 min-w-[200px]
          `}
        >
          {/* Fork conversation */}
          <button
            className={`
              w-full text-left px-3 py-1.5 text-xs
              text-[var(--vscode-menu-foreground)]
              hover:bg-[var(--vscode-menu-selectionBackground)]
              hover:text-[var(--vscode-menu-selectionForeground)]
              disabled:opacity-50 disabled:cursor-not-allowed
              flex items-center gap-2
            `}
            onClick={handleFork}
            disabled={isLoading}
            title="Start a new conversation branch from this point (keeps code as-is)"
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
              <path d="M14 4a2 2 0 1 0-2.47 1.94L11 8.5a1.5 1.5 0 0 1-1.5 1.5h-3A1.5 1.5 0 0 1 5 8.5V5.94A2 2 0 1 0 3 4v4.5A3.5 3.5 0 0 0 6.5 12h3a3.5 3.5 0 0 0 3.5-3.5V5.94A2 2 0 0 0 14 4z" />
            </svg>
            <div>
              <div>Fork conversation</div>
              <div className="text-[10px] text-[var(--vscode-descriptionForeground)]">
                New branch, keep code
              </div>
            </div>
          </button>

          {/* Rewind code */}
          <button
            className={`
              w-full text-left px-3 py-1.5 text-xs
              text-[var(--vscode-menu-foreground)]
              hover:bg-[var(--vscode-menu-selectionBackground)]
              hover:text-[var(--vscode-menu-selectionForeground)]
              disabled:opacity-50 disabled:cursor-not-allowed
              flex items-center gap-2
            `}
            onClick={handleRewind}
            disabled={isLoading || !checkpoint.canRewind}
            title="Revert files to this point (keep conversation history)"
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
              <path d="M2.5 2v4.5H7L5.3 4.8A5 5 0 1 1 3 8H1.5a6.5 6.5 0 1 0 2.8-5.3L2.5 2z" />
            </svg>
            <div>
              <div>Rewind code</div>
              <div className="text-[10px] text-[var(--vscode-descriptionForeground)]">
                Revert files, keep conversation
              </div>
            </div>
          </button>

          {/* Fork + Rewind */}
          <button
            className={`
              w-full text-left px-3 py-1.5 text-xs
              text-[var(--vscode-menu-foreground)]
              hover:bg-[var(--vscode-menu-selectionBackground)]
              hover:text-[var(--vscode-menu-selectionForeground)]
              disabled:opacity-50 disabled:cursor-not-allowed
              flex items-center gap-2
            `}
            onClick={handleForkAndRewind}
            disabled={isLoading || !checkpoint.canRewind}
            title="Fork conversation AND revert files to this point"
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
              <path d="M14 4a2 2 0 1 0-2.47 1.94L11 8.5a1.5 1.5 0 0 1-1.5 1.5h-3A1.5 1.5 0 0 1 5 8.5V5.94A2 2 0 1 0 3 4v4.5A3.5 3.5 0 0 0 6.5 12h3a3.5 3.5 0 0 0 3.5-3.5V5.94A2 2 0 0 0 14 4z" />
              <path d="M2 14l2-2M2 14l2 2" stroke="currentColor" strokeWidth="1.5" fill="none" />
            </svg>
            <div>
              <div>Fork + Rewind</div>
              <div className="text-[10px] text-[var(--vscode-descriptionForeground)]">
                New branch + revert files
              </div>
            </div>
          </button>

          {/* Dry-run preview */}
          {preview && (
            <div className="px-3 py-1.5 border-t border-[var(--vscode-menu-separatorBackground)]">
              {preview.error ? (
                <div className="text-[10px] text-[var(--vscode-errorForeground)]">
                  {preview.error}
                </div>
              ) : (
                <div className="text-[10px] text-[var(--vscode-descriptionForeground)]">
                  {preview.filesChanged && preview.filesChanged.length > 0 ? (
                    <>
                      <div className="font-medium mb-0.5">Would revert:</div>
                      {preview.filesChanged.map((file) => (
                        <div key={file} className="truncate pl-2">
                          {file}
                        </div>
                      ))}
                      {preview.insertions !== undefined && preview.deletions !== undefined && (
                        <div className="mt-0.5">
                          <span className="text-green-500">+{preview.insertions}</span>{' '}
                          <span className="text-red-500">-{preview.deletions}</span>
                        </div>
                      )}
                    </>
                  ) : (
                    <div>No file changes to revert</div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Loading indicator */}
          {isLoading && (
            <div className="px-3 py-1 text-[10px] text-[var(--vscode-descriptionForeground)] italic">
              Processing...
            </div>
          )}
        </div>
      )}
    </div>
  );
};
```

- [ ] **Step 2: Build webview**

Run: `cd /Users/harshagarwal/Documents/workspace/openclaude-vscode && npm run build:webview`

Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add webview/src/components/chat/CheckpointMarker.tsx
git commit -m "feat(checkpoint): add CheckpointMarker hover UI component"
```

---

## Task 6: Wire CheckpointManager Into Extension Host

**Files:**
- Modify: `src/extension.ts`

This task connects everything: the extension host instantiates `CheckpointManager`, feeds CLI events into it, relays webview actions to the CLI, and sends checkpoint state updates to the webview.

- [ ] **Step 1: Import and instantiate CheckpointManager**

Add to `src/extension.ts`:

```typescript
import { CheckpointManager } from './checkpoint/checkpointManager';
import type { RewindFilesResponse } from './checkpoint/checkpointManager';
```

In the `activate` function, create the manager:

```typescript
const checkpointManager = new CheckpointManager();
```

- [ ] **Step 2: Feed CLI messages into CheckpointManager**

In the ProcessManager `onMessage` callback (where CLI stdout messages are routed), add handlers for the three relevant message types:

```typescript
// Inside the processManager.onMessage callback:

processManager.onMessage((message) => {
  // ... existing message routing ...

  // --- Checkpoint tracking (Story 10) ---

  // Register assistant messages as checkpoint targets
  if (message.type === 'assistant' && message.uuid) {
    checkpointManager.registerAssistantMessage(message.uuid, message.session_id);
    // Send updated checkpoint state to webview
    webviewProvider.postMessage({
      type: 'checkpoint_state',
      checkpoints: checkpointManager.getWebviewState(),
    });
  }

  // Handle files_persisted system events
  if (
    message.type === 'system' &&
    message.subtype === 'files_persisted' &&
    message.uuid
  ) {
    const filesPersisted = message as {
      files: Array<{ filename: string; file_id: string }>;
      uuid: string;
    };
    checkpointManager.markFilesPersisted(
      filesPersisted.uuid,
      filesPersisted.files,
    );
    webviewProvider.postMessage({
      type: 'checkpoint_state',
      checkpoints: checkpointManager.getWebviewState(),
    });
  }

  // Handle session_state_changed system events
  if (
    message.type === 'system' &&
    message.subtype === 'session_state_changed'
  ) {
    const stateChanged = message as {
      state: 'idle' | 'running' | 'requires_action';
      session_id: string;
    };
    checkpointManager.handleSessionStateChanged(
      stateChanged.state,
      stateChanged.session_id,
    );
  }
});
```

- [ ] **Step 3: Handle webview rewind/fork requests**

In the webview message handler (where `postMessage` from the webview is received), add:

```typescript
// Inside webviewProvider.onMessage callback:

case 'rewind': {
  const { messageUuid, dryRun } = msg as { messageUuid: string; dryRun: boolean };
  try {
    const request = checkpointManager.buildRewindRequest(messageUuid, dryRun);
    const response = await processManager.sendControlRequest(request);
    const rewindResponse = response as unknown as RewindFilesResponse;

    if (dryRun) {
      // Send preview to webview
      webviewProvider.postMessage({
        type: 'rewind_preview',
        messageUuid,
        canRewind: rewindResponse.canRewind,
        error: rewindResponse.error,
        filesChanged: rewindResponse.filesChanged,
        insertions: rewindResponse.insertions,
        deletions: rewindResponse.deletions,
      });
    } else {
      // Send result to webview
      webviewProvider.postMessage({
        type: 'rewind_result',
        messageUuid,
        success: rewindResponse.canRewind && !rewindResponse.error,
        error: rewindResponse.error,
        filesChanged: rewindResponse.filesChanged,
        insertions: rewindResponse.insertions,
        deletions: rewindResponse.deletions,
      });
    }
  } catch (err) {
    webviewProvider.postMessage({
      type: dryRun ? 'rewind_preview' : 'rewind_result',
      messageUuid,
      canRewind: false,
      success: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
  break;
}

case 'fork_session': {
  const { messageUuid } = msg as { messageUuid: string };
  try {
    const forkOptions = checkpointManager.buildForkOptions(messageUuid);
    // Spawn a new CLI process from the checkpoint
    // This creates a new conversation branch in a new editor tab
    const forkProcessManager = new ProcessManager({
      ...processManagerOptions, // Base options from current session
      sessionId: forkOptions.sessionId,
      forkSession: forkOptions.forkSession,
    });
    await forkProcessManager.spawn();

    // Open a new webview tab for the forked session
    // (Uses the existing multi-panel support from Story 4)
    vscode.commands.executeCommand('openclaude.editor.open');
  } catch (err) {
    vscode.window.showErrorMessage(
      `Fork failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  break;
}

case 'fork_and_rewind': {
  const { messageUuid } = msg as { messageUuid: string };
  try {
    // Step 1: Fork the conversation
    const forkOptions = checkpointManager.buildForkOptions(messageUuid);
    const forkProcessManager = new ProcessManager({
      ...processManagerOptions,
      sessionId: forkOptions.sessionId,
      forkSession: forkOptions.forkSession,
    });
    await forkProcessManager.spawn();

    // Step 2: Rewind files in the CURRENT session
    const request = checkpointManager.buildRewindRequest(messageUuid, false);
    const response = await processManager.sendControlRequest(request);
    const rewindResponse = response as unknown as RewindFilesResponse;

    webviewProvider.postMessage({
      type: 'rewind_result',
      messageUuid,
      success: rewindResponse.canRewind && !rewindResponse.error,
      error: rewindResponse.error,
      filesChanged: rewindResponse.filesChanged,
      insertions: rewindResponse.insertions,
      deletions: rewindResponse.deletions,
    });

    // Open new tab for the fork
    vscode.commands.executeCommand('openclaude.editor.open');
  } catch (err) {
    vscode.window.showErrorMessage(
      `Fork+Rewind failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  break;
}
```

- [ ] **Step 4: Clear checkpoints on new session**

When a new session starts (e.g., `openclaude.newConversation` command), clear the checkpoint state:

```typescript
// In the newConversation command handler:
checkpointManager.clear();
webviewProvider.postMessage({
  type: 'checkpoint_state',
  checkpoints: [],
});
```

- [ ] **Step 5: Build full extension**

Run: `cd /Users/harshagarwal/Documents/workspace/openclaude-vscode && npm run build`

Expected: Both extension and webview build successfully.

- [ ] **Step 6: Commit**

```bash
git add src/extension.ts
git commit -m "feat(checkpoint): wire CheckpointManager between CLI events and webview"
```

---

## Final Verification

- [ ] Run: `cd /Users/harshagarwal/Documents/workspace/openclaude-vscode && npm run build`
- [ ] Run: `cd /Users/harshagarwal/Documents/workspace/openclaude-vscode && npx vitest run test/unit/checkpointManager.test.ts`
- [ ] Manual: Launch Extension Development Host (F5), start a conversation, verify:
  - Assistant messages show checkpoint indicator on hover
  - Hovering expands the action menu with three options
  - "Rewind code" sends `rewind_files` control_request to CLI with correct `user_message_id`
  - Dry-run preview shows file change summary
  - "Fork conversation" spawns a new CLI process with `--resume <uuid> --fork-session`
  - "Fork + Rewind" does both
  - New session clears checkpoint state
