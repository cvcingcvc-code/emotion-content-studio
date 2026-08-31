import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  Dashboard,
  Draft,
  ExportRecord,
  Inspiration,
  Material,
  ReviewInbox,
  VideoProject,
} from '@emotion-studio/contracts';
import App from './App';

const material: Material = {
  id: 'material-01',
  text: '我给今天留了一小块空白，不解释，也不急着填满。',
  sourceType: 'original_note',
  sourceUrl: null,
  licenseStatus: 'original',
  reviewStatus: 'pending',
  filterFlags: [],
  riskLevel: 'low',
  theme: '自我安放',
  scenario: '夜晚独处',
  importedAt: '2026-08-24T08:00:00.000Z',
};

const inspiration: Inspiration = {
  id: 'inspiration-01',
  materialId: material.id,
  title: '给生活留一点空白',
  text: '给今天留一块空白，不解释，也不急着填满。',
  theme: '自我安放',
  scenario: '夜晚独处',
  platforms: ['wechat_channels'],
  favorite: false,
  score: 91,
  licenseStatus: 'original',
  updatedAt: '2026-08-24T08:00:00.000Z',
};

const draft: Draft = {
  id: 'draft-01',
  inspirationId: inspiration.id,
  version: 1,
  text: '今晚，我没有急着替沉默寻找理由，也允许心情先安静一会儿。',
  tone: 'gentle',
  targetPlatform: 'wechat_channels',
  similarityRisk: 12,
  safetyStatus: 'safe',
  status: 'draft',
  generatedBy: 'ai',
  createdAt: '2026-08-24T08:10:00.000Z',
  confirmedAt: null,
};

const project: VideoProject = {
  id: 'video-01',
  draftId: draft.id,
  title: inspiration.title,
  templateKey: 'blank_subtitle',
  templateName: '留白字幕',
  status: 'preview_ready',
  durationSeconds: 22,
  licenseStatus: 'original',
  config: { alignment: 'center', palette: 'warm_white', pace: 'slow' },
  updatedAt: '2026-08-24T08:20:00.000Z',
};

const exportRecord: ExportRecord = {
  id: 'export-01',
  videoProjectId: project.id,
  title: project.title,
  templateKey: project.templateKey,
  templateName: project.templateName,
  status: 'succeeded',
  progress: 100,
  createdAt: '2026-08-24T08:30:00.000Z',
  completedAt: '2026-08-24T08:31:00.000Z',
  errorMessage: null,
  downloadable: true,
};

const reviewInbox: ReviewInbox = {
  items: [material],
  counts: { pending: 1, highRisk: 0, duplicates: 0, privacy: 0 },
};

const dashboard: Dashboard = {
  metrics: { pendingReview: 1, inspirations: 1, drafts: 1, exports: 1, targetExports: 30 },
  recentInspirations: [inspiration],
  alerts: [
    { id: 'alert-01', tone: 'warning', title: '先确认文案', detail: 'AI 草稿必须经过人工确认。', href: '/editor/draft-01' },
  ],
};

function installMockApi() {
  const responseByPath: Record<string, unknown> = {
    '/api/v1/dashboard': dashboard,
    '/api/v1/review-inbox': reviewInbox,
    '/api/v1/inspirations': [inspiration],
    '/api/v1/drafts': [draft],
    '/api/v1/video-projects': [project],
    '/api/v1/exports': [exportRecord],
  };

  const mock = vi.fn(async (input: RequestInfo | URL) => {
    const rawUrl = input instanceof Request ? input.url : input.toString();
    const path = new URL(rawUrl, 'http://localhost').pathname;
    let data = responseByPath[path];
    if (path.endsWith('/confirm')) data = { ...draft, status: 'confirmed', confirmedAt: '2026-08-24T08:40:00.000Z' } satisfies Draft;
    if (path.endsWith('/video-project')) data = { ...project, id: 'video-04' } satisfies VideoProject;
    if (path.endsWith('/simulated-export')) data = { ...exportRecord, status: 'processing', progress: 5, downloadable: false } satisfies ExportRecord;

    if (data === undefined) {
      return new Response(JSON.stringify({ ok: false, error: { code: 'NOT_FOUND', message: '未找到接口' }, requestId: 'request-not-found' }), { status: 404, headers: { 'content-type': 'application/json' } });
    }
    return new Response(JSON.stringify({ ok: true, data, requestId: 'request-web-test' }), { status: 200, headers: { 'content-type': 'application/json' } });
  });
  vi.stubGlobal('fetch', mock);
  return mock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('editorial workspace prototype', () => {
  it('loads the dashboard through an HTTP-shaped response and exposes all seven destinations', async () => {
    installMockApi();
    render(<MemoryRouter initialEntries={['/']}><App /></MemoryRouter>);

    expect(await screen.findByText('今天，从一条真正有感觉的文案开始。')).toBeInTheDocument();
    for (const label of ['仪表盘', 'CSV 导入', '审核收件箱', '文案灵感库', '文案编辑器', '视频工作室', '导出记录']) {
      expect(screen.getByRole('link', { name: new RegExp(label) })).toBeInTheDocument();
    }
  });

  it.each([
    ['/', '今天，从一条真正有感觉的文案开始。'],
    ['/import', '先把来源说清楚，再开始整理内容。'],
    ['/review', '先读懂，再决定是否留下。'],
    ['/library', '留下能继续生长的句子。'],
    ['/editor/draft-01', '把情绪写成自己的句子'],
    ['/studio/video-01', '素材与模板'],
    ['/exports', '每一次导出，都能找到它的来路。'],
  ])('renders the primary %s route', async (route, expectedText) => {
    installMockApi();
    render(<MemoryRouter initialEntries={[route]}><App /></MemoryRouter>);
    expect(await screen.findByText(expectedText)).toBeInTheDocument();
  });

  it('allows reviewers to inspect the empty state and recover from the error state', async () => {
    installMockApi();
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={['/']}><App /></MemoryRouter>);
    await screen.findByText('今天，从一条真正有感觉的文案开始。');

    const statePicker = screen.getByRole('combobox', { name: '切换页面演示状态' });
    await user.selectOptions(statePicker, 'empty');
    expect(await screen.findByText('编辑台还是空的')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /导入第一份 CSV/ })).toHaveAttribute('href', '/import');

    await user.selectOptions(statePicker, 'error');
    expect(await screen.findByText('这部分暂时没有加载出来')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /重新加载/ }));
    expect(await screen.findByText('今天，从一条真正有感觉的文案开始。')).toBeInTheDocument();
  });

  it('keeps the simulated import gated until a safe mock file is selected', async () => {
    installMockApi();
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={['/import']}><App /></MemoryRouter>);

    expect(screen.getByRole('button', { name: /^继续/ })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: /安全的模拟文件/ }));
    expect(await screen.findByRole('heading', { name: '来源与授权' })).toBeInTheDocument();
  });

  it('supports favorite toggling and fixed-template selection', async () => {
    installMockApi();
    const user = userEvent.setup();
    const library = render(<MemoryRouter initialEntries={['/library']}><App /></MemoryRouter>);
    const favorite = await screen.findByRole('button', { name: '收藏' });
    await user.click(favorite);
    expect(screen.getByRole('button', { name: '取消收藏' })).toBeInTheDocument();
    library.unmount();

    render(<MemoryRouter initialEntries={['/studio/video-01']}><App /></MemoryRouter>);
    const cinematic = await screen.findByRole('button', { name: /电影独白/ });
    await user.click(cinematic);
    expect(cinematic).toHaveClass('is-selected');
  });

  it('confirms an edited draft through the mock API before opening its video project', async () => {
    const mockFetch = installMockApi();
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={['/editor/draft-01']}><App /></MemoryRouter>);
    await screen.findByText('把情绪写成自己的句子');

    await user.click(screen.getByRole('button', { name: '确认文案' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '确认并进入视频制作' }));
    expect(await screen.findByText('素材与模板')).toBeInTheDocument();

    const requestedPaths = mockFetch.mock.calls.map(([input]) => new URL(String(input), 'http://localhost').pathname);
    expect(requestedPaths).toContain('/api/v1/drafts/draft-01/confirm');
    expect(requestedPaths).toContain('/api/v1/drafts/draft-01/video-project');
  });
});
