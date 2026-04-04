import { describe, it, expect } from 'vitest';
import * as path from 'node:path';

describe('WorktreeManager helpers', () => {
  describe('sanitizeWorktreeName', () => {
    it('should allow simple alphanumeric names', async () => {
      const { sanitizeWorktreeName } = await import('../../src/worktree/worktreeManager');

      expect(sanitizeWorktreeName('feature-auth')).toBe('feature-auth');
      expect(sanitizeWorktreeName('fix_bug_123')).toBe('fix_bug_123');
    });

    it('should replace spaces with hyphens', async () => {
      const { sanitizeWorktreeName } = await import('../../src/worktree/worktreeManager');

      expect(sanitizeWorktreeName('my feature branch')).toBe('my-feature-branch');
    });

    it('should remove unsafe characters', async () => {
      const { sanitizeWorktreeName } = await import('../../src/worktree/worktreeManager');

      expect(sanitizeWorktreeName('feat/new..thing')).toBe('feat-new-thing');
      expect(sanitizeWorktreeName('test@{something}')).toBe('test-something-');
      expect(sanitizeWorktreeName('branch~1^2')).toBe('branch-1-2');
    });

    it('should reject empty names after sanitization', async () => {
      const { sanitizeWorktreeName } = await import('../../src/worktree/worktreeManager');

      expect(sanitizeWorktreeName('')).toBe('');
      expect(sanitizeWorktreeName('...')).toBe('');
    });

    it('should trim leading/trailing hyphens', async () => {
      const { sanitizeWorktreeName } = await import('../../src/worktree/worktreeManager');

      expect(sanitizeWorktreeName('-feature-')).toBe('feature');
    });
  });

  describe('deriveWorktreePath', () => {
    it('should place worktree as sibling of repo root', async () => {
      const { deriveWorktreePath } = await import('../../src/worktree/worktreeManager');

      expect(deriveWorktreePath('/home/user/myrepo', 'feature-auth')).toBe(
        path.join('/home/user/myrepo-worktrees', 'feature-auth'),
      );
    });

    it('should use custom base dir if provided', async () => {
      const { deriveWorktreePath } = await import('../../src/worktree/worktreeManager');

      expect(deriveWorktreePath('/home/user/myrepo', 'fix', '/tmp/worktrees')).toBe(
        path.join('/tmp/worktrees', 'fix'),
      );
    });
  });

  describe('buildGitWorktreeArgs', () => {
    it('should build correct git worktree add arguments', async () => {
      const { buildGitWorktreeArgs } = await import('../../src/worktree/worktreeManager');

      const args = buildGitWorktreeArgs('/path/to/worktree', 'feature-auth');

      expect(args).toEqual(['worktree', 'add', '/path/to/worktree', '-b', 'feature-auth']);
    });

    it('should support creating from existing branch', async () => {
      const { buildGitWorktreeArgs } = await import('../../src/worktree/worktreeManager');

      const args = buildGitWorktreeArgs('/path/to/worktree', 'feature-auth', { existingBranch: true });

      expect(args).toEqual(['worktree', 'add', '/path/to/worktree', 'feature-auth']);
    });
  });
});
