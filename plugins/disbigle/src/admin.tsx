import {
  addMessages,
  type AdminPageProps,
  Alert,
  Button,
  Card,
  defineAdminPlugin,
  errorMessage,
  TextField,
  useT,
} from '@cleitext/admin-sdk';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { IT } from './admin-it';
import type { DisbigleConfig, SettingsView } from './types';

addMessages('it', IT);

const QUERY = ['disbigle', 'settings'];

function Check({
  checked,
  onChange,
  children,
  hint,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="flex items-start gap-2 text-sm">
      <input
        type="checkbox"
        className="mt-1"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>
        {children}
        {hint && <span className="block text-xs text-slate-500">{hint}</span>}
      </span>
    </label>
  );
}

function when(iso: string, language: string): string {
  return new Date(iso).toLocaleString(language, { dateStyle: 'medium', timeStyle: 'short' });
}

function DisbiglePage(props: AdminPageProps) {
  const { t, language } = useT();
  const queryClient = useQueryClient();
  const saved = useQuery({
    queryKey: QUERY,
    queryFn: () => props.api<SettingsView>('GET', '/settings'),
  });
  const [draft, setDraft] = useState<DisbigleConfig | null>(null);
  const [notice, setNotice] = useState<{ kind: 'error' | 'success'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const returned = useRef(false);

  useEffect(() => {
    if (saved.data && !draft) setDraft(saved.data.config);
  }, [saved.data, draft]);

  const run = async (action: () => Promise<SettingsView | void>, done?: string) => {
    setBusy(true);
    setNotice(null);
    try {
      const next = await action();
      if (next) {
        queryClient.setQueryData(QUERY, next);
        setDraft(next.config);
      } else await queryClient.invalidateQueries({ queryKey: QUERY });
      if (done) setNotice({ kind: 'success', text: done });
    } catch (error) {
      setNotice({ kind: 'error', text: t(errorMessage(error)) });
    } finally {
      setBusy(false);
    }
  };

  // Back from the server's sign-in: `?code=…&state=…` (or `?error=…`) in the address.
  useEffect(() => {
    if (returned.current) return;
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const state = params.get('state');
    const error = params.get('error_description') ?? params.get('error');
    if (!code && !error) return;
    returned.current = true;
    window.history.replaceState(null, '', window.location.pathname);
    if (error || !code || !state) {
      setNotice({
        kind: 'error',
        text: t('The sign-in was cancelled or refused: {reason}', { reason: error ?? '' }),
      });
      return;
    }
    void run(() => props.api<SettingsView>('POST', '/callback', { code, state }), t('Connected.'));
    // Runs once, on the way back.
  }, []);

  if (saved.isError) return <Alert>{errorMessage(saved.error)}</Alert>;
  if (!draft || !saved.data) return <p className="text-sm text-slate-500">…</p>;
  const data = saved.data;
  const connection = data.connection;
  const set = (changes: Partial<DisbigleConfig>) => setDraft({ ...draft, ...changes });

  const save = () =>
    run(() => props.api<SettingsView>('PUT', '/settings', { config: draft }), t('Saved.'));
  const connect = () =>
    run(async () => {
      const { url } = await props.api<{ url: string }>('POST', '/connect', {
        instance: draft.instance,
      });
      window.location.assign(url);
    });
  const disconnect = () =>
    run(() => props.api<SettingsView>('POST', '/disconnect'), t('Disconnected.'));
  const retry = (entryId: string) =>
    run(async () => {
      const answer = await props.api<{ result: string; view: SettingsView }>('POST', '/retry', {
        entryId,
      });
      return answer.view;
    });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Disbigle</h1>
      <p className="text-sm text-slate-600">
        {t(
          'Your new articles announced on the fediverse through your Disbigle account (or another Mastodon-compatible server). The people you mention as @user@server are notified, and the replies appear as comments under the article.',
        )}
      </p>
      {notice && <Alert kind={notice.kind}>{notice.text}</Alert>}

      <Card title={t('Connection')}>
        <div className="space-y-3 text-sm">
          {connection ? (
            <div
              role="status"
              className={`rounded border px-3 py-2 ${
                connection.refused
                  ? 'border-red-200 bg-red-50 text-red-900'
                  : 'border-emerald-200 bg-emerald-50 text-emerald-900'
              }`}
            >
              <p className="font-medium">
                {t('Connected as')}{' '}
                {connection.accountUrl ? (
                  <a
                    href={connection.accountUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="underline"
                  >
                    @{connection.acct}
                  </a>
                ) : (
                  `@${connection.acct}`
                )}
              </p>
              <p>{t('Since {date}', { date: when(connection.connectedAt, language) })}</p>
              {connection.refused && (
                <p className="font-medium">
                  {t('The server no longer accepts the access: connect again.')}
                </p>
              )}
            </div>
          ) : (
            <p className="rounded border border-slate-200 bg-slate-50 px-3 py-2 text-slate-700">
              {t('Not connected.')}
            </p>
          )}
          <TextField
            label={t('Instance')}
            hint={t('The address of your server: Disbigle, or another Mastodon-compatible one.')}
            value={draft.instance}
            onChange={(e) => set({ instance: e.target.value })}
            placeholder="https://app.disbigle.com"
          />
          {connection && draft.instance.replace(/\/+$/, '') !== connection.instance && (
            <p className="text-xs text-amber-800">
              {t('A new instance is used once you connect again.')}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button type="button" disabled={busy} onClick={connect}>
              {connection ? t('Connect again') : t('Connect to Disbigle')}
            </Button>
            {connection && (
              <Button type="button" variant="danger" disabled={busy} onClick={disconnect}>
                {t('Disconnect')}
              </Button>
            )}
          </div>
        </div>
      </Card>

      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <Card title={t('Options')}>
          <div className="space-y-3">
            <Check
              checked={draft.announce}
              onChange={(announce) => set({ announce })}
              hint={t(
                'When an article is first published. Each article can be left out in the editor (Announce on Disbigle).',
              )}
            >
              {t('Announce new articles')}
            </Check>
            <Check
              checked={draft.comments}
              onChange={(comments) => set({ comments })}
              hint={t('Public replies to the post, under the article.')}
            >
              {t('Show the replies from the fediverse')}
            </Check>
            <Check
              checked={draft.remoteAvatars}
              onChange={(remoteAvatars) => set({ remoteAvatars })}
              hint={t(
                'Off: pictures only from your server, which keeps copies of them; initials for the others.',
              )}
            >
              {t('Show remote avatars too')}
            </Check>
          </div>
        </Card>
        <Button type="submit" disabled={busy}>
          {t('Save')}
        </Button>
      </form>

      {data.failed.length > 0 && (
        <Card title={t('Not announced')}>
          <ul className="space-y-2 text-sm">
            {data.failed.map((item) => (
              <li key={item.entryId} className="flex flex-wrap items-center gap-3">
                <span className="font-medium">{item.title}</span>
                <span className="text-red-800">{item.error}</span>
                {item.retrying && (
                  <span className="text-xs text-slate-500">{t('Tried again by itself.')}</span>
                )}
                <Button
                  type="button"
                  variant="secondary"
                  disabled={busy}
                  onClick={() => void retry(item.entryId)}
                >
                  {t('Try again')}
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card title={t('Recent activity')}>
        {data.log.length === 0 ? (
          <p className="text-sm text-slate-500">{t('No article announced yet.')}</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {data.log.map((line, i) => (
              <li key={`${line.at}-${i}`} className={line.ok ? '' : 'text-red-800'}>
                <span className="text-slate-500">{when(line.at, language)}</span> —{' '}
                <span className="font-medium">{line.title}</span>:{' '}
                {line.ok ? t('Announced.') : line.message}
                {line.url && (
                  <>
                    {' '}
                    <a href={line.url} target="_blank" rel="noreferrer" className="underline">
                      {t('Open the post')}
                    </a>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

export default defineAdminPlugin({
  pages: [
    {
      path: '',
      title: { en: 'Disbigle', it: 'Disbigle' },
      parent: '/settings',
      capability: 'manage_settings',
      component: DisbiglePage,
    },
  ],
});
