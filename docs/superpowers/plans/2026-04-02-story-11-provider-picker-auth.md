# Story 11: Provider Picker & Auth — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement provider selection, auth configuration, and provider-aware spawn settings so users can switch between supported LLM backends from the OpenClaude VS Code UI.

**Architecture:** Add a host-side auth/settings layer that reads and persists provider settings in VS Code configuration, validates minimally where appropriate, and injects the right environment variables into `ProcessManager`. Build a webview `ProviderPicker` dialog and provider badge that interact with the host only through the existing postMessage bridge.

**Tech Stack:** TypeScript 5.x, VS Code Extension API, React 18, Vitest

**Spec:** [2026-04-02-openclaude-vscode-extension-design.md](../specs/2026-04-02-openclaude-vscode-extension-design.md) — Story 11, Sections 2.2, 3.2, 3.4, 5.1, 5.2, 8

**Depends on:** Story 4

---

## File Structure

| File | Responsibility |
|---|---|
| `src/auth/authManager.ts` | Provider definitions, config validation, env-var assembly, auth checks |
| `src/settings/settingsSync.ts` | Read/write VS Code settings used by provider picker and process spawning |
| `test/unit/authManager.test.ts` | Unit tests for provider env mapping and validation |
| `webview/src/components/dialogs/ProviderPicker.tsx` | Provider selection and configuration dialog |
| `webview/src/components/input/ProviderBadge.tsx` | Current provider/model display |
| `src/webview/types.ts` | Add provider-related host/webview messages |
| `src/extension.ts` | Wire provider messages, save settings, refresh process config |
| `src/process/processManager.ts` | Accept provider-derived env vars/model configuration |

---

## Task 1: Build host-side provider/auth layer

**Files:**
- Create: `src/auth/authManager.ts`
- Create: `src/settings/settingsSync.ts`
- Test: `test/unit/authManager.test.ts`

- [ ] **Step 1: Write failing tests for provider env mapping**

Cover:
- OpenAI-compatible provider env output
- Ollama local defaults
- custom base URL support
- validation failure for missing required API key/base URL where applicable

- [ ] **Step 2: Run tests to verify failure**

Run: `npm test -- test/unit/authManager.test.ts`
Expected: FAIL with missing module/class.

- [ ] **Step 3: Implement `SettingsSync`**

Create a small wrapper around `vscode.workspace.getConfiguration('openclaudeCode')` with getters/setters for:
- selected provider
- selected model
- provider-specific values (api key, base URL if stored by the extension)
- any existing environment variable array already supported by the scaffold

- [ ] **Step 4: Implement `AuthManager`**

Create:

```typescript
export interface ProviderConfig {
  id: string;
  label: string;
  env: Record<string, string>;
  model?: string;
}

export class AuthManager {
  getAvailableProviders(): ProviderDefinition[];
  getCurrentProvider(): ProviderConfig;
  updateProvider(input: ProviderUpdateInput): Promise<void>;
  buildProcessEnv(): Record<string, string>;
  validate(input: ProviderUpdateInput): ProviderValidationResult;
}
```

Support at least the providers named in the spec in a config-driven way; do not hard-code UI-only logic into `ProcessManager`.

- [ ] **Step 5: Run tests**

Run: `npm test -- test/unit/authManager.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/auth/authManager.ts src/settings/settingsSync.ts test/unit/authManager.test.ts
git commit -m "feat(auth): add provider auth manager and settings sync"
```

---

## Task 2: Add provider picker UI

**Files:**
- Create: `webview/src/components/dialogs/ProviderPicker.tsx`
- Modify: `webview/src/components/input/ProviderBadge.tsx`
- Modify: `src/webview/types.ts`

- [ ] **Step 1: Add provider protocol messages**

Add message types for:
- `get_provider_state`
- `provider_state`
- `set_provider`
- `open_provider_picker`

- [ ] **Step 2: Write a failing UI/helper test**

Add a focused test or pure helper assertion for provider filtering / required fields display.

- [ ] **Step 3: Implement `ProviderPicker.tsx`**

Requirements:
- list provider choices clearly
- show required fields (API key, base URL, model)
- validate before submit
- submit via postMessage, not direct settings access
- keep UI simple; no OAuth flows in the webview

- [ ] **Step 4: Upgrade `ProviderBadge.tsx`**

Show current provider + model and open the picker on click.

- [ ] **Step 5: Build the webview**

Run: `npm run build:webview`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add webview/src/components/dialogs/ProviderPicker.tsx webview/src/components/input/ProviderBadge.tsx src/webview/types.ts
git commit -m "feat(auth): add provider picker dialog and badge"
```

---

## Task 3: Wire provider state into process spawning

**Files:**
- Modify: `src/extension.ts`
- Modify: `src/process/processManager.ts`
- Modify: `webview/src/App.tsx` or input composition root if Story 5 is already merged

- [ ] **Step 1: Return provider state to the webview**

Handle `get_provider_state` and `set_provider` messages in `src/extension.ts`, using `AuthManager` + `SettingsSync`.

- [ ] **Step 2: Inject provider env into `ProcessManager`**

When building process options, merge:
- provider-derived env vars
- user-configured `openclaudeCode.environmentVariables`
- model override from current provider selection

Avoid duplicating env merge logic in multiple places.

- [ ] **Step 3: Add minimal validation flows**

On invalid configuration, return a structured error to the webview and show it in the picker instead of crashing spawn.

- [ ] **Step 4: Manual verification**

Run:
- `npm run build`
- open extension host
- switch providers
- verify badge updates
- verify process spawn receives expected env/model config

- [ ] **Step 5: Commit**

```bash
git add src/extension.ts src/process/processManager.ts webview/src/App.tsx
 git commit -m "feat(auth): wire provider selection into process spawning"
```

---

## Final Verification

- [ ] Run: `npm run build`
- [ ] Run: `npm test -- test/unit/authManager.test.ts`
- [ ] Manual: switch providers and verify badge + spawn config update
