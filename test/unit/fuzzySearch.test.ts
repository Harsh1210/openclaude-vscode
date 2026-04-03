import { fuzzyMatch, fuzzySearch } from '../../webview/src/utils/fuzzySearch';

describe('fuzzyMatch', () => {
  it('matches exact string', () => {
    const result = fuzzyMatch('auth', 'auth');
    expect(result).not.toBeNull();
    expect(result!.highlights).toEqual([0, 1, 2, 3]);
  });

  it('matches substring', () => {
    const result = fuzzyMatch('auth', 'auth.handlers.ts');
    expect(result).not.toBeNull();
    expect(result!.highlights).toEqual([0, 1, 2, 3]);
  });

  it('matches fuzzy characters in order', () => {
    const result = fuzzyMatch('aht', 'auth.handlers.ts');
    expect(result).not.toBeNull();
    expect(result!.highlights.length).toBe(3);
  });

  it('returns null when characters not in order', () => {
    const result = fuzzyMatch('zxy', 'auth.handlers.ts');
    expect(result).toBeNull();
  });

  it('returns null when query is longer than target', () => {
    const result = fuzzyMatch('very-long-query', 'short');
    expect(result).toBeNull();
  });

  it('returns match with empty query', () => {
    const result = fuzzyMatch('', 'anything');
    expect(result).not.toBeNull();
    expect(result!.score).toBe(0);
  });

  it('scores word boundary matches better', () => {
    const scoreExact = fuzzyMatch('pm', 'processManager.ts');
    const scoreMiddle = fuzzyMatch('pm', 'somepm.ts');
    // processManager has p at start and M at word boundary — should score better
    expect(scoreExact).not.toBeNull();
    expect(scoreMiddle).not.toBeNull();
    expect(scoreExact!.score).toBeLessThan(scoreMiddle!.score);
  });
});

describe('fuzzySearch', () => {
  const items = [
    'src/auth/auth.handlers.ts',
    'src/process/processManager.ts',
    'src/webview/webviewProvider.ts',
    'webview/src/App.tsx',
    'package.json',
  ];

  it('returns all items for empty query (up to maxResults)', () => {
    const results = fuzzySearch('', items, (x) => x);
    expect(results.length).toBe(5);
  });

  it('filters to matching items', () => {
    const results = fuzzySearch('auth', items, (x) => x);
    expect(results.length).toBe(1);
    expect(results[0].item).toBe('src/auth/auth.handlers.ts');
  });

  it('respects maxResults', () => {
    const results = fuzzySearch('s', items, (x) => x, 2);
    expect(results.length).toBeLessThanOrEqual(2);
  });

  it('works with object items and getText', () => {
    const commands = [
      { name: '/help', description: 'Show help' },
      { name: '/model', description: 'Switch model' },
      { name: '/compact', description: 'Compact context' },
    ];
    const results = fuzzySearch('mod', commands, (c) => c.name);
    expect(results.length).toBe(1);
    expect(results[0].item.name).toBe('/model');
  });
});
