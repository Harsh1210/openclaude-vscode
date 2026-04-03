// test/unit/mcpIdeServer.test.ts
import { describe, it, expect, vi } from 'vitest';

// We test the pure helper functions and server behavior
// The actual VS Code API calls are mocked

describe('McpIdeServer', () => {
  describe('lockfile generation', () => {
    it('should generate a lockfile with required fields', async () => {
      const { generateLockfile } = await import('../../src/mcp/mcpIdeServer');

      const lockfile = generateLockfile(12345, 8080, '/workspace/project');

      expect(lockfile.pid).toBe(12345);
      expect(lockfile.port).toBe(8080);
      expect(lockfile.workspaceFolder).toBe('/workspace/project');
      expect(lockfile.token).toMatch(/^[a-f0-9]{64}$/); // 32 bytes hex
      expect(lockfile.createdAt).toBeDefined();
    });

    it('should generate unique tokens on each call', async () => {
      const { generateLockfile } = await import('../../src/mcp/mcpIdeServer');

      const a = generateLockfile(1, 80, '/a');
      const b = generateLockfile(1, 80, '/a');

      expect(a.token).not.toBe(b.token);
    });
  });

  describe('auth validation', () => {
    it('should reject requests without Authorization header', async () => {
      const { validateAuth } = await import('../../src/mcp/mcpIdeServer');

      expect(validateAuth(undefined, 'valid-token')).toBe(false);
      expect(validateAuth('', 'valid-token')).toBe(false);
    });

    it('should reject requests with wrong token', async () => {
      const { validateAuth } = await import('../../src/mcp/mcpIdeServer');

      expect(validateAuth('Bearer wrong-token', 'valid-token')).toBe(false);
    });

    it('should accept requests with correct Bearer token', async () => {
      const { validateAuth } = await import('../../src/mcp/mcpIdeServer');

      expect(validateAuth('Bearer valid-token', 'valid-token')).toBe(true);
    });
  });

  describe('JSON-RPC routing', () => {
    it('should handle tools/list method', async () => {
      const { routeRequest } = await import('../../src/mcp/mcpIdeServer');

      const result = await routeRequest(
        { jsonrpc: '2.0', id: 1, method: 'tools/list' },
        { getDiagnostics: vi.fn(), executeCode: vi.fn() },
      );

      expect(result.result).toBeDefined();
      const tools = (result.result as { tools: Array<{ name: string }> }).tools;
      expect(tools).toHaveLength(2);
      expect(tools[0].name).toBe('getDiagnostics');
      expect(tools[1].name).toBe('executeCode');
    });

    it('should handle tools/call for getDiagnostics', async () => {
      const mockGetDiagnostics = vi.fn().mockResolvedValue([
        { file: 'test.ts', line: 10, message: 'Type error', severity: 'error' },
      ]);

      const { routeRequest } = await import('../../src/mcp/mcpIdeServer');

      const result = await routeRequest(
        {
          jsonrpc: '2.0',
          id: 2,
          method: 'tools/call',
          params: { name: 'getDiagnostics', arguments: {} },
        },
        { getDiagnostics: mockGetDiagnostics, executeCode: vi.fn() },
      );

      expect(mockGetDiagnostics).toHaveBeenCalled();
      expect(result.error).toBeUndefined();
    });

    it('should return error for unknown tool', async () => {
      const { routeRequest } = await import('../../src/mcp/mcpIdeServer');

      const result = await routeRequest(
        {
          jsonrpc: '2.0',
          id: 3,
          method: 'tools/call',
          params: { name: 'nonexistent', arguments: {} },
        },
        { getDiagnostics: vi.fn(), executeCode: vi.fn() },
      );

      expect(result.error).toBeDefined();
      expect(result.error!.code).toBe(-32601);
    });

    it('should return error for unknown method', async () => {
      const { routeRequest } = await import('../../src/mcp/mcpIdeServer');

      const result = await routeRequest(
        { jsonrpc: '2.0', id: 4, method: 'unknown/method' },
        { getDiagnostics: vi.fn(), executeCode: vi.fn() },
      );

      expect(result.error).toBeDefined();
      expect(result.error!.code).toBe(-32601);
    });
  });
});
