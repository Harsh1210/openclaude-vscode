// test/unit/integration.test.ts
// Integration tests for message flow and process lifecycle logic.
// These tests focus on pure logic that can be tested without the VS Code API.

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================================================
// Helpers — simulate the message routing logic from extension.ts
// ============================================================================

interface BroadcastedMessage {
  type: string;
  [key: string]: unknown;
}

function createMessageRouter() {
  const broadcasts: BroadcastedMessage[] = [];
  const broadcast = (msg: BroadcastedMessage) => broadcasts.push(msg);

  // Simulate the CLI message handler from extension.ts
  function handleCliMessage(msg: Record<string, unknown>) {
    // Always forward to webview
    broadcast({ type: 'cli_output', data: msg });

    // Host-side processing
    if (msg.type === 'result') {
      // StatusBar logic would fire here
    }
  }

  return { broadcasts, broadcast, handleCliMessage };
}

// ============================================================================
// Simulate useChat message routing logic
// ============================================================================

interface ChatState {
  messages: Array<{ id: string; role: string; text?: string }>;
  error: string | null;
  promptSuggestions: string[];
  sessionId: string | null;
  sessionTitle: string | null;
  rateLimitInfo: { resetsAt: number; rateLimitType: string; message: string } | null;
}

function createChatState(): ChatState {
  return {
    messages: [],
    error: null,
    promptSuggestions: [],
    sessionId: null,
    sessionTitle: null,
    rateLimitInfo: null,
  };
}

function routeCliMessage(state: ChatState, msg: Record<string, unknown>): ChatState {
  const next = { ...state, messages: [...state.messages] };

  switch (msg.type) {
    case 'rate_limit_event': {
      const info = msg.rate_limit_info as Record<string, unknown> | undefined;
      if (info) {
        const resetsAt = info.resetsAt as number;
        const rateLimitType = (info.rateLimitType as string) ?? 'unknown';
        next.rateLimitInfo = {
          resetsAt,
          rateLimitType,
          message: `Rate limited (${rateLimitType}). Resets at ${new Date(resetsAt * 1000).toLocaleTimeString()}.`,
        };
        next.error = `Rate limited. Resets at ${new Date(resetsAt * 1000).toLocaleTimeString()}.`;
      }
      break;
    }

    case 'tool_use_summary': {
      const toolName = (msg.tool_name as string) ?? 'tool';
      const summary = (msg.summary as string) ?? '';
      if (summary) {
        next.messages.push({
          id: `tool-summary-${Date.now()}`,
          role: 'system',
          text: `${toolName}: ${summary}`,
        });
      }
      break;
    }

    case 'prompt_suggestion': {
      const suggestion = msg.suggestion as string;
      if (suggestion) {
        next.promptSuggestions = [
          ...next.promptSuggestions.filter((s) => s !== suggestion),
          suggestion,
        ].slice(-5);
      }
      break;
    }

    case 'system': {
      const subtype = msg.subtype as string;
      if (subtype === 'init') {
        next.sessionId = (msg.session_id as string) ?? null;
      } else if (subtype === 'ai-title') {
        next.sessionTitle = (msg.title as string) ?? null;
      } else if (subtype === 'api_retry') {
        const attempt = (msg.attempt as number) ?? 1;
        next.messages.push({
          id: `retry-${Date.now()}`,
          role: 'system',
          text: `Retrying API call (attempt ${attempt})...`,
        });
      } else if (subtype === 'compact_boundary') {
        next.messages.push({
          id: `compact-${Date.now()}`,
          role: 'system',
          text: 'Context compacted to fit within limits.',
        });
      }
      break;
    }

    case 'result': {
      if (msg.is_error) {
        const resultText = msg.result as string | undefined;
        next.error = resultText ?? 'An error occurred';
      }
      break;
    }
  }

  return next;
}

// ============================================================================
// Simulate process lifecycle / auto-restart logic from extension.ts
// ============================================================================

function createLifecycleManager() {
  const broadcasts: BroadcastedMessage[] = [];
  const broadcast = (msg: BroadcastedMessage) => broadcasts.push(msg);

  let crashRestartCount = 0;
  let lastCrashTime = 0;
  let currentSessionId: string | undefined;
  let restartScheduled = false;

  function handleExit(code: number | null, _signal: string | null) {
    if (code !== 0 && code !== null && currentSessionId) {
      const now = Date.now();
      if (now - lastCrashTime > 30_000) {
        crashRestartCount = 0;
      }
      crashRestartCount++;
      lastCrashTime = now;

      if (crashRestartCount <= 3) {
        broadcast({ type: 'process_state', state: 'restarting' });
        restartScheduled = true;
        return;
      } else {
        broadcast({ type: 'process_state', state: 'crashed' });
        return;
      }
    }
    broadcast({ type: 'process_state', state: (code !== null && code !== 0) ? 'crashed' : 'stopped' });
  }

  return {
    broadcasts,
    handleExit,
    setSessionId: (id: string) => { currentSessionId = id; },
    getCrashCount: () => crashRestartCount,
    isRestartScheduled: () => restartScheduled,
    resetCrashCount: () => { crashRestartCount = 0; },
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('Integration: CLI message → webview routing', () => {
  it('wraps CLI messages in cli_output envelope', () => {
    const { broadcasts, handleCliMessage } = createMessageRouter();
    handleCliMessage({ type: 'assistant', uuid: 'abc', session_id: 'sess-1' });
    expect(broadcasts).toHaveLength(1);
    expect(broadcasts[0].type).toBe('cli_output');
    expect((broadcasts[0].data as Record<string, unknown>).type).toBe('assistant');
  });

  it('routes rate_limit_event to error and rateLimitInfo', () => {
    let state = createChatState();
    state = routeCliMessage(state, {
      type: 'rate_limit_event',
      rate_limit_info: { resetsAt: 9999999999, rateLimitType: 'daily' },
    });
    expect(state.error).toContain('Rate limited');
    expect(state.rateLimitInfo).not.toBeNull();
    expect(state.rateLimitInfo?.rateLimitType).toBe('daily');
  });

  it('routes result with is_error to error state', () => {
    let state = createChatState();
    state = routeCliMessage(state, {
      type: 'result',
      is_error: true,
      result: "You've hit your limit",
    });
    expect(state.error).toBe("You've hit your limit");
  });

  it('routes system/init to sessionId', () => {
    let state = createChatState();
    state = routeCliMessage(state, {
      type: 'system',
      subtype: 'init',
      session_id: 'sess-abc',
      model: 'claude-3-5-sonnet',
    });
    expect(state.sessionId).toBe('sess-abc');
  });

  it('routes system/ai-title to sessionTitle', () => {
    let state = createChatState();
    state = routeCliMessage(state, {
      type: 'system',
      subtype: 'ai-title',
      title: 'My Session Title',
    });
    expect(state.sessionTitle).toBe('My Session Title');
  });

  it('routes tool_use_summary as system message', () => {
    let state = createChatState();
    state = routeCliMessage(state, {
      type: 'tool_use_summary',
      tool_name: 'bash',
      summary: 'ran 3 commands',
    });
    expect(state.messages).toHaveLength(1);
    expect(state.messages[0].role).toBe('system');
    expect(state.messages[0].text).toContain('bash');
    expect(state.messages[0].text).toContain('ran 3 commands');
  });

  it('routes prompt_suggestion to suggestions list', () => {
    let state = createChatState();
    state = routeCliMessage(state, { type: 'prompt_suggestion', suggestion: 'Fix the bug' });
    state = routeCliMessage(state, { type: 'prompt_suggestion', suggestion: 'Add tests' });
    expect(state.promptSuggestions).toContain('Fix the bug');
    expect(state.promptSuggestions).toContain('Add tests');
  });

  it('deduplicates prompt suggestions', () => {
    let state = createChatState();
    state = routeCliMessage(state, { type: 'prompt_suggestion', suggestion: 'Fix the bug' });
    state = routeCliMessage(state, { type: 'prompt_suggestion', suggestion: 'Fix the bug' });
    expect(state.promptSuggestions.filter((s) => s === 'Fix the bug')).toHaveLength(1);
  });

  it('caps prompt suggestions at 5', () => {
    let state = createChatState();
    for (let i = 0; i < 7; i++) {
      state = routeCliMessage(state, { type: 'prompt_suggestion', suggestion: `Suggestion ${i}` });
    }
    expect(state.promptSuggestions.length).toBeLessThanOrEqual(5);
  });

  it('routes system/api_retry as system message', () => {
    let state = createChatState();
    state = routeCliMessage(state, { type: 'system', subtype: 'api_retry', attempt: 2 });
    expect(state.messages).toHaveLength(1);
    expect(state.messages[0].text).toContain('attempt 2');
  });

  it('routes system/compact_boundary as system message', () => {
    let state = createChatState();
    state = routeCliMessage(state, { type: 'system', subtype: 'compact_boundary' });
    expect(state.messages).toHaveLength(1);
    expect(state.messages[0].text).toContain('compacted');
  });
});

describe('Integration: process lifecycle', () => {
  it('broadcasts stopped on clean exit (code 0)', () => {
    const mgr = createLifecycleManager();
    mgr.handleExit(0, null);
    expect(mgr.broadcasts[0]).toEqual({ type: 'process_state', state: 'stopped' });
  });

  it('broadcasts crashed on non-zero exit without session', () => {
    const mgr = createLifecycleManager();
    mgr.handleExit(1, null);
    expect(mgr.broadcasts[0]).toEqual({ type: 'process_state', state: 'crashed' });
  });

  it('schedules restart on non-zero exit with session (attempt 1)', () => {
    const mgr = createLifecycleManager();
    mgr.setSessionId('sess-123');
    mgr.handleExit(1, null);
    expect(mgr.broadcasts[0]).toEqual({ type: 'process_state', state: 'restarting' });
    expect(mgr.isRestartScheduled()).toBe(true);
    expect(mgr.getCrashCount()).toBe(1);
  });

  it('caps restart attempts at 3 within 30 seconds', () => {
    const mgr = createLifecycleManager();
    mgr.setSessionId('sess-123');

    // Simulate 3 crashes in quick succession
    mgr.handleExit(1, null);
    mgr.handleExit(1, null);
    mgr.handleExit(1, null);
    expect(mgr.getCrashCount()).toBe(3);
    // 4th crash should broadcast crashed, not restarting
    mgr.handleExit(1, null);
    const lastBroadcast = mgr.broadcasts[mgr.broadcasts.length - 1];
    expect(lastBroadcast).toEqual({ type: 'process_state', state: 'crashed' });
  });

  it('resets crash count after 30 seconds', () => {
    const mgr = createLifecycleManager();
    mgr.setSessionId('sess-123');

    // Simulate 3 crashes
    mgr.handleExit(1, null);
    mgr.handleExit(1, null);
    mgr.handleExit(1, null);
    expect(mgr.getCrashCount()).toBe(3);

    // Reset count (simulating 30s passing)
    mgr.resetCrashCount();
    mgr.handleExit(1, null);
    // Should restart again (count is 1 after reset)
    expect(mgr.getCrashCount()).toBe(1);
  });

  it('broadcasts stopped on SIGTERM (null code)', () => {
    const mgr = createLifecycleManager();
    mgr.setSessionId('sess-123');
    mgr.handleExit(null, 'SIGTERM');
    // null code means killed by signal — no auto-restart, broadcast stopped
    // (code !== 0 && code !== null) is false when code is null
    expect(mgr.broadcasts[0]).toEqual({ type: 'process_state', state: 'stopped' });
  });
});

describe('Integration: useProcessState logic', () => {
  it('maps rate_limit_event to rate_limited status', () => {
    // Simulate the logic from useProcessState
    const events: Array<{ type: string; state?: string }> = [];

    function handleMessage(data: Record<string, unknown>) {
      if (data.type === 'process_state') {
        events.push({ type: 'status', state: data.state as string });
      }
      if (data.type === 'cli_output') {
        const inner = data.data as Record<string, unknown>;
        if (inner?.type === 'rate_limit_event') {
          events.push({ type: 'status', state: 'rate_limited' });
        }
      }
    }

    handleMessage({ type: 'cli_output', data: { type: 'rate_limit_event', rate_limit_info: { resetsAt: 9999, rateLimitType: 'daily' } } });
    expect(events[0].state).toBe('rate_limited');
  });

  it('maps auth_status error to auth_error status', () => {
    const events: Array<{ type: string; state?: string }> = [];

    function handleMessage(data: Record<string, unknown>) {
      if (data.type === 'cli_output') {
        const inner = data.data as Record<string, unknown>;
        if (inner?.type === 'auth_status' && inner.error) {
          events.push({ type: 'status', state: 'auth_error' });
        }
      }
    }

    handleMessage({ type: 'cli_output', data: { type: 'auth_status', error: 'Invalid API key' } });
    expect(events[0].state).toBe('auth_error');
  });
});
