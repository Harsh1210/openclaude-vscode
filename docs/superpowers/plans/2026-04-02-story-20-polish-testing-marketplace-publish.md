# Story 20: Polish, Testing & Marketplace Publish — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the extension for release by tightening tests, packaging, CI, docs, branding assets, and marketplace publication flow.

**Architecture:** This is an integration/polish story. Avoid new product behavior unless required for release quality. Focus on verification, packaging hygiene, documentation, and automated build/test/publish workflows.

**Tech Stack:** TypeScript 5.x, Vitest, @vscode/test-electron, GitHub Actions, vsce

**Spec:** [2026-04-02-openclaude-vscode-extension-design.md](../specs/2026-04-02-openclaude-vscode-extension-design.md) — Story 20, Sections 6, 8

**Depends on:** Stories 1-19

---

## File Structure

| File | Responsibility |
|---|---|
| `test/integration/extension.test.ts` | End-to-end extension activation and key workflow coverage |
| `.github/workflows/ci.yml` | Build + test workflow |
| `.github/workflows/publish.yml` | Packaging/publish workflow |
| `README.md` | User-facing documentation, screenshots, setup steps |
| `CHANGELOG.md` | Release notes |
| `.vscodeignore` | Packaging exclusions |
| `resources/*.svg` / screenshots | Final branding assets |

---

## Task 1: Strengthen automated testing

**Files:**
- Create/Modify: `test/integration/extension.test.ts`
- Modify: package/test config files as needed

- [ ] **Step 1: Add integration coverage for activation and one representative open/send flow using `@vscode/test-electron`**
- [ ] **Step 2: Fill obvious unit test gaps in critical managers that still lack coverage**
- [ ] **Step 3: Run the full test suite and record remaining failures before fixing them**
- [ ] **Step 4: Fix only release-blocking test infrastructure issues discovered during the run**
- [ ] **Step 5: Commit**

```bash
git add test
 git commit -m "test: strengthen extension integration coverage"
```

---

## Task 2: Finalize docs, branding, and packaging

**Files:**
- Modify/Create: `README.md`
- Modify/Create: `CHANGELOG.md`
- Modify: `.vscodeignore`
- Modify: final logo/screenshot assets as needed

- [ ] **Step 1: Update README with install, usage, provider setup, and screenshots**
- [ ] **Step 2: Add CHANGELOG entries for the initial release**
- [ ] **Step 3: Trim `.vscodeignore` to exclude development-only files without excluding required runtime assets**
- [ ] **Step 4: Verify `vsce package` produces a clean `.vsix`**
- [ ] **Step 5: Commit**

```bash
git add README.md CHANGELOG.md .vscodeignore resources
 git commit -m "docs: finalize release documentation and packaging assets"
```

---

## Task 3: Add CI and publish automation

**Files:**
- Create: `.github/workflows/ci.yml`
- Create: `.github/workflows/publish.yml`

- [ ] **Step 1: Add CI workflow for install, build, lint, and test**
- [ ] **Step 2: Add publish workflow for packaging and marketplace publish, using repository secrets rather than hard-coded credentials**
- [ ] **Step 3: Validate workflow YAML syntax and confirm commands match the repo’s actual scripts**
- [ ] **Step 4: Commit**

```bash
git add .github/workflows/ci.yml .github/workflows/publish.yml
git commit -m "ci: add build, test, and publish workflows"
```

---

## Final Verification

- [ ] Run: `npm run build`
- [ ] Run: `npm test`
- [ ] Run: `npx @vscode/vsce package --no-dependencies`
- [ ] Confirm the extension is ready for marketplace submission
