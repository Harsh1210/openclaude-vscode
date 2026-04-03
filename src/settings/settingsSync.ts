// src/settings/settingsSync.ts
// Wrapper around vscode.workspace.getConfiguration('openclaudeCode') for provider settings.

import * as vscode from 'vscode';

export class SettingsSync {
  private get config() {
    return vscode.workspace.getConfiguration('openclaudeCode');
  }

  get selectedProvider(): string {
    return this.config.get<string>('selectedProvider', 'anthropic');
  }

  get selectedModel(): string | undefined {
    const v = this.config.get<string>('selectedModel');
    return v && v !== 'default' ? v : undefined;
  }

  get apiKey(): string | undefined {
    return this.config.get<string>('apiKey') || undefined;
  }

  get baseUrl(): string | undefined {
    return this.config.get<string>('baseUrl') || undefined;
  }

  get environmentVariables(): Array<{ name: string; value: string }> {
    return this.config.get<Array<{ name: string; value: string }>>('environmentVariables', []);
  }

  async setProvider(providerId: string): Promise<void> {
    await this.config.update('selectedProvider', providerId, vscode.ConfigurationTarget.Global);
  }

  async setModel(model: string | undefined): Promise<void> {
    await this.config.update('selectedModel', model ?? 'default', vscode.ConfigurationTarget.Global);
  }

  async setApiKey(apiKey: string | undefined): Promise<void> {
    await this.config.update('apiKey', apiKey ?? '', vscode.ConfigurationTarget.Global);
  }

  async setBaseUrl(baseUrl: string | undefined): Promise<void> {
    await this.config.update('baseUrl', baseUrl ?? '', vscode.ConfigurationTarget.Global);
  }
}
