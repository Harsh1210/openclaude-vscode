/**
 * Chat-specific types used by the UI components and hooks.
 */

import type { ContentBlock } from './messages';

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
