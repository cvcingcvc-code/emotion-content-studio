import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PublishedContentSchema, growthCardPages } from '@emotion-studio/contracts';
import { GrowthContentReview } from './GrowthContentReview';

const content = PublishedContentSchema.parse({ id: '00000000-0000-4000-8000-000000000010', revision: 1, account: 'growth', topic: '先确认范围', title: '先确认范围', contentType: 'solution', sourceRetrospectiveId: null, sourceContentId: null, englishDraftId: null, createdAt: '2026-09-10T00:00:00.000Z', updatedAt: '2026-09-10T00:00:00.000Z', publishedAt: null, publishTime: null, status: 'ready', provider: 'mock', note: '', english: null, isDemo: false, writing: { title: '先确认范围', body: '开始前确认三项标准。', corePoint: '确认后行动', solution: '列出标准', endingQuestion: '你会先问什么？', tags: ['#成长'] } });
describe('growth content Review', () => {
  it('uses unsaved edits in Preview and requires approval again before marking published', async () => {
    const user = userEvent.setup(); render(<GrowthContentReview content={content} busy={false} act={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: /^Preview$/ }));
    expect(screen.getByTitle('Content Preview 1').getAttribute('srcdoc')).toContain('开始前确认三项标准。');
    await user.clear(screen.getByLabelText('内容正文'));
    await user.type(screen.getByLabelText('内容正文'), '新的审核内容，不是旧稿。');
    expect(screen.getByTitle('Content Preview 1').getAttribute('srcdoc')).toContain('新的审核内容，不是旧稿。');
    expect(screen.getByRole('button', { name: 'Mark as Published' })).toBeDisabled();
    expect(screen.getByRole('button', { name: /^批准$/ })).toBeEnabled();
  });
  it('paginates long content without losing characters and keeps published snapshots read-only', () => {
    const body = '需要保留的长内容。'.repeat(100);
    const pages = growthCardPages({ ...content, writing: { ...content.writing!, body } });
    expect(pages.length).toBeGreaterThan(1);
    expect(pages.join('').replaceAll('\n', '')).toContain(body);
    render(<GrowthContentReview content={{ ...content, status: 'published', publishedAt: content.createdAt, publishTime: content.createdAt }} busy={false} act={vi.fn()} />);
    expect(screen.getByLabelText('内容正文')).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Mark as Published' })).not.toBeInTheDocument();
  });
});
