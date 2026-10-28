import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { RequireAuth } from './components/layout/RequireAuth';
import { AssistantChatPage } from './features/assistant/AssistantChatPage';
import { LoginPage } from './features/auth/LoginPage';
import { RegisterPage } from './features/auth/RegisterPage';
import { BookDetailPage } from './features/library/BookDetailPage';
import { JournalPage } from './features/journal/JournalPage';
import { FlowReaderPage } from './features/reader/FlowReaderPage';
import { ReaderPage } from './features/reader/ReaderPage';
import { SettingsPage } from './features/settings/SettingsPage';
import { ShelvesPage } from './features/shelves/ShelvesPage';
import { SoundtracksPage } from './features/soundtrack/SoundtracksPage';
import { SyncLayer } from './features/sync/SyncLayer';
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
          <Route path="/read-chapters/:editionId" element={<FlowReaderPage />} />

          <Route element={<AppShell />}>
            {/* No standalone /library landing page (Phase 13, T-110) — Shelves is
                the one place to browse/search/add books. The deep link to a
                single book's detail page stays at this URL unchanged, since
                existing links/bookmarks and several call sites (JournalPage,
                SeriesPanel, the reader's "back to book" path) already point here. */}
            <Route path="/library/:workId" element={<BookDetailPage />} />
            <Route path="/shelves" element={<ShelvesPage />} />
            <Route path="/journal" element={<JournalPage />} />
            <Route path="/statistics" element={<StatisticsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/soundtracks" element={<SoundtracksPage />} />
            <Route path="/assistant" element={<AssistantChatPage />} />
          </Route>
        </Route>

        <Route path="/" element={<Navigate to="/shelves" replace />} />
        <Route path="*" element={<Navigate to="/shelves" replace />} />
      </Routes>
      <SyncLayer />
    </BrowserRouter>
  );
}
