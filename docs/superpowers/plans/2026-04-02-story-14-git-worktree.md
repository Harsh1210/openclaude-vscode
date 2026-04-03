# Story 14: Git Worktree Support — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the `openclaude.createWorktree` command that prompts for a worktree name, runs `git worktree add`, opens a new VS Code window in the worktree directory, and spawns a separate OpenClaude session there. Also support CLI `--worktree <name>` flag.

**Architecture:** `WorktreeManager` is a host-side class that validates the current workspace is a git repo, prompts the user for a worktree name via `vscode.window.showInputBox`, derives a safe filesystem path, executes `git worktree add` via `child_process.execFile`, opens the new directory in a fresh VS Code window via `vscode.commands.executeCommand('vscode.openFolder')`, and passes worktree context so the new window's OpenClaude extension spawns the CLI with `--worktree <name>`.

**Tech Stack:** TypeScript 5.x, VS Code Extension API, Node.js `child_process`, Vitest

**Spec:** [2026-04-02-openclaude-vscode-extension-design.md](../specs/2026-04-02-openclaude-vscode-extension-design.md) — Story 14, Sections 2.1, 2.2, 4.7 (worktree settings), 5.2

**Depends on:** Story 2 (ProcessManager — for spawning CLI with `--worktree` flag)

---

## File Structure

| File | Responsibility |
|---|---|
| `src/worktree/worktreeManager.ts` | Validate repo, prompt name, run `git worktree add`, open window, pass worktree context |
| `test/unit/worktreeManager.test.ts` | Unit tests for name sanitization, path derivation, git command construction |
| `src/extension.ts` | Instantiate WorktreeManager, wire `openclaude.createWorktree` command |

---

## Task 1: Worktree Helpers and Unit Tests

**Files:**
- Create: `test/unit/worktreeManager.test.ts`

- [ ] **Step 1: Write unit tests for pure helper functions**

```typescript
// test/unit/worktreeManager.test.ts
import { describe, it, expect } from 'vitest';

describe('WorktreeManager helpers', () => {
  describe('sanitizeWorktreeName', () => {
    it('should allow simple alphanumeric names', async () => {
      const { sanitizeWorktreeName } = await import('../../src/worktree/worktreeManager');

      expect(sanitizeWorktreeName('feature-auth')).toBe('feature-auth');
      expect(sanitizeWorktreeName('fix_bug_123')).toBe('fix_bug_123');
    });

    it('should replace spaces with hyphens', async () => {
      const { sanitizeWorktreeName } = await import('../../src/worktree/worktreeManager');

      expect(sanitizeWorktreeName('my feature branch')).toBe('my-feature-branch');
    });

    it('should remove unsafe characters', async () => {
      const { sanitizeWorktreeName } = await import('../../src/worktree/worktreeManager');

      expect(sanitizeWorktreeName('feat/new..thing')).toBe('feat-new-thing');
      expect(sanitizeWorktreeName('test@{something}')).toBe('test-something-');
      expect(sanitizeWorktreeName('branch~1^2')).toBe('branch-1-2');
    });

    it('should reject empty names after sanitization', async () => {
      const { sanitizeWorktreeName } = await import('../../src/worktree/worktreeManager');

      expect(sanitizeWorktreeName('')).toBe('');
      expect(sanitizeWorktreeName('...')).toBe('');
    });

    it('should trim leading/trailing hyphens', async () => {
      const { sanitizeWorktreeName } = await import('../../src/worktree/worktreeManager');

      expect(sanitizeWorktreeName('-feature-')).toBe('feature');
    });
  });

  describe('deriveWorktreePath', () => {
    it('should place worktree as sibling of repo root', async () => {
      const { deriveWorktreePath } = await import('../../src/worktree/worktreeManager');

      expect(deriveWorktreePath('/home/user/myrepo', 'feature-auth')).toBe(
        '/home/user/myrepo-worktrees/feature-auth',
      );
    });

    it('should use custom base dir if provided', async () => {
      const { deriveWorktreePath } = await import('../../src/worktree/worktreeManager');

      expect(deriveWorktreePath('/home/user/myrepo', 'fix', '/tmp/worktrees')).toBe(
        '/tmp/worktrees/fix',
      );
    });
  });

  describe('buildGitWorktreeArgs', () => {
    it('should build correct git worktree add arguments', async () => {
      const { buildGitWorktreeArgs } = await import('../../src/worktree/worktreeManager');

      const args = buildGitWorktreeArgs('/path/to/worktree', 'feature-auth');

      expect(args).toEqual(['worktree', 'add', '/path/to/worktree', '-b', 'feature-auth']);
    });

    it('should support creating from existing branch', async () => {
      const { buildGitWorktreeArgs } = await import('../../src/worktree/worktreeManager');

      const args = buildGitWorktreeArgs('/path/to/worktree', 'feature-auth', { existingBranch: true });

      expect(args).toEqual(['worktree', 'add', '/path/to/worktree', 'feature-auth']);
    });
  });
});
```

- [ ] **Step 2: Run tests and confirm failure**

Run: `cd /Users/harshagarwal/Documents/workspace/openclaude-vscode && npx vitest run test/unit/worktreeManager.test.ts 2>&1 | head -15`

Expected: Failures (module not found)

- [ ] **Step 3: Commit test file**

```bash
git add test/unit/worktreeManager.test.ts
git commit -m "test(worktree): add unit tests for worktree name sanitization and path derivation"
```

---

## Task 2: Implement WorktreeManager

**Files:**
- Create: `src/worktree/worktreeManager.ts`

- [ ] **Step 1: Implement the WorktreeManager class with pure helpers and VS Code integration**

```typescript
// src/worktree/worktreeManager.ts
import * as vscode from 'vscode';
import * as path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

// ── Pure helpers (exported for testing) ──────────────────────────

/**
 * Sanitize a worktree name to be safe for git branch names and filesystem paths.
 * Git branch naming rules: no spaces, no .., no ~, no ^, no :, no ?, no *, no [,
 * no \, no ASCII control chars, cannot start/end with . or /, no consecutive dots.
 */
export function sanitizeWorktreeName(name: string): string {
  let sanitized = name
    .trim()
    .replace(/\s+/g, '-')           // spaces → hyphens
    .replace(/\.{2,}/g, '')         // remove consecutive dots
    .replace(/[~^:?*\[\]\\@{}<>]/g, '-') // remove git-unsafe chars
    .replace(/\/{2,}/g, '-')        // consecutive slashes → hyphen
    .replace(/\//g, '-')            // single slash → hyphen
    .replace(/-{2,}/g, '-')         // collapse consecutive hyphens
    .replace(/^\.+|\.+$/g, '')      // no leading/trailing dots
    .replace(/^-+|-+$/g, '');       // no leading/trailing hyphens

  return sanitized;
}

/**
 * Derive the filesystem path for a new worktree.
 * Default: <repoRoot>-worktrees/<name>
 * Custom: <baseDir>/<name>
 */
export function deriveWorktreePath(
  repoRoot: string,
  worktreeName: string,
  customBaseDir?: string,
): string {
  const baseDir = customBaseDir || `${repoRoot}-worktrees`;
  return path.join(baseDir, worktreeName);
}

/**
 * Build git worktree add command arguments.
 */
export function buildGitWorktreeArgs(
  worktreePath: string,
  branchName: string,
  options?: { existingBranch?: boolean },
): string[] {
  if (options?.existingBranch) {
    return ['worktree', 'add', worktreePath, branchName];
  }
  return ['worktree', 'add', worktreePath, '-b', branchName];
}

// ── VS Code WorktreeManager ─────────────────────────────────────

export class WorktreeManager implements vscode.Disposable {
  private disposables: vscode.Disposable[] = [];

  constructor() {}

  /**
   * Full create-worktree flow:
   * 1. Validate we're in a git repo
   * 2. Prompt for worktree name
   * 3. Run git worktree add
   * 4. Open new VS Code window in worktree
   */
  async createWorktree(): Promise<void> {
    // 1. Get workspace root
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      vscode.window.showErrorMessage('OpenClaude: No workspace folder open. Open a folder first.');
      return;
    }
    const repoRoot = workspaceFolder.uri.fsPath;

    // 2. Verify this is a git repository
    try {
      await execFileAsync('git', ['rev-parse', '--git-dir'], { cwd: repoRoot });
    } catch {
      vscode.window.showErrorMessage(
        'OpenClaude: Current workspace is not a git repository. Worktrees require a git repo.',
      );
      return;
    }

    // 3. Prompt for worktree name
    const rawName = await vscode.window.showInputBox({
      prompt: 'Enter a name for the new worktree (will also create a branch)',
      placeHolder: 'feature-my-feature',
      validateInput: (value) => {
        const sanitized = sanitizeWorktreeName(value);
        if (!sanitized) return 'Please enter a valid name (alphanumeric, hyphens, underscores)';
        if (sanitized !== value) return `Name will be sanitized to: ${sanitized}`;
        return undefined;
      },
    });

    if (!rawName) return; // User cancelled

    const worktreeName = sanitizeWorktreeName(rawName);
    if (!worktreeName) {
      vscode.window.showErrorMessage('OpenClaude: Invalid worktree name after sanitization.');
      return;
    }

    // 4. Read worktree settings for custom base dir
    const config = vscode.workspace.getConfiguration('openclaudeCode');
    // Settings path: worktree.baseDir in .claude/settings.json (not VS Code settings)
    // For now, use the default sibling directory pattern
    const worktreePath = deriveWorktreePath(repoRoot, worktreeName);

    // 5. Check if worktree already exists
    try {
      const { stdout } = await execFileAsync('git', ['worktree', 'list', '--porcelain'], {
        cwd: repoRoot,
      });
      if (stdout.includes(worktreePath)) {
        const action = await vscode.window.showWarningMessage(
          `Worktree "${worktreeName}" already exists at ${worktreePath}`,
          'Open Existing',
          'Cancel',
        );
        if (action === 'Open Existing') {
          await this.openWorktreeWindow(worktreePath, worktreeName);
        }
        return;
      }
    } catch {
      // git worktree list failed — proceed anyway
    }

    // 6. Check if branch already exists
    let existingBranch = false;
    try {
      await execFileAsync('git', ['rev-parse', '--verify', worktreeName], { cwd: repoRoot });
      existingBranch = true;
    } catch {
      // Branch doesn't exist — we'll create it
    }

    // 7. Run git worktree add
    const gitArgs = buildGitWorktreeArgs(worktreePath, worktreeName, { existingBranch });

    try {
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: `Creating worktree "${worktreeName}"...`,
          cancellable: false,
        },
        async () => {
          await execFileAsync('git', gitArgs, { cwd: repoRoot });
        },
      );
    } catch (err) {
      const errorMsg = (err as { stderr?: string }).stderr || (err as Error).message;
      vscode.window.showErrorMessage(`OpenClaude: Failed to create worktree: ${errorMsg}`);
      return;
    }

    // 8. Open new window in worktree directory
    await this.openWorktreeWindow(worktreePath, worktreeName);

    vscode.window.showInformationMessage(
      `Worktree "${worktreeName}" created. A new OpenClaude session will start in the new window.`,
    );
  }

  /**
   * Open worktree in a new VS Code window.
   * The new window's OpenClaude extension will detect the worktree context
   * and spawn CLI with --worktree <name>.
   */
  private async openWorktreeWindow(worktreePath: string, worktreeName: string): Promise<void> {
    const worktreeUri = vscode.Uri.file(worktreePath);

    // Open in a new window (forceNewWindow: true)
    await vscode.commands.executeCommand('vscode.openFolder', worktreeUri, {
      forceNewWindow: true,
    });
  }

  /**
   * Detect if the current workspace is inside a git worktree (not the main tree).
   * Used at extension activation to determine if we should pass --worktree to CLI.
   */
  static async detectWorktree(workspacePath: string): Promise<string | null> {
    try {
      // git rev-parse --show-toplevel gives the worktree root
      // git rev-parse --git-common-dir gives the main .git directory
      const [topLevelResult, gitDirResult, commonDirResult] = await Promise.all([
        execFileAsync('git', ['rev-parse', '--show-toplevel'], { cwd: workspacePath }),
        execFileAsync('git', ['rev-parse', '--git-dir'], { cwd: workspacePath }),
        execFileAsync('git', ['rev-parse', '--git-common-dir'], { cwd: workspacePath }),
      ]);

      const gitDir = gitDirResult.stdout.trim();
      const commonDir = commonDirResult.stdout.trim();

      // If git-dir !== git-common-dir, we're in a worktree
      if (path.resolve(workspacePath, gitDir) !== path.resolve(workspacePath, commonDir)) {
        // Extract worktree name from the path
        const topLevel = topLevelResult.stdout.trim();
        return path.basename(topLevel);
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * List all worktrees for the current repository.
   */
  static async listWorktrees(
    repoRoot: string,
  ): Promise<Array<{ path: string; branch: string; head: string; isBare: boolean }>> {
    try {
      const { stdout } = await execFileAsync('git', ['worktree', 'list', '--porcelain'], {
        cwd: repoRoot,
      });

      const worktrees: Array<{ path: string; branch: string; head: string; isBare: boolean }> = [];
      let current: Partial<{ path: string; branch: string; head: string; isBare: boolean }> = {};

      for (const line of stdout.split('\n')) {
        if (line.startsWith('worktree ')) {
          if (current.path) worktrees.push(current as { path: string; branch: string; head: string; isBare: boolean });
          current = { path: line.slice('worktree '.length), branch: '', head: '', isBare: false };
        } else if (line.startsWith('HEAD ')) {
          current.head = line.slice('HEAD '.length);
        } else if (line.startsWith('branch ')) {
          current.branch = line.slice('branch '.length).replace('refs/heads/', '');
        } else if (line === 'bare') {
          current.isBare = true;
        } else if (line === '' && current.path) {
          worktrees.push(current as { path: string; branch: string; head: string; isBare: boolean });
          current = {};
        }
      }
      if (current.path) {
        worktrees.push(current as { path: string; branch: string; head: string; isBare: boolean });
      }

      return worktrees;
    } catch {
      return [];
    }
  }

  dispose(): void {
    for (const d of this.disposables) {
      d.dispose();
    }
  }
}
```

- [ ] **Step 2: Run tests and confirm PASS**

Run: `cd /Users/harshagarwal/Documents/workspace/openclaude-vscode && npx vitest run test/unit/worktreeManager.test.ts`

Expected: All tests pass

- [ ] **Step 3: Commit**

```bash
git add src/worktree/worktreeManager.ts
git commit -m "feat(worktree): implement WorktreeManager with create, detect, and list"
```

---

## Task 3: Wire Command and Worktree Detection Into Extension Host

**Files:**
- Modify: `src/extension.ts`
- Modify: `src/process/processManager.ts` (if exists, to add `--worktree` flag)

- [ ] **Step 1: Instantiate WorktreeManager and replace placeholder command**

Add to `src/extension.ts`:

```typescript
// ── In activate() ────────────────────────────────────────────────

import { WorktreeManager } from './worktree/worktreeManager';

const worktreeManager = new WorktreeManager();
context.subscriptions.push(worktreeManager);

// Replace the placeholder openclaude.createWorktree command
const createWorktreeCmd = vscode.commands.registerCommand('openclaude.createWorktree', () => {
  worktreeManager.createWorktree();
});
context.subscriptions.push(createWorktreeCmd);
```

- [ ] **Step 2: Detect worktree at activation and pass flag to CLI**

```typescript
// ── In activate(), before spawning CLI ───────────────────────────

const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
let worktreeName: string | null = null;

if (workspacePath) {
  worktreeName = await WorktreeManager.detectWorktree(workspacePath);
  if (worktreeName) {
    console.log(`[OpenClaude] Detected git worktree: ${worktreeName}`);
  }
}

// ── When building CLI spawn args (in ProcessManager) ─────────────
// Add to the args array that processManager uses:

function buildCliArgs(options: {
  outputFormat: string;
  inputFormat: string;
  model?: string;
  permissionMode?: string;
  worktree?: string | null;
  resumeSession?: string;
}): string[] {
  const args = [
    '--output-format', options.outputFormat,
    '--input-format', options.inputFormat,
  ];

  if (options.model && options.model !== 'default') {
    args.push('--model', options.model);
  }

  if (options.permissionMode) {
    args.push('--permission-mode', options.permissionMode);
  }

  if (options.worktree) {
    args.push('--worktree', options.worktree);
  }

  if (options.resumeSession) {
    args.push('--resume', options.resumeSession);
  }

  return args;
}
```

- [ ] **Step 3: Build and verify**

Run: `cd /Users/harshagarwal/Documents/workspace/openclaude-vscode && npm run build`

Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add src/extension.ts
git commit -m "feat(worktree): wire createWorktree command and worktree detection"
```

---

## Final Verification

- [ ] Run: `npm run build`
- [ ] Run: `npx vitest run test/unit/worktreeManager.test.ts`
- [ ] Manual: F5 launch → run `openclaude.createWorktree` from Command Palette
- [ ] Manual: verify input prompt appears for worktree name
- [ ] Manual: verify `git worktree add` executes and new VS Code window opens in worktree dir
- [ ] Manual: verify the new window's OpenClaude extension detects the worktree and includes `--worktree` in CLI spawn args (check debug console)
- [ ] Manual: verify duplicate worktree names show "Open Existing" option
- [ ] Manual: verify non-git workspaces show appropriate error message
