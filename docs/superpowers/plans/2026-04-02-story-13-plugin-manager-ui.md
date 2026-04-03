# Story 13: Plugin Manager UI — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a plugin manager dialog that lists installed plugins, supports enable/disable flows, and opens install/browse actions without re-implementing plugin logic already handled by the CLI.

**Architecture:** Treat the CLI as source of truth for plugin state and use the extension/webview only as a renderer and action relay. Build one focused dialog that consumes plugin state payloads from the host and sends plugin actions back through existing control requests or slash-command wrappers.

**Tech Stack:** TypeScript 5.x, React 18, VS Code Extension API, Vitest

**Spec:** [2026-04-02-openclaude-vscode-extension-design.md](../specs/2026-04-02-openclaude-vscode-extension-design.md) — Story 13, Sections 3.4, 5.1, 5.2, 8

**Depends on:** Story 4

---

## File Structure

| File | Responsibility |
|---|---|
| `webview/src/components/dialogs/PluginManager.tsx` | Installed plugin list, details, enable/disable/install actions |
| `src/webview/types.ts` | Plugin manager protocol messages |
| `src/extension.ts` | Handle plugin UI actions and bridge to CLI commands/control requests |
| `test/unit/pluginManagerViewModel.test.ts` | Pure tests for plugin-state normalization if needed |

---

## Task 1: Add plugin manager protocol and view model helpers

**Files:**
- Modify: `src/webview/types.ts`
- Create: `test/unit/pluginManagerViewModel.test.ts` (if pure helper is used)

- [ ] **Step 1: Add message types for `get_plugins_state`, `plugins_state`, `set_plugin_enabled`, and `install_plugin`**
- [ ] **Step 2: If normalizing plugin payloads, write failing tests for that helper**
- [ ] **Step 3: Implement the helper only if needed; keep it small and UI-focused**
- [ ] **Step 4: Run the targeted test or skip if no helper was necessary**
- [ ] **Step 5: Commit**

```bash
git add src/webview/types.ts test/unit/pluginManagerViewModel.test.ts
git commit -m "feat(plugins): add plugin manager protocol types"
```

---

## Task 2: Build the PluginManager dialog

**Files:**
- Create: `webview/src/components/dialogs/PluginManager.tsx`

- [ ] **Step 1: Write a failing component/helper test for enable/disable action availability or plugin detail formatting**
- [ ] **Step 2: Implement `PluginManager.tsx` with installed plugin cards, detail panel, enable/disable toggles, and install action entry point**
- [ ] **Step 3: Keep marketplace browsing lightweight: render available sources and kick off host-side install action instead of building a full app store**
- [ ] **Step 4: Run `npm run build:webview` and confirm PASS**
- [ ] **Step 5: Commit**

```bash
git add webview/src/components/dialogs/PluginManager.tsx
git commit -m "feat(plugins): add plugin manager dialog"
```

---

## Task 3: Wire plugin actions through the extension host

**Files:**
- Modify: `src/extension.ts`

- [ ] **Step 1: Implement host handlers that request plugin state from the CLI or current session metadata**
- [ ] **Step 2: Route enable/disable/install actions back to the CLI via control request or slash-command message flow**
- [ ] **Step 3: Connect `openclaude.installPlugin` to open the dialog in the active panel**
- [ ] **Step 4: Run `npm run build` and manually verify plugin toggles and installer entry flow**
- [ ] **Step 5: Commit**

```bash
git add src/extension.ts
git commit -m "feat(plugins): wire plugin manager actions"
```

---

## Final Verification

- [ ] Run: `npm run build`
- [ ] Manual: open plugin manager, view installed plugins, toggle a plugin, and start an install flow
