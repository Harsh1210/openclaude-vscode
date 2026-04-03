// test/unit/controlRouter.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ControlRouter } from '../../src/process/controlRouter';
import type { SDKControlRequest, SDKControlCancelRequest } from '../../src/types/messages';

describe('ControlRouter', () => {
  let writeFn: ReturnType<typeof vi.fn>;
  let router: ControlRouter;

  beforeEach(() => {
    writeFn = vi.fn();
    router = new ControlRouter(writeFn);
  });

  it('should route can_use_tool requests to the registered handler', async () => {
    const handler = vi.fn().mockResolvedValue({ behavior: 'allow' });
    router.registerHandler('can_use_tool', handler);

    const request: SDKControlRequest = {
      type: 'control_request',
      request_id: 'req-001',
      request: {
        subtype: 'can_use_tool',
        tool_name: 'Bash',
        input: { command: 'ls' },
        tool_use_id: 'tu-001',
      },
    };

    await router.handleControlRequest(request);

    expect(handler).toHaveBeenCalledWith(
      request.request,
      expect.any(AbortSignal),
      'req-001',
    );

    // Should have written a success response
    expect(writeFn).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'control_response',
        response: expect.objectContaining({
          subtype: 'success',
          request_id: 'req-001',
          response: { behavior: 'allow' },
        }),
      }),
    );
  });

  it('should route elicitation requests to the registered handler', async () => {
    const handler = vi.fn().mockResolvedValue({ action: 'accept', content: { answer: 'yes' } });
    router.registerHandler('elicitation', handler);

    const request: SDKControlRequest = {
      type: 'control_request',
      request_id: 'req-002',
      request: {
        subtype: 'elicitation',
        mcp_server_name: 'my-mcp',
        message: 'Do you want to proceed?',
      },
    };

    await router.handleControlRequest(request);

    expect(handler).toHaveBeenCalled();
    expect(writeFn).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'control_response',
        response: expect.objectContaining({
          subtype: 'success',
          request_id: 'req-002',
        }),
      }),
    );
  });

  it('should send error response when no handler is registered', async () => {
    const request: SDKControlRequest = {
      type: 'control_request',
      request_id: 'req-003',
      request: {
        subtype: 'can_use_tool',
        tool_name: 'Bash',
        input: { command: 'rm -rf /' },
        tool_use_id: 'tu-002',
      },
    };

    await router.handleControlRequest(request);

    expect(writeFn).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'control_response',
        response: expect.objectContaining({
          subtype: 'error',
          request_id: 'req-003',
          error: expect.stringContaining('No handler registered'),
        }),
      }),
    );
  });

  it('should send error response when handler throws', async () => {
    const handler = vi.fn().mockRejectedValue(new Error('Permission denied by user'));
    router.registerHandler('can_use_tool', handler);

    const request: SDKControlRequest = {
      type: 'control_request',
      request_id: 'req-004',
      request: {
        subtype: 'can_use_tool',
        tool_name: 'Bash',
        input: { command: 'ls' },
        tool_use_id: 'tu-003',
      },
    };

    await router.handleControlRequest(request);

    expect(writeFn).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'control_response',
        response: expect.objectContaining({
          subtype: 'error',
          request_id: 'req-004',
          error: 'Permission denied by user',
        }),
      }),
    );
  });

  it('should abort handler when cancel request arrives', async () => {
    let capturedSignal: AbortSignal | undefined;
    const handler = vi.fn().mockImplementation(async (_req, signal) => {
      capturedSignal = signal;
      // Simulate a long-running handler
      await new Promise((resolve) => setTimeout(resolve, 5000));
      return { behavior: 'allow' };
    });
    router.registerHandler('can_use_tool', handler);

    const request: SDKControlRequest = {
      type: 'control_request',
      request_id: 'req-005',
      request: {
        subtype: 'can_use_tool',
        tool_name: 'Bash',
        input: { command: 'ls' },
        tool_use_id: 'tu-004',
      },
    };

    // Start handling (don't await — it's long-running)
    const handlePromise = router.handleControlRequest(request);

    // Give it a tick to start
    await new Promise((r) => setTimeout(r, 10));

    // Cancel it
    const cancel: SDKControlCancelRequest = {
      type: 'control_cancel_request',
      request_id: 'req-005',
    };
    router.handleControlCancelRequest(cancel);

    expect(capturedSignal?.aborted).toBe(true);

    // Wait for the handle promise to settle
    await handlePromise;
  });

  it('should handle multiple concurrent requests', async () => {
    const handler = vi.fn().mockImplementation(async (req) => {
      return { handled: req.subtype };
    });
    router.registerHandler('can_use_tool', handler);

    const req1: SDKControlRequest = {
      type: 'control_request',
      request_id: 'req-a',
      request: {
        subtype: 'can_use_tool',
        tool_name: 'Read',
        input: { file: 'a.ts' },
        tool_use_id: 'tu-a',
      },
    };
    const req2: SDKControlRequest = {
      type: 'control_request',
      request_id: 'req-b',
      request: {
        subtype: 'can_use_tool',
        tool_name: 'Write',
        input: { file: 'b.ts' },
        tool_use_id: 'tu-b',
      },
    };

    await Promise.all([
      router.handleControlRequest(req1),
      router.handleControlRequest(req2),
    ]);

    expect(handler).toHaveBeenCalledTimes(2);
    expect(writeFn).toHaveBeenCalledTimes(2);

    // Verify each got its own response with correct request_id
    const calls = writeFn.mock.calls.map(
      (c: unknown[]) => (c[0] as { response: { request_id: string } }).response.request_id,
    );
    expect(calls).toContain('req-a');
    expect(calls).toContain('req-b');
  });

  it('should allow unregistering handlers', async () => {
    const handler = vi.fn().mockResolvedValue({ behavior: 'allow' });
    router.registerHandler('can_use_tool', handler);
    router.unregisterHandler('can_use_tool');

    const request: SDKControlRequest = {
      type: 'control_request',
      request_id: 'req-006',
      request: {
        subtype: 'can_use_tool',
        tool_name: 'Bash',
        input: { command: 'ls' },
        tool_use_id: 'tu-005',
      },
    };

    await router.handleControlRequest(request);

    expect(handler).not.toHaveBeenCalled();
    // Should get error response (no handler)
    expect(writeFn).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'control_response',
        response: expect.objectContaining({
          subtype: 'error',
        }),
      }),
    );
  });
});
