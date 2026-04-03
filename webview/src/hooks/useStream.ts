import { useCallback, useRef } from 'react';
import type {
  StreamEvent,
  ContentBlock,
  ContentDelta,
  TextBlock,
  ToolUseBlock,
  ThinkingBlock,
} from '../types/messages';
import type { RenderableBlock, StreamState } from '../types/chat';

interface UseStreamReturn {
  /** Process a single stream_event and return updated blocks */
  processStreamEvent: (event: StreamEvent) => StreamUpdate;
  /** Reset stream state (call when a new message starts) */
  resetStream: () => void;
  /** Get current stream state */
  getStreamState: () => StreamState | null;
}

/** What changed after processing a stream event */
export interface StreamUpdate {
  type:
    | 'message_start'
    | 'block_start'
    | 'block_delta'
    | 'block_stop'
    | 'message_delta'
    | 'message_stop'
    | 'unknown';
  /** Current renderable blocks (snapshot) */
  blocks: RenderableBlock[];
  /** Model from message_start */
  model: string | null;
  /** Stop reason from message_delta */
  stopReason: string | null;
  /** UUID of the streaming message */
  uuid: string;
  /** parent_tool_use_id */
  parentToolUseId: string | null;
}

export function useStream(): UseStreamReturn {
  const stateRef = useRef<StreamState | null>(null);

  const resetStream = useCallback(() => {
    stateRef.current = null;
  }, []);

  const getStreamState = useCallback(() => {
    return stateRef.current;
  }, []);

  const processStreamEvent = useCallback((streamEvent: StreamEvent): StreamUpdate => {
    const { event, uuid, parent_tool_use_id } = streamEvent;

    switch (event.type) {
      case 'message_start': {
        // Initialize stream state for a new assistant message
        const state: StreamState = {
          uuid,
          blocks: [],
          model: event.message.model,
          isActive: true,
          parentToolUseId: parent_tool_use_id,
          toolInputBuffers: {},
        };
        stateRef.current = state;
        return {
          type: 'message_start',
          blocks: [],
          model: event.message.model,
          stopReason: null,
          uuid,
          parentToolUseId: parent_tool_use_id,
        };
      }

      case 'content_block_start': {
        const state = stateRef.current;
        if (!state) {
          return makeUnknown(uuid, parent_tool_use_id);
        }

        const block: RenderableBlock = {
          index: event.index,
          block: normalizeStartBlock(event.content_block),
          isStreaming: true,
        };

        // Initialize tool input buffer if this is a tool_use block
        if (event.content_block.type === 'tool_use') {
          state.toolInputBuffers[event.index] = '';
        }

        state.blocks[event.index] = block;

        return {
          type: 'block_start',
          blocks: [...state.blocks],
          model: state.model,
          stopReason: null,
          uuid,
          parentToolUseId: parent_tool_use_id,
        };
      }

      case 'content_block_delta': {
        const state = stateRef.current;
        if (!state) {
          return makeUnknown(uuid, parent_tool_use_id);
        }

        const existing = state.blocks[event.index];
        if (!existing) {
          return makeUnknown(uuid, parent_tool_use_id);
        }

        const updatedBlock = applyDelta(existing.block, event.delta, state, event.index);
        state.blocks[event.index] = {
          ...existing,
          block: updatedBlock,
        };

        return {
          type: 'block_delta',
          blocks: [...state.blocks],
          model: state.model,
          stopReason: null,
          uuid,
          parentToolUseId: parent_tool_use_id,
        };
      }

      case 'content_block_stop': {
        const state = stateRef.current;
        if (!state) {
          return makeUnknown(uuid, parent_tool_use_id);
        }

        const existing = state.blocks[event.index];
        if (existing) {
          // Finalize tool_use input from accumulated JSON buffer
          if (existing.block.type === 'tool_use') {
            const jsonStr = state.toolInputBuffers[event.index] || '{}';
            try {
              (existing.block as ToolUseBlock).input = JSON.parse(jsonStr);
            } catch {
              (existing.block as ToolUseBlock).input = { _raw: jsonStr };
            }
            delete state.toolInputBuffers[event.index];
          }

          state.blocks[event.index] = {
            ...existing,
            isStreaming: false,
          };
        }

        return {
          type: 'block_stop',
          blocks: [...state.blocks],
          model: state.model,
          stopReason: null,
          uuid,
          parentToolUseId: parent_tool_use_id,
        };
      }

      case 'message_delta': {
        const state = stateRef.current;
        const stopReason = event.delta.stop_reason;
        return {
          type: 'message_delta',
          blocks: state ? [...state.blocks] : [],
          model: state?.model ?? null,
          stopReason,
          uuid,
          parentToolUseId: parent_tool_use_id,
        };
      }

      case 'message_stop': {
        const state = stateRef.current;
        if (state) {
          state.isActive = false;
        }
        return {
          type: 'message_stop',
          blocks: state ? [...state.blocks] : [],
          model: state?.model ?? null,
          stopReason: null,
          uuid,
          parentToolUseId: parent_tool_use_id,
        };
      }

      default:
        return makeUnknown(uuid, parent_tool_use_id);
    }
  }, []);

  return { processStreamEvent, resetStream, getStreamState };
}

// ============================================================================
// Helpers
// ============================================================================

function makeUnknown(uuid: string, parentToolUseId: string | null): StreamUpdate {
  return {
    type: 'unknown',
    blocks: [],
    model: null,
    stopReason: null,
    uuid,
    parentToolUseId,
  };
}

/**
 * Normalize a content_block from content_block_start.
 * The SDK sometimes includes text in the start event — we ignore it
 * (it gets re-sent in content_block_delta, causing duplicates).
 */
function normalizeStartBlock(block: ContentBlock): ContentBlock {
  switch (block.type) {
    case 'text':
      return { type: 'text', text: '' };
    case 'thinking':
      return { type: 'thinking', thinking: '' };
    case 'tool_use':
      return { type: 'tool_use', id: block.id, name: block.name, input: {} };
    default:
      return block;
  }
}

/** Apply a content_block_delta to an existing block */
function applyDelta(
  block: ContentBlock,
  delta: ContentDelta,
  state: StreamState,
  index: number,
): ContentBlock {
  // TypeScript needs help here — delta is a union type
  const d = delta as unknown as Record<string, unknown>;

  switch (d.type) {
    case 'text_delta': {
      if (block.type !== 'text') return block;
      return {
        ...block,
        text: (block as TextBlock).text + (d.text as string),
      };
    }

    case 'thinking_delta': {
      if (block.type !== 'thinking') return block;
      return {
        ...block,
        thinking: (block as ThinkingBlock).thinking + (d.thinking as string),
      };
    }

    case 'input_json_delta': {
      // Accumulate partial JSON for tool_use blocks
      if (block.type === 'tool_use' || block.type === 'server_tool_use') {
        state.toolInputBuffers[index] =
          (state.toolInputBuffers[index] || '') + (d.partial_json as string);
      }
      return block;
    }

    default:
      return block;
  }
}
