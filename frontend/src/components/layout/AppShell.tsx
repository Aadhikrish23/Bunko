import { BookOpen, LibraryBig, LogOut, NotebookPen, Settings as SettingsIcon, TrendingUp } from 'lucide-react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../../lib/auth-context';

const NAV_ITEMS = [
  { to: '/library', label: 'Library', icon: LibraryBig },
  { to: '/journal', label: 'Journal', icon: NotebookPen },
  { to: '/statistics', label: 'Statistics', icon: TrendingUp },
  { to: '/settings', label: 'Settings', icon: SettingsIcon },
];

export function AppShell() {
  const { user, logout } = useAuth();

  return (
    <div className="flex min-h-screen bg-paper-50">
      <aside className="flex w-60 flex-shrink-0 flex-col border-r border-paper-200 bg-paper-100/60 px-4 py-6">
        <div className="mb-8 flex items-center gap-2 px-2">
          <BookOpen className="h-6 w-6 text-moss-600" strokeWidth={1.75} />
          <span className="font-display text-xl text-paper-900">Bunko</span>
        </div>

        <nav className="flex flex-1 flex-col gap-1">
          {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  isActive ? 'bg-moss-100 text-moss-700' : 'text-paper-700 hover:bg-paper-200/70'
                }`
              }
            >
              <Icon className="h-4.5 w-4.5" strokeWidth={1.75} />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="mt-auto border-t border-paper-200 pt-4">
          <p className="truncate px-3 text-sm font-medium text-paper-800">{user?.displayName}</p>
          <p className="truncate px-3 text-xs text-paper-500">{user?.email}</p>
          <button
            type="button"
            onClick={logout}
            className="focus-visible:focus-ring mt-3 flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-paper-600 hover:bg-paper-200/70"
          >
            <LogOut className="h-4 w-4" strokeWidth={1.75} />
            Sign out
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-5xl px-8 py-10">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
