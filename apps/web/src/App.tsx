import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import EnglishWorkflowPage from './pages/EnglishWorkflowPage';
import { AppShell } from './components/AppShell';
import DashboardPage from './pages/DashboardPage';
import GeneratedContentPage from './pages/GeneratedContentPage';
import ImportPage from './pages/ImportPage';
import InspirationsPage from './pages/InspirationsPage';
import LibraryPage from './pages/LibraryPage';
import MaterialDetailPage from './pages/MaterialDetailPage';
import AccountWorkspacePage from './pages/AccountWorkspacePage';
import PublishingPage from './pages/PublishingPage';
import GrowthLoopPage from './pages/GrowthLoopPage';

export default function App() {
  const { pathname } = useLocation();
  if (pathname === '/english' || pathname.startsWith('/english/')) {
    return <Routes><Route path="/english" element={<EnglishWorkflowPage />} /><Route path="/english/:id" element={<EnglishWorkflowPage />} /></Routes>;
  }
  return (
    <AppShell>
      <Routes>
        {['/', '/create', '/retrospectives', '/retrospectives/:id', '/growth-content/:id', '/performance', '/history', '/settings'].map(path => <Route key={path} path={path} element={<GrowthLoopPage />} />)}
        <Route path="/studio" element={<DashboardPage />} />
        <Route path="/accounts/:accountId" element={<AccountWorkspacePage />} />
        <Route path="/import" element={<ImportPage />} />
        <Route path="/library" element={<LibraryPage />} />
        <Route path="/materials/:id" element={<MaterialDetailPage />} />
        <Route path="/inspirations" element={<InspirationsPage />} />
        <Route path="/generated/:id" element={<GeneratedContentPage />} />
        <Route path="/posts" element={<PublishingPage />} />
        <Route path="*" element={<Navigate replace to="/" />} />
      </Routes>
    </AppShell>
  );
}
