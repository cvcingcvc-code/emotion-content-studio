import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import DashboardPage from './pages/DashboardPage';
import GeneratedContentPage from './pages/GeneratedContentPage';
import ImportPage from './pages/ImportPage';
import InspirationsPage from './pages/InspirationsPage';
import LibraryPage from './pages/LibraryPage';
import MaterialDetailPage from './pages/MaterialDetailPage';
import AccountWorkspacePage from './pages/AccountWorkspacePage';
import PublishingPage from './pages/PublishingPage';

export default function App() {
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<DashboardPage />} />
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
