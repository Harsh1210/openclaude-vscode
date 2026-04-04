import { describe, expect, it } from 'vitest';
import { resolveCliExecutable } from '../../src/settings/cliExecutable';

describe('resolveCliExecutable', () => {
  it('uses a configured wrapper when it is non-empty', () => {
    const config = {
      get: (_key: string, _defaultValue?: string) => '  C:\\Tools\\openclaude.cmd  ',
    };

    expect(resolveCliExecutable(config)).toBe('C:\\Tools\\openclaude.cmd');
  });

  it('falls back to openclaude when the wrapper is empty', () => {
    const config = {
      get: (_key: string, _defaultValue?: string) => '   ',
    };

    expect(resolveCliExecutable(config)).toBe('openclaude');
  });
});
