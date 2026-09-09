import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { apiRequest } from './api';

const response = () => new Response(JSON.stringify({ ok: true, data: { accepted: true }, requestId: 'req-test' }), {
  status: 200,
  headers: { 'content-type': 'application/json' },
});

afterEach(() => vi.unstubAllGlobals());

describe('apiRequest', () => {
  it('declares JSON for bodyless POST requests', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => response());
    vi.stubGlobal('fetch', fetchMock);

    await apiRequest('/api/v1/content-items/content-0001/analyze', 'normal', z.object({ accepted: z.boolean() }), {
      method: 'POST',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/content-items/content-0001/analyze',
      expect.objectContaining({
        body: '{}',
        headers: expect.objectContaining({
          accept: 'application/json',
          'content-type': 'application/json',
        }),
      }),
    );
  });
});
