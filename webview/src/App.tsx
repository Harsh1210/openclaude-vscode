import { vscode } from './vscode';

function App() {
  return (
    <div className="flex flex-col h-screen bg-vscode-bg text-vscode-fg">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-vscode-border">
        <h1 className="text-sm font-semibold">OpenClaude</h1>
        <span className="text-xs opacity-50">v0.1.0</span>
      </div>

      {/* Message area (placeholder) */}
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center opacity-50">
          <p className="text-lg font-semibold mb-2">OpenClaude</p>
          <p className="text-sm">AI coding assistant powered by any LLM</p>
          <p className="text-xs mt-4">Extension shell ready. Chat UI coming in Story 4.</p>
        </div>
      </div>

      {/* Input area (placeholder) */}
      <div className="px-4 py-3 border-t border-vscode-border">
        <div className="flex items-center rounded border border-vscode-input-border bg-vscode-input-bg px-3 py-2">
          <input
            type="text"
            placeholder="Type a message... (not connected yet)"
            className="flex-1 bg-transparent text-vscode-input-fg outline-none text-sm"
            disabled
          />
        </div>
      </div>
    </div>
  );
}

export default App;
