# Story 14: Git Worktree Support — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the `openclaude.createWorktree` command so users can create a git worktree, open it in a new VS Code window, and start an isolated OpenClaude session there.

**Architecture:** Add a focused `WorktreeManager` that validates the repository context, prompts for a worktree name, shells out to `git worktree add`, and opens the resulting directory in a new VS Code window. Keep worktree orchestration in the host; the webview only triggers the action if needed.

**Tech Stack:** TypeScript 5.x, VS Code Extension API, child_process, Vitest

**Spec:** [2026-04-02-openclaude-vscode-extension-design.md](../specs/2026-04-02-openclaude-vscode-extension-design.md) — Story 14, Sections 2.1, 5.2, 8

**Depends on:** Story 2

---

## File Structure

| File | Responsibility |
|---|---|
| `src/worktree/worktreeManager.ts` | Prompt, validate repo state, create worktree, open window |
| `test/unit/worktreeManager.test.ts` | Unit tests for name/path validation and command construction |
| `src/extension.ts` | Instantiate manager and wire command |

---

## Task 1: Build WorktreeManager

**Files:**
- Create: `src/worktree/worktreeManager.ts`
- Test: `test/unit/worktreeManager.test.ts`

- [ ] **Step 1: Write failing tests for worktree path/name validation and git command construction**
- [ ] **Step 2: Run `npm test -- test/unit/worktreeManager.test.ts` and confirm failure**
- [ ] **Step 3: Implement `WorktreeManager` with methods to prompt for a name, derive a safe path, run `git worktree add`, and open the result with `vscode.openFolder`**
- [ ] **Step 4: Handle non-git workspaces, duplicate names, and command failures with user-visible errors instead of silent failure**
- [ ] **Step 5: Re-run `npm test -- test/unit/worktreeManager.test.ts` and confirm PASS**
- [ ] **Step 6: Commit**

```bash
git add src/worktree/worktreeManager.ts test/unit/worktreeManager.test.ts
git commit -m "feat(worktree): add git worktree manager"
```

---

## Task 2: Wire the command and new-window flow

**Files:**
- Modify: `src/extension.ts`

- [ ] **Step 1: Instantiate `WorktreeManager` during activation**
- [ ] **Step 2: Replace the current placeholder `openclaude.createWorktree` command with the real manager call**
- [ ] **Step 3: If a new session prompt should follow window open, pass the relevant context through URI/open-folder state rather than mutating global state**
- [ ] **Step 4: Run `npm run build` and manually verify creating a worktree opens a new window in the new directory**
- [ ] **Step 5: Commit**

```bash
git add src/extension.ts
 git commit -m "feat(worktree): wire create worktree command"
```

---

## Final Verification

- [ ] Run: `npm run build`
- [ ] Run: `npm test -- test/unit/worktreeManager.test.ts`
- [ ] Manual: create a worktree from a git repo and confirm the new window opens in the worktree directory
