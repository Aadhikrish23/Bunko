import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import { NetworkError } from './lib/api/client';
import { AuthProvider } from './lib/auth-context';
import './index.css';

// networkMode 'always': React Query would otherwise *pause* every query
// and mutation while the browser reports offline, so the offline fallbacks
// (Phase 9) would never run. Requests fail fast with NetworkError instead,
// which isn't retried — the offline path answers immediately.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      networkMode: 'always',
      retry: (failureCount, error) => !(error instanceof NetworkError) && failureCount < 3,
    },
    mutations: { networkMode: 'always' },
  },
});

// Offline app shell (T-072) — production builds only; in development it
// would serve stale modules over Vite's hot reload.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => undefined);
  });
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element not found');
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);
