# Story 16: Content Block Renderers (Thinking, Images, Documents, Search) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build seven specialized content block renderers that handle every non-text block type the CLI can stream: thinking, redacted thinking, images, documents, search results, web search results, and server tool use. All renderers support partial/streaming rendering during `content_block_delta` events.

**Architecture:** Each renderer is a pure presentational React component that receives a typed block view-model from the `useStream` hook. The `AssistantMessage` component dispatches to the correct renderer via a `blockType` switch. Streaming is handled by the hook accumulating deltas into mutable refs and re-rendering on each delta. The `showThinkingSummaries` setting controls whether thinking blocks show full trace or summary.

**Tech Stack:** React 18, TypeScript 5.x, Tailwind CSS 3, Vitest

**Spec:** [2026-04-02-openclaude-vscode-extension-design.md](../specs/2026-04-02-openclaude-vscode-extension-design.md) — Story 16, Sections 2.3.2, 2.3.4, 3.5, 5.2

**Claude Code extension (reference):** `~/.vscode/extensions/anthropic.claude-code-2.1.85-darwin-arm64/`

**Depends on:** Story 4 (Chat UI — Message List & Streaming)

---

## File Structure

| File | Responsibility |
|---|---|
| `webview/src/types/blocks.ts` | TypeScript interfaces for all content block view-models |
| `webview/src/components/blocks/ThinkingBlockRenderer.tsx` | Collapsible thinking trace with summary toggle |
| `webview/src/components/blocks/RedactedThinkingBlock.tsx` | "Thinking..." placeholder for hidden reasoning |
| `webview/src/components/blocks/ImageBlockRenderer.tsx` | Inline base64 and URL image display |
| `webview/src/components/blocks/DocumentBlockRenderer.tsx` | PDF/document content rendering |
| `webview/src/components/blocks/SearchResultBlock.tsx` | Formatted search result cards |
| `webview/src/components/blocks/WebSearchResultBlock.tsx` | Web search results with clickable URLs |
| `webview/src/components/blocks/ServerToolUseBlock.tsx` | Server-side tool invocation display |
| `webview/src/components/blocks/ContentBlockRouter.tsx` | Switch component routing block type to renderer |
| `webview/src/hooks/useStream.ts` | Extended to parse all block types from `stream_event` |
| `webview/src/components/chat/AssistantMessage.tsx` | Updated to use ContentBlockRouter |
| `test/unit/blocks.test.ts` | Unit tests for block type parsing and renderers |

---

## Task 1: Define Block Type Interfaces

**Files:**
- Create: `webview/src/types/blocks.ts`

- [ ] **Step 1: Create the typed view-model interfaces for every content block**

```typescript
// webview/src/types/blocks.ts

/** Base for all content blocks in the view model */
export interface BaseBlock {
  index: number;
  isStreaming: boolean;
}

export interface ThinkingBlock extends BaseBlock {
  type: 'thinking';
  thinking: string;
  summary: string | null;
}

export interface RedactedThinkingBlock extends BaseBlock {
  type: 'redacted_thinking';
  data: string; // opaque, not displayed
}

export interface ImageBlock extends BaseBlock {
  type: 'image';
  source:
    | { type: 'base64'; media_type: string; data: string }
    | { type: 'url'; url: string };
}

export interface DocumentBlock extends BaseBlock {
  type: 'document';
  source:
    | { type: 'base64'; media_type: string; data: string }
    | { type: 'url'; url: string }
    | { type: 'content'; content: string };
  title: string | null;
  context: string | null;
  citations: DocumentCitation[];
}

export interface DocumentCitation {
  cited_text: string;
  document_index: number;
  start_char_index: number;
  end_char_index: number;
}

export interface SearchResultBlock extends BaseBlock {
  type: 'search_result';
  source: string;
  title: string;
  content: string;
  url: string | null;
}

export interface WebSearchResultBlock extends BaseBlock {
  type: 'web_search_tool_result';
  query: string;
  results: WebSearchResult[];
}

export interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
  page_age?: string;
}

export interface ServerToolUseBlock extends BaseBlock {
  type: 'server_tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface TextBlock extends BaseBlock {
  type: 'text';
  text: string;
}

export interface ToolUseBlock extends BaseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ToolResultBlock extends BaseBlock {
  type: 'tool_result';
  tool_use_id: string;
  content: string;
  is_error: boolean;
}

/** Union of all content block types the view model can contain */
export type ContentBlock =
  | TextBlock
  | ThinkingBlock
  | RedactedThinkingBlock
  | ImageBlock
  | DocumentBlock
  | SearchResultBlock
  | WebSearchResultBlock
  | ServerToolUseBlock
  | ToolUseBlock
  | ToolResultBlock;
```

- [ ] **Step 2: Verify the types compile**

Run: `cd /Users/harshagarwal/Documents/workspace/openclaude-vscode/webview && npx tsc --noEmit`

Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add webview/src/types/blocks.ts
git commit -m "feat(blocks): add TypeScript interfaces for all content block types"
```

---

## Task 2: Extend Stream Hook for Advanced Block Parsing

**Files:**
- Modify: `webview/src/hooks/useStream.ts`
- Create: `test/unit/blocks.test.ts`

- [ ] **Step 1: Write failing tests for block parsing**

```typescript
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
    expect((updated as any).text).toBe('Hello world');
  });
});
```

- [ ] **Step 2: Run the test and confirm failure**

Run: `cd /Users/harshagarwal/Documents/workspace/openclaude-vscode && npx vitest run test/unit/blocks.test.ts`

Expected: Failures (functions not exported yet)

- [ ] **Step 3: Add parseContentBlock and accumulateDelta to useStream**

Add these exported functions to `webview/src/hooks/useStream.ts`:

```typescript
// Add to webview/src/hooks/useStream.ts

import type {
  ContentBlock,
  ThinkingBlock,
  RedactedThinkingBlock,
  ImageBlock,
  DocumentBlock,
  SearchResultBlock,
  WebSearchResultBlock,
  ServerToolUseBlock,
  TextBlock,
  ToolUseBlock,
  ToolResultBlock,
} from '../types/blocks';

/**
 * Parse a content_block_start event into a typed ContentBlock view-model.
 */
export function parseContentBlock(event: {
  type: 'content_block_start';
  index: number;
  content_block: Record<string, any>;
}): ContentBlock {
  const { index, content_block: cb } = event;

  switch (cb.type) {
    case 'thinking':
      return {
        type: 'thinking',
        index,
        thinking: cb.thinking ?? '',
        summary: cb.summary ?? null,
        isStreaming: true,
      } satisfies ThinkingBlock;

    case 'redacted_thinking':
      return {
        type: 'redacted_thinking',
        index,
        data: cb.data ?? '',
        isStreaming: false, // redacted blocks arrive complete
      } satisfies RedactedThinkingBlock;

    case 'image':
      return {
        type: 'image',
        index,
        source: cb.source,
        isStreaming: false, // images arrive complete in start event
      } satisfies ImageBlock;

    case 'document':
      return {
        type: 'document',
        index,
        source: cb.source,
        title: cb.title ?? null,
        context: cb.context ?? null,
        citations: cb.citations ?? [],
        isStreaming: false,
      } satisfies DocumentBlock;

    case 'search_result':
      return {
        type: 'search_result',
        index,
        source: cb.source ?? '',
        title: cb.title ?? '',
        content: cb.content ?? '',
        url: cb.url ?? null,
        isStreaming: false,
      } satisfies SearchResultBlock;

    case 'web_search_tool_result':
      return {
        type: 'web_search_tool_result',
        index,
        query: cb.query ?? '',
        results: cb.results ?? [],
        isStreaming: false,
      } satisfies WebSearchResultBlock;

    case 'server_tool_use':
      return {
        type: 'server_tool_use',
        index,
        id: cb.id,
        name: cb.name,
        input: cb.input ?? {},
        isStreaming: true,
      } satisfies ServerToolUseBlock;

    case 'tool_use':
      return {
        type: 'tool_use',
        index,
        id: cb.id,
        name: cb.name,
        input: cb.input ?? {},
        isStreaming: true,
      } satisfies ToolUseBlock;

    case 'tool_result':
      return {
        type: 'tool_result',
        index,
        tool_use_id: cb.tool_use_id,
        content: typeof cb.content === 'string' ? cb.content : JSON.stringify(cb.content),
        is_error: cb.is_error ?? false,
        isStreaming: false,
      } satisfies ToolResultBlock;

    case 'text':
    default:
      return {
        type: 'text',
        index,
        text: cb.text ?? '',
        isStreaming: true,
      } satisfies TextBlock;
  }
}

/**
 * Apply a content_block_delta to an existing block, returning
 * an updated copy. Immutable — does not mutate the input block.
 */
export function accumulateDelta(
  block: ContentBlock,
  delta: Record<string, any>,
): ContentBlock {
  switch (delta.type) {
    case 'text_delta':
      if (block.type === 'text') {
        return { ...block, text: block.text + (delta.text ?? '') };
      }
      return block;

    case 'thinking_delta':
      if (block.type === 'thinking') {
        return { ...block, thinking: block.thinking + (delta.thinking ?? '') };
      }
      return block;

    case 'input_json_delta':
      // For tool_use and server_tool_use, accumulate partial JSON
      if (block.type === 'tool_use' || block.type === 'server_tool_use') {
        // partial_json is accumulated as a string; parse when block stops
        const prev = (block as any)._partialJson ?? '';
        return { ...block, _partialJson: prev + (delta.partial_json ?? '') };
      }
      return block;

    default:
      return block;
  }
}

/**
 * Mark a block as no longer streaming (called on content_block_stop).
 * For tool blocks, parse accumulated partial JSON into final input.
 */
export function finalizeBlock(block: ContentBlock): ContentBlock {
  const finalized = { ...block, isStreaming: false };

  if (
    (finalized.type === 'tool_use' || finalized.type === 'server_tool_use') &&
    (finalized as any)._partialJson
  ) {
    try {
      (finalized as any).input = JSON.parse((finalized as any)._partialJson);
    } catch {
      // leave input as-is if partial JSON is malformed
    }
    delete (finalized as any)._partialJson;
  }

  return finalized;
}
```

- [ ] **Step 4: Re-run the tests and confirm PASS**

Run: `cd /Users/harshagarwal/Documents/workspace/openclaude-vscode && npx vitest run test/unit/blocks.test.ts`

Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add webview/src/hooks/useStream.ts webview/src/types/blocks.ts test/unit/blocks.test.ts
git commit -m "feat(blocks): add content block parsing with tests for all block types"
```

---

## Task 3: ThinkingBlockRenderer

**Files:**
- Create: `webview/src/components/blocks/ThinkingBlockRenderer.tsx`

- [ ] **Step 1: Build the collapsible thinking block renderer**

```tsx
// webview/src/components/blocks/ThinkingBlockRenderer.tsx
import React, { useState } from 'react';
import type { ThinkingBlock } from '../../types/blocks';

interface ThinkingBlockRendererProps {
  block: ThinkingBlock;
  showSummaries: boolean;
}

export const ThinkingBlockRenderer: React.FC<ThinkingBlockRendererProps> = ({
  block,
  showSummaries,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  // During streaming, always show the live thinking text
  if (block.isStreaming) {
    return (
      <div className="my-2 border-l-2 border-vscode-border pl-3 opacity-70">
        <div className="flex items-center gap-1.5 text-xs text-vscode-fg/60 mb-1">
          <span className="animate-pulse">Thinking...</span>
        </div>
        <pre className="text-xs whitespace-pre-wrap font-mono text-vscode-fg/50 max-h-40 overflow-y-auto">
          {block.thinking}
        </pre>
      </div>
    );
  }

  // Completed thinking block
  const displayText = showSummaries && block.summary ? block.summary : block.thinking;
  const label = showSummaries && block.summary ? 'Thinking (summary)' : 'Thinking';

  return (
    <div className="my-2 border-l-2 border-vscode-border pl-3">
      <button
        className="flex items-center gap-1.5 text-xs text-vscode-fg/60 hover:text-vscode-fg cursor-pointer bg-transparent border-none p-0"
        onClick={() => setIsExpanded(!isExpanded)}
        aria-expanded={isExpanded}
        aria-label={`${isExpanded ? 'Collapse' : 'Expand'} thinking trace`}
      >
        <svg
          className={`w-3 h-3 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
          fill="currentColor"
          viewBox="0 0 16 16"
        >
          <path d="M6 4l4 4-4 4" />
        </svg>
        <span>{label}</span>
        <span className="text-vscode-fg/40">
          ({block.thinking.length.toLocaleString()} chars)
        </span>
      </button>

      {isExpanded && (
        <pre className="mt-1 text-xs whitespace-pre-wrap font-mono text-vscode-fg/50 max-h-96 overflow-y-auto">
          {displayText}
        </pre>
      )}
    </div>
  );
};
```

- [ ] **Step 2: Verify it compiles**

Run: `cd /Users/harshagarwal/Documents/workspace/openclaude-vscode/webview && npx tsc --noEmit`

Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add webview/src/components/blocks/ThinkingBlockRenderer.tsx
git commit -m "feat(blocks): add ThinkingBlockRenderer with collapsible trace and summary toggle"
```

---

## Task 4: RedactedThinkingBlock

**Files:**
- Create: `webview/src/components/blocks/RedactedThinkingBlock.tsx`

- [ ] **Step 1: Build the redacted thinking indicator**

```tsx
// webview/src/components/blocks/RedactedThinkingBlock.tsx
import React from 'react';
import type { RedactedThinkingBlock as RedactedThinkingBlockType } from '../../types/blocks';

interface RedactedThinkingBlockProps {
  block: RedactedThinkingBlockType;
}

export const RedactedThinkingBlock: React.FC<RedactedThinkingBlockProps> = () => {
  return (
    <div className="my-2 border-l-2 border-vscode-border pl-3 flex items-center gap-2 py-1">
      <svg
        className="w-4 h-4 text-vscode-fg/40"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
        />
      </svg>
      <span className="text-xs text-vscode-fg/50 italic">
        Thinking... (reasoning hidden)
      </span>
    </div>
  );
};
```

- [ ] **Step 2: Commit**

```bash
git add webview/src/components/blocks/RedactedThinkingBlock.tsx
git commit -m "feat(blocks): add RedactedThinkingBlock indicator"
```

---

## Task 5: ImageBlockRenderer

**Files:**
- Create: `webview/src/components/blocks/ImageBlockRenderer.tsx`

- [ ] **Step 1: Build the image renderer with base64 and URL support**

```tsx
// webview/src/components/blocks/ImageBlockRenderer.tsx
import React, { useState } from 'react';
import type { ImageBlock } from '../../types/blocks';

interface ImageBlockRendererProps {
  block: ImageBlock;
}

export const ImageBlockRenderer: React.FC<ImageBlockRendererProps> = ({ block }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [hasError, setHasError] = useState(false);

  const src =
    block.source.type === 'base64'
      ? `data:${block.source.media_type};base64,${block.source.data}`
      : block.source.url;

  if (hasError) {
    return (
      <div className="my-2 p-3 border border-vscode-border rounded bg-vscode-input-bg text-xs text-vscode-fg/50 flex items-center gap-2">
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
          <path
            fillRule="evenodd"
            d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z"
            clipRule="evenodd"
          />
        </svg>
        <span>Failed to load image</span>
      </div>
    );
  }

  return (
    <div className="my-2">
      <button
        className="bg-transparent border-none p-0 cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
        aria-label={isExpanded ? 'Collapse image' : 'Expand image'}
      >
        <img
          src={src}
          alt="AI-generated or referenced image"
          className={`rounded border border-vscode-border transition-all ${
            isExpanded ? 'max-w-full max-h-[600px]' : 'max-w-[300px] max-h-[200px]'
          } object-contain`}
          onError={() => setHasError(true)}
          loading="lazy"
        />
      </button>
      {block.source.type === 'base64' && (
        <div className="text-xs text-vscode-fg/40 mt-1">
          {block.source.media_type} ({Math.round(block.source.data.length * 0.75 / 1024)}KB)
        </div>
      )}
    </div>
  );
};
```

- [ ] **Step 2: Commit**

```bash
git add webview/src/components/blocks/ImageBlockRenderer.tsx
git commit -m "feat(blocks): add ImageBlockRenderer with base64 and URL support"
```

---

## Task 6: DocumentBlockRenderer

**Files:**
- Create: `webview/src/components/blocks/DocumentBlockRenderer.tsx`

- [ ] **Step 1: Build the document content renderer**

```tsx
// webview/src/components/blocks/DocumentBlockRenderer.tsx
import React, { useState } from 'react';
import type { DocumentBlock } from '../../types/blocks';

interface DocumentBlockRendererProps {
  block: DocumentBlock;
}

export const DocumentBlockRenderer: React.FC<DocumentBlockRendererProps> = ({ block }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const isPdf =
    (block.source.type === 'base64' && block.source.media_type === 'application/pdf') ||
    (block.source.type === 'url' && block.source.url.endsWith('.pdf'));

  const hasInlineContent = block.source.type === 'content';

  return (
    <div className="my-2 border border-vscode-border rounded overflow-hidden">
      {/* Header */}
      <button
        className="w-full flex items-center gap-2 px-3 py-2 bg-vscode-input-bg text-left border-none cursor-pointer hover:bg-vscode-button-hover/10"
        onClick={() => setIsExpanded(!isExpanded)}
        aria-expanded={isExpanded}
      >
        <svg className="w-4 h-4 text-vscode-fg/60 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
          <path
            fillRule="evenodd"
            d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z"
            clipRule="evenodd"
          />
        </svg>
        <span className="text-sm text-vscode-fg font-medium truncate">
          {block.title ?? (isPdf ? 'PDF Document' : 'Document')}
        </span>
        <svg
          className={`w-3 h-3 ml-auto text-vscode-fg/40 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
          fill="currentColor"
          viewBox="0 0 16 16"
        >
          <path d="M6 4l4 4-4 4" />
        </svg>
      </button>

      {/* Content */}
      {isExpanded && (
        <div className="px-3 py-2 border-t border-vscode-border">
          {block.context && (
            <p className="text-xs text-vscode-fg/50 mb-2 italic">{block.context}</p>
          )}

          {hasInlineContent && (
            <pre className="text-xs whitespace-pre-wrap font-mono text-vscode-fg/80 max-h-96 overflow-y-auto">
              {(block.source as { content: string }).content}
            </pre>
          )}

          {isPdf && block.source.type === 'base64' && (
            <div className="text-xs text-vscode-fg/50">
              PDF content ({Math.round(block.source.data.length * 0.75 / 1024)}KB)
              — content extracted by AI
            </div>
          )}

          {isPdf && block.source.type === 'url' && (
            <a
              href={block.source.url}
              className="text-xs text-vscode-link hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              Open PDF
            </a>
          )}

          {/* Citations */}
          {block.citations.length > 0 && (
            <div className="mt-2 pt-2 border-t border-vscode-border">
              <div className="text-xs text-vscode-fg/50 mb-1">Citations:</div>
              {block.citations.map((citation, i) => (
                <blockquote
                  key={i}
                  className="text-xs text-vscode-fg/60 border-l-2 border-vscode-link pl-2 my-1"
                >
                  "{citation.cited_text}"
                </blockquote>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
```

- [ ] **Step 2: Commit**

```bash
git add webview/src/components/blocks/DocumentBlockRenderer.tsx
git commit -m "feat(blocks): add DocumentBlockRenderer with PDF and citation support"
```

---

## Task 7: SearchResultBlock and WebSearchResultBlock

**Files:**
- Create: `webview/src/components/blocks/SearchResultBlock.tsx`
- Create: `webview/src/components/blocks/WebSearchResultBlock.tsx`

- [ ] **Step 1: Build the search result card renderer**

```tsx
// webview/src/components/blocks/SearchResultBlock.tsx
import React from 'react';
import type { SearchResultBlock as SearchResultBlockType } from '../../types/blocks';

interface SearchResultBlockProps {
  block: SearchResultBlockType;
}

export const SearchResultBlock: React.FC<SearchResultBlockProps> = ({ block }) => {
  return (
    <div className="my-2 border border-vscode-border rounded p-3 bg-vscode-input-bg/50">
      <div className="flex items-start gap-2">
        <svg className="w-4 h-4 text-vscode-fg/40 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
          <path
            fillRule="evenodd"
            d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z"
            clipRule="evenodd"
          />
        </svg>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-vscode-fg">{block.title}</div>
          {block.source && (
            <div className="text-xs text-vscode-fg/40 mt-0.5">{block.source}</div>
          )}
          <p className="text-xs text-vscode-fg/70 mt-1 line-clamp-3">{block.content}</p>
          {block.url && (
            <a
              href={block.url}
              className="text-xs text-vscode-link hover:underline mt-1 inline-block"
              target="_blank"
              rel="noopener noreferrer"
            >
              {block.url}
            </a>
          )}
        </div>
      </div>
    </div>
  );
};
```

- [ ] **Step 2: Build the web search results renderer**

```tsx
// webview/src/components/blocks/WebSearchResultBlock.tsx
import React, { useState } from 'react';
import type { WebSearchResultBlock as WebSearchResultBlockType } from '../../types/blocks';

interface WebSearchResultBlockProps {
  block: WebSearchResultBlockType;
}

export const WebSearchResultBlock: React.FC<WebSearchResultBlockProps> = ({ block }) => {
  const [isExpanded, setIsExpanded] = useState(true);

  return (
    <div className="my-2 border border-vscode-border rounded overflow-hidden">
      <button
        className="w-full flex items-center gap-2 px-3 py-2 bg-vscode-input-bg text-left border-none cursor-pointer hover:bg-vscode-button-hover/10"
        onClick={() => setIsExpanded(!isExpanded)}
        aria-expanded={isExpanded}
      >
        <svg className="w-4 h-4 text-vscode-link flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
          <path
            fillRule="evenodd"
            d="M4.083 9h1.946c.089-1.546.383-2.97.837-4.118A6.004 6.004 0 004.083 9zM10 2a8 8 0 100 16 8 8 0 000-16zm0 2c-.076 0-.232.032-.465.262-.238.234-.497.623-.737 1.182-.389.907-.673 2.142-.766 3.556h3.936c-.093-1.414-.377-2.649-.766-3.556-.24-.56-.5-.948-.737-1.182C10.232 4.032 10.076 4 10 4z"
            clipRule="evenodd"
          />
        </svg>
        <span className="text-sm text-vscode-fg">
          Web search: <span className="text-vscode-fg/70">"{block.query}"</span>
        </span>
        <span className="ml-auto text-xs text-vscode-fg/40">
          {block.results.length} result{block.results.length !== 1 ? 's' : ''}
        </span>
      </button>

      {isExpanded && (
        <div className="border-t border-vscode-border">
          {block.results.map((result, i) => (
            <div
              key={i}
              className={`px-3 py-2 ${i > 0 ? 'border-t border-vscode-border/50' : ''}`}
            >
              <a
                href={result.url}
                className="text-sm text-vscode-link hover:underline font-medium"
                target="_blank"
                rel="noopener noreferrer"
              >
                {result.title}
              </a>
              <div className="text-xs text-vscode-fg/40 truncate mt-0.5">{result.url}</div>
              <p className="text-xs text-vscode-fg/70 mt-1 line-clamp-2">{result.snippet}</p>
              {result.page_age && (
                <span className="text-xs text-vscode-fg/30 mt-0.5 inline-block">
                  {result.page_age}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
```

- [ ] **Step 3: Verify build**

Run: `cd /Users/harshagarwal/Documents/workspace/openclaude-vscode/webview && npx tsc --noEmit`

Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add webview/src/components/blocks/SearchResultBlock.tsx webview/src/components/blocks/WebSearchResultBlock.tsx
git commit -m "feat(blocks): add SearchResultBlock and WebSearchResultBlock renderers"
```

---

## Task 8: ServerToolUseBlock

**Files:**
- Create: `webview/src/components/blocks/ServerToolUseBlock.tsx`

- [ ] **Step 1: Build the server tool use renderer**

```tsx
// webview/src/components/blocks/ServerToolUseBlock.tsx
import React, { useState } from 'react';
import type { ServerToolUseBlock as ServerToolUseBlockType } from '../../types/blocks';

interface ServerToolUseBlockProps {
  block: ServerToolUseBlockType;
}

export const ServerToolUseBlock: React.FC<ServerToolUseBlockProps> = ({ block }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="my-2 border border-vscode-border rounded overflow-hidden">
      <button
        className="w-full flex items-center gap-2 px-3 py-2 bg-vscode-input-bg text-left border-none cursor-pointer hover:bg-vscode-button-hover/10"
        onClick={() => setIsExpanded(!isExpanded)}
        aria-expanded={isExpanded}
      >
        <svg
          className={`w-4 h-4 flex-shrink-0 ${block.isStreaming ? 'text-yellow-500 animate-spin' : 'text-vscode-fg/40'}`}
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path
            fillRule="evenodd"
            d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z"
            clipRule="evenodd"
          />
        </svg>
        <span className="text-sm text-vscode-fg font-mono">{block.name}</span>
        {block.isStreaming && (
          <span className="text-xs text-yellow-500 animate-pulse">running...</span>
        )}
        <svg
          className={`w-3 h-3 ml-auto text-vscode-fg/40 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
          fill="currentColor"
          viewBox="0 0 16 16"
        >
          <path d="M6 4l4 4-4 4" />
        </svg>
      </button>

      {isExpanded && Object.keys(block.input).length > 0 && (
        <div className="px-3 py-2 border-t border-vscode-border">
          <div className="text-xs text-vscode-fg/40 mb-1">Input:</div>
          <pre className="text-xs whitespace-pre-wrap font-mono text-vscode-fg/60 max-h-48 overflow-y-auto">
            {JSON.stringify(block.input, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
};
```

- [ ] **Step 2: Commit**

```bash
git add webview/src/components/blocks/ServerToolUseBlock.tsx
git commit -m "feat(blocks): add ServerToolUseBlock renderer"
```

---

## Task 9: ContentBlockRouter and AssistantMessage Integration

**Files:**
- Create: `webview/src/components/blocks/ContentBlockRouter.tsx`
- Modify: `webview/src/components/chat/AssistantMessage.tsx`

- [ ] **Step 1: Build the content block router/switch component**

```tsx
// webview/src/components/blocks/ContentBlockRouter.tsx
import React from 'react';
import type { ContentBlock } from '../../types/blocks';
import { ThinkingBlockRenderer } from './ThinkingBlockRenderer';
import { RedactedThinkingBlock } from './RedactedThinkingBlock';
import { ImageBlockRenderer } from './ImageBlockRenderer';
import { DocumentBlockRenderer } from './DocumentBlockRenderer';
import { SearchResultBlock } from './SearchResultBlock';
import { WebSearchResultBlock } from './WebSearchResultBlock';
import { ServerToolUseBlock } from './ServerToolUseBlock';

interface ContentBlockRouterProps {
  block: ContentBlock;
  showThinkingSummaries: boolean;
}

/**
 * Routes a ContentBlock to the appropriate renderer component.
 * Text and tool_use blocks are handled by the existing AssistantMessage
 * rendering pipeline (MarkdownRenderer and ToolCallBlock respectively).
 * This router handles all OTHER block types.
 */
export const ContentBlockRouter: React.FC<ContentBlockRouterProps> = ({
  block,
  showThinkingSummaries,
}) => {
  switch (block.type) {
    case 'thinking':
      return (
        <ThinkingBlockRenderer block={block} showSummaries={showThinkingSummaries} />
      );

    case 'redacted_thinking':
      return <RedactedThinkingBlock block={block} />;

    case 'image':
      return <ImageBlockRenderer block={block} />;

    case 'document':
      return <DocumentBlockRenderer block={block} />;

    case 'search_result':
      return <SearchResultBlock block={block} />;

    case 'web_search_tool_result':
      return <WebSearchResultBlock block={block} />;

    case 'server_tool_use':
      return <ServerToolUseBlock block={block} />;

    // text, tool_use, tool_result handled by parent
    default:
      return null;
  }
};
```

- [ ] **Step 2: Integrate ContentBlockRouter into AssistantMessage**

Add the following to the block rendering loop inside `AssistantMessage.tsx`. The exact location depends on the Story 4 implementation, but the pattern is:

```tsx
// In webview/src/components/chat/AssistantMessage.tsx
// Add this import at the top:
import { ContentBlockRouter } from '../blocks/ContentBlockRouter';
import type { ContentBlock } from '../../types/blocks';

// Inside the component, where blocks are iterated, add a branch for non-text/tool blocks:

// Before (Story 4 pattern — rendering only text and tool_use):
//   {blocks.map((block, i) => {
//     if (block.type === 'text') return <MarkdownRenderer key={i} ... />;
//     if (block.type === 'tool_use') return <ToolCallBlock key={i} ... />;
//     return null;
//   })}

// After (Story 16 — route all remaining block types through ContentBlockRouter):
//   {blocks.map((block, i) => {
//     if (block.type === 'text') return <MarkdownRenderer key={i} content={block.text} />;
//     if (block.type === 'tool_use') return <ToolCallBlock key={i} block={block} />;
//     if (block.type === 'tool_result') return <ToolCallBlock key={i} block={block} />;
//     return (
//       <ContentBlockRouter
//         key={i}
//         block={block}
//         showThinkingSummaries={showThinkingSummaries}
//       />
//     );
//   })}

// The showThinkingSummaries value comes from the VS Code setting:
// const showThinkingSummaries = settings?.showThinkingSummaries ?? false;
```

- [ ] **Step 3: Build and verify**

Run: `cd /Users/harshagarwal/Documents/workspace/openclaude-vscode && npm run build:webview`

Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add webview/src/components/blocks/ContentBlockRouter.tsx webview/src/components/chat/AssistantMessage.tsx
git commit -m "feat(blocks): integrate ContentBlockRouter into AssistantMessage rendering"
```

---

## Final Verification

- [ ] Run: `cd /Users/harshagarwal/Documents/workspace/openclaude-vscode && npm run build`
- [ ] Run: `cd /Users/harshagarwal/Documents/workspace/openclaude-vscode && npx vitest run test/unit/blocks.test.ts`
- [ ] Manual: verify each block type renders with mock data:
  - Thinking block: shows collapsible trace, chevron animates, summary toggle works
  - Redacted thinking: shows lock icon and "Thinking..." text
  - Image: base64 PNG renders inline, click toggles size
  - Document: PDF header shows, expands to show content/citations
  - Search result: card layout with title/snippet/URL
  - Web search: grouped results with clickable links
  - Server tool use: gear icon, tool name, expandable input JSON
- [ ] Verify streaming: thinking block shows partial text during stream, then becomes collapsible on completion
