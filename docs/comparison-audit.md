# Claude Code vs OpenClaude CSS/Component Comparison Audit

Date: 2026-04-03
Source: Claude Code extension v2.1.85

## A. CSS Variables and Design Tokens

**Status: MATCH** -- Our index.css has all the same CSS custom properties as Claude Code.

Both define identical variables:
- Brand: `--app-claude-orange`, `--app-claude-clay-button-orange`, `--app-claude-ivory`, `--app-claude-slate`
- Spacing: `--app-spacing-small/medium/large/xlarge`
- Corner radius: `--corner-radius-small/medium/large`
- Typography: `--app-monospace-font-family/size/size-small`
- All foreground/background/input/tool/list/menu/warning/badge/header/splitter/progress/widget/button/accent/spinner/modal/diff/mention tokens

**One difference**: Claude Code sets `--app-root-background` inside `.root_aqhumA` (not on `html`). Our CSS sets it on `html`. This is fine since our App structure wraps in a single root div.

## B. Send/Stop Button

### Claude Code has (CSS):
```css
/* Base shared between send+menu buttons */
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
.sendButton {
  border-radius: 5px;
}

/* Override: send button always has color+bg */
.sendButton {
  color: var(--app-claude-ivory);
  background-color: var(--app-claude-clay-button-orange);
}

/* Permission mode variants */
.sendButton[data-permission-mode=acceptEdits] {
  color: var(--app-primary-background);
  background-color: var(--app-primary-foreground);
}
.sendButton[data-permission-mode=plan] {
  color: var(--app-button-foreground);
  background-color: var(--vscode-focusBorder, var(--app-button-background));
}
.sendButton[data-permission-mode=bypassPermissions],
.sendButton[data-permission-mode=auto] {
  color: var(--app-button-foreground);
  background-color: var(--app-error-foreground);
}

/* Hover/active */
.sendButton:hover:not(:disabled) { filter: brightness(1.1); }
.sendButton:active:not(:disabled) { filter: brightness(.9); }
.sendButton:disabled { cursor: not-allowed; opacity: .4; }

/* Send icon inside button */
.sendIcon {
  color: var(--app-claude-ivory);
  display: block;
  flex-shrink: 0;
  width: 20px;
  height: 20px;
  transform: none;
}
/* Permission mode icon variants */
.sendButton[data-permission-mode=acceptEdits] .sendIcon { color: var(--app-tool-background); }
.sendButton[data-permission-mode=plan] .sendIcon,
.sendButton[data-permission-mode=bypassPermissions] .sendIcon,
.sendButton[data-permission-mode=auto] .sendIcon { color: var(--app-button-foreground); }

/* Stop icon */
.stopIcon {
  color: var(--app-claude-ivory);
  display: block;
  width: 16px;
  height: 16px;
}
/* Permission mode stop icon variants */
.sendButton[data-permission-mode=acceptEdits] .stopIcon { color: var(--app-tool-background); }
.sendButton[data-permission-mode=plan] .stopIcon,
.sendButton[data-permission-mode=bypassPermissions] .stopIcon,
.sendButton[data-permission-mode=auto] .stopIcon { color: var(--app-button-foreground); }
```

### What we have (inline styles in ChatPanel.tsx):
- Send button uses inline styles with conditional logic for streaming vs not
- **BUG**: During streaming, we set `backgroundColor: 'transparent'` and `color: 'var(--app-secondary-foreground)'` -- but Claude Code keeps the send button colored even during streaming. The stop icon just changes inside the same colored button.
- **MISSING**: Permission mode variants for send button color are done via inline styles, not CSS classes
- **MISSING**: `:hover` brightness filter, `:active` brightness filter
- **MISSING**: `sendIcon` and `stopIcon` CSS classes with proper sizing

### Fixes needed:
1. Add `.sendButton` CSS class to index.css with all variants
2. Remove inline send button styles from ChatPanel.tsx, use CSS class
3. Add `.sendIcon` and `.stopIcon` CSS classes
4. The send button should ALWAYS have the orange bg -- stop state keeps the button colored, only the icon inside changes

## C. Input Container

### Claude Code has:
```css
.inputContainer {
  background: var(--app-input-secondary-background);
  border: 1px solid var(--app-input-border);
  border-radius: var(--corner-radius-large);
  color: var(--app-input-foreground);
  display: flex;
  position: relative;
  flex-direction: column;
  min-width: 0;
  margin: 0;
  padding: 0;
  box-shadow: 0 1px 2px #0000001a;
}
/* Focus ring */
.inputContainer:focus-within {
  --focus-ring-color: var(--app-claude-orange);
  border-color: var(--focus-ring-color);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--focus-ring-color) 12%, transparent),
              0 1px 2px color-mix(in srgb, var(--focus-ring-color), transparent 80%);
}
/* Permission mode focus variants */
.inputContainer[data-permission-mode=acceptEdits]:focus-within { --focus-ring-color: var(--app-primary-foreground); }
.inputContainer[data-permission-mode=plan]:focus-within { --focus-ring-color: var(--vscode-focusBorder, var(--app-button-background)); }
.inputContainer[data-permission-mode=bypassPermissions]:focus-within,
.inputContainer[data-permission-mode=auto]:focus-within { --focus-ring-color: var(--app-error-foreground); }

/* Input text area */
.messageInput {
  outline: none;
  overflow-y: auto;
  overflow-wrap: break-word;
  word-break: break-word;
  scrollbar-gutter: stable;
  position: relative;
  user-select: text;
  color: transparent;       /* text invisible, mirror shows it */
  caret-color: var(--app-input-foreground);
  z-index: 1;
  flex: 1;
  align-self: stretch;
  min-height: 1.5em;
  max-height: 200px;
  padding: 10px 14px;
  font-family: inherit;
  line-height: 1.5;
}

/* Input footer inside the container */
.inputFooter {
  display: flex;
  color: var(--app-secondary-foreground);
  border-top: .5px solid var(--app-input-border);
  z-index: 6;
  align-items: center;
  gap: 6px;
  min-width: 0;
  padding: 5px;
}
```

### What we have:
- `.input-container` class in CSS -- MATCHES Claude Code
- Focus ring with permission mode variants -- MATCHES
- Textarea has inline styles: `padding: 0`, `flex: 1`, `background: transparent`, etc.
- **DIFF**: Claude Code's textarea has `padding: 10px 14px` -- ours has `padding: 0` in the textarea itself, and the parent div has `padding: 8px 8px 4px 12px`
- **DIFF**: Claude Code uses `padding: 5px` for the footer bar. Ours uses `padding: 2px 8px 6px`
- **DIFF**: The toolbar border-top uses `1px solid var(--app-input-border)` -- Claude Code uses `.5px solid`

### Fixes needed:
1. Textarea padding: change from `padding: 0` to `padding: 10px 14px`
2. Remove the parent flex div's extra padding (or keep minimal)
3. Footer toolbar: change to `padding: 5px` and `border-top: .5px solid`
4. Gap in footer should be `6px` not `2px`

## D. Message Rendering

### Claude Code has:
```css
/* Chat container */
.chatContainer {
  display: flex;
  overflow: hidden;
  position: relative;
  flex-direction: column;
  flex: 1;
  line-height: 1.5;
}

/* Messages scrollable area */
.messagesContainer {
  overflow-y: auto;
  overflow-x: hidden;
  display: flex;
  background-color: var(--app-primary-background);
  position: relative;
  flex-direction: column;
  flex: 1;
  gap: 0;
  min-width: 0;
  padding: 20px 20px 40px;
}

/* Individual message */
.message {
  color: var(--app-primary-foreground);
  display: flex;
  position: relative;
  flex-direction: column;
  align-items: flex-start;
  gap: 0;
  padding: 8px 0;
}
.message:first-child { padding-top: 0; }

/* User message container */
.userMessageContainer {
  display: inline-block;
  position: relative;
  margin: 4px 0;
}

/* User message bubble */
.userMessage {
  white-space: pre-wrap;
  word-break: break-word;
  border: 1px solid var(--app-input-border);
  border-radius: var(--corner-radius-medium);
  background-color: var(--app-input-background);
  display: inline-block;
  overflow-x: hidden;
  overflow-y: hidden;
  user-select: text;
  max-width: 100%;
  padding: 4px 6px;
}
```

### What we have:
- MessageList.tsx: messages container uses Tailwind `py-4` (16px top+bottom) -- Claude Code uses `padding: 20px 20px 40px`
- **DIFF**: Our message container has no horizontal padding in the scroll area -- Claude Code has `20px` on sides
- **DIFF**: Our MessageList uses `absolute inset-0 overflow-y-auto` positioning -- this is fine as layout approach
- UserMessage uses `.user-message-bubble` class -- MATCHES Claude Code CSS
- **DIFF**: UserMessage wrapper has `padding: '0 16px'` inline -- this conflicts with the messages container padding model. Claude Code has the padding on the container, not per-message.
- AssistantMessage uses Tailwind `px-4 py-2` -- should match Claude Code's `padding: 8px 0` (NO horizontal padding since container provides it)

### Fixes needed:
1. Messages container: add `padding: 20px 20px 40px` 
2. Remove per-message horizontal padding (UserMessage `0 16px`, AssistantMessage `px-4`)
3. Keep vertical padding consistent: `py-2` (8px) matches Claude Code's `padding: 8px 0`

## E. Overall Layout

### Claude Code has:
```css
/* Root */
.root {
  display: flex;
  overflow: hidden;
  color: var(--app-primary-foreground);
  background-color: var(--app-primary-background);
  --app-root-background: var(--app-primary-background);
  user-select: none;
  flex-direction: column;
  flex: 1;
}

/* Header */
.header {
  display: flex;
  border-bottom: 1px solid var(--app-primary-border-color);
  background-color: var(--app-header-background);
  user-select: none;
  justify-content: flex-start;
  gap: 4px;
  padding: 6px;
}

/* Input container positioning (absolute, overlays messages) */
.inputContainer {
  position: absolute;
  display: flex;
  z-index: 20;
  flex-direction: column;
  bottom: 16px;
  left: 16px;
  right: 16px;
}
```

### What we have:
- Root div in ChatPanel has `height: '100vh'` -- should be `flex: 1` in the parent chain
- **KEY DIFF**: Claude Code's input container is ABSOLUTELY positioned over the messages area (bottom: 16px, left: 16px, right: 16px). Our input area is in the normal document flow with `flexShrink: 0` and a border-top.
- This means in Claude Code, messages scroll underneath the input, and there's a gradient overlay. In ours, the input is below the messages.
- **Our approach is actually fine** -- it's simpler and avoids z-index issues. The visual difference is minimal.

### Fixes needed:
1. Header: Use CSS variables for styling instead of Tailwind border classes
2. The flow-based input (not absolute) is acceptable -- keep it

## F. Missing CSS Classes

The following CSS classes exist in Claude Code but are NOT in our index.css:

1. `.sendButton` -- full class with permission mode variants
2. `.sendIcon` and `.stopIcon`
3. `.inputFooter` -- footer inside input container
4. `.footerButton` -- toolbar buttons inside input
5. `.messagesContainer` -- explicit class for messages scroll area  
6. `.message` -- explicit class for message rows
7. `.emptyState` -- empty state styling
8. `.errorBanner` and `.errorMessage` -- error banner exact styling
9. `.spinnerRow` -- spinner row during streaming
10. `.timelineMessage` -- tool use timeline dots/lines

## Summary of All Fixes

### index.css additions:
- Add `.sendButton` with all permission mode variants
- Add `.sendIcon`, `.stopIcon`  
- Add `.inputFooter`, `.footerButton` classes
- Add `.messagesContainer` class

### ChatPanel.tsx fixes:
- Remove inline send button styles, use CSS `.sendButton` class
- Fix textarea padding: `10px 14px`
- Fix toolbar padding and border
- Send button: keep colored bg even during streaming (only icon changes)

### MessageList.tsx fixes:
- Messages container: `padding: 20px 20px 40px`
- Remove individual message horizontal padding

### UserMessage.tsx fixes:
- Remove wrapper `padding: '0 16px'`

### AssistantMessage.tsx fixes:
- Change `px-4 py-2` to `py-2` (remove horizontal padding)
