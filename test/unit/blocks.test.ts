// test/unit/blocks.test.ts
import { describe, it, expect } from 'vitest';
import { parseContentBlock, accumulateDelta } from '../../webview/src/hooks/useStream';
import type { ContentBlock } from '../../webview/src/types/blocks';

describe('parseContentBlock', () => {
  it('parses thinking block from content_block_start', () => {
    const event = {
      type: 'content_block_start' as const,
      index: 0,
      content_block: { type: 'thinking', thinking: '' },
    };
    const block = parseContentBlock(event);
    expect(block).toEqual({
      type: 'thinking',
      index: 0,
      thinking: '',
      summary: null,
      isStreaming: true,
    });
  });

  it('parses redacted_thinking block', () => {
    const event = {
      type: 'content_block_start' as const,
      index: 1,
      content_block: { type: 'redacted_thinking', data: 'abc123' },
    };
    const block = parseContentBlock(event);
    expect(block).toEqual({
      type: 'redacted_thinking',
      index: 1,
      data: 'abc123',
      isStreaming: false,
    });
  });

  it('parses image block with base64 source', () => {
    const event = {
      type: 'content_block_start' as const,
      index: 2,
      content_block: {
        type: 'image',
        source: { type: 'base64', media_type: 'image/png', data: 'iVBOR...' },
      },
    };
    const block = parseContentBlock(event);
    expect(block.type).toBe('image');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((block as any).source.media_type).toBe('image/png');
  });

  it('parses document block with title', () => {
    const event = {
      type: 'content_block_start' as const,
      index: 3,
      content_block: {
        type: 'document',
        source: { type: 'base64', media_type: 'application/pdf', data: 'JVBERi...' },
        title: 'Report.pdf',
        context: null,
        citations: [],
      },
    };
    const block = parseContentBlock(event);
    expect(block.type).toBe('document');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((block as any).title).toBe('Report.pdf');
  });

  it('parses web_search_tool_result block', () => {
    const event = {
      type: 'content_block_start' as const,
      index: 4,
      content_block: {
        type: 'web_search_tool_result',
        query: 'react hooks',
        results: [
          { title: 'React Docs', url: 'https://react.dev', snippet: 'Learn about hooks' },
        ],
      },
    };
    const block = parseContentBlock(event);
    expect(block.type).toBe('web_search_tool_result');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((block as any).results).toHaveLength(1);
  });

  it('parses server_tool_use block', () => {
    const event = {
      type: 'content_block_start' as const,
      index: 5,
      content_block: {
        type: 'server_tool_use',
        id: 'toolu_123',
        name: 'web_search',
        input: { query: 'test' },
      },
    };
    const block = parseContentBlock(event);
    expect(block.type).toBe('server_tool_use');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((block as any).name).toBe('web_search');
  });
});

describe('accumulateDelta', () => {
  it('appends thinking_delta text to thinking block', () => {
    const block: ContentBlock = {
      type: 'thinking',
      index: 0,
      thinking: 'Let me ',
      summary: null,
      isStreaming: true,
    };
    const delta = { type: 'thinking_delta', thinking: 'think about this' };
    const updated = accumulateDelta(block, delta);
    expect(updated.type).toBe('thinking');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((updated as any).thinking).toBe('Let me think about this');
  });

  it('appends text_delta to text block', () => {
    const block: ContentBlock = {
      type: 'text',
      index: 0,
      text: 'Hello ',
      isStreaming: true,
    };
    const delta = { type: 'text_delta', text: 'world' };
    const updated = accumulateDelta(block, delta);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((updated as any).text).toBe('Hello world');
  });
});
