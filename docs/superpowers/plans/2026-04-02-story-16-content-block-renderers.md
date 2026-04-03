# Story 16: Content Block Renderers (Thinking, Images, Documents, Search) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the chat UI so it can render all non-basic streamed content block types from the CLI, including thinking, images, documents, search results, and server tool use.

**Architecture:** Build focused renderer components per content block type and plug them into the Story 4 chat rendering pipeline. Keep block parsing in hooks/view-model code and keep each renderer as a presentational component with narrowly scoped props.

**Tech Stack:** React 18, TypeScript 5.x, Tailwind CSS, Vitest

**Spec:** [2026-04-02-openclaude-vscode-extension-design.md](../specs/2026-04-02-openclaude-vscode-extension-design.md) — Story 16, Sections 3.5, 5.2, 8

**Depends on:** Story 4

---

## File Structure

| File | Responsibility |
|---|---|
| `webview/src/components/blocks/ThinkingBlockRenderer.tsx` | Collapsible thinking trace with summary support |
| `webview/src/components/blocks/RedactedThinkingBlock.tsx` | Hidden-thinking placeholder renderer |
| `webview/src/components/blocks/ImageBlockRenderer.tsx` | Inline image rendering from URL/base64 |
| `webview/src/components/blocks/DocumentBlockRenderer.tsx` | Render PDF/document content blocks |
| `webview/src/components/blocks/SearchResultBlock.tsx` | Search result card renderer |
| `webview/src/components/blocks/WebSearchResultBlock.tsx` | Web-search-specific result renderer |
| `webview/src/components/blocks/ServerToolUseBlock.tsx` | Server-side tool invocation renderer |
| `webview/src/hooks/useStream.ts` | Extend content block parsing and normalized block types |
| `webview/src/components/chat/AssistantMessage.tsx` | Route block types to the new renderers |

---

## Task 1: Extend stream parsing for advanced block types

**Files:**
- Modify: `webview/src/hooks/useStream.ts`
- Test: add/update hook helper tests if present

- [ ] **Step 1: Write failing tests for parsing `thinking`, `redacted_thinking`, `image`, `document`, `search_result`, `web_search_tool_result`, and `server_tool_use` blocks**
- [ ] **Step 2: Run the targeted test and confirm failure**
- [ ] **Step 3: Extend the stream normalization layer to emit stable typed block view models for each new block type**
- [ ] **Step 4: Re-run the targeted test and confirm PASS**
- [ ] **Step 5: Commit**

```bash
git add webview/src/hooks/useStream.ts
git commit -m "feat(chat): parse advanced streamed content blocks"
```

---

## Task 2: Build per-block renderers

**Files:**
- Create: `webview/src/components/blocks/ThinkingBlockRenderer.tsx`
- Create: `webview/src/components/blocks/RedactedThinkingBlock.tsx`
- Create: `webview/src/components/blocks/ImageBlockRenderer.tsx`
- Create: `webview/src/components/blocks/DocumentBlockRenderer.tsx`
- Create: `webview/src/components/blocks/SearchResultBlock.tsx`
- Create: `webview/src/components/blocks/WebSearchResultBlock.tsx`
- Create: `webview/src/components/blocks/ServerToolUseBlock.tsx`

- [ ] **Step 1: Write focused component/helper tests for the most stateful renderers (`ThinkingBlockRenderer`, `ImageBlockRenderer`)**
- [ ] **Step 2: Implement each renderer as a presentational component with no direct VS Code API access**
- [ ] **Step 3: Support reduced-motion-friendly interactions where animation/collapse affordances are involved**
- [ ] **Step 4: Run `npm run build:webview` and confirm PASS**
- [ ] **Step 5: Commit**

```bash
git add webview/src/components/blocks
git commit -m "feat(chat): add advanced content block renderers"
```

---

## Task 3: Integrate renderers into assistant message display

**Files:**
- Modify: `webview/src/components/chat/AssistantMessage.tsx`
- Modify: any block type definitions introduced by Story 4

- [ ] **Step 1: Route each block type to its renderer in `AssistantMessage.tsx`**
- [ ] **Step 2: Preserve existing text/tool-call rendering behavior from Story 4**
- [ ] **Step 3: Run `npm run build:webview` and manual verification with representative mock messages**
- [ ] **Step 4: Commit**

```bash
git add webview/src/components/chat/AssistantMessage.tsx
 git commit -m "feat(chat): integrate advanced content block renderers"
```

---

## Final Verification

- [ ] Run: `npm run build:webview`
- [ ] Manual: verify each advanced content block type renders correctly in a sample conversation
