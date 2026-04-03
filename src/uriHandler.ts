// src/uriHandler.ts
// Pure URI parsing helper for the OpenClaude URI handler.
// Handles: vscode://harsh1210.openclaude-vscode/open?prompt=...&session=...

import type * as vscode from 'vscode';

export interface ParsedOpenClaudeUri {
  prompt?: string;
  session?: string;
}

/**
 * Parse an OpenClaude deep-link URI and extract supported query parameters.
 * Throws if the URI is structurally malformed (e.g. unparseable query string).
 */
export function parseOpenClaudeUri(uri: vscode.Uri): ParsedOpenClaudeUri {
  const query = uri.query;
  if (!query) {
    return {};
  }

  const params = new URLSearchParams(query);
  const result: ParsedOpenClaudeUri = {};

  const prompt = params.get('prompt');
  if (prompt !== null && prompt.trim() !== '') {
    result.prompt = prompt;
  }

  const session = params.get('session');
  if (session !== null && session.trim() !== '') {
    result.session = session;
  }

  return result;
}
