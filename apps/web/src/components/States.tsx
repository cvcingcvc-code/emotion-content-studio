import { AlertTriangle, ArrowRight, Ban, FileText, LoaderCircle, RotateCcw } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

export function LoadingState({ rows = 3 }: { rows?: number }) {
  return (
    <div className="state-panel loading-panel" aria-live="polite" aria-busy="true">
      <LoaderCircle className="spin" size={22} />
      <div><strong>正在整理内容</strong><span>我们会保留当前页面，不会打断你的工作。</span></div>
      <div className="skeleton-stack">{Array.from({ length: rows }, (_, index) => <i key={index} />)}</div>
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="state-panel error-panel" role="alert">
      <AlertTriangle size={24} />
      <div><strong>这部分暂时没有加载出来</strong><span>{message}</span></div>
      {onRetry ? <button className="text-button" onClick={onRetry}><RotateCcw size={15} />重新加载</button> : null}
    </div>
  );
}

export function EmptyState({ title, description, action, actionTo, onAction }: { title: string; description: string; action?: string; actionTo?: string; onAction?: () => void }) {
  return (
    <div className="state-panel empty-panel">
      <FileText size={26} />
      <div><strong>{title}</strong><span>{description}</span></div>
      {action && actionTo ? <Link className="text-button" to={actionTo}>{action}<ArrowRight size={15} /></Link> : null}
      {action && !actionTo && onAction ? <button className="text-button" onClick={onAction}>{action}<ArrowRight size={15} /></button> : null}
    </div>
  );
}

export function BlockedNotice({ title = '当前内容不能继续操作', description }: { title?: string; description: string }) {
  return (
    <div className="blocked-notice" role="status">
      <Ban size={18} />
      <div><strong>{title}</strong><span>{description}</span></div>
    </div>
  );
}

export function StatusPill({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'good' | 'warning' | 'danger' }) {
  return <span className={`status-pill tone-${tone}`}>{children}</span>;
}
