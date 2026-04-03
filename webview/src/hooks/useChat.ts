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

export function useChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sessionTitle, setSessionTitle] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [cost, setCost] = useState<SessionCost>(EMPTY_COST);
  const [isStreaming, setIsStreaming] = useState(false);
  const [model, setModel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { processStreamEvent, resetStream } = useStream();

  // Track the UUID of the current streaming message to update it in place
  const streamingUuidRef = useRef<string | null>(null);

  // Handle a user message echo from the CLI
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

  // Handle stream_event messages (streaming assistant response)
  const handleStreamEvent = useCallback(
    (streamEvent: StreamEvent) => {
      const update = processStreamEvent(streamEvent);

      switch (update.type) {
        case 'message_start': {
          // Create a new streaming assistant message
          streamingUuidRef.current = update.uuid;
          setIsStreaming(true);

          if (update.model) {
            setModel(update.model);
          }

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
          // Update the streaming message's blocks in place
          const uuid = streamingUuidRef.current;
          if (!uuid) break;

          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === uuid
                ? { ...msg, blocks: update.blocks }
                : msg,
            ),
          );
          break;
        }

        case 'message_delta': {
          // Stop reason received — message is about to end
          break;
        }

        case 'message_stop': {
          // Mark the streaming message as complete
          const uuid = streamingUuidRef.current;
          if (uuid) {
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === uuid
                  ? {
                      ...msg,
                      isStreaming: false,
                      blocks: msg.blocks?.map((b) => ({
                        ...b,
                        isStreaming: false,
                      })),
                    }
                  : msg,
              ),
            );
          }

          setIsStreaming(false);
          streamingUuidRef.current = null;
          resetStream();
          break;
        }
      }
    },
    [processStreamEvent, resetStream],
  );

  // Handle completed assistant messages (replayed from history)
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

  // Handle result messages (cost + usage)
  const handleResultMessage = useCallback((msg: ResultMessage) => {
    setIsStreaming(false);
    streamingUuidRef.current = null;
    resetStream();

    setCost({
      totalCostUSD: msg.total_cost_usd,
      inputTokens: msg.usage.inputTokens,
      outputTokens: msg.usage.outputTokens,
      cacheReadTokens: msg.usage.cacheReadInputTokens,
      cacheCreationTokens: msg.usage.cacheCreationInputTokens,
      numTurns: msg.num_turns,
      durationMs: msg.duration_ms,
    });

    if (msg.is_error && msg.errors && msg.errors.length > 0) {
      setError(msg.errors.join('\n'));
    }
  }, [resetStream]);

  // Handle system init message (session info)
  const handleSystemInit = useCallback((msg: SystemInitMessage) => {
    setSessionId(msg.session_id);
    setModel(msg.model);
  }, []);

  // Handle session title update
  const handleSessionTitle = useCallback((title: string) => {
    setSessionTitle(title);
  }, []);

  /**
   * Main message router — receives postMessage events from extension host.
   *
   * Expected postMessage types from extension host:
   *
   * CLI messages (forwarded directly or wrapped in { type: 'cliMessage', message: ... }):
   * - stream_event: Streaming content deltas
   * - user: Echoed user message
   * - assistant: Complete assistant message (from history replay)
   * - result: Turn completion with cost/usage
   * - system (subtype: init): Session initialization
   *
   * Extension host messages:
   * - { type: 'sessionTitle', title: string }: AI-generated session title
   * - { type: 'clearMessages' }: New conversation started
   */
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const data = event.data;
      if (!data || typeof data !== 'object') return;

      // The extension host wraps CLI messages in a { type: 'cliMessage', message: ... } envelope
      // OR forwards them directly — handle both
      const msg: SDKMessage = data.type === 'cliMessage' ? data.message : data;

      try {
        switch (msg.type) {
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
            break;
          case 'system':
            if ((msg as SystemInitMessage).subtype === 'init') {
              handleSystemInit(msg as SystemInitMessage);
            }
            break;
        }

        // Check for session title update (sent as a separate postMessage type)
        if (data.type === 'sessionTitle' && typeof data.title === 'string') {
          handleSessionTitle(data.title);
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
  ]);

  // Send a user message to the extension host
  const sendMessage = useCallback(
    (text: string) => {
      if (!text.trim()) return;

      // Optimistically add the user message to the UI
      const id = `user-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const chatMsg: ChatMessage = {
        id,
        role: 'user',
        text,
        isStreaming: false,
        timestamp: Date.now(),
        parentToolUseId: null,
      };
      setMessages((prev) => [...prev, chatMsg]);
      setError(null);

      // Send to extension host via postMessage
      vscode.postMessage({
        type: 'sendMessage',
        text,
      });
    },
    [],
  );

  // Clear all messages (new conversation)
  const clearMessages = useCallback(() => {
    setMessages([]);
    setSessionTitle(null);
    setCost(EMPTY_COST);
    setIsStreaming(false);
    setError(null);
    streamingUuidRef.current = null;
    resetStream();
  }, [resetStream]);

  // Interrupt the current generation
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
    sendMessage,
    clearMessages,
    interrupt,
  };
}
