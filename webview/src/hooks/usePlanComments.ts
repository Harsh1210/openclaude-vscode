// webview/src/hooks/usePlanComments.ts
import { useState, useCallback, useRef, useEffect } from 'react';
import type { PlanComment, PlanSection, SelectionState } from '../types/plan';

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
  const removeComment = useCallback(
    (commentId: string) => {
      setComments((prev) => orderComments(prev.filter((c) => c.id !== commentId)));
      if (activeCommentId === commentId) {
        setActiveCommentId(null);
      }
    },
    [activeCommentId],
  );

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
