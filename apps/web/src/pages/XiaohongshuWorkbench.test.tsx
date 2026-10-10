import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GrowthLoopStateSchema, PublishedContentSchema, growthPublishText, type PublishedContent } from '@emotion-studio/contracts';
import App from '../App';
import XiaohongshuWorkbench from './XiaohongshuWorkbench';

const at = '2026-10-09T00:00:00.000Z';
function content(number: number, status: PublishedContent['status'] = 'review', isDemo = false) {
  const title = `核对交付标准 ${number}`;
  return PublishedContentSchema.parse({
    id: `00000000-0000-4000-8000-${String(number).padStart(12, '0')}`, revision: 1,
    account: 'emotion', topic: title, title, contentType: 'reflection',
    sourceRetrospectiveId: null, sourceContentId: null, englishDraftId: null,
    createdAt: at, updatedAt: at, publishedAt: status === 'published' ? at : null,
    publishTime: status === 'published' ? at : null, status, provider: 'mock', note: '', english: null, isDemo,
    writing: { title, body: '先核对范围，再开始动手。', corePoint: '确认标准', solution: '列出清单', endingQuestion: '你会先问哪一项？', tags: ['#成长'] },
  });
}
const state = (...contents: PublishedContent[]) => GrowthLoopStateSchema.parse({ retrospectives: [], contents, metrics: [], feedback: [], strategies: [] });
const success = (data: unknown) => new Response(JSON.stringify({ ok: true, data, requestId: 'workbench-test' }), { status: 200 });
const failure = (message = '服务暂时不可用。', code = 'UNAVAILABLE') => new Response(JSON.stringify({ ok: false, error: { code, message }, requestId: 'workbench-test' }), { status: 503 });
const batchResult = (value: PublishedContent, status: 'generated' | 'duplicate' = 'generated') => ({ results: [{ index: 0, status, content: value, error: null }] });
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
function mount() { render(<MemoryRouter><XiaohongshuWorkbench /></MemoryRouter>); }
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('Xiaohongshu workbench', () => {
  it('routes from navigation, preserves the English workflow link and requires a real retrospective for growth', async () => {
    const mock = vi.fn<typeof fetch>(async () => success(state())); vi.stubGlobal('fetch', mock);
    render(<MemoryRouter initialEntries={['/xiaohongshu']}><App /></MemoryRouter>);
    expect(await screen.findByText('暂无符合筛选条件的稿件。')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '小红书内容工作台' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '小红书工作台' })).toHaveAttribute('href', '/xiaohongshu');
    expect(screen.getByRole('link', { name: /English 50句/ })).toHaveAttribute('href', '/english');
    fireEvent.change(screen.getByLabelText(/主题列表/), { target: { value: '确认交付标准' } });
    fireEvent.click(screen.getByRole('button', { name: '批量生成' }));
    expect(screen.getByRole('alert')).toHaveTextContent('选择已分析的真实复盘');
    expect(mock.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(0);
  });

  it('bounds batches, locks repeated submissions, reports partial results and retries only failed topics', async () => {
    const first = deferred<Response>();
    const generated = content(1), duplicated = content(2, 'ready'), retried = content(3);
    const posts: unknown[] = [];
    const mock = vi.fn<typeof fetch>(async (_url, init) => {
      if (init?.method !== 'POST') return success(state());
      posts.push(JSON.parse(String(init.body)));
      if (posts.length === 1) return first.promise;
      if (posts.length === 2) return failure('连接失败，请检查已有记录后重试。');
      return success(batchResult(posts.length === 3 ? duplicated : retried, posts.length === 3 ? 'duplicate' : 'generated'));
    });
    vi.stubGlobal('fetch', mock); mount(); await screen.findByText('暂无符合筛选条件的稿件。');
    fireEvent.change(screen.getByLabelText('内容账号'), { target: { value: 'emotion' } });
    fireEvent.change(screen.getByLabelText(/主题列表/), { target: { value: Array.from({ length: 11 }, (_, n) => `主题 ${n}`).join('\n') } });
    fireEvent.click(screen.getByRole('button', { name: '批量生成' }));
    expect(screen.getByRole('alert')).toHaveTextContent('1–10'); expect(posts).toHaveLength(0);
    fireEvent.change(screen.getByLabelText(/主题列表/), { target: { value: '第一篇\n失败项\n已有主题' } });
    const button = screen.getByRole('button', { name: '批量生成' });
    act(() => { button.click(); button.click(); });
    expect(posts).toHaveLength(1); expect(button).toBeDisabled();
    expect(screen.getByLabelText('内容账号')).toBeDisabled();
    expect(screen.getByRole('progressbar')).toHaveAttribute('max', '3');
    await act(async () => first.resolve(success(batchResult(generated))));
    await screen.findByText(/生成 1 篇，重复 1 条，失败 1 条/);
    expect(posts).toHaveLength(3);
    fireEvent.click(screen.getByRole('button', { name: '重试失败项' }));
    await screen.findByText(/生成 1 篇，重复 0 条，失败 0 条/);
    expect(posts).toHaveLength(4);
    expect(posts[3]).toMatchObject({ items: [{ account: 'emotion', topic: '失败项' }] });
  });

  it('filters real history and allows bulk copy only when every selected draft is approved', async () => {
    const user = userEvent.setup();
    const copy = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
    const pending = content(1), ready = content(2, 'ready'), demo = content(3, 'ready', true);
    const payloads: unknown[] = [];
    const mock = vi.fn<typeof fetch>(async (_url, init) => {
      if (init?.method !== 'POST') return success(state(pending, ready, demo));
      payloads.push(JSON.parse(String(init.body)));
      return success({ filename: 'xiaohongshu-reviewed.txt', mimeType: 'text/plain', content: ready.title + '\n\n' + growthPublishText(ready), total: 1 });
    });
    vi.stubGlobal('fetch', mock); mount();
    await screen.findByLabelText('选择 ' + ready.title);
    expect(screen.queryByLabelText('选择 ' + demo.title)).not.toBeInTheDocument();
    await user.click(screen.getByLabelText('选择 ' + pending.title));
    expect(screen.getByRole('button', { name: '导出 TXT' })).toBeDisabled();
    await user.click(screen.getByLabelText('选择 ' + ready.title));
    expect(screen.getByRole('button', { name: '复制所选发布文案' })).toBeDisabled();
    await user.click(screen.getByLabelText('选择 ' + pending.title));
    await user.click(screen.getByRole('button', { name: '复制所选发布文案' }));
    await waitFor(() => expect(copy).toHaveBeenCalledWith(ready.title + '\n\n' + growthPublishText(ready)));
    expect(payloads).toEqual([{ items: [{ id: ready.id, revision: ready.revision }], format: 'text' }]);
    await user.selectOptions(screen.getByLabelText('审核状态'), 'ready');
    expect(screen.queryByLabelText('选择 ' + pending.title)).not.toBeInTheDocument();
    await user.type(screen.getByLabelText('搜索主题'), '不存在的主题');
    expect(screen.getByText('暂无符合筛选条件的稿件。')).toBeInTheDocument();
  });

  it('retains a manual copy fallback for current drafts when clipboard access fails', async () => {
    const user = userEvent.setup(); vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('denied'));
    const draft = content(1); vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => success(state(draft))));
    mount(); await screen.findByLabelText('选择 ' + draft.title);
    await user.click(screen.getByRole('button', { name: '复制正文与标签' }));
    expect(await screen.findByText('复制不可用，请在下方文案框中手动复制。')).toBeInTheDocument();
    expect(screen.getByLabelText('可手动复制的文案')).toHaveValue(growthPublishText(draft));
  });

  it('downloads reviewed TXT and JSON using the server filename and matching revisions', async () => {
    const ready = content(1, 'ready');
    const payloads: Array<{ format: string }> = [];
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async (_url, init) => {
      if (init?.method !== 'POST') return success(state(ready));
      const body = JSON.parse(String(init.body)); payloads.push(body);
      return success({ filename: `reviewed.${body.format === 'text' ? 'txt' : 'json'}`, mimeType: body.format === 'text' ? 'text/plain' : 'application/json', content: body.format === 'text' ? '核对后的发布文案' : JSON.stringify({ contents: [ready] }), total: 1 });
    }));
    const createObjectURL = vi.fn(() => 'blob:reviewed'); const revokeObjectURL = vi.fn();
    const NativeURL = URL; vi.stubGlobal('URL', class extends NativeURL { static createObjectURL = createObjectURL; static revokeObjectURL = revokeObjectURL; });
    const downloads: string[] = []; vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { downloads.push(this.download); });
    mount(); await screen.findByLabelText('选择 ' + ready.title);
    fireEvent.click(screen.getByLabelText('选择 ' + ready.title));
    vi.useFakeTimers();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '导出 TXT' })); });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '导出 JSON' })); });
    expect(downloads).toEqual(['reviewed.txt', 'reviewed.json']);
    expect(payloads).toEqual([{ items: [{ id: ready.id, revision: 1 }], format: 'text' }, { items: [{ id: ready.id, revision: 1 }], format: 'json' }]);
    expect(createObjectURL).toHaveBeenCalledTimes(2);
    act(() => { vi.runOnlyPendingTimers(); }); expect(revokeObjectURL).toHaveBeenCalledTimes(2);
  });

  it('keeps approval conflicts visible and restores actions after an export error', async () => {
    const ready = content(1, 'ready');
    let reads = 0;
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async (_url, init) => {
      if (init?.method === 'POST') return failure('内容已更新，请刷新后再导出。', 'STALE_REVISION');
      reads++; return success(state(ready));
    }));
    mount(); await screen.findByLabelText('选择 ' + ready.title);
    fireEvent.click(screen.getByLabelText('选择 ' + ready.title));
    fireEvent.click(screen.getByRole('button', { name: '导出 TXT' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('内容已更新');
    expect(screen.getByRole('button', { name: '导出 TXT' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: '刷新历史' }));
    await waitFor(() => expect(reads).toBe(2));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('recovers initial load errors and limits a current-list selection to 50 items', async () => {
    let reads = 0;
    const values = Array.from({ length: 51 }, (_, n) => content(n + 1, 'ready'));
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => ++reads === 1 ? failure('历史读取失败，请重试。') : success(state(...values))));
    mount(); expect(await screen.findByRole('alert')).toHaveTextContent('历史读取失败');
    fireEvent.click(screen.getByRole('button', { name: '重新读取' }));
    await screen.findByLabelText('选择 ' + values[50]!.title);
    fireEvent.click(screen.getByRole('button', { name: '选择当前列表' }));
    expect(screen.getByText('已选 50 篇')).toBeInTheDocument();
    expect(screen.getByLabelText('选择 ' + values[50]!.title)).not.toBeChecked();
    fireEvent.click(screen.getByLabelText('选择 ' + values[50]!.title));
    expect(screen.getByRole('alert')).toHaveTextContent('最多选择50篇');
    expect(screen.getByText('已选 50 篇')).toBeInTheDocument();
  });
});
