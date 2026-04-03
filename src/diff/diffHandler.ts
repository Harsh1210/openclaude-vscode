// src/diff/diffHandler.ts
// Factory function that creates a ControlRequestHandler for can_use_tool
// requests, delegating file edit/write tools to DiffManager and
// auto-allowing all other tools.

import type { OutputChannel } from 'vscode';
import type { ControlRequestHandler } from '../process/controlRouter';
import { SELF_HANDLED } from '../process/controlRouter';
import type { DiffManager } from './diffManager';
import type { NdjsonTransport } from '../process/ndjsonTransport';
import type { ControlRequestPermission } from '../types/messages';

/**
 * Create a can_use_tool handler that routes file edit tools to DiffManager.
 *
 * Returns SELF_HANDLED so the ControlRouter doesn't send an automatic response —
 * DiffManager sends responses asynchronously when the user clicks accept/reject.
 *
 * @param diffManager The DiffManager instance for showing diffs
 * @param getTransport Function that returns the current NdjsonTransport
 * @param outputChannel Output channel for logging
 */
export function createCanUseToolHandler(
  diffManager: DiffManager,
  getTransport: () => NdjsonTransport | undefined,
  outputChannel: OutputChannel,
): ControlRequestHandler {
  return async (request, _signal, requestId) => {
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

    // Other tools -> auto-allow for now (Story 7 will add a permission dialog)
    outputChannel.appendLine(
      `[DiffHandler] Auto-allowing non-file-edit tool: ${permRequest.tool_name}`,
    );
    return {
      behavior: 'allow',
      updatedInput: permRequest.input,
      toolUseID: permRequest.tool_use_id,
    };
  };
}
