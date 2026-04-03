// src/process/processManager.ts
// Spawns and manages the OpenClaude CLI child process.
// Wires NdjsonTransport for communication, ControlRouter for control_request dispatch.
// Performs the initialize handshake on spawn.
//
// Reference: Claude Code extension.js class `Qm` (ProcessTransport) and `fm` (Query)

import { spawn, type ChildProcess } from 'node:child_process';
import * as readline from 'node:readline';
import { NdjsonTransport } from './ndjsonTransport';
import { ControlRouter, type ControlRequestHandler } from './controlRouter';
import type { InitializeResponse } from '../types/protocol';
import type {
  SDKControlRequest,
  SDKControlCancelRequest,
  SDKKeepAliveMessage,
  StdoutMessage,
} from '../types/messages';
import type { PermissionMode } from '../types/session';

// ============================================================================
// Types
// ============================================================================

export enum ProcessState {
  Idle = 'idle',
  Spawning = 'spawning',
  Initializing = 'initializing',
  Ready = 'ready',
  Restarting = 'restarting',
}

export interface ProcessManagerOptions {
  /** Working directory for the CLI */
  cwd: string;
  /** Path to the openclaude executable (default: 'openclaude') */
  executable?: string;
  /** Model to use */
  model?: string;
  /** Permission mode */
  permissionMode?: PermissionMode;
  /** Session ID to resume */
  sessionId?: string;
  /** Continue last session */
  continueSession?: boolean;
  /** Additional environment variables */
  env?: Record<string, string>;
  /** Initialize request options */
  promptSuggestions?: boolean;
  agentProgressSummaries?: boolean;
  /** Auto-restart on crash */
  autoRestart?: boolean;
  /** Keep-alive interval in ms (default: 30000) */
  keepAliveIntervalMs?: number;
}

type MessageCallback = (message: StdoutMessage) => void;
type ErrorCallback = (error: Error) => void;
type ExitCallback = (code: number | null, signal: string | null) => void;
type StderrCallback = (line: string) => void;
type StateCallback = (state: ProcessState) => void;

// ============================================================================
// ProcessManager
// ============================================================================

export class ProcessManager {
  private options: ProcessManagerOptions;
  private process: ChildProcess | undefined;
  private transport: NdjsonTransport | undefined;
  private router: ControlRouter | undefined;
  private stderrRl: readline.Interface | undefined;
  private keepAliveTimer: ReturnType<typeof setInterval> | undefined;

  private _state: ProcessState = ProcessState.Idle;
  private _sessionId: string | undefined;
  private _initializeResponse: InitializeResponse | undefined;

  // Pending initialize handshake resolution
  private pendingInitResolve:
    | ((response: InitializeResponse) => void)
    | undefined;
  private pendingInitReject: ((error: Error) => void) | undefined;
  private initRequestId: string | undefined;

  // Callbacks
  private messageCallbacks: MessageCallback[] = [];
  private errorCallbacks: ErrorCallback[] = [];
  private exitCallbacks: ExitCallback[] = [];
  private stderrCallbacks: StderrCallback[] = [];
  private stateCallbacks: StateCallback[] = [];

  constructor(options: ProcessManagerOptions) {
    this.options = options;
  }

  // ============================================================================
  // Public API
  // ============================================================================

  get state(): ProcessState {
    return this._state;
  }

  get sessionId(): string | undefined {
    return this._sessionId;
  }

  get initializeResponse(): InitializeResponse | undefined {
    return this._initializeResponse;
  }

  /** Get the current NDJSON transport (available after spawn). */
  get ndjsonTransport(): NdjsonTransport | undefined {
    return this.transport;
  }

  /**
   * Spawn the CLI process and perform the initialize handshake.
   * Returns the InitializeResponse on success.
   */
  spawn(): Promise<InitializeResponse> | void {
    if (this._state !== ProcessState.Idle && this._state !== ProcessState.Restarting) {
      return;
    }

    this.setState(ProcessState.Spawning);

    const executable = this.options.executable ?? 'openclaude';
    const args = this.buildArgs();
    const env = this.buildEnv();

    try {
      this.process = spawn(executable, args, {
        cwd: this.options.cwd,
        stdio: ['pipe', 'pipe', 'pipe'],
        env,
        windowsHide: true,
      });
    } catch (err) {
      this.setState(ProcessState.Idle);
      const error =
        err instanceof Error ? err : new Error(String(err));
      this.emitError(error);
      return;
    }

    // Wire up transport
    if (this.process.stdout && this.process.stdin) {
      this.transport = new NdjsonTransport(
        this.process.stdout,
        this.process.stdin,
      );

      // Create router that writes through transport
      this.router = new ControlRouter((msg) => this.transport?.write(msg));

      // Handle parsed messages from stdout
      this.transport.onMessage((msg) => this.handleMessage(msg as StdoutMessage));
      this.transport.onError((err) => this.emitError(err));
      this.transport.onClose(() => {
        // Stream closed — process is exiting
      });
    }

    // Wire up stderr for debug logging
    if (this.process.stderr) {
      this.stderrRl = readline.createInterface({
        input: this.process.stderr,
      });
      this.stderrRl.on('line', (line) => {
        for (const cb of this.stderrCallbacks) {
          cb(line);
        }
      });
    }

    // Handle process lifecycle
    this.process.on('error', (err) => {
      this.setState(ProcessState.Idle);
      this.emitError(err);
      if (this.pendingInitReject) {
        this.pendingInitReject(err);
        this.pendingInitResolve = undefined;
        this.pendingInitReject = undefined;
      }
    });

    this.process.on('exit', (code, signal) => {
      this.cleanup();
      this.setState(ProcessState.Idle);

      for (const cb of this.exitCallbacks) {
        cb(code, signal);
      }

      // Auto-restart on non-zero exit if enabled
      if (
        this.options.autoRestart &&
        code !== 0 &&
        code !== null &&
        this._sessionId
      ) {
        this.restartWithResume();
      }
    });

    // Send initialize handshake
    this.setState(ProcessState.Initializing);
    return this.sendInitialize();
  }

  /**
   * Write a message to the CLI's stdin via the transport.
   */
  write(message: unknown): void {
    this.transport?.write(message);
  }

  /**
   * Send a control_request to the CLI and return a promise for the response.
   */
  async sendControlRequest(
    request: Record<string, unknown>,
  ): Promise<Record<string, unknown> | undefined> {
    const requestId = this.generateRequestId();
    const envelope = {
      type: 'control_request',
      request_id: requestId,
      request,
    };

    return new Promise((resolve, reject) => {
      // Store resolver indexed by request_id so handleMessage can resolve it
      this.pendingControlRequests.set(requestId, { resolve, reject });
      this.transport?.write(envelope);
    });
  }

  private pendingControlRequests = new Map<
    string,
    {
      resolve: (response: Record<string, unknown> | undefined) => void;
      reject: (error: Error) => void;
    }
  >();

  /**
   * Register a handler for an incoming control_request subtype from the CLI.
   */
  registerControlHandler(
    subtype: string,
    handler: ControlRequestHandler,
  ): void {
    this.router?.registerHandler(subtype, handler);
  }

  /**
   * Kill the CLI process.
   */
  kill(signal: NodeJS.Signals = 'SIGTERM'): void {
    if (this.process && !this.process.killed) {
      this.process.kill(signal);
    }
  }

  /**
   * Clean up all resources.
   */
  dispose(): void {
    this.stopKeepAlive();
    this.kill();
    this.transport?.dispose();
    this.router?.dispose();
    this.stderrRl?.close();
    this.messageCallbacks = [];
    this.errorCallbacks = [];
    this.exitCallbacks = [];
    this.stderrCallbacks = [];
    this.stateCallbacks = [];
  }

  // ============================================================================
  // Event Registration
  // ============================================================================

  onMessage(callback: MessageCallback): void {
    this.messageCallbacks.push(callback);
  }

  onError(callback: ErrorCallback): void {
    this.errorCallbacks.push(callback);
  }

  onExit(callback: ExitCallback): void {
    this.exitCallbacks.push(callback);
  }

  onStderr(callback: StderrCallback): void {
    this.stderrCallbacks.push(callback);
  }

  onStateChange(callback: StateCallback): void {
    this.stateCallbacks.push(callback);
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private buildArgs(): string[] {
    const args: string[] = [
      '--output-format',
      'stream-json',
      '--verbose',
      '--input-format',
      'stream-json',
    ];

    if (this.options.model) {
      args.push('--model', this.options.model);
    }

    if (this.options.permissionMode) {
      args.push('--permission-mode', this.options.permissionMode);
    }

    if (this.options.sessionId) {
      args.push('--resume', this.options.sessionId);
    }

    if (this.options.continueSession) {
      args.push('--continue');
    }

    return args;
  }

  private buildEnv(): NodeJS.ProcessEnv {
    const env: NodeJS.ProcessEnv = { ...process.env };

    // Merge custom env vars
    if (this.options.env) {
      Object.assign(env, this.options.env);
    }

    // Set entrypoint marker
    if (!env.CLAUDE_CODE_ENTRYPOINT) {
      env.CLAUDE_CODE_ENTRYPOINT = 'openclaude-vscode';
    }

    // Remove NODE_OPTIONS to avoid conflicts (pattern from Claude Code extension)
    delete env.NODE_OPTIONS;

    return env;
  }

  private sendInitialize(): Promise<InitializeResponse> {
    return new Promise<InitializeResponse>((resolve, reject) => {
      this.pendingInitResolve = resolve;
      this.pendingInitReject = reject;

      this.initRequestId = this.generateRequestId();

      const initRequest = {
        type: 'control_request',
        request_id: this.initRequestId,
        request: {
          subtype: 'initialize',
          hooks: {},
          sdkMcpServers: [],
          promptSuggestions: this.options.promptSuggestions ?? true,
          agentProgressSummaries: this.options.agentProgressSummaries ?? true,
        },
      };

      this.transport?.write(initRequest);
    });
  }

  private handleMessage(message: StdoutMessage): void {
    // Handle control_response (may be initialize response or response to our requests)
    if (message.type === 'control_response') {
      const response = message.response;
      const requestId = response.request_id;

      // Check if this is the initialize response
      if (requestId === this.initRequestId && this.pendingInitResolve) {
        if (response.subtype === 'success') {
          const initResponse = response.response as unknown as InitializeResponse;
          this._initializeResponse = initResponse;
          this._sessionId = (initResponse as Record<string, unknown>).pid
            ? undefined
            : undefined;
          this.setState(ProcessState.Ready);
          this.startKeepAlive();
          this.pendingInitResolve(initResponse);
        } else {
          this.pendingInitReject?.(
            new Error(`Initialize failed: ${response.error}`),
          );
        }
        this.pendingInitResolve = undefined;
        this.pendingInitReject = undefined;
        this.initRequestId = undefined;
        return;
      }

      // Check if it matches a pending control request
      const pending = this.pendingControlRequests.get(requestId);
      if (pending) {
        this.pendingControlRequests.delete(requestId);
        if (response.subtype === 'success') {
          pending.resolve(response.response);
        } else {
          pending.reject(new Error(response.error));
        }
        return;
      }
    }

    // Handle incoming control_request from CLI (permission, elicitation, etc.)
    if (message.type === 'control_request') {
      this.router?.handleControlRequest(message as SDKControlRequest);
      return;
    }

    // Handle cancel requests
    if (message.type === 'control_cancel_request') {
      this.router?.handleControlCancelRequest(
        message as SDKControlCancelRequest,
      );
      return;
    }

    // Handle keep_alive (no-op, just acknowledge receipt)
    if (message.type === 'keep_alive') {
      return;
    }

    // Extract session_id from messages that carry it
    if ('session_id' in message && typeof (message as Record<string, unknown>).session_id === 'string') {
      this._sessionId = (message as Record<string, unknown>).session_id as string;
    }

    // Forward all other messages to listeners
    for (const cb of this.messageCallbacks) {
      cb(message);
    }
  }

  private startKeepAlive(): void {
    const interval = this.options.keepAliveIntervalMs ?? 30_000;
    this.keepAliveTimer = setInterval(() => {
      this.transport?.write({ type: 'keep_alive' } satisfies SDKKeepAliveMessage);
    }, interval);
  }

  private stopKeepAlive(): void {
    if (this.keepAliveTimer) {
      clearInterval(this.keepAliveTimer);
      this.keepAliveTimer = undefined;
    }
  }

  private restartWithResume(): void {
    this.setState(ProcessState.Restarting);

    // Update options to resume the session
    if (this._sessionId) {
      this.options = { ...this.options, sessionId: this._sessionId };
    }

    // Delay slightly before restart to avoid tight restart loops
    setTimeout(() => {
      this.spawn();
    }, 1000);
  }

  private cleanup(): void {
    this.stopKeepAlive();
    this.transport?.dispose();
    this.transport = undefined;
    this.router?.dispose();
    this.router = undefined;
    this.stderrRl?.close();
    this.stderrRl = undefined;
    this.process = undefined;
  }

  private setState(state: ProcessState): void {
    this._state = state;
    for (const cb of this.stateCallbacks) {
      cb(state);
    }
  }

  private emitError(error: Error): void {
    for (const cb of this.errorCallbacks) {
      cb(error);
    }
  }

  private generateRequestId(): string {
    return Math.random().toString(36).substring(2, 15);
  }
}
