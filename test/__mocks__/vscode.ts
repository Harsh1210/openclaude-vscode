// Comprehensive VS Code API mock for unit testing outside Extension Development Host

export enum ColorThemeKind {
  Light = 1,
  Dark = 2,
  HighContrast = 3,
  HighContrastLight = 4,
}

export enum ViewColumn {
  Active = -1,
  Beside = -2,
  One = 1,
  Two = 2,
  Three = 3,
  Four = 4,
  Five = 5,
  Six = 6,
  Seven = 7,
  Eight = 8,
  Nine = 9,
}

export enum StatusBarAlignment {
  Left = 1,
  Right = 2,
}

export enum UIKind {
  Desktop = 1,
  Web = 2,
}

export class Uri {
  static joinPath(base: Uri, ...paths: string[]): Uri {
    return new Uri(`${base.fsPath}/${paths.join('/')}`);
  }

  static file(path: string): Uri {
    return new Uri(path);
  }

  static parse(value: string): Uri {
    // Parse scheme:path format (e.g., "openclaude-diff-original:/test/file.ts")
    const colonIndex = value.indexOf(':');
    if (colonIndex > 0) {
      const scheme = value.substring(0, colonIndex);
      const path = value.substring(colonIndex + 1);
      const uri = new Uri(path);
      (uri as { scheme: string }).scheme = scheme;
      return uri;
    }
    return new Uri(value);
  }

  readonly fsPath: string;
  readonly scheme = 'file';
  readonly path: string;

  constructor(fsPath: string) {
    this.fsPath = fsPath;
    this.path = fsPath;
  }

  toString(): string {
    return this.fsPath;
  }
}

export class EventEmitter<T> {
  private listeners: ((e: T) => void)[] = [];

  event = (listener: (e: T) => void) => {
    this.listeners.push(listener);
    return { dispose: () => {
      const idx = this.listeners.indexOf(listener);
      if (idx >= 0) this.listeners.splice(idx, 1);
    }};
  };

  fire(data: T): void {
    for (const listener of this.listeners) {
      listener(data);
    }
  }

  dispose(): void {
    this.listeners = [];
  }
}

export class ThemeColor {
  constructor(public readonly id: string) {}
}

export class ThemeIcon {
  static readonly File = new ThemeIcon('file');
  static readonly Folder = new ThemeIcon('folder');
  constructor(public readonly id: string) {}
}

export class Disposable {
  static from(...disposables: { dispose: () => void }[]): Disposable {
    return new Disposable(() => {
      for (const d of disposables) d.dispose();
    });
  }

  constructor(private callOnDispose: () => void) {}

  dispose(): void {
    this.callOnDispose();
  }
}

class MockWebview {
  options: Record<string, unknown> = {};
  html = '';
  private messageEmitter = new EventEmitter<unknown>();
  private postedMessages: unknown[] = [];

  get cspSource(): string {
    return 'https://mock.csp.source';
  }

  onDidReceiveMessage = this.messageEmitter.event;

  postMessage(message: unknown): Thenable<boolean> {
    this.postedMessages.push(message);
    return Promise.resolve(true);
  }

  asWebviewUri(uri: Uri): Uri {
    return uri;
  }

  // Test helpers
  simulateMessage(message: unknown): void {
    this.messageEmitter.fire(message);
  }

  getPostedMessages(): unknown[] {
    return [...this.postedMessages];
  }

  clearPostedMessages(): void {
    this.postedMessages = [];
  }
}

export function createMockWebview(): MockWebview {
  return new MockWebview();
}

export class TabInputWebview {
  constructor(public readonly viewType: string) {}
}

const onDidCloseTerminalEmitter = new EventEmitter<unknown>();

export const window = {
  activeColorTheme: { kind: ColorThemeKind.Dark },
  onDidCloseTerminal: onDidCloseTerminalEmitter.event,
  createTerminal: (_options?: unknown) => ({
    name: 'mock-terminal',
    sendText: (_text: string) => {},
    show: () => {},
    dispose: () => {},
  }),
  createWebviewPanel: (_viewType: string, _title: string, _column: ViewColumn, _options: unknown) => {
    const webview = createMockWebview();
    return {
      webview,
      viewColumn: ViewColumn.One,
      visible: true,
      active: true,
      iconPath: undefined as unknown,
      title: _title,
      reveal: () => {},
      dispose: () => {},
      onDidChangeViewState: new EventEmitter<unknown>().event,
      onDidDispose: new EventEmitter<void>().event,
    };
  },
  createOutputChannel: (_name: string, _options?: unknown) => ({
    info: (..._args: unknown[]) => {},
    warn: (..._args: unknown[]) => {},
    error: (..._args: unknown[]) => {},
    show: () => {},
    dispose: () => {},
  }),
  createStatusBarItem: () => ({
    text: '',
    command: '',
    tooltip: '',
    show: () => {},
    hide: () => {},
    dispose: () => {},
  }),
  registerWebviewViewProvider: () => ({ dispose: () => {} }),
  registerWebviewPanelSerializer: () => ({ dispose: () => {} }),
  showInformationMessage: () => {},
  showWarningMessage: () => {},
  showErrorMessage: () => {},
  onDidChangeActiveColorTheme: new EventEmitter<unknown>().event,
  tabGroups: {
    all: [] as { viewColumn?: ViewColumn; tabs: { input: unknown }[] }[],
    activeTabGroup: { activeTab: undefined as unknown },
    onDidChangeTabs: new EventEmitter<unknown>().event,
    close: async () => {},
  },
  activeTextEditor: undefined,
};

export const workspace = {
  getConfiguration: (_section?: string) => ({
    get: <T>(_key: string, defaultValue?: T): T | undefined => defaultValue,
  }),
  onDidChangeConfiguration: new EventEmitter<unknown>().event,
  asRelativePath: (path: string) => path,
  workspaceFolders: [],
  isTrusted: true,
  textDocuments: [] as unknown[],
  registerTextDocumentContentProvider: (_scheme: string, _provider: unknown) => ({
    dispose: () => {},
  }),
};

export const commands = {
  registerCommand: (_command: string, _callback: (...args: unknown[]) => unknown) => ({
    dispose: () => {},
  }),
  executeCommand: async (_command: string, ..._args: unknown[]) => {},
};

export const env = {
  uiKind: UIKind.Desktop,
  clipboard: {
    writeText: async (_text: string) => {},
    readText: async () => '',
  },
};

export const version = '1.106.0';

export default {
  ColorThemeKind,
  ViewColumn,
  StatusBarAlignment,
  UIKind,
  Uri,
  EventEmitter,
  Disposable,
  ThemeColor,
  ThemeIcon,
  TabInputWebview,
  window,
  workspace,
  commands,
  env,
  version,
};
