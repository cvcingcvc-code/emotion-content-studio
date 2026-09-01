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

export async function apiRequest<T>(
  path: string,
  mode: PreviewMode,
  schema: ContractSchema<T>,
  init?: RequestInit,
): Promise<T> {
  const url = new URL(path, window.location.origin);
  url.searchParams.set('state', mode);
  const response = await fetch(`${url.pathname}${url.search}`, {
    ...init,
    headers: {
      accept: 'application/json',
      ...(init?.body ? { 'content-type': 'application/json' } : {}),
      ...init?.headers,
    },
  });
  const payload: unknown = await response.json().catch(() => null);
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
      .then((data) => setState({ status: 'ready', data, error: null }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setState({ status: 'error', data: null, error: error instanceof Error ? error.message : '加载失败' });
      });
    return () => controller.abort();
  }, [path, mode, refreshKey, schema]);

  return state;
}
