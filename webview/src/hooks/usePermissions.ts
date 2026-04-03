// webview/src/hooks/usePermissions.ts
// React hook managing the queue of pending permission requests.
// Listens for permission_request and cancel_request messages from the extension host.

import { useState, useCallback, useEffect } from 'react';
import { vscode } from '../vscode';

export interface PermissionRequest {
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

export function usePermissions() {
  const [queue, setQueue] = useState<PermissionRequest[]>([]);

  useEffect(() => {
    // Listen for permission_request messages
    const unsubPermission = vscode.onMessage('permission_request', (message) => {
      const req: PermissionRequest = {
        requestId: message.requestId as string,
        toolName: message.toolName as string,
        toolInput: (message.toolInput as Record<string, unknown>) ?? {},
        riskLevel: message.riskLevel as string | undefined,
        title: message.title as string | undefined,
        description: message.description as string | undefined,
        decisionReason: message.decisionReason as string | undefined,
        blockedPath: message.blockedPath as string | undefined,
        permissionSuggestions: message.permissionSuggestions as unknown[] | undefined,
        agentId: message.agentId as string | undefined,
      };
      setQueue((prev) => [...prev, req]);
    });

    // Listen for cancel_request messages
    const unsubCancel = vscode.onMessage('cancel_request', (message) => {
      const cancelId = message.requestId as string;
      setQueue((prev) => prev.filter((r) => r.requestId !== cancelId));
    });

    return () => {
      unsubPermission();
      unsubCancel();
    };
  }, []);

  // Current request is the first in the FIFO queue
  const currentRequest = queue.length > 0 ? queue[0] : null;
  const pendingCount = queue.length;

  // Respond to the current request and remove it from the queue
  const respond = useCallback(
    (requestId: string, allowed: boolean, alwaysAllow?: boolean) => {
      vscode.postMessage({
        type: 'permission_response',
        requestId,
        allowed,
        alwaysAllow: alwaysAllow ?? false,
      });
      setQueue((prev) => prev.filter((r) => r.requestId !== requestId));
    },
    [],
  );

  // Dismiss the current request (deny it)
  const dismissRequest = useCallback(
    (requestId: string) => {
      respond(requestId, false);
    },
    [respond],
  );

  return {
    currentRequest,
    pendingCount,
    respond,
    dismissRequest,
  };
}
