import { StudioDashboardSchema, type AccountDashboard } from '@emotion-studio/contracts';
import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { usePreviewMode } from '../components/AppShell';
import { EmptyState, ErrorState, LoadingState } from '../components/States';
import { StudioSummary } from '../components/StudioSummary';
import { accountProfiles, parseAccountId } from '../lib/accounts';
import { useRemote } from '../lib/api';
import EmotionWorkspace from './workspaces/EmotionWorkspace';
import EnglishWorkspace from './workspaces/EnglishWorkspace';
import GrowthWorkspace from './workspaces/GrowthWorkspace';

export default function AccountWorkspacePage() {
  const { accountId: rawAccountId } = useParams();
  const accountId = parseAccountId(rawAccountId);
  const { mode, setMode } = usePreviewMode();
  const [refreshKey, setRefreshKey] = useState(0);
  const state = useRemote<AccountDashboard[]>('/api/v1/studio-dashboard', mode, StudioDashboardSchema, refreshKey);

  if (!accountId) {
    return <EmptyState title="没有这个账号" description="请从顶部选择 Personal Growth、Fun English 或 Emotion Library。" action="返回总览" actionTo="/" />;
  }
  if (state.status === 'loading') return <LoadingState rows={4} />;
  if (state.status === 'error') return <ErrorState message={state.error} onRetry={() => { setMode('normal'); setRefreshKey((value) => value + 1); }} />;

  const profile = accountProfiles.find((item) => item.id === accountId)!;
  const dashboard = state.data.find((item): item is AccountDashboard => item.accountId === accountId);
  if (!dashboard) return <ErrorState message="账号统计数据不完整。" onRetry={() => setRefreshKey((value) => value + 1)} />;

  return (
    <>
      <div className="page-intro studio-workspace-intro">
        <div className="page-intro-copy">
          <p className="kicker">{profile.displayName}</p>
          <h2>{profile.shortName}</h2>
          <p>{profile.description}</p>
        </div>
      </div>
      <StudioSummary dashboard={dashboard} />
      {accountId === 'personal_growth' ? <GrowthWorkspace mode={mode} /> : null}
      {accountId === 'fun_english' ? <EnglishWorkspace mode={mode} /> : null}
      {accountId === 'emotion_library' ? <EmotionWorkspace dashboard={dashboard} mode={mode} onChange={() => setRefreshKey((value) => value + 1)} /> : null}
    </>
  );
}
