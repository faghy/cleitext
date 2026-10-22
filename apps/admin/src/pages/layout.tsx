import { usePendingComments } from './comments';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, Outlet, useNavigate, useRouterState } from '@tanstack/react-router';
import { api } from '../api';
import { ME_QUERY_KEY, useMe } from '../auth';
import { childSections, visibleSections } from '../navigation';
import { useT } from '../components/ui';
import { Avatar } from '../components/avatar';
import { LogoMark } from '@cleitext/admin-sdk';
import { MAINTENANCE_QUERY_KEY } from './settings';
import { taxonomiesQuery, taxonomyLabel } from './terms';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { CommandPalette, useCommandPaletteShortcut } from '../components/command-palette';
import { usePluginMenu } from '../plugins';
import { currentTop, itemActive, withPluginPages, type MenuNode } from '../admin-menu';
import { MenuIcon } from '../components/menu-icons';
import { UPDATES_QUERY } from './updates';
import { useCatalogUpdates } from '../components/catalog';

const SETTINGS_PATH: string = '/settings';

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
  // A badge in the top bar while visitors get the maintenance page (RF-SIT-06).
  const maintenance = useQuery({
    queryKey: MAINTENANCE_QUERY_KEY,
    queryFn: () => api<{ enabled: boolean }>('GET', '/settings/maintenance'),
    enabled: me.capabilities.includes('manage_settings'),
    staleTime: 5 * 60 * 1000,
  });
  const updates = useQuery({
    ...UPDATES_QUERY,
    enabled: me.capabilities.includes('manage_plugins'),
    staleTime: 10 * 60 * 1000,
  });
  const updateAvailable = Boolean(updates.data?.available);
  const pluginUpdates = useCatalogUpdates('plugin').length;
  const themeUpdates = useCatalogUpdates('theme').length;
  const pendingComments = usePendingComments(me.capabilities.includes('moderate_comments'));
  const badge = (to: string) =>
    to === '/comments'
      ? pendingComments
      : to === '/' || to === '/updates'
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
  // Taxonomies appear under their content type, as Categories and Tags under
  // Posts in WordPress; those of several types under Posts when it is one of them.
  const taxonomiesOf = (type: string) =>
    (taxonomies.data ?? [])
      .filter((taxonomy) => {
        const types = taxonomy.contentTypes;
        return (types.includes('article') || types.length === 0 ? 'article' : types[0]) === type;
      })
      .map((taxonomy) => ({
        to: `/taxonomies/${taxonomy.slug}`,
        label: taxonomyLabel(taxonomy, me.user.locale),
        sub: true,
      }));
  const can = (capability: string) => me.capabilities.includes(capability);
  // As in WordPress: each section with its submenu (Posts → All posts, Categories, Tags…).
  const submenu = (to: string): MenuNode[] => {
    const leaf = (item: { to: string; label: string; tab?: string; hash?: string }): MenuNode => ({
      ...item,
      children: [],
    });
    const listed = (taxonomies: { to: string; label: string }[], all: string) =>
      taxonomies.length > 0 ? [leaf({ to, label: all }), ...taxonomies.map(leaf)] : [];
    switch (to) {
      case '/posts':
        return listed(taxonomiesOf('article'), t('All posts'));
      case '/pages':
        return listed(taxonomiesOf('page'), t('All pages'));
      case '/appearance':
        return [
          ...(can('manage_themes') ? [leaf({ to, label: t('Themes') })] : []),
          ...(can('edit_theme_settings')
            ? [
                leaf({ to, label: t('Customize'), tab: 'customize' }),
                leaf({ to, label: t('Areas'), tab: 'areas' }),
              ]
            : []),
          ...(can('manage_menus') ? [leaf({ to, label: t('Menus'), tab: 'menus' })] : []),
          ...(can('edit_entries') ? [leaf({ to, label: t('Patterns'), tab: 'patterns' })] : []),
        ];
      case '/plugins':
        return can('manage_plugins')
          ? [
              leaf({ to, label: t('Installed plugins') }),
              leaf({ to, label: t('Add New'), tab: 'add' }),
            ]
          : [];
      case '/users':
        return [
          leaf({ to, label: t('All users') }),
          ...(can('promote_users') ? [leaf({ to, label: t('Add New User'), tab: 'add' })] : []),
          ...(can('manage_users') ? [leaf({ to, label: t('Roles'), tab: 'roles' })] : []),
          leaf({ to: '/profile', label: t('Profile') }),
        ];
      case '/tools':
        return [
          leaf({ to, label: t('Available tools') }),
          ...childSections(to, me.capabilities).map((section) =>
            leaf({ to: section.to, label: t(section.label) }),
          ),
        ];
      case '/settings':
        return [
          leaf({ to, label: t('General'), hash: 'general' }),
          leaf({ to, label: t('Reading'), hash: 'reading' }),
          leaf({ to, label: t('Discussion'), hash: 'discussion' }),
          leaf({ to, label: t('Membership'), hash: 'membership' }),
          leaf({ to, label: t('Email'), hash: 'email' }),
          leaf({ to, label: t('AI assistants (MCP)'), hash: 'assistants' }),
        ];
      default:
        return [];
    }
  };
  const top: MenuNode[] = sections.flatMap((section) => [
    {
      to: section.to,
      label: t(section.label),
      icon: section.icon,
      exact: section.to === '/',
      children: submenu(section.to),
    },
    // Content types of plugins and of Content structure come after Pages, with their taxonomies.
    ...(section.to === '/pages'
      ? pluginMenu.types.map((item) => {
          const taxonomies = taxonomiesOf(item.to.slice('/content/'.length));
          return {
            to: item.to,
            label: item.label,
            ...(item.icon ? { icon: item.icon } : {}),
            children:
              taxonomies.length > 0
                ? [
                    { to: item.to, label: item.label, children: [] },
                    ...taxonomies.map((tax) => ({ ...tax, children: [] })),
                  ]
                : [],
          };
        })
      : []),
  ]);
  const menu = withPluginPages(top, pluginMenu.pages);
  const items = menu.flatMap((node) => [node, ...node.children]);

  // The browser tab names the screen and the site, as in WordPress: "Pages ‹ My site".
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const tabParam = useRouterState({
    select: (state) => (state.location.search as Record<string, unknown>).tab,
  });
  const tab = typeof tabParam === 'string' ? tabParam : undefined;
  const hash = useRouterState({ select: (state) => state.location.hash });
  const open = currentTop(menu, pathname);
  // A submenu item for a box of the screen (Settings → Reading): scrolled into view once it is there.
  useEffect(() => {
    if (!hash) return;
    let tries = 0;
    const timer = setInterval(() => {
      const target = document.getElementById(hash);
      if (target || ++tries > 20) {
        clearInterval(timer);
        target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 100);
    return () => clearInterval(timer);
  }, [pathname, hash]);
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
      {/* Darker than the content in both themes, with an edge: in the dark theme the
          content's background is the old menu color, and the two blended. */}
      <aside className="light-palette w-56 shrink-0 border-r border-black/40 bg-slate-950 text-slate-200 shadow-[inset_-1px_0_0_rgb(255_255_255/0.06)]">
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
            {menu.map((section) => {
              const isOpen = section === open;
              const children = section.children;
              return (
                <li key={section.to} className="group/menu relative">
                  <Link
                    to={section.to}
                    activeOptions={{ exact: true, includeSearch: false }}
                    className={`block px-4 py-2 text-sm ${isOpen ? 'bg-sky-700 text-white' : 'hover:bg-slate-800/70 hover:text-sky-200'}`}
                    aria-current={isOpen && !children.length ? 'page' : undefined}
                    {...(children.length && !isOpen ? { 'aria-haspopup': 'true' as const } : {})}
                  >
                    <span className="flex items-center gap-2.5">
                      {section.icon && <MenuIcon path={section.icon} />}
                      <span className="min-w-0 flex-1">{section.label}</span>
                      {badge(section.to) > 0 && (
                        // As in WordPress: counts on Dashboard, Updates, Plugins and Appearance.
                        <span
                          className="rounded-full bg-amber-500 px-1.5 text-xs leading-5 font-semibold text-slate-900"
                          aria-label={
                            section.to === '/comments'
                              ? t('{count} comments waiting', { count: badge(section.to) })
                              : t('{count} updates available', { count: badge(section.to) })
                          }
                          title={
                            section.to === '/comments'
                              ? t('{count} comments waiting', { count: badge(section.to) })
                              : t('{count} updates available', { count: badge(section.to) })
                          }
                        >
                          {badge(section.to)}
                        </span>
                      )}
                    </span>
                  </Link>
                  {children.length > 0 &&
                    (isOpen ? (
                      // The current section: its submenu open below it.
                      <ul className="bg-slate-900 py-1.5">
                        {children.map((child) => {
                          const active =
                            itemActive(child, pathname, tab, children) ||
                            (child.hash !== undefined && child.hash === hash);
                          return (
                            <li key={`${child.to}|${child.tab ?? ''}|${child.hash ?? ''}`}>
                              <Link
                                to={child.to}
                                {...(child.tab
                                  ? { search: { tab: child.tab } as never }
                                  : { search: {} as never })}
                                {...(child.hash ? { hash: child.hash } : {})}
                                className={`block py-1.5 pr-4 pl-11 text-[13px] ${active ? 'font-semibold text-white' : 'text-slate-300 hover:text-sky-200'}`}
                                aria-current={active ? 'page' : undefined}
                              >
                                {child.label}
                              </Link>
                            </li>
                          );
                        })}
                      </ul>
                    ) : (
                      // The others: beside the sidebar, on hover or keyboard focus, as in WordPress.
                      <div className="absolute top-0 left-full z-50 hidden pl-0.5 group-focus-within/menu:block group-hover/menu:block">
                        <ul className="min-w-44 rounded-r border-l-4 border-sky-700 bg-slate-800 py-1.5 shadow-xl">
                          {children.map((child) => (
                            <li key={`${child.to}|${child.tab ?? ''}|${child.hash ?? ''}`}>
                              <Link
                                to={child.to}
                                {...(child.tab
                                  ? { search: { tab: child.tab } as never }
                                  : { search: {} as never })}
                                {...(child.hash ? { hash: child.hash } : {})}
                                className="block px-3 py-1.5 text-[13px] whitespace-nowrap text-slate-200 hover:text-sky-200 focus-visible:text-sky-200"
                              >
                                {child.label}
                              </Link>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                </li>
              );
            })}
          </ul>
        </nav>
        <p className="px-4 py-3 text-xs text-slate-400" title={t('Cleitext version')}>
          Cleitext {me.version}
        </p>
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
          {maintenance.data?.enabled && (
            <Link
              to={SETTINGS_PATH}
              hash="maintenance"
              className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900 ring-1 ring-amber-300 hover:bg-amber-200"
              title={t('The site is in maintenance mode: visitors see the maintenance page.')}
            >
              {t('Maintenance')}
            </Link>
          )}
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
