import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import * as readline from 'readline';

export interface SessionInfo {
  /** UUID — matches the JSONL filename without extension */
  id: string;
  /** From ai-title system message, or first non-meta user message, or 'Untitled Session' */
  title: string;
  /** Model string from first assistant message (e.g., 'gpt-5.4', 'claude-sonnet-4-20250514') */
  model: string;
  /** Last message timestamp (most recent activity) */
  timestamp: Date;
  /** First message timestamp (session creation) */
  createdAt: Date;
  /** Count of user + assistant messages, excluding isMeta and file-history-snapshot */
  messageCount: number;
  /** Project directory name in ~/.claude/projects/ */
  projectDir: string;
  /** Absolute path to the .jsonl file */
  filePath: string;
  /** Working directory from first message with a cwd field */
  cwd: string;
  /** Git branch from first message with a gitBranch field */
  gitBranch: string;
}

export type SessionGroup = 'Today' | 'Yesterday' | 'This Week' | 'This Month' | 'Older';

export interface GroupedSessions {
  group: SessionGroup;
  sessions: SessionInfo[];
}

export class SessionTracker implements vscode.Disposable {
  private sessions: Map<string, SessionInfo> = new Map();
  private watcher: vscode.FileSystemWatcher | undefined;
  private readonly _onSessionsChanged = new vscode.EventEmitter<SessionInfo[]>();
  public readonly onSessionsChanged = this._onSessionsChanged.event;
  private disposables: vscode.Disposable[] = [];

  constructor() {
    this.disposables.push(this._onSessionsChanged);
  }

  /** Initialize: scan existing files, start watching for changes. */
  async initialize(): Promise<void> {
    await this.scanAllSessions();
    this.startWatching();
  }

  /** ~/.claude/projects/ */
  private getProjectsDir(): string {
    return path.join(os.homedir(), '.claude', 'projects');
  }

  /**
   * Derive the project directory name for the current workspace.
   * Convention: absolute path with all / replaced by - .
   * Example: /Users/harsh/workspace/myproject -> -Users-harsh-workspace-myproject
   */
  getProjectDirForWorkspace(): string | undefined {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) {
      return undefined;
    }
    return folders[0].uri.fsPath.replace(/\//g, '-');
  }

  /** Scan all JSONL files in the current workspace's project directory. */
  async scanAllSessions(): Promise<void> {
    const projectDir = this.getProjectDirForWorkspace();
    if (!projectDir) {
      return;
    }
    const projectPath = path.join(this.getProjectsDir(), projectDir);
    if (!fs.existsSync(projectPath)) {
      return;
    }

    const files = fs.readdirSync(projectPath).filter(f => f.endsWith('.jsonl'));
    await Promise.all(files.map(f => this.parseSessionFile(path.join(projectPath, f))));
    this._onSessionsChanged.fire(this.getSessionList());
  }

  /**
   * Parse a single JSONL file to extract session metadata.
   * Uses readline to stream line-by-line (never loads entire file into memory).
   */
  async parseSessionFile(filePath: string): Promise<void> {
    const filename = path.basename(filePath, '.jsonl');
    const projectDir = path.basename(path.dirname(filePath));

    let title = '';
    let fallbackTitle = '';
    let model = '';
    let firstTimestamp: Date | undefined;
    let lastTimestamp: Date | undefined;
    let messageCount = 0;
    let cwd = '';
    let gitBranch = '';

    try {
      const fileStream = fs.createReadStream(filePath, { encoding: 'utf-8' });
      const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity,
      });

      for await (const line of rl) {
        if (!line.trim()) {
          continue;
        }
        let entry: Record<string, unknown>;
        try {
          entry = JSON.parse(line);
        } catch {
          continue; // Skip malformed lines
        }

        // Track timestamps
        if (typeof entry.timestamp === 'string') {
          const ts = new Date(entry.timestamp as string);
          if (!firstTimestamp || ts < firstTimestamp) {
            firstTimestamp = ts;
          }
          if (!lastTimestamp || ts > lastTimestamp) {
            lastTimestamp = ts;
          }
        }

        // Extract cwd and gitBranch from first entry that has them
        if (!cwd && typeof entry.cwd === 'string') {
          cwd = entry.cwd as string;
        }
        if (!gitBranch && typeof entry.gitBranch === 'string') {
          gitBranch = entry.gitBranch as string;
        }

        // Count user messages (skip meta messages)
        if (entry.type === 'user' && !entry.isMeta) {
          messageCount++;
          // Extract fallback title from first non-meta user message
          if (!fallbackTitle) {
            const msg = entry.message as Record<string, unknown> | undefined;
            if (msg) {
              const content = msg.content;
              let text = '';
              if (typeof content === 'string') {
                text = content;
              } else if (Array.isArray(content)) {
                const textBlock = content.find(
                  (b: Record<string, unknown>) => b.type === 'text',
                );
                if (textBlock && typeof textBlock.text === 'string') {
                  text = textBlock.text;
                }
              }
              // Skip command/caveat messages as fallback titles
              if (
                text &&
                !text.startsWith('<command-name>') &&
                !text.startsWith('<local-command')
              ) {
                fallbackTitle = text.slice(0, 120);
              }
            }
          }
        }

        // Count assistant messages and extract model
        if (entry.type === 'assistant') {
          messageCount++;
          if (!model) {
            const msg = entry.message as Record<string, unknown> | undefined;
            if (msg && typeof msg.model === 'string') {
              model = msg.model as string;
            }
          }
        }

        // ai-title system message overrides any fallback title
        if (
          entry.type === 'system' &&
          entry.subtype === 'ai-title' &&
          typeof (entry as Record<string, unknown>).title === 'string'
        ) {
          title = (entry as Record<string, unknown>).title as string;
        }
      }
    } catch (err) {
      console.error(`SessionTracker: failed to parse ${filePath}:`, err);
      return;
    }

    if (!firstTimestamp) {
      return; // Empty or completely unparseable file
    }

    this.sessions.set(filename, {
      id: filename,
      title: title || fallbackTitle || 'Untitled Session',
      model: model || 'unknown',
      timestamp: lastTimestamp || firstTimestamp,
      createdAt: firstTimestamp,
      messageCount,
      projectDir,
      filePath,
      cwd,
      gitBranch,
    });
  }

  /** Watch for new/changed/deleted JSONL files in the project directory. */
  private startWatching(): void {
    const projectDir = this.getProjectDirForWorkspace();
    if (!projectDir) {
      return;
    }
    const pattern = new vscode.RelativePattern(
      vscode.Uri.file(path.join(this.getProjectsDir(), projectDir)),
      '*.jsonl',
    );
    this.watcher = vscode.workspace.createFileSystemWatcher(pattern);

    this.watcher.onDidCreate(async (uri) => {
      await this.parseSessionFile(uri.fsPath);
      this._onSessionsChanged.fire(this.getSessionList());
    });
    this.watcher.onDidChange(async (uri) => {
      await this.parseSessionFile(uri.fsPath);
      this._onSessionsChanged.fire(this.getSessionList());
    });
    this.watcher.onDidDelete((uri) => {
      this.sessions.delete(path.basename(uri.fsPath, '.jsonl'));
      this._onSessionsChanged.fire(this.getSessionList());
    });

    this.disposables.push(this.watcher);
  }

  /** All sessions sorted by timestamp descending. */
  getSessionList(): SessionInfo[] {
    return Array.from(this.sessions.values()).sort(
      (a, b) => b.timestamp.getTime() - a.timestamp.getTime(),
    );
  }

  /** Sessions grouped into time-period buckets, only including non-empty groups. */
  getGroupedSessions(): GroupedSessions[] {
    const sessions = this.getSessionList();
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterdayStart = new Date(todayStart.getTime() - 86_400_000);
    const weekStart = new Date(todayStart.getTime() - 7 * 86_400_000);
    const monthStart = new Date(todayStart.getTime() - 30 * 86_400_000);

    const buckets: Record<SessionGroup, SessionInfo[]> = {
      'Today': [],
      'Yesterday': [],
      'This Week': [],
      'This Month': [],
      'Older': [],
    };

    for (const s of sessions) {
      const t = s.timestamp.getTime();
      if (t >= todayStart.getTime()) {
        buckets['Today'].push(s);
      } else if (t >= yesterdayStart.getTime()) {
        buckets['Yesterday'].push(s);
      } else if (t >= weekStart.getTime()) {
        buckets['This Week'].push(s);
      } else if (t >= monthStart.getTime()) {
        buckets['This Month'].push(s);
      } else {
        buckets['Older'].push(s);
      }
    }

    const order: SessionGroup[] = ['Today', 'Yesterday', 'This Week', 'This Month', 'Older'];
    return order
      .filter((g) => buckets[g].length > 0)
      .map((g) => ({ group: g, sessions: buckets[g] }));
  }

  /** Search sessions by keyword (matches title, model, gitBranch). */
  searchSessions(query: string): SessionInfo[] {
    const q = query.toLowerCase();
    return this.getSessionList().filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        s.model.toLowerCase().includes(q) ||
        s.gitBranch.toLowerCase().includes(q),
    );
  }

  /** Get a single session by its UUID. */
  getSession(id: string): SessionInfo | undefined {
    return this.sessions.get(id);
  }

  /** Delete a session by removing its JSONL file. Only deletes inside ~/.claude/projects/. */
  async deleteSession(id: string): Promise<boolean> {
    const session = this.sessions.get(id);
    if (!session) {
      return false;
    }
    // Safety: never delete outside the projects directory
    const projectsDir = this.getProjectsDir();
    if (!session.filePath.startsWith(projectsDir)) {
      console.error('SessionTracker: refusing to delete file outside projects dir');
      return false;
    }
    try {
      await fs.promises.unlink(session.filePath);
      this.sessions.delete(id);
      this._onSessionsChanged.fire(this.getSessionList());
      return true;
    } catch (err) {
      console.error(`SessionTracker: failed to delete session ${id}:`, err);
      return false;
    }
  }

  /**
   * Load full user/assistant messages from a session's JSONL file.
   * Returns them in order for replaying into the webview on resume.
   */
  async loadSessionMessages(sessionId: string): Promise<Array<Record<string, unknown>>> {
    // Try sessions map first, then construct the path as fallback
    let filePath = this.sessions.get(sessionId)?.filePath;
    if (!filePath) {
      const projectDir = this.getProjectDirForWorkspace();
      if (projectDir) {
        const candidate = path.join(this.getProjectsDir(), projectDir, `${sessionId}.jsonl`);
        if (fs.existsSync(candidate)) {
          filePath = candidate;
        }
      }
    }
    if (!filePath) {
      return [];
    }

    const messages: Array<Record<string, unknown>> = [];

    try {
      const fileStream = fs.createReadStream(filePath, { encoding: 'utf-8' });
      const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity,
      });

      for await (const line of rl) {
        if (!line.trim()) {
          continue;
        }
        let entry: Record<string, unknown>;
        try {
          entry = JSON.parse(line);
        } catch {
          continue;
        }

        const type = entry.type as string | undefined;

        // Include user messages (skip meta/synthetic context injections)
        if (type === 'user' && !entry.isMeta) {
          messages.push(entry);
        }
        // Include assistant messages
        else if (type === 'assistant') {
          messages.push(entry);
        }
      }
    } catch (err) {
      console.error(`SessionTracker: failed to load messages for ${sessionId}:`, err);
    }

    return messages;
  }

  /** Update a session's title (called when ai-title arrives during active session). */
  updateSessionTitle(sessionId: string, newTitle: string): void {
    const s = this.sessions.get(sessionId);
    if (s) {
      s.title = newTitle;
      this._onSessionsChanged.fire(this.getSessionList());
    }
  }

  dispose(): void {
    for (const d of this.disposables) {
      d.dispose();
    }
    this.disposables = [];
    this.sessions.clear();
  }
}
