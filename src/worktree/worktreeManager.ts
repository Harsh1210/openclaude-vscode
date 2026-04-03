// src/worktree/worktreeManager.ts
// Manages git worktrees: create, detect, and list.
import * as vscode from 'vscode';
import * as path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

// ── Pure helpers (exported for testing) ──────────────────────────

/**
 * Sanitize a worktree name to be safe for git branch names and filesystem paths.
 */
export function sanitizeWorktreeName(name: string): string {
  // First strip leading/trailing hyphens from the raw input
  const trimmed = name.trim().replace(/^-+|-+$/g, '');

  const sanitized = trimmed
    .replace(/\s+/g, '-')
    .replace(/\//g, '-')            // slash → hyphen (before dot handling)
    .replace(/\.{2,}/g, '-')        // consecutive dots → hyphen
    .replace(/[~^:?*\[\]\\@{}<>]/g, '-')
    .replace(/-{2,}/g, '-')         // collapse consecutive hyphens
    .replace(/^\.+|\.+$/g, '');     // no leading/trailing dots

  // If the result is only hyphens (e.g. "..." → "-"), return empty
  if (/^-+$/.test(sanitized)) return '';

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
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      vscode.window.showErrorMessage('OpenClaude: No workspace folder open. Open a folder first.');
      return;
    }
    const repoRoot = workspaceFolder.uri.fsPath;

    try {
      await execFileAsync('git', ['rev-parse', '--git-dir'], { cwd: repoRoot });
    } catch {
      vscode.window.showErrorMessage(
        'OpenClaude: Current workspace is not a git repository. Worktrees require a git repo.',
      );
      return;
    }

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

    if (!rawName) return;

    const worktreeName = sanitizeWorktreeName(rawName);
    if (!worktreeName) {
      vscode.window.showErrorMessage('OpenClaude: Invalid worktree name after sanitization.');
      return;
    }

    const worktreePath = deriveWorktreePath(repoRoot, worktreeName);

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
          await this.openWorktreeWindow(worktreePath);
        }
        return;
      }
    } catch {
      // git worktree list failed — proceed anyway
    }

    let existingBranch = false;
    try {
      await execFileAsync('git', ['rev-parse', '--verify', worktreeName], { cwd: repoRoot });
      existingBranch = true;
    } catch {
      // Branch doesn't exist — we'll create it
    }

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

    await this.openWorktreeWindow(worktreePath);

    vscode.window.showInformationMessage(
      `Worktree "${worktreeName}" created. A new OpenClaude session will start in the new window.`,
    );
  }

  private async openWorktreeWindow(worktreePath: string): Promise<void> {
    const worktreeUri = vscode.Uri.file(worktreePath);
    await vscode.commands.executeCommand('vscode.openFolder', worktreeUri, {
      forceNewWindow: true,
    });
  }

  /**
   * Detect if the current workspace is inside a git worktree (not the main tree).
   * Returns the worktree name, or null if not in a worktree.
   */
  static async detectWorktree(workspacePath: string): Promise<string | null> {
    try {
      const [topLevelResult, gitDirResult, commonDirResult] = await Promise.all([
        execFileAsync('git', ['rev-parse', '--show-toplevel'], { cwd: workspacePath }),
        execFileAsync('git', ['rev-parse', '--git-dir'], { cwd: workspacePath }),
        execFileAsync('git', ['rev-parse', '--git-common-dir'], { cwd: workspacePath }),
      ]);

      const gitDir = gitDirResult.stdout.trim();
      const commonDir = commonDirResult.stdout.trim();

      if (path.resolve(workspacePath, gitDir) !== path.resolve(workspacePath, commonDir)) {
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
          if (current.path) {
            worktrees.push(current as { path: string; branch: string; head: string; isBare: boolean });
          }
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
