// src/diff/diffHandler.ts
// Factory function that creates a ControlRequestHandler for can_use_tool
// requests, delegating file edit/write tools to DiffManager and
// non-file-edit tools to PermissionHandler.

import type { OutputChannel } from 'vscode';
import type { ControlRequestHandler } from '../process/controlRouter';
import { SELF_HANDLED } from '../process/controlRouter';
import type { DiffManager } from './diffManager';
import type { NdjsonTransport } from '../process/ndjsonTransport';
import type { PermissionHandler } from '../permissions/permissionHandler';
import type { ControlRequestPermission } from '../types/messages';

/**
 * Create a can_use_tool handler that routes file edit tools to DiffManager
 * and non-file-edit tools to PermissionHandler.
 *
 * Returns SELF_HANDLED so the ControlRouter doesn't send an automatic response —
 * both DiffManager and PermissionHandler send responses asynchronously.
 *
 * @param diffManager The DiffManager instance for showing diffs
 * @param getTransport Function that returns the current NdjsonTransport
 * @param outputChannel Output channel for logging
 * @param permissionHandler Optional PermissionHandler for non-file-edit tools
 */
export function createCanUseToolHandler(
  diffManager: DiffManager,
  getTransport: () => NdjsonTransport | undefined,
  outputChannel: OutputChannel,
  permissionHandler?: PermissionHandler,
): ControlRequestHandler {
  return async (request, signal, requestId) => {
    const permRequest = request as ControlRequestPermission;
    const transport = getTransport();

    if (!transport) {
      outputChannel.appendLine(
        '[DiffHandler] No transport available, cannot handle can_use_tool',
      );
      throw new Error('No transport available');
    }

    if (diffManager.isFileEditToolRequest(permRequest)) {
      // File edit/write tools -> native diff viewer
      // DiffManager handles the response asynchronously
      await diffManager.showDiff(requestId, permRequest, transport);
      return SELF_HANDLED;
    }

    // Non-file-edit tools -> PermissionHandler (if available)
    if (permissionHandler) {
      return permissionHandler.handleToolRequest(permRequest, signal, requestId);
    }

    // Fallback: auto-allow if no PermissionHandler
    outputChannel.appendLine(
      `[DiffHandler] Auto-allowing non-file-edit tool (no PermissionHandler): ${permRequest.tool_name}`,
    );
    return {
      behavior: 'allow',
      updatedInput: permRequest.input,
      toolUseID: permRequest.tool_use_id,
    };
  };
}
