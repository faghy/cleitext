import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, Outlet, useNavigate } from '@tanstack/react-router';
import { api } from '../api';
import { ME_QUERY_KEY, useMe } from '../auth';
import { visibleSections } from '../navigation';

/** WordPress-like admin frame: dark sidebar, top bar, content. */
export function AdminLayout() {
  const me = useMe();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const sections = visibleSections(me.capabilities);

  const logout = useMutation({
    mutationFn: () => api<void>('POST', '/auth/logout'),
    onSettled: async () => {
      queryClient.setQueryData(ME_QUERY_KEY, null);
      await navigate({ to: '/login' });
    },
  });

  return (
    <div className="flex min-h-screen bg-slate-100 text-slate-900">
      <aside className="w-56 shrink-0 bg-slate-900 text-slate-200">
        <div className="px-4 py-4">
          <p className="text-lg font-semibold text-white">Cleitext</p>
          <p className="truncate text-xs text-slate-400" title={me.site.name}>
            {me.site.name}
          </p>
        </div>
        <nav aria-label="Main">
          <ul>
            {sections.map((section) => (
              <li key={section.to}>
                <Link
                  to={section.to}
                  activeOptions={{ exact: section.to === '/' }}
                  className="block px-4 py-2 text-sm hover:bg-slate-800"
                  activeProps={{ className: 'bg-sky-700 text-white', 'aria-current': 'page' }}
                >
                  {section.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-end gap-4 border-b border-slate-200 bg-white px-6 py-2 text-sm">
          <span>
            {me.user.displayName}
            <span className="ml-2 text-slate-500">
              {me.user.isSuperAdmin ? 'Super admin' : (me.role?.name ?? '')}
            </span>
          </span>
          <button
            type="button"
            className="text-sky-700 hover:underline"
            onClick={() => logout.mutate()}
            disabled={logout.isPending}
          >
            Sign out
          </button>
        </header>
        <main className="p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
