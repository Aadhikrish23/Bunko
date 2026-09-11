import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { RequireAuth } from './components/layout/RequireAuth';
import { LoginPage } from './features/auth/LoginPage';
import { RegisterPage } from './features/auth/RegisterPage';
import { BookDetailPage } from './features/library/BookDetailPage';
import { LibraryPage } from './features/library/LibraryPage';
import { JournalPage } from './features/journal/JournalPage';
import { ReaderPage } from './features/reader/ReaderPage';
import { SettingsPage } from './features/settings/SettingsPage';
import { ShelvesPage } from './features/shelves/ShelvesPage';
import { StatisticsPage } from './features/statistics/StatisticsPage';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />

        <Route element={<RequireAuth />}>
          {/* The reader is deliberately outside AppShell — SRS §29.4
              wants the reader to minimise UI, not sit inside the app's
              persistent sidebar/chrome. */}
          <Route path="/read/:editionId" element={<ReaderPage />} />

          <Route element={<AppShell />}>
            <Route path="/library" element={<LibraryPage />} />
            <Route path="/library/:workId" element={<BookDetailPage />} />
            <Route path="/shelves" element={<ShelvesPage />} />
            <Route path="/journal" element={<JournalPage />} />
            <Route path="/statistics" element={<StatisticsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Route>
        </Route>

        <Route path="/" element={<Navigate to="/library" replace />} />
        <Route path="*" element={<Navigate to="/library" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
