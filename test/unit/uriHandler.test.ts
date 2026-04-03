import { describe, it, expect } from 'vitest';
import { parseOpenClaudeUri } from '../../src/uriHandler';

// Minimal Uri stub — only needs .query property
function makeUri(query: string) {
  return { query } as import('vscode').Uri;
}

describe('parseOpenClaudeUri', () => {
  it('returns empty object when no query string', () => {
    expect(parseOpenClaudeUri(makeUri(''))).toEqual({});
  });

  it('parses prompt parameter', () => {
    const result = parseOpenClaudeUri(makeUri('prompt=Hello+world'));
    expect(result.prompt).toBe('Hello world');
    expect(result.session).toBeUndefined();
  });

  it('parses session parameter', () => {
    const result = parseOpenClaudeUri(makeUri('session=abc-123'));
    expect(result.session).toBe('abc-123');
    expect(result.prompt).toBeUndefined();
  });

  it('parses both prompt and session', () => {
    const result = parseOpenClaudeUri(makeUri('prompt=Fix+bug&session=sess-456'));
    expect(result.prompt).toBe('Fix bug');
    expect(result.session).toBe('sess-456');
  });

  it('ignores unknown parameters', () => {
    const result = parseOpenClaudeUri(makeUri('unknown=value&prompt=hi'));
    expect(result.prompt).toBe('hi');
    expect(result).not.toHaveProperty('unknown');
  });

  it('treats blank prompt as missing', () => {
    const result = parseOpenClaudeUri(makeUri('prompt=   '));
    expect(result.prompt).toBeUndefined();
  });

  it('treats blank session as missing', () => {
    const result = parseOpenClaudeUri(makeUri('session='));
    expect(result.session).toBeUndefined();
  });

  it('handles URL-encoded characters in prompt', () => {
    const result = parseOpenClaudeUri(makeUri('prompt=Hello%20world%21'));
    expect(result.prompt).toBe('Hello world!');
  });
});
