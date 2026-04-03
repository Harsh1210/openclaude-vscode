// src/checkpoint/checkpointManager.ts
//
// Tracks assistant message UUIDs as checkpoint/rewind targets.
// Does NOT touch files — the CLI handles file restoration via rewind_files.
//
// References:
// - controlSchemas.ts: SDKControlRewindFilesRequestSchema / ResponseSchema
// - coreSchemas.ts: SDKFilesPersistedEventSchema, SDKSessionStateChangedMessageSchema

// ============================================================================
// Types
// ============================================================================

export interface PersistedFile {
  filename: string;
  file_id: string;
}

export interface CheckpointEntry {
  /** The assistant message UUID this checkpoint is anchored to */
  messageUuid: string;
  /** Session ID at the time of registration */
  sessionId: string;
  /** Files persisted after this assistant message */
  persistedFiles: PersistedFile[];
  /** Last session state seen (from session_state_changed) */
  lastSessionState?: 'idle' | 'running' | 'requires_action';
  /** Timestamp of registration */
  registeredAt: number;
}

/** Matches SDKControlRewindFilesRequestSchema from controlSchemas.ts */
export interface RewindFilesRequest {
  subtype: 'rewind_files';
  user_message_id: string;
  dry_run: boolean;
}

/** Matches SDKControlRewindFilesResponseSchema from controlSchemas.ts */
export interface RewindFilesResponse {
  canRewind: boolean;
  error?: string;
  filesChanged?: string[];
  insertions?: number;
  deletions?: number;
}

/** Fork options — override fields for ProcessManagerOptions */
export interface ForkOptions {
  sessionId: string;
  forkSession: true;
}

/** Serializable summary sent to the webview */
export interface CheckpointSummary {
  messageUuid: string;
  sessionId: string;
  fileCount: number;
  filenames: string[];
  canRewind: boolean;
  lastSessionState?: string;
}

// ============================================================================
// CheckpointManager
// ============================================================================

export class CheckpointManager {
  private checkpoints: Map<string, CheckpointEntry> = new Map();
  /** Ordered list of message UUIDs (insertion order) */
  private order: string[] = [];

  // --------------------------------------------------------------------------
  // Registration
  // --------------------------------------------------------------------------

  /**
   * Register an assistant message UUID as a rewind target.
   * Called when the CLI emits an assistant message.
   */
  registerAssistantMessage(messageUuid: string, sessionId: string): void {
    if (this.checkpoints.has(messageUuid)) {
      return; // Already registered — no duplicates
    }

    const entry: CheckpointEntry = {
      messageUuid,
      sessionId,
      persistedFiles: [],
      registeredAt: Date.now(),
    };

    this.checkpoints.set(messageUuid, entry);
    this.order.push(messageUuid);
  }

  // --------------------------------------------------------------------------
  // System event handlers
  // --------------------------------------------------------------------------

  /**
   * Handle a files_persisted system event from the CLI.
   * Associates persisted files with the most recent checkpoint for the session,
   * or a specific message UUID if provided.
   */
  markFilesPersisted(messageUuid: string, files: PersistedFile[]): void {
    const entry = this.checkpoints.get(messageUuid);
    if (!entry) {
      return; // Unknown UUID — no-op
    }

    for (const file of files) {
      // Avoid duplicates by file_id
      if (!entry.persistedFiles.some((f) => f.file_id === file.file_id)) {
        entry.persistedFiles.push(file);
      }
    }
  }

  /**
   * Handle a session_state_changed system event.
   * Updates the lastSessionState on the most recent checkpoint for that session.
   */
  handleSessionStateChanged(
    state: 'idle' | 'running' | 'requires_action',
    sessionId: string,
  ): void {
    // Find the most recent checkpoint for this session
    for (let i = this.order.length - 1; i >= 0; i--) {
      const entry = this.checkpoints.get(this.order[i]);
      if (entry && entry.sessionId === sessionId) {
        entry.lastSessionState = state;
        return;
      }
    }
  }

  // --------------------------------------------------------------------------
  // Lookup
  // --------------------------------------------------------------------------

  getCheckpoint(messageUuid: string): CheckpointEntry | undefined {
    return this.checkpoints.get(messageUuid);
  }

  getAllCheckpoints(): CheckpointEntry[] {
    return this.order
      .map((uuid) => this.checkpoints.get(uuid))
      .filter((entry): entry is CheckpointEntry => entry !== undefined);
  }

  // --------------------------------------------------------------------------
  // Request builders
  // --------------------------------------------------------------------------

  /**
   * Build a rewind_files control request payload.
   * The extension host wraps this in a control_request envelope and sends to CLI stdin.
   */
  buildRewindRequest(messageUuid: string, dryRun = false): RewindFilesRequest {
    if (!this.checkpoints.has(messageUuid)) {
      throw new Error(`No checkpoint found for message UUID: ${messageUuid}`);
    }

    return {
      subtype: 'rewind_files',
      user_message_id: messageUuid,
      dry_run: dryRun,
    };
  }

  /**
   * Build ProcessManagerOptions overrides for forking from this checkpoint.
   * The extension host uses these to spawn a new CLI process with --resume <uuid>.
   */
  buildForkOptions(messageUuid: string): ForkOptions {
    if (!this.checkpoints.has(messageUuid)) {
      throw new Error(`No checkpoint found for message UUID: ${messageUuid}`);
    }

    return {
      sessionId: messageUuid,
      forkSession: true,
    };
  }

  // --------------------------------------------------------------------------
  // Webview state
  // --------------------------------------------------------------------------

  /**
   * Return serializable checkpoint summaries for the webview.
   */
  getWebviewState(): CheckpointSummary[] {
    return this.getAllCheckpoints().map((entry) => ({
      messageUuid: entry.messageUuid,
      sessionId: entry.sessionId,
      fileCount: entry.persistedFiles.length,
      filenames: entry.persistedFiles.map((f) => f.filename),
      canRewind: true,
      lastSessionState: entry.lastSessionState,
    }));
  }

  // --------------------------------------------------------------------------
  // Lifecycle
  // --------------------------------------------------------------------------

  /**
   * Clear all checkpoints. Called when starting a new session.
   */
  clear(): void {
    this.checkpoints.clear();
    this.order = [];
  }
}
