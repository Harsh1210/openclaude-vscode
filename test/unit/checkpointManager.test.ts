import { describe, it, expect, beforeEach } from 'vitest';
import {
  CheckpointManager,
  type CheckpointEntry,
  type RewindFilesRequest,
  type RewindFilesResponse,
} from '../../src/checkpoint/checkpointManager';

describe('CheckpointManager', () => {
  let manager: CheckpointManager;

  beforeEach(() => {
    manager = new CheckpointManager();
  });

  // =========================================================================
  // Registration
  // =========================================================================

  describe('registerAssistantMessage', () => {
    it('registers a message UUID as a checkpoint', () => {
      manager.registerAssistantMessage('msg-001', 'session-abc');
      const entry = manager.getCheckpoint('msg-001');
      expect(entry).toBeDefined();
      expect(entry!.messageUuid).toBe('msg-001');
      expect(entry!.sessionId).toBe('session-abc');
      expect(entry!.persistedFiles).toEqual([]);
    });

    it('does not duplicate when registered twice', () => {
      manager.registerAssistantMessage('msg-001', 'session-abc');
      manager.registerAssistantMessage('msg-001', 'session-abc');
      expect(manager.getAllCheckpoints()).toHaveLength(1);
    });

    it('tracks multiple messages in order', () => {
      manager.registerAssistantMessage('msg-001', 'session-abc');
      manager.registerAssistantMessage('msg-002', 'session-abc');
      manager.registerAssistantMessage('msg-003', 'session-abc');
      const all = manager.getAllCheckpoints();
      expect(all).toHaveLength(3);
      expect(all.map((c) => c.messageUuid)).toEqual(['msg-001', 'msg-002', 'msg-003']);
    });
  });

  // =========================================================================
  // files_persisted handling
  // =========================================================================

  describe('markFilesPersisted', () => {
    it('attaches file list to existing checkpoint', () => {
      manager.registerAssistantMessage('msg-001', 'session-abc');
      manager.markFilesPersisted('msg-001', [
        { filename: 'src/main.ts', file_id: 'f-1' },
        { filename: 'src/utils.ts', file_id: 'f-2' },
      ]);
      const entry = manager.getCheckpoint('msg-001');
      expect(entry!.persistedFiles).toHaveLength(2);
      expect(entry!.persistedFiles[0].filename).toBe('src/main.ts');
    });

    it('accumulates files across multiple persist events', () => {
      manager.registerAssistantMessage('msg-001', 'session-abc');
      manager.markFilesPersisted('msg-001', [{ filename: 'a.ts', file_id: 'f-1' }]);
      manager.markFilesPersisted('msg-001', [{ filename: 'b.ts', file_id: 'f-2' }]);
      expect(manager.getCheckpoint('msg-001')!.persistedFiles).toHaveLength(2);
    });

    it('no-ops if message UUID is unknown', () => {
      // Should not throw
      manager.markFilesPersisted('unknown-uuid', [{ filename: 'x.ts', file_id: 'f-x' }]);
      expect(manager.getCheckpoint('unknown-uuid')).toBeUndefined();
    });
  });

  // =========================================================================
  // session_state_changed handling
  // =========================================================================

  describe('handleSessionStateChanged', () => {
    it('updates session state on the latest checkpoint', () => {
      manager.registerAssistantMessage('msg-001', 'session-abc');
      manager.handleSessionStateChanged('idle', 'session-abc');
      const entry = manager.getCheckpoint('msg-001');
      expect(entry!.lastSessionState).toBe('idle');
    });

    it('updates only the latest checkpoint for the given session', () => {
      manager.registerAssistantMessage('msg-001', 'session-abc');
      manager.registerAssistantMessage('msg-002', 'session-abc');
      manager.handleSessionStateChanged('idle', 'session-abc');
      expect(manager.getCheckpoint('msg-001')!.lastSessionState).toBeUndefined();
      expect(manager.getCheckpoint('msg-002')!.lastSessionState).toBe('idle');
    });
  });

  // =========================================================================
  // Rewind request building
  // =========================================================================

  describe('buildRewindRequest', () => {
    it('builds a rewind_files control request', () => {
      manager.registerAssistantMessage('msg-001', 'session-abc');
      const req = manager.buildRewindRequest('msg-001');
      expect(req).toEqual({
        subtype: 'rewind_files',
        user_message_id: 'msg-001',
        dry_run: false,
      });
    });

    it('builds a dry_run rewind request', () => {
      manager.registerAssistantMessage('msg-001', 'session-abc');
      const req = manager.buildRewindRequest('msg-001', true);
      expect(req).toEqual({
        subtype: 'rewind_files',
        user_message_id: 'msg-001',
        dry_run: true,
      });
    });

    it('throws if message UUID is unknown', () => {
      expect(() => manager.buildRewindRequest('nonexistent')).toThrow(
        /no checkpoint found/i,
      );
    });
  });

  // =========================================================================
  // Fork request building
  // =========================================================================

  describe('buildForkOptions', () => {
    it('returns ProcessManagerOptions overrides for fork', () => {
      manager.registerAssistantMessage('msg-001', 'session-abc');
      const opts = manager.buildForkOptions('msg-001');
      expect(opts.sessionId).toBe('msg-001');
      expect(opts.forkSession).toBe(true);
    });

    it('throws if message UUID is unknown', () => {
      expect(() => manager.buildForkOptions('nonexistent')).toThrow(
        /no checkpoint found/i,
      );
    });
  });

  // =========================================================================
  // Serialization for webview
  // =========================================================================

  describe('getWebviewState', () => {
    it('returns serializable checkpoint summaries', () => {
      manager.registerAssistantMessage('msg-001', 'session-abc');
      manager.markFilesPersisted('msg-001', [{ filename: 'a.ts', file_id: 'f-1' }]);
      const state = manager.getWebviewState();
      expect(state).toHaveLength(1);
      expect(state[0].messageUuid).toBe('msg-001');
      expect(state[0].fileCount).toBe(1);
      expect(state[0].canRewind).toBe(true);
    });
  });

  // =========================================================================
  // Clear on new session
  // =========================================================================

  describe('clear', () => {
    it('removes all checkpoints', () => {
      manager.registerAssistantMessage('msg-001', 'session-abc');
      manager.registerAssistantMessage('msg-002', 'session-abc');
      manager.clear();
      expect(manager.getAllCheckpoints()).toHaveLength(0);
    });
  });
});
