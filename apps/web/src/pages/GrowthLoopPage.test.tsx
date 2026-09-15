import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ContentMetricsSchema, GrowthLoopStateSchema, PublishedContentSchema, RetrospectiveSchema } from '@emotion-studio/contracts';
import GrowthLoopPage from './GrowthLoopPage';

const at = '2026-09-13T00:00:00.000Z';
const retro = RetrospectiveSchema.parse({ id: '00000000-0000-4000-8000-000000000001', revision: 1, date: '2026-09-13', whatHappened: '今天先确认交付范围再动手。', createdAt: at, updatedAt: at, analysis: null, analysisProvider: null });
const published = PublishedContentSchema.parse({ id: '00000000-0000-4000-8000-000000000010', revision: 1, account: 'growth', topic: '先确认范围', title: '先确认范围', contentType: 'solution', sourceRetrospectiveId: null, sourceContentId: null, englishDraftId: null, createdAt: at, updatedAt: at, publishedAt: at, publishTime: at, status: 'published', provider: 'mock', note: '', english: null, isDemo: false, writing: { title: '先确认范围', body: '开始前确认三项标准。', corePoint: '确认后行动', solution: '列出标准', endingQuestion: '你会先问什么？', tags: ['#成长'] } });
const emptyState = () => GrowthLoopStateSchema.parse({ retrospectives: [], contents: [], metrics: [], feedback: [], strategies: [] });
const success = (data: unknown) => new Response(JSON.stringify({ ok: true, data, requestId: 'hardening-test' }), { status: 200 });
const failure = () => new Response(JSON.stringify({ ok: false, error: { code: 'UNAVAILABLE', message: '保存暂时失败，请重试。' }, requestId: 'hardening-test' }), { status: 503 });
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
afterEach(() => vi.unstubAllGlobals());

const analyzedRetro = RetrospectiveSchema.parse({ ...retro, analysisProvider: 'mock', analysis: {
  summary: '先确认范围', coreProblem: '没有先确认范围', decisionPattern: '直接动手', betterApproach: '先问清楚', lesson: '确认后行动', nextAction: '列出标准',
  contentPotential: 8, contentReason: '具体的工作经历', recommendedAccount: 'growth', recommendedContentType: 'solution', contentAngle: '确认交付标准',
  recommendedTitleIdeas: ['先确认范围', '把标准写清楚', '行动前问清楚'], facts: ['今天先确认交付范围再动手。'], interpretations: ['明确标准可能减少返工'],
} });
const directDraft = PublishedContentSchema.parse({ ...published, status: 'draft', revision: 0, writing: null, publishedAt: null, publishTime: null, sourceRetrospectiveId: retro.id });
const directGenerated = PublishedContentSchema.parse({ ...directDraft, status: 'review', revision: 1, writing: published.writing });

describe('direct generation from an analyzed retrospective', () => {
  it('creates and generates once, then opens review without an intermediate creation page', async () => {
    const state = emptyState(); state.retrospectives = [analyzedRetro];
    const generating = deferred<Response>();
    const mock = vi.fn<typeof fetch>(async (url, init) => {
      if (init?.method === 'POST' && String(url).endsWith('/contents')) { state.contents = [directDraft]; return success(directDraft); }
      if (init?.method === 'POST') return generating.promise;
      return success(state);
    });
    vi.stubGlobal('fetch', mock);
    render(<MemoryRouter initialEntries={['/retrospectives/' + retro.id]}><GrowthLoopPage /></MemoryRouter>);
    const button = await screen.findByRole('button', { name: '直接生成内容' });
    act(() => { button.click(); button.click(); });
    expect(button).toBeDisabled();
    await waitFor(() => expect(mock.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(2));
    const creates = mock.mock.calls.filter(([url, init]) => String(url).endsWith('/contents') && init?.method === 'POST');
    expect(creates).toHaveLength(1);
    expect(JSON.parse(String(creates[0]![1]!.body))).toEqual({ account: 'growth', topic: '先确认范围', contentType: 'solution', sourceRetrospectiveId: retro.id, sourceContentId: null });
    expect(screen.queryByRole('heading', { name: '内容创建成功！' })).not.toBeInTheDocument();
    state.contents = [directGenerated];
    await act(async () => { generating.resolve(success(directGenerated)); });
    expect(await screen.findByLabelText('内容正文')).toHaveValue(published.writing!.body);
    expect(screen.getByRole('button', { name: '通过审核 →' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '标记为已发布' })).toBeDisabled();
  });

  it.each([false, true])('reuses the saved draft after a failed response (server already generated=%s)', async alreadyGenerated => {
    const state = emptyState(); state.retrospectives = [analyzedRetro];
    let attempts = 0;
    const mock = vi.fn<typeof fetch>(async (url, init) => {
      if (init?.method === 'POST' && String(url).endsWith('/contents')) { state.contents = [directDraft]; return success(directDraft); }
      if (init?.method === 'POST') {
        attempts++;
        if (attempts === 1) { if (alreadyGenerated) state.contents = [directGenerated]; return failure(); }
        state.contents = [directGenerated]; return success(directGenerated);
      }
      return success(state);
    });
    vi.stubGlobal('fetch', mock);
    render(<MemoryRouter initialEntries={['/retrospectives/' + retro.id]}><GrowthLoopPage /></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: '直接生成内容' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '查看草稿' })).toHaveAttribute('href', '/growth-content/' + directDraft.id);
    expect(screen.getByRole('button', { name: '继续生成内容' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: '继续生成内容' }));
    expect(await screen.findByLabelText('内容正文')).toHaveValue(published.writing!.body);
    expect(mock.mock.calls.filter(([url, init]) => String(url).endsWith('/contents') && init?.method === 'POST')).toHaveLength(1);
    expect(attempts).toBe(alreadyGenerated ? 1 : 2);
  });

  it('restores the direct action if draft creation fails', async () => {
    const state = emptyState(); state.retrospectives = [analyzedRetro];
    const mock = vi.fn<typeof fetch>(async (_url, init) => init?.method === 'POST' ? failure() : success(state));
    vi.stubGlobal('fetch', mock);
    render(<MemoryRouter initialEntries={['/retrospectives/' + retro.id]}><GrowthLoopPage /></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: '直接生成内容' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '直接生成内容' })).toBeEnabled();
    expect(screen.queryByRole('link', { name: '查看草稿' })).not.toBeInTheDocument();
    expect(mock.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1);
  });

  it.each([null, { ...analyzedRetro.analysis!, contentPotential: 5 }])('does not bypass analysis or the content-potential threshold', async analysis => {
    const state = emptyState(); state.retrospectives = [{ ...analyzedRetro, analysis }];
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => success(state)));
    render(<MemoryRouter initialEntries={['/retrospectives/' + retro.id]}><GrowthLoopPage /></MemoryRouter>);
    await screen.findByRole('button', { name: '保存复盘' });
    expect(screen.queryByRole('button', { name: '直接生成内容' })).not.toBeInTheDocument();
  });

  it('requires saving changed retrospective text before direct generation', async () => {
    const state = emptyState(); state.retrospectives = [analyzedRetro];
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => success(state)));
    render(<MemoryRouter initialEntries={['/retrospectives/' + retro.id]}><GrowthLoopPage /></MemoryRouter>);
    await screen.findByRole('button', { name: '直接生成内容' });
    fireEvent.change(document.querySelector('textarea.retrospective-main-input')!, { target: { value: '这是一段尚未保存的新经历。' } });
    expect(screen.queryByRole('button', { name: '直接生成内容' })).not.toBeInTheDocument();
  });
});

describe('Growth Loop loading, empty and error states', () => {
  it('explains each empty history without showing invented records', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => success(emptyState())));
    render(<MemoryRouter initialEntries={['/history']}><GrowthLoopPage /></MemoryRouter>);
    expect(screen.getByRole('status')).toHaveTextContent('读取工作台');
    expect(await screen.findByText(/暂无复盘记录/)).toBeInTheDocument();
    expect(screen.getByText('暂无内容。')).toBeInTheDocument();
    expect(screen.getByText(/暂无流量记录/)).toBeInTheDocument();
    expect(screen.getByText(/暂无反馈/)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('distinguishes a loading dashboard from a failed dashboard request', async () => {
    const loading = deferred<Response>();
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async url => String(url).endsWith('/dashboard') ? loading.promise : success(emptyState())));
    render(<MemoryRouter initialEntries={['/']}><GrowthLoopPage /></MemoryRouter>);
    expect(await screen.findByText('读取今日重点…')).toHaveAttribute('role', 'status');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    await act(async () => { loading.resolve(failure()); });
    expect(screen.getByRole('alert')).toHaveTextContent('保存暂时失败');
    expect(screen.queryByText('读取今日重点…')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'NEXT 3 POSTS' })).not.toBeInTheDocument();
  });
});

describe('Growth Loop submission hardening', () => {
  it.each(['success', 'failure'] as const)('disables retrospective saving, blocks repeated clicks and recovers after %s', async outcome => {
    const state = emptyState();
    state.retrospectives = [retro];
    const saving = deferred<Response>();
    const mock = vi.fn<typeof fetch>(async (_url, init) => init?.method === 'PUT' ? saving.promise : success(state));
    vi.stubGlobal('fetch', mock);
    render(<MemoryRouter initialEntries={['/retrospectives/' + retro.id]}><GrowthLoopPage /></MemoryRouter>);
    const button = await screen.findByRole('button', { name: '保存复盘' });
    fireEvent.change(document.querySelector('textarea.retrospective-main-input')!, { target: { value: '更新后的真实经历。' } });
    act(() => { button.click(); button.click(); });
    expect(button).toBeDisabled();
    expect(screen.getByText('处理中，请勿重复提交…')).toHaveAttribute('role', 'status');
    await waitFor(() => expect(mock.mock.calls.filter(([, init]) => init?.method === 'PUT')).toHaveLength(1));
    if (outcome === 'success') state.retrospectives = [{ ...retro, whatHappened: '更新后的真实经历。', revision: 2 }];
    await act(async () => { saving.resolve(outcome === 'success' ? success(state.retrospectives[0]) : failure()); });
    await waitFor(() => expect(screen.getByRole('button', { name: '保存复盘' })).toBeEnabled());
    expect(screen.queryByText('处理中，请勿重复提交…')).not.toBeInTheDocument();
    if (outcome === 'failure') {
      expect(screen.getByRole('alert')).toHaveTextContent('保存暂时失败');
      expect(document.querySelector('textarea')).toHaveValue('更新后的真实经历。');
    } else {
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: '分析复盘' })).toBeEnabled();
    }
  });

  it.each([false, true])('blocks repeated metric submits until refresh, and permits a later snapshot (isDemo=%s)', async isDemo => {
    const state = emptyState();
    state.contents = [{ ...published, isDemo }];
    const saving = deferred<Response>(), refreshing = deferred<Response>();
    let reads = 0;
    const mock = vi.fn<typeof fetch>(async (_url, init) => init?.method === 'POST' ? saving.promise : ++reads === 1 ? success(state) : refreshing.promise);
    vi.stubGlobal('fetch', mock);
    render(<MemoryRouter initialEntries={['/growth-content/' + published.id]}><GrowthLoopPage /></MemoryRouter>);
    const button = await screen.findByRole('button', { name: '保存流量' });
    fireEvent.change(screen.getByLabelText('views'), { target: { value: '100' } });
    const form = button.closest('form')!;
    act(() => { fireEvent.submit(form); fireEvent.submit(form); });
    expect(button).toBeDisabled();
    await waitFor(() => expect(mock.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1));
    const metric = ContentMetricsSchema.parse({ id: '00000000-0000-4000-8000-000000000020', contentId: published.id, capturedAt: at, views: 100, likes: 0, favorites: 0, comments: 0, followersGained: 0, note: '' });
    state.metrics = [metric];
    await act(async () => { saving.resolve(success(metric)); });
    expect(screen.queryByRole('button', { name: '保存流量' })).not.toBeInTheDocument();
    expect(screen.getByText('读取工作台…')).toBeInTheDocument();
    await act(async () => { refreshing.resolve(success(state)); });
    expect(await screen.findByRole('button', { name: '保存流量' })).toBeEnabled();
    expect(screen.getByLabelText('views')).toHaveValue(100);
    expect(screen.getByRole('button', { name: 'Analyze Performance' })).toBeEnabled();
    expect(mock.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1);
  });

  it('keeps metric input and releases saving after a failed request', async () => {
    const state = emptyState(); state.contents = [published];
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async (_url, init) => init?.method === 'POST' ? failure() : success(state)));
    render(<MemoryRouter initialEntries={['/growth-content/' + published.id]}><GrowthLoopPage /></MemoryRouter>);
    await screen.findByRole('button', { name: '保存流量' });
    fireEvent.change(screen.getByLabelText('views'), { target: { value: '123' } });
    fireEvent.click(screen.getByRole('button', { name: '保存流量' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('保存暂时失败');
    expect(screen.getByRole('button', { name: '保存流量' })).toBeEnabled();
    expect(screen.getByLabelText('views')).toHaveValue(123);
    expect(screen.getByRole('button', { name: 'Analyze Performance' })).toBeDisabled();
  });
});
