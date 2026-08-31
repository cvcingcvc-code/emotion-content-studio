import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import {
  BookOpenText,
  FileUp,
  Heart,
  LayoutDashboard,
  Menu,
  X,
} from 'lucide-react';
import { NavLink, useLocation } from 'react-router-dom';
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

const navigation = [
  { to: '/', label: '仪表盘', icon: LayoutDashboard },
  { to: '/import', label: 'CSV 导入', icon: FileUp },
  { to: '/library', label: '情绪素材库', icon: BookOpenText },
  { to: '/inspirations', label: '灵感库', icon: Heart },
];

const pageMeta = [
  { match: /^\/$/, eyebrow: 'DEMO / CONTENT DESK', title: '今日内容台' },
  { match: /^\/import/, eyebrow: 'INGEST / CSV', title: '导入素材' },
  { match: /^\/library/, eyebrow: 'MATERIALS / ANALYSIS', title: '情绪素材库' },
  { match: /^\/materials/, eyebrow: 'MATERIAL / DETAIL', title: '素材详情' },
  { match: /^\/inspirations/, eyebrow: 'CURATED / IDEAS', title: '灵感库' },
  { match: /^\/generated/, eyebrow: 'DEMO AI / DRAFT', title: '文案生成结果' },
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
  const [mode, setMode] = useState<PreviewMode>('normal');
  const [menuOpen, setMenuOpen] = useState(false);
  const meta = pageMeta.find((item) => item.match.test(location.pathname)) ?? pageMeta[0]!;
  const context = useMemo(() => ({ mode, setMode }), [mode]);

  return (
    <PreviewContext.Provider value={context}>
      <div className="app-shell">
        <aside id="primary-sidebar" className={`sidebar ${menuOpen ? 'is-open' : ''}`}>
          <div className="brand-lockup">
            <div className="brand-mark">字</div>
            <div><strong>字里</strong><span>CONTENT DESK</span></div>
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
            <span>DEMO 工作流</span>
            <strong>导入 → 分析 → 生成</strong>
            <div className="mini-progress"><i style={{ width: '72%' }} /></div>
            <p>所有分析与文案均由 Mock 服务生成，便于快速验证。</p>
          </div>
          <div className="profile-chip"><span>创</span><div><strong>个人工作台</strong><small>内容创作者</small></div></div>
        </aside>

        <div className="workspace">
          <header className="topbar">
            <button className="icon-button mobile-menu" aria-label="打开菜单" aria-controls="primary-sidebar" aria-expanded={menuOpen} onClick={() => setMenuOpen(true)}><Menu size={20} /></button>
            <div className="page-heading"><span>{meta.eyebrow}</span><h1>{meta.title}</h1></div>
            <div className="topbar-actions">
              <label className="state-switcher">
                <span>状态预览</span>
                <select aria-label="切换页面演示状态" value={mode} onChange={(event) => setMode(event.target.value as PreviewMode)}>
                  {previewOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>
            </div>
          </header>
          <main className="page-content">{children}</main>
        </div>
        {menuOpen ? <button className="sidebar-scrim" aria-label="关闭菜单" onClick={() => setMenuOpen(false)} /> : null}
      </div>
    </PreviewContext.Provider>
  );
}
