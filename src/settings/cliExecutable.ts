import type * as vscode from 'vscode';

export const DEFAULT_CLI_EXECUTABLE = 'openclaude';

type ConfigLike = Pick<vscode.WorkspaceConfiguration, 'get'>;

export function resolveCliExecutable(config: ConfigLike): string {
  const wrapper = config.get<string>('claudeProcessWrapper', '')?.trim();
  return wrapper || DEFAULT_CLI_EXECUTABLE;
}
