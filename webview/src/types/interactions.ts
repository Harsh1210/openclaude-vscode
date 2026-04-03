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
