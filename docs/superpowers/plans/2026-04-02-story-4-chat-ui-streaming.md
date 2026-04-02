# Story 4: Chat UI — Message List & Streaming — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the full chat message display — a scrollable message list that renders user bubbles, streamed assistant markdown with syntax-highlighted code blocks, tool call blocks, streaming indicators, cost display, and session title updates. This is the read-only half of the chat (input comes in Story 5).

**Architecture:** The webview receives `stream_event` messages from the extension host via the postMessage bridge (Story 3). Two React hooks (`useChat` and `useStream`) manage message state and parse streaming events into renderable content blocks. React components render each block type. Markdown is rendered via `react-markdown` + `rehype-highlight` for syntax highlighting. Code blocks get copy buttons and language labels. Tool calls are collapsible. An animated streaming indicator shows when the assistant is generating.

**Tech Stack:** React 18, TypeScript 5.x, Tailwind CSS 3, react-markdown, remark-gfm, rehype-highlight, highlight.js

**Spec:** [2026-04-02-openclaude-vscode-extension-design.md](../specs/2026-04-02-openclaude-vscode-extension-design.md) — Story 4, Section 3 (Webview UI Components)

**Dependencies:** Stories 2 (ProcessManager, NDJSON Transport) + 3 (Webview Shell, PostMessage Bridge) must be complete.

---

## File Structure

| File | Responsibility |
|---|---|
| `webview/src/types/messages.ts` | TypeScript types for all SDK messages: stream_event, assistant, user, result, system |
| `webview/src/types/chat.ts` | Chat-specific types: ChatMessage, ContentBlock, StreamState, ToolCall |
| `webview/src/hooks/useChat.ts` | Root chat state manager — message array, session title, cost, receives postMessage events |
| `webview/src/hooks/useStream.ts` | Parses stream_event into content blocks: text accumulation, tool_use JSON, thinking blocks |
| `webview/src/hooks/useAutoScroll.ts` | Auto-scroll to bottom on new content, pause on manual scroll-up, resume on scroll-to-bottom |
| `webview/src/components/chat/ChatPanel.tsx` | Root container — ChatHeader + MessageList + input placeholder |
| `webview/src/components/chat/ChatHeader.tsx` | Session title, new conversation button, session list button |
| `webview/src/components/chat/MessageList.tsx` | Scrollable list with auto-scroll behavior |
| `webview/src/components/chat/UserMessage.tsx` | User bubble — text with light styling |
| `webview/src/components/chat/AssistantMessage.tsx` | Assistant bubble — renders content blocks (text, tool calls, thinking) |
| `webview/src/components/chat/ToolCallBlock.tsx` | Collapsible tool invocation — tool name, input JSON, output |
| `webview/src/components/chat/StreamingIndicator.tsx` | Animated three-dot indicator during streaming |
| `webview/src/components/shared/MarkdownRenderer.tsx` | react-markdown with remark-gfm + rehype-highlight, custom code block renderer |
| `webview/src/components/shared/CodeBlock.tsx` | Syntax-highlighted code block with copy button and language label |
| `webview/src/components/shared/CostDisplay.tsx` | Token count + estimated cost from result messages |

---

## Task 1: Install Webview Dependencies

**Files:**
- Modify: `webview/package.json`

- [ ] **Step 1: Add markdown rendering and syntax highlighting dependencies**

```bash
cd /Users/harshagarwal/Documents/workspace/openclaude-vscode/webview && npm install react-markdown remark-gfm rehype-highlight highlight.js
```

This installs:
- `react-markdown` — renders markdown as React components
- `remark-gfm` — GitHub Flavored Markdown (tables, strikethrough, task lists)
- `rehype-highlight` — syntax highlighting via highlight.js in rehype pipeline
- `highlight.js` — the actual syntax highlighting engine (needed for CSS themes)

- [ ] **Step 2: Add type dependencies**

```bash
cd /Users/harshagarwal/Documents/workspace/openclaude-vscode/webview && npm install -D @types/hast
```

(`@types/hast` is needed for custom rehype component typing in react-markdown)

- [ ] **Step 3: Verify dependencies installed**

Run: `cd /Users/harshagarwal/Documents/workspace/openclaude-vscode/webview && node -e "require('react-markdown'); require('remark-gfm'); require('rehype-highlight'); console.log('All deps OK')"`

Expected: `All deps OK`

- [ ] **Step 4: Commit**

```bash
cd /Users/harshagarwal/Documents/workspace/openclaude-vscode
git add webview/package.json webview/package-lock.json
git commit -m "chore: add react-markdown, remark-gfm, rehype-highlight for chat UI"
```

---

## Task 2: Message Type Definitions

**Files:**
- Create: `webview/src/types/messages.ts`
- Create: `webview/src/types/chat.ts`

These types mirror the SDK schemas from `openclaude/src/entrypoints/sdk/coreSchemas.ts` but as plain TypeScript interfaces (no Zod dependency in the webview).

- [ ] **Step 1: Create webview/src/types/messages.ts**

```typescript
/**
 * SDK message types for the webview.
 *
 * These mirror the shapes defined in openclaude's coreSchemas.ts.
 * We use plain TS interfaces (no Zod) to keep the webview bundle small.
 */

// ============================================================================
// Streaming Events (from Anthropic API, wrapped by CLI)
// ============================================================================

/** Top-level stream_event wrapper sent by CLI stdout */
export interface StreamEvent {
  type: 'stream_event';
  event: RawMessageStreamEvent;
  parent_tool_use_id: string | null;
  uuid: string;
  session_id: string;
}

/**
 * Anthropic streaming event types.
 * These are the `event` field inside a StreamEvent.
 */
export type RawMessageStreamEvent =
  | MessageStartEvent
  | ContentBlockStartEvent
  | ContentBlockDeltaEvent
  | ContentBlockStopEvent
  | MessageDeltaEvent
  | MessageStopEvent;

export interface MessageStartEvent {
  type: 'message_start';
  message: {
    id: string;
    type: 'message';
    role: 'assistant';
    content: ContentBlock[];
    model: string;
    stop_reason: string | null;
    usage: Usage;
  };
}

export interface ContentBlockStartEvent {
  type: 'content_block_start';
  index: number;
  content_block: ContentBlock;
}

export interface ContentBlockDeltaEvent {
  type: 'content_block_delta';
  index: number;
  delta: ContentDelta;
}

export interface ContentBlockStopEvent {
  type: 'content_block_stop';
  index: number;
}

export interface MessageDeltaEvent {
  type: 'message_delta';
  delta: {
    stop_reason: string | null;
  };
  usage: Usage;
}

export interface MessageStopEvent {
  type: 'message_stop';
}

// ============================================================================
// Content Blocks
// ============================================================================

export type ContentBlock =
  | TextBlock
  | ToolUseBlock
  | ToolResultBlock
  | ThinkingBlock
  | RedactedThinkingBlock
  | ImageBlock
  | DocumentBlock
  | ServerToolUseBlock;

export interface TextBlock {
  type: 'text';
  text: string;
}

export interface ToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ToolResultBlock {
  type: 'tool_result';
  tool_use_id: string;
  content: string | ContentBlock[];
  is_error?: boolean;
}

export interface ThinkingBlock {
  type: 'thinking';
  thinking: string;
}

export interface RedactedThinkingBlock {
  type: 'redacted_thinking';
}

export interface ImageBlock {
  type: 'image';
  source: {
    type: 'base64' | 'url';
    media_type: string;
    data: string;
  };
}

export interface DocumentBlock {
  type: 'document';
  source: {
    type: 'base64' | 'url';
    media_type: string;
    data: string;
  };
}

export interface ServerToolUseBlock {
  type: 'server_tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

// ============================================================================
// Content Deltas (inside content_block_delta)
// ============================================================================

export type ContentDelta =
  | TextDelta
  | InputJsonDelta
  | ThinkingDelta;

export interface TextDelta {
  type: 'text_delta';
  text: string;
}

export interface InputJsonDelta {
  type: 'input_json_delta';
  partial_json: string;
}

export interface ThinkingDelta {
  type: 'thinking_delta';
  thinking: string;
}

// ============================================================================
// Usage
// ============================================================================

export interface Usage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
}

// ============================================================================
// Top-Level SDK Messages
// ============================================================================

export interface AssistantMessage {
  type: 'assistant';
  message: {
    id: string;
    type: 'message';
    role: 'assistant';
    content: ContentBlock[];
    model: string;
    stop_reason: string | null;
    usage: Usage;
  };
  parent_tool_use_id: string | null;
  error?: string;
  uuid: string;
  session_id: string;
}

export interface UserMessage {
  type: 'user';
  message: {
    role: 'user';
    content: string | ContentBlock[];
  };
  uuid?: string;
  session_id?: string;
}

export interface ResultMessage {
  type: 'result';
  subtype: 'success' | 'error_during_execution' | 'error_max_turns' | 'error_max_budget_usd' | 'error_max_structured_output_retries';
  duration_ms: number;
  duration_api_ms: number;
  is_error: boolean;
  num_turns: number;
  result?: string;
  stop_reason: string | null;
  total_cost_usd: number;
  usage: {
    inputTokens: number;
    outputTokens: number;
    cacheReadInputTokens: number;
    cacheCreationInputTokens: number;
  };
  model_usage?: Record<string, ModelUsage>;
  errors?: string[];
  uuid: string;
  session_id: string;
}

export interface ModelUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens: number;
  cacheCreationInputTokens: number;
  webSearchRequests: number;
  costUSD: number;
  contextWindow: number;
  maxOutputTokens: number;
}

export interface SystemInitMessage {
  type: 'system';
  subtype: 'init';
  model: string;
  claude_code_version: string;
  cwd: string;
  tools: string[];
  slash_commands: string[];
  mcp_servers: Array<{ name: string; status: string }>;
  permissionMode: string;
  uuid: string;
  session_id: string;
}

export interface SystemStatusMessage {
  type: 'system';
  subtype: 'status';
  status: Record<string, unknown>;
  uuid: string;
  session_id: string;
}

/** All messages that can arrive from the extension host via postMessage */
export type SDKMessage =
  | StreamEvent
  | AssistantMessage
  | UserMessage
  | ResultMessage
  | SystemInitMessage
  | SystemStatusMessage;
```

- [ ] **Step 2: Create webview/src/types/chat.ts**

```typescript
/**
 * Chat-specific types used by the UI components and hooks.
 */

import type { ContentBlock, Usage, ModelUsage } from './messages';

/** A renderable content block with streaming state */
export interface RenderableBlock {
  /** Index of this block in the assistant message */
  index: number;
  /** The content block (may be partial during streaming) */
  block: ContentBlock;
  /** Whether this block is still receiving deltas */
  isStreaming: boolean;
}

/** A single chat message in the UI */
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  /** For user messages: the text content */
  text?: string;
  /** For assistant messages: array of renderable content blocks */
  blocks?: RenderableBlock[];
  /** Whether this message is currently streaming */
  isStreaming: boolean;
  /** Timestamp */
  timestamp: number;
  /** Parent tool_use_id (null for top-level messages, set for sub-agent responses) */
  parentToolUseId: string | null;
  /** Model that generated this message (for assistant messages) */
  model?: string;
}

/** Accumulated state of a single streaming assistant turn */
export interface StreamState {
  /** UUID of the current streaming message */
  uuid: string;
  /** Content blocks being built up from deltas */
  blocks: RenderableBlock[];
  /** Model ID from message_start */
  model: string;
  /** Whether the stream is active */
  isActive: boolean;
  /** Parent tool_use_id */
  parentToolUseId: string | null;
  /** Accumulated input JSON for tool_use blocks (keyed by block index) */
  toolInputBuffers: Record<number, string>;
}

/** Tool call display data (derived from ToolUseBlock + ToolResultBlock) */
export interface ToolCallDisplay {
  id: string;
  name: string;
  input: Record<string, unknown>;
  /** Tool result (if received) */
  output?: string | ContentBlock[];
  isError?: boolean;
  /** Whether the tool is still executing */
  isRunning: boolean;
}

/** Session-level cost and usage info, updated from result messages */
export interface SessionCost {
  totalCostUSD: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  numTurns: number;
  durationMs: number;
}

/** Overall chat state managed by useChat */
export interface ChatState {
  messages: ChatMessage[];
  sessionTitle: string | null;
  sessionId: string | null;
  cost: SessionCost;
  isStreaming: boolean;
  model: string | null;
  error: string | null;
}
```

- [ ] **Step 3: Commit**

```bash
cd /Users/harshagarwal/Documents/workspace/openclaude-vscode
git add webview/src/types/messages.ts webview/src/types/chat.ts
git commit -m "feat: add TypeScript types for SDK messages and chat state"
```

---

## Task 3: useStream Hook — Parse stream_event into Renderable Blocks

**Files:**
- Create: `webview/src/hooks/useStream.ts`

This is the core streaming parser. It receives `stream_event` messages and maintains a `StreamState` that accumulates content blocks from `content_block_start`, `content_block_delta`, and `content_block_stop` events.

- [ ] **Step 1: Create webview/src/hooks/useStream.ts**

```typescript
import { useCallback, useRef } from 'react';
import type {
  StreamEvent,
  ContentBlock,
  TextBlock,
  ToolUseBlock,
  ThinkingBlock,
} from '../types/messages';
import type { RenderableBlock, StreamState } from '../types/chat';

interface UseStreamReturn {
  /** Process a single stream_event and return updated blocks */
  processStreamEvent: (event: StreamEvent) => StreamUpdate;
  /** Reset stream state (call when a new message starts) */
  resetStream: () => void;
  /** Get current stream state */
  getStreamState: () => StreamState | null;
}

/** What changed after processing a stream event */
export interface StreamUpdate {
  type:
    | 'message_start'
    | 'block_start'
    | 'block_delta'
    | 'block_stop'
    | 'message_delta'
    | 'message_stop'
    | 'unknown';
  /** Current renderable blocks (snapshot) */
  blocks: RenderableBlock[];
  /** Model from message_start */
  model: string | null;
  /** Stop reason from message_delta */
  stopReason: string | null;
  /** UUID of the streaming message */
  uuid: string;
  /** parent_tool_use_id */
  parentToolUseId: string | null;
}

export function useStream(): UseStreamReturn {
  const stateRef = useRef<StreamState | null>(null);

  const resetStream = useCallback(() => {
    stateRef.current = null;
  }, []);

  const getStreamState = useCallback(() => {
    return stateRef.current;
  }, []);

  const processStreamEvent = useCallback((streamEvent: StreamEvent): StreamUpdate => {
    const { event, uuid, parent_tool_use_id } = streamEvent;

    switch (event.type) {
      case 'message_start': {
        // Initialize stream state for a new assistant message
        const state: StreamState = {
          uuid,
          blocks: [],
          model: event.message.model,
          isActive: true,
          parentToolUseId: parent_tool_use_id,
          toolInputBuffers: {},
        };
        stateRef.current = state;
        return {
          type: 'message_start',
          blocks: [],
          model: event.message.model,
          stopReason: null,
          uuid,
          parentToolUseId: parent_tool_use_id,
        };
      }

      case 'content_block_start': {
        const state = stateRef.current;
        if (!state) {
          return makeUnknown(uuid, parent_tool_use_id);
        }

        const block: RenderableBlock = {
          index: event.index,
          block: normalizeStartBlock(event.content_block),
          isStreaming: true,
        };

        // Initialize tool input buffer if this is a tool_use block
        if (event.content_block.type === 'tool_use') {
          state.toolInputBuffers[event.index] = '';
        }

        state.blocks[event.index] = block;

        return {
          type: 'block_start',
          blocks: [...state.blocks],
          model: state.model,
          stopReason: null,
          uuid,
          parentToolUseId: parent_tool_use_id,
        };
      }

      case 'content_block_delta': {
        const state = stateRef.current;
        if (!state) {
          return makeUnknown(uuid, parent_tool_use_id);
        }

        const existing = state.blocks[event.index];
        if (!existing) {
          return makeUnknown(uuid, parent_tool_use_id);
        }

        const updatedBlock = applyDelta(existing.block, event.delta, state, event.index);
        state.blocks[event.index] = {
          ...existing,
          block: updatedBlock,
        };

        return {
          type: 'block_delta',
          blocks: [...state.blocks],
          model: state.model,
          stopReason: null,
          uuid,
          parentToolUseId: parent_tool_use_id,
        };
      }

      case 'content_block_stop': {
        const state = stateRef.current;
        if (!state) {
          return makeUnknown(uuid, parent_tool_use_id);
        }

        const existing = state.blocks[event.index];
        if (existing) {
          // Finalize tool_use input from accumulated JSON buffer
          if (existing.block.type === 'tool_use') {
            const jsonStr = state.toolInputBuffers[event.index] || '{}';
            try {
              (existing.block as ToolUseBlock).input = JSON.parse(jsonStr);
            } catch {
              (existing.block as ToolUseBlock).input = { _raw: jsonStr };
            }
            delete state.toolInputBuffers[event.index];
          }

          state.blocks[event.index] = {
            ...existing,
            isStreaming: false,
          };
        }

        return {
          type: 'block_stop',
          blocks: [...state.blocks],
          model: state.model,
          stopReason: null,
          uuid,
          parentToolUseId: parent_tool_use_id,
        };
      }

      case 'message_delta': {
        const state = stateRef.current;
        const stopReason = event.delta.stop_reason;
        return {
          type: 'message_delta',
          blocks: state ? [...state.blocks] : [],
          model: state?.model ?? null,
          stopReason,
          uuid,
          parentToolUseId: parent_tool_use_id,
        };
      }

      case 'message_stop': {
        const state = stateRef.current;
        if (state) {
          state.isActive = false;
        }
        return {
          type: 'message_stop',
          blocks: state ? [...state.blocks] : [],
          model: state?.model ?? null,
          stopReason: null,
          uuid,
          parentToolUseId: parent_tool_use_id,
        };
      }

      default:
        return makeUnknown(uuid, parent_tool_use_id);
    }
  }, []);

  return { processStreamEvent, resetStream, getStreamState };
}

// ============================================================================
// Helpers
// ============================================================================

function makeUnknown(uuid: string, parentToolUseId: string | null): StreamUpdate {
  return {
    type: 'unknown',
    blocks: [],
    model: null,
    stopReason: null,
    uuid,
    parentToolUseId,
  };
}

/**
 * Normalize a content_block from content_block_start.
 * The SDK sometimes includes text in the start event — we ignore it
 * (it gets re-sent in content_block_delta, causing duplicates).
 */
function normalizeStartBlock(block: ContentBlock): ContentBlock {
  switch (block.type) {
    case 'text':
      return { type: 'text', text: '' };
    case 'thinking':
      return { type: 'thinking', thinking: '' };
    case 'tool_use':
      return { type: 'tool_use', id: block.id, name: block.name, input: {} };
    default:
      return block;
  }
}

/** Apply a content_block_delta to an existing block */
function applyDelta(
  block: ContentBlock,
  delta: StreamEvent['event'] extends { delta: infer D } ? D : never,
  state: StreamState,
  index: number,
): ContentBlock {
  // TypeScript needs help here — delta is a union type
  const d = delta as Record<string, unknown>;

  switch (d.type) {
    case 'text_delta': {
      if (block.type !== 'text') return block;
      return {
        ...block,
        text: (block as TextBlock).text + (d.text as string),
      };
    }

    case 'thinking_delta': {
      if (block.type !== 'thinking') return block;
      return {
        ...block,
        thinking: (block as ThinkingBlock).thinking + (d.thinking as string),
      };
    }

    case 'input_json_delta': {
      // Accumulate partial JSON for tool_use blocks
      if (block.type === 'tool_use' || block.type === 'server_tool_use') {
        state.toolInputBuffers[index] =
          (state.toolInputBuffers[index] || '') + (d.partial_json as string);
      }
      return block;
    }

    default:
      return block;
  }
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/harshagarwal/Documents/workspace/openclaude-vscode
git add webview/src/hooks/useStream.ts
git commit -m "feat: add useStream hook for parsing stream_event into renderable blocks"
```

---

## Task 4: useChat Hook — Message State Manager

**Files:**
- Create: `webview/src/hooks/useChat.ts`

This is the top-level hook that manages the full chat state. It listens for postMessage events from the extension host, uses `useStream` to parse streaming events, and maintains the message array, session title, and cost.

- [ ] **Step 1: Create webview/src/hooks/useChat.ts**

```typescript
import { useState, useCallback, useEffect, useRef } from 'react';
import { vscode } from '../vscode';
import { useStream } from './useStream';
import type { ChatState, ChatMessage, SessionCost } from '../types/chat';
import type {
  SDKMessage,
  StreamEvent,
  AssistantMessage,
  UserMessage,
  ResultMessage,
  SystemInitMessage,
} from '../types/messages';

const EMPTY_COST: SessionCost = {
  totalCostUSD: 0,
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheCreationTokens: 0,
  numTurns: 0,
  durationMs: 0,
};

export function useChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sessionTitle, setSessionTitle] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [cost, setCost] = useState<SessionCost>(EMPTY_COST);
  const [isStreaming, setIsStreaming] = useState(false);
  const [model, setModel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { processStreamEvent, resetStream } = useStream();

  // Track the UUID of the current streaming message to update it in place
  const streamingUuidRef = useRef<string | null>(null);

  // Handle a user message echo from the CLI
  const handleUserMessage = useCallback((msg: UserMessage) => {
    const text =
      typeof msg.message.content === 'string'
        ? msg.message.content
        : '[complex content]';

    const chatMsg: ChatMessage = {
      id: msg.uuid || `user-${Date.now()}`,
      role: 'user',
      text,
      isStreaming: false,
      timestamp: Date.now(),
      parentToolUseId: null,
    };

    setMessages((prev) => [...prev, chatMsg]);
  }, []);

  // Handle stream_event messages (streaming assistant response)
  const handleStreamEvent = useCallback(
    (streamEvent: StreamEvent) => {
      const update = processStreamEvent(streamEvent);

      switch (update.type) {
        case 'message_start': {
          // Create a new streaming assistant message
          streamingUuidRef.current = update.uuid;
          setIsStreaming(true);

          if (update.model) {
            setModel(update.model);
          }

          const chatMsg: ChatMessage = {
            id: update.uuid,
            role: 'assistant',
            blocks: [],
            isStreaming: true,
            timestamp: Date.now(),
            parentToolUseId: update.parentToolUseId,
            model: update.model || undefined,
          };

          setMessages((prev) => [...prev, chatMsg]);
          break;
        }

        case 'block_start':
        case 'block_delta':
        case 'block_stop': {
          // Update the streaming message's blocks in place
          const uuid = streamingUuidRef.current;
          if (!uuid) break;

          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === uuid
                ? { ...msg, blocks: update.blocks }
                : msg,
            ),
          );
          break;
        }

        case 'message_delta': {
          // Stop reason received — message is about to end
          break;
        }

        case 'message_stop': {
          // Mark the streaming message as complete
          const uuid = streamingUuidRef.current;
          if (uuid) {
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === uuid
                  ? {
                      ...msg,
                      isStreaming: false,
                      blocks: msg.blocks?.map((b) => ({
                        ...b,
                        isStreaming: false,
                      })),
                    }
                  : msg,
              ),
            );
          }

          setIsStreaming(false);
          streamingUuidRef.current = null;
          resetStream();
          break;
        }
      }
    },
    [processStreamEvent, resetStream],
  );

  // Handle completed assistant messages (replayed from history)
  const handleAssistantMessage = useCallback((msg: AssistantMessage) => {
    const blocks = (msg.message.content || []).map((block, index) => ({
      index,
      block,
      isStreaming: false,
    }));

    const chatMsg: ChatMessage = {
      id: msg.uuid,
      role: 'assistant',
      blocks,
      isStreaming: false,
      timestamp: Date.now(),
      parentToolUseId: msg.parent_tool_use_id,
      model: msg.message.model,
    };

    setMessages((prev) => [...prev, chatMsg]);
  }, []);

  // Handle result messages (cost + usage)
  const handleResultMessage = useCallback((msg: ResultMessage) => {
    setIsStreaming(false);
    streamingUuidRef.current = null;
    resetStream();

    setCost({
      totalCostUSD: msg.total_cost_usd,
      inputTokens: msg.usage.inputTokens,
      outputTokens: msg.usage.outputTokens,
      cacheReadTokens: msg.usage.cacheReadInputTokens,
      cacheCreationTokens: msg.usage.cacheCreationInputTokens,
      numTurns: msg.num_turns,
      durationMs: msg.duration_ms,
    });

    if (msg.is_error && msg.errors && msg.errors.length > 0) {
      setError(msg.errors.join('\n'));
    }
  }, [resetStream]);

  // Handle system init message (session info)
  const handleSystemInit = useCallback((msg: SystemInitMessage) => {
    setSessionId(msg.session_id);
    setModel(msg.model);
  }, []);

  // Handle session title update
  const handleSessionTitle = useCallback((title: string) => {
    setSessionTitle(title);
  }, []);

  // Main message router — receives postMessage events from extension host
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const data = event.data;
      if (!data || typeof data !== 'object') return;

      // The extension host wraps CLI messages in a { type: 'cliMessage', message: ... } envelope
      // OR forwards them directly — handle both
      const msg: SDKMessage = data.type === 'cliMessage' ? data.message : data;

      try {
        switch (msg.type) {
          case 'stream_event':
            handleStreamEvent(msg as StreamEvent);
            break;
          case 'user':
            handleUserMessage(msg as UserMessage);
            break;
          case 'assistant':
            handleAssistantMessage(msg as AssistantMessage);
            break;
          case 'result':
            handleResultMessage(msg as ResultMessage);
            break;
          case 'system':
            if ((msg as SystemInitMessage).subtype === 'init') {
              handleSystemInit(msg as SystemInitMessage);
            }
            break;
        }

        // Check for session title update (sent as a separate postMessage type)
        if (data.type === 'sessionTitle' && typeof data.title === 'string') {
          handleSessionTitle(data.title);
        }
      } catch (err) {
        console.error('[useChat] Error processing message:', err, data);
      }
    };

    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [
    handleStreamEvent,
    handleUserMessage,
    handleAssistantMessage,
    handleResultMessage,
    handleSystemInit,
    handleSessionTitle,
  ]);

  // Send a user message to the extension host
  const sendMessage = useCallback(
    (text: string) => {
      if (!text.trim()) return;

      // Optimistically add the user message to the UI
      const id = `user-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const chatMsg: ChatMessage = {
        id,
        role: 'user',
        text,
        isStreaming: false,
        timestamp: Date.now(),
        parentToolUseId: null,
      };
      setMessages((prev) => [...prev, chatMsg]);
      setError(null);

      // Send to extension host via postMessage
      vscode.postMessage({
        type: 'sendMessage',
        text,
      });
    },
    [],
  );

  // Clear all messages (new conversation)
  const clearMessages = useCallback(() => {
    setMessages([]);
    setSessionTitle(null);
    setCost(EMPTY_COST);
    setIsStreaming(false);
    setError(null);
    streamingUuidRef.current = null;
    resetStream();
  }, [resetStream]);

  // Interrupt the current generation
  const interrupt = useCallback(() => {
    vscode.postMessage({ type: 'interrupt' });
    setIsStreaming(false);
  }, []);

  return {
    messages,
    sessionTitle,
    sessionId,
    cost,
    isStreaming,
    model,
    error,
    sendMessage,
    clearMessages,
    interrupt,
  };
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/harshagarwal/Documents/workspace/openclaude-vscode
git add webview/src/hooks/useChat.ts
git commit -m "feat: add useChat hook for managing chat message state and postMessage bridge"
```

---

## Task 5: useAutoScroll Hook

**Files:**
- Create: `webview/src/hooks/useAutoScroll.ts`

Auto-scroll to bottom when new content arrives. Pause auto-scroll when the user manually scrolls up. Resume when they scroll back to the bottom.

- [ ] **Step 1: Create webview/src/hooks/useAutoScroll.ts**

```typescript
import { useCallback, useEffect, useRef, useState } from 'react';

interface UseAutoScrollOptions {
  /** Threshold in pixels from bottom to consider "at bottom" */
  threshold?: number;
}

export function useAutoScroll(options: UseAutoScrollOptions = {}) {
  const { threshold = 50 } = options;
  const containerRef = useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [userScrolledUp, setUserScrolledUp] = useState(false);

  // Check if the container is scrolled to the bottom
  const checkIsAtBottom = useCallback(() => {
    const el = containerRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight <= threshold;
  }, [threshold]);

  // Handle scroll events to detect manual scroll-up
  const handleScroll = useCallback(() => {
    const atBottom = checkIsAtBottom();
    setIsAtBottom(atBottom);

    if (atBottom) {
      // User scrolled back to bottom — resume auto-scroll
      setUserScrolledUp(false);
    } else {
      // User scrolled up — pause auto-scroll
      setUserScrolledUp(true);
    }
  }, [checkIsAtBottom]);

  // Scroll to bottom programmatically
  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    const el = containerRef.current;
    if (!el) return;
    el.scrollTo({
      top: el.scrollHeight,
      behavior,
    });
    setUserScrolledUp(false);
    setIsAtBottom(true);
  }, []);

  // Auto-scroll when content changes (call this after new messages/deltas)
  const autoScroll = useCallback(() => {
    if (!userScrolledUp) {
      // Use instant scroll during streaming for smoother UX
      scrollToBottom('instant' as ScrollBehavior);
    }
  }, [userScrolledUp, scrollToBottom]);

  // Attach scroll listener
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => el.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  return {
    containerRef,
    isAtBottom,
    userScrolledUp,
    scrollToBottom,
    autoScroll,
  };
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/harshagarwal/Documents/workspace/openclaude-vscode
git add webview/src/hooks/useAutoScroll.ts
git commit -m "feat: add useAutoScroll hook with manual scroll-pause detection"
```

---

## Task 6: CodeBlock Component — Syntax Highlighting + Copy Button

**Files:**
- Create: `webview/src/components/shared/CodeBlock.tsx`

- [ ] **Step 1: Create webview/src/components/shared/CodeBlock.tsx**

```tsx
import { useState, useCallback } from 'react';

interface CodeBlockProps {
  /** The code content */
  children: string;
  /** Language identifier (from markdown fence) */
  language?: string;
  /** Pre-highlighted HTML from rehype-highlight (if available) */
  className?: string;
}

export function CodeBlock({ children, language, className }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  // Extract language from className if not explicitly provided
  // rehype-highlight sets className to "language-xxx"
  const lang = language || extractLanguage(className);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(children);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for environments without clipboard API
      console.warn('Failed to copy to clipboard');
    }
  }, [children]);

  return (
    <div className="group relative my-2 rounded-md border border-vscode-border overflow-hidden">
      {/* Header bar with language label and copy button */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-[var(--vscode-editorGroupHeader-tabsBackground)] border-b border-vscode-border text-xs">
        <span className="opacity-60 font-mono">
          {lang || 'text'}
        </span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 px-2 py-0.5 rounded text-xs
            opacity-0 group-hover:opacity-100 transition-opacity
            hover:bg-[var(--vscode-toolbar-hoverBackground)]
            text-vscode-fg"
          title="Copy code"
        >
          {copied ? (
            <>
              <CheckIcon />
              <span>Copied!</span>
            </>
          ) : (
            <>
              <CopyIcon />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>

      {/* Code content — rehype-highlight adds syntax classes to <code> children */}
      <pre className="overflow-x-auto p-3 m-0 text-sm leading-relaxed bg-[var(--vscode-editor-background)]">
        <code className={className}>
          {children}
        </code>
      </pre>
    </div>
  );
}

// ============================================================================
// Helpers
// ============================================================================

function extractLanguage(className?: string): string | undefined {
  if (!className) return undefined;
  // rehype-highlight sets className to "hljs language-xxx" or "language-xxx"
  const match = className.match(/language-(\S+)/);
  return match?.[1];
}

// ============================================================================
// Inline SVG Icons (avoids external icon dependency)
// ============================================================================

function CopyIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/harshagarwal/Documents/workspace/openclaude-vscode
git add webview/src/components/shared/CodeBlock.tsx
git commit -m "feat: add CodeBlock component with syntax highlighting, copy button, language label"
```

---

## Task 7: MarkdownRenderer Component

**Files:**
- Create: `webview/src/components/shared/MarkdownRenderer.tsx`

Uses `react-markdown` with `remark-gfm` (tables, task lists, strikethrough) and `rehype-highlight` (syntax highlighting). Custom renderer for code blocks routes to our `CodeBlock` component.

- [ ] **Step 1: Add highlight.js CSS import to webview styles**

Add to `webview/src/styles/index.css`:

```css
/* Import highlight.js theme that matches VS Code dark/light */
@import 'highlight.js/styles/vs2015.css';
```

This gives us the VS 2015 Dark theme for code blocks. It looks natural in VS Code's dark mode. We can add light-mode detection later.

- [ ] **Step 2: Create webview/src/components/shared/MarkdownRenderer.tsx**

```tsx
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import type { Components } from 'react-markdown';
import { CodeBlock } from './CodeBlock';

interface MarkdownRendererProps {
  /** Markdown text to render */
  content: string;
  /** Whether the content is still streaming (affects cursor display) */
  isStreaming?: boolean;
}

export function MarkdownRenderer({ content, isStreaming = false }: MarkdownRendererProps) {
  return (
    <div className="markdown-body prose prose-sm max-w-none text-vscode-fg">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={markdownComponents}
      >
        {content}
      </ReactMarkdown>
      {isStreaming && <StreamingCursor />}
    </div>
  );
}

/**
 * Custom component overrides for react-markdown.
 * Routes fenced code blocks to our CodeBlock component.
 */
const markdownComponents: Components = {
  // Override <pre> to strip the wrapper (CodeBlock handles its own <pre>)
  pre({ children }) {
    return <>{children}</>;
  },

  // Override <code> — inline code vs. block code
  code({ className, children, ...props }) {
    const isInline = !className && typeof children === 'string' && !children.includes('\n');

    if (isInline) {
      return (
        <code
          className="px-1.5 py-0.5 rounded text-xs font-mono bg-[var(--vscode-textCodeBlock-background)]"
          {...props}
        >
          {children}
        </code>
      );
    }

    // Block code — extract text content and pass to CodeBlock
    const codeText = extractTextContent(children);

    return (
      <CodeBlock className={className} language={undefined}>
        {codeText}
      </CodeBlock>
    );
  },

  // Links open in VS Code's external browser
  a({ href, children }) {
    return (
      <a
        href={href}
        className="text-vscode-link hover:underline"
        target="_blank"
        rel="noopener noreferrer"
      >
        {children}
      </a>
    );
  },

  // Tables with VS Code styling
  table({ children }) {
    return (
      <div className="overflow-x-auto my-2">
        <table className="min-w-full border-collapse border border-vscode-border text-sm">
          {children}
        </table>
      </div>
    );
  },

  th({ children }) {
    return (
      <th className="border border-vscode-border px-3 py-1.5 text-left font-semibold bg-[var(--vscode-editorGroupHeader-tabsBackground)]">
        {children}
      </th>
    );
  },

  td({ children }) {
    return (
      <td className="border border-vscode-border px-3 py-1.5">
        {children}
      </td>
    );
  },

  // Task list items (from remark-gfm)
  li({ children, ...props }) {
    // remark-gfm uses className 'task-list-item' for checkbox list items
    const isTaskItem = props.className?.includes('task-list-item');
    return (
      <li className={isTaskItem ? 'list-none' : undefined}>
        {children}
      </li>
    );
  },

  // Block quotes styled as callouts
  blockquote({ children }) {
    return (
      <blockquote className="border-l-4 border-vscode-link pl-4 my-2 opacity-80 italic">
        {children}
      </blockquote>
    );
  },
};

/**
 * Extract plain text from React children.
 * react-markdown passes the code content as nested children —
 * this flattens them to a string for our CodeBlock component.
 */
function extractTextContent(children: React.ReactNode): string {
  if (typeof children === 'string') return children;
  if (Array.isArray(children)) return children.map(extractTextContent).join('');
  if (children && typeof children === 'object' && 'props' in children) {
    return extractTextContent((children as React.ReactElement).props.children);
  }
  return String(children ?? '');
}

/** Blinking cursor shown at the end of streaming text */
function StreamingCursor() {
  return (
    <span
      className="inline-block w-2 h-4 bg-vscode-fg animate-pulse ml-0.5 align-text-bottom"
      aria-hidden="true"
    />
  );
}
```

- [ ] **Step 3: Add markdown prose styles to webview/src/styles/index.css**

Append these styles after the existing body styles:

```css
/* Markdown prose overrides for VS Code webview */
.markdown-body p {
  margin: 0.5em 0;
  line-height: 1.6;
}

.markdown-body h1, .markdown-body h2, .markdown-body h3,
.markdown-body h4, .markdown-body h5, .markdown-body h6 {
  margin-top: 1em;
  margin-bottom: 0.5em;
  font-weight: 600;
}

.markdown-body ul, .markdown-body ol {
  padding-left: 1.5em;
  margin: 0.5em 0;
}

.markdown-body hr {
  border: none;
  border-top: 1px solid var(--vscode-panel-border);
  margin: 1em 0;
}

/* highlight.js overrides to match VS Code */
.hljs {
  background: transparent !important;
  padding: 0 !important;
}
```

- [ ] **Step 4: Commit**

```bash
cd /Users/harshagarwal/Documents/workspace/openclaude-vscode
git add webview/src/components/shared/MarkdownRenderer.tsx webview/src/styles/index.css
git commit -m "feat: add MarkdownRenderer with react-markdown, remark-gfm, rehype-highlight"
```

---

## Task 8: CostDisplay Component

**Files:**
- Create: `webview/src/components/shared/CostDisplay.tsx`

- [ ] **Step 1: Create webview/src/components/shared/CostDisplay.tsx**

```tsx
import type { SessionCost } from '../../types/chat';

interface CostDisplayProps {
  cost: SessionCost;
  className?: string;
}

export function CostDisplay({ cost, className = '' }: CostDisplayProps) {
  if (cost.totalCostUSD === 0 && cost.inputTokens === 0) {
    return null;
  }

  return (
    <div
      className={`flex items-center gap-3 text-xs opacity-60 ${className}`}
      title={buildTooltip(cost)}
    >
      <span>{formatCost(cost.totalCostUSD)}</span>
      <span className="opacity-40">|</span>
      <span>{formatTokens(cost.inputTokens + cost.outputTokens)} tokens</span>
      {cost.numTurns > 0 && (
        <>
          <span className="opacity-40">|</span>
          <span>{cost.numTurns} {cost.numTurns === 1 ? 'turn' : 'turns'}</span>
        </>
      )}
      {cost.durationMs > 0 && (
        <>
          <span className="opacity-40">|</span>
          <span>{formatDuration(cost.durationMs)}</span>
        </>
      )}
    </div>
  );
}

// ============================================================================
// Formatters
// ============================================================================

function formatCost(usd: number): string {
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  if (usd < 1) return `$${usd.toFixed(3)}`;
  return `$${usd.toFixed(2)}`;
}

function formatTokens(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}k`;
  return String(count);
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

function buildTooltip(cost: SessionCost): string {
  const lines = [
    `Total cost: ${formatCost(cost.totalCostUSD)}`,
    `Input tokens: ${cost.inputTokens.toLocaleString()}`,
    `Output tokens: ${cost.outputTokens.toLocaleString()}`,
  ];
  if (cost.cacheReadTokens > 0) {
    lines.push(`Cache read: ${cost.cacheReadTokens.toLocaleString()}`);
  }
  if (cost.cacheCreationTokens > 0) {
    lines.push(`Cache creation: ${cost.cacheCreationTokens.toLocaleString()}`);
  }
  if (cost.numTurns > 0) {
    lines.push(`Turns: ${cost.numTurns}`);
  }
  if (cost.durationMs > 0) {
    lines.push(`Duration: ${formatDuration(cost.durationMs)}`);
  }
  return lines.join('\n');
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/harshagarwal/Documents/workspace/openclaude-vscode
git add webview/src/components/shared/CostDisplay.tsx
git commit -m "feat: add CostDisplay component showing tokens, cost, turns, duration"
```

---

## Task 9: StreamingIndicator Component

**Files:**
- Create: `webview/src/components/chat/StreamingIndicator.tsx`

- [ ] **Step 1: Create webview/src/components/chat/StreamingIndicator.tsx**

```tsx
interface StreamingIndicatorProps {
  /** Whether to show the indicator */
  visible: boolean;
}

export function StreamingIndicator({ visible }: StreamingIndicatorProps) {
  if (!visible) return null;

  return (
    <div className="flex items-center gap-1.5 px-4 py-2" role="status" aria-label="Generating response">
      <div className="flex gap-1">
        <Dot delay="0ms" />
        <Dot delay="150ms" />
        <Dot delay="300ms" />
      </div>
      <span className="text-xs opacity-50 ml-1">Generating...</span>
    </div>
  );
}

function Dot({ delay }: { delay: string }) {
  return (
    <span
      className="inline-block w-1.5 h-1.5 rounded-full bg-vscode-fg opacity-40 animate-bounce"
      style={{ animationDelay: delay, animationDuration: '1s' }}
    />
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/harshagarwal/Documents/workspace/openclaude-vscode
git add webview/src/components/chat/StreamingIndicator.tsx
git commit -m "feat: add StreamingIndicator with animated bouncing dots"
```

---

## Task 10: ToolCallBlock Component

**Files:**
- Create: `webview/src/components/chat/ToolCallBlock.tsx`

- [ ] **Step 1: Create webview/src/components/chat/ToolCallBlock.tsx**

```tsx
import { useState } from 'react';
import type { ToolUseBlock, ServerToolUseBlock } from '../../types/messages';

interface ToolCallBlockProps {
  /** The tool_use or server_tool_use content block */
  block: ToolUseBlock | ServerToolUseBlock;
  /** Whether the tool is still being invoked */
  isStreaming: boolean;
}

export function ToolCallBlock({ block, isStreaming }: ToolCallBlockProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const toolName = block.name;
  const input = block.input;
  const hasInput = Object.keys(input).length > 0;

  return (
    <div className="my-2 rounded-md border border-vscode-border overflow-hidden">
      {/* Collapsible header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-2 w-full px-3 py-2 text-left text-sm
          bg-[var(--vscode-editorGroupHeader-tabsBackground)]
          hover:bg-[var(--vscode-list-hoverBackground)]
          transition-colors"
      >
        {/* Chevron */}
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className={`transition-transform ${isExpanded ? 'rotate-90' : ''}`}
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>

        {/* Tool icon */}
        <ToolIcon />

        {/* Tool name */}
        <span className="font-mono text-xs font-medium">{toolName}</span>

        {/* Status indicator */}
        {isStreaming && (
          <span className="ml-auto flex items-center gap-1 text-xs opacity-50">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse" />
            Running
          </span>
        )}
        {!isStreaming && (
          <span className="ml-auto text-xs opacity-40">
            Done
          </span>
        )}
      </button>

      {/* Expandable content */}
      {isExpanded && (
        <div className="px-3 py-2 border-t border-vscode-border">
          {hasInput ? (
            <div>
              <div className="text-xs opacity-50 mb-1 font-semibold">Input</div>
              <pre className="text-xs font-mono overflow-x-auto p-2 rounded bg-[var(--vscode-editor-background)] whitespace-pre-wrap break-all">
                {formatToolInput(input)}
              </pre>
            </div>
          ) : (
            <div className="text-xs opacity-40 italic">No input</div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Helpers
// ============================================================================

function formatToolInput(input: Record<string, unknown>): string {
  try {
    return JSON.stringify(input, null, 2);
  } catch {
    return String(input);
  }
}

function ToolIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="opacity-60"
    >
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
    </svg>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/harshagarwal/Documents/workspace/openclaude-vscode
git add webview/src/components/chat/ToolCallBlock.tsx
git commit -m "feat: add ToolCallBlock with collapsible input display"
```

---

## Task 11: UserMessage Component

**Files:**
- Create: `webview/src/components/chat/UserMessage.tsx`

- [ ] **Step 1: Create webview/src/components/chat/UserMessage.tsx**

```tsx
import type { ChatMessage } from '../../types/chat';

interface UserMessageProps {
  message: ChatMessage;
}

export function UserMessage({ message }: UserMessageProps) {
  return (
    <div className="flex justify-end px-4 py-2">
      <div className="max-w-[85%]">
        {/* User label */}
        <div className="flex items-center justify-end gap-2 mb-1">
          <span className="text-xs opacity-50">You</span>
        </div>

        {/* Message bubble */}
        <div
          className="rounded-lg px-3 py-2 text-sm leading-relaxed
            bg-vscode-button-bg text-vscode-button-fg"
        >
          <p className="whitespace-pre-wrap break-words m-0">
            {message.text || ''}
          </p>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/harshagarwal/Documents/workspace/openclaude-vscode
git add webview/src/components/chat/UserMessage.tsx
git commit -m "feat: add UserMessage component with styled bubble"
```

---

## Task 12: AssistantMessage Component

**Files:**
- Create: `webview/src/components/chat/AssistantMessage.tsx`

This is the most complex message component. It iterates over the assistant's content blocks and renders each one with the appropriate renderer: `MarkdownRenderer` for text, `ToolCallBlock` for tool_use, collapsible section for thinking blocks.

- [ ] **Step 1: Create webview/src/components/chat/AssistantMessage.tsx**

```tsx
import { useState } from 'react';
import type { ChatMessage, RenderableBlock } from '../../types/chat';
import type { TextBlock, ThinkingBlock, ToolUseBlock, ServerToolUseBlock } from '../../types/messages';
import { MarkdownRenderer } from '../shared/MarkdownRenderer';
import { ToolCallBlock } from './ToolCallBlock';

interface AssistantMessageProps {
  message: ChatMessage;
}

export function AssistantMessage({ message }: AssistantMessageProps) {
  const blocks = message.blocks || [];

  return (
    <div className="px-4 py-2">
      {/* Assistant label */}
      <div className="flex items-center gap-2 mb-1">
        <AssistantIcon />
        <span className="text-xs font-medium opacity-70">Assistant</span>
        {message.model && (
          <span className="text-xs opacity-40">{message.model}</span>
        )}
      </div>

      {/* Content blocks */}
      <div className="pl-0">
        {blocks.map((renderableBlock) => (
          <BlockRenderer
            key={renderableBlock.index}
            renderableBlock={renderableBlock}
            isMessageStreaming={message.isStreaming}
          />
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// Block Renderer — dispatches to the right renderer per block type
// ============================================================================

interface BlockRendererProps {
  renderableBlock: RenderableBlock;
  isMessageStreaming: boolean;
}

function BlockRenderer({ renderableBlock, isMessageStreaming }: BlockRendererProps) {
  const { block, isStreaming } = renderableBlock;

  switch (block.type) {
    case 'text':
      return (
        <MarkdownRenderer
          content={(block as TextBlock).text}
          isStreaming={isStreaming}
        />
      );

    case 'thinking':
      return (
        <ThinkingBlockDisplay
          thinking={(block as ThinkingBlock).thinking}
          isStreaming={isStreaming}
        />
      );

    case 'redacted_thinking':
      return (
        <div className="my-2 text-xs opacity-40 italic px-3 py-1.5 rounded border border-vscode-border">
          Thinking...
        </div>
      );

    case 'tool_use':
    case 'server_tool_use':
      return (
        <ToolCallBlock
          block={block as ToolUseBlock | ServerToolUseBlock}
          isStreaming={isStreaming}
        />
      );

    case 'image':
      return (
        <div className="my-2">
          <img
            src={`data:${block.source.media_type};base64,${block.source.data}`}
            alt="Generated image"
            className="max-w-full rounded border border-vscode-border"
          />
        </div>
      );

    default:
      // Unknown block type — show raw JSON as fallback
      return (
        <div className="my-2 text-xs font-mono opacity-40 px-3 py-1.5 rounded border border-vscode-border overflow-x-auto">
          <pre>{JSON.stringify(block, null, 2)}</pre>
        </div>
      );
  }
}

// ============================================================================
// Thinking Block — Collapsible
// ============================================================================

interface ThinkingBlockDisplayProps {
  thinking: string;
  isStreaming: boolean;
}

function ThinkingBlockDisplay({ thinking, isStreaming }: ThinkingBlockDisplayProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!thinking && !isStreaming) return null;

  // Show a short summary (first 100 chars) when collapsed
  const summary = thinking.length > 100
    ? thinking.slice(0, 100) + '...'
    : thinking;

  return (
    <div className="my-2 rounded-md border border-vscode-border overflow-hidden opacity-70">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-2 w-full px-3 py-1.5 text-left text-xs
          bg-[var(--vscode-editorGroupHeader-tabsBackground)]
          hover:bg-[var(--vscode-list-hoverBackground)]
          transition-colors"
      >
        <svg
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className={`transition-transform ${isExpanded ? 'rotate-90' : ''}`}
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>
        <span className="font-medium">Thinking</span>
        {isStreaming && (
          <span className="ml-1 inline-block w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse" />
        )}
        {!isExpanded && (
          <span className="ml-2 opacity-50 truncate">{summary}</span>
        )}
      </button>

      {isExpanded && (
        <div className="px-3 py-2 border-t border-vscode-border text-xs font-mono whitespace-pre-wrap leading-relaxed max-h-64 overflow-y-auto">
          {thinking}
          {isStreaming && (
            <span className="inline-block w-1.5 h-3 bg-vscode-fg animate-pulse ml-0.5" />
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Icons
// ============================================================================

function AssistantIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      className="opacity-60"
    >
      <path d="M12 2a7 7 0 0 1 7 7v1a7 7 0 0 1-14 0V9a7 7 0 0 1 7-7z" />
      <path d="M5.4 17.3A9 9 0 0 0 12 20a9 9 0 0 0 6.6-2.7" />
      <circle cx="9" cy="10" r="1" fill="currentColor" />
      <circle cx="15" cy="10" r="1" fill="currentColor" />
    </svg>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/harshagarwal/Documents/workspace/openclaude-vscode
git add webview/src/components/chat/AssistantMessage.tsx
git commit -m "feat: add AssistantMessage with block renderer for text, thinking, tools, images"
```

---

## Task 13: MessageList Component

**Files:**
- Create: `webview/src/components/chat/MessageList.tsx`

The scrollable container that renders messages and wires up auto-scroll.

- [ ] **Step 1: Create webview/src/components/chat/MessageList.tsx**

```tsx
import { useEffect } from 'react';
import type { ChatMessage } from '../../types/chat';
import { useAutoScroll } from '../../hooks/useAutoScroll';
import { UserMessage } from './UserMessage';
import { AssistantMessage } from './AssistantMessage';
import { StreamingIndicator } from './StreamingIndicator';

interface MessageListProps {
  messages: ChatMessage[];
  isStreaming: boolean;
}

export function MessageList({ messages, isStreaming }: MessageListProps) {
  const { containerRef, userScrolledUp, autoScroll, scrollToBottom } = useAutoScroll();

  // Auto-scroll when messages change or streaming content updates
  useEffect(() => {
    autoScroll();
  }, [messages, isStreaming, autoScroll]);

  if (messages.length === 0) {
    return (
      <div
        ref={containerRef}
        className="flex-1 flex items-center justify-center overflow-y-auto"
      >
        <EmptyState />
      </div>
    );
  }

  return (
    <div className="flex-1 relative">
      <div
        ref={containerRef}
        className="absolute inset-0 overflow-y-auto"
      >
        {/* Message list */}
        <div className="py-4">
          {messages.map((msg) => (
            <div key={msg.id}>
              {msg.role === 'user' ? (
                <UserMessage message={msg} />
              ) : (
                <AssistantMessage message={msg} />
              )}
            </div>
          ))}

          {/* Streaming indicator — shown when waiting for first content block */}
          <StreamingIndicator
            visible={isStreaming && !hasStreamingBlocks(messages)}
          />
        </div>
      </div>

      {/* Scroll-to-bottom button when user has scrolled up */}
      {userScrolledUp && (
        <button
          onClick={() => scrollToBottom('smooth')}
          className="absolute bottom-4 right-4 z-10
            flex items-center gap-1.5 px-3 py-1.5 rounded-full
            bg-vscode-button-bg text-vscode-button-fg text-xs
            shadow-lg hover:bg-vscode-button-hover transition-colors"
          title="Scroll to bottom"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="6 9 12 15 18 9" />
          </svg>
          New content
        </button>
      )}
    </div>
  );
}

// ============================================================================
// Helpers
// ============================================================================

/** Check if the last message has any streaming blocks (meaning content is arriving) */
function hasStreamingBlocks(messages: ChatMessage[]): boolean {
  const last = messages[messages.length - 1];
  if (!last || last.role !== 'assistant') return false;
  return (last.blocks?.length ?? 0) > 0;
}

function EmptyState() {
  return (
    <div className="text-center opacity-40 px-8">
      <div className="text-3xl mb-3">{"{ }"}</div>
      <p className="text-sm font-medium mb-1">No messages yet</p>
      <p className="text-xs">Type a message below to start a conversation.</p>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/harshagarwal/Documents/workspace/openclaude-vscode
git add webview/src/components/chat/MessageList.tsx
git commit -m "feat: add MessageList with auto-scroll, scroll-to-bottom button, empty state"
```

---

## Task 14: ChatHeader Component

**Files:**
- Create: `webview/src/components/chat/ChatHeader.tsx`

- [ ] **Step 1: Create webview/src/components/chat/ChatHeader.tsx**

```tsx
import { vscode } from '../../vscode';

interface ChatHeaderProps {
  sessionTitle: string | null;
  model: string | null;
}

export function ChatHeader({ sessionTitle, model }: ChatHeaderProps) {
  const handleNewConversation = () => {
    vscode.postMessage({ type: 'newConversation' });
  };

  const handleOpenSessionList = () => {
    vscode.postMessage({ type: 'openSessionList' });
  };

  return (
    <div className="flex items-center justify-between px-4 py-2 border-b border-vscode-border shrink-0">
      {/* Left: session title */}
      <div className="flex items-center gap-2 min-w-0">
        <h1 className="text-sm font-semibold truncate">
          {sessionTitle || 'OpenClaude'}
        </h1>
        {model && (
          <span className="text-xs opacity-40 shrink-0">{model}</span>
        )}
      </div>

      {/* Right: action buttons */}
      <div className="flex items-center gap-1 shrink-0">
        {/* Past conversations */}
        <button
          onClick={handleOpenSessionList}
          className="p-1.5 rounded hover:bg-[var(--vscode-toolbar-hoverBackground)] transition-colors"
          title="Past conversations"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 8v4l3 3" />
            <circle cx="12" cy="12" r="10" />
          </svg>
        </button>

        {/* New conversation */}
        <button
          onClick={handleNewConversation}
          className="p-1.5 rounded hover:bg-[var(--vscode-toolbar-hoverBackground)] transition-colors"
          title="New conversation"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/harshagarwal/Documents/workspace/openclaude-vscode
git add webview/src/components/chat/ChatHeader.tsx
git commit -m "feat: add ChatHeader with session title, model badge, new conversation button"
```

---

## Task 15: ChatPanel Root Component

**Files:**
- Create: `webview/src/components/chat/ChatPanel.tsx`
- Modify: `webview/src/App.tsx`

This is the root component that composes everything together.

- [ ] **Step 1: Create webview/src/components/chat/ChatPanel.tsx**

```tsx
import { useChat } from '../../hooks/useChat';
import { ChatHeader } from './ChatHeader';
import { MessageList } from './MessageList';
import { CostDisplay } from '../shared/CostDisplay';

export function ChatPanel() {
  const {
    messages,
    sessionTitle,
    cost,
    isStreaming,
    model,
    error,
    sendMessage,
    interrupt,
  } = useChat();

  return (
    <div className="flex flex-col h-screen bg-vscode-bg text-vscode-fg">
      {/* Header */}
      <ChatHeader sessionTitle={sessionTitle} model={model} />

      {/* Message list */}
      <MessageList messages={messages} isStreaming={isStreaming} />

      {/* Error banner */}
      {error && (
        <div className="px-4 py-2 bg-[var(--vscode-inputValidation-errorBackground)] text-[var(--vscode-inputValidation-errorForeground)] text-xs border-t border-[var(--vscode-inputValidation-errorBorder)]">
          <span className="font-semibold">Error: </span>
          {error}
        </div>
      )}

      {/* Input placeholder (full input component comes in Story 5) */}
      <div className="px-4 py-3 border-t border-vscode-border shrink-0">
        <InputPlaceholder
          isStreaming={isStreaming}
          onSend={sendMessage}
          onInterrupt={interrupt}
        />

        {/* Cost display */}
        <CostDisplay cost={cost} className="mt-2 px-1" />
      </div>
    </div>
  );
}

// ============================================================================
// Temporary input placeholder (replaced in Story 5 by full PromptInput)
// ============================================================================

interface InputPlaceholderProps {
  isStreaming: boolean;
  onSend: (text: string) => void;
  onInterrupt: () => void;
}

function InputPlaceholder({ isStreaming, onSend, onInterrupt }: InputPlaceholderProps) {
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const text = e.currentTarget.value.trim();
      if (text) {
        onSend(text);
        e.currentTarget.value = '';
      }
    }
  };

  return (
    <div className="relative">
      <textarea
        placeholder={isStreaming ? 'Generating...' : 'Type a message... (Enter to send, Shift+Enter for newline)'}
        disabled={isStreaming}
        onKeyDown={handleKeyDown}
        rows={1}
        className="w-full resize-none rounded-md border border-vscode-input-border
          bg-vscode-input-bg text-vscode-input-fg px-3 py-2 text-sm
          outline-none focus:border-[var(--vscode-focusBorder)]
          disabled:opacity-50 disabled:cursor-not-allowed"
      />
      {isStreaming && (
        <button
          onClick={onInterrupt}
          className="absolute right-2 top-1/2 -translate-y-1/2
            px-2 py-1 rounded text-xs
            bg-[var(--vscode-inputValidation-errorBackground)]
            text-[var(--vscode-inputValidation-errorForeground)]
            hover:opacity-80 transition-opacity"
          title="Stop generation"
        >
          Stop
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Update webview/src/App.tsx to render ChatPanel**

Replace the placeholder App component with:

```tsx
import { ChatPanel } from './components/chat/ChatPanel';

function App() {
  return <ChatPanel />;
}

export default App;
```

- [ ] **Step 3: Commit**

```bash
cd /Users/harshagarwal/Documents/workspace/openclaude-vscode
git add webview/src/components/chat/ChatPanel.tsx webview/src/App.tsx
git commit -m "feat: add ChatPanel root component, wire up App.tsx to render chat UI"
```

---

## Task 16: Session Title Update from System Init

**Files:**
- Modify: `webview/src/hooks/useChat.ts`

The CLI sends an `ai-title` event (or the extension host relays the session title via a postMessage of type `sessionTitle`). This was already handled in the `useChat` hook in Task 4 — the `sessionTitle` postMessage handler updates `setSessionTitle`.

This task ensures the extension host side (Story 3) knows to forward the title. We add handling for the `system.init` message to capture model name as a default title.

- [ ] **Step 1: Verify session title handling is wired up in useChat**

The useChat hook from Task 4 already handles:
1. `system.init` → sets `model` and `sessionId`
2. `{ type: 'sessionTitle', title: '...' }` → sets `sessionTitle`

No code changes needed here. The extension host (Story 3 bridge) must forward these.

Add a comment to `useChat.ts` documenting the expected postMessage types:

```typescript
// At the top of the useEffect message handler, add this comment:
/**
 * Expected postMessage types from extension host:
 *
 * CLI messages (forwarded directly or wrapped in { type: 'cliMessage', message: ... }):
 * - stream_event: Streaming content deltas
 * - user: Echoed user message
 * - assistant: Complete assistant message (from history replay)
 * - result: Turn completion with cost/usage
 * - system (subtype: init): Session initialization
 *
 * Extension host messages:
 * - { type: 'sessionTitle', title: string }: AI-generated session title
 * - { type: 'clearMessages' }: New conversation started
 */
```

- [ ] **Step 2: Commit**

```bash
cd /Users/harshagarwal/Documents/workspace/openclaude-vscode
git add webview/src/hooks/useChat.ts
git commit -m "docs: document expected postMessage types in useChat hook"
```

---

## Task 17: Build Verification

- [ ] **Step 1: Verify TypeScript compilation**

Run: `cd /Users/harshagarwal/Documents/workspace/openclaude-vscode/webview && npx tsc --noEmit`

Expected: No type errors. If there are errors, fix them before proceeding.

- [ ] **Step 2: Verify Vite build**

Run: `cd /Users/harshagarwal/Documents/workspace/openclaude-vscode/webview && npx vite build`

Expected: Build succeeds, output in `../dist/webview/`. Check that `index.js` and `index.css` are produced and include the highlight.js theme CSS.

- [ ] **Step 3: Verify full build (extension + webview)**

Run: `cd /Users/harshagarwal/Documents/workspace/openclaude-vscode && npm run build`

Expected: Both esbuild (extension host) and vite (webview) build successfully.

- [ ] **Step 4: Verify no unused imports or dead code**

Run: `cd /Users/harshagarwal/Documents/workspace/openclaude-vscode && npm run lint`

Expected: No errors (warnings OK). Fix any errors before proceeding.

- [ ] **Step 5: Package as .vsix**

Run: `cd /Users/harshagarwal/Documents/workspace/openclaude-vscode && npx @vscode/vsce package --no-dependencies --allow-missing-repository`

Expected: Produces `openclaude-vscode-0.1.0.vsix`

- [ ] **Step 6: Commit any build fixes**

```bash
cd /Users/harshagarwal/Documents/workspace/openclaude-vscode
git add -A
git commit -m "fix: resolve build errors from Story 4 integration"
```

---

## Task 18: Manual Testing in Extension Development Host

- [ ] **Step 1: Launch Extension Development Host**

Press F5 in VS Code (or run the "Run Extension" launch config).

Verify:
- Extension activates without errors in the Extension Development Host
- OpenClaude sidebar loads and shows the chat UI (empty state)
- "No messages yet" placeholder is visible

- [ ] **Step 2: Test with mock messages (optional — if CLI not connected)**

Open the webview developer tools (Cmd+Shift+I in the Extension Development Host webview) and paste:

```javascript
// Simulate a user message
window.postMessage({ type: 'user', message: { role: 'user', content: 'Hello, how are you?' }, uuid: 'test-user-1' }, '*');

// Simulate stream_event: message_start
window.postMessage({ type: 'stream_event', event: { type: 'message_start', message: { id: 'msg-1', type: 'message', role: 'assistant', content: [], model: 'claude-sonnet-4-20250514', stop_reason: null, usage: { input_tokens: 10, output_tokens: 0 } } }, parent_tool_use_id: null, uuid: 'test-assist-1', session_id: 'sess-1' }, '*');

// Simulate stream_event: content_block_start (text)
window.postMessage({ type: 'stream_event', event: { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }, parent_tool_use_id: null, uuid: 'test-assist-1', session_id: 'sess-1' }, '*');

// Simulate stream_event: content_block_delta (text)
window.postMessage({ type: 'stream_event', event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Hello! I am doing great. Here is some **bold** text and `inline code`.\n\n```python\ndef hello():\n    print("Hello, world!")\n```' } }, parent_tool_use_id: null, uuid: 'test-assist-1', session_id: 'sess-1' }, '*');

// Simulate stream_event: content_block_stop
window.postMessage({ type: 'stream_event', event: { type: 'content_block_stop', index: 0 }, parent_tool_use_id: null, uuid: 'test-assist-1', session_id: 'sess-1' }, '*');

// Simulate stream_event: message_stop
window.postMessage({ type: 'stream_event', event: { type: 'message_stop' }, parent_tool_use_id: null, uuid: 'test-assist-1', session_id: 'sess-1' }, '*');
```

Verify:
- User message appears as a bubble on the right side
- Assistant message appears on the left with "Assistant" label
- Markdown renders: **bold** text, `inline code`
- Code block shows with Python syntax highlighting, language label "python", copy button
- Copy button works (copies code to clipboard)
- No console errors

- [ ] **Step 3: Test tool call rendering**

```javascript
// Simulate stream_event: content_block_start (tool_use)
window.postMessage({ type: 'stream_event', event: { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 'tool-1', name: 'Read', input: {} } }, parent_tool_use_id: null, uuid: 'test-tool-1', session_id: 'sess-1' }, '*');

// Simulate stream_event: content_block_delta (input_json_delta)
window.postMessage({ type: 'stream_event', event: { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '{"file_path": "/src/app.ts"}' } }, parent_tool_use_id: null, uuid: 'test-tool-1', session_id: 'sess-1' }, '*');

// Simulate stream_event: content_block_stop
window.postMessage({ type: 'stream_event', event: { type: 'content_block_stop', index: 0 }, parent_tool_use_id: null, uuid: 'test-tool-1', session_id: 'sess-1' }, '*');
```

Verify:
- Tool call block appears with "Read" tool name
- Click to expand shows `{"file_path": "/src/app.ts"}`
- Collapsible works (expand/collapse)

- [ ] **Step 4: Test auto-scroll behavior**

Send many messages (use the mock approach above in a loop) to fill the viewport. Then:
- Verify: auto-scroll keeps you at the bottom during streaming
- Scroll up manually → "New content" button appears
- Click "New content" → scrolls to bottom, button disappears
- Scroll back to bottom → auto-scroll resumes

- [ ] **Step 5: Commit final verification**

```bash
cd /Users/harshagarwal/Documents/workspace/openclaude-vscode
git add -A
git commit -m "chore: Story 4 complete — chat UI with streaming, markdown, code blocks, tool calls"
```

---

## Summary

| Task | What it does | Key files |
|---|---|---|
| 1 | Install react-markdown, rehype-highlight, highlight.js | `webview/package.json` |
| 2 | TypeScript types for SDK messages + chat state | `webview/src/types/messages.ts`, `webview/src/types/chat.ts` |
| 3 | useStream hook — parse stream_event into renderable blocks | `webview/src/hooks/useStream.ts` |
| 4 | useChat hook — message state, postMessage bridge | `webview/src/hooks/useChat.ts` |
| 5 | useAutoScroll hook — auto-scroll with manual pause | `webview/src/hooks/useAutoScroll.ts` |
| 6 | CodeBlock — syntax highlighting, copy button, language label | `webview/src/components/shared/CodeBlock.tsx` |
| 7 | MarkdownRenderer — react-markdown + remark-gfm + rehype-highlight | `webview/src/components/shared/MarkdownRenderer.tsx` |
| 8 | CostDisplay — token count, cost, turns, duration | `webview/src/components/shared/CostDisplay.tsx` |
| 9 | StreamingIndicator — animated bouncing dots | `webview/src/components/chat/StreamingIndicator.tsx` |
| 10 | ToolCallBlock — collapsible tool invocation display | `webview/src/components/chat/ToolCallBlock.tsx` |
| 11 | UserMessage — styled user bubble | `webview/src/components/chat/UserMessage.tsx` |
| 12 | AssistantMessage — block renderer for text, thinking, tools | `webview/src/components/chat/AssistantMessage.tsx` |
| 13 | MessageList — scrollable list with auto-scroll + empty state | `webview/src/components/chat/MessageList.tsx` |
| 14 | ChatHeader — session title, model badge, action buttons | `webview/src/components/chat/ChatHeader.tsx` |
| 15 | ChatPanel — root component wiring everything together | `webview/src/components/chat/ChatPanel.tsx` |
| 16 | Session title update — document postMessage contract | `webview/src/hooks/useChat.ts` |
| 17 | Build verification — tsc, vite, lint, package | Build output |
| 18 | Manual testing — mock postMessage testing in dev host | Manual verification |
