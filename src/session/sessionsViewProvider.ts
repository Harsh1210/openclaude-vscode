import * as vscode from 'vscode';
import { SessionTracker } from './sessionTracker';

/**
 * Lightweight WebviewViewProvider for the sessions sidebar.
 * Renders a standalone HTML page (not the full React webview) with search + grouped sessions.
 */
export class SessionsViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'openclaudeSessionsList';

  private view: vscode.WebviewView | undefined;
  private disposables: vscode.Disposable[] = [];

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly sessionTracker: SessionTracker,
  ) {}

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ): void {
    this.view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri],
    };

    webviewView.webview.html = this.getHtml();

    webviewView.webview.onDidReceiveMessage(
      async (msg) => {
        switch (msg.type) {
          case 'resumeSession':
            vscode.commands.executeCommand('openclaude.editor.open', msg.sessionId);
            break;
          case 'deleteSession':
            await this.sessionTracker.deleteSession(msg.sessionId);
            break;
          case 'newConversation':
            vscode.commands.executeCommand('openclaude.newConversation');
            break;
          case 'ready':
            this.pushSessions();
            break;
        }
      },
      undefined,
      this.disposables,
    );

    this.sessionTracker.onSessionsChanged(
      () => this.pushSessions(),
      undefined,
      this.disposables,
    );
  }

  private pushSessions(): void {
    if (!this.view) return;
    const grouped = this.sessionTracker.getGroupedSessions();
    this.view.webview.postMessage({
      type: 'sessionsData',
      grouped: grouped.map((g) => ({
        group: g.group,
        sessions: g.sessions.map((s) => ({
          id: s.id,
          title: s.title,
          model: s.model,
          timestamp: s.timestamp.toISOString(),
          messageCount: s.messageCount,
        })),
      })),
    });
  }

  private getHtml(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      background: var(--vscode-sideBar-background);
    }
    .header {
      display: flex; align-items: center; justify-content: space-between;
      padding: 8px 12px; border-bottom: 1px solid var(--vscode-panel-border);
    }
    .header-title {
      font-size: 11px; font-weight: 600; text-transform: uppercase;
      letter-spacing: 0.5px; opacity: 0.8;
    }
    .new-btn {
      background: none; border: none; color: var(--vscode-foreground);
      cursor: pointer; padding: 2px 6px; border-radius: 3px; font-size: 11px; opacity: 0.7;
    }
    .new-btn:hover { opacity: 1; background: var(--vscode-toolbar-hoverBackground); }
    .search-wrap { padding: 8px 12px; }
    .search-input {
      width: 100%; padding: 4px 8px; font-size: 11px;
      background: var(--vscode-input-background); color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border); border-radius: 3px; outline: none;
    }
    .search-input:focus { border-color: var(--vscode-focusBorder); }
    .group-label {
      padding: 6px 12px 2px; font-size: 10px; font-weight: 600;
      text-transform: uppercase; letter-spacing: 0.5px; opacity: 0.5;
    }
    .card {
      display: flex; align-items: flex-start; gap: 8px;
      padding: 6px 12px; cursor: pointer; border-radius: 3px; margin: 0 4px;
    }
    .card:hover { background: var(--vscode-list-hoverBackground); }
    .info { flex: 1; min-width: 0; }
    .title { font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .meta { font-size: 10px; opacity: 0.6; margin-top: 2px; }
    .del {
      background: none; border: none; color: var(--vscode-foreground);
      cursor: pointer; padding: 2px; border-radius: 3px; opacity: 0; flex-shrink: 0;
    }
    .card:hover .del { opacity: 0.5; }
    .del:hover { opacity: 1 !important; background: var(--vscode-toolbar-hoverBackground); }
    .empty { text-align: center; padding: 24px 12px; font-size: 11px; opacity: 0.5; }
    .list { overflow-y: auto; flex: 1; }
    .root { display: flex; flex-direction: column; height: 100vh; }
  </style>
</head>
<body>
  <div class="root">
    <div class="header">
      <span class="header-title">Sessions</span>
      <button class="new-btn" onclick="newConv()" title="New Conversation">+ New</button>
    </div>
    <div class="search-wrap">
      <input class="search-input" type="text" placeholder="Search sessions..." oninput="onSearch(this.value)" />
    </div>
    <div class="list" id="list"></div>
  </div>
  <script>
    const vscode = acquireVsCodeApi();
    let data = [];
    let q = '';

    function relTime(iso) {
      const d = Date.now() - new Date(iso).getTime();
      const m = Math.floor(d/60000), h = Math.floor(d/3600000), dd = Math.floor(d/86400000);
      if (m < 1) return 'just now';
      if (m < 60) return m + 'm ago';
      if (h < 24) return h + 'h ago';
      if (dd < 7) return dd + 'd ago';
      return new Date(iso).toLocaleDateString(undefined,{month:'short',day:'numeric'});
    }
    function esc(s) {
      return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }
    function cardHtml(s) {
      return '<div class="card" onclick="resume(\\'' + s.id + '\\')">' +
        '<div class="info"><div class="title" title="' + esc(s.title) + '">' + esc(s.title) + '</div>' +
        '<div class="meta">' + esc(s.model) + ' &middot; ' + relTime(s.timestamp) + ' &middot; ' + s.messageCount + ' msgs</div></div>' +
        '<button class="del" onclick="event.stopPropagation();del(\\'' + s.id + '\\')" title="Delete">' +
        '<svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M10 3h3v1h-1v9l-1 1H4l-1-1V4H2V3h3V2a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v1zM9 2H6v1h3V2zM4 13h7V4H4v9zm2-8H5v7h1V5zm1 0h1v7H7V5zm2 0h1v7H9V5z"/></svg>' +
        '</button></div>';
    }
    function render() {
      const el = document.getElementById('list');
      if (q) {
        const flat = data.flatMap(g => g.sessions);
        const f = flat.filter(s => s.title.toLowerCase().includes(q) || s.model.toLowerCase().includes(q));
        el.innerHTML = f.length ? f.map(cardHtml).join('') : '<div class="empty">No matches</div>';
        return;
      }
      if (!data.length) { el.innerHTML = '<div class="empty">No past sessions</div>'; return; }
      el.innerHTML = data.map(g =>
        '<div class="group-label">' + g.group + '</div>' + g.sessions.map(cardHtml).join('')
      ).join('');
    }
    function resume(id) { vscode.postMessage({type:'resumeSession',sessionId:id}); }
    function del(id) { vscode.postMessage({type:'deleteSession',sessionId:id}); }
    function newConv() { vscode.postMessage({type:'newConversation'}); }
    function onSearch(v) { q = v.toLowerCase(); render(); }

    window.addEventListener('message', e => {
      if (e.data.type === 'sessionsData') { data = e.data.grouped; render(); }
    });
    vscode.postMessage({type:'ready'});
  </script>
</body>
</html>`;
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
  }
}
