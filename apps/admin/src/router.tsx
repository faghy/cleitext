import { ADMIN_PATH } from '@cleitext/shared';
import { useT } from '@cleitext/admin-sdk';
import { labelText } from '@cleitext/shared';
import { useQuery, type QueryClient } from '@tanstack/react-query';
import {
  createRootRouteWithContext,
  createRoute,
  createRouter,
  Outlet,
  redirect,
} from '@tanstack/react-router';
import { meQuery } from './auth';
import { canAccess, SECTIONS } from './navigation';
import {
  AcceptInvitePage,
  ForgotPasswordPage,
  LoginPage,
  ResetPasswordPage,
} from './pages/auth-pages';
import { AppearancePage } from './pages/appearance';
import { DashboardPage, ForbiddenPage, PlaceholderPage } from './pages/dashboard';
import { EntriesListPage } from './pages/entries-list';
import { EntryEditorPage } from './pages/entry-editor';
import { MediaPage } from './pages/media';
import { AdminLayout } from './pages/layout';
import { PluginsPage } from './pages/plugins';
import { ProfilePage } from './pages/profile';
import { contentTypesQuery, PluginPage } from './plugins';
import { SettingsPage } from './pages/settings';
import { AssistantsPage } from './pages/assistants';
import { ConnectPage } from './pages/connect';
import { SitesPage } from './pages/sites';
import { ActivityPage } from './pages/activity';
import { SystemPage } from './pages/system';
import { UpdatesPage } from './pages/updates';
import { UsersPage } from './pages/users';
import { UserEditPage } from './pages/user-edit';
import { TermsPage } from './pages/terms';
import { StructurePage } from './pages/structure';
import { CommentsPage } from './pages/comments';
import { RedirectsPage } from './pages/redirects';

interface RouterContext {
  queryClient: QueryClient;
}

const rootRoute = createRootRouteWithContext<RouterContext>()({ component: Outlet });

const tokenSearch = (search: Record<string, unknown>) => ({
  token: typeof search.token === 'string' ? search.token : '',
});

// ---- Public pages --------------------------------------------------------

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  validateSearch: (search: Record<string, unknown>): { redirect?: string } =>
    typeof search.redirect === 'string' ? { redirect: search.redirect } : {},
  beforeLoad: async ({ context }) => {
    if (await context.queryClient.ensureQueryData(meQuery)) throw redirect({ to: '/' });
  },
  component: function Login() {
    return <LoginPage redirect={loginRoute.useSearch().redirect} />;
  },
});

const forgotRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/forgot-password',
  component: ForgotPasswordPage,
});

const resetRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/reset-password',
  validateSearch: tokenSearch,
  component: function Reset() {
    return <ResetPasswordPage token={resetRoute.useSearch().token} />;
  },
});

const inviteRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/accept-invite',
  validateSearch: tokenSearch,
  component: function Invite() {
    return <AcceptInvitePage token={inviteRoute.useSearch().token} />;
  },
});

// ---- Authenticated area ----------------------------------------------------

const appRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'app',
  beforeLoad: async ({ context, location }) => {
    const me = await context.queryClient.ensureQueryData(meQuery);
    if (!me) throw redirect({ to: '/login', search: { redirect: location.href } });
    return { me };
  },
  component: AdminLayout,
});

/** Section route that also guards direct navigation by capability. */
function sectionRoute(path: string, Component: () => React.ReactNode) {
  return createRoute({
    getParentRoute: () => appRoute,
    path,
    component: function Section() {
      const { me } = appRoute.useRouteContext();
      return canAccess(path, me.capabilities) ? <Component /> : <ForbiddenPage />;
    },
  });
}

/** Entries of a content type added by a plugin. */
const contentRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/content/$type',
  component: function Content() {
    const { type } = contentRoute.useParams();
    const { me } = appRoute.useRouteContext();
    const types = useQuery({
      ...contentTypesQuery,
      enabled: me.capabilities.includes('edit_entries'),
    });
    if (!me.capabilities.includes('edit_entries')) return <ForbiddenPage />;
    if (types.isPending) return null;
    const found = types.data?.find((t) => t.slug === type);
    if (!found) return <PlaceholderPage path={`/content/${type}`} />;
    return <EntriesListPage key={type} type={type} title={labelText(found.name, me.user.locale)} />;
  },
});

/** Terms of a taxonomy: Posts → Categories, Tags… */
const taxonomyRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/taxonomies/$slug',
  component: function Taxonomy() {
    const { slug } = taxonomyRoute.useParams();
    const { me } = appRoute.useRouteContext();
    if (!me.capabilities.includes('manage_terms')) return <ForbiddenPage />;
    return <TermsPage key={slug} slug={slug} />;
  },
});

/** Users → Edit (RF-USR-12). */
const userRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/users/$id',
  component: function User() {
    const { id } = userRoute.useParams();
    const { me } = appRoute.useRouteContext();
    if (!me.capabilities.includes('manage_users')) return <ForbiddenPage />;
    return <UserEditPage key={id} id={id} />;
  },
});

/** Admin pages of plugins: /ext/<slug>/<path>. */
const pluginPageRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/ext/$plugin/$',
  component: function Extension() {
    const params = pluginPageRoute.useParams();
    return (
      <PluginPage
        key={`${params.plugin}/${params._splat ?? ''}`}
        slug={params.plugin}
        path={params._splat ?? ''}
      />
    );
  },
});

/** Full-screen editor: authenticated, outside the sidebar layout. */
const editorRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/entries/$id',
  beforeLoad: async ({ context, location }) => {
    const me = await context.queryClient.ensureQueryData(meQuery);
    if (!me) throw redirect({ to: '/login', search: { redirect: location.href } });
    if (!me.capabilities.includes('edit_entries')) throw redirect({ to: '/' });
  },
  component: function Editor() {
    return <EntryEditorPage id={editorRoute.useParams().id} />;
  },
});

const routeTree = rootRoute.addChildren([
  loginRoute,
  forgotRoute,
  resetRoute,
  inviteRoute,
  editorRoute,
  appRoute.addChildren([
    sectionRoute('/', DashboardPage),
    sectionRoute('/posts', function Posts() {
      const { t } = useT();
      return <EntriesListPage type="article" title={t('Posts')} />;
    }),
    sectionRoute('/pages', function Pages() {
      const { t } = useT();
      return <EntriesListPage type="page" title={t('Pages')} />;
    }),
    sectionRoute('/media', MediaPage),
    sectionRoute('/users', UsersPage),
    sectionRoute('/profile', ProfilePage),
    sectionRoute('/appearance', AppearancePage),
    sectionRoute('/settings', SettingsPage),
    sectionRoute('/structure', StructurePage),
    sectionRoute('/redirects', RedirectsPage),
    sectionRoute('/comments', CommentsPage),
    sectionRoute('/plugins', PluginsPage),
    sectionRoute('/sites', SitesPage),
    sectionRoute('/activity', ActivityPage),
    sectionRoute('/system', SystemPage),
    sectionRoute('/updates', UpdatesPage),
    sectionRoute('/assistants', AssistantsPage),
    sectionRoute('/connect', ConnectPage),
    contentRoute,
    taxonomyRoute,
    userRoute,
    pluginPageRoute,
    ...SECTIONS.filter((s) => !s.ready).map((s) =>
      sectionRoute(s.to, () => <PlaceholderPage path={s.to} />),
    ),
  ]),
]);

export function createAdminRouter(queryClient: QueryClient) {
  return createRouter({
    routeTree,
    basepath: ADMIN_PATH,
    context: { queryClient },
    defaultPreload: 'intent',
  });
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createAdminRouter>;
  }
}
