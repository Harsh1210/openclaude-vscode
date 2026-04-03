import * as vscode from 'vscode';
import type {
  WebviewToHostMessage,
  HostToWebviewMessage,
  PanelInfo,
  PanelLocation,
} from './types';

type MessageHandler<T extends WebviewToHostMessage['type']> = (
  message: Extract<WebviewToHostMessage, { type: T }>,
  panelId: string,
) => void | Promise<void>;

/**
 * Typed PostMessage bridge between extension host and a single webview.
 *
 * Each WebviewBridge instance is bound to one webview (sidebar view or panel).
 * It provides:
 * - Typed message sending (host -> webview)
 * - Typed message receiving with handler registration (webview -> host)
 * - Automatic disposal of event listeners
 *
 * Pattern extracted from Claude Code extension.js:
 *   webview.onDidReceiveMessage((N) => { x?.fromClient(N) })
 *   webview.postMessage({ type: '...', ...payload })
 */
export class WebviewBridge implements vscode.Disposable {
  private readonly disposables: vscode.Disposable[] = [];
  private readonly handlers = new Map<string, MessageHandler<never>[]>();
  private isReady = false;
  private pendingMessages: HostToWebviewMessage[] = [];

  constructor(
    private readonly webview: vscode.Webview,
    public readonly panelId: string,
    public readonly location: PanelLocation,
  ) {
    // Listen for messages from the webview
    this.disposables.push(
      webview.onDidReceiveMessage((message: WebviewToHostMessage) => {
        this.handleIncomingMessage(message);
      }),
    );
  }

  /**
   * Register a handler for a specific message type from the webview.
   * Multiple handlers can be registered for the same type.
   */
  onMessage<T extends WebviewToHostMessage['type']>(
    type: T,
    handler: MessageHandler<T>,
  ): vscode.Disposable {
    const handlers = this.handlers.get(type) || [];
    handlers.push(handler as MessageHandler<never>);
    this.handlers.set(type, handlers);

    return {
      dispose: () => {
        const current = this.handlers.get(type);
        if (current) {
          const index = current.indexOf(handler as MessageHandler<never>);
          if (index >= 0) {
            current.splice(index, 1);
          }
        }
      },
    };
  }

  /**
   * Send a typed message to the webview.
   * If the webview hasn't sent 'ready' yet, messages are queued.
   */
  postMessage(message: HostToWebviewMessage): void {
    if (!this.isReady) {
      this.pendingMessages.push(message);
      return;
    }
    this.webview.postMessage(message);
  }

  /**
   * Get info about this bridge's panel.
   */
  getPanelInfo(isVisible: boolean, sessionId?: string): PanelInfo {
    return {
      id: this.panelId,
      location: this.location,
      sessionId,
      isVisible,
    };
  }

  private handleIncomingMessage(message: WebviewToHostMessage): void {
    // Special handling for 'ready' — flush pending messages
    if (message.type === 'ready') {
      this.isReady = true;
      for (const pending of this.pendingMessages) {
        this.webview.postMessage(pending);
      }
      this.pendingMessages = [];
    }

    // Dispatch to registered handlers
    const handlers = this.handlers.get(message.type);
    if (handlers && handlers.length > 0) {
      for (const handler of handlers) {
        try {
          handler(message as never, this.panelId);
        } catch (err) {
          console.error(`Error in webview message handler for '${message.type}':`, err);
        }
      }
    } else if (message.type !== 'ready') {
      // Log unhandled messages for debugging
      console.warn(`[WebviewBridge] No handler for message type: '${message.type}' (registered: ${Array.from(this.handlers.keys()).join(', ')})`);
    }
  }

  dispose(): void {
    for (const d of this.disposables) {
      d.dispose();
    }
    this.disposables.length = 0;
    this.handlers.clear();
    this.pendingMessages = [];
  }
}
