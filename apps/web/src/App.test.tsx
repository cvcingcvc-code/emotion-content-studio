import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ContentDashboard, ContentItem, CsvImportSummary, GeneratedContent } from '@emotion-studio/contracts';
import App from './App';

const contentItems: ContentItem[] = [
  {
    id: 'content-0001', originalContent: '夜深以后，我开始认真听见自己的声音。', content: '夜深以后，我开始认真听见自己的声音。',
    author: null, likes: 1680, source: '内置演示数据', sourceUrl: null, licenseStatus: 'original', emotion: '孤独', emotionScore: 91,
    resonanceScore: 94, category: '孤独', tags: ['孤独', '夜晚心绪'], isFavorite: false, importedAt: '2026-09-01T01:00:00.000Z',
  },
  {
    id: 'content-0002', originalContent: '慢慢来，也是在认真向前。', content: '慢慢来，也是在认真向前。',
    author: '演示素材', likes: 920, source: '内置演示数据', sourceUrl: null, licenseStatus: 'original', emotion: '治愈', emotionScore: 87,
    resonanceScore: 84, category: '成长', tags: ['成长', '自我疗愈'], isFavorite: true, importedAt: '2026-09-01T01:01:00.000Z',
  },
  {
    id: 'content-0003', originalContent: '那次没说出口的喜欢，后来成了温柔的遗憾。', content: '那次没说出口的喜欢，后来成了温柔的遗憾。',
    author: null, likes: 430, source: 'CSV 导入', sourceUrl: 'https://example.com/source', licenseStatus: 'licensed', emotion: '遗憾', emotionScore: 82,
    resonanceScore: 76, category: '爱情', tags: ['爱情', '遗憾'], isFavorite: false, importedAt: '2026-09-01T01:02:00.000Z',
  },
  {
    id: 'content-0004', originalContent: '这条素材只用于研究授权状态。', content: '这条素材只用于研究授权状态。',
    author: null, likes: 12, source: '研究素材', sourceUrl: null, licenseStatus: 'reference_only', emotion: '其他', emotionScore: 60,
    resonanceScore: 60, category: '其他', tags: ['研究'], isFavorite: false, importedAt: '2026-09-01T01:03:00.000Z',
  },
];

const generatedBody = [
  '我们常常以为，只有把情绪说明白，生活才会重新向前。可真正的变化，也许只是愿意在忙乱里停一下，承认此刻并不轻松，同时不急着给自己下结论。',
  '有些关系教会我们靠近，有些经历提醒我们保留边界。无论答案来得快或慢，都不必用别人的节奏衡量自己的恢复。把注意力放回今天，好好吃饭，认真睡觉，也允许一段安静存在。',
  '成长不是从此不再敏感，而是敏感之后仍知道怎样照顾自己。愿你把遗憾留在合适的位置，把期待交给仍可抵达的明天。那些暂时无法解释的感受，会在一次次真实选择里变得清晰。',
].join('\n\n');

const generatedFixture: GeneratedContent = {
  id: 'generated-01', title: '孤独里，那些值得被看见的时刻', body: generatedBody,
  hashtags: ['#情绪', '#成长', '#生活感悟'], status: 'draft', generatorLabel: 'DEMO AI 生成结果',
  contentIds: ['content-0001'], createdAt: '2026-09-01T02:00:00.000Z',
};

function success(data: unknown, status = 200) {
  return new Response(JSON.stringify({ ok: true, data, requestId: 'request-web-test' }), { status, headers: { 'content-type': 'application/json' } });
}

function failure(message: string, status = 400) {
  return new Response(JSON.stringify({ ok: false, error: { code: 'VALIDATION_ERROR', message }, requestId: 'request-web-error' }), { status, headers: { 'content-type': 'application/json' } });
}

function installDemoApi() {
  const items = structuredClone(contentItems);
  const generated = new Map([[generatedFixture.id, generatedFixture]]);
  let demoLoaded = false;
  const mock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const rawUrl = input instanceof Request ? input.url : input.toString();
    const url = new URL(rawUrl, 'http://localhost');
    const method = init?.method ?? (input instanceof Request ? input.method : 'GET');

    if (method === 'GET' && url.pathname === '/api/v1/content-dashboard') {
      const dashboard: ContentDashboard = {
        todayCount: demoLoaded ? 40 : items.length, totalCount: demoLoaded ? 40 : items.length,
        highResonanceCount: demoLoaded ? 31 : items.filter((item) => item.resonanceScore >= 80).length,
        favoriteCount: items.filter((item) => item.isFavorite).length,
        emotionDistribution: [{ label: '孤独', count: 1 }, { label: '治愈', count: 1 }, { label: '遗憾', count: 1 }],
        categoryDistribution: [{ label: '孤独', count: 1 }, { label: '成长', count: 1 }, { label: '爱情', count: 1 }],
      };
      return success(dashboard);
    }
    if (method === 'POST' && url.pathname === '/api/v1/demo-data/load') {
      const loadedCount = demoLoaded ? 0 : 40;
      demoLoaded = true;
      return success({ loadedCount, totalCount: 40 });
    }
    if (method === 'POST' && url.pathname === '/api/v1/imports/csv') {
      const body = JSON.parse(String(init?.body ?? '{}')) as { csvText?: string };
      if (!body.csvText?.replace(/^\uFEFF/, '').startsWith('content')) return failure('CSV 必须包含 content 表头');
      const summary: CsvImportSummary = { totalRows: 2, importedCount: 1, failedCount: 1, duplicateCount: 1, errors: [{ row: 3, message: 'content 与已有素材重复' }] };
      return success(summary);
    }
    if (method === 'GET' && url.pathname === '/api/v1/content-items') {
      let result = structuredClone(items);
      const emotion = url.searchParams.get('emotion');
      const category = url.searchParams.get('category');
      const search = url.searchParams.get('search')?.toLowerCase();
      if (emotion) result = result.filter((item) => item.emotion === emotion);
      if (category) result = result.filter((item) => item.category === category);
      if (search) result = result.filter((item) => `${item.content}${item.source}${item.tags.join('')}`.toLowerCase().includes(search));
      if (url.searchParams.get('highResonance') === 'true') result = result.filter((item) => item.resonanceScore >= 80);
      if (url.searchParams.get('sort') === 'resonance_desc') result.sort((a, b) => b.resonanceScore - a.resonanceScore);
      if (url.searchParams.get('sort') === 'likes_desc') result.sort((a, b) => b.likes - a.likes);
      return success(result);
    }
    if (method === 'GET' && url.pathname === '/api/v1/favorites') return success(items.filter((item) => item.isFavorite));

    const favoriteMatch = /^\/api\/v1\/content-items\/([^/]+)\/favorite$/.exec(url.pathname);
    if (method === 'POST' && favoriteMatch) {
      const item = items.find((candidate) => candidate.id === favoriteMatch[1]);
      if (!item) return failure('未找到指定素材', 404);
      item.isFavorite = (JSON.parse(String(init?.body ?? '{}')) as { favorite: boolean }).favorite;
      return success(item);
    }
    const removeMatch = /^\/api\/v1\/favorites\/([^/]+)$/.exec(url.pathname);
    if (method === 'DELETE' && removeMatch) {
      const item = items.find((candidate) => candidate.id === removeMatch[1]);
      if (!item) return failure('未找到指定素材', 404);
      item.isFavorite = false;
      return success(item);
    }
    const itemMatch = /^\/api\/v1\/content-items\/([^/]+)$/.exec(url.pathname);
    if (method === 'GET' && itemMatch) {
      const item = items.find((candidate) => candidate.id === itemMatch[1]);
      return item ? success(item) : failure('未找到指定素材', 404);
    }
    if (method === 'POST' && url.pathname === '/api/v1/generated-contents') {
      const body = JSON.parse(String(init?.body ?? '{}')) as { contentIds: string[] };
      const result = { ...generatedFixture, contentIds: body.contentIds };
      generated.set(result.id, result);
      return success(result);
    }
    const generatedMatch = /^\/api\/v1\/generated-contents\/([^/]+)$/.exec(url.pathname);
    if (method === 'GET' && generatedMatch) {
      const result = generated.get(generatedMatch[1] ?? '');
      return result ? success(result) : failure('未找到指定生成草稿', 404);
    }
    return failure('未找到接口', 404);
  });
  vi.stubGlobal('fetch', mock);
  return { mock };
}

afterEach(() => vi.unstubAllGlobals());

describe('emotion content studio demo', () => {
  it('loads the dashboard through HTTP and exposes the four workflow destinations', async () => {
    installDemoApi();
    render(<MemoryRouter initialEntries={['/']}><App /></MemoryRouter>);
    expect(await screen.findByText('把情绪素材，变成可继续创作的内容。')).toBeInTheDocument();
    for (const label of ['仪表盘', 'CSV 导入', '情绪素材库', '灵感库']) expect(screen.getByRole('link', { name: label })).toBeInTheDocument();
  });

  it('retries a real dashboard request failure even when preview mode is already normal', async () => {
    const { mock } = installDemoApi();
    mock.mockImplementationOnce(async () => failure('临时网络错误', 503));
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={['/']}><App /></MemoryRouter>);
    expect(await screen.findByText('这部分暂时没有加载出来')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '重新加载' }));
    expect(await screen.findByText('把情绪素材，变成可继续创作的内容。')).toBeInTheDocument();
    expect(mock).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['/', '把情绪素材，变成可继续创作的内容。'],
    ['/import', '导入一份 CSV，自动完成清洗与模拟分析。'],
    ['/library', '每条素材，都已有一份可见的分析。'],
    ['/materials/content-0001', '夜深以后，我开始认真听见自己的声音。'],
    ['/inspirations', '慢慢来，也是在认真向前。'],
    ['/generated/generated-01', '孤独里，那些值得被看见的时刻'],
  ])('renders the demo route %s', async (route, expectedText) => {
    installDemoApi();
    render(<MemoryRouter initialEntries={[route]}><App /></MemoryRouter>);
    expect(await screen.findByText(expectedText)).toBeInTheDocument();
  });

  it('loads demo data and exposes a direct path to the material library', async () => {
    installDemoApi();
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={['/']}><App /></MemoryRouter>);
    await user.click(await screen.findByRole('button', { name: /加载演示数据/ }));
    expect(await screen.findByText('已载入 40 条演示素材，当前共 40 条。')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /查看素材库/ })).toHaveAttribute('href', '/library');
  });

  it('uploads a real CSV file and displays the import summary', async () => {
    installDemoApi();
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={['/import']}><App /></MemoryRouter>);
    const csv = 'content,author\n"夜晚也要照顾自己",\n"夜晚也要照顾自己",';
    const file = new File([csv], 'demo.csv', { type: 'text/csv' });
    Object.defineProperty(file, 'text', { value: async () => csv });
    await user.upload(screen.getByLabelText('选择 CSV 文件'), file);
    await user.click(screen.getByRole('button', { name: /导入并自动处理/ }));
    expect(await screen.findByRole('heading', { name: '导入完成' })).toBeInTheDocument();
    expect(screen.getByText('成功导入').previousElementSibling).toHaveTextContent('1');
    expect(screen.getByText('重复').previousElementSibling).toHaveTextContent('1');
  });

  it('surfaces a CSV header error without showing a false success', async () => {
    installDemoApi();
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={['/import']}><App /></MemoryRouter>);
    const file = new File(['text\n错误表头'], 'invalid.csv', { type: 'text/csv' });
    Object.defineProperty(file, 'text', { value: async () => 'text\n错误表头' });
    await user.upload(screen.getByLabelText('选择 CSV 文件'), file);
    await user.click(screen.getByRole('button', { name: /导入并自动处理/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('CSV 必须包含 content 表头');
    expect(screen.queryByRole('heading', { name: '导入完成' })).not.toBeInTheDocument();
  });

  it('combines emotion, high-resonance and score sorting filters', async () => {
    const { mock } = installDemoApi();
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={['/library']}><App /></MemoryRouter>);
    await screen.findByText('慢慢来，也是在认真向前。');
    await user.selectOptions(screen.getByRole('combobox', { name: '情绪筛选' }), '孤独');
    await user.selectOptions(screen.getByRole('combobox', { name: '素材排序' }), 'resonance_desc');
    await user.click(screen.getByRole('button', { name: '只看高共鸣' }));
    expect(await screen.findByText('夜深以后，我开始认真听见自己的声音。')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText('慢慢来，也是在认真向前。')).not.toBeInTheDocument());
    expect(mock.mock.calls.some(([input]) => String(input).includes('emotion=%E5%AD%A4%E7%8B%AC') && String(input).includes('sort=resonance_desc') && String(input).includes('highResonance=true'))).toBe(true);
  });

  it('opens a material, adds it to inspirations and generates a draft', async () => {
    installDemoApi();
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={['/materials/content-0001']}><App /></MemoryRouter>);
    await user.click(await screen.findByRole('button', { name: /加入灵感库/ }));
    expect(await screen.findByText('已加入灵感库。')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /生成文案/ }));
    expect(await screen.findByText('DEMO AI 生成结果')).toBeInTheDocument();
    expect(screen.getByText('草稿 · 待人工确认')).toBeInTheDocument();
  });

  it('shows restricted licenses explicitly and disables generation', async () => {
    installDemoApi();
    render(<MemoryRouter initialEntries={['/materials/content-0004']}><App /></MemoryRouter>);
    expect(await screen.findByText('这条素材只用于研究授权状态。')).toBeInTheDocument();
    expect(screen.getByText('仅供研究')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '授权状态不可生成' })).toBeDisabled();
  });

  it('retries a generated-content request failure on the same deep route', async () => {
    const { mock } = installDemoApi();
    mock.mockImplementationOnce(async () => failure('临时网络错误', 503));
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={['/generated/generated-01']}><App /></MemoryRouter>);
    expect(await screen.findByText('这部分暂时没有加载出来')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '重新加载' }));
    expect(await screen.findByRole('heading', { name: generatedFixture.title })).toBeInTheDocument();
    expect(mock).toHaveBeenCalledTimes(2);
  });

  it('selects a favorite material and generates from the inspiration library', async () => {
    installDemoApi();
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={['/inspirations']}><App /></MemoryRouter>);
    await screen.findByText('慢慢来，也是在认真向前。');
    await user.click(screen.getByRole('checkbox'));
    expect(screen.getByText('已选择 1 / 5')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /生成文案/ }));
    expect(await screen.findByRole('heading', { name: generatedFixture.title })).toBeInTheDocument();
  });

  it('keeps write actions disabled in the blocked preview state', async () => {
    installDemoApi();
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={['/import']}><App /></MemoryRouter>);
    await user.selectOptions(screen.getByRole('combobox', { name: '切换页面演示状态' }), 'blocked');
    expect(screen.getByRole('button', { name: /加载演示数据/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /点击选择 CSV/ })).toBeDisabled();
  });

  it('renders the empty and recoverable error states', async () => {
    installDemoApi();
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={['/']}><App /></MemoryRouter>);
    await screen.findByText('把情绪素材，变成可继续创作的内容。');
    const switcher = screen.getByRole('combobox', { name: '切换页面演示状态' });
    await user.selectOptions(switcher, 'empty');
    expect(await screen.findByText('素材库还是空的')).toBeInTheDocument();
    await user.selectOptions(switcher, 'error');
    expect(await screen.findByText('这部分暂时没有加载出来')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '重新加载' }));
    expect(await screen.findByText('把情绪素材，变成可继续创作的内容。')).toBeInTheDocument();
  });
});
