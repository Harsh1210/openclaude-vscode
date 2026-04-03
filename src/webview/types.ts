/**
 * PostMessage types for webview <-> extension host communication.
 *
 * Pattern extracted from Claude Code extension.js (DQ class):
 * - Webview sends messages via vscode.postMessage({ type: '...', ...payload })
 * - Extension host receives via webview.onDidReceiveMessage
 * - Extension host sends via webview.postMessage({ type: '...', ...payload })
 * - Webview receives via window.addEventListener('message', ...)
 */

// ============================================================
// Webview -> Extension Host messages
// ============================================================

/** Webview signals it has loaded and is ready to receive data */
export interface ReadyMessage {
  type: 'ready';
}

/** User submits a chat prompt */
export interface SendPromptMessage {
  type: 'send_prompt';
  text: string;
  attachments?: Attachment[];
  mentions?: Mention[];
}

/** User wants to interrupt/cancel current generation */
export interface InterruptMessage {
  type: 'interrupt';
}

/** User responds to a permission request */
export interface PermissionResponseMessage {
  type: 'permission_response';
  requestId: string;
  allowed: boolean;
  alwaysAllow?: boolean;
}

/** User responds to an elicitation request */
export interface ElicitationResponseMessage {
  type: 'elicitation_response';
  requestId: string;
  response: Record<string, unknown>;
}

/** User wants to start a new conversation */
export interface NewConversationMessage {
  type: 'new_conversation';
}

/** User wants to resume a session */
export interface ResumeSessionMessage {
  type: 'resume_session';
  sessionId: string;
}

/** User changes the AI model */
export interface SetModelMessage {
  type: 'set_model';
  model: string;
}

/** User changes permission mode */
export interface SetPermissionModeMessage {
  type: 'set_permission_mode';
  mode: 'default' | 'plan' | 'acceptEdits' | 'bypassPermissions' | 'dontAsk';
}

/** User requests context usage info */
export interface GetContextUsageMessage {
  type: 'get_context_usage';
}

/** User copies text to clipboard */
export interface CopyToClipboardMessage {
  type: 'copy_to_clipboard';
  text: string;
}

/** User clicks a file reference to open in editor */
export interface OpenFileMessage {
  type: 'open_file';
  filePath: string;
  line?: number;
  column?: number;
}

/** User accepts/rejects a proposed diff */
export interface DiffResponseMessage {
  type: 'diff_response';
  accepted: boolean;
  filePath: string;
}

/** User requests to open plugins dialog */
export interface OpenPluginsMessage {
  type: 'open_plugins';
  pluginName?: string;
  marketplace?: string;
}

/** User requests logout */
export interface LogoutMessage {
  type: 'logout';
}

/** User requests session list */
export interface GetSessionsMessage {
  type: 'get_sessions';
}

/** User wants to delete a session */
export interface DeleteSessionMessage {
  type: 'delete_session';
  sessionId: string;
}

/** Webview notifies extension of a session title update (from ai-title) */
export interface UpdateSessionTitleMessage {
  type: 'update_session_title';
  sessionId: string;
  title: string;
}

/** Webview requests state restore after re-show */
export interface RestoreStateMessage {
  type: 'restore_state';
}

/** User executes a slash command */
export interface SlashCommandMessage {
  type: 'slash_command';
  command: string;
  args?: string;
}

/** User changes effort level */
export interface SetEffortLevelMessage {
  type: 'set_effort_level';
  level: 'low' | 'medium' | 'high' | 'max';
}

/** User requests rewind to a checkpoint */
export interface RewindMessage {
  type: 'rewind';
  messageId: string;
  dryRun?: boolean;
}

/** User types @ in input — request file search results */
export interface AtMentionQueryMessage {
  type: 'at_mention_query';
  query: string;
}

/** User clicks paperclip — request file picker dialog */
export interface FilePickerRequestMessage {
  type: 'file_picker_request';
  accept?: string[];
}

/** User clicks + button — add text/URL content */
export interface AddContentMessage {
  type: 'add_content';
  contentType: 'text' | 'url';
  content: string;
}

/** User drops files onto input area */
export interface FileDropMessage {
  type: 'file_drop';
  files: Array<{ name: string; path: string; type: string }>;
}

/** Webview → Host: request rewind to a checkpoint (Story 10) */
export interface RewindRequestMessage {
  type: 'rewind';
  messageUuid: string;
  dryRun: boolean;
}

/** Webview → Host: request fork from a checkpoint (Story 10) */
export interface ForkRequestMessage {
  type: 'fork_session';
  messageUuid: string;
}

/** Webview → Host: request fork + rewind from a checkpoint (Story 10) */
export interface ForkAndRewindRequestMessage {
  type: 'fork_and_rewind';
  messageUuid: string;
}

/** Webview → Host: request current provider state (Story 11) */
export interface GetProviderStateMessage {
  type: 'get_provider_state';
}

/** Webview → Host: set provider configuration (Story 11) */
export interface SetProviderMessage {
  type: 'set_provider';
  providerId: string;
  apiKey?: string;
  baseUrl?: string;
  model?: string;
}

// MCP manager messages
export interface McpRefreshStatusMessage { type: 'mcp_refresh_status'; }
export interface McpReconnectMessage { type: 'mcp_reconnect'; serverName: string; }
export interface McpToggleMessage { type: 'mcp_toggle'; serverName: string; enabled: boolean; }
export interface McpAddServerMessage { type: 'mcp_add_server'; name: string; config: Record<string, unknown>; }
export interface McpRemoveServerMessage { type: 'mcp_remove_server'; serverName: string; }

// Plugin manager messages
export interface PluginRefreshMessage { type: 'plugin_refresh'; }
export interface PluginToggleMessage { type: 'plugin_toggle'; name: string; enabled: boolean; }
export interface PluginInstallMessage { type: 'plugin_install'; name: string; scope: 'user' | 'project' | 'local'; }
export interface PluginUninstallMessage { type: 'plugin_uninstall'; name: string; }
export interface PluginBrowseMarketplaceMessage { type: 'plugin_browse_marketplace'; }
export interface PluginAddSourceMessage { type: 'plugin_add_source'; url?: string; }

// Onboarding
export interface HideOnboardingMessage { type: 'hide_onboarding'; }
export interface OpenWalkthroughMessage { type: 'open_walkthrough'; }

// Connection
export interface RetryConnectionMessage { type: 'retry_connection'; }

// Clipboard
export interface CopyMessageMessage { type: 'copy_message'; content: string; }

// Elicitation (alternate shape with `values` instead of `response`)
export interface ElicitationResponseValuesMessage { type: 'elicitation_response'; requestId: string; values: Record<string, unknown>; }
export interface ElicitationCancelMessage { type: 'elicitation_cancel'; requestId: string; }

// Fast mode toggle
export interface ToggleFastModeMessage { type: 'toggle_fast_mode'; enabled: boolean; }

// Plan review
export interface PlanReviewSubmitMessage { type: 'plan_review_submit'; requestId: string; action: Record<string, unknown>; }

// Teleport
export interface TeleportAcceptMessage { type: 'teleport_accept'; remoteSessionId: string; }
export interface TeleportRejectMessage { type: 'teleport_reject'; remoteSessionId: string; }

/** All messages the webview can send to the extension host */
export type WebviewToHostMessage =
  | ReadyMessage
  | SendPromptMessage
  | InterruptMessage
  | PermissionResponseMessage
  | ElicitationResponseMessage
  | ElicitationResponseValuesMessage
  | ElicitationCancelMessage
  | NewConversationMessage
  | ResumeSessionMessage
  | SetModelMessage
  | SetPermissionModeMessage
  | GetContextUsageMessage
  | CopyToClipboardMessage
  | CopyMessageMessage
  | OpenFileMessage
  | DiffResponseMessage
  | OpenPluginsMessage
  | LogoutMessage
  | GetSessionsMessage
  | DeleteSessionMessage
  | UpdateSessionTitleMessage
  | RestoreStateMessage
  | SlashCommandMessage
  | SetEffortLevelMessage
  | RewindMessage
  | RewindRequestMessage
  | ForkRequestMessage
  | ForkAndRewindRequestMessage
  | GetProviderStateMessage
  | SetProviderMessage
  | AtMentionQueryMessage
  | FilePickerRequestMessage
  | AddContentMessage
  | FileDropMessage
  | McpRefreshStatusMessage
  | McpReconnectMessage
  | McpToggleMessage
  | McpAddServerMessage
  | McpRemoveServerMessage
  | PluginRefreshMessage
  | PluginToggleMessage
  | PluginInstallMessage
  | PluginUninstallMessage
  | PluginBrowseMarketplaceMessage
  | PluginAddSourceMessage
  | HideOnboardingMessage
  | OpenWalkthroughMessage
  | RetryConnectionMessage
  | PlanReviewSubmitMessage
  | TeleportAcceptMessage
  | TeleportRejectMessage
  | ToggleFastModeMessage;

// ============================================================
// Extension Host -> Webview messages
// ============================================================

/** Initial state sent to webview after 'ready' */
export interface InitStateMessage {
  type: 'init_state';
  isSidebar: boolean;
  isFullEditor: boolean;
  isSessionListOnly: boolean;
  theme: 'dark' | 'light' | 'high-contrast';
  initialSessionId?: string;
  initialPrompt?: string;
  extensionVersion: string;
}

/** Forwarded CLI stdout message (NDJSON line) */
export interface CliOutputMessage {
  type: 'cli_output';
  data: unknown; // Raw NDJSON message from CLI — webview parses by subtype
}

/** Permission request from CLI → show dialog in webview */
export interface PermissionRequestMessage {
  type: 'permission_request';
  requestId: string;
  toolName: string;
  toolInput: Record<string, unknown>;
  riskLevel?: string;
  title?: string;
  description?: string;
  decisionReason?: string;
  blockedPath?: string;
  permissionSuggestions?: unknown[];
  agentId?: string;
}

/** Cancel a stale permission/elicitation dialog */
export interface CancelRequestMessage {
  type: 'cancel_request';
  requestId: string;
}

/** Elicitation request from CLI → show structured question */
export interface ElicitationRequestMessage {
  type: 'elicitation_request';
  requestId: string;
  question: string;
  responseFormat: unknown;
}

/** Session state changed (for multi-panel badge updates) */
export interface SessionStateMessage {
  type: 'session_state';
  sessions: SessionInfo[];
  activeSessionId?: string;
}

/** Context usage response */
export interface ContextUsageMessage {
  type: 'context_usage';
  utilization: number;
  error?: string;
}

/** Theme changed in VS Code */
export interface ThemeChangedMessage {
  type: 'theme_changed';
  theme: 'dark' | 'light' | 'high-contrast';
}

/** At-mention inserted from editor */
export interface AtMentionInsertedMessage {
  type: 'at_mention_inserted';
  text: string;
}

/** Session list data */
export interface SessionListMessage {
  type: 'session_list';
  sessions: SessionSummary[];
}

/** CLI process state changed */
export interface ProcessStateMessage {
  type: 'process_state';
  state: 'starting' | 'running' | 'stopped' | 'crashed' | 'restarting';
}

/** Font configuration changed */
export interface FontConfigMessage {
  type: 'font_config';
  editorFontFamily: string;
  editorFontSize: number;
  editorFontWeight: string;
  chatFontSize: number;
  chatFontFamily: string;
}

/** @-mention search results from extension host */
export interface AtMentionResultsMessage {
  type: 'at_mention_results';
  query: string;
  results: AtMentionResult[];
}

export interface AtMentionResult {
  type: 'file' | 'folder' | 'line_range' | 'terminal' | 'browser';
  label: string;
  detail: string;
  insertText: string;
  icon: string;
}

/** File picker result (user selected files) */
export interface FilePickerResultMessage {
  type: 'file_picker_result';
  files: Attachment[];
}

/** Active file in editor changed */
export interface ActiveFileChangedMessage {
  type: 'active_file_changed';
  filePath: string | null;
  fileName: string | null;
  languageId: string | null;
}

/** Slash commands available (sent after initialize) */
export interface SlashCommandsAvailableMessage {
  type: 'slash_commands_available';
  commands: Array<{
    name: string;
    description: string;
    argumentHint: string;
  }>;
}

// ============================================================================
// Checkpoint Messages (Story 10)
// ============================================================================

/** Host → Webview: checkpoint state update */
export interface CheckpointStateMessage {
  type: 'checkpoint_state';
  checkpoints: Array<{
    messageUuid: string;
    sessionId: string;
    fileCount: number;
    filenames: string[];
    canRewind: boolean;
    lastSessionState?: string;
  }>;
}

/** Host → Webview: rewind preview result (from dry_run) */
export interface RewindPreviewMessage {
  type: 'rewind_preview';
  messageUuid: string;
  canRewind: boolean;
  error?: string;
  filesChanged?: string[];
  insertions?: number;
  deletions?: number;
}

/** Host → Webview: rewind completed result */
export interface RewindResultMessage {
  type: 'rewind_result';
  messageUuid: string;
  success: boolean;
  error?: string;
  filesChanged?: string[];
  insertions?: number;
  deletions?: number;
}

// ============================================================================
// Provider Messages (Story 11)
// ============================================================================

export interface ProviderDefinitionInfo {
  id: string;
  label: string;
  requiresApiKey: boolean;
  requiresBaseUrl: boolean;
  supportsModel: boolean;
  defaultBaseUrl?: string;
}

/** Host → Webview: current provider state */
export interface ProviderStateMessage {
  type: 'provider_state';
  providers: ProviderDefinitionInfo[];
  currentProviderId: string;
  currentModel?: string;
  currentBaseUrl?: string;
  error?: string;
}

/** All messages the extension host can send to the webview */
export type HostToWebviewMessage =
  | InitStateMessage
  | CliOutputMessage
  | PermissionRequestMessage
  | CancelRequestMessage
  | ElicitationRequestMessage
  | SessionStateMessage
  | ContextUsageMessage
  | ThemeChangedMessage
  | AtMentionInsertedMessage
  | SessionListMessage
  | ProcessStateMessage
  | FontConfigMessage
  | CheckpointStateMessage
  | RewindPreviewMessage
  | RewindResultMessage
  | ProviderStateMessage
  | AtMentionResultsMessage
  | FilePickerResultMessage
  | ActiveFileChangedMessage
  | SlashCommandsAvailableMessage;

// ============================================================
// Shared types
// ============================================================

export interface Attachment {
  type: 'file' | 'image' | 'url' | 'text';
  name: string;
  content: string; // base64 for images, path for files, raw for text/url
}

export interface Mention {
  type: 'file' | 'folder' | 'line_range' | 'terminal' | 'browser';
  path: string;
  startLine?: number;
  endLine?: number;
}

export interface SessionInfo {
  sessionId: string;
  state: 'running' | 'waiting_input' | 'idle' | 'stopped';
  title?: string;
}

export interface SessionSummary {
  sessionId: string;
  title: string;
  model?: string;
  timestamp: number;
  messageCount: number;
  isStarred?: boolean;
}

// ============================================================
// Panel identification
// ============================================================

export type PanelLocation = 'sidebar' | 'editor-tab' | 'new-window';

export interface PanelInfo {
  id: string;
  location: PanelLocation;
  sessionId?: string;
  isVisible: boolean;
}
