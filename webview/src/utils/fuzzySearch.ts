/**
 * Simple fuzzy search — matches characters in order (not necessarily contiguous).
 * Returns a score (lower is better match) or null if no match.
 *
 * Example: query "amc" matches "AtMentionComponent" (a...M...C)
 */
export interface FuzzyMatch<T> {
  item: T;
  score: number;
  highlights: number[]; // character indices that matched
}

export function fuzzyMatch(query: string, target: string): { score: number; highlights: number[] } | null {
  const queryLower = query.toLowerCase();
  const targetLower = target.toLowerCase();

  if (queryLower.length === 0) {
    return { score: 0, highlights: [] };
  }

  if (queryLower.length > targetLower.length) {
    return null;
  }

  const highlights: number[] = [];
  let queryIdx = 0;
  let score = 0;
  let lastMatchIdx = -1;

  for (let i = 0; i < targetLower.length && queryIdx < queryLower.length; i++) {
    if (targetLower[i] === queryLower[queryIdx]) {
      highlights.push(i);

      // Bonus for consecutive matches
      if (lastMatchIdx === i - 1) {
        score -= 1;
      }

      // Bonus for matching at word boundaries (after /, ., -, _, or uppercase)
      if (
        i === 0 ||
        /[/.\-_]/.test(target[i - 1]) ||
        (target[i] === target[i].toUpperCase() && target[i] !== target[i].toLowerCase())
      ) {
        score -= 2;
      }

      // Penalty for distance from start
      score += i * 0.1;

      lastMatchIdx = i;
      queryIdx++;
    }
  }

  // All query characters must be matched
  if (queryIdx < queryLower.length) {
    return null;
  }

  return { score, highlights };
}

/**
 * Fuzzy search over a list of items. Returns matches sorted by score (best first).
 */
export function fuzzySearch<T>(
  query: string,
  items: T[],
  getText: (item: T) => string,
  maxResults = 50,
): FuzzyMatch<T>[] {
  if (!query) {
    return items.slice(0, maxResults).map((item) => ({
      item,
      score: 0,
      highlights: [],
    }));
  }

  const matches: FuzzyMatch<T>[] = [];

  for (const item of items) {
    const text = getText(item);
    const result = fuzzyMatch(query, text);
    if (result) {
      matches.push({ item, score: result.score, highlights: result.highlights });
    }
  }

  matches.sort((a, b) => a.score - b.score);
  return matches.slice(0, maxResults);
}
