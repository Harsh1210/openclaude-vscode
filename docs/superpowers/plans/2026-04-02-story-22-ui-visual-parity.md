# Story 22: UI Visual Parity with Claude Code — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make OpenClaude's webview UI pixel-for-pixel identical to the Claude Code VS Code extension. This story replaces all placeholder Tailwind classes with the exact CSS variables, spacing values, border radii, animations, and component structures extracted directly from `~/.vscode/extensions/anthropic.claude-code-2.1.90-darwin-arm64/webview/index.css` and `extension.js`.

**Reference files (extract from these):**
- CSS: `~/.vscode/extensions/anthropic.claude-code-2.1.90-darwin-arm64/webview/index.css` (371KB)
- Webview JS: `~/.vscode/extensions/anthropic.claude-code-2.1.90-darwin-arm64/webview/index.js` (4.7MB)
- Extension JS: `~/.vscode/extensions/anthropic.claude-code-2.1.90-darwin-arm64/extension.js` (1.8MB)

**Depends on:** Stories 1–21

---

## Task 1: Replace CSS Variables — Exact Token System

**Files:**
- Rewrite: `webview/src/styles/index.css`

Claude Code defines ALL design tokens as CSS custom properties on `html`. Replace our current ad-hoc Tailwind classes with these exact tokens.

- [ ] **Step 1: Add the exact CSS variable definitions to index.css**

```css
html {
  /* Brand colors */
  --app-claude-orange: #d97757;
  --app-claude-clay-button-orange: #c6613f;
  --app-claude-ivory: #faf9f5;
  --app-claude-slate: #141413;

  /* Spacing */
  --app-spacing-small: 4px;
  --app-spacing-medium: 8px;
  --app-spacing-large: 12px;
  --app-spacing-xlarge: 16px;

  /* Border radius */
  --corner-radius-small: 4px;
  --corner-radius-medium: 6px;
  --corner-radius-large: 8px;

  /* Typography */
  --app-monospace-font-family: var(--vscode-editor-font-family, monospace);
  --app-monospace-font-size: var(--vscode-editor-font-size, 12px);
  --app-monospace-font-size-small: calc(var(--vscode-editor-font-size, 12px) - 2px);

  /* Foreground/background */
  --app-primary-foreground: var(--vscode-foreground);
  --app-primary-background: var(--vscode-sideBar-background);
  --app-primary-border-color: var(--vscode-sideBarActivityBarTop-border);
  --app-secondary-foreground: var(--vscode-descriptionForeground);
  --app-secondary-background: var(--vscode-editor-background);

  /* Input */
  --app-input-foreground: var(--vscode-input-foreground);
  --app-input-background: var(--vscode-input-background);
  --app-input-border: var(--vscode-inlineChatInput-border);
  --app-input-active-border: var(--vscode-inputOption-activeBorder);
  --app-input-placeholder-foreground: var(--vscode-input-placeholderForeground);
  --app-input-secondary-foreground: var(--vscode-input-foreground);
  --app-input-secondary-background: var(--vscode-menu-background);

  /* Tool/code */
  --app-tool-background: var(--vscode-editor-background);

  /* List */
  --app-list-padding: 0px;
  --app-list-item-padding: 4px 8px;
  --app-list-border-color: transparent;
  --app-list-border-radius: 4px;
  --app-list-hover-background: var(--vscode-list-hoverBackground);
  --app-list-active-background: var(--vscode-list-activeSelectionBackground);
  --app-list-active-foreground: var(--vscode-list-activeSelectionForeground);
  --app-list-gap: 2px;

  /* Menu */
  --app-menu-background: var(--vscode-menu-background);
  --app-menu-border: var(--vscode-menu-border);
  --app-menu-foreground: var(--vscode-menu-foreground);
  --app-menu-selection-background: var(--vscode-menu-selectionBackground);
  --app-menu-selection-foreground: var(--vscode-menu-selectionForeground);

  /* Status */
  --app-warning-foreground: var(--vscode-menu-foreground);
  --app-warning-background: var(--vscode-input-background);
  --app-warning-accent: #e5a54b;
  --app-error-foreground: var(--vscode-errorForeground);
  --app-success-foreground: var(--vscode-gitDecoration-addedResourceForeground);
  --app-disabled-foreground: var(--vscode-disabledForeground);
  --app-status-busy: var(--vscode-charts-green, #22c55e);
  --app-status-pending: var(--vscode-charts-blue, #3b82f6);

  /* Badges */
  --app-badge-foreground: var(--vscode-badge-foreground);
  --app-badge-background: var(--vscode-badge-background);

  /* Header */
  --app-header-background: var(--vscode-sideBar-background);

  /* Splitter */
  --app-splitter-background: var(--vscode-inlineChatInput-border);
  --app-splitter-hover-background: var(--vscode-sash-hoverBorder);

  /* Progress */
  --app-progressbar-background: var(--vscode-progressBar-background);
  --app-progressbar-border: var(--vscode-widget-border);

  /* Widget */
  --app-widget-border: var(--vscode-editorWidget-border);
  --app-editor-highlight-background: var(--vscode-editor-lineHighlightBackground);

  /* Buttons */
  --app-ghost-button-hover-background: var(--vscode-toolbar-hoverBackground);
  --app-button-foreground: var(--vscode-button-foreground);
  --app-button-background: var(--vscode-button-background);
  --app-button-hover-background: var(--vscode-button-hoverBackground);

  /* Accent */
  --app-accent-color: var(--vscode-inputOption-activeBorder);
  --app-transparent-inner-border: #ffffff1a;

  /* Spinner */
  --app-spinner-foreground: var(--app-claude-orange);

  /* Modal */
  --app-modal-background: #000000bf;

  /* Diff */
  --app-diff-addition-foreground: var(--vscode-gitDecoration-addedResourceForeground);
  --app-diff-deletion-foreground: var(--vscode-gitDecoration-deletedResourceForeground);

  /* Mention chips */
  --app-mention-chip-background: var(--vscode-chat-slashCommandBackground, var(--vscode-badge-background, #26477866));
  --app-mention-chip-foreground: var(--vscode-chat-slashCommandForeground, var(--vscode-badge-foreground, #85b6ff));

  /* Banner */
  --app-banner-tint: #4a63af;
}

/* Light theme overrides */
.vscode-light {
  --app-transparent-inner-border: #00000012;
  --app-spinner-foreground: var(--app-claude-clay-button-orange);
}

/* Root layout */
html {
  display: flex;
  overscroll-behavior: none;
  position: relative;
  flex: 1;
  height: 100%;
}

body {
  display: flex;
  overscroll-behavior: none;
  font-size: var(--vscode-chat-font-size, 13px);
  font-family: var(--vscode-chat-font-family);
  flex: 1;
  max-width: 100%;
  margin: 0;
  padding: 0;
}

#root {
  display: flex;
  flex: 1;
  max-width: 100%;
}

/* Hide scrollbars (Claude Code uses custom scrollbars) */
::-webkit-scrollbar {
  display: none;
}

* {
  scrollbar-width: none;
}

/* Textarea focus */
textarea:focus {
  outline-width: 1px;
  outline-style: solid;
  outline-offset: -1px;
  outline-color: var(--vscode-focusBorder);
  opacity: 1;
}

textarea.input {
  display: block;
  scrollbar-width: none;
  outline: none;
}

/* Button reset */
button {
  color: var(--app-primary-foreground);
}
```

- [ ] **Step 2: Add animation keyframes**

```css
/* Message fade-in */
@keyframes fadeIn {
  0% { opacity: 0; transform: scale(0.95); }
  to { opacity: 1; transform: scale(1); }
}

/* Mic recording pulse */
@keyframes pulse {
  0% { opacity: 1; }
  50% { opacity: 0.7; }
  to { opacity: 1; }
}

/* Selection confirm flash */
@keyframes selectionConfirm {
  0% { background-color: var(--app-input-secondary-background); }
  50% { background-color: var(--app-button-background); opacity: 0.3; }
  to { background-color: var(--app-input-secondary-background); }
}
```

- [ ] **Step 3: Commit**

```bash
git add webview/src/styles/index.css
git commit -m "feat(ui): replace CSS with exact Claude Code design tokens"
```

---

## Task 2: Chat Container & Message List Layout

**Files:**
- Rewrite: `webview/src/components/chat/ChatPanel.tsx`
- Rewrite: `webview/src/components/chat/MessageList.tsx`

Exact structure from Claude Code's `.chatContainer_07S1Yg` and `.message_07S1Yg`:

- [ ] **Step 1: Rewrite ChatPanel with exact layout**

```tsx
// Exact structure from Claude Code:
// .chatContainer_07S1Yg { display:flex; overflow:hidden; position:relative; flex-direction:column; flex:1; line-height:1.5 }

<div style={{ display:'flex', overflow:'hidden', position:'relative', flexDirection:'column', flex:1, lineHeight:1.5 }}>
  {/* Header */}
  <ChatHeader ... />
  
  {/* Message list — flex:1, overflow-y:auto */}
  <MessageList ... />
  
  {/* Input area */}
  <InputArea ... />
</div>
```

- [ ] **Step 2: Rewrite MessageList with exact message spacing**

From Claude Code's `.message_07S1Yg`:
```css
/* Each message row */
.message {
  display: flex;
  align-items: flex-start;
  gap: 0;
  padding: 8px 0;  /* --app-spacing-medium top/bottom */
}
.message:first-child { padding-top: 0; }
```

User message container (`.userMessageContainer_07S1Yg`):
```css
.userMessageContainer {
  display: inline-block;
  position: relative;
  margin: 4px 0;  /* --app-spacing-small */
}
```

User message bubble (`.userMessage_07S1Yg`):
```css
.userMessage {
  white-space: pre-wrap;
  word-break: break-word;
  border: 1px solid var(--app-input-border);
  border-radius: var(--corner-radius-medium);  /* 6px */
  background-color: var(--app-input-background);
  display: inline-block;
  overflow-x: hidden;
  overflow-y: hidden;
  user-select: text;
  max-width: 100%;
  padding: 4px 6px;
}
```

- [ ] **Step 3: Commit**

```bash
git add webview/src/components/chat/ChatPanel.tsx webview/src/components/chat/MessageList.tsx
git commit -m "feat(ui): exact Claude Code chat container and message list layout"
```

---

## Task 3: Input Container — Exact Styles

**Files:**
- Rewrite: `webview/src/components/chat/ChatPanel.tsx` (InputPlaceholder → real input)

Exact styles from `.inputContainer_cKsPxg` and `.inputWrapper_cKsPxg`:

- [ ] **Step 1: Implement exact input container**

```tsx
// inputWrapper: width:100%; max-width:680px; margin:0 auto
// inputContainer: background:var(--app-input-secondary-background); border:1px solid var(--app-input-border); border-radius:var(--corner-radius-large) [8px]; display:flex; flex-direction:column; box-shadow:0 1px 2px #0000001a

// Focus ring (Claude Code's orange focus ring):
// :focus-within { --focus-ring-color: var(--app-claude-orange); border-color: var(--focus-ring-color); box-shadow: 0 0 0 3px color-mix(in srgb, var(--focus-ring-color) 12%, transparent), 0 1px 2px color-mix(in srgb, var(--focus-ring-color), transparent 80%) }

// Permission mode focus ring overrides:
// [data-permission-mode=acceptEdits]:focus-within { --focus-ring-color: var(--app-primary-foreground) }
// [data-permission-mode=plan]:focus-within { --focus-ring-color: var(--vscode-focusBorder, var(--app-button-background)) }
// [data-permission-mode=bypassPermissions]:focus-within, [data-permission-mode=auto]:focus-within { --focus-ring-color: var(--app-error-foreground) }
```

Textarea (`.input_q4zSJA`):
```css
.input {
  overflow-y: auto;
  white-space: pre-wrap;
  word-wrap: break-word;
  outline: none;
  max-height: 120px;
  line-height: 1.4;
}
```

Send/menu buttons (`.sendButton_gGYT1w`):
```css
.sendButton, .menuButton {
  cursor: pointer;
  display: flex;
  color: var(--app-secondary-foreground);
  background-color: transparent;
  border: none;
  justify-content: center;
  align-items: center;
  width: 26px;
  height: 26px;
}
.sendButton { border-radius: 5px; }
```

- [ ] **Step 2: Commit**

```bash
git add webview/src/components/chat/ChatPanel.tsx
git commit -m "feat(ui): exact Claude Code input container with orange focus ring"
```

---

## Task 4: Thinking Block — Exact Styles

**Files:**
- Rewrite: `webview/src/components/blocks/ThinkingBlockRenderer.tsx`

Exact styles from `.thinking_aHyQPQ`, `.thinkingSummary_aHyQPQ`, `.thinkingContent_aHyQPQ`:

- [ ] **Step 1: Implement exact thinking block**

```tsx
// Uses HTML <details>/<summary> elements (not a custom toggle)
// .thinking: width:fit-content; margin-top:4px; margin-bottom:12px
// .thinkingSummary: cursor:pointer; color:var(--app-secondary-foreground); opacity:0.8; user-select:none; list-style:none; vertical-align:middle; justify-content:space-between; font-style:italic
// .thinkingSummary::-webkit-details-marker { display:none }
// .thinking[open] .thinkingSummary, .thinkingSummary:hover { opacity:1 }
// .thinkingToggle: width:12px; height:12px; margin-left:4px
// .thinkingContent: color:var(--app-secondary-foreground); margin-top:4px; font-weight:400

// V2 variant (newer):
// .thinkingV2 .thinkingSummary: display:inline-flex; align-items:center; gap:4px; font-style:normal
// .thinkingV2 .thinkingToggle: width:16px; height:16px; margin-left:0; transition:transform 0.15s
// .thinkingToggleOpen: transform:rotate(90deg)

return (
  <details style={{ width:'fit-content', marginTop:4, marginBottom:12 }}>
    <summary style={{
      cursor:'pointer',
      color:'var(--app-secondary-foreground)',
      opacity: 0.8,
      userSelect:'none',
      listStyle:'none',
      display:'inline-flex',
      alignItems:'center',
      gap:4,
      fontStyle:'normal',
    }}>
      <svg style={{ width:16, height:16, transition:'transform 0.15s', transform: isOpen ? 'rotate(90deg)' : 'none' }} ... />
      {block.summary ?? 'Thinking...'}
    </summary>
    <div style={{ color:'var(--app-secondary-foreground)', marginTop:4, fontWeight:400 }}>
      {block.thinking}
    </div>
  </details>
);
```

- [ ] **Step 2: Commit**

```bash
git add webview/src/components/blocks/ThinkingBlockRenderer.tsx
git commit -m "feat(ui): exact Claude Code thinking block with details/summary"
```

---

## Task 5: Tool Use Block — Exact Styles

**Files:**
- Rewrite: `webview/src/components/chat/ToolCallBlock.tsx`

Exact styles from `.toolSummary_ZUQaOA`, `.toolNameText_ZUQaOA`:

- [ ] **Step 1: Implement exact tool use block**

```css
/* From Claude Code */
.root_ZUQaOA { position: relative; }
.toolSummary_ZUQaOA {
  list-style: none;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  overflow: hidden;
  -webkit-box-orient: vertical;
  max-width: 100%;
}
```

Tool result:
```css
.toolResult_uq5aLg {
  background-color: var(--app-code-background);
  white-space: pre;
  overflow-x: auto;
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  max-width: 100%;
}
```

- [ ] **Step 2: Commit**

```bash
git add webview/src/components/chat/ToolCallBlock.tsx
git commit -m "feat(ui): exact Claude Code tool use block styles"
```

---

## Task 6: Code Block — Exact Styles

**Files:**
- Rewrite: `webview/src/components/shared/CodeBlock.tsx`

Exact styles from `.codeBlockWrapper_-a7MRw`:

- [ ] **Step 1: Implement exact code block**

```css
/* From Claude Code */
.root {
  text-wrap: auto;
  overflow-x: hidden;
  width: 100%;
}
.root p {
  white-space: pre-wrap;
  margin-top: 0.1em;
  margin-bottom: 0.2em;
}
.codeBlockWrapper {
  position: relative;
  margin: 8px 0;
}
.codeBlockWrapper pre {
  overflow-x: auto;
  white-space: pre;
  box-sizing: border-box;
  border-radius: 4px;  /* --corner-radius-small */
  max-width: 100%;
  margin: 0;
  padding: 8px;
}
```

- [ ] **Step 2: Commit**

```bash
git add webview/src/components/shared/CodeBlock.tsx
git commit -m "feat(ui): exact Claude Code code block styles"
```

---

## Task 7: Mention Chip — Exact Styles

**Files:**
- Create: `webview/src/components/shared/MentionChip.tsx`

Exact styles from `.mentionChip_uq5aLg`:

- [ ] **Step 1: Implement mention chip**

```css
.mentionChip {
  display: inline;
  background-color: var(--app-mention-chip-background);
  color: var(--app-mention-chip-foreground);
  -webkit-box-decoration-break: clone;
  box-decoration-break: clone;
  border-radius: 3px;
  padding: 1px 4px;
}
.mentionChip[role=button] { cursor: pointer; }
.mentionChip[role=button]:hover { filter: brightness(1.15); }
```

- [ ] **Step 2: Commit**

```bash
git add webview/src/components/shared/MentionChip.tsx
git commit -m "feat(ui): exact Claude Code mention chip styles"
```

---

## Task 8: Attachment Pill — Exact Styles

**Files:**
- Create: `webview/src/components/shared/AttachmentPill.tsx`

Exact styles from `.pill_lcdCYQ`:

- [ ] **Step 1: Implement attachment pill**

```css
.pill {
  --pill-radius: 4px;
  --pill-padding: 4px;
  --pill-bg: color-mix(in srgb, var(--app-input-background) 85%, var(--app-secondary-foreground));
  display: inline-flex;
  padding: var(--pill-padding) 6px var(--pill-padding) var(--pill-padding);
  box-sizing: border-box;
  background: var(--pill-bg);
  border: 1px solid var(--app-input-border);
  border-radius: var(--pill-radius);
  cursor: pointer;
  position: relative;
  overflow: hidden;
  align-items: center;
  gap: 4px;
  min-width: 0;
  max-width: 180px;
  height: 24px;
  transition: border-color 0.15s;
}
.pill:hover { border-color: color-mix(in srgb, var(--app-input-border) 60%, var(--app-primary-foreground)); }
.pill .icon { color: var(--app-secondary-foreground); flex-shrink: 0; width: 12px; height: 12px; }
.pill .label { color: var(--app-primary-foreground); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; font-size: 11px; font-weight: 500; }
.pill .meta { color: var(--app-secondary-foreground); opacity: 0.6; white-space: nowrap; flex-shrink: 0; font-size: 11px; }
```

- [ ] **Step 2: Commit**

```bash
git add webview/src/components/shared/AttachmentPill.tsx
git commit -m "feat(ui): exact Claude Code attachment pill styles"
```

---

## Task 9: Update Tailwind Config with Real Tokens

**Files:**
- Rewrite: `webview/tailwind.config.ts`

- [ ] **Step 1: Update Tailwind config to use the real CSS variables**

```typescript
export default {
  content: ['./src/**/*.{ts,tsx}', './index.html'],
  theme: {
    extend: {
      colors: {
        // Map Tailwind classes to Claude Code CSS variables
        'app-primary': 'var(--app-primary-foreground)',
        'app-secondary': 'var(--app-secondary-foreground)',
        'app-bg': 'var(--app-primary-background)',
        'app-bg-secondary': 'var(--app-secondary-background)',
        'app-input-bg': 'var(--app-input-background)',
        'app-input-border': 'var(--app-input-border)',
        'app-orange': 'var(--app-claude-orange)',
        'app-error': 'var(--app-error-foreground)',
        'app-success': 'var(--app-success-foreground)',
        'app-warning-accent': '#e5a54b',
        'app-status-busy': 'var(--app-status-busy)',
        'app-status-pending': 'var(--app-status-pending)',
      },
      spacing: {
        'sm': 'var(--app-spacing-small)',    // 4px
        'md': 'var(--app-spacing-medium)',   // 8px
        'lg': 'var(--app-spacing-large)',    // 12px
        'xl': 'var(--app-spacing-xlarge)',   // 16px
      },
      borderRadius: {
        'sm': 'var(--corner-radius-small)',   // 4px
        'md': 'var(--corner-radius-medium)',  // 6px
        'lg': 'var(--corner-radius-large)',   // 8px
      },
      fontFamily: {
        'mono': 'var(--app-monospace-font-family)',
      },
      fontSize: {
        'mono': 'var(--app-monospace-font-size)',
        'mono-sm': 'var(--app-monospace-font-size-small)',
        'chat': 'var(--vscode-chat-font-size, 13px)',
      },
      maxWidth: {
        'input': '680px',  // inputWrapper_cKsPxg max-width
      },
    },
  },
  plugins: [],
};
```

- [ ] **Step 2: Commit**

```bash
git add webview/tailwind.config.ts
git commit -m "feat(ui): update Tailwind config with exact Claude Code design tokens"
```

---

## Task 10: Full Build & Visual Comparison

- [ ] **Step 1: Build**

Run: `npm run build`

- [ ] **Step 2: Package and install**

Run: `npx @vscode/vsce package --no-dependencies --allow-missing-repository`
Run: `"/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code" --install-extension openclaude-vscode-0.1.0.vsix --force`

- [ ] **Step 3: Side-by-side visual comparison checklist**

Open both Claude Code and OpenClaude side by side and verify:
- [ ] Font size matches (13px base, 12px monospace)
- [ ] User message bubble: 1px border, 6px radius, input-background fill, 4px/6px padding
- [ ] Input container: 8px border-radius, orange focus ring, 1px border
- [ ] Thinking block: uses `<details>/<summary>`, italic summary, 0.8 opacity, rotates 90deg on open
- [ ] Tool use block: 2-line clamp on summary
- [ ] Code block: 4px radius, 8px padding, pre-wrap
- [ ] Mention chips: 3px radius, 1px/4px padding, badge colors
- [ ] Attachment pills: 24px height, 180px max-width, 4px radius
- [ ] Scrollbars: hidden (display:none)
- [ ] Message spacing: 8px padding top/bottom per message
- [ ] No visible scrollbars anywhere

- [ ] **Step 4: Commit**

```bash
git add .
git commit -m "feat(story-22): UI visual parity with Claude Code complete"
```
