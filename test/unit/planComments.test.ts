import { describe, it, expect } from 'vitest';
import { parseSections, orderComments } from '../../webview/src/hooks/usePlanComments';
import type { PlanComment } from '../../webview/src/types/plan';

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
