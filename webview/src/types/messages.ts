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
