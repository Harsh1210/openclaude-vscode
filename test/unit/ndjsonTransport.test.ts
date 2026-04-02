// test/unit/ndjsonTransport.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PassThrough } from 'node:stream';
import { NdjsonTransport } from '../../src/process/ndjsonTransport';

describe('NdjsonTransport', () => {
  let stdout: PassThrough;
  let stdin: PassThrough;
  let transport: NdjsonTransport;

  beforeEach(() => {
    stdout = new PassThrough();
    stdin = new PassThrough();
    transport = new NdjsonTransport(stdout, stdin);
  });

  describe('reading (stdout parsing)', () => {
    it('should parse a complete JSON line', async () => {
      const messages: unknown[] = [];
      transport.onMessage((msg) => messages.push(msg));

      stdout.write('{"type":"keep_alive"}\n');

      // Give the readline a tick to process
      await new Promise((r) => setTimeout(r, 10));
      expect(messages).toEqual([{ type: 'keep_alive' }]);
    });

    it('should handle partial lines buffered across chunks', async () => {
      const messages: unknown[] = [];
      transport.onMessage((msg) => messages.push(msg));

      stdout.write('{"type":');
      stdout.write('"assistant"}\n');

      await new Promise((r) => setTimeout(r, 10));
      expect(messages).toEqual([{ type: 'assistant' }]);
    });

    it('should handle multiple messages in one chunk', async () => {
      const messages: unknown[] = [];
      transport.onMessage((msg) => messages.push(msg));

      stdout.write('{"type":"keep_alive"}\n{"type":"result","subtype":"success"}\n');

      await new Promise((r) => setTimeout(r, 10));
      expect(messages).toHaveLength(2);
      expect(messages[0]).toEqual({ type: 'keep_alive' });
      expect(messages[1]).toEqual({ type: 'result', subtype: 'success' });
    });

    it('should skip empty lines', async () => {
      const messages: unknown[] = [];
      transport.onMessage((msg) => messages.push(msg));

      stdout.write('\n\n{"type":"keep_alive"}\n\n');

      await new Promise((r) => setTimeout(r, 10));
      expect(messages).toEqual([{ type: 'keep_alive' }]);
    });

    it('should skip whitespace-only lines', async () => {
      const messages: unknown[] = [];
      transport.onMessage((msg) => messages.push(msg));

      stdout.write('   \n{"type":"keep_alive"}\n  \t  \n');

      await new Promise((r) => setTimeout(r, 10));
      expect(messages).toEqual([{ type: 'keep_alive' }]);
    });

    it('should emit error on invalid JSON', async () => {
      const messages: unknown[] = [];
      const errors: Error[] = [];
      transport.onMessage((msg) => messages.push(msg));
      transport.onError((err) => errors.push(err));

      stdout.write('not valid json\n');

      await new Promise((r) => setTimeout(r, 10));
      expect(messages).toHaveLength(0);
      expect(errors).toHaveLength(1);
      expect(errors[0].message).toContain('not valid json');
    });

    it('should handle unicode line separators U+2028 and U+2029 in values', async () => {
      const messages: unknown[] = [];
      transport.onMessage((msg) => messages.push(msg));

      // JSON with escaped unicode line separators inside string values
      // These should NOT split the line — they are inside the JSON string
      stdout.write('{"type":"assistant","text":"hello\\u2028world"}\n');

      await new Promise((r) => setTimeout(r, 10));
      expect(messages).toHaveLength(1);
      expect((messages[0] as Record<string, unknown>).text).toBe('hello\u2028world');
    });

    it('should handle large JSON objects', async () => {
      const messages: unknown[] = [];
      transport.onMessage((msg) => messages.push(msg));

      const largeContent = 'x'.repeat(100_000);
      stdout.write(`{"type":"assistant","content":"${largeContent}"}\n`);

      await new Promise((r) => setTimeout(r, 50));
      expect(messages).toHaveLength(1);
      expect((messages[0] as Record<string, unknown>).content).toBe(largeContent);
    });

    it('should handle stream close gracefully', async () => {
      const closeFn = vi.fn();
      transport.onClose(closeFn);

      stdout.end();

      await new Promise((r) => setTimeout(r, 10));
      expect(closeFn).toHaveBeenCalled();
    });
  });

  describe('writing (stdin)', () => {
    it('should write JSON followed by newline', () => {
      const chunks: Buffer[] = [];
      stdin.on('data', (chunk) => chunks.push(chunk));

      transport.write({ type: 'keep_alive' });

      const written = Buffer.concat(chunks).toString();
      expect(written).toBe('{"type":"keep_alive"}\n');
    });

    it('should write complex objects correctly', () => {
      const chunks: Buffer[] = [];
      stdin.on('data', (chunk) => chunks.push(chunk));

      transport.write({
        type: 'control_request',
        request_id: 'init-001',
        request: {
          subtype: 'initialize',
          hooks: {},
          promptSuggestions: true,
        },
      });

      const written = Buffer.concat(chunks).toString();
      const parsed = JSON.parse(written.trimEnd());
      expect(parsed.type).toBe('control_request');
      expect(parsed.request_id).toBe('init-001');
      expect(parsed.request.subtype).toBe('initialize');
    });

    it('should handle unicode in written values', () => {
      const chunks: Buffer[] = [];
      stdin.on('data', (chunk) => chunks.push(chunk));

      transport.write({ type: 'user', message: 'hello \u2028 world' });

      const written = Buffer.concat(chunks).toString();
      // JSON.stringify escapes U+2028 in strings
      expect(written).toContain('hello');
      expect(written.endsWith('\n')).toBe(true);
    });
  });

  describe('dispose', () => {
    it('should clean up listeners on dispose', () => {
      transport.dispose();
      // Should not throw when writing after dispose
      expect(() => transport.write({ type: 'keep_alive' })).not.toThrow();
    });
  });
});
