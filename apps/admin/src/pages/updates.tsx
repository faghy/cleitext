import type { AutoUpdatesView, CorePolicy } from '@cleitext/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, errorMessage } from '../api';
import { Alert, Button, Card, useT } from '../components/ui';
import { CatalogUpdateButton, useCatalog, useCatalogUpdates } from '../components/catalog';

interface UpdateCheck {
  current: string;
  latest: string | null;
  available: boolean;
  notes: string;
  publishedAt: string | null;
  url: string | null;
  checkedAt: string | null;
  error: string | null;
}

interface UpdateStatus {
  state: 'running' | 'done' | 'failed';
  from: string;
  to: string;
  step: string | null;
  steps: string[];
  startedAt: string;
  finishedAt?: string;
  error?: string;
}

const STEP_LABELS: Record<string, string> = {
  download: 'Download',
  verify: 'Check the SHA-256',
  unpack: 'Unpack',
  configure: 'Carry over the configuration',
  backup: 'Back up database, media and plugins',
  migrate: 'Update the database',
  plugins: 'Update the official plugins',
  switch: 'Switch to the new version',
};

export const UPDATES_QUERY = {
  queryKey: ['updates'],
  queryFn: () => api<UpdateCheck>('GET', '/updates'),
};

/** Dashboard → Updates (RF-SYS-UPD): the core, as WordPress does it. */
export function UpdatesPage() {
  const { t, language } = useT();
  const queryClient = useQueryClient();
  const check = useQuery(UPDATES_QUERY);
  const status = useQuery({
    queryKey: ['updates', 'status'],
    queryFn: () => api<UpdateStatus | null>('GET', '/updates/status'),
    // While an update runs, its progress every two seconds.
    refetchInterval: (query) => (query.state.data?.state === 'running' ? 2000 : false),
  });
  const recheck = useMutation({
    mutationFn: () => api<UpdateCheck>('GET', '/updates?force=1'),
    onSuccess: (data) => queryClient.setQueryData(['updates'], data),
  });
  const start = useMutation({
    mutationFn: () => api<UpdateStatus>('POST', '/updates/core'),
    onSuccess: (data) => queryClient.setQueryData(['updates', 'status'], data),
  });

  const info = check.data;
  const run = status.data;
  const running = run?.state === 'running';
  // A finished update shows until the new version answers; a failure for a day.
  const shown =
    run &&
    (running ||
      (run.state === 'done' && info?.current !== run.to) ||
      (run.state === 'failed' &&
        Date.now() - Date.parse(run.finishedAt ?? run.startedAt) < 24 * 3600 * 1000));
  const date = (iso: string | null | undefined) =>
    iso ? new Date(iso).toLocaleString(language, { dateStyle: 'medium', timeStyle: 'short' }) : '';
  const stepIndex = run?.step ? run.steps.indexOf(run.step) : -1;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">{t('Updates')}</h1>
      {(check.error ?? start.error ?? recheck.error) && (
        <Alert>{errorMessage(check.error ?? start.error ?? recheck.error)}</Alert>
      )}
      {info?.error && <Alert>{info.error}</Alert>}

      <Card title="Cleitext">
        {info && (
          <div className="space-y-3 text-sm">
            <p>
              {t('Installed version: {version}.', { version: info.current })}{' '}
              {info.latest &&
                (info.available
                  ? t('Cleitext {version} is available.', { version: info.latest })
                  : t('You have the latest version.'))}
            </p>
            {info.checkedAt && (
              <p className="text-slate-600">
                {t('Last checked: {date}.', { date: date(info.checkedAt) })}{' '}
                <button
                  type="button"
                  className="text-sky-700 hover:underline"
                  disabled={recheck.isPending}
                  onClick={() => recheck.mutate()}
                >
                  {t('Check again')}
                </button>
              </p>
            )}
            {info.available && !running && (
              <>
                {info.notes && (
                  <div className="rounded border border-slate-200 bg-slate-50 p-3">
                    <p className="mb-1 font-medium">
                      {t('What is new in {version}', { version: info.latest ?? '' })}
                      {info.publishedAt && (
                        <span className="font-normal text-slate-500">
                          {' '}
                          · {date(info.publishedAt)}
                        </span>
                      )}
                    </p>
                    <p className="whitespace-pre-wrap text-slate-700">{info.notes}</p>
                  </div>
                )}
                <p className="text-slate-600">
                  {t(
                    'Before updating, a backup of the database, media and plugins is made. The site keeps working during the update, and restarts on the new version at the end; the previous version is kept on the server.',
                  )}
                </p>
                <Button disabled={start.isPending} onClick={() => start.mutate()}>
                  {t('Update to {version}', { version: info.latest ?? '' })}
                </Button>
              </>
            )}
          </div>
        )}
      </Card>

      {run && shown && (
        <Card title={t('Update to {version}', { version: run.to })}>
          <ol className="space-y-1 text-sm">
            {run.steps.map((step, i) => {
              const done = run.state === 'done' || i < stepIndex;
              const current = running && i === stepIndex;
              const failed = run.state === 'failed' && i === stepIndex;
              return (
                <li key={step} className="flex items-center gap-2">
                  <span
                    aria-hidden="true"
                    className={`w-4 text-center ${failed ? 'text-red-600' : done ? 'text-green-600' : 'text-slate-400'}`}
                  >
                    {failed ? '✗' : done ? '✓' : current ? '…' : '·'}
                  </span>
                  <span className={current ? 'font-medium' : ''}>
                    {t(STEP_LABELS[step] ?? step)}
                  </span>
                </li>
              );
            })}
          </ol>
          {run.state === 'failed' && (
            <Alert>
              {t('The update stopped: {error} The site still runs on {version}.', {
                error: run.error ?? '',
                version: run.from,
              })}
            </Alert>
          )}
          {run.state === 'done' && (
            <div className="mt-3 space-y-2 text-sm">
              <p>{t('Cleitext is updated to {version}.', { version: run.to })}</p>
              <Button onClick={() => window.location.reload()}>{t('Reload the admin')}</Button>
            </div>
          )}
        </Card>
      )}
      <ExtensionUpdates />
      <AutomaticUpdates />
    </div>
  );
}

const AUTO_QUERY = {
  queryKey: ['updates', 'auto'],
  queryFn: () => api<AutoUpdatesView>('GET', '/updates/auto'),
};

/**
 * Automatic updates, as in WordPress: the core (off, fix releases, all) and
 * the plugins and themes chosen one by one, about twice a day.
 */
function AutomaticUpdates() {
  const { t, language } = useT();
  const queryClient = useQueryClient();
  const auto = useQuery(AUTO_QUERY);
  const catalog = useCatalog();
  const change = useMutation({
    mutationFn: (body: {
      core?: CorePolicy;
      item?: { type: 'plugin' | 'theme'; slug: string; enabled: boolean };
    }) => api<AutoUpdatesView>('PUT', '/updates/auto', body),
    // The choice shows at once; the server's answer replaces it (or the old one comes back).
    onMutate: (body) => {
      const previous = queryClient.getQueryData<AutoUpdatesView>(['updates', 'auto']);
      if (previous) {
        const items = body.item
          ? [
              ...previous.items.filter(
                (i) => !(i.type === body.item!.type && i.slug === body.item!.slug),
              ),
              ...(body.item.enabled ? [{ type: body.item.type, slug: body.item.slug }] : []),
            ]
          : previous.items;
        queryClient.setQueryData(['updates', 'auto'], {
          ...previous,
          ...(body.core ? { core: body.core } : {}),
          items,
        });
      }
      return { previous };
    },
    onError: (_error, _body, context) => {
      if (context?.previous) queryClient.setQueryData(['updates', 'auto'], context.previous);
    },
    onSuccess: (data) => queryClient.setQueryData(['updates', 'auto'], data),
  });
  const runNow = useMutation({
    mutationFn: () => api('POST', '/updates/auto/run'),
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ['updates'] }),
        queryClient.invalidateQueries({ queryKey: ['catalog'] }),
      ]),
  });
  const view = auto.data;
  const installed = (catalog.data?.items ?? []).filter((item) => item.installed);
  const on = (type: string, slug: string) =>
    Boolean(view?.items.some((i) => i.type === type && i.slug === slug));
  const date = (iso: string | null) =>
    iso ? new Date(iso).toLocaleString(language, { dateStyle: 'medium', timeStyle: 'short' }) : '';
  const policies: { value: CorePolicy; label: string; help: string }[] = [
    { value: 'off', label: t('Off'), help: t('You update Cleitext from this page.') },
    {
      value: 'patch',
      label: t('Fix releases only (recommended)'),
      help: t('Security and bug fixes, such as 0.26.0 → 0.26.1.'),
    },
    { value: 'all', label: t('Every release'), help: t('New features too, such as 0.26 → 0.27.') },
  ];
  return (
    <Card title={t('Automatic updates')}>
      {(auto.error ?? change.error ?? runNow.error) && (
        <Alert>{errorMessage(auto.error ?? change.error ?? runNow.error)}</Alert>
      )}
      {view && (
        <div className="space-y-5 text-sm">
          <p className="text-slate-600">
            {t(
              'Cleitext looks for updates about twice a day and installs those you choose here, for every site of this server. Super admins get an email with what changed.',
            )}
          </p>
          <fieldset className="space-y-2">
            <legend className="mb-1 font-medium">Cleitext</legend>
            {policies.map((policy) => (
              <label key={policy.value} className="flex items-start gap-2">
                <input
                  type="radio"
                  name="core-policy"
                  className="mt-1"
                  checked={view.core === policy.value}
                  disabled={change.isPending}
                  onChange={() => change.mutate({ core: policy.value })}
                />
                <span>
                  {policy.label}
                  <span className="block text-xs text-slate-500">{policy.help}</span>
                </span>
              </label>
            ))}
          </fieldset>
          <fieldset className="space-y-2">
            <legend className="mb-1 font-medium">{t('Plugins and themes')}</legend>
            {installed.length === 0 ? (
              <p className="text-slate-600">
                {t('No plugins or themes from the catalog are installed.')}
              </p>
            ) : (
              <ul className="space-y-1">
                {installed.map((item) => (
                  <li key={`${item.type}-${item.slug}`}>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={on(item.type, item.slug)}
                        disabled={change.isPending}
                        onChange={(e) =>
                          change.mutate({
                            item: { type: item.type, slug: item.slug, enabled: e.target.checked },
                          })
                        }
                      />
                      <span>
                        {item.name}{' '}
                        <span className="text-xs text-slate-500">
                          {item.type === 'theme' ? t('theme') : t('plugin')} · {item.installed}
                        </span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </fieldset>
          <div className="space-y-1 text-slate-600">
            {view.lastRun && <p>{t('Last check: {date}.', { date: date(view.lastRun) })}</p>}
            {view.nextRun && (view.core !== 'off' || view.items.length > 0) && (
              <p>{t('Next check: {date}.', { date: date(view.nextRun) })}</p>
            )}
            {(view.core !== 'off' || view.items.length > 0) && (
              <button
                type="button"
                className="text-sky-700 hover:underline"
                disabled={runNow.isPending}
                onClick={() => runNow.mutate()}
              >
                {runNow.isPending ? t('Checking…') : t('Check and update now')}
              </button>
            )}
          </div>
          {view.log.length > 0 && (
            <div>
              <p className="mb-1 font-medium">{t('Latest automatic updates')}</p>
              <ul className="space-y-1">
                {view.log.slice(0, 10).map((entry, i) => (
                  <li
                    key={`${entry.at}-${entry.slug}-${i}`}
                    className={entry.ok ? '' : 'text-red-700'}
                  >
                    {date(entry.at)} · {entry.name} {entry.from} → {entry.to}
                    {entry.ok ? '' : ` · ${t('failed')}: ${entry.error ?? ''}`}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

/** Plugins and themes with a newer version in the catalog. */
function ExtensionUpdates() {
  const { t } = useT();
  const updates = useCatalogUpdates();
  const catalog = useCatalog();
  // Newer versions this site cannot take yet, and why: so that nothing is silently missing.
  const blocked = (catalog.data?.items ?? []).filter(
    (item) => item.installed && item.update && (!item.compatible || item.renew),
  );
  return (
    <Card title={t('Plugins and themes')}>
      {blocked.length > 0 && (
        <ul className="mb-3 space-y-1 text-sm text-amber-800">
          {blocked.map((item) => (
            <li key={`blocked-${item.type}-${item.slug}`}>
              {item.renew
                ? t('{name} {version}: renew the license to get it.', {
                    name: item.name,
                    version: item.version,
                  })
                : t('{name} {version} needs Cleitext {requires}: update Cleitext first.', {
                    name: item.name,
                    version: item.version,
                    requires: item.requires ?? item.apiVersion ?? '',
                  })}
            </li>
          ))}
        </ul>
      )}
      {updates.length === 0 ? (
        <p className="text-sm text-slate-600">{t('Plugins and themes are up to date.')}</p>
      ) : (
        <ul className="space-y-3 text-sm">
          {updates.map((item) => (
            <li key={`${item.type}-${item.slug}`} className="flex flex-wrap items-center gap-3">
              <span className="font-medium">{item.name}</span>
              <span className="text-slate-600">
                {item.installed} → {item.version}
              </span>
              <CatalogUpdateButton type={item.type} slug={item.slug} />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
