import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, Outlet, useNavigate } from '@tanstack/react-router';
import { api } from '../api';
import { ME_QUERY_KEY, useMe } from '../auth';
import { visibleSections } from '../navigation';
import { useT } from '../components/ui';
import { Avatar } from '../components/avatar';
import { taxonomiesQuery, taxonomyLabel } from './terms';
import { usePluginMenu, type PluginMenuItem } from '../plugins';

/** WordPress-like admin frame: dark sidebar, top bar, content. */
export function AdminLayout() {
  const me = useMe();
  const { t } = useT();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const sections = visibleSections(me.capabilities);
  const pluginMenu = usePluginMenu();
  // WordPress order: plugin content types after Pages, plugin pages at the end.
  const taxonomies = useQuery({
    ...taxonomiesQuery,
    enabled: me.capabilities.includes('manage_terms'),
  });
  // Taxonomies of posts appear under Posts, as Categories and Tags in WordPress.
  const taxonomyItems = (taxonomies.data ?? []).map((taxonomy) => ({
    to: `/taxonomies/${taxonomy.slug}`,
    label: taxonomyLabel(taxonomy, me.user.locale),
    sub: true,
  }));
  const items: (PluginMenuItem & { exact?: boolean; sub?: boolean })[] = sections.flatMap(
    (section) => [
      { to: section.to, label: t(section.label), exact: section.to === '/' },
      ...(section.to === '/posts' ? taxonomyItems : []),
      ...(section.to === '/pages' ? pluginMenu.types : []),
    ],
  );
  items.push(...pluginMenu.pages);

  const logout = useMutation({
    mutationFn: () => api<void>('POST', '/auth/logout'),
    onSettled: async () => {
      queryClient.setQueryData(ME_QUERY_KEY, null);
      await navigate({ to: '/login' });
    },
  });

  return (
    <div className="flex min-h-screen bg-slate-100 text-slate-900">
      <aside className="light-palette w-56 shrink-0 bg-slate-900 text-slate-200">
        <div className="px-4 py-4">
          <p className="text-lg font-semibold text-white">Cleitext</p>
          <p className="truncate text-xs text-slate-400" title={me.site.name}>
            {me.site.name}
          </p>
        </div>
        <nav aria-label={t('Main')}>
          <ul>
            {items.map((section) => (
              <li key={section.to}>
                <Link
                  to={section.to}
                  activeOptions={{ exact: Boolean(section.exact) }}
                  className={`block py-2 text-sm hover:bg-slate-800 ${section.sub ? 'pr-4 pl-8 text-xs' : 'px-4'}`}
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
          {me.sites.length > 1 && (
            <label className="mr-auto flex items-center gap-2">
              <span className="text-slate-600">{t('Site')}</span>
              <select
                className="rounded border border-slate-300 bg-white px-2 py-1"
                value={me.site.id}
                onChange={(e) => {
                  const target = me.sites.find((s) => s.id === e.target.value);
                  // Each site has its own domain and session cookie.
                  if (target?.host)
                    window.location.href = `${window.location.protocol}//${target.host}/admin/`;
                }}
              >
                {me.sites.map((site) => (
                  <option key={site.id} value={site.id} disabled={!site.host}>
                    {site.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <span className="flex items-center gap-2">
            <Avatar name={me.user.displayName} url={me.user.avatarUrl} size={24} />
            {me.user.displayName}
            <span className="ml-2 text-slate-500">
              {me.user.isSuperAdmin ? t('Super admin') : (me.role?.name ?? '')}
            </span>
          </span>
          <button
            type="button"
            className="text-sky-700 hover:underline"
            onClick={() => logout.mutate()}
            disabled={logout.isPending}
          >
            {t('Sign out')}
          </button>
        </header>
        <main className="p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
