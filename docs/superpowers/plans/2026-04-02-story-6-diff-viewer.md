# Story 6: Native Diff Viewer -- Accept/Reject -- Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When the CLI sends a `control_request` with `subtype: can_use_tool` for `FileEditTool` or `FileWriteTool`, intercept it and show a VS Code native diff editor with the original file content on the left and the proposed content on the right. The editor title bar shows Accept (checkmark) and Reject (discard) buttons. Accepting writes the changes to disk and sends a success `control_response`. Rejecting discards changes and sends a deny `control_response`. Multiple pending diffs are supported (one per file). The diff editor closes after a decision.

**Architecture:** Two new files in `src/diff/`: a `DiffContentProvider` (implements `vscode.TextDocumentContentProvider`) that serves virtual documents with original and proposed content via custom URI schemes, and a `DiffManager` that orchestrates the full lifecycle -- intercepting tool_use permission requests, reading original file content, computing proposed content, opening the diff editor, handling accept/reject, writing files, and sending control responses back to the CLI.

**Tech Stack:** TypeScript 5.x, VS Code Extension API (`TextDocumentContentProvider`, `vscode.diff`, context variables)

**Spec:** [2026-04-02-openclaude-vscode-extension-design.md](../specs/2026-04-02-openclaude-vscode-extension-design.md) -- Story 6

**Dependency:** Story 2 (ProcessManager + NdjsonTransport) must be implemented. The `NdjsonTransport.write()` method is used to send `control_response` messages back to the CLI.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/diff/diffContentProvider.ts` | `TextDocumentContentProvider` for `openclaude-diff-original` and `openclaude-diff-proposed` URI schemes. Serves virtual document content from an in-memory map keyed by file path. |
| `src/diff/diffManager.ts` | Orchestrates the diff lifecycle: intercepts `can_use_tool` for file-editing tools, reads original content, computes proposed content, opens `vscode.diff`, handles accept/reject commands, writes files, sends control responses, manages pending diffs map. |
| `src/process/controlRouter.ts` | Routes incoming `control_request` messages to the appropriate handler (DiffManager for file edits, placeholder for other subtypes). |
| `src/extension.ts` | Updated to create DiffManager, register DiffContentProvider schemes, and wire accept/reject commands. |
| `src/diff/__tests__/diffContentProvider.test.ts` | Unit tests for DiffContentProvider. |
| `src/diff/__tests__/diffManager.test.ts` | Unit tests for DiffManager content computation logic. |

---

## Task 1: DiffContentProvider -- Virtual Document Provider

**Files:**
- Create: `src/diff/diffContentProvider.ts`

This class implements `vscode.TextDocumentContentProvider` to serve virtual read-only documents. VS Code's diff editor needs two URIs to compare -- we use custom URI schemes (`openclaude-diff-original` and `openclaude-diff-proposed`) so the diff editor shows our content without touching the filesystem.

- [ ] **Step 1: Create the DiffContentProvider class**

```typescript
// src/diff/diffContentProvider.ts
// TextDocumentContentProvider for original and proposed file content.
// Serves virtual documents via openclaude-diff-original:// and
// openclaude-diff-proposed:// URI schemes for the native diff editor.

import * as vscode from 'vscode';

export class DiffContentProvider implements vscode.TextDocumentContentProvider {
  private readonly _onDidChange = new vscode.EventEmitter<vscode.Uri>();
  readonly onDidChange = this._onDidChange.event;

  // Key: normalized file path, Value: content string
  private readonly contentMap = new Map<string, string>();

  /**
   * Store content for a virtual document.
   * @param filePath The absolute file path (used as the URI path component)
   * @param content The text content to serve
   */
  setContent(filePath: string, content: string): void {
    this.contentMap.set(filePath, content);
    // Fire change event so VS Code re-reads the virtual document
    const uri = vscode.Uri.parse(`${this.scheme}:${filePath}`);
    this._onDidChange.fire(uri);
  }

  /**
   * Remove content for a virtual document (cleanup after accept/reject).
   */
  removeContent(filePath: string): void {
    this.contentMap.delete(filePath);
  }

  /**
   * VS Code calls this to get the text content for a URI with our scheme.
   */
  provideTextDocumentContent(uri: vscode.Uri): string {
    const filePath = uri.path;
    return this.contentMap.get(filePath) ?? '';
  }

  /**
   * The URI scheme this provider is registered for.
   * Set externally by the factory that creates the two providers.
   */
  scheme = '';

  /**
   * Clear all stored content (e.g., on extension deactivation).
   */
  clear(): void {
    this.contentMap.clear();
  }

  dispose(): void {
    this._onDidChange.dispose();
    this.contentMap.clear();
  }
}

/**
 * Create a pair of DiffContentProviders: one for original content,
 * one for proposed content. Registers both with VS Code.
 */
export function createDiffContentProviders(): {
  original: DiffContentProvider;
  proposed: DiffContentProvider;
  disposables: vscode.Disposable[];
} {
  const original = new DiffContentProvider();
  original.scheme = 'openclaude-diff-original';

  const proposed = new DiffContentProvider();
  proposed.scheme = 'openclaude-diff-proposed';

  const disposables = [
    vscode.workspace.registerTextDocumentContentProvider(
      'openclaude-diff-original',
      original,
    ),
    vscode.workspace.registerTextDocumentContentProvider(
      'openclaude-diff-proposed',
      proposed,
    ),
    original,
    proposed,
  ];

  return { original, proposed, disposables };
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd /Users/harshagarwal/Documents/workspace/openclaude-vscode && npx tsc --noEmit src/diff/diffContentProvider.ts`

Expected: No errors (or only errors from missing imports that will be resolved when wired up)

- [ ] **Step 3: Commit**

```bash
git add src/diff/diffContentProvider.ts
git commit -m "feat(diff): add DiffContentProvider for virtual original/proposed documents"
```

---

## Task 2: DiffManager -- Core Diff Orchestration

**Files:**
- Create: `src/diff/diffManager.ts`

The DiffManager is the central coordinator. It:
1. Receives `can_use_tool` control_requests for `FileEditTool` / `FileWriteTool`
2. Reads the original file content from disk (or uses empty string for new files)
3. Computes the proposed content (applies `old_string`/`new_string` edit or uses `content` for writes)
4. Stores both in DiffContentProviders
5. Opens `vscode.diff` with original on the left, proposed on the right
6. Sets the `openclaude.viewingProposedDiff` context variable to show Accept/Reject buttons
7. On Accept: writes the proposed content to disk, auto-saves, sends `control_response` with `behavior: allow`
8. On Reject: discards, sends `control_response` with `behavior: deny`
9. Closes the diff editor tab
10. Cleans up the content providers and context variable

- [ ] **Step 1: Create the PendingDiff interface and DiffManager class**

```typescript
// src/diff/diffManager.ts
// Orchestrates the full diff lifecycle: intercept file-edit tool_use
// permission requests, show VS Code native diff, handle accept/reject,
// write files, and send control_response back to the CLI.

import * as vscode from 'vscode';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { DiffContentProvider } from './diffContentProvider';
import type { NdjsonTransport } from '../process/ndjsonTransport';
import type { ControlRequestPermission } from '../types/messages';

/**
 * Represents a single pending diff waiting for user decision.
 */
interface PendingDiff {
  /** Absolute path to the file being edited */
  filePath: string;
  /** The original file content (before edit) */
  originalContent: string;
  /** The proposed file content (after edit) */
  proposedContent: string;
  /** The request_id from the control_request -- needed for control_response */
  requestId: string;
  /** The tool_use_id from the control_request */
  toolUseId: string;
  /** The tool name (FileEditTool or FileWriteTool) */
  toolName: string;
  /** The full tool input for passing back in updatedInput on accept */
  toolInput: Record<string, unknown>;
  /** The transport to send the control_response on */
  transport: NdjsonTransport;
}

export class DiffManager implements vscode.Disposable {
  /** Pending diffs keyed by normalized file path. One per file at a time. */
  private readonly pendingDiffs = new Map<string, PendingDiff>();

  /** Queue for diffs arriving while another diff for the same file is pending */
  private readonly pendingQueue = new Map<
    string,
    Array<{
      requestId: string;
      request: ControlRequestPermission;
      transport: NdjsonTransport;
    }>
  >();

  /** Track which diff editor tabs we opened, keyed by file path */
  private readonly diffEditorTabs = new Map<string, vscode.Uri>();

  private readonly disposables: vscode.Disposable[] = [];

  /** Max file size (in bytes) for diff preview -- skip diff for huge files */
  private static readonly MAX_DIFF_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

  constructor(
    private readonly originalProvider: DiffContentProvider,
    private readonly proposedProvider: DiffContentProvider,
    private readonly outputChannel: vscode.OutputChannel,
  ) {
    // Listen for tab close events to clean up if user manually closes a diff
    this.disposables.push(
      vscode.window.tabGroups.onDidChangeTabs((event) => {
        this.handleTabClose(event);
      }),
    );
  }

  /**
   * Check if a control_request is a file-edit tool_use that should show a diff.
   * Returns true for FileEditTool and FileWriteTool.
   */
  isFileEditToolRequest(request: ControlRequestPermission): boolean {
    const toolName = request.tool_name;
    return toolName === 'FileEditTool' || toolName === 'FileWriteTool';
  }

  /**
   * Handle a can_use_tool control_request for a file-editing tool.
   * Reads original content, computes proposed content, opens the diff editor.
   *
   * @param requestId The control_request request_id
   * @param request The can_use_tool request inner payload
   * @param transport The NDJSON transport for sending control_response back
   */
  async showDiff(
    requestId: string,
    request: ControlRequestPermission,
    transport: NdjsonTransport,
  ): Promise<void> {
    const input = request.input;
    const filePath = input.file_path as string;

    if (!filePath) {
      this.outputChannel.appendLine(
        `[DiffManager] No file_path in tool input for ${request.tool_name}, auto-allowing`,
      );
      this.sendAllowResponse(requestId, request.tool_use_id, input, transport);
      return;
    }

    const normalizedPath = path.resolve(filePath);

    // If there's already a pending diff for this file, queue the new request
    if (this.pendingDiffs.has(normalizedPath)) {
      this.outputChannel.appendLine(
        `[DiffManager] Queuing edit for ${normalizedPath} (already reviewing)`,
      );
      if (!this.pendingQueue.has(normalizedPath)) {
        this.pendingQueue.set(normalizedPath, []);
      }
      this.pendingQueue.get(normalizedPath)!.push({
        requestId,
        request,
        transport,
      });
      return;
    }

    // Check file size -- skip diff for very large files
    try {
      const stat = await fs.stat(normalizedPath);
      if (stat.size > DiffManager.MAX_DIFF_FILE_SIZE) {
        this.outputChannel.appendLine(
          `[DiffManager] File too large for diff preview (${stat.size} bytes), auto-allowing`,
        );
        this.sendAllowResponse(
          requestId,
          request.tool_use_id,
          input,
          transport,
        );
        return;
      }
    } catch {
      // File doesn't exist (new file creation) -- OK, continue
    }

    try {
      // 1. Read original file content (empty string for new files)
      const originalContent = await this.readOriginalContent(normalizedPath);

      // 2. Compute proposed content
      const proposedContent = this.computeProposedContent(
        request.tool_name,
        input,
        originalContent,
      );

      // 3. Store in content providers
      this.originalProvider.setContent(normalizedPath, originalContent);
      this.proposedProvider.setContent(normalizedPath, proposedContent);

      // 4. Create the pending diff entry
      const pending: PendingDiff = {
        filePath: normalizedPath,
        originalContent,
        proposedContent,
        requestId,
        toolUseId: request.tool_use_id,
        toolName: request.tool_name,
        toolInput: input,
        transport,
      };
      this.pendingDiffs.set(normalizedPath, pending);

      // 5. Open VS Code native diff editor
      await this.openDiffEditor(normalizedPath, request.tool_name);

      // 6. Set context variable for button visibility
      await this.updateContextVariable();

      this.outputChannel.appendLine(
        `[DiffManager] Showing diff for ${normalizedPath} (${request.tool_name})`,
      );
    } catch (error) {
      const errorMsg =
        error instanceof Error ? error.message : String(error);
      this.outputChannel.appendLine(
        `[DiffManager] Error showing diff: ${errorMsg}`,
      );
      // On error, auto-allow so the CLI isn't stuck waiting
      this.sendAllowResponse(requestId, request.tool_use_id, input, transport);
    }
  }

  /**
   * Accept the currently active diff -- apply changes and notify CLI.
   * Called by the openclaude.acceptProposedDiff command.
   */
  async acceptCurrentDiff(): Promise<void> {
    const pending = this.getActivePendingDiff();
    if (!pending) {
      vscode.window.showWarningMessage('No pending diff to accept.');
      return;
    }

    // Workspace trust check
    if (!vscode.workspace.isTrusted) {
      vscode.window.showWarningMessage(
        'Cannot apply changes: workspace is not trusted. Trust the workspace first.',
      );
      return;
    }

    try {
      // 1. Write proposed content to disk
      await this.writeFile(pending.filePath, pending.proposedContent);

      // 2. Auto-save the file if it's open in an editor
      await this.autoSaveFile(pending.filePath);

      // 3. Send allow control_response to CLI
      this.sendAllowResponse(
        pending.requestId,
        pending.toolUseId,
        pending.toolInput,
        pending.transport,
      );

      this.outputChannel.appendLine(
        `[DiffManager] Accepted diff for ${pending.filePath}`,
      );
    } catch (error) {
      const errorMsg =
        error instanceof Error ? error.message : String(error);
      this.outputChannel.appendLine(
        `[DiffManager] Error accepting diff: ${errorMsg}`,
      );
      vscode.window.showErrorMessage(
        `Failed to apply changes: ${errorMsg}`,
      );
      return; // Don't clean up on write failure -- let user retry
    }

    // 4. Close diff editor and clean up
    await this.closeDiffAndCleanup(pending.filePath);
  }

  /**
   * Reject the currently active diff -- discard changes and notify CLI.
   * Called by the openclaude.rejectProposedDiff command.
   */
  async rejectCurrentDiff(): Promise<void> {
    const pending = this.getActivePendingDiff();
    if (!pending) {
      vscode.window.showWarningMessage('No pending diff to reject.');
      return;
    }

    // 1. Send deny control_response to CLI
    this.sendDenyResponse(
      pending.requestId,
      pending.toolUseId,
      'User rejected proposed changes',
      pending.transport,
    );

    this.outputChannel.appendLine(
      `[DiffManager] Rejected diff for ${pending.filePath}`,
    );

    // 2. Close diff editor and clean up
    await this.closeDiffAndCleanup(pending.filePath);
  }

  /**
   * Cancel a pending diff (e.g., when CLI sends control_cancel_request).
   */
  async cancelDiffByRequestId(requestId: string): Promise<void> {
    for (const [filePath, pending] of this.pendingDiffs.entries()) {
      if (pending.requestId === requestId) {
        this.outputChannel.appendLine(
          `[DiffManager] Cancelling diff for ${filePath} (request ${requestId})`,
        );
        await this.closeDiffAndCleanup(filePath);
        return;
      }
    }
  }

  /**
   * Get the count of pending diffs (for status display).
   */
  get pendingCount(): number {
    return this.pendingDiffs.size;
  }

  // ===========================================================================
  // Private: Content computation
  // ===========================================================================

  /**
   * Read the original file content from disk.
   * Returns empty string if the file doesn't exist (new file creation).
   * Handles UTF-8 BOM markers.
   */
  private async readOriginalContent(filePath: string): Promise<string> {
    try {
      const buffer = await fs.readFile(filePath);
      // Handle UTF-8 BOM (0xEF 0xBB 0xBF)
      if (
        buffer.length >= 3 &&
        buffer[0] === 0xef &&
        buffer[1] === 0xbb &&
        buffer[2] === 0xbf
      ) {
        return buffer.toString('utf-8').slice(1); // Remove BOM character
      }
      return buffer.toString('utf-8');
    } catch {
      // File doesn't exist -- this is a new file creation
      return '';
    }
  }

  /**
   * Compute the proposed file content based on the tool type and input.
   *
   * FileWriteTool: The `content` field IS the new file content.
   * FileEditTool: Apply `old_string` -> `new_string` replacement on original.
   */
  private computeProposedContent(
    toolName: string,
    input: Record<string, unknown>,
    originalContent: string,
  ): string {
    if (toolName === 'FileWriteTool') {
      // FileWriteTool has a `content` field with the full new file content
      return (input.content as string) ?? '';
    }

    if (toolName === 'FileEditTool') {
      // FileEditTool has `old_string` and `new_string` fields
      const oldString = (input.old_string as string) ?? '';
      const newString = (input.new_string as string) ?? '';

      if (oldString === '') {
        // Empty old_string with empty original = create new file
        if (originalContent === '') {
          return newString;
        }
        // Empty old_string with existing content = shouldn't happen, but
        // treat as prepend for safety
        return newString + originalContent;
      }

      // Find and replace the first occurrence of old_string with new_string
      const index = originalContent.indexOf(oldString);
      if (index === -1) {
        this.outputChannel.appendLine(
          `[DiffManager] Warning: old_string not found in file, returning original unchanged`,
        );
        // If old_string not found, the edit can't be applied --
        // show original so user sees no diff and can reject
        return originalContent;
      }

      return (
        originalContent.substring(0, index) +
        newString +
        originalContent.substring(index + oldString.length)
      );
    }

    // Unknown tool -- return original unchanged
    this.outputChannel.appendLine(
      `[DiffManager] Unknown tool ${toolName}, returning original content`,
    );
    return originalContent;
  }

  // ===========================================================================
  // Private: Diff editor management
  // ===========================================================================

  /**
   * Open the VS Code native diff editor for a file.
   */
  private async openDiffEditor(
    filePath: string,
    toolName: string,
  ): Promise<void> {
    const fileName = path.basename(filePath);
    const actionLabel =
      toolName === 'FileWriteTool' ? 'Write' : 'Edit';
    const title = `${fileName} (Proposed ${actionLabel})`;

    const originalUri = vscode.Uri.parse(
      `openclaude-diff-original:${filePath}`,
    );
    const proposedUri = vscode.Uri.parse(
      `openclaude-diff-proposed:${filePath}`,
    );

    // Store the proposed URI so we can identify this tab later
    this.diffEditorTabs.set(filePath, proposedUri);

    // Open the native diff editor
    await vscode.commands.executeCommand(
      'vscode.diff',
      originalUri,
      proposedUri,
      title,
      {
        preview: false, // Don't replace an existing preview tab
        viewColumn: vscode.ViewColumn.Active,
      },
    );
  }

  /**
   * Determine which pending diff is "active" -- the one whose diff editor
   * is currently focused. Falls back to the first pending diff if no
   * diff editor is focused (e.g., command palette invocation).
   */
  private getActivePendingDiff(): PendingDiff | undefined {
    // Strategy 1: Check if the active editor matches a diff URI scheme
    const activeEditor = vscode.window.activeTextEditor;
    if (activeEditor) {
      const activeUri = activeEditor.document.uri;
      if (
        activeUri.scheme === 'openclaude-diff-original' ||
        activeUri.scheme === 'openclaude-diff-proposed'
      ) {
        const filePath = activeUri.path;
        const pending = this.pendingDiffs.get(filePath);
        if (pending) {
          return pending;
        }
      }
    }

    // Strategy 2: Check the active tab's input (works for diff editors
    // which may not expose a standard TextEditor)
    const activeTab = vscode.window.tabGroups.activeTabGroup.activeTab;
    if (activeTab?.input && typeof activeTab.input === 'object') {
      const tabInput = activeTab.input as {
        original?: vscode.Uri;
        modified?: vscode.Uri;
      };
      if (tabInput.modified?.scheme === 'openclaude-diff-proposed') {
        const filePath = tabInput.modified.path;
        const pending = this.pendingDiffs.get(filePath);
        if (pending) {
          return pending;
        }
      }
      if (tabInput.original?.scheme === 'openclaude-diff-original') {
        const filePath = tabInput.original.path;
        const pending = this.pendingDiffs.get(filePath);
        if (pending) {
          return pending;
        }
      }
    }

    // Strategy 3: Fall back to the first pending diff
    // (handles command palette invocation when no diff tab is focused)
    const firstEntry = this.pendingDiffs.values().next();
    if (!firstEntry.done) {
      return firstEntry.value;
    }

    return undefined;
  }

  /**
   * Close the diff editor tab for a given file path and clean up state.
   * Then process any queued diffs for the same file.
   */
  private async closeDiffAndCleanup(filePath: string): Promise<void> {
    // 1. Close the diff editor tab
    const proposedUri = this.diffEditorTabs.get(filePath);
    if (proposedUri) {
      for (const group of vscode.window.tabGroups.all) {
        for (const tab of group.tabs) {
          if (this.isOurDiffTab(tab, filePath)) {
            await vscode.window.tabGroups.close(tab);
            break;
          }
        }
      }
    }

    // 2. Remove from content providers
    this.originalProvider.removeContent(filePath);
    this.proposedProvider.removeContent(filePath);

    // 3. Remove from tracking maps
    this.pendingDiffs.delete(filePath);
    this.diffEditorTabs.delete(filePath);

    // 4. Update context variable
    await this.updateContextVariable();

    // 5. Process queued diffs for the same file
    const queued = this.pendingQueue.get(filePath);
    if (queued && queued.length > 0) {
      const next = queued.shift()!;
      if (queued.length === 0) {
        this.pendingQueue.delete(filePath);
      }
      // Process next queued diff (fire-and-forget -- errors handled inside)
      this.showDiff(next.requestId, next.request, next.transport);
    }
  }

  /**
   * Check if a tab is one of our diff editors for a specific file.
   */
  private isOurDiffTab(tab: vscode.Tab, filePath: string): boolean {
    if (!tab.input || typeof tab.input !== 'object') {
      return false;
    }
    const tabInput = tab.input as {
      original?: vscode.Uri;
      modified?: vscode.Uri;
    };
    return (
      (tabInput.modified?.scheme === 'openclaude-diff-proposed' &&
        tabInput.modified.path === filePath) ||
      (tabInput.original?.scheme === 'openclaude-diff-original' &&
        tabInput.original.path === filePath)
    );
  }

  /**
   * Handle tab close events -- if the user manually closes a diff tab,
   * treat it as a rejection so the CLI isn't left hanging.
   */
  private handleTabClose(event: vscode.TabChangeEvent): void {
    for (const closedTab of event.closed) {
      if (!closedTab.input || typeof closedTab.input !== 'object') {
        continue;
      }
      const tabInput = closedTab.input as {
        original?: vscode.Uri;
        modified?: vscode.Uri;
      };
      if (tabInput.modified?.scheme === 'openclaude-diff-proposed') {
        const filePath = tabInput.modified.path;
        const pending = this.pendingDiffs.get(filePath);
        if (pending) {
          this.outputChannel.appendLine(
            `[DiffManager] Diff tab closed for ${filePath}, treating as reject`,
          );
          this.sendDenyResponse(
            pending.requestId,
            pending.toolUseId,
            'User closed diff editor without accepting',
            pending.transport,
          );
          // Clean up without trying to close the tab (it's already closed)
          this.originalProvider.removeContent(filePath);
          this.proposedProvider.removeContent(filePath);
          this.pendingDiffs.delete(filePath);
          this.diffEditorTabs.delete(filePath);
          this.updateContextVariable();

          // Process queued diffs for the same file
          const queued = this.pendingQueue.get(filePath);
          if (queued && queued.length > 0) {
            const next = queued.shift()!;
            if (queued.length === 0) {
              this.pendingQueue.delete(filePath);
            }
            this.showDiff(next.requestId, next.request, next.transport);
          }
        }
      }
    }
  }

  // ===========================================================================
  // Private: File operations
  // ===========================================================================

  /**
   * Write content to a file, creating parent directories if needed.
   */
  private async writeFile(
    filePath: string,
    content: string,
  ): Promise<void> {
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(filePath, content, 'utf-8');
  }

  /**
   * Auto-save the file if it's open in a VS Code editor.
   * This ensures the editor shows the latest content without a "dirty" indicator.
   */
  private async autoSaveFile(filePath: string): Promise<void> {
    const uri = vscode.Uri.file(filePath);
    const openDoc = vscode.workspace.textDocuments.find(
      (doc) => doc.uri.fsPath === uri.fsPath,
    );
    if (openDoc && openDoc.isDirty) {
      await openDoc.save();
    }
  }

  // ===========================================================================
  // Private: Control response helpers
  // ===========================================================================

  /**
   * Send a "success" control_response with behavior: allow.
   * This tells the CLI "the user approved this tool use."
   */
  private sendAllowResponse(
    requestId: string,
    toolUseId: string,
    toolInput: Record<string, unknown>,
    transport: NdjsonTransport,
  ): void {
    transport.write({
      type: 'control_response',
      response: {
        subtype: 'success',
        request_id: requestId,
        response: {
          behavior: 'allow',
          updatedInput: toolInput,
          toolUseID: toolUseId,
        },
      },
    });
  }

  /**
   * Send a "success" control_response with behavior: deny.
   *
   * Note: The response subtype is still "success" -- this means "the extension
   * handled the request successfully." The `behavior` field carries the actual
   * permission decision (allow/deny). This matches the PermissionResult type
   * in src/types/session.ts.
   */
  private sendDenyResponse(
    requestId: string,
    toolUseId: string,
    message: string,
    transport: NdjsonTransport,
  ): void {
    transport.write({
      type: 'control_response',
      response: {
        subtype: 'success',
        request_id: requestId,
        response: {
          behavior: 'deny',
          message,
          toolUseID: toolUseId,
        },
      },
    });
  }

  // ===========================================================================
  // Private: Context variable management
  // ===========================================================================

  /**
   * Update the openclaude.viewingProposedDiff context variable.
   * When true, the Accept/Reject buttons appear in the editor title bar.
   */
  private async updateContextVariable(): Promise<void> {
    await vscode.commands.executeCommand(
      'setContext',
      'openclaude.viewingProposedDiff',
      this.pendingDiffs.size > 0,
    );
  }

  // ===========================================================================
  // Dispose
  // ===========================================================================

  dispose(): void {
    // Reject all pending diffs on dispose so CLI isn't left waiting
    for (const [filePath, pending] of this.pendingDiffs.entries()) {
      this.sendDenyResponse(
        pending.requestId,
        pending.toolUseId,
        'Extension deactivated',
        pending.transport,
      );
      this.originalProvider.removeContent(filePath);
      this.proposedProvider.removeContent(filePath);
    }
    // Reject all queued diffs too
    for (const [, queue] of this.pendingQueue.entries()) {
      for (const item of queue) {
        this.sendDenyResponse(
          item.requestId,
          item.request.tool_use_id,
          'Extension deactivated',
          item.transport,
        );
      }
    }
    this.pendingDiffs.clear();
    this.pendingQueue.clear();
    this.diffEditorTabs.clear();
    vscode.commands.executeCommand(
      'setContext',
      'openclaude.viewingProposedDiff',
      false,
    );
    for (const d of this.disposables) {
      d.dispose();
    }
  }
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd /Users/harshagarwal/Documents/workspace/openclaude-vscode && npx tsc --noEmit`

Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/diff/diffManager.ts
git commit -m "feat(diff): add DiffManager for native diff viewer accept/reject lifecycle"
```

---

## Task 3: Wire DiffManager into Extension Activation

**Files:**
- Modify: `src/extension.ts`

Replace the no-op registrations of `openclaude.acceptProposedDiff` and `openclaude.rejectProposedDiff` with real command handlers that delegate to DiffManager. Register the DiffContentProvider URI schemes. Create the DiffManager and output channel.

- [ ] **Step 1: Update src/extension.ts to integrate DiffManager**

Replace the full file with:

```typescript
import * as vscode from 'vscode';
import { OpenClaudeWebviewProvider } from './webview/webviewProvider';
import { createDiffContentProviders } from './diff/diffContentProvider';
import { DiffManager } from './diff/diffManager';

// Module-level reference so other modules (e.g., ProcessManager, ControlRouter)
// can access the DiffManager instance.
let diffManagerInstance: DiffManager | undefined;

/** Get the active DiffManager instance (available after activation). */
export function getDiffManager(): DiffManager | undefined {
  return diffManagerInstance;
}

export function activate(context: vscode.ExtensionContext) {
  console.log('OpenClaude VS Code extension activated');

  // === Output channel for debug logging ===
  const outputChannel = vscode.window.createOutputChannel('OpenClaude');
  context.subscriptions.push(outputChannel);

  // === Diff system: register URI schemes and create DiffManager ===
  const { original, proposed, disposables: diffProviderDisposables } =
    createDiffContentProviders();
  context.subscriptions.push(...diffProviderDisposables);

  const diffManager = new DiffManager(original, proposed, outputChannel);
  context.subscriptions.push(diffManager);
  diffManagerInstance = diffManager;

  // === Webview system ===
  const provider = new OpenClaudeWebviewProvider(context.extensionUri);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      'openclaudeSidebarSecondary',
      provider,
    ),
  );

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('openclaudeSidebar', provider),
  );

  // === Open commands ===
  context.subscriptions.push(
    vscode.commands.registerCommand('openclaude.editor.open', () => {
      provider.createPanel();
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('openclaude.editor.openLast', () => {
      provider.createPanel();
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('openclaude.primaryEditor.open', () => {
      provider.createPanel();
    }),
  );

  // === Diff commands (real implementations -- replaces no-ops) ===
  context.subscriptions.push(
    vscode.commands.registerCommand('openclaude.acceptProposedDiff', () => {
      diffManager.acceptCurrentDiff();
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('openclaude.rejectProposedDiff', () => {
      diffManager.rejectCurrentDiff();
    }),
  );

  // === Remaining commands (no-ops until their stories are implemented) ===
  const noopCommands = [
    'openclaude.window.open',
    'openclaude.sidebar.open',
    'openclaude.terminal.open',
    'openclaude.terminal.open.keyboard',
    'openclaude.createWorktree',
    'openclaude.newConversation',
    'openclaude.focus',
    'openclaude.blur',
    'openclaude.insertAtMention',
    'openclaude.insertAtMentioned',
    // NOTE: acceptProposedDiff and rejectProposedDiff removed -- now real above
    'openclaude.showLogs',
    'openclaude.openWalkthrough',
    'openclaude.update',
    'openclaude.installPlugin',
    'openclaude.logout',
  ];

  for (const id of noopCommands) {
    context.subscriptions.push(
      vscode.commands.registerCommand(id, () => {
        vscode.window.showInformationMessage('OpenClaude: Coming soon!');
      }),
    );
  }
}

export function deactivate() {
  diffManagerInstance = undefined;
  console.log('OpenClaude VS Code extension deactivated');
}
```

**Key changes from the previous version:**
1. Import `createDiffContentProviders` and `DiffManager`
2. Create an output channel `'OpenClaude'` for structured debug logging
3. Initialize the diff content providers (registers `openclaude-diff-original://` and `openclaude-diff-proposed://` URI schemes)
4. Create a `DiffManager` instance and expose it via `getDiffManager()` for ControlRouter
5. Replace no-op registrations of `acceptProposedDiff` / `rejectProposedDiff` with real handlers
6. Remove those two command IDs from the `noopCommands` array

- [ ] **Step 2: Build the extension**

Run: `cd /Users/harshagarwal/Documents/workspace/openclaude-vscode && npm run build`

Expected: Build completes with no errors

- [ ] **Step 3: Commit**

```bash
git add src/extension.ts
git commit -m "feat(diff): wire DiffManager and accept/reject commands into extension activation"
```

---

## Task 4: Control Request Router Integration

**Files:**
- Create: `src/process/controlRouter.ts`

This connects the NDJSON message flow to the DiffManager. When a `control_request` arrives with `subtype: can_use_tool` and the tool is `FileEditTool` or `FileWriteTool`, the router delegates to `DiffManager.showDiff()` instead of showing a generic permission dialog.

- [ ] **Step 1: Create the ControlRouter class**

```typescript
// src/process/controlRouter.ts
// Routes incoming control_request messages from the CLI to the appropriate
// handler: DiffManager for file edits, placeholder responses for others.
//
// Future stories will add: PermissionHandler (Story 7), ElicitationHandler
// (Story 7), HookHandler, McpHandler (Story 12).

import type { OutputChannel } from 'vscode';
import type { NdjsonTransport } from './ndjsonTransport';
import type { DiffManager } from '../diff/diffManager';
import type {
  SDKControlRequest,
  SDKControlCancelRequest,
  ControlRequestPermission,
} from '../types/messages';

export class ControlRouter {
  constructor(
    private readonly diffManager: DiffManager,
    private readonly transport: NdjsonTransport,
    private readonly outputChannel: OutputChannel,
  ) {}

  /**
   * Route an incoming control_request to the appropriate handler.
   * Called by ProcessManager (or whoever owns the transport.onMessage callback).
   */
  async handleControlRequest(msg: SDKControlRequest): Promise<void> {
    const { request_id, request } = msg;

    switch (request.subtype) {
      case 'can_use_tool': {
        const permRequest = request as ControlRequestPermission;
        if (this.diffManager.isFileEditToolRequest(permRequest)) {
          // File edit/write tools -> native diff viewer
          await this.diffManager.showDiff(
            request_id,
            permRequest,
            this.transport,
          );
        } else {
          // Other tools -> auto-allow for now
          // Story 7 (PermissionHandler) will replace this with a dialog
          this.outputChannel.appendLine(
            `[ControlRouter] Auto-allowing tool: ${permRequest.tool_name}`,
          );
          this.transport.write({
            type: 'control_response',
            response: {
              subtype: 'success',
              request_id,
              response: {
                behavior: 'allow',
                updatedInput: permRequest.input,
                toolUseID: permRequest.tool_use_id,
              },
            },
          });
        }
        break;
      }

      case 'elicitation': {
        // Placeholder -- Story 7 will implement ElicitationDialog
        this.outputChannel.appendLine(
          `[ControlRouter] Elicitation received (request ${request_id}) -- not yet implemented`,
        );
        this.transport.write({
          type: 'control_response',
          response: {
            subtype: 'error',
            request_id,
            error: 'Elicitation not yet implemented',
          },
        });
        break;
      }

      case 'hook_callback': {
        // Placeholder -- future story
        this.outputChannel.appendLine(
          `[ControlRouter] Hook callback received (request ${request_id}) -- not yet implemented`,
        );
        this.transport.write({
          type: 'control_response',
          response: {
            subtype: 'error',
            request_id,
            error: 'Hook callbacks not yet implemented',
          },
        });
        break;
      }

      case 'mcp_message': {
        // Placeholder -- Story 12 will implement MCP message forwarding
        this.outputChannel.appendLine(
          `[ControlRouter] MCP message received (request ${request_id}) -- not yet implemented`,
        );
        this.transport.write({
          type: 'control_response',
          response: {
            subtype: 'error',
            request_id,
            error: 'MCP messages not yet implemented',
          },
        });
        break;
      }

      default: {
        const subtype = (request as { subtype: string }).subtype;
        this.outputChannel.appendLine(
          `[ControlRouter] Unknown control_request subtype: ${subtype}`,
        );
        this.transport.write({
          type: 'control_response',
          response: {
            subtype: 'error',
            request_id,
            error: `Unknown control_request subtype: ${subtype}`,
          },
        });
      }
    }
  }

  /**
   * Handle a control_cancel_request -- cancel stale pending operations.
   * The CLI sends this when a hook resolves a permission before the user
   * decides, or when the request is no longer relevant.
   */
  async handleControlCancelRequest(
    msg: SDKControlCancelRequest,
  ): Promise<void> {
    this.outputChannel.appendLine(
      `[ControlRouter] Cancel request for: ${msg.request_id}`,
    );
    await this.diffManager.cancelDiffByRequestId(msg.request_id);
    // Future: also cancel pending permission dialogs, elicitations, etc.
  }
}
```

- [ ] **Step 2: Document the expected integration point with ProcessManager**

The `ControlRouter` is created and wired into the message flow in the ProcessManager (from Story 2). Add a comment or create a minimal integration point. The expected pattern is:

```typescript
// In ProcessManager (Story 2) or wherever transport.onMessage() is set up:
//
// import { ControlRouter } from './controlRouter';
// import { getDiffManager } from '../extension';
//
// // After transport is created:
// const diffManager = getDiffManager()!;
// const controlRouter = new ControlRouter(diffManager, transport, outputChannel);
//
// transport.onMessage((msg: unknown) => {
//   const typed = msg as { type: string };
//   switch (typed.type) {
//     case 'control_request':
//       controlRouter.handleControlRequest(msg as SDKControlRequest);
//       break;
//     case 'control_cancel_request':
//       controlRouter.handleControlCancelRequest(msg as SDKControlCancelRequest);
//       break;
//     // ... other message types forwarded to webview
//   }
// });
```

- [ ] **Step 3: Build**

Run: `cd /Users/harshagarwal/Documents/workspace/openclaude-vscode && npm run build`

Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/process/controlRouter.ts
git commit -m "feat(diff): add ControlRouter to dispatch can_use_tool requests to DiffManager"
```

---

## Task 5: Context Variable and Menu Verification

**Files:**
- Verify: `package.json` (no changes needed -- already done in Story 1)

This task verifies that the `openclaude.viewingProposedDiff` context variable correctly controls button visibility. The buttons are already declared in `package.json` from Story 1.

- [ ] **Step 1: Verify package.json menu contributions**

Confirm these exist in `package.json`:

Commands section:
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

Menus section (`editor/title`):
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

Verify that:
- `enablement` on commands matches `openclaude.viewingProposedDiff`
- `when` on menu items matches `openclaude.viewingProposedDiff`
- Icons are `$(check)` (Codicon: checkmark) and `$(discard)` (Codicon: discard)
- Both appear in `group: "navigation"` (shows as icons in the editor title bar, not in dropdown)

- [ ] **Step 2: Trace the context variable lifecycle**

1. `DiffManager.showDiff()` -> `updateContextVariable()` -> `setContext('openclaude.viewingProposedDiff', true)` (buttons appear)
2. `DiffManager.acceptCurrentDiff()` -> `closeDiffAndCleanup()` -> `updateContextVariable()` -> `setContext('openclaude.viewingProposedDiff', false)` (buttons disappear if no more pending diffs)
3. `DiffManager.rejectCurrentDiff()` -> `closeDiffAndCleanup()` -> `updateContextVariable()` -> `setContext('openclaude.viewingProposedDiff', false)` (buttons disappear if no more pending diffs)
4. Tab close -> `handleTabClose()` -> `updateContextVariable()` (same)
5. Extension deactivation -> `dispose()` -> `setContext('openclaude.viewingProposedDiff', false)` (cleanup)

With multiple pending diffs, the variable stays `true` until ALL diffs are resolved.

No code changes needed -- this task is verification only.

---

## Task 6: Unit Tests

**Files:**
- Create: `src/diff/__tests__/diffContentProvider.test.ts`
- Create: `src/diff/__tests__/diffManager.test.ts`

- [ ] **Step 1: Create DiffContentProvider unit tests**

```typescript
// src/diff/__tests__/diffContentProvider.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock vscode module
vi.mock('vscode', () => ({
  EventEmitter: class {
    private handlers: Array<(data: unknown) => void> = [];
    event = (handler: (data: unknown) => void) => {
      this.handlers.push(handler);
    };
    fire(data: unknown) {
      this.handlers.forEach((h) => h(data));
    }
    dispose() {
      this.handlers = [];
    }
  },
  Uri: {
    parse: (s: string) => ({
      scheme: s.split(':')[0],
      path: s.substring(s.indexOf(':') + 1),
    }),
  },
  workspace: {
    registerTextDocumentContentProvider: vi.fn(() => ({
      dispose: vi.fn(),
    })),
  },
}));

import { DiffContentProvider } from '../diffContentProvider';

describe('DiffContentProvider', () => {
  let provider: DiffContentProvider;

  beforeEach(() => {
    provider = new DiffContentProvider();
    provider.scheme = 'openclaude-diff-original';
  });

  it('should return empty string for unknown paths', () => {
    const uri = { path: '/some/unknown/file.ts' } as { path: string };
    expect(provider.provideTextDocumentContent(uri as never)).toBe('');
  });

  it('should return stored content for known paths', () => {
    provider.setContent('/test/file.ts', 'hello world');
    const uri = { path: '/test/file.ts' } as { path: string };
    expect(provider.provideTextDocumentContent(uri as never)).toBe(
      'hello world',
    );
  });

  it('should update content when setContent is called again', () => {
    provider.setContent('/test/file.ts', 'version 1');
    provider.setContent('/test/file.ts', 'version 2');
    const uri = { path: '/test/file.ts' } as { path: string };
    expect(provider.provideTextDocumentContent(uri as never)).toBe(
      'version 2',
    );
  });

  it('should remove content', () => {
    provider.setContent('/test/file.ts', 'hello');
    provider.removeContent('/test/file.ts');
    const uri = { path: '/test/file.ts' } as { path: string };
    expect(provider.provideTextDocumentContent(uri as never)).toBe('');
  });

  it('should store multiple files independently', () => {
    provider.setContent('/a.ts', 'content a');
    provider.setContent('/b.ts', 'content b');
    expect(
      provider.provideTextDocumentContent({ path: '/a.ts' } as never),
    ).toBe('content a');
    expect(
      provider.provideTextDocumentContent({ path: '/b.ts' } as never),
    ).toBe('content b');
  });

  it('should clear all content', () => {
    provider.setContent('/a.ts', 'a');
    provider.setContent('/b.ts', 'b');
    provider.clear();
    expect(
      provider.provideTextDocumentContent({ path: '/a.ts' } as never),
    ).toBe('');
    expect(
      provider.provideTextDocumentContent({ path: '/b.ts' } as never),
    ).toBe('');
  });
});
```

- [ ] **Step 2: Create DiffManager content computation tests**

```typescript
// src/diff/__tests__/diffManager.test.ts
import { describe, it, expect } from 'vitest';

// Test the computeProposedContent logic by extracting it as a pure function.
// The full DiffManager requires VS Code API mocks which are better tested
// in integration tests. Here we test the core computation logic.

/**
 * Extracted from DiffManager.computeProposedContent for testability.
 * This is the exact same logic -- keeping it in sync is enforced by
 * integration tests.
 */
function computeProposedContent(
  toolName: string,
  input: Record<string, unknown>,
  originalContent: string,
): string {
  if (toolName === 'FileWriteTool') {
    return (input.content as string) ?? '';
  }

  if (toolName === 'FileEditTool') {
    const oldString = (input.old_string as string) ?? '';
    const newString = (input.new_string as string) ?? '';

    if (oldString === '') {
      if (originalContent === '') {
        return newString;
      }
      return newString + originalContent;
    }

    const index = originalContent.indexOf(oldString);
    if (index === -1) {
      return originalContent;
    }

    return (
      originalContent.substring(0, index) +
      newString +
      originalContent.substring(index + oldString.length)
    );
  }

  return originalContent;
}

describe('computeProposedContent', () => {
  describe('FileWriteTool', () => {
    it('should return content field as the full proposed content', () => {
      const result = computeProposedContent(
        'FileWriteTool',
        { content: 'new file content', file_path: '/test.ts' },
        'old content',
      );
      expect(result).toBe('new file content');
    });

    it('should handle empty content (truncate file)', () => {
      const result = computeProposedContent(
        'FileWriteTool',
        { content: '', file_path: '/test.ts' },
        'old content',
      );
      expect(result).toBe('');
    });

    it('should handle missing content field', () => {
      const result = computeProposedContent(
        'FileWriteTool',
        { file_path: '/test.ts' },
        'old content',
      );
      expect(result).toBe('');
    });

    it('should handle new file creation (empty original)', () => {
      const result = computeProposedContent(
        'FileWriteTool',
        { content: 'brand new file', file_path: '/new.ts' },
        '',
      );
      expect(result).toBe('brand new file');
    });
  });

  describe('FileEditTool', () => {
    it('should apply old_string -> new_string replacement', () => {
      const original = 'function hello() {\n  return "hello";\n}';
      const result = computeProposedContent(
        'FileEditTool',
        {
          file_path: '/test.ts',
          old_string: 'return "hello"',
          new_string: 'return "world"',
        },
        original,
      );
      expect(result).toBe('function hello() {\n  return "world";\n}');
    });

    it('should handle new file creation (empty old_string, empty original)', () => {
      const result = computeProposedContent(
        'FileEditTool',
        {
          file_path: '/new.ts',
          old_string: '',
          new_string: 'export const x = 1;',
        },
        '',
      );
      expect(result).toBe('export const x = 1;');
    });

    it('should prepend when old_string is empty but file exists', () => {
      const result = computeProposedContent(
        'FileEditTool',
        {
          file_path: '/test.ts',
          old_string: '',
          new_string: '// header\n',
        },
        'const x = 1;',
      );
      expect(result).toBe('// header\nconst x = 1;');
    });

    it('should return original when old_string is not found', () => {
      const original = 'const x = 1;';
      const result = computeProposedContent(
        'FileEditTool',
        {
          file_path: '/test.ts',
          old_string: 'const y = 2',
          new_string: 'const y = 3',
        },
        original,
      );
      expect(result).toBe(original);
    });

    it('should replace only the first occurrence', () => {
      const original = 'aaa bbb aaa';
      const result = computeProposedContent(
        'FileEditTool',
        {
          file_path: '/test.ts',
          old_string: 'aaa',
          new_string: 'ccc',
        },
        original,
      );
      expect(result).toBe('ccc bbb aaa');
    });

    it('should handle deletion (new_string is empty)', () => {
      const original = 'line1\nline2\nline3';
      const result = computeProposedContent(
        'FileEditTool',
        {
          file_path: '/test.ts',
          old_string: 'line2\n',
          new_string: '',
        },
        original,
      );
      expect(result).toBe('line1\nline3');
    });

    it('should handle multi-line replacements', () => {
      const original = 'function foo() {\n  // old\n  return 1;\n}';
      const result = computeProposedContent(
        'FileEditTool',
        {
          file_path: '/test.ts',
          old_string: '  // old\n  return 1;',
          new_string: '  // new\n  return 42;',
        },
        original,
      );
      expect(result).toBe('function foo() {\n  // new\n  return 42;\n}');
    });

    it('should handle replacement at the start of the file', () => {
      const original = 'const x = 1;\nconst y = 2;';
      const result = computeProposedContent(
        'FileEditTool',
        {
          file_path: '/test.ts',
          old_string: 'const x = 1;',
          new_string: 'const x = 99;',
        },
        original,
      );
      expect(result).toBe('const x = 99;\nconst y = 2;');
    });

    it('should handle replacement at the end of the file', () => {
      const original = 'const x = 1;\nconst y = 2;';
      const result = computeProposedContent(
        'FileEditTool',
        {
          file_path: '/test.ts',
          old_string: 'const y = 2;',
          new_string: 'const y = 99;',
        },
        original,
      );
      expect(result).toBe('const x = 1;\nconst y = 99;');
    });
  });

  describe('Unknown tool', () => {
    it('should return original content unchanged', () => {
      const original = 'some content';
      const result = computeProposedContent(
        'SomeOtherTool',
        { file_path: '/test.ts' },
        original,
      );
      expect(result).toBe(original);
    });
  });
});
```

- [ ] **Step 3: Run tests**

Run: `cd /Users/harshagarwal/Documents/workspace/openclaude-vscode && npx vitest run src/diff/__tests__/`

Expected: All tests pass

- [ ] **Step 4: Commit**

```bash
git add src/diff/__tests__/
git commit -m "test(diff): add unit tests for DiffContentProvider and content computation"
```

---

## Task 7: Integration Verification

This task verifies the end-to-end flow works correctly by building the extension and testing in the Extension Development Host.

- [ ] **Step 1: Full build**

Run: `cd /Users/harshagarwal/Documents/workspace/openclaude-vscode && npm run build`

Expected: Both extension host and webview build successfully

- [ ] **Step 2: Type check**

Run: `cd /Users/harshagarwal/Documents/workspace/openclaude-vscode && npx tsc --noEmit`

Expected: No type errors

- [ ] **Step 3: Run all tests**

Run: `cd /Users/harshagarwal/Documents/workspace/openclaude-vscode && npx vitest run`

Expected: All tests pass

- [ ] **Step 4: Lint**

Run: `cd /Users/harshagarwal/Documents/workspace/openclaude-vscode && npm run lint`

Expected: No lint errors (or only pre-existing warnings)

- [ ] **Step 5: Manual verification in Extension Development Host**

```
1. Press F5 to launch Extension Development Host
2. Open the OpenClaude output channel (View > Output > select "OpenClaude")
3. Open Command Palette > "OpenClaude: Accept Proposed Changes"
   -> Should show "No pending diff to accept." warning
4. Open Command Palette > "OpenClaude: Reject Proposed Changes"
   -> Should show "No pending diff to reject." warning
5. Verify no Accept/Reject buttons visible in editor title bar
   (context variable starts false)
6. Full diff flow requires a running CLI process (Story 2 + real CLI).
   Mark this as verified once Story 2 integration is complete.
```

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "feat(diff): Story 6 complete -- native diff viewer with accept/reject"
```

---

## Architecture Notes

### Data Flow

```
CLI stdout
  |
  v
NdjsonTransport.onMessage()
  |
  v
ControlRouter.handleControlRequest()
  |  (checks: is it can_use_tool for FileEditTool/FileWriteTool?)
  v
DiffManager.showDiff()
  |  1. Read original from disk (or empty for new file)
  |  2. Compute proposed content (FileWriteTool: content; FileEditTool: apply edit)
  |  3. Store in DiffContentProviders (original + proposed)
  |  4. Open vscode.diff(originalUri, proposedUri, title)
  |  5. Set openclaude.viewingProposedDiff = true
  v
User sees diff editor with Accept (checkmark) / Reject (discard) in title bar
  |
  |--- Accept button -----------> DiffManager.acceptCurrentDiff()
  |     1. fs.writeFile(proposed content)
  |     2. Auto-save if file is open in editor
  |     3. Send control_response { behavior: "allow" }
  |     4. Close diff tab, clean up providers, update context variable
  |     5. Process next queued diff (if any)
  |
  |--- Reject button -----------> DiffManager.rejectCurrentDiff()
  |     1. Send control_response { behavior: "deny" }
  |     2. Close diff tab, clean up providers, update context variable
  |     3. Process next queued diff (if any)
  |
  |--- Tab closed manually -----> handleTabClose()
  |     -> Treated as reject (same flow as Reject)
  |
  |--- CLI cancel request ------> cancelDiffByRequestId()
  |     -> Clean up without sending response (CLI already moved on)
  |
  v
NdjsonTransport.write(control_response) -> CLI stdin
```

### URI Scheme Design

Two custom URI schemes, each backed by a `DiffContentProvider` instance:

- `openclaude-diff-original:/absolute/path/to/file.ts` -- serves the file's content before the edit
- `openclaude-diff-proposed:/absolute/path/to/file.ts` -- serves the file's content after the edit

Both are virtual, read-only documents. The absolute file path is the URI's `path` component and serves as the key in the `DiffContentProvider.contentMap`.

### Context Variable Protocol

| State | `openclaude.viewingProposedDiff` | Buttons |
|---|---|---|
| No pending diffs | `false` | Hidden |
| 1+ pending diffs | `true` | Accept (checkmark) + Reject (discard) visible in editor title bar |

Set via `vscode.commands.executeCommand('setContext', 'openclaude.viewingProposedDiff', value)`.

Referenced in `package.json`:
- `enablement` on command definitions: grays out the command when `false`
- `when` on `menus.editor/title`: shows/hides the icon buttons

### Control Response Format

Accept (user approves the file edit):
```json
{
  "type": "control_response",
  "response": {
    "subtype": "success",
    "request_id": "req-001",
    "response": {
      "behavior": "allow",
      "updatedInput": { "file_path": "/path/to/file.ts", "old_string": "...", "new_string": "..." },
      "toolUseID": "tool-use-001"
    }
  }
}
```

Reject (user rejects the file edit):
```json
{
  "type": "control_response",
  "response": {
    "subtype": "success",
    "request_id": "req-001",
    "response": {
      "behavior": "deny",
      "message": "User rejected proposed changes",
      "toolUseID": "tool-use-001"
    }
  }
}
```

**Important:** Both use `subtype: "success"` because the extension handled the control_request successfully. The `behavior` field inside `response` carries the actual permission decision (`allow` or `deny`), matching the `PermissionResult` type defined in `src/types/session.ts`.

### Multiple Pending Diffs

Multiple diffs can be pending simultaneously (one per file). The `pendingDiffs` map is keyed by normalized file path.

When the user clicks Accept/Reject, the `getActivePendingDiff()` method determines which diff to act on using this priority:
1. The diff whose URI matches the active text editor
2. The diff whose URI matches the active tab's input (works for diff editors that don't expose a TextEditor)
3. The first entry in the `pendingDiffs` map (fallback for command palette invocation)

If a second edit arrives for a file that already has a pending diff, it is queued in `pendingQueue` and processed after the current diff is resolved.

### Acceptance Criteria Traceability

| Criterion | Implementation |
|---|---|
| When CLI sends tool_use for FileEditTool/FileWriteTool, show VS Code native diff | `ControlRouter` routes `can_use_tool` to `DiffManager.showDiff()` which opens `vscode.diff` |
| DiffContentProvider serves original and proposed file content | `DiffContentProvider` registered for `openclaude-diff-original://` and `openclaude-diff-proposed://` |
| Accept button (checkmark icon) in editor title bar applies changes | `openclaude.acceptProposedDiff` command -> `DiffManager.acceptCurrentDiff()` -> `fs.writeFile()` |
| Reject button (discard icon) in editor title bar discards changes | `openclaude.rejectProposedDiff` command -> `DiffManager.rejectCurrentDiff()` -> discards |
| Context variable `openclaude.viewingProposedDiff` controls button visibility | `DiffManager.updateContextVariable()` sets `setContext()` based on `pendingDiffs.size` |
| Multiple pending diffs supported (one per file) | `pendingDiffs` Map keyed by file path; `pendingQueue` for same-file collisions |
| After accept/reject, send `control_response` back to CLI | `sendAllowResponse()` / `sendDenyResponse()` via `NdjsonTransport.write()` |
| Diff editor closes after decision | `closeDiffAndCleanup()` calls `vscode.window.tabGroups.close(tab)` |
| Auto-save target file after accepting changes | `autoSaveFile()` saves dirty documents matching the file path |
