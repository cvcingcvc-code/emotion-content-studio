import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { ApiError, apiRequest, REQUEST_TIMEOUT_MS } from './api';

const response = () => new Response(JSON.stringify({ ok: true, data: { accepted: true }, requestId: 'req-test' }), {
  status: 200,
  headers: { 'content-type': 'application/json' },
});

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

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

  it('fails with a clear timeout error instead of hanging forever when the API stalls', async () => {
    vi.useFakeTimers();
    // 模拟挂起的 API：永远不解决，只响应中断。
    const stalled = vi.fn<typeof fetch>((_input, init) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
    }));
    vi.stubGlobal('fetch', stalled);

    const pending = apiRequest('/api/v1/growth-loop', 'normal', z.object({ accepted: z.boolean() }), { method: 'POST' });
    const assertion = expect(pending).rejects.toMatchObject({ status: 408, message: expect.stringContaining('请先检查历史记录再重试') });
    await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS + 1);
    await assertion;
    expect(stalled).toHaveBeenCalledOnce();
  });

  it('keeps the timeout active while waiting for the response body', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async (_input, init) => {
      const headersReceived = response();
      vi.spyOn(headersReceived, 'json').mockImplementation(() => new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
      }));
      return headersReceived;
    }));

    const pending = apiRequest('/api/v1/growth-loop', 'normal', z.object({ accepted: z.boolean() }));
    const assertion = expect(pending).rejects.toMatchObject({ status: 408, message: expect.stringContaining('超时') });
    await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS + 1);
    await assertion;
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(['success', 'failure'] as const)('removes the caller listener and timeout after %s', async outcome => {
    vi.useFakeTimers();
    const caller = new AbortController();
    const addListener = vi.spyOn(caller.signal, 'addEventListener');
    const removeListener = vi.spyOn(caller.signal, 'removeEventListener');
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => {
      if (outcome === 'failure') throw new TypeError('fetch failed');
      return response();
    }));

    const pending = apiRequest('/api/v1/growth-loop', 'normal', z.object({ accepted: z.boolean() }), { signal: caller.signal });
    if (outcome === 'failure') await expect(pending).rejects.toMatchObject({ status: 0 });
    else await expect(pending).resolves.toEqual({ accepted: true });

    expect(removeListener).toHaveBeenCalledWith('abort', addListener.mock.calls[0]?.[1]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('maps network failures to a friendly connectivity error', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => { throw new TypeError('fetch failed'); }));
    await expect(apiRequest('/api/v1/growth-loop', 'normal', z.object({ accepted: z.boolean() })))
      .rejects.toMatchObject({ status: 0, message: expect.stringContaining('无法连接服务') });
  });

  it('respects a caller-provided abort signal without turning it into a timeout', async () => {
    const stalled = vi.fn<typeof fetch>((_input, init) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
    }));
    vi.stubGlobal('fetch', stalled);
    const caller = new AbortController();

    const pending = apiRequest('/api/v1/growth-loop', 'normal', z.object({ accepted: z.boolean() }), { signal: caller.signal });
    caller.abort(new DOMException('unmounted', 'AbortError'));
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    await expect(pending).rejects.not.toBeInstanceOf(ApiError);
  });

  it('preserves caller cancellation while reading the response body', async () => {
    const caller = new AbortController();
    const reason = new DOMException('unmounted', 'AbortError');
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async (_input, init) => {
      const headersReceived = response();
      vi.spyOn(headersReceived, 'json').mockImplementation(() => new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
        caller.abort(reason);
      }));
      return headersReceived;
    }));

    await expect(apiRequest('/api/v1/growth-loop', 'normal', z.object({ accepted: z.boolean() }), { signal: caller.signal }))
      .rejects.toBe(reason);
  });
});
