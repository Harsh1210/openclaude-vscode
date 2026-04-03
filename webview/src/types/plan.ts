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
