# Story 18: Settings Schema, Fast Mode & Prompt Suggestions — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the settings/schema and lightweight UX features around fast mode, prompt suggestions, company announcements, feedback survey, and spinner customization.

**Architecture:** Keep the settings schema declarative in `openclaude-settings.schema.json`, then wire a few focused webview components to existing CLI metadata/state rather than creating a separate settings subsystem. Managed settings remain the source of truth; the extension renders and forwards them.

**Tech Stack:** TypeScript 5.x, JSON Schema, React 18, VS Code Extension API

**Spec:** [2026-04-02-openclaude-vscode-extension-design.md](../specs/2026-04-02-openclaude-vscode-extension-design.md) — Story 18, Sections 2.3.2, 4.7, 5.2, 8

**Depends on:** Story 1

---

## File Structure

| File | Responsibility |
|---|---|
| `openclaude-settings.schema.json` | Full rebranded settings schema contribution |
| `webview/src/components/input/FastModeToggle.tsx` | UI toggle/indicator for fast mode |
| `webview/src/components/chat/PromptSuggestions.tsx` | Render prompt suggestions returned by the CLI |
| `webview/src/components/dialogs/FeedbackSurvey.tsx` | Configurable quality survey dialog |
| `webview/src/hooks/useChat.ts` | Surface prompt suggestions and fast-mode state |
| `src/webview/types.ts` | Fast mode / prompt suggestion messages if missing |

---

## Task 1: Align and validate the settings schema

**Files:**
- Modify: `openclaude-settings.schema.json`
- Modify: `package.json` (only if contribution paths are incomplete)

- [ ] **Step 1: Compare the current schema against the Story 18 requirements and fill any missing property groups from the Claude Code schema fork**
- [ ] **Step 2: Validate the JSON file parses cleanly**
- [ ] **Step 3: Verify the contribution paths in `package.json` match the intended OpenClaude settings files**
- [ ] **Step 4: Commit**

```bash
git add openclaude-settings.schema.json package.json
git commit -m "chore(settings): complete OpenClaude settings schema"
```

---

## Task 2: Add fast mode and prompt suggestions UI

**Files:**
- Create: `webview/src/components/input/FastModeToggle.tsx`
- Create: `webview/src/components/chat/PromptSuggestions.tsx`
- Modify: `webview/src/hooks/useChat.ts`
- Modify: `src/webview/types.ts`

- [ ] **Step 1: Add any missing protocol types for fast-mode state and prompt suggestions**
- [ ] **Step 2: Write a failing helper/component test for suggestion rendering or fast-mode toggle state**
- [ ] **Step 3: Implement `FastModeToggle.tsx` and `PromptSuggestions.tsx`**
- [ ] **Step 4: Thread the state through `useChat.ts` so the UI updates from CLI events**
- [ ] **Step 5: Run `npm run build:webview` and confirm PASS**
- [ ] **Step 6: Commit**

```bash
git add webview/src/components/input/FastModeToggle.tsx webview/src/components/chat/PromptSuggestions.tsx webview/src/hooks/useChat.ts src/webview/types.ts
git commit -m "feat(chat): add fast mode toggle and prompt suggestions"
```

---

## Task 3: Add survey/announcement/spinner polish surfaces

**Files:**
- Create: `webview/src/components/dialogs/FeedbackSurvey.tsx`
- Modify: relevant chat/input components to display announcements or spinner text if the data is already available

- [ ] **Step 1: Implement `FeedbackSurvey.tsx` as a small dismissible dialog driven by managed settings/state**
- [ ] **Step 2: If company announcements and spinner tips are already available in the streamed/system state, render them with minimal focused UI; otherwise only wire the display surfaces that have real backing data**
- [ ] **Step 3: Run `npm run build:webview` and manually verify the new UI surfaces**
- [ ] **Step 4: Commit**

```bash
git add webview/src/components/dialogs/FeedbackSurvey.tsx
 git commit -m "feat(chat): add feedback survey and managed UX surfaces"
```

---

## Final Verification

- [ ] Run: `npm run build`
- [ ] Manual: verify schema contribution, fast mode toggle rendering, and prompt suggestions display
