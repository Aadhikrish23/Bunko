import { BookOpen, LibraryBig, LogOut, NotebookPen, Rows3, Settings as SettingsIcon, TrendingUp } from 'lucide-react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../../lib/auth-context';

const NAV_ITEMS = [
  { to: '/library', label: 'Library', icon: LibraryBig },
  { to: '/shelves', label: 'Shelves', icon: Rows3 },
  { to: '/journal', label: 'Journal', icon: NotebookPen },
  { to: '/statistics', label: 'Statistics', icon: TrendingUp },
  { to: '/settings', label: 'Settings', icon: SettingsIcon },
];

export function AppShell() {
  const { user, logout } = useAuth();

  return (
    <div className="flex min-h-screen flex-col md:flex-row bg-paper-50">
      {/* Mobile Top Header */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-paper-200 bg-paper-100/90 px-4 py-3 backdrop-blur md:hidden">
        <div className="flex items-center gap-2">
          <BookOpen className="h-5 w-5 text-moss-600" strokeWidth={1.75} />
          <span className="font-display text-lg text-paper-900">Bunko</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="max-w-[120px] truncate text-xs font-medium text-paper-700">{user?.displayName}</span>
          <button
            type="button"
            onClick={logout}
            title="Sign out"
            className="focus-visible:focus-ring rounded-md p-1.5 text-paper-600 hover:bg-paper-200/70"
          >
            <LogOut className="h-4 w-4" strokeWidth={1.75} />
          </button>
        </div>
      </header>

      {/* Desktop Persistent Sidebar */}
      <aside className="hidden w-60 flex-shrink-0 flex-col border-r border-paper-200 bg-paper-100/60 px-4 py-6 md:flex">
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

      {/* Main Content View Container (responsive padding & 4K widescreen expansion) */}
      <main className="flex-1 overflow-y-auto pb-20 md:pb-0">
        <div className="mx-auto w-full max-w-7xl 2xl:max-w-[1750px] 3xl:max-w-[2200px] px-4 py-6 sm:px-6 md:px-8 md:py-8">
          <Outlet />
        </div>
      </main>

      {/* Mobile Bottom Navigation Bar */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 flex items-center justify-around border-t border-paper-200/90 bg-paper-100/95 px-1 py-2 backdrop-blur md:hidden shadow-lg">
        {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex flex-col items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-medium transition-colors ${
                isActive ? 'text-moss-700 font-bold' : 'text-paper-600 hover:text-paper-900'
              }`
            }
          >
            <Icon className="h-5 w-5" strokeWidth={1.75} />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
