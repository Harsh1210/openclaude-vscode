// webview/src/components/dialogs/PlanViewer.tsx
// Rich interactive plan viewer with section parsing, text selection, comment anchoring,
// and approve/revision actions.

import React, { useState, useCallback, useMemo, useRef } from 'react';
import { usePlanComments } from '../../hooks/usePlanComments';
import { PlanComment as PlanCommentComponent } from './PlanComment';
import type { PlanReviewAction } from '../../types/plan';

interface PlanViewerProps {
  /** The plan markdown content from the CLI */
  planMarkdown?: string;
  /** Legacy prop: plain text plan content */
  planContent?: string;
  /** The control_request ID this plan is responding to */
  requestId?: string;
  /** Whether to show "Clear context" option on accept */
  showClearContextOnPlanAccept?: boolean;
  /** Callback when review is submitted via new API */
  onSubmit?: (action: PlanReviewAction) => void;
  /** Legacy: called when user approves */
  onApprove?: () => void;
  /** Legacy: called when user requests revision */
  onRequestRevision?: (feedback: string) => void;
  /** Callback to dismiss without action */
  onDismiss: () => void;
}

export function PlanViewer({
  planMarkdown,
  planContent,
  requestId: _requestId,
  showClearContextOnPlanAccept = false,
  onSubmit,
  onApprove,
  onRequestRevision,
  onDismiss,
}: PlanViewerProps) {
  // Support both new planMarkdown and legacy planContent props
  const markdown = planMarkdown ?? planContent ?? '';

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
  } = usePlanComments(markdown);

  const [clearContext, setClearContext] = useState(false);
  const [revisionNote, setRevisionNote] = useState('');
  const [showRevisionInput, setShowRevisionInput] = useState(false);
  const commentListRef = useRef<HTMLDivElement>(null);

  /** Render plan markdown as structured HTML */
  const renderedHtml = useMemo(() => {
    let html = markdown;

    // Convert code blocks first (before other transformations)
    html = html.replace(/```(\w*)\n([\s\S]*?)```/g,
      '<pre class="plan-codeblock"><code>$2</code></pre>');

    // Convert markdown headings to HTML with IDs
    html = html.replace(/^(#{1,6})\s+(.+)$/gm, (_match: string, hashes: string, title: string) => {
      const level = hashes.length;
      const id = title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      return `<h${level} id="${id}" class="plan-heading plan-heading-${level}">${title}</h${level}>`;
    });

    // Convert inline code
    html = html.replace(/`([^`]+)`/g, '<code class="plan-code">$1</code>');

    // Convert bold
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

    // Convert italic
    html = html.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>');

    // Convert markdown lists
    html = html.replace(/^[-*]\s+(.+)$/gm, '<li>$1</li>');
    // Wrap consecutive li elements in ul
    html = html.replace(/(<li>[\s\S]*?<\/li>\n?)+/g, (match) => `<ul class="plan-list">${match}</ul>`);

    // Convert paragraphs (lines not already wrapped in HTML tags)
    html = html.replace(/^(?!<[huplo]|<pre|<li|<\/|$)(.+)$/gm, '<p>$1</p>');

    return html;
  }, [markdown]);

  /** Handle the "Add Comment" floating button click */
  const handleAddComment = useCallback(() => {
    addComment(''); // Empty text triggers the edit mode in PlanComment
  }, [addComment]);

  /** Handle approve */
  const handleApprove = useCallback(() => {
    if (onSubmit) {
      if (comments.length > 0) {
        onSubmit({ type: 'approve_with_comments', comments, clearContext });
      } else {
        onSubmit({ type: 'approve', clearContext });
      }
    } else if (onApprove) {
      onApprove();
    }
  }, [comments, clearContext, onSubmit, onApprove]);

  /** Handle request revision */
  const handleRequestRevision = useCallback(() => {
    if (showRevisionInput) {
      if (onSubmit) {
        onSubmit({ type: 'request_revision', comments, revisionNote: revisionNote.trim() });
      } else if (onRequestRevision) {
        onRequestRevision(revisionNote.trim());
      }
    } else {
      setShowRevisionInput(true);
    }
  }, [showRevisionInput, comments, revisionNote, onSubmit, onRequestRevision]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-3xl mx-4 rounded-lg border border-[var(--vscode-panel-border)] bg-[var(--vscode-editor-background)] shadow-xl flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--vscode-panel-border)] bg-[var(--vscode-input-background)] shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-sm">📋</span>
            <span className="text-sm font-semibold text-[var(--vscode-editor-foreground)]">Plan Review</span>
            {comments.length > 0 && (
              <span className="px-1.5 py-0.5 text-[10px] rounded-full bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] font-medium">
                {comments.length} comment{comments.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>
          <button
            onClick={onDismiss}
            className="text-xs text-[var(--vscode-descriptionForeground)] hover:text-[var(--vscode-editor-foreground)] bg-transparent border-none cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Main content: plan + comment sidebar */}
        <div className="flex flex-1 overflow-hidden">
          {/* Plan content */}
          <div className="flex-1 overflow-y-auto relative">
            {/* Section navigation */}
            {sections.length > 0 && (
              <nav className="px-4 py-2 border-b border-[var(--vscode-panel-border)] bg-[var(--vscode-input-background)]">
                <div className="text-[10px] text-[var(--vscode-descriptionForeground)] uppercase tracking-wider mb-1">Sections</div>
                <div className="flex flex-wrap gap-1">
                  {sections.map((section) => (
                    <a
                      key={section.id}
                      href={`#${section.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
                      className="text-xs text-[var(--vscode-textLink-foreground)] hover:underline"
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
              className="plan-content px-4 py-4 text-sm text-[var(--vscode-editor-foreground)] leading-relaxed select-text"
              dangerouslySetInnerHTML={{ __html: renderedHtml }}
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
                  className="flex items-center gap-1 px-2 py-1 text-xs rounded-md bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] hover:bg-[var(--vscode-button-hoverBackground)] shadow-lg cursor-pointer border-none whitespace-nowrap"
                  onClick={handleAddComment}
                  onMouseDown={(e) => e.preventDefault()} // prevent deselecting
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 16 16">
                    <path d="M8 1v14M1 8h14" stroke="currentColor" strokeWidth="2" />
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
              className="w-64 border-l border-[var(--vscode-panel-border)] overflow-y-auto bg-[var(--vscode-editor-background)] shrink-0"
            >
              <div className="p-3 space-y-2">
                <div className="text-xs text-[var(--vscode-descriptionForeground)] font-medium mb-2">
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
          <div className="px-4 py-2 border-t border-[var(--vscode-panel-border)] bg-[var(--vscode-input-background)] shrink-0">
            <textarea
              className="w-full px-2 py-1.5 text-xs rounded border border-[var(--vscode-input-border)] bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] outline-none resize-none focus:border-[var(--vscode-focusBorder)]"
              placeholder="What changes should be made to the plan?"
              value={revisionNote}
              onChange={(e) => setRevisionNote(e.target.value)}
              rows={2}
              autoFocus
            />
          </div>
        )}

        {/* Footer with actions */}
        <div className="px-4 py-3 border-t border-[var(--vscode-panel-border)] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            {showClearContextOnPlanAccept && (
              <label className="flex items-center gap-1.5 text-xs text-[var(--vscode-descriptionForeground)] cursor-pointer">
                <input
                  type="checkbox"
                  checked={clearContext}
                  onChange={(e) => setClearContext(e.target.checked)}
                  className="w-3.5 h-3.5 rounded border-[var(--vscode-input-border)] accent-[var(--vscode-focusBorder)]"
                />
                Clear context after accept
              </label>
            )}
          </div>

          <div className="flex items-center gap-2">
            {showRevisionInput ? (
              <>
                <button
                  onClick={() => setShowRevisionInput(false)}
                  className="px-3 py-1.5 text-xs rounded border border-[var(--vscode-input-border)] text-[var(--vscode-editor-foreground)] hover:bg-[var(--vscode-input-background)] transition-colors bg-transparent cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={handleRequestRevision}
                  disabled={!revisionNote.trim() && comments.length === 0}
                  className="px-3 py-1.5 text-xs rounded bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] hover:bg-[var(--vscode-button-hoverBackground)] transition-colors disabled:opacity-50 border-none cursor-pointer"
                >
                  Send Revision
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={handleRequestRevision}
                  className="px-3 py-1.5 text-xs rounded border border-[var(--vscode-input-border)] text-[var(--vscode-editor-foreground)] hover:bg-[var(--vscode-input-background)] transition-colors bg-transparent cursor-pointer"
                >
                  Request Revision
                </button>
                <button
                  onClick={handleApprove}
                  className="px-3 py-1.5 text-xs rounded bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] hover:bg-[var(--vscode-button-hoverBackground)] transition-colors border-none cursor-pointer"
                >
                  {comments.length > 0 ? 'Approve with Comments' : 'Approve Plan'}
                </button>
              </>
            )}
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
    </div>
  );
}
