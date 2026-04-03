# Story 3 UPDATE: Real Protocol — Channel-Based Architecture

## CRITICAL CORRECTION: The Protocol is Channel-Based, NOT Simple PostMessage

After extracting the real Claude Code extension, the actual protocol is fundamentally different from what Story 3 originally described. This update replaces the simple `send_prompt`/`cli_output` pattern with the real channel-based architecture.

## Real Message Flow

```
Webview                    Extension Host              CLI (stdin/stdout)
  |                              |                           |
  |-- launch_claude ------------>|                           |
  |   {channelId, resume?,       |-- spawn CLI process ----->|
  |    permissionMode?}          |-- send initialize ------->|
  |                              |<-- init response ---------|
  |<-- request(init_response) ---|                           |
  |                              |                           |
  |-- io_message --------------->|                           |
  |   {channelId, message:       |-- write to stdin -------->|
  |    {type:'user',             |                           |
  |     message:{role:'user',    |<-- stdout messages -------|
  |      content:text}}}         |-- io_message ------------>|
  |                              |   {channelId, message}    |
  |<-- io_message ---------------|                           |
  |   {channelId, message:       |                           |
  |    {type:'assistant',...}}   |                           |
```

## Real WebviewBridge Implementation

Replace the current `WebviewBridge` with a channel-aware bridge:

```typescript
// src/webview/webviewBridge.ts

export class WebviewBridge {
  private channels = new Map<string, ChannelState>();
  private outstandingRequests = new Map<string, { resolve: Function, reject: Function }>();

  // Webview → Extension: main dispatch
  async fromClient(message: ClientMessage): Promise<void> {
    switch (message.type) {
      case 'launch_claude':
        await this.launchClaude(message.channelId, message.resume, message.cwd, message.permissionMode, message.thinkingLevel);
        break;
      case 'close_channel':
        this.closeChannel(message.channelId, false);
        break;
      case 'interrupt_claude':
        this.interruptClaude(message.channelId);
        break;
      case 'io_message':
        this.transportMessage(message.channelId, message.message, message.done);
        break;
      case 'request':
        this.handleRequest(message);
        break;
      case 'response':
        this.handleResponse(message);
        break;
      case 'cancel_request':
        this.handleCancellation(message.targetRequestId);
        break;
    }
  }

  // Extension → Webview: send a message
  send(message: ServerMessage): void {
    this.webview.postMessage(message);
  }

  // Forward CLI stdout to webview
  forwardCliMessage(channelId: string, message: unknown, done: boolean): void {
    this.send({ type: 'io_message', channelId, message, done });
  }

  // Send a request to webview and await response
  async sendRequest(channelId: string, request: unknown, signal?: AbortSignal): Promise<unknown> {
    const requestId = generateId();
    return new Promise((resolve, reject) => {
      this.outstandingRequests.set(requestId, { resolve, reject });
      if (signal) {
        signal.addEventListener('abort', () => {
          this.outstandingRequests.delete(requestId);
          this.send({ type: 'cancel_request', targetRequestId: requestId });
          reject(new Error('aborted'));
        }, { once: true });
      }
      this.send({ type: 'request', channelId, requestId, request });
    });
  }
}
```

## Real processRequest Cases

The `init` request returns the full state object:

```typescript
case 'init': {
  return {
    type: 'init_response',
    state: {
      defaultCwd: this.cwd,
      openNewInTab: false,
      showTerminalBanner: false,
      showReviewUpsellBanner: false,
      isOnboardingEnabled: false,
      isOnboardingDismissed: false,
      authStatus: this.getAuthStatus(),
      modelSetting: this.getModelSetting(),
      thinkingLevel: 'none',
      initialPermissionMode: config.get('initialPermissionMode', 'default'),
      allowDangerouslySkipPermissions: config.get('allowDangerouslySkipPermissions', false),
      platform: process.platform,
      useCtrlEnterToSend: config.get('useCtrlEnterToSend', false),
      spinnerVerbsConfig: null,
      settings: {},
      claudeSettings: {},
      experimentGates: {},
    }
  };
}
```

## Real Permission Request Flow

```typescript
// Extension sends to webview:
this.send({
  type: 'request',
  channelId,
  requestId: generateId(),
  request: {
    type: 'tool_permission_request',
    toolName: toolName,
    inputs: toolInput,
    suggestions: permissionSuggestions,
  }
});

// Webview responds:
{
  type: 'response',
  requestId,
  response: {
    result: {
      behavior: 'allow' | 'deny',
      toolUseID: toolUseId,
      updatedPermissions?: [...],
      message?: 'User denied',
    }
  }
}
```

## Real Session List Request

```typescript
// Webview sends:
{ type: 'request', requestId, request: { type: 'list_sessions_request' } }

// Extension responds:
{ type: 'response', requestId, response: { type: 'list_sessions_response', sessions: [...] } }
```

## Real State Update (extension → webview)

```typescript
// Extension pushes state updates:
this.send({
  type: 'request',
  channelId: '',
  requestId: generateId(),
  request: {
    type: 'session_states_update',
    sessions: [...],
    activeChannelId: channelId,
  }
});
```
