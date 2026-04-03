# Story 19: Plan Review Inline Comment System — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the basic plan viewer into an interactive inline-comment system so users can annotate generated plans before approving or requesting revisions.

**Architecture:** Extend the existing PlanViewer from Story 7 into a structured rich-view renderer that tracks text ranges, anchored comments, and approval actions. Keep text-selection/comment state entirely in the webview, while the host only relays final review feedback back to the CLI.

**Tech Stack:** React 18, TypeScript 5.x, Tailwind CSS, VS Code webview APIs

**Spec:** [2026-04-02-openclaude-vscode-extension-design.md](../specs/2026-04-02-openclaude-vscode-extension-design.md) — Story 19, Sections 3.6, 5.2, 8

**Depends on:** Story 7

---

## File Structure

| File | Responsibility |
|---|---|
| `webview/src/components/dialogs/PlanViewer.tsx` | Rich plan renderer with text selection and comment anchors |
| `webview/src/components/dialogs/PlanComment.tsx` | Comment editor/display surface |
| `webview/src/components/dialogs/PlanCommentIndicator.tsx` | Numbered marker/highlight affordance |
| `src/webview/types.ts` | Plan-review action messages |
| `src/extension.ts` | Forward plan review feedback to the CLI |

---

## Task 1: Extend plan review protocol

**Files:**
- Modify: `src/webview/types.ts`
- Modify: `src/extension.ts`

- [ ] **Step 1: Add message types for plan comment add/update/remove, approve, and request revision actions**
- [ ] **Step 2: If using a helper to normalize plan review payloads, write failing tests first**
- [ ] **Step 3: Wire the final review payload back through the host to the CLI without embedding business logic in the webview**
- [ ] **Step 4: Commit**

```bash
git add src/webview/types.ts src/extension.ts
git commit -m "feat(plan-review): add plan review protocol messages"
```

---

## Task 2: Build comment components and selection model

**Files:**
- Create: `webview/src/components/dialogs/PlanComment.tsx`
- Create: `webview/src/components/dialogs/PlanCommentIndicator.tsx`
- Modify: `webview/src/components/dialogs/PlanViewer.tsx`

- [ ] **Step 1: Write focused helper/component tests for text-range anchoring or comment ordering**
- [ ] **Step 2: Implement comment state in `PlanViewer.tsx` with text selection → add comment flow**
- [ ] **Step 3: Implement numbered indicators and `<mark>` highlighting tied to saved comments**
- [ ] **Step 4: Implement `PlanComment.tsx` and `PlanCommentIndicator.tsx` as small presentational pieces**
- [ ] **Step 5: Run `npm run build:webview` and confirm PASS**
- [ ] **Step 6: Commit**

```bash
git add webview/src/components/dialogs/PlanViewer.tsx webview/src/components/dialogs/PlanComment.tsx webview/src/components/dialogs/PlanCommentIndicator.tsx
git commit -m "feat(plan-review): add inline comment UI"
```

---

## Task 3: Add approve/revise actions and full review submission

**Files:**
- Modify: `webview/src/components/dialogs/PlanViewer.tsx`
- Modify: host wiring only if needed

- [ ] **Step 1: Add approve-without-comments, approve-with-comments, and request-revision actions**
- [ ] **Step 2: Respect `showClearContextOnPlanAccept` if that setting/state is already available; otherwise integrate at the message boundary when available**
- [ ] **Step 3: Run `npm run build:webview` and manual verification with a sample markdown plan**
- [ ] **Step 4: Commit**

```bash
git add webview/src/components/dialogs/PlanViewer.tsx
 git commit -m "feat(plan-review): add approval and revision actions"
```

---

## Final Verification

- [ ] Run: `npm run build`
- [ ] Manual: select plan text, add comments, and submit approval/revision feedback
