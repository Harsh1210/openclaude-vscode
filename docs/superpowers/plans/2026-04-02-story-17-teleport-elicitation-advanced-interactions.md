# Story 17: Teleport, Elicitation & Advanced Interactions — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add teleport confirmation, elicitation dialogs, and message-level interaction controls like stop, retry, copy, and edit.

**Architecture:** Handle new control and system messages at the host boundary, forward normalized state to the webview, and implement focused dialog/action components that compose into the existing chat UI. Keep transport/protocol changes centralized so the chat components stay simple.

**Tech Stack:** TypeScript 5.x, React 18, VS Code Extension API, Vitest

**Spec:** [2026-04-02-openclaude-vscode-extension-design.md](../specs/2026-04-02-openclaude-vscode-extension-design.md) — Story 17, Sections 3.4, 3.7, 4.8, 4.9, 5.2, 8

**Depends on:** Story 4

---

## File Structure

| File | Responsibility |
|---|---|
| `webview/src/components/dialogs/TeleportDialog.tsx` | Incoming teleport confirmation UI |
| `webview/src/components/dialogs/ElicitationDialog.tsx` | Structured question rendering for CLI elicitation flows |
| `webview/src/components/chat/MessageActions.tsx` | Stop, retry, copy, edit affordances for messages |
| `src/webview/types.ts` | Teleport/elicitation/action message types |
| `src/extension.ts` | Route teleport and elicitation messages between CLI and webview |
| `webview/src/hooks/useChat.ts` | Track failed messages, editable user messages, and action state |

---

## Task 1: Add teleport and elicitation protocol handling

**Files:**
- Modify: `src/webview/types.ts`
- Modify: `src/extension.ts`

- [ ] **Step 1: Add message types for teleport state, elicitation requests/responses, and message actions not already covered**
- [ ] **Step 2: Write failing tests for any extracted protocol-normalization helper**
- [ ] **Step 3: Wire `elicitation` control requests and teleport-related system messages through the host to the webview**
- [ ] **Step 4: Verify host-side cancel behavior works with stale dialogs**
- [ ] **Step 5: Commit**

```bash
git add src/webview/types.ts src/extension.ts
git commit -m "feat(interactions): route teleport and elicitation messages"
```

---

## Task 2: Build TeleportDialog and ElicitationDialog

**Files:**
- Create: `webview/src/components/dialogs/TeleportDialog.tsx`
- Create: `webview/src/components/dialogs/ElicitationDialog.tsx`

- [ ] **Step 1: Write focused component/helper tests for option rendering and submit behavior**
- [ ] **Step 2: Implement `TeleportDialog.tsx` showing source details and accept/reject actions**
- [ ] **Step 3: Implement `ElicitationDialog.tsx` supporting multiple choice, free text, and dropdown responses**
- [ ] **Step 4: Run `npm run build:webview` and confirm PASS**
- [ ] **Step 5: Commit**

```bash
git add webview/src/components/dialogs/TeleportDialog.tsx webview/src/components/dialogs/ElicitationDialog.tsx
git commit -m "feat(interactions): add teleport and elicitation dialogs"
```

---

## Task 3: Add message interaction controls

**Files:**
- Create: `webview/src/components/chat/MessageActions.tsx`
- Modify: `webview/src/hooks/useChat.ts`
- Modify: relevant message components from Story 4

- [ ] **Step 1: Add state/actions for stop, retry, copy, and edit to the chat view model**
- [ ] **Step 2: Implement `MessageActions.tsx` and attach it to user/assistant message rendering where appropriate**
- [ ] **Step 3: Route stop → interrupt, retry → resend last user message, copy → clipboard message, edit → edit-and-resend flow**
- [ ] **Step 4: Run `npm run build:webview` and manually verify all four interactions**
- [ ] **Step 5: Commit**

```bash
git add webview/src/components/chat/MessageActions.tsx webview/src/hooks/useChat.ts
 git commit -m "feat(interactions): add message action controls"
```

---

## Final Verification

- [ ] Run: `npm run build`
- [ ] Manual: trigger elicitation dialog, teleport dialog, and stop/retry/copy/edit flows
