import type { QueryClient } from '@tanstack/react-query';
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
import { DashboardPage, ForbiddenPage, PlaceholderPage } from './pages/dashboard';
import { EntriesListPage } from './pages/entries-list';
import { EntryEditorPage } from './pages/entry-editor';
import { MediaPage } from './pages/media';
import { AdminLayout } from './pages/layout';
import { ProfilePage } from './pages/profile';
import { UsersPage } from './pages/users';

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
    sectionRoute('/posts', () => <EntriesListPage type="article" title="Posts" />),
    sectionRoute('/pages', () => <EntriesListPage type="page" title="Pages" />),
    sectionRoute('/media', MediaPage),
    sectionRoute('/users', UsersPage),
    sectionRoute('/profile', ProfilePage),
    ...SECTIONS.filter((s) => !s.ready).map((s) =>
      sectionRoute(s.to, () => <PlaceholderPage path={s.to} />),
    ),
  ]),
]);

export function createAdminRouter(queryClient: QueryClient) {
  return createRouter({
    routeTree,
    basepath: '/admin',
    context: { queryClient },
    defaultPreload: 'intent',
  });
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createAdminRouter>;
  }
}
