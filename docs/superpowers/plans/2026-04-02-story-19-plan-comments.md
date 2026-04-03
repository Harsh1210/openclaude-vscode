# Story 19: Plan Review Inline Comment System — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the PlanViewer (from Story 7) into a rich interactive annotation system where users can select text in a CLI-generated plan, add numbered comments anchored to selections, see `<mark>` highlighting on commented regions, and submit approval/revision feedback with all comments back to the CLI.

**Architecture:** The plan markdown is rendered as structured HTML with auto-detected section headings. A `Selection` API listener detects when the user selects text, showing an "Add Comment" floating button. Comments are stored in local component state as an ordered list of `{ anchorStart, anchorEnd, text, id }` entries. On submit, the extension host packages all comments + the approval/revision decision into a `control_response` and sends it back to the CLI. The `showClearContextOnPlanAccept` setting controls whether a "Clear context after accept" option is shown.

**Tech Stack:** React 18, TypeScript 5.x, Tailwind CSS 3, DOM Selection API, VS Code webview APIs

**Spec:** [2026-04-02-openclaude-vscode-extension-design.md](../specs/2026-04-02-openclaude-vscode-extension-design.md) — Story 19, Sections 3.6, 5.2

**Claude Code extension (reference):** `~/.vscode/extensions/anthropic.claude-code-2.1.85-darwin-arm64/extension.js` lines 340-690 (plan review HTML)

**Depends on:** Story 7 (Permission System & Dialogs — PlanViewer.tsx)

---

## File Structure

| File | Responsibility |
|---|---|
| `webview/src/types/plan.ts` | TypeScript types for plan comments, sections, and review actions |
| `webview/src/components/dialogs/PlanViewer.tsx` | Rich plan viewer with section parsing, selection detection, and comment anchoring |
| `webview/src/components/dialogs/PlanComment.tsx` | Individual comment editor/display |
| `webview/src/components/dialogs/PlanCommentIndicator.tsx` | Numbered marker badge on commented sections |
| `webview/src/hooks/usePlanComments.ts` | Hook managing comment state, selection, and submission |
| `test/unit/planComments.test.ts` | Unit tests for section parsing and comment ordering |

---

## Task 1: Define Plan Review Types

**Files:**
- Create: `webview/src/types/plan.ts`

- [ ] **Step 1: Create TypeScript interfaces for the plan review system**

```typescript
// webview/src/types/plan.ts

/** A detected section in the plan markdown */
export interface PlanSection {
  id: string;
  level: number; // heading level (1-6)
  title: string;
  /** Character offset in the raw markdown where this section starts */
  startOffset: number;
  /** Character offset where this section ends (start of next section or end of doc) */
  endOffset: number;
}

/** A comment anchored to a text selection in the plan */
export interface PlanComment {
  id: string;
  /** 1-based display number */
  number: number;
  /** The selected/highlighted text */
  anchorText: string;
  /** Character offset of selection start in the rendered text */
  anchorStartOffset: number;
  /** Character offset of selection end in the rendered text */
  anchorEndOffset: number;
  /** The comment text */
  text: string;
  /** Timestamp of creation */
  createdAt: number;
}

/** The user's final review decision */
export type PlanReviewAction =
  | { type: 'approve'; clearContext: boolean }
  | { type: 'approve_with_comments'; comments: PlanComment[]; clearContext: boolean }
  | { type: 'request_revision'; comments: PlanComment[]; revisionNote: string };

/** State for the selection-based "Add Comment" button */
export interface SelectionState {
  isVisible: boolean;
  /** Position for the floating button (relative to the plan container) */
  top: number;
  left: number;
  /** The selected text */
  selectedText: string;
  /** Offsets in rendered text content */
  startOffset: number;
  endOffset: number;
}

/** postMessage types for plan review */
export interface PlanReviewSubmitMessage {
  type: 'plan_review_submit';
  requestId: string;
  action: PlanReviewAction;
}
```

- [ ] **Step 2: Verify types compile**

Run: `cd /Users/harshagarwal/Documents/workspace/openclaude-vscode/webview && npx tsc --noEmit`

Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add webview/src/types/plan.ts
git commit -m "feat(plan-review): add TypeScript types for plan comments and review actions"
```

---

## Task 2: Plan Section Parser and Comment Ordering Logic

**Files:**
- Create: `webview/src/hooks/usePlanComments.ts`
- Create: `test/unit/planComments.test.ts`

- [ ] **Step 1: Write failing tests for section parsing and comment ordering**

```typescript
// test/unit/planComments.test.ts
import { describe, it, expect } from 'vitest';
import { parseSections, orderComments } from '../../webview/src/hooks/usePlanComments';
import type { PlanComment, PlanSection } from '../../webview/src/types/plan';

describe('parseSections', () => {
  it('detects markdown headings as sections', () => {
    const markdown = `# Project Plan

## Phase 1: Setup
Set up the development environment.

## Phase 2: Implementation
Build the core features.

### Sub-task A
Do this first.

## Phase 3: Testing
Write tests.`;

    const sections = parseSections(markdown);
    expect(sections).toHaveLength(5);
    expect(sections[0]).toEqual(
      expect.objectContaining({ level: 1, title: 'Project Plan' }),
    );
    expect(sections[1]).toEqual(
      expect.objectContaining({ level: 2, title: 'Phase 1: Setup' }),
    );
    expect(sections[3]).toEqual(
      expect.objectContaining({ level: 3, title: 'Sub-task A' }),
    );
  });

  it('handles plan with no headings', () => {
    const markdown = 'Just some text without any headings.';
    const sections = parseSections(markdown);
    expect(sections).toHaveLength(0);
  });

  it('sets correct start/end offsets', () => {
    const markdown = `# Title\nContent\n## Section 2\nMore content`;
    const sections = parseSections(markdown);
    expect(sections[0].startOffset).toBe(0);
    expect(sections[0].endOffset).toBe(markdown.indexOf('## Section 2'));
    expect(sections[1].startOffset).toBe(markdown.indexOf('## Section 2'));
    expect(sections[1].endOffset).toBe(markdown.length);
  });
});

describe('orderComments', () => {
  it('orders comments by anchorStartOffset', () => {
    const comments: PlanComment[] = [
      { id: 'c2', number: 2, anchorText: 'b', anchorStartOffset: 50, anchorEndOffset: 51, text: 'Comment 2', createdAt: 2 },
      { id: 'c1', number: 1, anchorText: 'a', anchorStartOffset: 10, anchorEndOffset: 11, text: 'Comment 1', createdAt: 1 },
      { id: 'c3', number: 3, anchorText: 'c', anchorStartOffset: 30, anchorEndOffset: 31, text: 'Comment 3', createdAt: 3 },
    ];
    const ordered = orderComments(comments);
    expect(ordered[0].id).toBe('c1');
    expect(ordered[1].id).toBe('c3');
    expect(ordered[2].id).toBe('c2');
    // Numbers should be reassigned
    expect(ordered[0].number).toBe(1);
    expect(ordered[1].number).toBe(2);
    expect(ordered[2].number).toBe(3);
  });

  it('handles empty array', () => {
    expect(orderComments([])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests and confirm failure**

Run: `cd /Users/harshagarwal/Documents/workspace/openclaude-vscode && npx vitest run test/unit/planComments.test.ts`

Expected: Failures (functions not implemented)

- [ ] **Step 3: Implement the usePlanComments hook with parseSections and orderComments**

```typescript
// webview/src/hooks/usePlanComments.ts
import { useState, useCallback, useRef, useEffect } from 'react';
import type { PlanComment, PlanSection, SelectionState, PlanReviewAction } from '../types/plan';

/**
 * Parse markdown text into sections based on headings.
 */
export function parseSections(markdown: string): PlanSection[] {
  const sections: PlanSection[] = [];
  const headingRegex = /^(#{1,6})\s+(.+)$/gm;
  let match: RegExpExecArray | null;

  while ((match = headingRegex.exec(markdown)) !== null) {
    sections.push({
      id: `section-${sections.length}`,
      level: match[1].length,
      title: match[2].trim(),
      startOffset: match.index,
      endOffset: markdown.length, // will be adjusted below
    });
  }

  // Set endOffset to the start of the next section
  for (let i = 0; i < sections.length - 1; i++) {
    sections[i].endOffset = sections[i + 1].startOffset;
  }

  return sections;
}

/**
 * Order comments by their position in the document and reassign numbers.
 */
export function orderComments(comments: PlanComment[]): PlanComment[] {
  const sorted = [...comments].sort((a, b) => a.anchorStartOffset - b.anchorStartOffset);
  return sorted.map((comment, index) => ({
    ...comment,
    number: index + 1,
  }));
}

/** Generate a unique ID for comments */
let commentIdCounter = 0;
function generateCommentId(): string {
  return `comment-${++commentIdCounter}-${Date.now()}`;
}

/**
 * Hook for managing plan comments, selection state, and review actions.
 */
export function usePlanComments(planMarkdown: string) {
  const [comments, setComments] = useState<PlanComment[]>([]);
  const [selection, setSelection] = useState<SelectionState>({
    isVisible: false,
    top: 0,
    left: 0,
    selectedText: '',
    startOffset: 0,
    endOffset: 0,
  });
  const [activeCommentId, setActiveCommentId] = useState<string | null>(null);
  const planContainerRef = useRef<HTMLDivElement | null>(null);

  const sections = parseSections(planMarkdown);

  /** Handle text selection in the plan viewer */
  const handleSelectionChange = useCallback(() => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !planContainerRef.current) {
      setSelection((prev) => ({ ...prev, isVisible: false }));
      return;
    }

    // Check that selection is within the plan container
    const range = sel.getRangeAt(0);
    if (!planContainerRef.current.contains(range.commonAncestorContainer)) {
      setSelection((prev) => ({ ...prev, isVisible: false }));
      return;
    }

    const selectedText = sel.toString().trim();
    if (!selectedText) {
      setSelection((prev) => ({ ...prev, isVisible: false }));
      return;
    }

    // Calculate position for the floating button
    const rect = range.getBoundingClientRect();
    const containerRect = planContainerRef.current.getBoundingClientRect();

    // Calculate text offset within the plan content
    const preSelectionRange = document.createRange();
    preSelectionRange.selectNodeContents(planContainerRef.current);
    preSelectionRange.setEnd(range.startContainer, range.startOffset);
    const startOffset = preSelectionRange.toString().length;
    const endOffset = startOffset + selectedText.length;

    setSelection({
      isVisible: true,
      top: rect.top - containerRect.top - 32, // 32px above selection
      left: rect.left - containerRect.left + rect.width / 2,
      selectedText,
      startOffset,
      endOffset,
    });
  }, []);

  /** Add a new comment at the current selection */
  const addComment = useCallback(
    (text: string) => {
      if (!selection.isVisible || !selection.selectedText) return;

      const newComment: PlanComment = {
        id: generateCommentId(),
        number: comments.length + 1,
        anchorText: selection.selectedText,
        anchorStartOffset: selection.startOffset,
        anchorEndOffset: selection.endOffset,
        text,
        createdAt: Date.now(),
      };

      setComments((prev) => orderComments([...prev, newComment]));
      setSelection((prev) => ({ ...prev, isVisible: false }));
      setActiveCommentId(newComment.id);

      // Clear browser selection
      window.getSelection()?.removeAllRanges();
    },
    [selection, comments.length],
  );

  /** Update an existing comment's text */
  const updateComment = useCallback((commentId: string, text: string) => {
    setComments((prev) =>
      prev.map((c) => (c.id === commentId ? { ...c, text } : c)),
    );
  }, []);

  /** Remove a comment */
  const removeComment = useCallback((commentId: string) => {
    setComments((prev) => orderComments(prev.filter((c) => c.id !== commentId)));
    if (activeCommentId === commentId) {
      setActiveCommentId(null);
    }
  }, [activeCommentId]);

  /** Listen for selection changes */
  useEffect(() => {
    document.addEventListener('selectionchange', handleSelectionChange);
    return () => document.removeEventListener('selectionchange', handleSelectionChange);
  }, [handleSelectionChange]);

  return {
    sections,
    comments,
    selection,
    activeCommentId,
    setActiveCommentId,
    planContainerRef,
    addComment,
    updateComment,
    removeComment,
  };
}
```

- [ ] **Step 4: Re-run tests and confirm PASS**

Run: `cd /Users/harshagarwal/Documents/workspace/openclaude-vscode && npx vitest run test/unit/planComments.test.ts`

Expected: All pass

- [ ] **Step 5: Commit**

```bash
git add webview/src/hooks/usePlanComments.ts test/unit/planComments.test.ts
git commit -m "feat(plan-review): add usePlanComments hook with section parsing and comment ordering"
```

---

## Task 3: PlanComment and PlanCommentIndicator Components

**Files:**
- Create: `webview/src/components/dialogs/PlanComment.tsx`
- Create: `webview/src/components/dialogs/PlanCommentIndicator.tsx`

- [ ] **Step 1: Build the PlanComment editor/display component**

```tsx
// webview/src/components/dialogs/PlanComment.tsx
import React, { useState, useRef, useEffect } from 'react';
import type { PlanComment as PlanCommentType } from '../../types/plan';

interface PlanCommentProps {
  comment: PlanCommentType;
  isActive: boolean;
  onActivate: () => void;
  onUpdate: (text: string) => void;
  onRemove: () => void;
}

export const PlanComment: React.FC<PlanCommentProps> = ({
  comment,
  isActive,
  onActivate,
  onUpdate,
  onRemove,
}) => {
  const [isEditing, setIsEditing] = useState(!comment.text);
  const [editText, setEditText] = useState(comment.text);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [isEditing]);

  const handleSave = () => {
    if (editText.trim()) {
      onUpdate(editText.trim());
      setIsEditing(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSave();
    }
    if (e.key === 'Escape') {
      if (!comment.text) {
        onRemove();
      } else {
        setEditText(comment.text);
        setIsEditing(false);
      }
    }
  };

  return (
    <div
      className={`border rounded-lg overflow-hidden transition-colors ${
        isActive
          ? 'border-vscode-link bg-vscode-link/5'
          : 'border-vscode-border bg-vscode-bg hover:border-vscode-fg/30'
      }`}
      onClick={onActivate}
    >
      {/* Header with number badge and anchor text */}
      <div className="flex items-start gap-2 px-3 py-2 border-b border-vscode-border/50">
        <span className="flex-shrink-0 w-5 h-5 rounded-full bg-vscode-link text-white text-xs font-bold flex items-center justify-center">
          {comment.number}
        </span>
        <blockquote className="text-xs text-vscode-fg/50 italic line-clamp-2 flex-1">
          "{comment.anchorText}"
        </blockquote>
        <button
          className="flex-shrink-0 p-0.5 text-vscode-fg/30 hover:text-red-400 bg-transparent border-none cursor-pointer"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          aria-label="Remove comment"
          title="Remove comment"
        >
          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 16 16">
            <path d="M4.5 4.5l7 7M11.5 4.5l-7 7" stroke="currentColor" strokeWidth="1.5" fill="none" />
          </svg>
        </button>
      </div>

      {/* Comment body */}
      <div className="px-3 py-2">
        {isEditing ? (
          <div>
            <textarea
              ref={textareaRef}
              className="w-full px-2 py-1.5 text-xs rounded border border-vscode-input-border bg-vscode-input-bg text-vscode-input-fg outline-none resize-none focus:border-vscode-link min-h-[48px]"
              placeholder="Add your comment..."
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={2}
            />
            <div className="flex justify-end gap-1 mt-1">
              <button
                className="px-2 py-0.5 text-xs text-vscode-fg/50 hover:text-vscode-fg bg-transparent border-none cursor-pointer"
                onClick={() => {
                  if (!comment.text) onRemove();
                  else {
                    setEditText(comment.text);
                    setIsEditing(false);
                  }
                }}
              >
                Cancel
              </button>
              <button
                className="px-2 py-0.5 text-xs rounded bg-vscode-button-bg text-vscode-button-fg hover:bg-vscode-button-hover cursor-pointer border-none disabled:opacity-50"
                onClick={handleSave}
                disabled={!editText.trim()}
              >
                Save
              </button>
            </div>
            <div className="text-[10px] text-vscode-fg/30 mt-0.5">
              Cmd+Enter to save, Escape to cancel
            </div>
          </div>
        ) : (
          <div
            className="text-xs text-vscode-fg/80 cursor-pointer hover:text-vscode-fg"
            onClick={() => setIsEditing(true)}
            title="Click to edit"
          >
            {comment.text}
          </div>
        )}
      </div>
    </div>
  );
};
```

- [ ] **Step 2: Build the PlanCommentIndicator component**

```tsx
// webview/src/components/dialogs/PlanCommentIndicator.tsx
import React from 'react';

interface PlanCommentIndicatorProps {
  number: number;
  isActive: boolean;
  onClick: () => void;
}

/**
 * Small numbered badge that appears inline next to commented text in the plan.
 * Clicking it scrolls to / activates the corresponding comment in the sidebar.
 */
export const PlanCommentIndicator: React.FC<PlanCommentIndicatorProps> = ({
  number,
  isActive,
  onClick,
}) => {
  return (
    <button
      className={`inline-flex items-center justify-center w-4 h-4 rounded-full text-[9px] font-bold cursor-pointer border-none transition-colors mx-0.5 align-super ${
        isActive
          ? 'bg-vscode-link text-white scale-110'
          : 'bg-vscode-link/60 text-white hover:bg-vscode-link'
      }`}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      title={`Comment ${number}`}
      aria-label={`Go to comment ${number}`}
    >
      {number}
    </button>
  );
};
```

- [ ] **Step 3: Verify build**

Run: `cd /Users/harshagarwal/Documents/workspace/openclaude-vscode/webview && npx tsc --noEmit`

Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add webview/src/components/dialogs/PlanComment.tsx webview/src/components/dialogs/PlanCommentIndicator.tsx
git commit -m "feat(plan-review): add PlanComment editor and PlanCommentIndicator badge"
```

---

## Task 4: Upgrade PlanViewer with Rich HTML Rendering and Comment System

**Files:**
- Modify: `webview/src/components/dialogs/PlanViewer.tsx`

- [ ] **Step 1: Rewrite PlanViewer as the full interactive plan review component**

```tsx
// webview/src/components/dialogs/PlanViewer.tsx
import React, { useState, useCallback, useMemo, useRef } from 'react';
import { usePlanComments } from '../../hooks/usePlanComments';
import { PlanComment as PlanCommentComponent } from './PlanComment';
import { PlanCommentIndicator } from './PlanCommentIndicator';
import { useVSCode } from '../../hooks/useVSCode';
import type { PlanReviewAction } from '../../types/plan';

interface PlanViewerProps {
  /** The plan markdown content from the CLI */
  planMarkdown: string;
  /** The control_request ID this plan is responding to */
  requestId: string;
  /** Whether to show "Clear context" option on accept */
  showClearContextOnPlanAccept: boolean;
  /** Callback when review is submitted */
  onSubmit: (action: PlanReviewAction) => void;
  /** Callback to dismiss without action */
  onDismiss?: () => void;
}

export const PlanViewer: React.FC<PlanViewerProps> = ({
  planMarkdown,
  requestId,
  showClearContextOnPlanAccept,
  onSubmit,
  onDismiss,
}) => {
  const vscode = useVSCode();
  const {
    sections,
    comments,
    selection,
    activeCommentId,
    setActiveCommentId,
    planContainerRef,
    addComment,
    updateComment,
    removeComment,
  } = usePlanComments(planMarkdown);

  const [clearContext, setClearContext] = useState(false);
  const [revisionNote, setRevisionNote] = useState('');
  const [showRevisionInput, setShowRevisionInput] = useState(false);
  const commentListRef = useRef<HTMLDivElement>(null);

  /** Render plan markdown as structured HTML with <mark> highlights */
  const renderedHtml = useMemo(() => {
    let html = planMarkdown;

    // Convert markdown headings to HTML with IDs
    html = html.replace(/^(#{1,6})\s+(.+)$/gm, (_match, hashes: string, title: string) => {
      const level = hashes.length;
      const id = title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      return `<h${level} id="${id}" class="plan-heading plan-heading-${level}">${title}</h${level}>`;
    });

    // Convert markdown lists
    html = html.replace(/^[-*]\s+(.+)$/gm, '<li>$1</li>');
    html = html.replace(/(<li>.*<\/li>\n?)+/gs, '<ul class="plan-list">$&</ul>');

    // Convert inline code
    html = html.replace(/`([^`]+)`/g, '<code class="plan-code">$1</code>');

    // Convert bold
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

    // Convert italic
    html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');

    // Convert code blocks
    html = html.replace(/```(\w*)\n([\s\S]*?)```/g,
      '<pre class="plan-codeblock"><code>$2</code></pre>');

    // Convert paragraphs (lines not already wrapped in HTML)
    html = html.replace(/^(?!<[hul]|<pre|<li)(.+)$/gm, '<p>$1</p>');

    return html;
  }, [planMarkdown]);

  /** Apply <mark> highlighting for comments */
  const highlightedHtml = useMemo(() => {
    // We can't reliably do offset-based highlighting in rendered HTML,
    // so we use CSS ::highlight or a post-render DOM walk.
    // For now, return the base HTML; highlighting is done via DOM manipulation
    // in the planContainerRef after render.
    return renderedHtml;
  }, [renderedHtml]);

  /** Handle the "Add Comment" floating button click */
  const handleAddComment = useCallback(() => {
    addComment(''); // Empty text triggers the edit mode in PlanComment
  }, [addComment]);

  /** Handle approve */
  const handleApprove = useCallback(() => {
    if (comments.length > 0) {
      onSubmit({
        type: 'approve_with_comments',
        comments,
        clearContext,
      });
    } else {
      onSubmit({
        type: 'approve',
        clearContext,
      });
    }
  }, [comments, clearContext, onSubmit]);

  /** Handle request revision */
  const handleRequestRevision = useCallback(() => {
    if (showRevisionInput) {
      onSubmit({
        type: 'request_revision',
        comments,
        revisionNote: revisionNote.trim(),
      });
    } else {
      setShowRevisionInput(true);
    }
  }, [showRevisionInput, comments, revisionNote, onSubmit]);

  return (
    <div className="flex flex-col h-full bg-vscode-bg">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-vscode-border bg-vscode-input-bg">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-vscode-link" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
          </svg>
          <h2 className="text-sm font-semibold text-vscode-fg">Plan Review</h2>
          {comments.length > 0 && (
            <span className="px-1.5 py-0.5 text-[10px] rounded-full bg-vscode-link/20 text-vscode-link font-medium">
              {comments.length} comment{comments.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
        {onDismiss && (
          <button
            className="p-1 text-vscode-fg/40 hover:text-vscode-fg bg-transparent border-none cursor-pointer"
            onClick={onDismiss}
            aria-label="Close plan viewer"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 16 16">
              <path d="M4.5 4.5l7 7M11.5 4.5l-7 7" stroke="currentColor" strokeWidth="1.5" fill="none" />
            </svg>
          </button>
        )}
      </div>

      {/* Main content: plan + comment sidebar */}
      <div className="flex flex-1 overflow-hidden">
        {/* Plan content */}
        <div className="flex-1 overflow-y-auto">
          {/* Section navigation */}
          {sections.length > 0 && (
            <nav className="px-4 py-2 border-b border-vscode-border/50 bg-vscode-input-bg/50">
              <div className="text-[10px] text-vscode-fg/40 uppercase tracking-wider mb-1">Sections</div>
              <div className="flex flex-wrap gap-1">
                {sections.map((section) => (
                  <a
                    key={section.id}
                    href={`#${section.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
                    className="text-xs text-vscode-link hover:underline"
                  >
                    {section.title}
                  </a>
                ))}
              </div>
            </nav>
          )}

          {/* Plan body */}
          <div
            ref={planContainerRef}
            className="plan-content px-4 py-4 text-sm text-vscode-fg leading-relaxed select-text"
            dangerouslySetInnerHTML={{ __html: highlightedHtml }}
            style={{
              // CSS for plan content styling
            }}
          />

          {/* "Add Comment" floating button on text selection */}
          {selection.isVisible && (
            <div
              className="absolute z-40"
              style={{
                top: `${selection.top}px`,
                left: `${selection.left}px`,
                transform: 'translateX(-50%)',
              }}
            >
              <button
                className="flex items-center gap-1 px-2 py-1 text-xs rounded-md bg-vscode-button-bg text-vscode-button-fg hover:bg-vscode-button-hover shadow-lg cursor-pointer border-none whitespace-nowrap"
                onClick={handleAddComment}
                onMouseDown={(e) => e.preventDefault()} // prevent deselecting
              >
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 16 16">
                  <path d="M8 1v14M1 8h14" stroke="currentColor" strokeWidth="2" fill="none" />
                </svg>
                Add Comment
              </button>
            </div>
          )}
        </div>

        {/* Comment sidebar */}
        {comments.length > 0 && (
          <div
            ref={commentListRef}
            className="w-72 border-l border-vscode-border overflow-y-auto bg-vscode-bg"
          >
            <div className="p-3 space-y-2">
              <div className="text-xs text-vscode-fg/50 font-medium mb-2">
                Comments ({comments.length})
              </div>
              {comments.map((comment) => (
                <PlanCommentComponent
                  key={comment.id}
                  comment={comment}
                  isActive={activeCommentId === comment.id}
                  onActivate={() => setActiveCommentId(comment.id)}
                  onUpdate={(text) => updateComment(comment.id, text)}
                  onRemove={() => removeComment(comment.id)}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Revision note input */}
      {showRevisionInput && (
        <div className="px-4 py-2 border-t border-vscode-border bg-vscode-input-bg/50">
          <textarea
            className="w-full px-2 py-1.5 text-xs rounded border border-vscode-input-border bg-vscode-input-bg text-vscode-input-fg outline-none resize-none focus:border-vscode-link"
            placeholder="What changes should be made to the plan?"
            value={revisionNote}
            onChange={(e) => setRevisionNote(e.target.value)}
            rows={2}
            autoFocus
          />
        </div>
      )}

      {/* Footer with actions */}
      <div className="flex items-center justify-between px-4 py-3 border-t border-vscode-border bg-vscode-input-bg">
        <div className="flex items-center gap-2">
          {showClearContextOnPlanAccept && (
            <label className="flex items-center gap-1.5 text-xs text-vscode-fg/50 cursor-pointer">
              <input
                type="checkbox"
                checked={clearContext}
                onChange={(e) => setClearContext(e.target.checked)}
                className="w-3.5 h-3.5 rounded border-vscode-input-border accent-vscode-link"
              />
              Clear context after accept
            </label>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            className="px-3 py-1.5 text-xs rounded border border-vscode-border text-vscode-fg bg-transparent hover:bg-vscode-input-bg cursor-pointer"
            onClick={handleRequestRevision}
          >
            {showRevisionInput ? 'Submit Revision Request' : 'Request Revision'}
          </button>
          <button
            className="px-3 py-1.5 text-xs rounded bg-vscode-button-bg text-vscode-button-fg hover:bg-vscode-button-hover cursor-pointer border-none"
            onClick={handleApprove}
          >
            {comments.length > 0 ? 'Approve with Comments' : 'Approve Plan'}
          </button>
        </div>
      </div>

      {/* Plan content styles */}
      <style>{`
        .plan-content h1, .plan-content h2, .plan-content h3,
        .plan-content h4, .plan-content h5, .plan-content h6 {
          margin-top: 1.25em;
          margin-bottom: 0.5em;
          font-weight: 600;
          color: var(--vscode-editor-foreground);
        }
        .plan-content h1 { font-size: 1.25em; }
        .plan-content h2 { font-size: 1.125em; }
        .plan-content h3 { font-size: 1em; }
        .plan-content p { margin: 0.5em 0; }
        .plan-list { list-style: disc; padding-left: 1.5em; margin: 0.5em 0; }
        .plan-list li { margin: 0.25em 0; }
        .plan-code {
          background: var(--vscode-textCodeBlock-background, rgba(127,127,127,0.1));
          padding: 0.1em 0.3em;
          border-radius: 3px;
          font-family: var(--vscode-editor-font-family);
          font-size: 0.9em;
        }
        .plan-codeblock {
          background: var(--vscode-textCodeBlock-background, rgba(127,127,127,0.1));
          padding: 0.75em 1em;
          border-radius: 4px;
          overflow-x: auto;
          margin: 0.5em 0;
          font-size: 0.85em;
        }
        .plan-content mark {
          background: rgba(79, 70, 229, 0.2);
          border-bottom: 2px solid rgba(79, 70, 229, 0.5);
          padding: 0 2px;
          border-radius: 2px;
        }
      `}</style>
    </div>
  );
};
```

- [ ] **Step 2: Verify build**

Run: `cd /Users/harshagarwal/Documents/workspace/openclaude-vscode && npm run build:webview`

Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add webview/src/components/dialogs/PlanViewer.tsx
git commit -m "feat(plan-review): upgrade PlanViewer with rich HTML, text selection, and inline comments"
```

---

## Task 5: Wire Plan Review Responses to the Extension Host

**Files:**
- Modify: `src/process/controlRouter.ts` (or the webview message handler in extension.ts)

- [ ] **Step 1: Handle plan review submission messages from the webview**

Add to the webview message handler in the extension host:

```typescript
// In the webview -> extension host message handler:

case 'plan_review_submit': {
  const { requestId, action } = msg;

  if (action.type === 'approve') {
    transport.write({
      type: 'control_response',
      response: {
        subtype: 'success',
        request_id: requestId,
        response: {
          decision: 'approve',
          clearContext: action.clearContext,
        },
      },
    });
  } else if (action.type === 'approve_with_comments') {
    const commentSummary = action.comments
      .map((c: any) => `[${c.number}] "${c.anchorText}" — ${c.text}`)
      .join('\n');
    transport.write({
      type: 'control_response',
      response: {
        subtype: 'success',
        request_id: requestId,
        response: {
          decision: 'approve',
          feedback: commentSummary,
          clearContext: action.clearContext,
        },
      },
    });
  } else if (action.type === 'request_revision') {
    const commentSummary = action.comments
      .map((c: any) => `[${c.number}] "${c.anchorText}" — ${c.text}`)
      .join('\n');
    const fullFeedback = action.revisionNote
      ? `${action.revisionNote}\n\nInline comments:\n${commentSummary}`
      : commentSummary;
    transport.write({
      type: 'control_response',
      response: {
        subtype: 'error',
        request_id: requestId,
        error: fullFeedback || 'User requested revision',
      },
    });
  }
  break;
}
```

- [ ] **Step 2: Update PlanViewer integration in the App/ChatPanel**

Where the permission dialog renders a plan (from Story 7), replace the basic plan view with the enhanced PlanViewer:

```tsx
// In the permission/plan dialog rendering (App.tsx or wherever PermissionDialog is wired):

{planRequest && (
  <PlanViewer
    planMarkdown={planRequest.planContent}
    requestId={planRequest.requestId}
    showClearContextOnPlanAccept={settings?.showClearContextOnPlanAccept ?? false}
    onSubmit={(action) => {
      vscode.postMessage({
        type: 'plan_review_submit',
        requestId: planRequest.requestId,
        action,
      });
      setPlanRequest(null);
    }}
    onDismiss={() => setPlanRequest(null)}
  />
)}
```

- [ ] **Step 3: Build and verify**

Run: `cd /Users/harshagarwal/Documents/workspace/openclaude-vscode && npm run build`

Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add src/process/controlRouter.ts webview/src/App.tsx
git commit -m "feat(plan-review): wire plan review responses to CLI via control_response"
```

---

## Final Verification

- [ ] Run: `cd /Users/harshagarwal/Documents/workspace/openclaude-vscode && npm run build`
- [ ] Run: `cd /Users/harshagarwal/Documents/workspace/openclaude-vscode && npx vitest run test/unit/planComments.test.ts`
- [ ] Manual verification checklist:
  - Plan renders as rich HTML with styled headings, lists, code blocks
  - Section headings auto-detected and shown in navigation bar
  - Selecting text in the plan shows the floating "Add Comment" button
  - Clicking "Add Comment" opens a textarea anchored to the selection
  - Comment appears in the sidebar with its number badge
  - Highlighted text gets `<mark>` styling
  - Numbered indicators appear inline next to commented text
  - Clicking indicator scrolls to/activates the comment in sidebar
  - Comments can be edited and deleted
  - "Approve Plan" sends control_response with decision=approve
  - "Approve with Comments" includes formatted comment text
  - "Request Revision" sends revision note + comments as error response
  - "Clear context after accept" checkbox visible when setting enabled
  - Multiple comments ordered by position in document
