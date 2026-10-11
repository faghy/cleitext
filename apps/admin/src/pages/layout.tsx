import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, Outlet, useNavigate, useRouterState } from '@tanstack/react-router';
import { api } from '../api';
import { ME_QUERY_KEY, useMe } from '../auth';
import { visibleSections } from '../navigation';
import { useT } from '../components/ui';
import { Avatar } from '../components/avatar';
import { LogoMark } from '@cleitext/admin-sdk';
import { taxonomiesQuery, taxonomyLabel } from './terms';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { CommandPalette, useCommandPaletteShortcut } from '../components/command-palette';
import { usePluginMenu, type PluginMenuItem } from '../plugins';
import { UPDATES_QUERY } from './updates';
import { useCatalogUpdates } from '../components/catalog';

/** WordPress-like admin frame: dark sidebar, top bar, content. */
/** Section routes are registered dynamically (navigation.ts), hence a plain string. */

/** As in WordPress: a link to the site with a "Visit site" menu on hover or focus. */
function SiteMenu({
  className,
  dark = false,
  children,
}: {
  className: string;
  /** In the dark sidebar: the menu takes the sidebar's colors. */
  dark?: boolean;
  children: ReactNode;
}) {
  const { t } = useT();
  return (
    <div className="group relative">
      <a href="/" className={className} aria-haspopup="true">
        {children}
      </a>
      <div className="absolute top-full left-0 z-40 hidden min-w-40 pt-1 group-focus-within:block group-hover:block">
        <ul
          className={`rounded border py-1 text-sm font-normal shadow-lg ${dark ? 'border-white/10 bg-slate-900/60 text-slate-100 backdrop-blur-sm' : 'border-slate-200 bg-white text-slate-800'}`}
        >
          <li>
            <a
              href="/"
              className={`block px-3 py-1.5 whitespace-nowrap ${dark ? 'hover:bg-white/10 hover:text-white' : 'hover:bg-slate-100'}`}
            >
              {t('Visit site')}
            </a>
          </li>
        </ul>
      </div>
    </div>
  );
}

export function AdminLayout() {
  const me = useMe();
  const { t } = useT();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const sections = visibleSections(me.capabilities);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const togglePalette = useCallback(() => setPaletteOpen((open) => !open), []);
  useCommandPaletteShortcut(togglePalette);
  const pluginMenu = usePluginMenu();
  const updates = useQuery({
    ...UPDATES_QUERY,
    enabled: me.capabilities.includes('manage_plugins'),
    staleTime: 10 * 60 * 1000,
  });
  const updateAvailable = Boolean(updates.data?.available);
  const pluginUpdates = useCatalogUpdates('plugin').length;
  const themeUpdates = useCatalogUpdates('theme').length;
  const badge = (to: string) =>
    to === '/' || to === '/updates'
      ? (updateAvailable ? 1 : 0) + pluginUpdates + themeUpdates
      : to === '/plugins'
        ? pluginUpdates
        : to === '/appearance'
          ? themeUpdates
          : 0;
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

  // The browser tab names the screen and the site, as in WordPress: "Pages ‹ My site".
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const current = items
    .filter((item) =>
      item.to === '/'
        ? pathname === '/'
        : pathname === item.to || pathname.startsWith(`${item.to}/`),
    )
    .sort((a, b) => b.to.length - a.to.length)[0];
  const tabTitle = current ? `${current.label} ‹ ${me.site.name}` : me.site.name;
  useEffect(() => {
    document.title = tabTitle;
  }, [tabTitle]);

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
          <SiteMenu
            dark
            className="flex items-center gap-2 rounded text-lg font-semibold text-white hover:text-sky-200"
          >
            <LogoMark size={24} />
            Cleitext
          </SiteMenu>
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
                  <span className="flex items-center justify-between gap-2">
                    {section.label}
                    {badge(section.to) > 0 && (
                      // As in WordPress: counts on Dashboard, Updates, Plugins and Appearance.
                      <span
                        className="rounded-full bg-amber-500 px-1.5 text-xs leading-5 font-semibold text-slate-900"
                        aria-label={t('{count} updates available', { count: badge(section.to) })}
                        title={t('{count} updates available', { count: badge(section.to) })}
                      >
                        {badge(section.to)}
                      </span>
                    )}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-end gap-4 border-b border-slate-200 bg-white px-6 py-2 text-sm">
          {/* As in WordPress: the site name leads to the site, with a "Visit site" menu. */}
          <SiteMenu className="flex items-center gap-1.5 rounded px-2 py-1 font-semibold text-slate-800 hover:bg-slate-100">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" />
            </svg>
            <span className="max-w-48 truncate">{me.site.name}</span>
          </SiteMenu>
          <button
            type="button"
            className="mr-auto flex items-center gap-2 rounded border border-slate-300 px-2 py-1 text-slate-600 hover:border-slate-400"
            onClick={() => setPaletteOpen(true)}
            aria-label={t('Open the command palette')}
            aria-keyshortcuts="Control+K"
          >
            {t('Search…')}
            <kbd className="rounded bg-slate-100 px-1 text-xs text-slate-700">Ctrl K</kbd>
          </button>
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
          <a
            href="/"
            target="_blank"
            rel="noopener"
            className="flex items-center gap-1 text-sky-700 hover:underline"
          >
            {t('Visit site')}
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3zm5 16H5V5h7V3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7h-2z" />
            </svg>
            <span className="sr-only">{t('(opens in a new tab)')}</span>
          </a>
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
        <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
        <main className="p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
