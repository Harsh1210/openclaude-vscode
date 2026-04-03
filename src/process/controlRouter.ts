// src/process/controlRouter.ts
// Routes incoming control_request messages from the CLI to registered handlers.
// Manages AbortControllers per request for cancellation via control_cancel_request.

import type {
  ControlRequestInner,
  SDKControlCancelRequest,
  SDKControlRequest,
} from '../types/messages';

/** Handler function signature — receives the request inner, abort signal, and request ID */
export type ControlRequestHandler = (
  request: ControlRequestInner,
  signal: AbortSignal,
  requestId: string,
) => Promise<unknown>;

/**
 * Sentinel value: when a handler returns this, the ControlRouter skips
 * sending an automatic response. The handler is responsible for sending
 * its own response via the transport (e.g., DiffManager sends responses
 * asynchronously when the user clicks accept/reject).
 */
export const SELF_HANDLED = Symbol('self-handled');

/** Function to write a message to the CLI's stdin */
export type WriteFn = (message: unknown) => void;

export class ControlRouter {
  private handlers = new Map<string, ControlRequestHandler>();
  private activeRequests = new Map<string, AbortController>();
  private writeFn: WriteFn;

  constructor(writeFn: WriteFn) {
    this.writeFn = writeFn;
  }

  /**
   * Register a handler for a specific control_request subtype.
   * Only one handler per subtype is allowed — later registrations replace earlier ones.
   */
  registerHandler(subtype: string, handler: ControlRequestHandler): void {
    this.handlers.set(subtype, handler);
  }

  /**
   * Unregister the handler for a subtype.
   */
  unregisterHandler(subtype: string): void {
    this.handlers.delete(subtype);
  }

  /**
   * Handle an incoming control_request from the CLI.
   * Dispatches to the registered handler, sends success or error response.
   */
  async handleControlRequest(request: SDKControlRequest): Promise<void> {
    const { request_id } = request;
    const subtype = request.request.subtype;
    const handler = this.handlers.get(subtype);

    if (!handler) {
      this.sendErrorResponse(
        request_id,
        `No handler registered for control_request subtype: ${subtype}`,
      );
      return;
    }

    const abortController = new AbortController();
    this.activeRequests.set(request_id, abortController);

    try {
      const result = await handler(request.request, abortController.signal, request_id);
      // If the handler returned SELF_HANDLED, it manages its own response
      if (result !== SELF_HANDLED) {
        this.sendSuccessResponse(request_id, result as Record<string, unknown>);
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : String(err);
      this.sendErrorResponse(request_id, message);
    } finally {
      this.activeRequests.delete(request_id);
    }
  }

  /**
   * Handle a control_cancel_request — aborts the in-flight handler for that request_id.
   */
  handleControlCancelRequest(cancel: SDKControlCancelRequest): void {
    const controller = this.activeRequests.get(cancel.request_id);
    if (controller) {
      controller.abort();
      this.activeRequests.delete(cancel.request_id);
    }
  }

  private sendSuccessResponse(
    requestId: string,
    response?: Record<string, unknown>,
  ): void {
    this.writeFn({
      type: 'control_response',
      response: {
        subtype: 'success',
        request_id: requestId,
        response,
      },
    });
  }

  private sendErrorResponse(requestId: string, error: string): void {
    this.writeFn({
      type: 'control_response',
      response: {
        subtype: 'error',
        request_id: requestId,
        error,
      },
    });
  }

  /**
   * Clean up all active requests.
   */
  dispose(): void {
    for (const controller of this.activeRequests.values()) {
      controller.abort();
    }
    this.activeRequests.clear();
    this.handlers.clear();
  }
}

/**
 * Standalone helper that routes a raw CLI message to the webview or sends a control response.
 * Used for elicitation, teleport, and cancel routing.
 */
export interface RouteControlHandlers {
  postMessage: (msg: Record<string, unknown>) => void;
  sendControlResponse?: (requestId: string, response: Record<string, unknown>) => void;
}

export function routeControlRequest(
  message: Record<string, unknown>,
  handlers: RouteControlHandlers,
): void {
  // Elicitation control_request → show dialog in webview
  if (
    message.type === 'control_request' &&
    (message.request as Record<string, unknown> | undefined)?.subtype === 'elicitation'
  ) {
    const req = message.request as Record<string, unknown>;
    handlers.postMessage({
      type: 'show_elicitation',
      requestId: message.request_id,
      message: req.message,
      fields: (req.fields as unknown[]) ?? [],
    });
    return;
  }

  // Teleport system message → show teleport dialog
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

  // Control cancel → dismiss stale dialogs
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
}
