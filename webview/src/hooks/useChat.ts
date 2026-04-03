import { useState, useCallback, useEffect, useRef } from 'react';
import { vscode } from '../vscode';
import { useStream } from './useStream';
import type { ChatMessage, SessionCost } from '../types/chat';
import type {
  SDKMessage,
  StreamEvent,
  AssistantMessage,
  UserMessage,
  ResultMessage,
  SystemInitMessage,
} from '../types/messages';

const EMPTY_COST: SessionCost = {
  totalCostUSD: 0,
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheCreationTokens: 0,
  numTurns: 0,
  durationMs: 0,
};

export interface RateLimitInfo {
  resetsAt: number;       // Unix timestamp seconds
  rateLimitType: string;
  message: string;
}

export interface ToolActivity {
  toolName: string;
  description: string;  // e.g. "Editing src/App.tsx" or "Running: npm test"
}

/** Format a human-readable description of tool activity */
function formatToolActivity(
  toolName: string,
  progress?: string,
  input?: Record<string, unknown>,
): string {
  if (progress) return progress;

  // Map known tool names to human-readable descriptions
  const name = toolName.toLowerCase();

  if (name.includes('bash') || name.includes('terminal')) {
    const cmd = input?.command as string;
    if (cmd) {
      const short = cmd.length > 60 ? cmd.slice(0, 57) + '...' : cmd;
      return `Running: ${short}`;
    }
    return 'Running command...';
  }

  if (name.includes('edit') || name.includes('write') || name.includes('file_edit')) {
    const filePath = (input?.file_path ?? input?.path ?? input?.filename) as string;
    if (filePath) {
      const fileName = filePath.split('/').pop() ?? filePath;
      return `Editing ${fileName}`;
    }
    return 'Editing file...';
  }

  if (name.includes('read')) {
    const filePath = (input?.file_path ?? input?.path ?? input?.filename) as string;
    if (filePath) {
      const fileName = filePath.split('/').pop() ?? filePath;
      return `Reading ${fileName}`;
    }
    return 'Reading file...';
  }

  if (name.includes('search') || name.includes('grep') || name.includes('glob')) {
    const pattern = (input?.pattern ?? input?.query ?? input?.regex) as string;
    if (pattern) return `Searching: ${pattern}`;
    return 'Searching...';
  }

  if (name.includes('web') || name.includes('fetch') || name.includes('browser')) {
    return 'Browsing web...';
  }

  return `${toolName}...`;
}

export function useChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sessionTitle, setSessionTitle] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [cost, setCost] = useState<SessionCost>(EMPTY_COST);
  const [isStreaming, setIsStreaming] = useState(false);
  const [model, setModel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rateLimitInfo, setRateLimitInfo] = useState<RateLimitInfo | null>(null);
  const [promptSuggestions, setPromptSuggestions] = useState<string[]>([]);
  const [processState, setProcessState] = useState<'idle' | 'starting' | 'running' | 'stopped' | 'crashed'>('idle');
  const [fastModeState, setFastModeState] = useState<{ enabled: boolean; canToggle: boolean }>({
    enabled: false,
    canToggle: true,
  });
  const [availableModels, setAvailableModels] = useState<Array<{ value: string; displayName: string }>>([]);
  const [effortLevel, setEffortLevel] = useState<string>('medium');
  const [toolActivity, setToolActivity] = useState<ToolActivity | null>(null);

  const { processStreamEvent, resetStream } = useStream();
  const streamingUuidRef = useRef<string | null>(null);

  const handleUserMessage = useCallback((msg: UserMessage) => {
    const text =
      typeof msg.message.content === 'string'
        ? msg.message.content
        : '[complex content]';

    const chatMsg: ChatMessage = {
      id: msg.uuid || `user-${Date.now()}`,
      role: 'user',
      text,
      isStreaming: false,
      timestamp: Date.now(),
      parentToolUseId: null,
    };
    setMessages((prev) => [...prev, chatMsg]);
  }, []);

  const handleStreamEvent = useCallback(
    (streamEvent: StreamEvent) => {
      const update = processStreamEvent(streamEvent);

      switch (update.type) {
        case 'message_start': {
          streamingUuidRef.current = update.uuid;
          setIsStreaming(true);
          if (update.model) setModel(update.model);

          const chatMsg: ChatMessage = {
            id: update.uuid,
            role: 'assistant',
            blocks: [],
            isStreaming: true,
            timestamp: Date.now(),
            parentToolUseId: update.parentToolUseId,
            model: update.model || undefined,
          };
          setMessages((prev) => [...prev, chatMsg]);
          break;
        }

        case 'block_start':
        case 'block_delta':
        case 'block_stop': {
          const uuid = streamingUuidRef.current;
          if (!uuid) break;
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === uuid ? { ...msg, blocks: update.blocks } : msg,
            ),
          );
          // Extract tool activity from tool_use blocks
          if (update.type === 'block_start' && update.blocks) {
            const latestBlock = update.blocks[update.blocks.length - 1];
            if (latestBlock) {
              const block = latestBlock.block;
              if (block.type === 'tool_use' || block.type === 'server_tool_use') {
                const toolInput = (block as { input?: Record<string, unknown> }).input;
                setToolActivity({
                  toolName: block.name,
                  description: formatToolActivity(block.name, undefined, toolInput),
                });
              }
            }
          }
          break;
        }

        case 'message_stop': {
          const uuid = streamingUuidRef.current;
          if (uuid) {
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === uuid
                  ? {
                      ...msg,
                      isStreaming: false,
                      blocks: msg.blocks?.map((b) => ({ ...b, isStreaming: false })),
                    }
                  : msg,
              ),
            );
          }
          setIsStreaming(false);
          setToolActivity(null);
          streamingUuidRef.current = null;
          resetStream();
          break;
        }
      }
    },
    [processStreamEvent, resetStream],
  );

  const handleAssistantMessage = useCallback((msg: AssistantMessage) => {
    const blocks = (msg.message.content || []).map((block, index) => ({
      index,
      block,
      isStreaming: false,
    }));

    const chatMsg: ChatMessage = {
      id: msg.uuid,
      role: 'assistant',
      blocks,
      isStreaming: false,
      timestamp: Date.now(),
      parentToolUseId: msg.parent_tool_use_id,
      model: msg.message.model,
    };
    setMessages((prev) => [...prev, chatMsg]);
  }, []);

  const handleResultMessage = useCallback((msg: ResultMessage) => {
    setIsStreaming(false);
    setToolActivity(null);
    streamingUuidRef.current = null;
    resetStream();

    setCost({
      totalCostUSD: msg.total_cost_usd,
      inputTokens: msg.usage?.inputTokens ?? 0,
      outputTokens: msg.usage?.outputTokens ?? 0,
      cacheReadTokens: msg.usage?.cacheReadInputTokens ?? 0,
      cacheCreationTokens: msg.usage?.cacheCreationInputTokens ?? 0,
      numTurns: msg.num_turns,
      durationMs: msg.duration_ms,
    });

    if (msg.is_error) {
      // Parse rate limit from result text e.g. "You've hit your limit · resets 3am (America/New_York)"
      const resultText = (msg as unknown as Record<string, unknown>).result as string | undefined;
      if (resultText) {
        setError(resultText);
      } else if (msg.errors && msg.errors.length > 0) {
        setError(msg.errors.join('\n'));
      } else {
        setError('An error occurred');
      }
    }
  }, [resetStream]);

  const handleSystemInit = useCallback((msg: SystemInitMessage) => {
    setSessionId(msg.session_id);
    setModel(msg.model);
  }, []);

  const handleSessionTitle = useCallback((title: string) => {
    setSessionTitle(title);
  }, []);

  // Add a system-style inline message to the chat
  const addSystemMessage = useCallback((text: string, id?: string) => {
    setMessages((prev) => [
      ...prev,
      {
        id: id ?? `sys-${Date.now()}`,
        role: 'system' as const,
        text,
        isStreaming: false,
        timestamp: Date.now(),
        parentToolUseId: null,
      },
    ]);
  }, []);

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const data = event.data;
      if (!data || typeof data !== 'object') return;

      // Handle process state changes
      if (data.type === 'process_state') {
        setProcessState(data.state);
        if (data.state === 'stopped' || data.state === 'crashed') {
          setIsStreaming(false);
          setToolActivity(null);
          streamingUuidRef.current = null;
        }
        // Clear errors when process comes back up
        if (data.state === 'running' || data.state === 'starting') {
          setError(null);
          setRateLimitInfo(null);
        }
        return;
      }

      // Unwrap cli_output envelope
      const msg: SDKMessage = data.type === 'cli_output' ? data.data : data;
      if (!msg || typeof msg !== 'object') return;

      try {
        const msgAny = msg as Record<string, unknown>;

        switch (msgAny.type) {
          case 'stream_event':
            handleStreamEvent(msg as StreamEvent);
            break;

          case 'user':
            handleUserMessage(msg as UserMessage);
            break;

          case 'assistant':
            handleAssistantMessage(msg as AssistantMessage);
            break;

          case 'result':
            handleResultMessage(msg as ResultMessage);
            {
              const resultAny = msg as Record<string, unknown>;
              if (resultAny.fast_mode_state) {
                const fms = resultAny.fast_mode_state as Record<string, unknown>;
                setFastModeState({
                  enabled: (fms.enabled as boolean) ?? false,
                  canToggle: (fms.canToggle as boolean) ?? true,
                });
              }
              if (typeof resultAny.effort === 'string') {
                setEffortLevel(resultAny.effort);
              }
            }
            break;

          case 'rate_limit_event': {
            const info = msgAny.rate_limit_info as Record<string, unknown> | undefined;
            if (info) {
              const resetsAt = info.resetsAt as number;
              const rateLimitType = info.rateLimitType as string ?? 'unknown';
              const resetTime = resetsAt
                ? new Date(resetsAt * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                : 'soon';
              setRateLimitInfo({
                resetsAt,
                rateLimitType,
                message: `Rate limited (${rateLimitType}). Resets at ${resetTime}.`,
              });
              setError(`Rate limited. Resets at ${resetTime}.`);
            }
            break;
          }

          case 'tool_progress': {
            // Show tool progress inline — update last assistant message or add system msg
            const toolName = msgAny.tool_name as string ?? 'tool';
            const progress = msgAny.progress as string ?? '';
            // Update tool activity indicator
            if (toolName || progress) {
              setToolActivity({
                toolName,
                description: formatToolActivity(toolName, progress, undefined),
              });
            }
            // Don't add a message for every progress tick — just update streaming state
            if (progress) {
              setMessages((prev) => {
                const last = prev[prev.length - 1];
                if (last?.role === 'assistant' && last.isStreaming) {
                  return prev; // already showing streaming indicator
                }
                return prev;
              });
            }
            break;
          }

          case 'tool_use_summary': {
            const toolName = msgAny.tool_name as string ?? 'tool';
            const summary = msgAny.summary as string ?? '';
            if (summary) {
              addSystemMessage(`${toolName}: ${summary}`, `tool-summary-${Date.now()}`);
            }
            // Clear tool activity after summary
            setToolActivity(null);
            break;
          }

          case 'prompt_suggestion': {
            const suggestion = msgAny.suggestion as string;
            if (suggestion) {
              setPromptSuggestions((prev) =>
                [...prev.filter((s) => s !== suggestion), suggestion].slice(-5),
              );
            }
            break;
          }

          case 'system': {
            const subtype = msgAny.subtype as string;
            switch (subtype) {
              case 'init':
                handleSystemInit(msg as SystemInitMessage);
                {
                  const initAny = msg as Record<string, unknown>;
                  if (initAny.fast_mode_state) {
                    const fms = initAny.fast_mode_state as Record<string, unknown>;
                    setFastModeState({
                      enabled: (fms.enabled as boolean) ?? false,
                      canToggle: (fms.canToggle as boolean) ?? true,
                    });
                  }
                  if (Array.isArray(initAny.models)) {
                    setAvailableModels(
                      (initAny.models as Array<Record<string, unknown>>)
                        .map((m) => ({
                          value: (m.value as string) || (m.id as string) || '',
                          displayName: (m.displayName as string) || (m.name as string) || (m.value as string) || '',
                        }))
                        .filter((m) => m.value),
                    );
                  }
                  if (typeof initAny.effort === 'string') {
                    setEffortLevel(initAny.effort);
                  }
                }
                break;
              case 'ai-title': {
                const title = msgAny.title as string;
                if (title) handleSessionTitle(title);
                break;
              }
              case 'api_retry': {
                const attempt = msgAny.attempt as number ?? 1;
                addSystemMessage(`Retrying API call (attempt ${attempt})...`, `retry-${Date.now()}`);
                break;
              }
              case 'compact_boundary':
                addSystemMessage('Context compacted to fit within limits.', `compact-${Date.now()}`);
                break;
              // hook_started, hook_response, session_state_changed, files_persisted
              // — handled by extension host, ignore in webview
              default:
                break;
            }
            break;
          }

          default:
            break;
        }

        // Session title from extension host (legacy format)
        if (data.type === 'sessionTitle' && typeof data.title === 'string') {
          handleSessionTitle(data.title);
        }

        // Clear messages on new conversation
        if (data.type === 'clearMessages') {
          setMessages([]);
          setSessionTitle(null);
          setCost(EMPTY_COST);
          setIsStreaming(false);
          setError(null);
          setRateLimitInfo(null);
          setPromptSuggestions([]);
          setToolActivity(null);
          streamingUuidRef.current = null;
          resetStream();
        }

      } catch (err) {
        console.error('[useChat] Error processing message:', err, data);
      }
    };

    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [
    handleStreamEvent,
    handleUserMessage,
    handleAssistantMessage,
    handleResultMessage,
    handleSystemInit,
    handleSessionTitle,
    addSystemMessage,
    resetStream,
  ]);

  const sendMessage = useCallback((text: string) => {
    if (!text.trim()) return;

    // Optimistically add user message
    const id = `user-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setMessages((prev) => [
      ...prev,
      {
        id,
        role: 'user',
        text,
        isStreaming: false,
        timestamp: Date.now(),
        parentToolUseId: null,
      },
    ]);
    setError(null);
    setRateLimitInfo(null);
    setPromptSuggestions([]);

    vscode.postMessage({ type: 'send_prompt', text });
  }, []);

  const clearMessages = useCallback(() => {
    setMessages([]);
    setSessionTitle(null);
    setCost(EMPTY_COST);
    setIsStreaming(false);
    setError(null);
    setRateLimitInfo(null);
    setPromptSuggestions([]);
    setToolActivity(null);
    streamingUuidRef.current = null;
    resetStream();
  }, [resetStream]);

  const interrupt = useCallback(() => {
    vscode.postMessage({ type: 'interrupt' });
    setIsStreaming(false);
  }, []);

  return {
    messages,
    sessionTitle,
    sessionId,
    cost,
    isStreaming,
    model,
    error,
    rateLimitInfo,
    promptSuggestions,
    processState,
    fastModeState,
    setFastModeState,
    availableModels,
    effortLevel,
    setEffortLevel,
    toolActivity,
    sendMessage,
    clearMessages,
    interrupt,
  };
}
