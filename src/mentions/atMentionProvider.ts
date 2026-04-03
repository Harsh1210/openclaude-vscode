import * as vscode from 'vscode';
import * as path from 'path';

export interface AtMentionSearchResult {
  type: 'file' | 'folder' | 'line_range' | 'terminal' | 'browser';
  label: string;
  detail: string;
  insertText: string;
  icon: string;
}

/**
 * Provides @-mention search results by querying the VS Code workspace.
 *
 * Supports:
 * - @file — fuzzy match against workspace files
 * - @folder — fuzzy match against workspace folders
 * - @file#L5-L10 — file with line range
 * - @terminal:name — reference a named terminal
 * - @browser — reference Chrome integration
 */
export class AtMentionProvider implements vscode.Disposable {
  private readonly disposables: vscode.Disposable[] = [];
  private cachedFiles: string[] | null = null;
  private cacheExpiry = 0;
  private static readonly CACHE_TTL_MS = 5000; // 5 second cache

  constructor() {
    // Invalidate cache on file system changes
    const watcher = vscode.workspace.createFileSystemWatcher('**/*');
    this.disposables.push(
      watcher.onDidCreate(() => this.invalidateCache()),
      watcher.onDidDelete(() => this.invalidateCache()),
      watcher,
    );
  }

  /**
   * Search for @-mention targets matching the given query.
   *
   * @param query The text after `@`, e.g. "auth" or "src/auth#L5-10" or "terminal:" or "browser"
   * @param maxResults Maximum results to return
   */
  async search(query: string, maxResults = 20): Promise<AtMentionSearchResult[]> {
    const results: AtMentionSearchResult[] = [];

    // Check for special prefixes first
    if (query === '' || this.fuzzyMatchSimple('browser', query)) {
      results.push({
        type: 'browser',
        label: 'browser',
        detail: 'Reference Chrome browser content',
        insertText: '@browser',
        icon: 'globe',
      });
    }

    // @terminal:name
    if (query === '' || query.toLowerCase().startsWith('t')) {
      const terminalResults = this.getTerminalResults(query);
      results.push(...terminalResults);
    }

    // Check for line range syntax: file#L5-L10 or file#L5
    const lineRangeMatch = query.match(/^(.+?)#L(\d+)(?:-L?(\d+))?$/i);
    if (lineRangeMatch) {
      const fileQuery = lineRangeMatch[1];
      const startLine = parseInt(lineRangeMatch[2], 10);
      const endLine = lineRangeMatch[3] ? parseInt(lineRangeMatch[3], 10) : startLine;

      const files = await this.searchFiles(fileQuery, 5);
      for (const file of files) {
        results.push({
          type: 'line_range',
          label: `${path.basename(file)}#L${startLine}-L${endLine}`,
          detail: `${file}#L${startLine}-L${endLine}`,
          insertText: `@${file}#L${startLine}-L${endLine}`,
          icon: 'symbol-number',
        });
      }
      return results.slice(0, maxResults);
    }

    // Search workspace files and folders
    const files = await this.searchFiles(query, maxResults);
    for (const file of files) {
      const isDirectory = file.endsWith('/');
      results.push({
        type: isDirectory ? 'folder' : 'file',
        label: isDirectory ? path.basename(file.slice(0, -1)) : path.basename(file),
        detail: file,
        insertText: `@${file}`,
        icon: isDirectory ? 'folder' : this.getFileIcon(file),
      });
    }

    return results.slice(0, maxResults);
  }

  /**
   * Search workspace files matching the query using vscode.workspace.findFiles.
   */
  private async searchFiles(query: string, maxResults: number): Promise<string[]> {
    const files = await this.getWorkspaceFiles();

    if (!query) {
      return files.slice(0, maxResults);
    }

    const queryLower = query.toLowerCase();

    // Score and sort files by fuzzy match quality
    const scored: Array<{ file: string; score: number }> = [];
    for (const file of files) {
      const score = this.scoreMatch(queryLower, file.toLowerCase());
      if (score >= 0) {
        scored.push({ file, score });
      }
    }

    scored.sort((a, b) => a.score - b.score);
    return scored.slice(0, maxResults).map((s) => s.file);
  }

  /**
   * Get all workspace files (cached for performance).
   */
  private async getWorkspaceFiles(): Promise<string[]> {
    if (this.cachedFiles && Date.now() < this.cacheExpiry) {
      return this.cachedFiles;
    }

    const excludePattern = '{**/node_modules/**,**/.git/**,**/dist/**,**/.next/**,**/build/**,**/__pycache__/**}';
    const uris = await vscode.workspace.findFiles('**/*', excludePattern, 5000);

    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '';
    const files = uris.map((uri) => {
      const rel = path.relative(workspaceRoot, uri.fsPath);
      return rel.split(path.sep).join('/'); // normalize to forward slashes
    });

    // Also add directories (deduplicated)
    const dirs = new Set<string>();
    for (const file of files) {
      const parts = file.split('/');
      for (let i = 1; i < parts.length; i++) {
        dirs.add(parts.slice(0, i).join('/') + '/');
      }
    }

    this.cachedFiles = [...files, ...Array.from(dirs)].sort();
    this.cacheExpiry = Date.now() + AtMentionProvider.CACHE_TTL_MS;
    return this.cachedFiles;
  }

  /**
   * Get terminal references from active VS Code terminals.
   */
  private getTerminalResults(query: string): AtMentionSearchResult[] {
    const terminalQuery = query.toLowerCase().startsWith('terminal:')
      ? query.slice('terminal:'.length)
      : query.toLowerCase().startsWith('terminal')
        ? query.slice('terminal'.length)
        : '';

    const results: AtMentionSearchResult[] = [];
    const terminals = vscode.window.terminals;

    for (const terminal of terminals) {
      if (!terminalQuery || terminal.name.toLowerCase().includes(terminalQuery.toLowerCase())) {
        results.push({
          type: 'terminal',
          label: `terminal:${terminal.name}`,
          detail: `Terminal: ${terminal.name}`,
          insertText: `@terminal:${terminal.name}`,
          icon: 'terminal',
        });
      }
    }

    return results;
  }

  /**
   * Simple fuzzy match: all characters of query appear in order in target.
   */
  private fuzzyMatchSimple(target: string, query: string): boolean {
    if (!query) return true;
    const targetLower = target.toLowerCase();
    const queryLower = query.toLowerCase();
    let qi = 0;
    for (let i = 0; i < targetLower.length && qi < queryLower.length; i++) {
      if (targetLower[i] === queryLower[qi]) qi++;
    }
    return qi === queryLower.length;
  }

  /**
   * Score a fuzzy match. Lower is better. Returns -1 for no match.
   * Prefers: exact prefix match > filename match > path match
   */
  private scoreMatch(queryLower: string, fileLower: string): number {
    // Exact prefix of filename
    const filenameLower = fileLower.split('/').pop() || fileLower;
    if (filenameLower.startsWith(queryLower)) {
      return 0 + filenameLower.length * 0.01;
    }

    // Filename contains query
    if (filenameLower.includes(queryLower)) {
      return 10 + filenameLower.indexOf(queryLower) * 0.1;
    }

    // Full path contains query
    if (fileLower.includes(queryLower)) {
      return 20 + fileLower.indexOf(queryLower) * 0.1;
    }

    // Fuzzy match on full path
    let qi = 0;
    let score = 30;
    for (let i = 0; i < fileLower.length && qi < queryLower.length; i++) {
      if (fileLower[i] === queryLower[qi]) {
        qi++;
        score += i * 0.01;
      }
    }

    if (qi === queryLower.length) {
      return score;
    }

    return -1; // no match
  }

  /**
   * Map file extension to icon name for display.
   */
  private getFileIcon(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    const iconMap: Record<string, string> = {
      '.ts': 'file-code',
      '.tsx': 'file-code',
      '.js': 'file-code',
      '.jsx': 'file-code',
      '.py': 'file-code',
      '.rs': 'file-code',
      '.go': 'file-code',
      '.java': 'file-code',
      '.css': 'file-code',
      '.scss': 'file-code',
      '.html': 'file-code',
      '.json': 'file-code',
      '.md': 'file-text',
      '.txt': 'file-text',
      '.yml': 'file-text',
      '.yaml': 'file-text',
      '.png': 'file-media',
      '.jpg': 'file-media',
      '.jpeg': 'file-media',
      '.gif': 'file-media',
      '.svg': 'file-media',
      '.pdf': 'file-pdf',
    };
    return iconMap[ext] || 'file';
  }

  private invalidateCache(): void {
    this.cachedFiles = null;
    this.cacheExpiry = 0;
  }

  dispose(): void {
    this.invalidateCache();
    for (const d of this.disposables) {
      d.dispose();
    }
  }
}
