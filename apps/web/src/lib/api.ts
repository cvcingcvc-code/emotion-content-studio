import { useEffect, useState } from 'react';
import {
  ApiErrorSchema,
  createSuccessResponseSchema,
  type ContractSchema,
} from '@emotion-studio/contracts';

export type PreviewMode = 'normal' | 'empty' | 'loading' | 'error' | 'long' | 'blocked';

type RemoteState<T> =
  | { status: 'loading'; data: null; error: null }
  | { status: 'error'; data: null; error: string }
  | { status: 'ready'; data: T; error: null };

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly requestId?: string,
  ) {
    super(message);
  }
}

/**
 * 单次请求超时。之前 fetch 没有超时：API 挂起时调用方（如 GrowthLoopPage 的 busy）
 * 会一直停在「处理中」，用户只能刷新页面。超时后按失败处理，busy 正常释放。
 */
export const REQUEST_TIMEOUT_MS = 30_000;

export async function apiRequest<T>(
  path: string,
  mode: PreviewMode,
  schema: ContractSchema<T>,
  init?: RequestInit,
): Promise<T> {
  const url = new URL(path, window.location.origin);
  if (import.meta.env.DEV && mode !== 'normal') url.searchParams.set('state', mode);
  const method = (init?.method ?? 'GET').toUpperCase();
  const jsonBodyMethod = ['POST', 'PUT', 'PATCH'].includes(method);
  const hasBody = init?.body !== undefined && init.body !== null;
  // 本地超时控制器；调用方（useRemote 卸载中断）传入的 signal 仍然优先生效。
  const controller = new AbortController();
  const upstream = init?.signal ?? null;
  const forwardAbort = () => controller.abort(upstream?.reason);
  const timer = setTimeout(() => controller.abort(new DOMException('timeout', 'TimeoutError')), REQUEST_TIMEOUT_MS);
  if (upstream) {
    if (upstream.aborted) forwardAbort();
    else upstream.addEventListener('abort', forwardAbort, { once: true });
  }
  try {
    const response = await fetch(`${url.pathname}${url.search}`, {
      ...init,
      signal: controller.signal,
      ...(jsonBodyMethod && !hasBody ? { body: '{}' } : {}),
      headers: {
        accept: 'application/json',
        ...(hasBody || jsonBodyMethod
          ? { 'content-type': 'application/json' }
          : {}),
        ...init?.headers,
      },
    });
    const payload: unknown = await response.json().catch((error: unknown) => {
      if (controller.signal.aborted) throw error;
      return null;
    });
    if (!response.ok) {
      const failed = ApiErrorSchema.safeParse(payload);
      throw new ApiError(
        failed.success ? failed.data.error.message : '暂时无法读取内容，请稍后重试。',
        response.status,
        failed.success ? failed.data.requestId : undefined,
      );
    }
    const parsed = createSuccessResponseSchema(schema).safeParse(payload);
    if (!parsed.success) {
      throw new ApiError('服务返回的数据格式无效，请稍后重试。', 502);
    }
    return parsed.data.data;
  } catch (error) {
    // 调用方主动中断（页面卸载）不属于错误，原样抛出由调用方忽略。
    if (upstream?.aborted) throw error;
    if (controller.signal.aborted) throw new ApiError(
      ['GET', 'HEAD'].includes(method)
        ? '请求超时，服务暂时没有回应。请稍后重试。'
        : '请求超时，服务暂时没有回应。操作可能已保存，请先检查历史记录再重试。',
      408,
    );
    if (error instanceof TypeError) throw new ApiError('无法连接服务，请确认 API 已启动后重试。', 0);
    throw error;
  } finally {
    clearTimeout(timer);
    upstream?.removeEventListener('abort', forwardAbort);
  }
}

export function useRemote<T>(
  path: string,
  mode: PreviewMode,
  schema: ContractSchema<T>,
  refreshKey = 0,
) {
  const [state, setState] = useState<RemoteState<T>>({ status: 'loading', data: null, error: null });

  useEffect(() => {
    if (mode === 'loading') {
      setState({ status: 'loading', data: null, error: null });
      return;
    }
    if (mode === 'error') {
      setState({ status: 'error', data: null, error: '内容服务暂时没有回应。你的原始内容仍然安全，可以稍后重试。' });
      return;
    }
    const controller = new AbortController();
    setState({ status: 'loading', data: null, error: null });
    void apiRequest(path, mode, schema, { signal: controller.signal })
      .then((data) => { if (!controller.signal.aborted) setState({ status: 'ready', data, error: null }); })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setState({ status: 'error', data: null, error: error instanceof Error ? error.message : '加载失败' });
      });
    return () => controller.abort();
  }, [path, mode, refreshKey, schema]);

  return state;
}
