import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, errorMessage } from '../api';
import { useMe } from '../auth';
import { Alert, Button, Card, useT } from '../components/ui';

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
  const me = useMe();
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
                {me.user.twoFactorEnabled ? (
                  <Button disabled={start.isPending} onClick={() => start.mutate()}>
                    {t('Update to {version}', { version: info.latest ?? '' })}
                  </Button>
                ) : (
                  <p className="text-slate-700">
                    {t('Turn on two-factor authentication in your profile to install code.')}
                  </p>
                )}
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
    </div>
  );
}
