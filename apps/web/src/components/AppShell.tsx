import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import {
  BookOpenText,
  FileUp,
  LayoutDashboard,
  Menu,
  Send,
  Sparkles,
  X,
} from 'lucide-react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { accountProfiles, getAccountIdFromUrl, parseAccountId, withAccount } from '../lib/accounts';
import type { PreviewMode } from '../lib/api';

type PreviewContextValue = {
  mode: PreviewMode;
  setMode: (mode: PreviewMode) => void;
};

const PreviewContext = createContext<PreviewContextValue | null>(null);

export function usePreviewMode() {
  const value = useContext(PreviewContext);
  if (!value) throw new Error('Preview context is unavailable');
  return value;
}

const pageMeta = [
  { match: /^\/$/, eyebrow: '演示 / 内容工作台', title: '内容总览' },
  { match: /^\/accounts\/personal_growth/, eyebrow: '个人成长', title: '成长复盘工作区' },
  { match: /^\/accounts\/fun_english/, eyebrow: '趣味英语', title: '趣味英语工作区' },
  { match: /^\/accounts\/emotion_library/, eyebrow: '情绪灵感库', title: '情绪素材工作区' },
  { match: /^\/import/, eyebrow: '导入 / CSV', title: '导入素材' },
  { match: /^\/library/, eyebrow: '素材 / 分析', title: '统一素材库' },
  { match: /^\/materials/, eyebrow: '素材 / 详情', title: '素材详情' },
  { match: /^\/inspirations/, eyebrow: '灵感 / 收藏', title: '灵感库' },
  { match: /^\/generated/, eyebrow: '生成 / 草稿', title: '文案生成结果' },
  { match: /^\/posts/, eyebrow: '发布 / 表现', title: '发布与数据' },
];

const previewOptions: Array<{ value: PreviewMode; label: string }> = [
  { value: 'normal', label: '正常状态' },
  { value: 'empty', label: '空状态' },
  { value: 'loading', label: '加载状态' },
  { value: 'error', label: '错误状态' },
  { value: 'long', label: '超长文案' },
  { value: 'blocked', label: '禁止操作' },
];

export function AppShell({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [mode, setMode] = useState<PreviewMode>('normal');
  const [menuOpen, setMenuOpen] = useState(false);
  const meta = pageMeta.find((item) => item.match.test(location.pathname)) ?? pageMeta[0]!;
  const context = useMemo(() => ({ mode, setMode }), [mode]);
  const activeAccountId = getAccountIdFromUrl(location.pathname, location.search);
  const profiles = accountProfiles;
  const navigation = [
    { to: '/', label: '内容总览', icon: LayoutDashboard },
    { to: '/retrospectives', label: '复盘记录', icon: BookOpenText },
    { to: '/create', label: '内容创作', icon: Sparkles },
    { to: '/performance', label: '数据表现', icon: Send },
    { to: '/history', label: '历史记录', icon: BookOpenText },
    { to: '/english', label: '趣味英语', icon: Sparkles },
    { to: '/settings', label: '设置', icon: LayoutDashboard },
    { to: `/accounts/${activeAccountId}`, label: '账号工作区', icon: Sparkles },
    { to: withAccount('/library', activeAccountId), label: '统一素材库', icon: BookOpenText },
    { to: withAccount('/posts', activeAccountId), label: '发布与数据', icon: Send },
    ...(activeAccountId === 'emotion_library' ? [{ to: '/import', label: 'CSV 导入', icon: FileUp }] : []),
  ];

  function switchAccount(value: string) {
    const accountId = parseAccountId(value);
    if (accountId) navigate(`/accounts/${accountId}`);
  }

  return (
    <PreviewContext.Provider value={context}>
      <div className="app-shell">
        <aside id="primary-sidebar" className={`sidebar ${menuOpen ? 'is-open' : ''}`}>
          <div className="brand-lockup">
            <div className="brand-mark">字</div>
            <div><strong>字里</strong><span>内容工作室</span></div>
            <button className="icon-button sidebar-close" aria-label="关闭菜单" onClick={() => setMenuOpen(false)}><X size={18} /></button>
          </div>
          <nav className="primary-nav" aria-label="主要导航">
            {navigation.map(({ to, label, icon: Icon }) => (
              <NavLink key={to} to={to} end={to === '/'} onClick={() => setMenuOpen(false)} className={({ isActive }) => isActive ? 'nav-link is-active' : 'nav-link'}>
                <Icon size={17} strokeWidth={1.7} />
                <span>{label}</span>
              </NavLink>
            ))}
          </nav>
          <div className="sidebar-note">
            <span>三账号工作台</span>
            <strong>记录 → 生成 → 复盘</strong>
            <div className="mini-progress"><i style={{ width: '68%' }} /></div>
            <p>每份生成结果都会标注 Provider 与模型，发布前必须人工确认。</p>
          </div>
          <div className="profile-chip"><span>创</span><div><strong>内容创作者</strong><small>多账号管理</small></div></div>
        </aside>

        <div className="workspace">
          <header className="topbar">
            <button className="icon-button mobile-menu" aria-label="打开菜单" aria-controls="primary-sidebar" aria-expanded={menuOpen} onClick={() => setMenuOpen(true)}><Menu size={20} /></button>
            <div className="page-heading"><span>{meta.eyebrow}</span><h1>{meta.title}</h1></div>
            <div className="topbar-actions">
              <nav className="account-switcher" aria-label="账号切换">
                {profiles.map((profile) => <NavLink key={profile.id} to={`/accounts/${profile.id}`} className={profile.id === activeAccountId ? 'is-active' : ''}>{profile.displayName}</NavLink>)}
              </nav>
              <label className="account-switcher-mobile">
                <span>切换账号</span>
                <select aria-label="切换内容账号" value={activeAccountId} onChange={(event) => switchAccount(event.target.value)}>
                  {profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.displayName}</option>)}
                </select>
              </label>
              {import.meta.env.DEV ? <label className="state-switcher">
                <span>演示状态</span>
                <select aria-label="切换页面演示状态" value={mode} onChange={(event) => setMode(event.target.value as PreviewMode)}>
                  {previewOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label> : null}
            </div>
          </header>
          <main className="page-content">{children}</main>
        </div>
        {menuOpen ? <button className="sidebar-scrim" aria-label="关闭菜单" onClick={() => setMenuOpen(false)} /> : null}
      </div>
    </PreviewContext.Provider>
  );
}
