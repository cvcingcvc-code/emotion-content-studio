import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import DashboardPage from './pages/DashboardPage';
import EditorPage from './pages/EditorPage';
import ExportsPage from './pages/ExportsPage';
import ImportPage from './pages/ImportPage';
import LibraryPage from './pages/LibraryPage';
import ReviewPage from './pages/ReviewPage';
import StudioPage from './pages/StudioPage';

export default function App() {
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/import" element={<ImportPage />} />
        <Route path="/review" element={<ReviewPage />} />
        <Route path="/library" element={<LibraryPage />} />
        <Route path="/editor/:id" element={<EditorPage />} />
        <Route path="/studio/:id" element={<StudioPage />} />
        <Route path="/exports" element={<ExportsPage />} />
        <Route path="*" element={<Navigate replace to="/" />} />
      </Routes>
    </AppShell>
  );
}
