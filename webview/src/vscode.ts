interface WebviewApi<T> {
  postMessage(message: unknown): void;
  getState(): T | undefined;
  setState<S extends T>(newState: S): S;
}

declare function acquireVsCodeApi(): WebviewApi<unknown>;

class VSCodeAPIWrapper {
  private readonly vsCodeApi: WebviewApi<unknown> | undefined;

  constructor() {
    if (typeof acquireVsCodeApi === 'function') {
      this.vsCodeApi = acquireVsCodeApi();
    }
  }

  public postMessage(message: unknown): void {
    if (this.vsCodeApi) {
      this.vsCodeApi.postMessage(message);
    } else {
      console.log('VS Code API not available, message:', message);
    }
  }

  public getState(): unknown {
    return this.vsCodeApi?.getState();
  }

  public setState<T extends unknown>(state: T): T {
    if (this.vsCodeApi) {
      return this.vsCodeApi.setState(state);
    }
    return state;
  }
}

export const vscode = new VSCodeAPIWrapper();
