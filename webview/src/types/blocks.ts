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
