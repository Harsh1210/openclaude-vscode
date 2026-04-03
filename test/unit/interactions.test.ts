import { describe, it, expect, vi } from 'vitest';
import { routeControlRequest } from '../../src/process/controlRouter';

describe('routeControlRequest — elicitation', () => {
  it('routes elicitation control_request to webview with parsed fields', () => {
    const postMessage = vi.fn();
    const sendControlResponse = vi.fn();

    const controlRequest = {
      type: 'control_request' as const,
      request_id: 'elicit-001',
      request: {
        subtype: 'elicitation',
        message: 'Which environment should I deploy to?',
        fields: [
          {
            name: 'environment',
            label: 'Environment',
            type: { type: 'select', options: [
              { value: 'staging', label: 'Staging' },
              { value: 'production', label: 'Production' },
            ]},
            required: true,
          },
        ],
      },
    };

    routeControlRequest(controlRequest as unknown as Record<string, unknown>, { postMessage, sendControlResponse });

    expect(postMessage).toHaveBeenCalledWith({
      type: 'show_elicitation',
      requestId: 'elicit-001',
      message: 'Which environment should I deploy to?',
      fields: controlRequest.request.fields,
    });
  });

  it('routes elicitation cancel to webview', () => {
    const postMessage = vi.fn();
    const sendControlResponse = vi.fn();

    const cancelRequest = {
      type: 'control_cancel_request' as const,
      request_id: 'elicit-001',
    };

    routeControlRequest(cancelRequest as unknown as Record<string, unknown>, { postMessage, sendControlResponse });

    expect(postMessage).toHaveBeenCalledWith({
      type: 'dismiss_elicitation',
      requestId: 'elicit-001',
    });
  });
});
