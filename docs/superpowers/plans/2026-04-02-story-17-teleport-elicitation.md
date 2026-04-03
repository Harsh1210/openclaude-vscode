# Story 17: Teleport, Elicitation & Advanced Interactions — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the TeleportDialog for incoming session transfers, the ElicitationDialog for structured CLI questions, and message-level interaction controls (stop/cancel, retry, edit, copy). These are the "last mile" interaction patterns that complete the two-way communication between the user and the CLI.

**Architecture:** The extension host routes incoming `control_request` messages (subtype `elicitation`) and `system` messages (subtype related to teleport) to the webview via postMessage. The webview renders dialogs and sends responses back. Message actions (stop, retry, edit, copy) live as a hover toolbar on each message. Stop sends an `interrupt` control_request to the CLI. Retry re-sends the last user message. Edit replaces the input with the old message text. Copy uses the clipboard API.

**Tech Stack:** TypeScript 5.x, React 18, Tailwind CSS, VS Code Extension API, Vitest

**Spec:** [2026-04-02-openclaude-vscode-extension-design.md](../specs/2026-04-02-openclaude-vscode-extension-design.md) — Story 17, Sections 2.3.2, 2.3.3, 2.3.4, 3.4, 3.7, 4.8, 4.9

**Claude Code extension (reference):** `~/.vscode/extensions/anthropic.claude-code-2.1.85-darwin-arm64/`

**Depends on:** Story 4 (Chat UI), Story 2 (Process Manager — for interrupt signal)

---

## File Structure

| File | Responsibility |
|---|---|
| `webview/src/types/interactions.ts` | TypeScript types for teleport, elicitation, and message actions |
| `webview/src/components/dialogs/TeleportDialog.tsx` | Incoming session transfer confirmation UI |
| `webview/src/components/dialogs/ElicitationDialog.tsx` | Structured question rendering and response |
| `webview/src/components/chat/MessageActions.tsx` | Hover toolbar with stop, retry, copy, edit buttons |
| `webview/src/hooks/useChat.ts` | Extended with action state, editable messages, retry logic |
| `src/process/controlRouter.ts` | Route elicitation control_requests to webview |
| `test/unit/interactions.test.ts` | Unit tests for elicitation response building and message action logic |

---

## Task 1: Define Interaction Types

**Files:**
- Create: `webview/src/types/interactions.ts`

- [ ] **Step 1: Create TypeScript interfaces for teleport, elicitation, and message actions**

```typescript
// webview/src/types/interactions.ts

/** Teleport — incoming session transfer from another device */
export interface TeleportInfo {
  remoteSessionId: string;
  branch: string;
  messageCount: number;
  sourceDevice: string;
  timestamp: string;
}

export interface TeleportState {
  isVisible: boolean;
  info: TeleportInfo | null;
}

/** Elicitation — structured question from CLI */
export type ElicitationFieldType =
  | { type: 'text'; placeholder?: string }
  | { type: 'select'; options: ElicitationOption[] }
  | { type: 'multiselect'; options: ElicitationOption[] }
  | { type: 'confirm'; default?: boolean };

export interface ElicitationOption {
  value: string;
  label: string;
  description?: string;
}

export interface ElicitationRequest {
  requestId: string;
  message: string;
  fields: ElicitationField[];
}

export interface ElicitationField {
  name: string;
  label: string;
  type: ElicitationFieldType;
  required: boolean;
  default?: unknown;
}

export interface ElicitationResponse {
  requestId: string;
  values: Record<string, unknown>;
}

export interface ElicitationState {
  isVisible: boolean;
  request: ElicitationRequest | null;
}

/** Message actions */
export type MessageActionType = 'stop' | 'retry' | 'copy' | 'edit';

export interface MessageActionState {
  /** Message UUID currently being edited, or null */
  editingMessageId: string | null;
  /** Edit text content */
  editText: string;
  /** Whether the stop button should be visible (streaming in progress) */
  canStop: boolean;
  /** UUID of the last failed assistant message for retry */
  lastFailedMessageId: string | null;
}

/** postMessage types: webview -> extension host */
export interface TeleportAcceptMessage {
  type: 'teleport_accept';
  remoteSessionId: string;
}

export interface TeleportRejectMessage {
  type: 'teleport_reject';
  remoteSessionId: string;
}

export interface ElicitationResponseMessage {
  type: 'elicitation_response';
  requestId: string;
  values: Record<string, unknown>;
}

export interface ElicitationCancelMessage {
  type: 'elicitation_cancel';
  requestId: string;
}

export interface StopGenerationMessage {
  type: 'stop_generation';
}

export interface RetryMessage {
  type: 'retry_message';
  lastUserMessageUuid: string;
}

export interface EditMessage {
  type: 'edit_message';
  originalUuid: string;
  newContent: string;
}

export interface CopyMessageRequest {
  type: 'copy_message';
  content: string;
}
```

- [ ] **Step 2: Verify types compile**

Run: `cd /Users/harshagarwal/Documents/workspace/openclaude-vscode/webview && npx tsc --noEmit`

Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add webview/src/types/interactions.ts
git commit -m "feat(interactions): add TypeScript types for teleport, elicitation, and message actions"
```

---

## Task 2: Extension Host — Route Elicitation and Teleport Messages

**Files:**
- Modify: `src/process/controlRouter.ts`

- [ ] **Step 1: Write failing test for elicitation routing**

```typescript
// test/unit/interactions.test.ts
import { describe, it, expect, vi } from 'vitest';
import { routeControlRequest } from '../../src/process/controlRouter';

describe('routeControlRequest — elicitation', () => {
  it('routes elicitation control_request to webview with parsed fields', () => {
    const postMessage = vi.fn();
    const sendControlResponse = vi.fn();

    const controlRequest = {
      type: 'control_request' as const,
      request_id: 'elicit-001',
      request: {
        subtype: 'elicitation',
        message: 'Which environment should I deploy to?',
        fields: [
          {
            name: 'environment',
            label: 'Environment',
            type: { type: 'select', options: [
              { value: 'staging', label: 'Staging' },
              { value: 'production', label: 'Production' },
            ]},
            required: true,
          },
        ],
      },
    };

    routeControlRequest(controlRequest, { postMessage, sendControlResponse });

    expect(postMessage).toHaveBeenCalledWith({
      type: 'show_elicitation',
      requestId: 'elicit-001',
      message: 'Which environment should I deploy to?',
      fields: controlRequest.request.fields,
    });
  });

  it('routes elicitation cancel to webview', () => {
    const postMessage = vi.fn();
    const sendControlResponse = vi.fn();

    const cancelRequest = {
      type: 'control_cancel_request' as const,
      request_id: 'elicit-001',
    };

    routeControlRequest(cancelRequest, { postMessage, sendControlResponse });

    expect(postMessage).toHaveBeenCalledWith({
      type: 'dismiss_elicitation',
      requestId: 'elicit-001',
    });
  });
});
```

- [ ] **Step 2: Run tests and confirm failure**

Run: `cd /Users/harshagarwal/Documents/workspace/openclaude-vscode && npx vitest run test/unit/interactions.test.ts`

Expected: Failures (routing not implemented)

- [ ] **Step 3: Add elicitation and teleport routing to controlRouter.ts**

Add the following cases to the existing `routeControlRequest` function in `src/process/controlRouter.ts`:

```typescript
// Add these cases to the switch/if chain in routeControlRequest:

// --- Elicitation handling ---
if (message.type === 'control_request' && message.request?.subtype === 'elicitation') {
  handlers.postMessage({
    type: 'show_elicitation',
    requestId: message.request_id,
    message: message.request.message,
    fields: message.request.fields ?? [],
  });
  return;
}

// --- Teleport handling (system message with teleported-from) ---
if (message.type === 'system' && message.subtype === 'teleported-from') {
  handlers.postMessage({
    type: 'show_teleport',
    remoteSessionId: message.remoteSessionId,
    branch: message.branch ?? 'unknown',
    messageCount: message.messageCount ?? 0,
    sourceDevice: message.sourceDevice ?? 'unknown',
    timestamp: new Date().toISOString(),
  });
  return;
}

// --- Control cancel (dismiss stale dialogs) ---
if (message.type === 'control_cancel_request') {
  handlers.postMessage({
    type: 'dismiss_elicitation',
    requestId: message.request_id,
  });
  handlers.postMessage({
    type: 'dismiss_permission',
    requestId: message.request_id,
  });
  return;
}
```

Also add handler for webview responses back to CLI. In the webview message handler (where postMessage from webview is received):

```typescript
// In the webview -> extension host message handler:

case 'elicitation_response': {
  const { requestId, values } = msg;
  transport.write({
    type: 'control_response',
    response: {
      subtype: 'success',
      request_id: requestId,
      response: values,
    },
  });
  break;
}

case 'elicitation_cancel': {
  const { requestId } = msg;
  transport.write({
    type: 'control_response',
    response: {
      subtype: 'error',
      request_id: requestId,
      error: 'User cancelled elicitation',
    },
  });
  break;
}

case 'stop_generation': {
  transport.write({
    type: 'control_request',
    request_id: `interrupt-${Date.now()}`,
    request: { subtype: 'interrupt' },
  });
  break;
}

case 'retry_message': {
  // Re-send the last user message content
  const { lastUserMessageUuid } = msg;
  // The webview should include the message content; the host re-sends it
  transport.write({
    type: 'user',
    message: { role: 'user', content: msg.content },
    parent_tool_use_id: null,
    uuid: `retry-${Date.now()}`,
    session_id: currentSessionId,
  });
  break;
}

case 'edit_message': {
  // Send edited content as a new user message
  const { newContent } = msg;
  transport.write({
    type: 'user',
    message: { role: 'user', content: newContent },
    parent_tool_use_id: null,
    uuid: `edit-${Date.now()}`,
    session_id: currentSessionId,
  });
  break;
}

case 'teleport_accept': {
  // Teleport acceptance is handled by resuming the remote session
  // Spawn CLI with --resume <remoteSessionId>
  processManager.restart({ resume: msg.remoteSessionId });
  break;
}

case 'teleport_reject': {
  // No action needed — just dismiss the dialog
  break;
}

case 'copy_message': {
  vscode.env.clipboard.writeText(msg.content);
  break;
}
```

- [ ] **Step 4: Re-run tests and confirm PASS**

Run: `cd /Users/harshagarwal/Documents/workspace/openclaude-vscode && npx vitest run test/unit/interactions.test.ts`

Expected: All pass

- [ ] **Step 5: Commit**

```bash
git add src/process/controlRouter.ts test/unit/interactions.test.ts
git commit -m "feat(interactions): route elicitation, teleport, and message actions through host"
```

---

## Task 3: TeleportDialog

**Files:**
- Create: `webview/src/components/dialogs/TeleportDialog.tsx`

- [ ] **Step 1: Build the teleport confirmation dialog**

```tsx
// webview/src/components/dialogs/TeleportDialog.tsx
import React from 'react';
import type { TeleportInfo } from '../../types/interactions';
import { useVSCode } from '../../hooks/useVSCode';

interface TeleportDialogProps {
  info: TeleportInfo;
  onAccept: () => void;
  onReject: () => void;
}

export const TeleportDialog: React.FC<TeleportDialogProps> = ({
  info,
  onAccept,
  onReject,
}) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-vscode-bg border border-vscode-border rounded-lg shadow-xl max-w-md w-full mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-vscode-border bg-vscode-input-bg">
          <svg className="w-5 h-5 text-vscode-link flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" />
          </svg>
          <h2 className="text-sm font-semibold text-vscode-fg">Incoming Session Transfer</h2>
        </div>

        {/* Body */}
        <div className="px-4 py-4">
          <p className="text-sm text-vscode-fg/80 mb-4">
            A session is being transferred to this device. Would you like to accept it?
          </p>

          <div className="space-y-2 text-xs bg-vscode-input-bg rounded p-3 border border-vscode-border">
            <div className="flex justify-between">
              <span className="text-vscode-fg/50">Source device</span>
              <span className="text-vscode-fg font-mono">{info.sourceDevice}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-vscode-fg/50">Branch</span>
              <span className="text-vscode-fg font-mono">{info.branch}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-vscode-fg/50">Messages</span>
              <span className="text-vscode-fg">{info.messageCount}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-vscode-fg/50">Session ID</span>
              <span className="text-vscode-fg font-mono text-[10px] truncate max-w-[180px]">
                {info.remoteSessionId}
              </span>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2 px-4 py-3 border-t border-vscode-border bg-vscode-input-bg">
          <button
            className="px-3 py-1.5 text-xs rounded border border-vscode-border text-vscode-fg bg-transparent hover:bg-vscode-input-bg cursor-pointer"
            onClick={onReject}
          >
            Reject
          </button>
          <button
            className="px-3 py-1.5 text-xs rounded bg-vscode-button-bg text-vscode-button-fg hover:bg-vscode-button-hover cursor-pointer border-none"
            onClick={onAccept}
            autoFocus
          >
            Accept Transfer
          </button>
        </div>
      </div>
    </div>
  );
};
```

- [ ] **Step 2: Verify it compiles**

Run: `cd /Users/harshagarwal/Documents/workspace/openclaude-vscode/webview && npx tsc --noEmit`

Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add webview/src/components/dialogs/TeleportDialog.tsx
git commit -m "feat(interactions): add TeleportDialog for incoming session transfers"
```

---

## Task 4: ElicitationDialog

**Files:**
- Create: `webview/src/components/dialogs/ElicitationDialog.tsx`

- [ ] **Step 1: Build the elicitation dialog with support for text, select, multiselect, and confirm fields**

```tsx
// webview/src/components/dialogs/ElicitationDialog.tsx
import React, { useState, useCallback } from 'react';
import type {
  ElicitationRequest,
  ElicitationField,
  ElicitationFieldType,
} from '../../types/interactions';

interface ElicitationDialogProps {
  request: ElicitationRequest;
  onSubmit: (values: Record<string, unknown>) => void;
  onCancel: () => void;
}

export const ElicitationDialog: React.FC<ElicitationDialogProps> = ({
  request,
  onSubmit,
  onCancel,
}) => {
  const [values, setValues] = useState<Record<string, unknown>>(() => {
    const defaults: Record<string, unknown> = {};
    for (const field of request.fields) {
      if (field.default !== undefined) {
        defaults[field.name] = field.default;
      } else if (field.type.type === 'multiselect') {
        defaults[field.name] = [];
      } else if (field.type.type === 'confirm') {
        defaults[field.name] = field.type.default ?? false;
      } else {
        defaults[field.name] = '';
      }
    }
    return defaults;
  });

  const setValue = useCallback((name: string, value: unknown) => {
    setValues((prev) => ({ ...prev, [name]: value }));
  }, []);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      onSubmit(values);
    },
    [values, onSubmit],
  );

  const isValid = request.fields.every((field) => {
    if (!field.required) return true;
    const val = values[field.name];
    if (val === undefined || val === null || val === '') return false;
    if (Array.isArray(val) && val.length === 0) return false;
    return true;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-vscode-bg border border-vscode-border rounded-lg shadow-xl max-w-lg w-full mx-4 overflow-hidden">
        {/* Header */}
        <div className="px-4 py-3 border-b border-vscode-border bg-vscode-input-bg">
          <h2 className="text-sm font-semibold text-vscode-fg">Question from AI</h2>
        </div>

        {/* Message */}
        <div className="px-4 pt-4">
          <p className="text-sm text-vscode-fg/80 mb-4">{request.message}</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-4 pb-4 space-y-4">
          {request.fields.map((field) => (
            <FieldRenderer
              key={field.name}
              field={field}
              value={values[field.name]}
              onChange={(val) => setValue(field.name, val)}
            />
          ))}

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2 border-t border-vscode-border">
            <button
              type="button"
              className="px-3 py-1.5 text-xs rounded border border-vscode-border text-vscode-fg bg-transparent hover:bg-vscode-input-bg cursor-pointer"
              onClick={onCancel}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-3 py-1.5 text-xs rounded bg-vscode-button-bg text-vscode-button-fg hover:bg-vscode-button-hover cursor-pointer border-none disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={!isValid}
            >
              Submit
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

/** Renders a single elicitation field based on its type */
const FieldRenderer: React.FC<{
  field: ElicitationField;
  value: unknown;
  onChange: (value: unknown) => void;
}> = ({ field, value, onChange }) => {
  const fieldType = field.type;

  return (
    <div>
      <label className="block text-xs font-medium text-vscode-fg/70 mb-1">
        {field.label}
        {field.required && <span className="text-red-400 ml-0.5">*</span>}
      </label>

      {fieldType.type === 'text' && (
        <input
          type="text"
          className="w-full px-2 py-1.5 text-sm rounded border border-vscode-input-border bg-vscode-input-bg text-vscode-input-fg outline-none focus:border-vscode-link"
          placeholder={fieldType.placeholder ?? ''}
          value={(value as string) ?? ''}
          onChange={(e) => onChange(e.target.value)}
          autoFocus={true}
        />
      )}

      {fieldType.type === 'select' && (
        <div className="space-y-1">
          {fieldType.options.map((opt) => (
            <label
              key={opt.value}
              className={`flex items-center gap-2 px-2 py-1.5 rounded border cursor-pointer text-sm ${
                value === opt.value
                  ? 'border-vscode-link bg-vscode-link/10 text-vscode-fg'
                  : 'border-vscode-border bg-transparent text-vscode-fg/70 hover:border-vscode-fg/40'
              }`}
            >
              <input
                type="radio"
                name={field.name}
                value={opt.value}
                checked={value === opt.value}
                onChange={() => onChange(opt.value)}
                className="sr-only"
              />
              <div
                className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                  value === opt.value ? 'border-vscode-link' : 'border-vscode-fg/30'
                }`}
              >
                {value === opt.value && (
                  <div className="w-1.5 h-1.5 rounded-full bg-vscode-link" />
                )}
              </div>
              <div>
                <div>{opt.label}</div>
                {opt.description && (
                  <div className="text-xs text-vscode-fg/40">{opt.description}</div>
                )}
              </div>
            </label>
          ))}
        </div>
      )}

      {fieldType.type === 'multiselect' && (
        <div className="space-y-1">
          {fieldType.options.map((opt) => {
            const selected = Array.isArray(value) && (value as string[]).includes(opt.value);
            return (
              <label
                key={opt.value}
                className={`flex items-center gap-2 px-2 py-1.5 rounded border cursor-pointer text-sm ${
                  selected
                    ? 'border-vscode-link bg-vscode-link/10 text-vscode-fg'
                    : 'border-vscode-border bg-transparent text-vscode-fg/70 hover:border-vscode-fg/40'
                }`}
              >
                <input
                  type="checkbox"
                  checked={selected}
                  onChange={() => {
                    const arr = Array.isArray(value) ? [...(value as string[])] : [];
                    if (selected) {
                      onChange(arr.filter((v) => v !== opt.value));
                    } else {
                      onChange([...arr, opt.value]);
                    }
                  }}
                  className="sr-only"
                />
                <div
                  className={`w-3.5 h-3.5 rounded border-2 flex items-center justify-center flex-shrink-0 ${
                    selected ? 'border-vscode-link bg-vscode-link' : 'border-vscode-fg/30'
                  }`}
                >
                  {selected && (
                    <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 12 12">
                      <path d="M10 3L4.5 8.5 2 6" stroke="currentColor" strokeWidth="2" fill="none" />
                    </svg>
                  )}
                </div>
                <div>
                  <div>{opt.label}</div>
                  {opt.description && (
                    <div className="text-xs text-vscode-fg/40">{opt.description}</div>
                  )}
                </div>
              </label>
            );
          })}
        </div>
      )}

      {fieldType.type === 'confirm' && (
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={!!value}
            onChange={(e) => onChange(e.target.checked)}
            className="w-4 h-4 rounded border-vscode-input-border accent-vscode-link"
          />
          <span className="text-sm text-vscode-fg/70">Yes</span>
        </label>
      )}
    </div>
  );
};
```

- [ ] **Step 2: Verify it compiles**

Run: `cd /Users/harshagarwal/Documents/workspace/openclaude-vscode/webview && npx tsc --noEmit`

Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add webview/src/components/dialogs/ElicitationDialog.tsx
git commit -m "feat(interactions): add ElicitationDialog with text, select, multiselect, and confirm support"
```

---

## Task 5: MessageActions (Stop, Retry, Copy, Edit)

**Files:**
- Create: `webview/src/components/chat/MessageActions.tsx`

- [ ] **Step 1: Build the message action hover toolbar**

```tsx
// webview/src/components/chat/MessageActions.tsx
import React, { useState, useCallback } from 'react';
import { useVSCode } from '../../hooks/useVSCode';

interface MessageActionsProps {
  /** Whether this is an assistant message (shows copy, retry on failure) or user message (shows edit) */
  messageRole: 'user' | 'assistant';
  /** The raw text content of the message (for copy/edit) */
  content: string;
  /** Message UUID */
  uuid: string;
  /** Whether this message failed (shows retry button) */
  isFailed?: boolean;
  /** Whether streaming is in progress (shows stop button) */
  isStreaming?: boolean;
  /** Whether this is the most recent assistant message */
  isLatest?: boolean;
  /** Callback when user edits their message */
  onEdit?: (uuid: string, newContent: string) => void;
  /** Callback for retry */
  onRetry?: (uuid: string) => void;
  /** Callback for stop */
  onStop?: () => void;
}

export const MessageActions: React.FC<MessageActionsProps> = ({
  messageRole,
  content,
  uuid,
  isFailed = false,
  isStreaming = false,
  isLatest = false,
  onEdit,
  onRetry,
  onStop,
}) => {
  const vscode = useVSCode();
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(content);
  const [showCopied, setShowCopied] = useState(false);

  const handleCopy = useCallback(() => {
    vscode.postMessage({ type: 'copy_message', content });
    setShowCopied(true);
    setTimeout(() => setShowCopied(false), 2000);
  }, [content, vscode]);

  const handleEdit = useCallback(() => {
    setEditText(content);
    setIsEditing(true);
  }, [content]);

  const handleEditSubmit = useCallback(() => {
    if (editText.trim() && editText !== content) {
      onEdit?.(uuid, editText);
    }
    setIsEditing(false);
  }, [editText, content, uuid, onEdit]);

  const handleEditCancel = useCallback(() => {
    setIsEditing(false);
    setEditText(content);
  }, [content]);

  const handleEditKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleEditSubmit();
      }
      if (e.key === 'Escape') {
        handleEditCancel();
      }
    },
    [handleEditSubmit, handleEditCancel],
  );

  // Edit inline UI
  if (isEditing) {
    return (
      <div className="mt-2 border border-vscode-border rounded overflow-hidden">
        <textarea
          className="w-full px-3 py-2 text-sm bg-vscode-input-bg text-vscode-input-fg border-none outline-none resize-none min-h-[60px]"
          value={editText}
          onChange={(e) => setEditText(e.target.value)}
          onKeyDown={handleEditKeyDown}
          autoFocus
        />
        <div className="flex justify-end gap-1 px-2 py-1 bg-vscode-input-bg border-t border-vscode-border">
          <button
            className="px-2 py-0.5 text-xs text-vscode-fg/60 hover:text-vscode-fg bg-transparent border-none cursor-pointer"
            onClick={handleEditCancel}
          >
            Cancel
          </button>
          <button
            className="px-2 py-0.5 text-xs bg-vscode-button-bg text-vscode-button-fg rounded cursor-pointer border-none hover:bg-vscode-button-hover"
            onClick={handleEditSubmit}
          >
            Send
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
      {/* Stop button — visible during streaming on latest assistant message */}
      {isStreaming && isLatest && messageRole === 'assistant' && (
        <ActionButton
          label="Stop generation"
          icon={
            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 16 16">
              <rect x="3" y="3" width="10" height="10" rx="1" />
            </svg>
          }
          onClick={onStop}
          variant="danger"
        />
      )}

      {/* Retry button — on failed assistant messages */}
      {isFailed && messageRole === 'assistant' && (
        <ActionButton
          label="Retry"
          icon={
            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 16 16">
              <path d="M13.5 2v4h-4M2.5 14v-4h4" stroke="currentColor" strokeWidth="1.5" fill="none" />
              <path d="M4.1 10.5A5 5 0 0113.5 6M11.9 5.5A5 5 0 002.5 10" stroke="currentColor" strokeWidth="1.5" fill="none" />
            </svg>
          }
          onClick={() => onRetry?.(uuid)}
        />
      )}

      {/* Copy button — on all assistant messages */}
      {messageRole === 'assistant' && (
        <ActionButton
          label={showCopied ? 'Copied!' : 'Copy message'}
          icon={
            showCopied ? (
              <svg className="w-3.5 h-3.5 text-green-500" fill="currentColor" viewBox="0 0 16 16">
                <path d="M13 4L6 11 3 8" stroke="currentColor" strokeWidth="2" fill="none" />
              </svg>
            ) : (
              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 16 16">
                <rect x="5" y="5" width="8" height="8" rx="1" stroke="currentColor" fill="none" />
                <path d="M3 11V3h8" stroke="currentColor" fill="none" />
              </svg>
            )
          }
          onClick={handleCopy}
        />
      )}

      {/* Edit button — on user messages */}
      {messageRole === 'user' && (
        <ActionButton
          label="Edit message"
          icon={
            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 16 16">
              <path d="M11.5 1.5l3 3-9 9H2.5v-3l9-9z" stroke="currentColor" strokeWidth="1" fill="none" />
            </svg>
          }
          onClick={handleEdit}
        />
      )}
    </div>
  );
};

/** Small icon button used in the actions toolbar */
const ActionButton: React.FC<{
  label: string;
  icon: React.ReactNode;
  onClick?: () => void;
  variant?: 'default' | 'danger';
}> = ({ label, icon, onClick, variant = 'default' }) => (
  <button
    className={`p-1 rounded hover:bg-vscode-input-bg cursor-pointer border-none bg-transparent ${
      variant === 'danger' ? 'text-red-400 hover:text-red-300' : 'text-vscode-fg/40 hover:text-vscode-fg/70'
    }`}
    onClick={onClick}
    title={label}
    aria-label={label}
  >
    {icon}
  </button>
);
```

- [ ] **Step 2: Integrate MessageActions into message components**

In `webview/src/components/chat/UserMessage.tsx`, wrap the message content in a `group` div and add the actions:

```tsx
// Add to UserMessage.tsx — wrap existing content:
import { MessageActions } from './MessageActions';

// Inside the component's return:
<div className="group relative">
  {/* existing user message content */}
  <div className="absolute -bottom-1 right-0">
    <MessageActions
      messageRole="user"
      content={message.content}
      uuid={message.uuid}
      onEdit={onEditMessage}
    />
  </div>
</div>
```

In `webview/src/components/chat/AssistantMessage.tsx`, add similarly:

```tsx
// Add to AssistantMessage.tsx:
import { MessageActions } from './MessageActions';

// Inside the component's return:
<div className="group relative">
  {/* existing assistant message content */}
  <div className="absolute -top-2 right-0">
    <MessageActions
      messageRole="assistant"
      content={plainTextContent}
      uuid={message.uuid}
      isFailed={message.isFailed}
      isStreaming={message.isStreaming}
      isLatest={isLatest}
      onRetry={onRetry}
      onStop={onStop}
    />
  </div>
</div>
```

- [ ] **Step 3: Build and verify**

Run: `cd /Users/harshagarwal/Documents/workspace/openclaude-vscode && npm run build:webview`

Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add webview/src/components/chat/MessageActions.tsx webview/src/components/chat/UserMessage.tsx webview/src/components/chat/AssistantMessage.tsx
git commit -m "feat(interactions): add MessageActions toolbar with stop, retry, copy, and edit"
```

---

## Task 6: Wire Dialogs into App Root

**Files:**
- Modify: `webview/src/App.tsx`
- Modify: `webview/src/hooks/useChat.ts`

- [ ] **Step 1: Add teleport and elicitation state to the chat hook**

```typescript
// Add to webview/src/hooks/useChat.ts:

import type { TeleportState, ElicitationState, ElicitationRequest, TeleportInfo } from '../types/interactions';

// Add to the hook's state:
const [teleportState, setTeleportState] = useState<TeleportState>({
  isVisible: false,
  info: null,
});

const [elicitationState, setElicitationState] = useState<ElicitationState>({
  isVisible: false,
  request: null,
});

// Add to the message handler switch:
case 'show_teleport': {
  setTeleportState({
    isVisible: true,
    info: {
      remoteSessionId: msg.remoteSessionId,
      branch: msg.branch,
      messageCount: msg.messageCount,
      sourceDevice: msg.sourceDevice,
      timestamp: msg.timestamp,
    },
  });
  break;
}

case 'show_elicitation': {
  setElicitationState({
    isVisible: true,
    request: {
      requestId: msg.requestId,
      message: msg.message,
      fields: msg.fields,
    },
  });
  break;
}

case 'dismiss_elicitation': {
  setElicitationState({ isVisible: false, request: null });
  break;
}

// Return from hook:
return {
  // ...existing returns
  teleportState,
  setTeleportState,
  elicitationState,
  setElicitationState,
};
```

- [ ] **Step 2: Render dialogs in App.tsx**

```tsx
// Add to webview/src/App.tsx:
import { TeleportDialog } from './components/dialogs/TeleportDialog';
import { ElicitationDialog } from './components/dialogs/ElicitationDialog';

// Inside the App component's return, after the ChatPanel:
{teleportState.isVisible && teleportState.info && (
  <TeleportDialog
    info={teleportState.info}
    onAccept={() => {
      vscode.postMessage({
        type: 'teleport_accept',
        remoteSessionId: teleportState.info!.remoteSessionId,
      });
      setTeleportState({ isVisible: false, info: null });
    }}
    onReject={() => {
      vscode.postMessage({
        type: 'teleport_reject',
        remoteSessionId: teleportState.info!.remoteSessionId,
      });
      setTeleportState({ isVisible: false, info: null });
    }}
  />
)}

{elicitationState.isVisible && elicitationState.request && (
  <ElicitationDialog
    request={elicitationState.request}
    onSubmit={(values) => {
      vscode.postMessage({
        type: 'elicitation_response',
        requestId: elicitationState.request!.requestId,
        values,
      });
      setElicitationState({ isVisible: false, request: null });
    }}
    onCancel={() => {
      vscode.postMessage({
        type: 'elicitation_cancel',
        requestId: elicitationState.request!.requestId,
      });
      setElicitationState({ isVisible: false, request: null });
    }}
  />
)}
```

- [ ] **Step 3: Build and verify**

Run: `cd /Users/harshagarwal/Documents/workspace/openclaude-vscode && npm run build`

Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add webview/src/App.tsx webview/src/hooks/useChat.ts
git commit -m "feat(interactions): wire TeleportDialog and ElicitationDialog into app root"
```

---

## Final Verification

- [ ] Run: `cd /Users/harshagarwal/Documents/workspace/openclaude-vscode && npm run build`
- [ ] Run: `cd /Users/harshagarwal/Documents/workspace/openclaude-vscode && npx vitest run test/unit/interactions.test.ts`
- [ ] Manual verification checklist:
  - Teleport dialog: shows source device, branch, message count; accept resumes session; reject dismisses
  - Elicitation dialog: renders text input, radio select, checkbox multiselect, confirm; submit sends response; cancel sends error
  - Stop button: visible on latest streaming assistant message, sends interrupt
  - Retry button: visible on failed assistant messages, re-sends user message
  - Copy button: visible on assistant messages, copies to clipboard, shows "Copied!" feedback
  - Edit button: visible on user messages, opens inline editor, Enter sends, Escape cancels
  - Control cancel: stale elicitation/permission dialogs dismissed when CLI sends cancel
