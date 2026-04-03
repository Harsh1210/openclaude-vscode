# Story 9: Status Bar, Commands & Keyboard Shortcuts — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a real status bar manager and command registry so OpenClaude exposes working commands, focus behavior, terminal mode, and status indicators instead of placeholder command wiring.

**Architecture:** Extract command and status-bar logic from `src/extension.ts` into focused modules. `StatusBarManager` owns stateful badge presentation and click behavior; `CommandRegistry` owns command registration and delegates to the webview manager, process manager, and future feature managers.

**Tech Stack:** TypeScript 5.x, VS Code Extension API, Vitest

**Spec:** [2026-04-02-openclaude-vscode-extension-design.md](../specs/2026-04-02-openclaude-vscode-extension-design.md) — Story 9, Sections 4.1, 4.2, 5.2, 8

**Depends on:** Story 2 (process manager), current scaffold in `src/extension.ts`

---

## File Structure

| File | Responsibility |
|---|---|
| `src/statusbar/statusBarManager.ts` | Owns status bar item text/color/tooltip/visibility and pending/done indicators |
| `src/commands/commandRegistry.ts` | Registers commands and delegates actions to host managers |
| `src/extension.ts` | Reduced to activation wiring that composes the managers |
| `test/unit/statusBarManager.test.ts` | Unit tests for indicator state transitions |
| `test/unit/commandRegistry.test.ts` | Unit tests for command delegation and terminal-mode routing |

---

## Task 1: Extract StatusBarManager

**Files:**
- Create: `src/statusbar/statusBarManager.ts`
- Test: `test/unit/statusBarManager.test.ts`

- [ ] **Step 1: Write failing tests for badge states**

```typescript
import { describe, expect, it } from 'vitest';
import { StatusBarManager } from '../../src/statusbar/statusBarManager';

describe('StatusBarManager', () => {
  it('shows a pending indicator when permission is waiting', () => {
    const manager = new StatusBarManager(/* mocked factory */);
    manager.setPendingPermission(true);
    expect(manager.debugState().kind).toBe('pending');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- test/unit/statusBarManager.test.ts`
Expected: FAIL with missing module/class.

- [ ] **Step 3: Implement `StatusBarManager`**

Create a class with methods like:

```typescript
export class StatusBarManager implements vscode.Disposable {
  setPreferredLocation(location: 'sidebar' | 'panel'): void;
  setPendingPermission(pending: boolean): void;
  setCompletedWhileHidden(done: boolean): void;
  setVisible(visible: boolean): void;
  bindOpenCommand(commandId: string): void;
}
```

Rules:
- default label remains `$(sparkle) OpenClaude`
- pending permission uses blue accent and tooltip
- completed while hidden uses orange accent and tooltip
- clicking the item always opens `openclaude.editor.openLast`
- keep logic deterministic if both pending and done flags are set; pending wins

- [ ] **Step 4: Run tests**

Run: `npm test -- test/unit/statusBarManager.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/statusbar/statusBarManager.ts test/unit/statusBarManager.test.ts
git commit -m "feat(statusbar): add status bar manager"
```

---

## Task 2: Extract CommandRegistry

**Files:**
- Create: `src/commands/commandRegistry.ts`
- Test: `test/unit/commandRegistry.test.ts`
- Modify: `src/extension.ts`

- [ ] **Step 1: Write failing tests for delegation**

Cover these behaviors:
- `openclaude.editor.openLast` respects preferred location
- `openclaude.sidebar.open` focuses sidebar
- `openclaude.focus` inserts current selection mention when available
- terminal mode routes `openclaude.terminal.open` to integrated terminal

- [ ] **Step 2: Run tests to verify failure**

Run: `npm test -- test/unit/commandRegistry.test.ts`
Expected: FAIL with missing module/class.

- [ ] **Step 3: Implement `CommandRegistry`**

Create a focused API:

```typescript
interface CommandRegistryDeps {
  context: vscode.ExtensionContext;
  webviewManager: WebviewManager;
  output: vscode.OutputChannel;
  getPreferredLocation: () => 'sidebar' | 'panel';
  setPreferredLocation: (value: 'sidebar' | 'panel') => void;
  openTerminal: () => Promise<void>;
}
```

Register the command set currently hard-coded in `src/extension.ts`, preserving current behavior while moving logic into the class. Keep unimplemented commands as explicit placeholders instead of silently doing nothing.

- [ ] **Step 4: Refactor `src/extension.ts` to use the registry**

After extraction, `activate()` should instantiate `StatusBarManager` and `CommandRegistry` and stop holding 200+ lines of inline command handlers.

- [ ] **Step 5: Verify build/tests**

Run:
- `npm test -- test/unit/statusBarManager.test.ts test/unit/commandRegistry.test.ts`
- `npm run build`

Expected: PASS + build succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/commands/commandRegistry.ts src/extension.ts test/unit/commandRegistry.test.ts
 git commit -m "refactor(commands): extract command registry"
```

---

## Task 3: Integrate live status transitions

**Files:**
- Modify: `src/extension.ts`
- Modify: `src/process/processManager.ts` (only if needed to surface clearer events)
- Modify: `src/webview/types.ts` (only if host/webview state messages need extension)

- [ ] **Step 1: Connect process and webview events to status bar state**

Wire:
- permission-request pending → `setPendingPermission(true)`
- permission resolved/cancelled → `setPendingPermission(false)`
- assistant turn completes while no panel is visible → `setCompletedWhileHidden(true)`
- any panel reveal/focus → clear hidden-complete indicator

- [ ] **Step 2: Add terminal mode command implementation**

Implement `openclaude.terminal.open` and `openclaude.terminal.open.keyboard` with `vscode.window.createTerminal`, passing the configured executable and cwd.

- [ ] **Step 3: Manual verification**

Run:
- `npm run build`
- open extension host
- trigger focus/open commands
- trigger terminal mode with `openclaudeCode.useTerminal=true`
- simulate pending/completed states if needed

Expected:
- commands work from command palette
- status bar updates visually
- terminal opens correctly in terminal mode

- [ ] **Step 4: Commit**

```bash
git add src/extension.ts src/process/processManager.ts src/webview/types.ts
git commit -m "feat(commands): wire live status bar and terminal mode"
```

---

## Final Verification

- [ ] Run: `npm run build`
- [ ] Run: `npm test -- test/unit/statusBarManager.test.ts test/unit/commandRegistry.test.ts`
- [ ] Manual: verify focus shortcuts and command-palette actions
- [ ] Manual: verify status bar color/tooltip behavior in pending + hidden-finished states
