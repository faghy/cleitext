import { labelText, type DashboardView } from '@cleitext/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { api, errorMessage } from '../api';
import { useMe } from '../auth';
import { ActivityList } from '../components/activity-list';
import { Alert, Card, useT } from '../components/ui';
import { PluginWidget, usePluginAdmin } from '../plugins';
import { SECTIONS } from '../navigation';

/** Section routes are registered by path (see router.tsx). */
const ACTIVITY_PATH: string = '/activity';

export function DashboardPage() {
  const me = useMe();
  const { t, language } = useT();
  const board = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api<DashboardView>('GET', '/dashboard'),
  });
  const queryClient = useQueryClient();
  const dismiss = useMutation({
    mutationFn: () => api<void>('DELETE', '/dashboard/plugin-notices'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
  });
  const plugins = usePluginAdmin();
  const widgets = plugins.flatMap((plugin) =>
    (plugin.definition?.dashboardWidgets ?? [])
      .filter((w) => !w.capability || me.capabilities.includes(w.capability))
      .map((widget) => ({ plugin, widget })),
  );
  const signedIn = me.role
    ? t('You are signed in to {site} as {role}.', { role: me.role.name })
    : me.user.isSuperAdmin
      ? t('You are signed in to {site} as super admin.')
      : t('You are signed in to {site}.');
  const [signedInBefore, signedInAfter] = signedIn.split('{site}');
  const data = board.data;
  const date = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString(language, { dateStyle: 'medium' }) : '';

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">{t('Dashboard')}</h1>
      {board.error && <Alert>{errorMessage(board.error)}</Alert>}
      {data?.warnings.map((warning) => (
        <Alert key={warning}>{warning}</Alert>
      ))}
      {data && data.pluginNotices.length > 0 && (
        <Alert>
          {data.pluginNotices.map((notice) => (
            <span key={`${notice.plugin}-${notice.at}`} className="block">
              {t('The plugin {plugin} was deactivated on {date} after repeated errors: {error}', {
                plugin: notice.plugin,
                date: new Date(notice.at).toLocaleString(language),
                error: notice.error,
              })}
            </span>
          ))}
          <button type="button" className="mt-2 underline" onClick={() => void dismiss.mutate()}>
            {t('Dismiss')}
          </button>
        </Alert>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title={t('Welcome, {name}', { name: me.user.displayName })}>
          <p className="text-sm text-slate-600">
            {signedInBefore}
            <strong>{me.site.name}</strong>
            {signedInAfter}
          </p>
          {data && data.counts.length > 0 && (
            <ul className="mt-3 grid grid-cols-2 gap-2 text-sm" aria-label={t('At a glance')}>
              {data.counts.map((c) => (
                <li key={c.type} className="rounded bg-slate-50 px-3 py-2">
                  <span className="block font-medium">{labelText(c.name, me.user.locale)}</span>
                  <span className="text-slate-600">
                    {t('{published} published · {drafts} drafts', {
                      published: c.published,
                      drafts: c.drafts,
                    })}
                    {c.scheduled > 0 && ` · ${t('{count} scheduled', { count: c.scheduled })}`}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        {data && me.capabilities.includes('edit_entries') && (
          <Card title={t('Your drafts')}>
            {data.drafts.length === 0 ? (
              <p className="text-sm text-slate-600">{t('No drafts. Everything is published.')}</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {data.drafts.map((d) => (
                  <li key={d.id} className="flex justify-between gap-3">
                    <Link
                      to="/entries/$id"
                      params={{ id: d.id }}
                      className="truncate text-sky-700 hover:underline"
                    >
                      {d.title || t('(no title)')}
                    </Link>
                    <span className="shrink-0 text-xs text-slate-500">{date(d.updatedAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}
        {data && (
          <Card title={t('Recently published')}>
            {data.published.length === 0 ? (
              <p className="text-sm text-slate-600">{t('Nothing published yet.')}</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {data.published.map((p) => (
                  <li key={p.id} className="flex justify-between gap-3">
                    <Link
                      to="/entries/$id"
                      params={{ id: p.id }}
                      className="truncate text-sky-700 hover:underline"
                    >
                      {p.title || t('(no title)')}
                    </Link>
                    <span className="shrink-0 text-xs text-slate-500">{date(p.publishedAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}
        {data?.activity && (
          <Card title={t('Activity')}>
            <ActivityList items={data.activity} />
            <Link
              to={ACTIVITY_PATH}
              className="mt-2 inline-block text-sm text-sky-700 hover:underline"
            >
              {t('All activity')}
            </Link>
          </Card>
        )}
        {widgets.map(({ plugin, widget }) => (
          <Card key={`${plugin.slug}/${widget.id}`} title={labelText(widget.title, me.user.locale)}>
            <PluginWidget plugin={plugin} widget={widget} />
          </Card>
        ))}
      </div>
    </div>
  );
}

/** Sections planned for later milestones. */
export function PlaceholderPage({ path }: { path: string }) {
  const { t } = useT();
  const section = SECTIONS.find((s) => s.to === path);
  return (
    <div>
      <h1 className="text-2xl font-semibold">{t(section?.label ?? 'Not found')}</h1>
      <p className="mt-2 text-slate-600">{t('This section is not available yet.')}</p>
    </div>
  );
}

export function ForbiddenPage() {
  const { t } = useT();
  return (
    <div>
      <h1 className="text-2xl font-semibold">{t('Access denied')}</h1>
      <p className="mt-2 text-slate-600">{t('You do not have permission to open this page.')}</p>
    </div>
  );
}
