# Story 1: Project Scaffolding & Extension Shell — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Set up a working VS Code extension scaffold that activates, shows an icon in the sidebar, opens a webview panel, and can be packaged as a .vsix — with all 22 commands, keybindings, settings, and views rebranded from Claude Code.

**Architecture:** Fork Claude Code's `package.json` (rebrand all identifiers), create a minimal TypeScript extension host that registers a WebviewViewProvider, and scaffold a Vite + React + Tailwind webview app that renders "OpenClaude" placeholder text. esbuild bundles the extension host; Vite bundles the webview.

**Tech Stack:** TypeScript 5.x, VS Code Extension API, React 18, Tailwind CSS 3, Vite 5, esbuild

**Spec:** [2026-04-02-openclaude-vscode-extension-design.md](../specs/2026-04-02-openclaude-vscode-extension-design.md) — Story 1

**Claude Code extension (source to extract from):** `~/.vscode/extensions/anthropic.claude-code-2.1.85-darwin-arm64/`

---

## File Structure

| File | Responsibility |
|---|---|
| `package.json` | Extension manifest — forked from Claude Code, rebranded. All commands, keybindings, settings, views, menus. |
| `tsconfig.json` | TypeScript config for extension host (CommonJS, strict) |
| `esbuild.config.mjs` | Bundles `src/extension.ts` → `dist/extension.js` |
| `src/extension.ts` | Extension activation — registers providers, commands, disposables |
| `src/webview/webviewProvider.ts` | WebviewViewProvider for sidebar + WebviewPanel for editor tabs |
| `webview/index.html` | Webview HTML shell |
| `webview/src/main.tsx` | React entry point |
| `webview/src/App.tsx` | Root React component — placeholder "OpenClaude" |
| `webview/src/vscode.ts` | Typed wrapper around `acquireVsCodeApi()` |
| `webview/src/styles/index.css` | Tailwind CSS imports |
| `webview/vite.config.ts` | Vite config — builds to `dist/webview/` |
| `webview/tailwind.config.ts` | Tailwind config with VS Code theme colors |
| `webview/tsconfig.json` | TypeScript config for webview (ESM, JSX) |
| `.vscode/launch.json` | F5 debug launch — Extension Development Host |
| `.vscode/tasks.json` | Build tasks for esbuild + vite |
| `resources/openclaude-logo.svg` | Activity bar icon (rebranded from Claude Code) |
| `resources/openclaude-logo.png` | Extension marketplace icon |
| `resources/openclaude-logo-done.svg` | Status icon (task complete) |
| `resources/openclaude-logo-pending.svg` | Status icon (pending) |
| `openclaude-settings.schema.json` | Settings schema — forked from Claude Code, rebranded |
| `resources/walkthrough/step1.md` | Walkthrough step 1 — rebranded |
| `resources/walkthrough/step2.md` | Walkthrough step 2 — rebranded |
| `resources/walkthrough/step3.md` | Walkthrough step 3 — rebranded |
| `resources/walkthrough/step4.md` | Walkthrough step 4 — rebranded |
| `.vscodeignore` | Exclude src/, test/, docs/ from .vsix |
| `.eslintrc.json` | ESLint config |
| `.prettierrc` | Prettier config |
| `.gitignore` | Node, dist, out patterns |

---

## Task 1: Fork and Rebrand package.json

**Files:**
- Create: `package.json`

This is the most important file — it defines ALL the extension's contributions to VS Code. We fork Claude Code's `package.json` at `~/.vscode/extensions/anthropic.claude-code-2.1.85-darwin-arm64/package.json` and rebrand.

- [ ] **Step 1: Copy Claude Code's package.json and rebrand identifiers**

Create `package.json` with these changes from the original:

| Original | Rebranded |
|---|---|
| `"name": "claude-code"` | `"name": "openclaude-vscode"` |
| `"displayName": "Claude Code for VS Code"` | `"displayName": "OpenClaude VS Code"` |
| `"publisher": "Anthropic"` | `"publisher": "Harsh1210"` |
| `"description": "Claude Code for VS Code: ..."` | `"description": "OpenClaude VS Code: AI coding assistant powered by any LLM"` |
| `"version": "2.1.85"` | `"version": "0.1.0"` |
| All `claude-vscode.*` commands | `openclaude.*` commands |
| All `claude-code.*` commands | `openclaude.*` commands |
| All `claudeCode.*` settings | `openclaudeCode.*` settings |
| All `claudeVSCode*` view IDs | `openclaude*` view IDs |
| All `claude-sidebar*` container IDs | `openclaude-sidebar*` |
| Title strings "Claude Code" | "OpenClaude" |
| Icon paths `resources/claude-logo.*` | `resources/openclaude-logo.*` |
| Walkthrough ID `claude-code-walkthrough` | `openclaude-walkthrough` |
| Schema path `./claude-code-settings.schema.json` | `./openclaude-settings.schema.json` |
| JSON validation paths `**/.claude/settings.json` | Keep same (CLI uses `.claude/` dir) |
| `main: "./extension.js"` | `main: "./dist/extension.js"` |
| Remove `__metadata` block | — |
| Remove `license` (Anthropic copyright) | `"license": "MIT"` |

Also add dependencies and scripts:

```json
{
  "scripts": {
    "build": "npm run build:extension && npm run build:webview",
    "build:extension": "node esbuild.config.mjs",
    "build:webview": "cd webview && npx vite build",
    "watch": "node esbuild.config.mjs --watch",
    "package": "npx @vscode/vsce package --no-dependencies",
    "lint": "eslint src/ webview/src/",
    "format": "prettier --write \"src/**/*.ts\" \"webview/src/**/*.{ts,tsx}\""
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "@types/vscode": "^1.94.0",
    "esbuild": "^0.21.0",
    "eslint": "^8.57.0",
    "prettier": "^3.3.0",
    "typescript": "^5.5.0",
    "@vscode/vsce": "^3.0.0"
  },
  "engines": {
    "vscode": "^1.94.0"
  }
}
```

Keep ALL of these sections identical (just rebrand IDs):
- `contributes.commands` (all 22 commands)
- `contributes.keybindings` (all 5)
- `contributes.configuration` (all 15 settings)
- `contributes.viewsContainers` (activity bar + secondary sidebar)
- `contributes.views` (4 webview views)
- `contributes.walkthroughs` (4 steps)
- `contributes.menus` (editor/title + commandPalette)
- `contributes.jsonValidation`
- `activationEvents`
- `capabilities`

- [ ] **Step 2: Verify package.json is valid**

Run: `cd /Users/harshagarwal/Documents/workspace/openclaude-vscode && node -e "JSON.parse(require('fs').readFileSync('package.json','utf8')); console.log('Valid JSON')"`

Expected: `Valid JSON`

- [ ] **Step 3: Commit**

```bash
git add package.json
git commit -m "feat: fork and rebrand package.json from Claude Code extension"
```

---

## Task 2: TypeScript and Build Configuration

**Files:**
- Create: `tsconfig.json`
- Create: `esbuild.config.mjs`
- Create: `.eslintrc.json`
- Create: `.prettierrc`
- Create: `.gitignore`
- Create: `.vscodeignore`

- [ ] **Step 1: Create tsconfig.json for extension host**

```json
{
  "compilerOptions": {
    "module": "commonjs",
    "target": "ES2022",
    "lib": ["ES2022"],
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "webview"]
}
```

- [ ] **Step 2: Create esbuild.config.mjs**

```javascript
import * as esbuild from 'esbuild';

const isWatch = process.argv.includes('--watch');

const buildOptions = {
  entryPoints: ['src/extension.ts'],
  bundle: true,
  outfile: 'dist/extension.js',
  external: ['vscode'],
  format: 'cjs',
  platform: 'node',
  target: 'node18',
  sourcemap: true,
  minify: false,
};

if (isWatch) {
  const ctx = await esbuild.context(buildOptions);
  await ctx.watch();
  console.log('Watching for changes...');
} else {
  await esbuild.build(buildOptions);
  console.log('Extension built successfully');
}
```

- [ ] **Step 3: Create .eslintrc.json**

```json
{
  "root": true,
  "parser": "@typescript-eslint/parser",
  "plugins": ["@typescript-eslint"],
  "extends": [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended"
  ],
  "rules": {
    "@typescript-eslint/no-unused-vars": ["warn", { "argsIgnorePattern": "^_" }],
    "@typescript-eslint/no-explicit-any": "warn"
  },
  "ignorePatterns": ["dist/", "node_modules/", "webview/dist/"]
}
```

- [ ] **Step 4: Create .prettierrc**

```json
{
  "semi": true,
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "tabWidth": 2
}
```

- [ ] **Step 5: Create .gitignore**

```
node_modules/
dist/
*.vsix
.vscode-test/
webview/node_modules/
webview/dist/
```

- [ ] **Step 6: Create .vscodeignore**

```
src/**
webview/src/**
webview/node_modules/**
test/**
docs/**
.eslintrc.json
.prettierrc
tsconfig.json
esbuild.config.mjs
webview/vite.config.ts
webview/tailwind.config.ts
webview/tsconfig.json
webview/index.html
webview/postcss.config.js
**/*.map
```

- [ ] **Step 7: Install dependencies**

Run: `cd /Users/harshagarwal/Documents/workspace/openclaude-vscode && npm install`

Expected: `added X packages`

- [ ] **Step 8: Verify esbuild works (will fail — no src/extension.ts yet, that's OK)**

Run: `node esbuild.config.mjs 2>&1 || echo "Expected failure — no source yet"`

- [ ] **Step 9: Commit**

```bash
git add tsconfig.json esbuild.config.mjs .eslintrc.json .prettierrc .gitignore .vscodeignore
git commit -m "chore: add TypeScript, esbuild, ESLint, Prettier config"
```

---

## Task 3: Extension Entry Point

**Files:**
- Create: `src/extension.ts`

- [ ] **Step 1: Create the extension entry point**

```typescript
import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
  console.log('OpenClaude VS Code extension activated');

  // Register the "Open in New Tab" command as a basic smoke test
  const openInTab = vscode.commands.registerCommand('openclaude.editor.open', () => {
    vscode.window.showInformationMessage('OpenClaude: Coming soon!');
  });

  // Register the "Open" command (hidden, used by editor title button)
  const openLast = vscode.commands.registerCommand('openclaude.editor.openLast', () => {
    vscode.window.showInformationMessage('OpenClaude: Coming soon!');
  });

  // Register remaining commands as no-ops for now (prevents "command not found" errors)
  const commandIds = [
    'openclaude.primaryEditor.open',
    'openclaude.window.open',
    'openclaude.sidebar.open',
    'openclaude.terminal.open',
    'openclaude.terminal.open.keyboard',
    'openclaude.createWorktree',
    'openclaude.newConversation',
    'openclaude.focus',
    'openclaude.blur',
    'openclaude.insertAtMention',
    'openclaude.acceptProposedDiff',
    'openclaude.rejectProposedDiff',
    'openclaude.showLogs',
    'openclaude.openWalkthrough',
    'openclaude.update',
    'openclaude.installPlugin',
    'openclaude.logout',
  ];

  for (const id of commandIds) {
    context.subscriptions.push(
      vscode.commands.registerCommand(id, () => {
        vscode.window.showInformationMessage('OpenClaude: Coming soon!');
      }),
    );
  }

  context.subscriptions.push(openInTab, openLast);
}

export function deactivate() {
  console.log('OpenClaude VS Code extension deactivated');
}
```

- [ ] **Step 2: Build the extension**

Run: `cd /Users/harshagarwal/Documents/workspace/openclaude-vscode && node esbuild.config.mjs`

Expected: `Extension built successfully`

- [ ] **Step 3: Verify dist/extension.js exists**

Run: `ls -la dist/extension.js`

Expected: File exists, non-zero size

- [ ] **Step 4: Commit**

```bash
git add src/extension.ts
git commit -m "feat: add extension entry point with command registration"
```

---

## Task 4: VS Code Debug Configuration

**Files:**
- Create: `.vscode/launch.json`
- Create: `.vscode/tasks.json`

- [ ] **Step 1: Create .vscode/launch.json**

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Run Extension",
      "type": "extensionHost",
      "request": "launch",
      "args": ["--extensionDevelopmentPath=${workspaceFolder}"],
      "outFiles": ["${workspaceFolder}/dist/**/*.js"],
      "preLaunchTask": "build"
    }
  ]
}
```

- [ ] **Step 2: Create .vscode/tasks.json**

```json
{
  "version": "2.0.0",
  "tasks": [
    {
      "label": "build",
      "type": "shell",
      "command": "npm run build",
      "group": {
        "kind": "build",
        "isDefault": true
      },
      "problemMatcher": ["$tsc"]
    },
    {
      "label": "watch",
      "type": "shell",
      "command": "npm run watch",
      "isBackground": true,
      "problemMatcher": ["$tsc-watch"]
    }
  ]
}
```

- [ ] **Step 3: Commit**

```bash
git add .vscode/launch.json .vscode/tasks.json
git commit -m "chore: add VS Code debug launch and build tasks"
```

---

## Task 5: Resource Files (Icons, Walkthrough)

**Files:**
- Create: `resources/openclaude-logo.svg`
- Create: `resources/openclaude-logo.png` (placeholder)
- Create: `resources/openclaude-logo-done.svg`
- Create: `resources/openclaude-logo-pending.svg`
- Create: `resources/walkthrough/step1.md`
- Create: `resources/walkthrough/step2.md`
- Create: `resources/walkthrough/step3.md`
- Create: `resources/walkthrough/step4.md`

- [ ] **Step 1: Create openclaude-logo.svg**

Use the Claude logo SVG from `~/.vscode/extensions/anthropic.claude-code-2.1.85-darwin-arm64/resources/claude-logo.svg` but change the fill color from `#D97757` (Claude orange) to `#4F46E5` (indigo — to differentiate OpenClaude):

```svg
<svg height="1em" style="flex:none;line-height:1" viewBox="0 0 24 24" width="1em" xmlns="http://www.w3.org/2000/svg"><title>OpenClaude</title><path d="M4.709 15.955l4.72-2.647.08-.23-.08-.128H9.2l-.79-.048-2.698-.073-2.339-.097-2.266-.122-.571-.121L0 11.784l.055-.352.48-.321.686.06 1.52.103 2.278.158 1.652.097 2.449.255h.389l.055-.157-.134-.098-.103-.097-2.358-1.596-2.552-1.688-1.336-.972-.724-.491-.364-.462-.158-1.008.656-.722.881.06.225.061.893.686 1.908 1.476 2.491 1.833.365.304.145-.103.019-.073-.164-.274-1.355-2.446-1.446-2.49-.644-1.032-.17-.619a2.97 2.97 0 01-.104-.729L6.283.134 6.696 0l.996.134.42.364.62 1.414 1.002 2.229 1.555 3.03.456.898.243.832.091.255h.158V9.01l.128-1.706.237-2.095.23-2.695.08-.76.376-.91.747-.492.584.28.48.685-.067.444-.286 1.851-.559 2.903-.364 1.942h.212l.243-.242.985-1.306 1.652-2.064.73-.82.85-.904.547-.431h1.033l.76 1.129-.34 1.166-1.064 1.347-.881 1.142-1.264 1.7-.79 1.36.073.11.188-.02 2.856-.606 1.543-.28 1.841-.315.833.388.091.395-.328.807-1.969.486-2.309.462-3.439.813-.042.03.049.061 1.549.146.662.036h1.622l3.02.225.79.522.474.638-.079.485-1.215.62-1.64-.389-3.829-.91-1.312-.329h-.182v.11l1.093 1.068 2.006 1.81 2.509 2.33.127.578-.322.455-.34-.049-2.205-1.657-.851-.747-1.926-1.62h-.128v.17l.444.649 2.345 3.521.122 1.08-.17.353-.608.213-.668-.122-1.374-1.925-1.415-2.167-1.143-1.943-.14.08-.674 7.254-.316.37-.729.28-.607-.461-.322-.747.322-1.476.389-1.924.315-1.53.286-1.9.17-.632-.012-.042-.14.018-1.434 1.967-2.18 2.945-1.726 1.845-.414.164-.717-.37.067-.662.401-.589 2.388-3.036 1.44-1.882.93-1.086-.006-.158h-.055L4.132 18.56l-1.13.146-.487-.456.061-.746.231-.243 1.908-1.312-.006.006z" fill="#4F46E5" fill-rule="nonzero"></path></svg>
```

- [ ] **Step 2: Create openclaude-logo-done.svg and openclaude-logo-pending.svg**

Same SVG as above but:
- `openclaude-logo-done.svg`: fill color `#22C55E` (green)
- `openclaude-logo-pending.svg`: fill color `#F59E0B` (amber)

- [ ] **Step 3: Create placeholder openclaude-logo.png**

Run: `cp ~/.vscode/extensions/anthropic.claude-code-2.1.85-darwin-arm64/resources/claude-logo.png /Users/harshagarwal/Documents/workspace/openclaude-vscode/resources/openclaude-logo.png`

(Placeholder — replace with proper OpenClaude logo later)

- [ ] **Step 4: Create walkthrough markdown files (rebranded from Claude Code)**

`resources/walkthrough/step1.md`:
```markdown
**OpenClaude helps you write, edit, and understand code right in VS Code.**

OpenClaude can read your files, make edits, run terminal commands, and help you navigate complex codebases using any LLM — GPT-4o, Gemini, DeepSeek, Ollama, and 200+ models.

Prefer a terminal experience? Run **OpenClaude: Open in Terminal** from the Command Palette, or enable it permanently in Settings.
```

`resources/walkthrough/step2.md`:
```markdown
**Click the OpenClaude icon in the sidebar or editor toolbar.**

You can also use the keyboard shortcut **Ctrl+Escape** (Windows/Linux) or **Cmd+Escape** (Mac) to quickly open or focus OpenClaude.
```

`resources/walkthrough/step3.md`:
```markdown
**Ask questions, request changes, or get help understanding your code.**

Type your message in the input field and press Enter. OpenClaude can help you:

- Explain what code does
- Fix bugs and errors
- Write new features
- Refactor existing code
- Run terminal commands

Use **@** to mention specific files or folders for context. You can also highlight text in your editor and ask about your selection.
```

`resources/walkthrough/step4.md`:
```markdown
**Access your chat history and start new conversations anytime.**

Your conversations are saved automatically. Click the **Past Conversations** button at the top or type **/resume** to browse past sessions and pick up where you left off.

To start a fresh conversation, click the **New Chat** button. You can also enable the **Ctrl+N** / **Cmd+N** shortcut in settings (`openclaudeCode.enableNewConversationShortcut`).
```

- [ ] **Step 5: Commit**

```bash
git add resources/
git commit -m "feat: add rebranded icons and walkthrough content"
```

---

## Task 6: Webview Scaffold (Vite + React + Tailwind)

**Files:**
- Create: `webview/package.json`
- Create: `webview/tsconfig.json`
- Create: `webview/vite.config.ts`
- Create: `webview/tailwind.config.ts`
- Create: `webview/postcss.config.js`
- Create: `webview/index.html`
- Create: `webview/src/main.tsx`
- Create: `webview/src/App.tsx`
- Create: `webview/src/vscode.ts`
- Create: `webview/src/styles/index.css`

- [ ] **Step 1: Create webview/package.json**

```json
{
  "name": "openclaude-webview",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^18.3.0",
    "react-dom": "^18.3.0"
  },
  "devDependencies": {
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.0",
    "autoprefixer": "^10.4.0",
    "postcss": "^8.4.0",
    "tailwindcss": "^3.4.0",
    "typescript": "^5.5.0",
    "vite": "^5.4.0"
  }
}
```

- [ ] **Step 2: Create webview/tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "noEmit": true
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create webview/vite.config.ts**

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: resolve(__dirname, '..', 'dist', 'webview'),
    rollupOptions: {
      input: resolve(__dirname, 'index.html'),
      output: {
        entryFileNames: 'index.js',
        assetFileNames: 'index.[ext]',
      },
    },
    emptyOutDir: true,
  },
});
```

- [ ] **Step 4: Create webview/tailwind.config.ts**

```typescript
import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // VS Code theme-aware colors via CSS custom properties
        'vscode-bg': 'var(--vscode-editor-background)',
        'vscode-fg': 'var(--vscode-editor-foreground)',
        'vscode-input-bg': 'var(--vscode-input-background)',
        'vscode-input-fg': 'var(--vscode-input-foreground)',
        'vscode-input-border': 'var(--vscode-input-border)',
        'vscode-button-bg': 'var(--vscode-button-background)',
        'vscode-button-fg': 'var(--vscode-button-foreground)',
        'vscode-button-hover': 'var(--vscode-button-hoverBackground)',
        'vscode-border': 'var(--vscode-panel-border)',
        'vscode-link': 'var(--vscode-textLink-foreground)',
        'vscode-badge-bg': 'var(--vscode-badge-background)',
        'vscode-badge-fg': 'var(--vscode-badge-foreground)',
      },
      fontFamily: {
        mono: 'var(--vscode-editor-font-family)',
      },
      fontSize: {
        'vscode': 'var(--vscode-editor-font-size)',
      },
    },
  },
  plugins: [],
} satisfies Config;
```

- [ ] **Step 5: Create webview/postcss.config.js**

```javascript
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

- [ ] **Step 6: Create webview/index.html**

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>OpenClaude</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 7: Create webview/src/styles/index.css**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

body {
  margin: 0;
  padding: 0;
  background-color: var(--vscode-editor-background);
  color: var(--vscode-editor-foreground);
  font-family: var(--vscode-font-family);
  font-size: var(--vscode-font-size);
}
```

- [ ] **Step 8: Create webview/src/vscode.ts**

```typescript
import type { WebviewApi } from 'vscode-webview';

class VSCodeAPIWrapper {
  private readonly vsCodeApi: WebviewApi<unknown> | undefined;

  constructor() {
    if (typeof acquireVsCodeApi === 'function') {
      this.vsCodeApi = acquireVsCodeApi();
    }
  }

  public postMessage(message: unknown): void {
    if (this.vsCodeApi) {
      this.vsCodeApi.postMessage(message);
    } else {
      console.log('VS Code API not available, message:', message);
    }
  }

  public getState(): unknown {
    return this.vsCodeApi?.getState();
  }

  public setState<T extends unknown>(state: T): T {
    if (this.vsCodeApi) {
      return this.vsCodeApi.setState(state);
    }
    return state;
  }
}

export const vscode = new VSCodeAPIWrapper();
```

- [ ] **Step 9: Create webview/src/main.tsx**

```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
```

- [ ] **Step 10: Create webview/src/App.tsx**

```tsx
import { vscode } from './vscode';

function App() {
  return (
    <div className="flex flex-col h-screen bg-vscode-bg text-vscode-fg">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-vscode-border">
        <h1 className="text-sm font-semibold">OpenClaude</h1>
        <span className="text-xs opacity-50">v0.1.0</span>
      </div>

      {/* Message area (placeholder) */}
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center opacity-50">
          <p className="text-lg font-semibold mb-2">OpenClaude</p>
          <p className="text-sm">AI coding assistant powered by any LLM</p>
          <p className="text-xs mt-4">Extension shell ready. Chat UI coming in Story 4.</p>
        </div>
      </div>

      {/* Input area (placeholder) */}
      <div className="px-4 py-3 border-t border-vscode-border">
        <div className="flex items-center rounded border border-vscode-input-border bg-vscode-input-bg px-3 py-2">
          <input
            type="text"
            placeholder="Type a message... (not connected yet)"
            className="flex-1 bg-transparent text-vscode-input-fg outline-none text-sm"
            disabled
          />
        </div>
      </div>
    </div>
  );
}

export default App;
```

- [ ] **Step 11: Install webview dependencies**

Run: `cd /Users/harshagarwal/Documents/workspace/openclaude-vscode/webview && npm install`

Expected: `added X packages`

- [ ] **Step 12: Build the webview**

Run: `cd /Users/harshagarwal/Documents/workspace/openclaude-vscode/webview && npx vite build`

Expected: Build succeeds, files in `../dist/webview/`

- [ ] **Step 13: Commit**

```bash
git add webview/
git commit -m "feat: scaffold webview with Vite + React + Tailwind"
```

---

## Task 7: WebviewViewProvider (Connect Extension Host to Webview)

**Files:**
- Create: `src/webview/webviewProvider.ts`
- Modify: `src/extension.ts`

- [ ] **Step 1: Create src/webview/webviewProvider.ts**

```typescript
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export class OpenClaudeWebviewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'openclaudeSidebarSecondary';

  constructor(private readonly extensionUri: vscode.Uri) {}

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ): void {
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview')],
    };

    webviewView.webview.html = this.getHtmlForWebview(webviewView.webview);
  }

  public createPanel(): vscode.WebviewPanel {
    const panel = vscode.window.createWebviewPanel(
      'openclaudePanel',
      'OpenClaude',
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview')],
      },
    );

    panel.webview.html = this.getHtmlForWebview(panel.webview);
    return panel;
  }

  private getHtmlForWebview(webview: vscode.Webview): string {
    const distPath = vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview');

    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(distPath, 'index.js'));
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(distPath, 'index.css'));

    const nonce = getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; img-src ${webview.cspSource} https: data:; font-src ${webview.cspSource};">
  <link href="${styleUri}" rel="stylesheet">
  <title>OpenClaude</title>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}

function getNonce(): string {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
```

- [ ] **Step 2: Update src/extension.ts to register the provider and wire up the open commands**

Replace the file with:

```typescript
import * as vscode from 'vscode';
import { OpenClaudeWebviewProvider } from './webview/webviewProvider';

export function activate(context: vscode.ExtensionContext) {
  console.log('OpenClaude VS Code extension activated');

  const provider = new OpenClaudeWebviewProvider(context.extensionUri);

  // Register sidebar webview provider (secondary sidebar)
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('openclaudeSidebarSecondary', provider),
  );

  // Register sidebar webview provider (primary sidebar — older VS Code)
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('openclaudeSidebar', provider),
  );

  // Open in New Tab
  context.subscriptions.push(
    vscode.commands.registerCommand('openclaude.editor.open', () => {
      provider.createPanel();
    }),
  );

  // Open (last location)
  context.subscriptions.push(
    vscode.commands.registerCommand('openclaude.editor.openLast', () => {
      provider.createPanel();
    }),
  );

  // Open in Primary Editor
  context.subscriptions.push(
    vscode.commands.registerCommand('openclaude.primaryEditor.open', () => {
      provider.createPanel();
    }),
  );

  // Register remaining commands as no-ops for now
  const noopCommands = [
    'openclaude.window.open',
    'openclaude.sidebar.open',
    'openclaude.terminal.open',
    'openclaude.terminal.open.keyboard',
    'openclaude.createWorktree',
    'openclaude.newConversation',
    'openclaude.focus',
    'openclaude.blur',
    'openclaude.insertAtMention',
    'openclaude.acceptProposedDiff',
    'openclaude.rejectProposedDiff',
    'openclaude.showLogs',
    'openclaude.openWalkthrough',
    'openclaude.update',
    'openclaude.installPlugin',
    'openclaude.logout',
  ];

  for (const id of noopCommands) {
    context.subscriptions.push(
      vscode.commands.registerCommand(id, () => {
        vscode.window.showInformationMessage('OpenClaude: Coming soon!');
      }),
    );
  }
}

export function deactivate() {
  console.log('OpenClaude VS Code extension deactivated');
}
```

- [ ] **Step 3: Build everything**

Run: `cd /Users/harshagarwal/Documents/workspace/openclaude-vscode && npm run build`

Expected: Both extension and webview build successfully

- [ ] **Step 4: Commit**

```bash
git add src/webview/webviewProvider.ts src/extension.ts
git commit -m "feat: add WebviewViewProvider for sidebar and editor tab panels"
```

---

## Task 8: Fork Settings Schema

**Files:**
- Create: `openclaude-settings.schema.json`

- [ ] **Step 1: Copy and rebrand the settings schema**

Run: `cp ~/.vscode/extensions/anthropic.claude-code-2.1.85-darwin-arm64/claude-code-settings.schema.json /Users/harshagarwal/Documents/workspace/openclaude-vscode/openclaude-settings.schema.json`

Then search-and-replace:
- `"claude-code-settings.json"` → `"openclaude-settings.json"`
- `"Claude Code"` → `"OpenClaude"` (in description strings)

Keep all 70+ properties identical — the OpenClaude CLI reads the same `.claude/settings.json` files.

- [ ] **Step 2: Verify it's valid JSON**

Run: `node -e "JSON.parse(require('fs').readFileSync('openclaude-settings.schema.json','utf8')); console.log('Valid')"`

Expected: `Valid`

- [ ] **Step 3: Commit**

```bash
git add openclaude-settings.schema.json
git commit -m "feat: fork settings schema from Claude Code (70+ properties)"
```

---

## Task 9: End-to-End Verification

- [ ] **Step 1: Full build**

Run: `cd /Users/harshagarwal/Documents/workspace/openclaude-vscode && npm run build`

Expected: Build completes with no errors

- [ ] **Step 2: Package as .vsix**

Run: `cd /Users/harshagarwal/Documents/workspace/openclaude-vscode && npx @vscode/vsce package --no-dependencies --allow-missing-repository`

Expected: Produces `openclaude-vscode-0.1.0.vsix`

- [ ] **Step 3: Test in VS Code (manual)**

Install the extension: `code --install-extension openclaude-vscode-0.1.0.vsix`

Verify:
- Extension appears in sidebar (secondary sidebar) with OpenClaude icon
- Cmd+Shift+P → "OpenClaude: Open in New Tab" → opens webview panel
- Webview shows "OpenClaude" placeholder text with styled layout
- Cmd+Escape → shows "Coming soon!" (focus command)
- Settings: `openclaudeCode.selectedModel` appears in VS Code settings

- [ ] **Step 4: Push to GitHub**

Run: `cd /Users/harshagarwal/Documents/workspace/openclaude-vscode && git push`

- [ ] **Step 5: Commit final verification**

```bash
git add -A
git commit -m "chore: Story 1 complete — extension shell with all commands, webview, settings"
```

---

## Summary

| Task | What it does | Key files |
|---|---|---|
| 1 | Fork + rebrand package.json | `package.json` |
| 2 | TypeScript + esbuild + lint config | `tsconfig.json`, `esbuild.config.mjs`, `.eslintrc.json` |
| 3 | Extension entry point with 22 commands | `src/extension.ts` |
| 4 | VS Code debug configuration | `.vscode/launch.json`, `.vscode/tasks.json` |
| 5 | Icons + walkthrough content (rebranded) | `resources/` |
| 6 | Webview scaffold (Vite + React + Tailwind) | `webview/` |
| 7 | WebviewViewProvider (sidebar + editor tabs) | `src/webview/webviewProvider.ts` |
| 8 | Fork settings schema (70+ properties) | `openclaude-settings.schema.json` |
| 9 | End-to-end build + package + test | `.vsix` output |
