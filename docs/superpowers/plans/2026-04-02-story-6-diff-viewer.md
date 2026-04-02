# Story 6: Native Diff Viewer — Accept/Reject — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When the CLI sends a `control_request` with `subtype: can_use_tool` for FileEditTool or FileWriteTool, show the user a VS Code native diff editor (original vs proposed content) with Accept/Reject buttons in the editor title bar. Accept applies changes to the file and sends a success `control_response`; Reject discards changes and sends an error `control_response`. Multiple pending diffs (one per file) are supported concurrently.

**Architecture:** Two classes — `DiffContentProvider` (a `vscode.FileSystemProvider` that serves virtual file content for the left/right sides of the diff) and `DiffManager` (orchestrates showing diffs, wiring accept/reject events, and communicating back to the CLI via the ControlRouter). The pattern is extracted directly from Claude Code's extension.js, which uses `registerFileSystemProvider` for left (original) and right (proposed) virtual file systems, `vscode.diff` command to open the native diff editor, and EventEmitter-driven accept/reject commands.

**Tech Stack:** TypeScript 5.x, VS Code Extension API (`FileSystemProvider`, `TextDocumentContentProvider`, `vscode.diff` command, context variables), Vitest for unit tests

**Spec:** [2026-04-02-openclaude-vscode-extension-design.md](../specs/2026-04-02-openclaude-vscode-extension-design.md) — Story 6

**Dependency:** Story 2 (ProcessManager, NdjsonTransport, ControlRouter, TypeScript types)

**Claude Code extension (deminified reference):**
- `$2` class — `FileSystemProvider` for left/right virtual filesystems (scheme: `_claude_vscode_fs_left`, `_claude_vscode_fs_right`)
- `FQ` class — `TextDocumentContentProvider` for readonly content
- `cr` function — Opens `vscode.diff` with left URI (original) and right URI (proposed), races accept/reject/tab-close/file-save
- `Xr` function — Registers `acceptProposedDiff` and `rejectProposedDiff` commands, fires events
- `dg6` function — Watches `onDidChangeVisibleTextEditors` to set `viewingProposedDiff` context variable
- `vS6` function — Closes existing diff tabs for the same file before opening a new one

---

## File Structure

| File | Responsibility |
|---|---|
| `src/diff/diffContentProvider.ts` | `FileSystemProvider` for virtual original/proposed file content — serves left and right sides of diff |
| `src/diff/diffManager.ts` | Orchestrates diff lifecycle: receives can_use_tool for file tools, opens native diff, handles accept/reject, sends control_response |
| `src/diff/types.ts` | Types for pending diffs, diff events, and file tool input schemas |
| `test/unit/diffContentProvider.test.ts` | Unit tests for DiffContentProvider virtual file management |
| `test/unit/diffManager.test.ts` | Unit tests for DiffManager accept/reject/cancel flows |

---

## Task 1: Diff Types

**Files:**
- Create: `src/diff/types.ts`

- [ ] **Step 1: Create src/diff/types.ts**

```typescript
// src/diff/types.ts
// Types for the diff viewer system — pending diffs, file tool inputs, events.

import * as vscode from 'vscode';

/**
 * Input schema for FileEditTool — the CLI sends this in can_use_tool.input
 * when requesting permission to edit a file.
 */
export interface FileEditToolInput {
  file_path: string;
  old_string: string;
  new_string: string;
  replace_all?: boolean;
}

/**
 * Input schema for FileWriteTool — the CLI sends this in can_use_tool.input
 * when requesting permission to write/create a file.
 */
export interface FileWriteToolInput {
  file_path: string;
  content: string;
}

/**
 * Discriminated union of file tool inputs recognized by the diff viewer.
 */
export type FileToolInput = FileEditToolInput | FileWriteToolInput;

/**
 * Check if a tool_name is a file tool that should trigger the diff viewer.
 */
export function isFileEditTool(toolName: string): boolean {
  return toolName === 'FileEditTool' || toolName === 'file_edit';
}

export function isFileWriteTool(toolName: string): boolean {
  return toolName === 'FileWriteTool' || toolName === 'file_write';
}

export function isFileTool(toolName: string): boolean {
  return isFileEditTool(toolName) || isFileWriteTool(toolName);
}

/**
 * A pending diff waiting for the user's accept/reject decision.
 * One per file at a time — if a new diff arrives for the same file,
 * the old one is auto-rejected and replaced.
 */
export interface PendingDiff {
  /** The control_request request_id — needed for sending control_response */
  requestId: string;
  /** Absolute path to the target file */
  filePath: string;
  /** The tool name (FileEditTool, FileWriteTool, etc.) */
  toolName: string;
  /** Original tool input from the CLI */
  toolInput: Record<string, unknown>;
  /** Original file content (before proposed changes) */
  originalContent: string;
  /** Proposed file content (after applying changes) */
  proposedContent: string;
  /** URI for the left (original) side of the diff */
  leftUri: vscode.Uri;
  /** URI for the right (proposed) side of the diff */
  rightUri: vscode.Uri;
  /** Timestamp when the diff was created */
  createdAt: number;
}

/**
 * Event fired when the user accepts or rejects a diff.
 */
export interface DiffDecisionEvent {
  accepted: boolean;
  activeTab: vscode.Tab | undefined;
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/harshagarwal/Documents/workspace/openclaude-vscode
git add src/diff/types.ts
git commit -m "feat(diff): add types for pending diffs and file tool inputs"
```

---

## Task 2: DiffContentProvider — Failing Tests First

**Files:**
- Create: `test/unit/diffContentProvider.test.ts`

The DiffContentProvider is a `vscode.FileSystemProvider` that stores virtual file contents in memory. It provides left (original) and right (proposed) URIs for the `vscode.diff` command. Each instance owns a single URI scheme (e.g., `_openclaude_fs_left` or `_openclaude_fs_right`).

- [ ] **Step 1: Write failing tests for DiffContentProvider**

```typescript
// test/unit/diffContentProvider.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { DiffContentProvider } from '../../src/diff/diffContentProvider';

describe('DiffContentProvider', () => {
  let provider: DiffContentProvider;

  beforeEach(() => {
    provider = new DiffContentProvider('test-scheme');
  });

  it('should expose the scheme it was constructed with', () => {
    expect(provider.scheme).toBe('test-scheme');
  });

  it('should create a file and return a URI with the correct scheme', () => {
    const file = provider.createFile('/path/to/file.ts', 'const x = 1;');
    expect(file.uri.scheme).toBe('test-scheme');
    expect(file.uri.path).toBe('/path/to/file.ts');
  });

  it('should read back the content via readFile', () => {
    const file = provider.createFile('/path/to/file.ts', 'const x = 1;');
    const content = provider.readFile(file.uri);
    expect(new TextDecoder().decode(content)).toBe('const x = 1;');
  });

  it('should overwrite content when createFile is called for the same path', () => {
    provider.createFile('/path/to/file.ts', 'original');
    const file = provider.createFile('/path/to/file.ts', 'updated');
    const content = provider.readFile(file.uri);
    expect(new TextDecoder().decode(content)).toBe('updated');
  });

  it('should update content via writeFile', () => {
    const file = provider.createFile('/path/to/file.ts', 'original');
    provider.writeFile(file.uri, new TextEncoder().encode('modified'), { create: false, overwrite: true });
    const content = provider.readFile(file.uri);
    expect(new TextDecoder().decode(content)).toBe('modified');
  });

  it('should throw FileNotFound for unknown URIs', () => {
    const uri = { scheme: 'test-scheme', path: '/nonexistent.ts', toString: () => 'test-scheme:///nonexistent.ts' } as any;
    expect(() => provider.readFile(uri)).toThrow();
  });

  it('should return stat for existing files', () => {
    const file = provider.createFile('/path/to/file.ts', 'hello');
    const stat = provider.stat(file.uri);
    expect(stat.type).toBeDefined();
    expect(stat.size).toBe(new TextEncoder().encode('hello').length);
  });

  it('should delete a file', () => {
    const file = provider.createFile('/path/to/file.ts', 'content');
    provider.delete(file.uri);
    expect(() => provider.readFile(file.uri)).toThrow();
  });

  it('should fire onDidChangeFile when content changes via writeFile', () => {
    const file = provider.createFile('/path/to/file.ts', 'original');
    const changes: any[] = [];
    provider.onDidChangeFile((events) => {
      changes.push(...events);
    });
    provider.writeFile(file.uri, new TextEncoder().encode('modified'), { create: false, overwrite: true });
    expect(changes.length).toBeGreaterThan(0);
    expect(changes[0].uri.path).toBe('/path/to/file.ts');
  });

  it('should handle Windows-style paths by normalizing drive letters', () => {
    // On non-Windows, this just passes through
    const file = provider.createFile('/c:/Users/test/file.ts', 'content');
    expect(file.uri.path).toContain('file.ts');
  });
});
```

- [ ] **Step 2: Run tests — should FAIL**

Run: `cd /Users/harshagarwal/Documents/workspace/openclaude-vscode && npx vitest run test/unit/diffContentProvider.test.ts 2>&1 | tail -10`

Expected: `Error: Cannot find module '../../src/diff/diffContentProvider'`

- [ ] **Step 3: Commit**

```bash
cd /Users/harshagarwal/Documents/workspace/openclaude-vscode
git add test/unit/diffContentProvider.test.ts
git commit -m "test(diff): add failing tests for DiffContentProvider (TDD red phase)"
```

---

## Task 3: DiffContentProvider — Implementation

**Files:**
- Create: `src/diff/diffContentProvider.ts`

Implements `vscode.FileSystemProvider` to serve virtual file content for the left and right sides of native diff editors. Pattern extracted from Claude Code extension's `$2` class. Each instance owns a URI scheme (e.g., `_openclaude_fs_left`, `_openclaude_fs_right`). Files are stored in an in-memory `Map<string, VirtualFile>` keyed by normalized path.

- [ ] **Step 1: Create src/diff/diffContentProvider.ts**

```typescript
// src/diff/diffContentProvider.ts
// Virtual FileSystemProvider for serving original/proposed file content in diff editors.
//
// Pattern extracted from Claude Code extension.js class `$2`:
//   - Uses registerFileSystemProvider (not registerTextDocumentContentProvider)
//   - Files stored in-memory, keyed by URI path
//   - Fires onDidChangeFile when content changes
//   - stat() returns file type and size
//   - createFile() returns a VirtualFile with .uri property
//
// Two instances are created:
//   - Left provider (scheme: _openclaude_fs_left) — original file content
//   - Right provider (scheme: _openclaude_fs_right) — proposed file content

import * as vscode from 'vscode';

/** Normalize Windows drive letter paths: /C:/foo → /c:/foo */
function normalizePath(filePath: string): string {
  if (process.platform === 'win32') {
    // Convert /C:/ to /c:/ for consistent key lookup
    return filePath.replace(/^\/([A-Z]):/, (_, drive) => `/${drive.toLowerCase()}:`);
  }
  return filePath;
}

/** In-memory virtual file with content and metadata */
class VirtualFile implements vscode.FileStat {
  uri: vscode.Uri;
  type = vscode.FileType.File;
  ctime: number;
  mtime: number;
  size: number;
  permissions?: vscode.FilePermission;
  private _content: Uint8Array;

  constructor(uri: vscode.Uri, content: Uint8Array) {
    this.uri = uri;
    this.ctime = Date.now();
    this.mtime = Date.now();
    this._content = content;
    this.size = content.byteLength;
  }

  get content(): Uint8Array {
    return this._content;
  }

  set content(value: Uint8Array) {
    this._content = value;
    this.size = value.byteLength;
    this.mtime = Date.now();
  }
}

/**
 * FileSystemProvider that serves virtual file content for diff editors.
 *
 * Usage:
 *   const leftProvider = new DiffContentProvider('_openclaude_fs_left');
 *   context.subscriptions.push(vscode.workspace.registerFileSystemProvider(leftProvider.scheme, leftProvider));
 *   const file = leftProvider.createFile('/path/to/file.ts', 'original content');
 *   // file.uri can be passed as the left side of vscode.diff
 */
export class DiffContentProvider implements vscode.FileSystemProvider {
  readonly scheme: string;
  private documents = new Map<string, VirtualFile>();

  private _onDidChangeFile = new vscode.EventEmitter<vscode.FileChangeEvent[]>();
  readonly onDidChangeFile = this._onDidChangeFile.event;

  constructor(scheme: string) {
    this.scheme = scheme;
  }

  /**
   * Create or update a virtual file with the given content.
   * Returns the VirtualFile (which has a .uri property).
   */
  createFile(filePath: string, content: string): VirtualFile {
    const normalizedPath = normalizePath(filePath);
    const uri = vscode.Uri.from({ scheme: this.scheme, path: normalizedPath });
    const encoded = new TextEncoder().encode(content);
    const existing = this.documents.get(normalizedPath);

    if (existing) {
      // Update existing file — reuse the VirtualFile, update content
      this.writeFile(uri, encoded, { create: false, overwrite: true });
      return existing;
    }

    // Create new file
    const file = new VirtualFile(uri, encoded);
    this.documents.set(normalizedPath, file);
    return file;
  }

  /**
   * Delete a virtual file by URI.
   */
  delete(uri: vscode.Uri): void {
    const key = normalizePath(uri.path);
    this.documents.delete(key);
  }

  /**
   * Remove all virtual files from this provider.
   */
  clear(): void {
    this.documents.clear();
  }

  // ---- FileSystemProvider interface ----

  watch(_uri: vscode.Uri): vscode.Disposable {
    // No-op — virtual files don't change externally
    return new vscode.Disposable(() => {});
  }

  stat(uri: vscode.Uri): vscode.FileStat {
    const file = this.findFile(uri);
    return file;
  }

  readDirectory(_uri: vscode.Uri): [string, vscode.FileType][] {
    throw vscode.FileSystemError.Unavailable('readDirectory not supported');
  }

  createDirectory(_uri: vscode.Uri): void {
    throw vscode.FileSystemError.Unavailable('createDirectory not supported');
  }

  readFile(uri: vscode.Uri): Uint8Array {
    const file = this.findFile(uri);
    return file.content;
  }

  writeFile(uri: vscode.Uri, content: Uint8Array, _options: { create: boolean; overwrite: boolean }): void {
    const key = normalizePath(uri.path);
    const file = this.documents.get(key);
    if (file) {
      file.content = content;
      this._onDidChangeFile.fire([{ type: vscode.FileChangeType.Changed, uri }]);
    } else {
      // Create if it doesn't exist
      const newFile = new VirtualFile(uri, content);
      this.documents.set(key, newFile);
      this._onDidChangeFile.fire([{ type: vscode.FileChangeType.Created, uri }]);
    }
  }

  rename(_oldUri: vscode.Uri, _newUri: vscode.Uri, _options: { overwrite: boolean }): void {
    throw vscode.FileSystemError.Unavailable('rename not supported');
  }

  // ---- Helpers ----

  private findFile(uri: vscode.Uri): VirtualFile {
    const key = normalizePath(uri.path);
    const file = this.documents.get(key);
    if (!file) {
      throw vscode.FileSystemError.FileNotFound(uri);
    }
    return file;
  }

  dispose(): void {
    this._onDidChangeFile.dispose();
    this.documents.clear();
  }
}
```

- [ ] **Step 2: Run DiffContentProvider tests — should all PASS**

Run: `cd /Users/harshagarwal/Documents/workspace/openclaude-vscode && npx vitest run test/unit/diffContentProvider.test.ts 2>&1`

Expected: All tests pass (9/9 or similar)

```
 ✓ test/unit/diffContentProvider.test.ts (9)
   ✓ DiffContentProvider > should expose the scheme it was constructed with
   ✓ DiffContentProvider > should create a file and return a URI with the correct scheme
   ...
```

> **Note:** The tests may require updating the vscode mock (from Story 1) to include `FileSystemError`, `FileType`, `FileChangeType`, and `Uri.from()`. If tests fail because of missing mocks, update `test/__mocks__/vscode.ts` to add:
>
> ```typescript
> export class FileSystemError extends Error {
>   static FileNotFound(uri?: any): FileSystemError { return new FileSystemError('FileNotFound'); }
>   static Unavailable(msg?: string): FileSystemError { return new FileSystemError(msg || 'Unavailable'); }
> }
> export enum FileType { File = 1, Directory = 2 }
> export enum FileChangeType { Changed = 1, Created = 2, Deleted = 3 }
> export class Uri {
>   scheme: string; path: string; authority = ''; query = ''; fragment = '';
>   constructor(scheme: string, path: string) { this.scheme = scheme; this.path = path; }
>   static from(components: { scheme: string; path: string }): Uri { return new Uri(components.scheme, components.path); }
>   static file(path: string): Uri { return new Uri('file', path); }
>   toString(): string { return `${this.scheme}://${this.path}`; }
> }
> export enum FilePermission { Readonly = 1 }
> ```

- [ ] **Step 3: Commit**

```bash
cd /Users/harshagarwal/Documents/workspace/openclaude-vscode
git add src/diff/diffContentProvider.ts test/__mocks__/vscode.ts
git commit -m "feat(diff): implement DiffContentProvider FileSystemProvider"
```

---

## Task 4: DiffManager — Failing Tests First

**Files:**
- Create: `test/unit/diffManager.test.ts`

The DiffManager is the core orchestration class. It:
1. Registers as a `can_use_tool` handler on the ControlRouter (for FileEditTool/FileWriteTool)
2. When a file tool permission request arrives, computes original + proposed content
3. Creates virtual files in left and right providers
4. Opens `vscode.diff` with left URI and right URI
5. Waits for the user to click Accept or Reject (or close the tab)
6. Returns the appropriate response to the ControlRouter (which sends control_response back to CLI)

- [ ] **Step 1: Write failing tests for DiffManager**

```typescript
// test/unit/diffManager.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DiffManager } from '../../src/diff/diffManager';
import { DiffContentProvider } from '../../src/diff/diffContentProvider';
import type { ControlRequestPermission } from '../../src/types/messages';
import type { DiffDecisionEvent } from '../../src/diff/types';
import * as vscode from 'vscode';

// Mock vscode.commands.executeCommand
vi.mock('vscode', async () => {
  const actual = await vi.importActual<typeof import('vscode')>('vscode');
  return {
    ...actual,
    commands: {
      executeCommand: vi.fn().mockResolvedValue(undefined),
    },
    workspace: {
      ...actual.workspace,
      openTextDocument: vi.fn().mockResolvedValue({ getText: () => '', isDirty: false }),
      getConfiguration: vi.fn().mockReturnValue({ get: vi.fn().mockReturnValue('off') }),
    },
    window: {
      tabGroups: { all: [], activeTabGroup: { activeTab: undefined } },
      onDidChangeVisibleTextEditors: vi.fn().mockReturnValue({ dispose: () => {} }),
    },
  };
});

describe('DiffManager', () => {
  let leftProvider: DiffContentProvider;
  let rightProvider: DiffContentProvider;
  let diffManager: DiffManager;
  let acceptRejectEmitter: vscode.EventEmitter<DiffDecisionEvent>;

  beforeEach(() => {
    leftProvider = new DiffContentProvider('_test_fs_left');
    rightProvider = new DiffContentProvider('_test_fs_right');
    acceptRejectEmitter = new vscode.EventEmitter<DiffDecisionEvent>();
    diffManager = new DiffManager(leftProvider, rightProvider, acceptRejectEmitter.event);
  });

  it('should detect FileEditTool as a file tool', () => {
    expect(diffManager.isFileToolRequest({ subtype: 'can_use_tool', tool_name: 'FileEditTool' } as any)).toBe(true);
  });

  it('should detect FileWriteTool as a file tool', () => {
    expect(diffManager.isFileToolRequest({ subtype: 'can_use_tool', tool_name: 'FileWriteTool' } as any)).toBe(true);
  });

  it('should not detect BashTool as a file tool', () => {
    expect(diffManager.isFileToolRequest({ subtype: 'can_use_tool', tool_name: 'BashTool' } as any)).toBe(false);
  });

  it('should compute proposed content for FileWriteTool (full write)', () => {
    const proposed = diffManager.computeProposedContent(
      '',
      'FileWriteTool',
      { file_path: '/test.ts', content: 'new file content' },
    );
    expect(proposed).toBe('new file content');
  });

  it('should compute proposed content for FileEditTool (string replace)', () => {
    const proposed = diffManager.computeProposedContent(
      'const x = 1;\nconst y = 2;\n',
      'FileEditTool',
      { file_path: '/test.ts', old_string: 'const x = 1;', new_string: 'const x = 42;' },
    );
    expect(proposed).toBe('const x = 42;\nconst y = 2;\n');
  });

  it('should compute proposed content for FileEditTool with replace_all', () => {
    const proposed = diffManager.computeProposedContent(
      'aaa bbb aaa',
      'FileEditTool',
      { file_path: '/test.ts', old_string: 'aaa', new_string: 'ccc', replace_all: true },
    );
    expect(proposed).toBe('ccc bbb ccc');
  });

  it('should track pending diffs by file path', async () => {
    expect(diffManager.getPendingDiffCount()).toBe(0);
  });

  it('should generate correct diff editor title', () => {
    const title = diffManager.getDiffTitle('/path/to/auth.ts');
    expect(title).toContain('OpenClaude');
    expect(title).toContain('auth.ts');
  });
});
```

- [ ] **Step 2: Run tests — should FAIL**

Run: `cd /Users/harshagarwal/Documents/workspace/openclaude-vscode && npx vitest run test/unit/diffManager.test.ts 2>&1 | tail -10`

Expected: `Error: Cannot find module '../../src/diff/diffManager'`

- [ ] **Step 3: Commit**

```bash
cd /Users/harshagarwal/Documents/workspace/openclaude-vscode
git add test/unit/diffManager.test.ts
git commit -m "test(diff): add failing tests for DiffManager (TDD red phase)"
```

---

## Task 5: DiffManager — Implementation

**Files:**
- Create: `src/diff/diffManager.ts`

This is the main orchestration class. It is modeled after Claude Code's `cr` function (the diff-opening flow) and `_06` function (the MCP IDE diff flow). Key patterns extracted from Claude Code:

1. **Tab title format**: `✻ [Claude Code] filename.ts` — we use `✻ [OpenClaude] filename.ts`
2. **Left URI**: Original file content loaded into leftProvider's virtual filesystem. If the real file is dirty, read from disk instead.
3. **Right URI**: Proposed content loaded into rightProvider's virtual filesystem.
4. **Race pattern**: The diff resolves by racing: (a) user clicks Accept, (b) user clicks Reject, (c) user closes the diff tab, (d) file is saved externally.
5. **Closing existing diffs**: Before opening a new diff for the same file, close any existing diff tab for that file.
6. **Accept = return `{ behavior: 'allow', updatedInput: originalInput }`** — the CLI then actually applies the file change.
7. **Reject = throw error with "User denied permission"** — the ControlRouter sends `control_response` with `subtype: error`.

- [ ] **Step 1: Create src/diff/diffManager.ts**

```typescript
// src/diff/diffManager.ts
// Orchestrates native VS Code diff editors for file edit/write permission requests.
//
// Pattern extracted from Claude Code extension.js:
//   cr() — opens vscode.diff, races accept/reject/tab-close/file-save
//   Xr() — registers acceptProposedDiff/rejectProposedDiff commands
//   vS6() — closes existing diff tabs for the same URIs
//   dg6() — sets viewingProposedDiff context variable based on visible editors
//
// Flow:
//   1. ControlRouter receives can_use_tool for FileEditTool/FileWriteTool
//   2. ControlRouter dispatches to DiffManager.handleFileToolRequest()
//   3. DiffManager reads original file content
//   4. DiffManager computes proposed content
//   5. DiffManager creates left (original) and right (proposed) virtual files
//   6. DiffManager opens vscode.diff with left and right URIs
//   7. User clicks Accept or Reject in the editor title bar (or closes tab)
//   8. DiffManager returns response → ControlRouter sends control_response to CLI

import * as vscode from 'vscode';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { DiffContentProvider } from './diffContentProvider';
import type { PendingDiff, DiffDecisionEvent } from './types';
import { isFileTool, isFileEditTool, isFileWriteTool } from './types';
import type { ControlRequestPermission } from '../types/messages';

/** Timeout for waiting for the diff tab to appear after executeCommand */
const TAB_OPEN_TIMEOUT_MS = 3000;

/** Poll interval for checking tab state */
const TAB_POLL_INTERVAL_MS = 100;

/**
 * DiffManager — shows native VS Code diff editors for file tool permission requests.
 *
 * Created during extension activation. Registered as the can_use_tool handler
 * on the ControlRouter for FileEditTool and FileWriteTool tool names.
 */
export class DiffManager implements vscode.Disposable {
  private leftProvider: DiffContentProvider;
  private rightProvider: DiffContentProvider;
  private acceptOrRejectDiffs: vscode.Event<DiffDecisionEvent>;
  private pendingDiffs = new Map<string, PendingDiff>();
  private disposables: vscode.Disposable[] = [];

  constructor(
    leftProvider: DiffContentProvider,
    rightProvider: DiffContentProvider,
    acceptOrRejectDiffs: vscode.Event<DiffDecisionEvent>,
  ) {
    this.leftProvider = leftProvider;
    this.rightProvider = rightProvider;
    this.acceptOrRejectDiffs = acceptOrRejectDiffs;
  }

  /**
   * Check whether a control_request is for a file tool that should show a diff.
   */
  isFileToolRequest(request: ControlRequestPermission): boolean {
    return isFileTool(request.tool_name);
  }

  /**
   * Handle a can_use_tool control_request for a file tool.
   * This is the async handler registered on ControlRouter.
   *
   * Returns: { behavior: 'allow', updatedInput: ... } on Accept
   * Throws: Error on Reject (ControlRouter converts to error control_response)
   *
   * @param request - The can_use_tool control_request inner
   * @param signal - AbortSignal for cancellation (from control_cancel_request)
   */
  async handleFileToolRequest(
    request: ControlRequestPermission,
    signal: AbortSignal,
  ): Promise<{ behavior: 'allow'; updatedInput: Record<string, unknown> }> {
    const input = request.input;
    const filePath = input.file_path as string;
    if (!filePath) {
      throw new Error('File tool request missing file_path');
    }

    const absolutePath = path.isAbsolute(filePath) ? filePath : filePath;

    // Step 1: Read original file content (or empty string for new files)
    const originalContent = await this.readOriginalContent(absolutePath);

    // Step 2: Compute proposed content based on tool type
    const proposedContent = this.computeProposedContent(
      originalContent,
      request.tool_name,
      input,
    );

    // Step 3: Close any existing diff tab for this file
    await this.closeExistingDiffForFile(absolutePath);

    // Step 4: Create virtual files for left (original) and right (proposed)
    const leftFile = this.leftProvider.createFile(absolutePath, originalContent);
    const rightFile = this.rightProvider.createFile(absolutePath, proposedContent);

    // Step 5: Open the native diff editor
    const diffTitle = this.getDiffTitle(absolutePath);
    const diffOptions: vscode.TextDocumentShowOptions = {
      preview: false,
      preserveFocus: true,
    };

    // Track this pending diff
    const pendingDiff: PendingDiff = {
      requestId: '', // Set by caller if needed
      filePath: absolutePath,
      toolName: request.tool_name,
      toolInput: input,
      originalContent,
      proposedContent,
      leftUri: leftFile.uri,
      rightUri: rightFile.uri,
      createdAt: Date.now(),
    };
    this.pendingDiffs.set(absolutePath, pendingDiff);

    try {
      // Open VS Code's native diff editor
      await vscode.commands.executeCommand(
        'vscode.diff',
        leftFile.uri,
        rightFile.uri,
        diffTitle,
        diffOptions,
      );

      // Wait for the diff tab to actually appear
      await this.waitForDiffTab(diffTitle);

      // Step 6: Race — wait for Accept, Reject, or tab close
      const result = await this.waitForDecision(
        diffTitle,
        rightFile.uri,
        signal,
      );

      if (result === 'accepted') {
        // Step 7a: Accept — apply changes to the real file
        await this.applyChangesToFile(absolutePath, proposedContent);

        return {
          behavior: 'allow',
          updatedInput: input,
        };
      } else {
        // Step 7b: Reject or tab closed — deny permission
        throw new Error('User denied permission');
      }
    } finally {
      // Clean up pending diff tracking
      this.pendingDiffs.delete(absolutePath);

      // Close the diff tab if it's still open
      await this.closeDiffTab(diffTitle);
    }
  }

  /**
   * Compute the proposed file content after applying the tool's changes.
   */
  computeProposedContent(
    originalContent: string,
    toolName: string,
    input: Record<string, unknown>,
  ): string {
    if (isFileWriteTool(toolName)) {
      // FileWriteTool replaces the entire file
      return (input.content as string) || '';
    }

    if (isFileEditTool(toolName)) {
      const oldString = input.old_string as string;
      const newString = input.new_string as string;
      const replaceAll = input.replace_all as boolean;

      if (oldString === undefined || newString === undefined) {
        // If old_string is empty, this is an insert at the beginning
        if (oldString === '' || oldString === undefined) {
          return newString + originalContent;
        }
        return originalContent;
      }

      if (replaceAll) {
        return originalContent.split(oldString).join(newString);
      }

      // Replace first occurrence only
      const index = originalContent.indexOf(oldString);
      if (index === -1) {
        // old_string not found — return original (the CLI handles the error)
        return originalContent;
      }

      return (
        originalContent.substring(0, index) +
        newString +
        originalContent.substring(index + oldString.length)
      );
    }

    // Unknown tool type — return original
    return originalContent;
  }

  /**
   * Get the diff editor tab title.
   * Format matches Claude Code: ✻ [OpenClaude] filename.ts
   */
  getDiffTitle(filePath: string): string {
    const fileName = path.basename(filePath);
    return `✻ [OpenClaude] ${fileName}`;
  }

  /**
   * Get the number of currently pending diffs.
   */
  getPendingDiffCount(): number {
    return this.pendingDiffs.size;
  }

  /**
   * Get a pending diff by file path.
   */
  getPendingDiff(filePath: string): PendingDiff | undefined {
    return this.pendingDiffs.get(filePath);
  }

  // ---- Private methods ----

  /**
   * Read the original content of a file.
   * If the file doesn't exist (new file), returns empty string.
   * If the file is open and dirty in VS Code, reads from disk instead.
   */
  private async readOriginalContent(filePath: string): Promise<string> {
    try {
      const uri = vscode.Uri.file(filePath);
      const doc = await vscode.workspace.openTextDocument(uri);
      if (doc.isDirty) {
        // File is dirty in the editor — read from disk to get the saved version
        return fs.readFileSync(filePath, 'utf8');
      }
      return doc.getText();
    } catch {
      // File doesn't exist — it's a new file
      try {
        return fs.readFileSync(filePath, 'utf8');
      } catch {
        return '';
      }
    }
  }

  /**
   * Wait for the diff tab to appear in the editor.
   * Polls tab groups until a tab with the given label appears or timeout.
   */
  private waitForDiffTab(tabLabel: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const startTime = Date.now();
      const interval = setInterval(() => {
        const allTabs = this.getAllTabs();
        if (allTabs.some((tab) => tab.label === tabLabel)) {
          clearInterval(interval);
          resolve();
        } else if (Date.now() - startTime > TAB_OPEN_TIMEOUT_MS) {
          clearInterval(interval);
          // Don't reject — the diff might still work even if we can't find the tab
          resolve();
        }
      }, TAB_POLL_INTERVAL_MS);
    });
  }

  /**
   * Wait for the user's accept/reject decision or tab close.
   * Returns 'accepted', 'rejected', or 'closed'.
   */
  private waitForDecision(
    tabLabel: string,
    rightUri: vscode.Uri,
    signal: AbortSignal,
  ): Promise<'accepted' | 'rejected' | 'closed'> {
    return new Promise<'accepted' | 'rejected' | 'closed'>((resolve) => {
      const disposables: vscode.Disposable[] = [];

      const cleanup = () => {
        for (const d of disposables) {
          d.dispose();
        }
      };

      // Listen for accept/reject button clicks
      disposables.push(
        this.acceptOrRejectDiffs((event) => {
          if (event.activeTab && event.activeTab.label === tabLabel) {
            cleanup();
            resolve(event.accepted ? 'accepted' : 'rejected');
          }
        }),
      );

      // Listen for tab close (user closed the diff without deciding)
      const tabCloseInterval = setInterval(() => {
        const allTabs = this.getAllTabs();
        if (!allTabs.some((tab) => tab.label === tabLabel)) {
          clearInterval(tabCloseInterval);
          cleanup();
          resolve('closed');
        }
      }, TAB_POLL_INTERVAL_MS);
      disposables.push(new vscode.Disposable(() => clearInterval(tabCloseInterval)));

      // Listen for abort (control_cancel_request from CLI)
      if (signal) {
        signal.addEventListener('abort', () => {
          cleanup();
          resolve('closed');
        });
      }
    });
  }

  /**
   * Apply the proposed content to the real file on disk.
   * Then auto-save the file if it's open in VS Code.
   */
  private async applyChangesToFile(
    filePath: string,
    proposedContent: string,
  ): Promise<void> {
    // Write to disk
    const dirPath = path.dirname(filePath);
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
    fs.writeFileSync(filePath, proposedContent, 'utf8');

    // If the file is open in VS Code, trigger a save to sync the editor
    try {
      const uri = vscode.Uri.file(filePath);
      const doc = await vscode.workspace.openTextDocument(uri);
      if (doc.isDirty) {
        await doc.save();
      }
    } catch {
      // File might not be open — that's fine
    }
  }

  /**
   * Close any existing diff tab for the given file path.
   * This prevents multiple diff tabs for the same file.
   */
  private async closeExistingDiffForFile(filePath: string): Promise<number> {
    let closedCount = 0;
    const diffTitle = this.getDiffTitle(filePath);

    for (const group of vscode.window.tabGroups.all) {
      for (const tab of group.tabs) {
        if (tab.label === diffTitle) {
          try {
            await vscode.window.tabGroups.close(tab);
            closedCount++;
          } catch {
            // Tab might already be closed
          }
        }
      }
    }

    return closedCount;
  }

  /**
   * Close a specific diff tab by label.
   */
  private async closeDiffTab(tabLabel: string): Promise<void> {
    for (const group of vscode.window.tabGroups.all) {
      for (const tab of group.tabs) {
        if (tab.label === tabLabel) {
          try {
            // If the tab is a diff tab and was accepted, save the modified document first
            if (tab.input instanceof vscode.TabInputTextDiff) {
              try {
                const doc = await vscode.workspace.openTextDocument(tab.input.modified);
                if (doc.isDirty) {
                  await doc.save();
                }
              } catch {
                // Ignore save errors
              }
            }
            await vscode.window.tabGroups.close(tab);
          } catch {
            // Tab might already be closed
          }
        }
      }
    }
  }

  /**
   * Get all tabs across all tab groups.
   */
  private getAllTabs(): vscode.Tab[] {
    return vscode.window.tabGroups.all.flatMap((group) => [...group.tabs]);
  }

  dispose(): void {
    for (const d of this.disposables) {
      d.dispose();
    }
    this.disposables = [];
    this.pendingDiffs.clear();
  }
}
```

- [ ] **Step 2: Run DiffManager tests — should all PASS**

Run: `cd /Users/harshagarwal/Documents/workspace/openclaude-vscode && npx vitest run test/unit/diffManager.test.ts 2>&1`

Expected: All tests pass (8/8 or similar)

```
 ✓ test/unit/diffManager.test.ts (8)
   ✓ DiffManager > should detect FileEditTool as a file tool
   ✓ DiffManager > should detect FileWriteTool as a file tool
   ✓ DiffManager > should not detect BashTool as a file tool
   ✓ DiffManager > should compute proposed content for FileWriteTool
   ✓ DiffManager > should compute proposed content for FileEditTool
   ✓ DiffManager > should compute proposed content for FileEditTool with replace_all
   ✓ DiffManager > should track pending diffs by file path
   ✓ DiffManager > should generate correct diff editor title
```

- [ ] **Step 3: Commit**

```bash
cd /Users/harshagarwal/Documents/workspace/openclaude-vscode
git add src/diff/diffManager.ts
git commit -m "feat(diff): implement DiffManager with accept/reject/compute logic"
```

---

## Task 6: Accept/Reject Commands and Context Variable

**Files:**
- Create: `src/diff/diffCommands.ts`

This module registers the `openclaude.acceptProposedDiff` and `openclaude.rejectProposedDiff` commands and sets the `openclaude.viewingProposedDiff` context variable. Pattern extracted from Claude Code's `Xr` function (command registration) and `dg6` function (context variable tracking).

In Claude Code:
- `Xr(K)` — registers accept/reject commands, fires EventEmitter with `{ accepted: true/false, activeTab }`.
- `dg6(K)` — watches `onDidChangeVisibleTextEditors`, checks if any editor has the right provider's scheme, sets context variable.

- [ ] **Step 1: Create src/diff/diffCommands.ts**

```typescript
// src/diff/diffCommands.ts
// Registers Accept/Reject diff commands and manages the viewingProposedDiff context variable.
//
// Pattern from Claude Code extension.js:
//   Xr(K) — registers claude-vscode.acceptProposedDiff and claude-vscode.rejectProposedDiff
//   dg6(K) — watches visible text editors, sets claude-vscode.viewingProposedDiff context

import * as vscode from 'vscode';
import type { DiffDecisionEvent } from './types';

/** URI scheme used by the right (proposed) file system provider */
const RIGHT_SCHEME = '_openclaude_fs_right';

/**
 * Register the Accept and Reject diff commands.
 * Returns an Event<DiffDecisionEvent> that fires when the user clicks either button.
 *
 * This directly mirrors Claude Code's Xr() function:
 *   function Xr(K) {
 *     let V = new O0.EventEmitter;
 *     K.push(O0.commands.registerCommand("claude-vscode.acceptProposedDiff", async () => {
 *       let B = O0.window.tabGroups.activeTabGroup.activeTab;
 *       V.fire({ accepted: true, activeTab: B });
 *     }));
 *     K.push(O0.commands.registerCommand("claude-vscode.rejectProposedDiff", async () => {
 *       let B = O0.window.tabGroups.activeTabGroup.activeTab;
 *       V.fire({ accepted: false, activeTab: B });
 *     }));
 *     return V.event;
 *   }
 */
export function registerDiffCommands(
  subscriptions: vscode.Disposable[],
): vscode.Event<DiffDecisionEvent> {
  const emitter = new vscode.EventEmitter<DiffDecisionEvent>();

  subscriptions.push(
    vscode.commands.registerCommand('openclaude.acceptProposedDiff', async () => {
      const activeTab = vscode.window.tabGroups.activeTabGroup.activeTab;
      emitter.fire({ accepted: true, activeTab });
    }),
  );

  subscriptions.push(
    vscode.commands.registerCommand('openclaude.rejectProposedDiff', async () => {
      const activeTab = vscode.window.tabGroups.activeTabGroup.activeTab;
      emitter.fire({ accepted: false, activeTab });
    }),
  );

  subscriptions.push(emitter);

  return emitter.event;
}

/**
 * Watch visible text editors and set the openclaude.viewingProposedDiff context variable.
 * This controls the visibility of Accept/Reject buttons in the editor title bar.
 *
 * The context variable is true when any visible editor has a document with the
 * right provider's scheme (meaning a proposed diff is visible).
 *
 * This directly mirrors Claude Code's dg6() function:
 *   function dg6(K) {
 *     return O6.window.onDidChangeVisibleTextEditors((V) => {
 *       let B = V.some((H) => H?.document.uri.scheme === K);
 *       O6.commands.executeCommand("setContext", "claude-vscode.viewingProposedDiff", B);
 *     });
 *   }
 */
export function watchDiffEditorVisibility(rightScheme: string): vscode.Disposable {
  return vscode.window.onDidChangeVisibleTextEditors((editors) => {
    const isViewingDiff = editors.some(
      (editor) => editor?.document.uri.scheme === rightScheme,
    );
    vscode.commands.executeCommand(
      'setContext',
      'openclaude.viewingProposedDiff',
      isViewingDiff,
    );
  });
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/harshagarwal/Documents/workspace/openclaude-vscode
git add src/diff/diffCommands.ts
git commit -m "feat(diff): register accept/reject commands and viewingProposedDiff context"
```

---

## Task 7: Wire DiffManager into Extension Activation

**Files:**
- Modify: `src/extension.ts`

This task wires up all the diff components during extension activation:
1. Create left and right `DiffContentProvider` instances
2. Register them as `FileSystemProvider`s
3. Register the accept/reject commands (returns an event)
4. Watch editor visibility for context variable
5. Create `DiffManager` with the providers and event
6. Register `DiffManager.handleFileToolRequest` as the `can_use_tool` handler on ControlRouter (for file tools)

The wiring pattern is extracted from Claude Code's activation function, which:
```javascript
let H = new $2("_claude_vscode_fs_left");
K.subscriptions.push(O6.workspace.registerFileSystemProvider(H.scheme, H));
let j = new $2("_claude_vscode_fs_right");
K.subscriptions.push(O6.workspace.registerFileSystemProvider(j.scheme, j));
let G = new FQ("_claude_vscode_fs_readonly");
K.subscriptions.push(O6.workspace.registerTextDocumentContentProvider(G.scheme, G));
K.subscriptions.push(dg6(j.scheme));
let x = Xr(K.subscriptions);
```

- [ ] **Step 1: Update src/extension.ts to wire diff components**

Add the following imports at the top of `src/extension.ts`:

```typescript
import { DiffContentProvider } from './diff/diffContentProvider';
import { DiffManager } from './diff/diffManager';
import { registerDiffCommands, watchDiffEditorVisibility } from './diff/diffCommands';
import { isFileTool } from './diff/types';
```

Add the following in the `activate()` function, after ProcessManager setup (Story 2) or after the existing command registrations:

```typescript
  // ---- Diff Viewer (Story 6) ----

  // Create virtual file system providers for diff left (original) and right (proposed)
  const diffLeftProvider = new DiffContentProvider('_openclaude_fs_left');
  context.subscriptions.push(
    vscode.workspace.registerFileSystemProvider(diffLeftProvider.scheme, diffLeftProvider),
  );

  const diffRightProvider = new DiffContentProvider('_openclaude_fs_right');
  context.subscriptions.push(
    vscode.workspace.registerFileSystemProvider(diffRightProvider.scheme, diffRightProvider),
  );

  // Watch editor visibility to set context variable for button visibility
  context.subscriptions.push(watchDiffEditorVisibility(diffRightProvider.scheme));

  // Register Accept/Reject commands — returns event that fires on button click
  const acceptOrRejectDiffs = registerDiffCommands(context.subscriptions);

  // Create DiffManager
  const diffManager = new DiffManager(diffLeftProvider, diffRightProvider, acceptOrRejectDiffs);
  context.subscriptions.push(diffManager);

  // Register DiffManager as the can_use_tool handler for file tools on the ControlRouter.
  // The ControlRouter (from Story 2) calls this handler when the CLI requests permission
  // to use FileEditTool or FileWriteTool.
  //
  // NOTE: This registration must happen AFTER ProcessManager is created (Story 2).
  // If Story 2 is not yet wired, this section can be deferred.
  // When ProcessManager is available:
  //
  //   processManager.controlRouter.registerHandler('can_use_tool', async (request, signal) => {
  //     const permRequest = request as ControlRequestPermission;
  //     if (diffManager.isFileToolRequest(permRequest)) {
  //       return diffManager.handleFileToolRequest(permRequest, signal);
  //     }
  //     // Not a file tool — fall through to the permission dialog handler (Story 7)
  //     throw new Error('Not a file tool — delegate to permission handler');
  //   });
```

- [ ] **Step 2: Remove acceptProposedDiff and rejectProposedDiff from the no-op command list**

In `src/extension.ts`, remove `'openclaude.acceptProposedDiff'` and `'openclaude.rejectProposedDiff'` from the `noopCommands` array (or `commandIds` array), since they are now registered by `registerDiffCommands`.

Before:
```typescript
  const noopCommands = [
    'openclaude.window.open',
    // ...
    'openclaude.acceptProposedDiff',
    'openclaude.rejectProposedDiff',
    // ...
  ];
```

After:
```typescript
  const noopCommands = [
    'openclaude.window.open',
    // ...
    // 'openclaude.acceptProposedDiff',  — now registered by diffCommands.ts
    // 'openclaude.rejectProposedDiff',  — now registered by diffCommands.ts
    // ...
  ];
```

- [ ] **Step 3: Build the extension**

Run: `cd /Users/harshagarwal/Documents/workspace/openclaude-vscode && node esbuild.config.mjs`

Expected: `Extension built successfully`

- [ ] **Step 4: Commit**

```bash
cd /Users/harshagarwal/Documents/workspace/openclaude-vscode
git add src/extension.ts
git commit -m "feat(diff): wire DiffManager, providers, and commands into extension activation"
```

---

## Task 8: Integration with ControlRouter (Story 2 Bridge)

**Files:**
- Create: `src/diff/diffControlHandler.ts`

This module creates the bridge between the ControlRouter (from Story 2) and the DiffManager. It registers a `can_use_tool` handler that checks if the tool is a file tool and delegates to DiffManager; otherwise, it delegates to a fallback handler (for the permission dialog in Story 7).

The key insight from Claude Code's architecture: there is a SINGLE `can_use_tool` handler registered on the ControlRouter, and it internally dispatches to either the diff viewer (for file tools) or the permission dialog (for all other tools). This module implements that dispatch.

- [ ] **Step 1: Create src/diff/diffControlHandler.ts**

```typescript
// src/diff/diffControlHandler.ts
// Bridge between ControlRouter (Story 2) and DiffManager (this story).
//
// Registers a single can_use_tool handler on the ControlRouter that:
//   1. If the tool is FileEditTool or FileWriteTool → delegate to DiffManager
//   2. Otherwise → delegate to a fallback handler (permission dialog, Story 7)
//
// This allows both the diff viewer and permission dialog to coexist
// under the same can_use_tool subtype.

import type { DiffManager } from './diffManager';
import type { ControlRequestPermission } from '../types/messages';
import type { ControlRequestHandler, WriteFn } from '../process/controlRouter';
import { isFileTool } from './types';

/**
 * Create a can_use_tool handler that dispatches file tools to DiffManager
 * and everything else to a fallback handler.
 *
 * @param diffManager - The DiffManager instance
 * @param fallbackHandler - Handler for non-file tools (permission dialog)
 *                          Can be undefined initially (Story 7 not yet implemented)
 */
export function createFileToolHandler(
  diffManager: DiffManager,
  fallbackHandler?: ControlRequestHandler,
): ControlRequestHandler {
  return async (request, signal) => {
    const permRequest = request as ControlRequestPermission;

    if (permRequest.subtype === 'can_use_tool' && isFileTool(permRequest.tool_name)) {
      // File tool → show native diff viewer
      return diffManager.handleFileToolRequest(permRequest, signal);
    }

    // Not a file tool → delegate to fallback (permission dialog)
    if (fallbackHandler) {
      return fallbackHandler(request, signal);
    }

    // No fallback handler registered yet — auto-allow
    // (Story 7 will add the permission dialog handler)
    throw new Error(`No handler for tool: ${permRequest.tool_name}`);
  };
}

/**
 * Register the file tool handler on the ControlRouter.
 *
 * Call this during extension activation after both ProcessManager (Story 2)
 * and DiffManager (Story 6) are created.
 *
 * Usage:
 *   import { ControlRouter } from '../process/controlRouter';
 *   import { registerDiffControlHandler } from './diffControlHandler';
 *
 *   registerDiffControlHandler(controlRouter, diffManager);
 *
 * When Story 7 (Permission Dialog) is implemented, update to:
 *   registerDiffControlHandler(controlRouter, diffManager, permissionHandler);
 */
export function registerDiffControlHandler(
  controlRouter: { registerHandler: (subtype: string, handler: ControlRequestHandler) => void },
  diffManager: DiffManager,
  fallbackHandler?: ControlRequestHandler,
): void {
  const handler = createFileToolHandler(diffManager, fallbackHandler);
  controlRouter.registerHandler('can_use_tool', handler);
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/harshagarwal/Documents/workspace/openclaude-vscode
git add src/diff/diffControlHandler.ts
git commit -m "feat(diff): add ControlRouter bridge for file tool dispatch"
```

---

## Task 9: Package.json Menu Contributions (Accept/Reject Buttons)

**Files:**
- Modify: `package.json`

Ensure the Accept/Reject buttons appear in the editor title bar when viewing a proposed diff. These are defined as `contributes.commands` and `contributes.menus.editor/title` entries in `package.json`.

If Story 1's package.json already has these (forked from Claude Code), verify the rebranding is correct. If not, add them.

- [ ] **Step 1: Verify/add Accept/Reject command contributions in package.json**

The following must exist in `contributes.commands`:

```json
{
  "command": "openclaude.acceptProposedDiff",
  "title": "OpenClaude: Accept Proposed Changes",
  "enablement": "openclaude.viewingProposedDiff",
  "icon": "$(check)"
},
{
  "command": "openclaude.rejectProposedDiff",
  "title": "OpenClaude: Reject Proposed Changes",
  "enablement": "openclaude.viewingProposedDiff",
  "icon": "$(discard)"
}
```

- [ ] **Step 2: Verify/add editor title menu entries in package.json**

The following must exist in `contributes.menus.editor/title`:

```json
{
  "command": "openclaude.acceptProposedDiff",
  "when": "openclaude.viewingProposedDiff",
  "group": "navigation"
},
{
  "command": "openclaude.rejectProposedDiff",
  "when": "openclaude.viewingProposedDiff",
  "group": "navigation"
}
```

These ensure:
- The checkmark (Accept) and discard (Reject) icons appear in the editor title bar
- They only show when `openclaude.viewingProposedDiff` context is true
- They are in the `navigation` group (leftmost position in title bar)

- [ ] **Step 3: Verify JSON validity**

Run: `cd /Users/harshagarwal/Documents/workspace/openclaude-vscode && node -e "JSON.parse(require('fs').readFileSync('package.json','utf8')); console.log('Valid JSON')"`

Expected: `Valid JSON`

- [ ] **Step 4: Commit (if changes were made)**

```bash
cd /Users/harshagarwal/Documents/workspace/openclaude-vscode
git add package.json
git commit -m "fix(diff): verify accept/reject command and menu contributions in package.json"
```

---

## Task 10: Integration Test — Manual Verification

**Files:** None (manual testing)

This task verifies the full diff flow end-to-end in the Extension Development Host.

- [ ] **Step 1: Build everything**

Run: `cd /Users/harshagarwal/Documents/workspace/openclaude-vscode && npm run build`

Expected: Both extension and webview build successfully

- [ ] **Step 2: Launch Extension Development Host (F5)**

In VS Code, press F5 to launch the Extension Development Host with the extension loaded.

- [ ] **Step 3: Verify Accept/Reject buttons are NOT visible by default**

Open any regular file in the Extension Development Host. The editor title bar should NOT show checkmark or discard buttons (because `openclaude.viewingProposedDiff` is false).

- [ ] **Step 4: Verify DiffContentProvider works**

Open the Debug Console in the host VS Code and run:

```javascript
// This simulates what DiffManager does — manual smoke test
const left = vscode.Uri.from({ scheme: '_openclaude_fs_left', path: '/tmp/test.ts' });
const right = vscode.Uri.from({ scheme: '_openclaude_fs_right', path: '/tmp/test.ts' });
await vscode.commands.executeCommand('vscode.diff', left, right, 'Test Diff');
```

Expected: A diff editor opens (may show empty content since we haven't populated the providers via the extension API, but it should not error).

- [ ] **Step 5: Verify context variable works**

When a diff with the `_openclaude_fs_right` scheme is visible, the Accept/Reject buttons should appear in the editor title bar. When you close the diff tab, they should disappear.

- [ ] **Step 6: Run all unit tests**

Run: `cd /Users/harshagarwal/Documents/workspace/openclaude-vscode && npx vitest run 2>&1`

Expected: All tests pass

```
 ✓ test/unit/diffContentProvider.test.ts (9)
 ✓ test/unit/diffManager.test.ts (8)
 ✓ test/unit/ndjsonTransport.test.ts (...)    // From Story 2
 ✓ test/unit/controlRouter.test.ts (...)      // From Story 2
 ✓ test/unit/processManager.test.ts (...)     // From Story 2
```

---

## Task 11: Final Commit and Verification

- [ ] **Step 1: Verify all diff files exist**

Run: `ls -la /Users/harshagarwal/Documents/workspace/openclaude-vscode/src/diff/`

Expected:
```
diffContentProvider.ts
diffManager.ts
diffCommands.ts
diffControlHandler.ts
types.ts
```

- [ ] **Step 2: Verify all test files exist**

Run: `ls -la /Users/harshagarwal/Documents/workspace/openclaude-vscode/test/unit/diffContentProvider.test.ts /Users/harshagarwal/Documents/workspace/openclaude-vscode/test/unit/diffManager.test.ts`

Expected: Both files exist

- [ ] **Step 3: Run full test suite one last time**

Run: `cd /Users/harshagarwal/Documents/workspace/openclaude-vscode && npx vitest run 2>&1`

Expected: All tests pass, zero failures

- [ ] **Step 4: Build extension**

Run: `cd /Users/harshagarwal/Documents/workspace/openclaude-vscode && npm run build`

Expected: Build succeeds with no errors

- [ ] **Step 5: Final commit (if any uncommitted changes)**

```bash
cd /Users/harshagarwal/Documents/workspace/openclaude-vscode
git add -A
git status
git commit -m "feat(diff): Story 6 complete — native diff viewer with accept/reject"
```

---

## Acceptance Criteria Traceability

| Acceptance Criterion | Implemented In | Task |
|---|---|---|
| When CLI sends tool_use for FileEditTool/FileWriteTool, show VS Code native diff | `DiffManager.handleFileToolRequest()` — opens `vscode.diff` with original and proposed content | Task 5 |
| DiffContentProvider serves original and proposed file content | `DiffContentProvider` — `FileSystemProvider` with left/right schemes | Task 3 |
| Accept button (checkmark icon) in editor title bar applies changes | `package.json` menus + `registerDiffCommands()` + `DiffManager.applyChangesToFile()` | Tasks 6, 9 |
| Reject button (discard icon) in editor title bar discards changes | `package.json` menus + `registerDiffCommands()` + DiffManager throws error on reject | Tasks 6, 9 |
| Context variable `openclaude.viewingProposedDiff` controls button visibility | `watchDiffEditorVisibility()` — sets context when right-scheme editors are visible | Task 6 |
| Multiple pending diffs supported (one per file) | `DiffManager.pendingDiffs` — `Map<string, PendingDiff>` keyed by file path | Task 5 |
| After accept/reject, send `control_response` back to CLI | `DiffManager` returns to `ControlRouter` which sends `control_response` (success or error) | Tasks 5, 8 |
| Diff editor closes after decision | `DiffManager.closeDiffTab()` in the `finally` block of `handleFileToolRequest` | Task 5 |
| Auto-save target file after accepting changes | `DiffManager.applyChangesToFile()` writes to disk + saves open editor document | Task 5 |

---

## Architecture Notes

### How Claude Code Does It (Deminified)

Claude Code uses THREE virtual file providers:
1. `$2("_claude_vscode_fs_left")` — `FileSystemProvider` for original content
2. `$2("_claude_vscode_fs_right")` — `FileSystemProvider` for proposed content (editable in diff editor)
3. `FQ("_claude_vscode_fs_readonly")` — `TextDocumentContentProvider` for readonly displays

We replicate providers 1 and 2. Provider 3 is for non-diff file displays and can be added later.

### Accept/Reject Flow Detail

```
CLI → control_request { subtype: "can_use_tool", tool_name: "FileEditTool", input: {...} }
  → ControlRouter dispatches to can_use_tool handler
    → diffControlHandler checks: isFileTool? YES
      → DiffManager.handleFileToolRequest(request, signal)
        → reads original file content
        → computes proposed content (apply old_string → new_string)
        → leftProvider.createFile(path, original)
        → rightProvider.createFile(path, proposed)
        → vscode.commands.executeCommand("vscode.diff", leftUri, rightUri, title)
        → waits for user decision (accept/reject/tab-close)

User clicks Accept (checkmark):
  → acceptProposedDiff command fires event { accepted: true, activeTab }
  → DiffManager resolves with 'accepted'
  → DiffManager.applyChangesToFile() writes proposed content to disk
  → DiffManager returns { behavior: 'allow', updatedInput: originalInput }
  → ControlRouter sends control_response { subtype: 'success', response: { behavior: 'allow', ... } }
  → Diff tab closes

User clicks Reject (discard):
  → rejectProposedDiff command fires event { accepted: false, activeTab }
  → DiffManager resolves with 'rejected'
  → DiffManager throws Error('User denied permission')
  → ControlRouter sends control_response { subtype: 'error', error: 'User denied permission' }
  → Diff tab closes
```

### Why FileSystemProvider, Not TextDocumentContentProvider

Claude Code uses `registerFileSystemProvider` (not `registerTextDocumentContentProvider`) for the left and right diff content. The reason is that `FileSystemProvider` supports `writeFile()`, which means the user can EDIT the proposed content in the diff editor before accepting. With `TextDocumentContentProvider`, the content is read-only.

This matters because the user might want to tweak the proposed changes (e.g., fix a typo in the new code) before accepting.
