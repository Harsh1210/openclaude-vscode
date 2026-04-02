// src/types/protocol.ts
// Control protocol types — initialize handshake, control request/response
// envelopes, and all control_request subtypes the extension sends TO the CLI.

import type {
  AccountInfo,
  AgentDefinition,
  AgentInfo,
  FastModeState,
  HookCallbackMatcher,
  HookEvent,
  McpServerConfigForProcessTransport,
  McpServerStatus,
  ModelInfo,
  PermissionMode,
  SlashCommand,
} from './session';

// ============================================================================
// Initialize Handshake
// ============================================================================

/** Sent by extension to CLI immediately after spawn */
export interface InitializeRequest {
  subtype: 'initialize';
  hooks?: Record<string, HookCallbackMatcher[]>;
  sdkMcpServers?: string[];
  jsonSchema?: Record<string, unknown>;
  systemPrompt?: string;
  appendSystemPrompt?: string;
  agents?: Record<string, AgentDefinition>;
  promptSuggestions?: boolean;
  agentProgressSummaries?: boolean;
}

/** Returned by CLI in control_response after initialize */
export interface InitializeResponse {
  commands: SlashCommand[];
  agents: AgentInfo[];
  output_style: string;
  available_output_styles: string[];
  models: ModelInfo[];
  account: AccountInfo;
  pid?: number;
  fast_mode_state?: FastModeState;
}

// ============================================================================
// Control Request Subtypes (Extension → CLI)
// ============================================================================

export interface InterruptRequest {
  subtype: 'interrupt';
}

export interface SetPermissionModeRequest {
  subtype: 'set_permission_mode';
  mode: PermissionMode;
  ultraplan?: boolean;
}

export interface SetModelRequest {
  subtype: 'set_model';
  model?: string;
}

export interface SetMaxThinkingTokensRequest {
  subtype: 'set_max_thinking_tokens';
  max_thinking_tokens: number | null;
}

export interface McpStatusRequest {
  subtype: 'mcp_status';
}

export interface McpStatusResponse {
  mcpServers: McpServerStatus[];
}

export interface GetContextUsageRequest {
  subtype: 'get_context_usage';
}

export interface GetContextUsageResponse {
  categories: Array<{
    name: string;
    tokens: number;
    color: string;
    isDeferred?: boolean;
  }>;
  totalTokens: number;
  maxTokens: number;
  rawMaxTokens: number;
  percentage: number;
  gridRows: Array<
    Array<{
      color: string;
      isFilled: boolean;
      categoryName: string;
      tokens: number;
      percentage: number;
      squareFullness: number;
    }>
  >;
  model: string;
  memoryFiles: Array<{ path: string; type: string; tokens: number }>;
  mcpTools: Array<{
    name: string;
    serverName: string;
    tokens: number;
    isLoaded?: boolean;
  }>;
  deferredBuiltinTools?: Array<{
    name: string;
    tokens: number;
    isLoaded: boolean;
  }>;
  systemTools?: Array<{ name: string; tokens: number }>;
  systemPromptSections?: Array<{ name: string; tokens: number }>;
  agents: Array<{ agentType: string; source: string; tokens: number }>;
  slashCommands?: {
    totalCommands: number;
    includedCommands: number;
    tokens: number;
  };
  skills?: {
    totalSkills: number;
    includedSkills: number;
    tokens: number;
    skillFrontmatter: Array<{
      name: string;
      source: string;
      tokens: number;
    }>;
  };
  autoCompactThreshold?: number;
  isAutoCompactEnabled: boolean;
  messageBreakdown?: {
    toolCallTokens: number;
    toolResultTokens: number;
    attachmentTokens: number;
    assistantMessageTokens: number;
    userMessageTokens: number;
    toolCallsByType: Array<{
      name: string;
      callTokens: number;
      resultTokens: number;
    }>;
    attachmentsByType: Array<{ name: string; tokens: number }>;
  };
  apiUsage: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens: number;
    cache_read_input_tokens: number;
  } | null;
}

export interface RewindFilesRequest {
  subtype: 'rewind_files';
  user_message_id: string;
  dry_run?: boolean;
}

export interface RewindFilesResponse {
  canRewind: boolean;
  error?: string;
  filesChanged?: string[];
  insertions?: number;
  deletions?: number;
}

export interface CancelAsyncMessageRequest {
  subtype: 'cancel_async_message';
  message_uuid: string;
}

export interface CancelAsyncMessageResponse {
  cancelled: boolean;
}

export interface SeedReadStateRequest {
  subtype: 'seed_read_state';
  path: string;
  mtime: number;
}

export interface McpSetServersRequest {
  subtype: 'mcp_set_servers';
  servers: Record<string, McpServerConfigForProcessTransport>;
}

export interface McpSetServersResponse {
  added: string[];
  removed: string[];
  errors: Record<string, string>;
}

export interface ReloadPluginsRequest {
  subtype: 'reload_plugins';
}

export interface ReloadPluginsResponse {
  commands: SlashCommand[];
  agents: AgentInfo[];
  plugins: Array<{ name: string; path: string; source?: string }>;
  mcpServers: McpServerStatus[];
  error_count: number;
}

export interface McpReconnectRequest {
  subtype: 'mcp_reconnect';
  serverName: string;
}

export interface McpToggleRequest {
  subtype: 'mcp_toggle';
  serverName: string;
  enabled: boolean;
}

export interface StopTaskRequest {
  subtype: 'stop_task';
  task_id: string;
}

export interface ApplyFlagSettingsRequest {
  subtype: 'apply_flag_settings';
  settings: Record<string, unknown>;
}

export interface GetSettingsRequest {
  subtype: 'get_settings';
}

export interface GetSettingsResponse {
  effective: Record<string, unknown>;
  sources: Array<{
    source:
      | 'userSettings'
      | 'projectSettings'
      | 'localSettings'
      | 'flagSettings'
      | 'policySettings';
    settings: Record<string, unknown>;
  }>;
  applied?: {
    model: string;
    effort: 'low' | 'medium' | 'high' | 'max' | null;
  };
}

export interface ElicitationResponse {
  action: 'accept' | 'decline' | 'cancel';
  content?: Record<string, unknown>;
}

/** Union of all control_request inner types the extension can send */
export type ExtensionControlRequestInner =
  | InitializeRequest
  | InterruptRequest
  | SetPermissionModeRequest
  | SetModelRequest
  | SetMaxThinkingTokensRequest
  | McpStatusRequest
  | GetContextUsageRequest
  | RewindFilesRequest
  | CancelAsyncMessageRequest
  | SeedReadStateRequest
  | McpSetServersRequest
  | ReloadPluginsRequest
  | McpReconnectRequest
  | McpToggleRequest
  | StopTaskRequest
  | ApplyFlagSettingsRequest
  | GetSettingsRequest;

// ============================================================================
// Control Request/Response Envelopes
// ============================================================================

/** Envelope for sending a control_request on stdin */
export interface ControlRequestEnvelope {
  type: 'control_request';
  request_id: string;
  request: ExtensionControlRequestInner;
}

/** Success response envelope */
export interface ControlResponseSuccessEnvelope {
  type: 'control_response';
  response: {
    subtype: 'success';
    request_id: string;
    response?: Record<string, unknown>;
  };
}

/** Error response envelope */
export interface ControlResponseErrorEnvelope {
  type: 'control_response';
  response: {
    subtype: 'error';
    request_id: string;
    error: string;
  };
}

export type ControlResponseEnvelope =
  | ControlResponseSuccessEnvelope
  | ControlResponseErrorEnvelope;
