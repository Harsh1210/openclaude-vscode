# Story 15: Onboarding, Walkthrough & URI Handler — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish onboarding surfaces by adding a first-run checklist, walkthrough integration, URI handling, and settings-schema contribution behavior that matches the OpenClaude extension experience.

**Architecture:** Reuse the existing walkthrough contribution foundation in `package.json`, add a lightweight webview onboarding checklist that can be dismissed via setting, and register a VS Code URI handler that routes deep links into the existing panel/session open flows. Keep settings schema delivery declarative, with only minimal host logic around onboarding visibility.

**Tech Stack:** TypeScript 5.x, VS Code Extension API, React 18, Vitest

**Spec:** [2026-04-02-openclaude-vscode-extension-design.md](../specs/2026-04-02-openclaude-vscode-extension-design.md) — Story 15, Sections 4.6, 4.7, 5.2, 8

**Depends on:** Story 3

---

## File Structure

| File | Responsibility |
|---|---|
| `resources/walkthrough/step1.md` ... `step4.md` | Final walkthrough copy and asset references |
| `webview/src/components/onboarding/OnboardingChecklist.tsx` | In-webview first-run checklist |
| `src/extension.ts` | Register URI handler and onboarding visibility state |
| `openclaude-settings.schema.json` | Ensure schema contribution matches expected OpenClaude paths and settings |
| `test/unit/uriHandler.test.ts` | Optional pure tests for URI parsing helper |

---

## Task 1: Finalize walkthrough and onboarding checklist

**Files:**
- Modify: `resources/walkthrough/step1.md`
- Modify: `resources/walkthrough/step2.md`
- Modify: `resources/walkthrough/step3.md`
- Modify: `resources/walkthrough/step4.md`
- Create: `webview/src/components/onboarding/OnboardingChecklist.tsx`

- [ ] **Step 1: Review existing walkthrough markdown and update copy/screenshots to match current OpenClaude branding and commands**
- [ ] **Step 2: Write a failing component/helper test for onboarding visibility state if a helper is introduced**
- [ ] **Step 3: Implement `OnboardingChecklist.tsx` with dismiss and open-walkthrough actions**
- [ ] **Step 4: Respect `openclaudeCode.hideOnboarding` rather than inventing a second setting**
- [ ] **Step 5: Run `npm run build:webview` and confirm PASS**
- [ ] **Step 6: Commit**

```bash
git add resources/walkthrough webview/src/components/onboarding/OnboardingChecklist.tsx
git commit -m "feat(onboarding): add onboarding checklist and finalize walkthrough"
```

---

## Task 2: Add URI handling

**Files:**
- Modify: `src/extension.ts`
- Test: `test/unit/uriHandler.test.ts` (if using a pure parser helper)

- [ ] **Step 1: Write failing tests for URI parsing if you extract a helper**
- [ ] **Step 2: Register a `vscode.UriHandler` for `vscode://harsh1210.openclaude-vscode/open?...`**
- [ ] **Step 3: Support at least `prompt` and `session` query parameters and route them into the existing open/new-session flow**
- [ ] **Step 4: Fail gracefully on unknown/malformed URIs with a visible message**
- [ ] **Step 5: Run `npm run build` and manually test a URI launch**
- [ ] **Step 6: Commit**

```bash
git add src/extension.ts test/unit/uriHandler.test.ts
git commit -m "feat(uri): add OpenClaude URI handler"
```

---

## Task 3: Verify settings-schema contribution behavior

**Files:**
- Modify: `openclaude-settings.schema.json` (only if needed)
- Modify: `package.json` (only if needed)

- [ ] **Step 1: Compare current schema contribution paths with the spec and add any missing OpenClaude managed-settings path entries**
- [ ] **Step 2: Validate the schema file remains valid JSON**
- [ ] **Step 3: Run `npm run build` and verify package.json/schema contributions still build cleanly**
- [ ] **Step 4: Commit**

```bash
git add openclaude-settings.schema.json package.json
git commit -m "chore(schema): align settings schema contributions"
```

---

## Final Verification

- [ ] Run: `npm run build`
- [ ] Manual: verify onboarding checklist visibility and dismiss behavior
- [ ] Manual: open a `vscode://harsh1210.openclaude-vscode/open?...` URI and confirm it routes correctly
